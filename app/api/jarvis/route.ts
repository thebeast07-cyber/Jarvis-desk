import { NextResponse } from 'next/server';

const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.8-flash-lite'];
const PREFERRED_GROQ_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.1-8b-instant',
  'qwen-qwq-32b'
];

export async function POST(req: Request) {
  try {
    const { prompt, device_status } = await req.json();

    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

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

    let lastError = 'Jalur otak sibuk.';

    // 1. Coba jalur utama: Gemini (timeout cepat 4 detik)
    if (geminiKey) {
      for (const model of GEMINI_MODELS) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
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

          if (res.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
            return NextResponse.json(JSON.parse(data.candidates[0].content.parts[0].text));
          }
          lastError = `Gemini ${model} (${res.status})`;
        } catch (e: any) {
          clearTimeout(timeoutId);
          lastError = e?.name === 'AbortError' ? `Gemini ${model} timeout` : e?.message;
        }
      }
    }

    // 2. Jalur cadangan instan: Groq (auto-detect model aktif jika list utama 404)
    if (groqKey) {
      let candidateModels = [...PREFERRED_GROQ_MODELS];

      // Tarik daftar model aktif langsung dari akun Groq lu
      try {
        const listRes = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${groqKey}` }
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          const activeIds: string[] = (listData.data || [])
            .map((m: any) => m.id)
            .filter((id: string) => !id.includes('whisper') && !id.includes('guard') && !id.includes('tts'));
          candidateModels = [...new Set([...PREFERRED_GROQ_MODELS, ...activeIds])];
        }
      } catch {}

      for (const gModel of candidateModels) {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`
          },
          body: JSON.stringify({
            model: gModel,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemInstruction },
              { role: 'user', content: prompt }
            ]
          })
        });

        const groqData = await groqRes.json();
        const groqText = groqData.choices?.[0]?.message?.content;
        if (groqRes.ok && groqText) {
          return NextResponse.json(JSON.parse(groqText));
        }
        lastError = `Groq ${gModel} (${groqRes.status}): ${groqData.error?.message || 'Gagal'}`;
      }
    }

    return NextResponse.json(
      { reply: `Maaf Bos, semua server AI lagi penuh (${lastError}).`, action: 'none', payload: '' },
      { status: 503 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { reply: `Error server: ${err?.message || 'Unknown error'}`, action: 'none', payload: '' },
      { status: 500 }
    );
  }
}