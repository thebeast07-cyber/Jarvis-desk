import { NextResponse } from 'next/server';

const MODELS = ['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-2.5-flash'];

export async function POST(req: Request) {
  try {
    const { prompt, device_status } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { reply: 'GEMINI_API_KEY belum terbaca di Vercel, Bos.', action: 'none', payload: '' },
        { status: 500 }
      );
    }

    const systemInstruction = `
Kamu adalah J.A.R.V.I.S., asisten pribadi yang cerdas, ringkas, santai tapi cekatan. Panggil user dengan "Bos".
Balas HANYA dalam format JSON valid tanpa markdown backtick:
{
  "reply": "Kalimat jawaban singkat untuk diucapkan lewat speaker (maksimal 2-3 kalimat natural)",
  "action": "none | check_battery | flashlight_on | flashlight_off | laptop_cmd",
  "payload": "parameter tambahan jika action = laptop_cmd, selain itu kosongkan"
}
Status HP saat ini: ${JSON.stringify(device_status || {})}
`;

    let lastError = 'Semua model sedang sibuk.';

    for (const model of MODELS) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: `${systemInstruction}\n\nPerintah Bos: ${prompt}` }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                thinkingConfig: { thinkingBudget: 0 }
              }
            })
          }
        );

        clearTimeout(timeoutId);
        const data = await res.json();

        // Kalau model ini lagi penuh (503) atau kena limit (429), lanjut ke model cadangan berikutnya
        if (res.status === 503 || res.status === 429) {
          lastError = `Model ${model} sibuk (${res.status})`;
          continue;
        }

        if (!res.ok) {
          lastError = `Error ${model} (${res.status}): ${data.error?.message || 'Gagal'}`;
          continue;
        }

        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          return NextResponse.json(JSON.parse(rawText));
        }
      } catch (e: any) {
        clearTimeout(timeoutId);
        lastError = e?.name === 'AbortError' ? `${model} timeout` : e?.message;
        continue;
      }
    }

    return NextResponse.json(
      { reply: `Maaf Bos, semua jalur otak lagi padat (${lastError}).`, action: 'none', payload: '' },
      { status: 503 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { reply: `Error server: ${err?.message || 'Unknown error'}`, action: 'none', payload: '' },
      { status: 500 }
    );
  }
}