import { NextResponse } from 'next/server';

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

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemInstruction}\n\nPerintah Bos: ${prompt}` }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        {
          reply: `Error Gemini (${res.status}): ${data.error?.message || 'Gagal memproses'}`,
          action: 'none',
          payload: ''
        },
        { status: res.status }
      );
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return NextResponse.json(
        { reply: 'Maaf Bos, respons Gemini kosong.', action: 'none', payload: '' },
        { status: 500 }
      );
    }

    return NextResponse.json(JSON.parse(rawText));
  } catch (err: any) {
    return NextResponse.json(
      { reply: `Error server: ${err?.message || 'Unknown error'}`, action: 'none', payload: '' },
      { status: 500 }
    );
  }
}