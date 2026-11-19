import { NextResponse } from 'next/server';

const PREFERRED_GROQ_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.1-8b-instant',
  'qwen-qwq-32b'
];
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.8-flash-lite'];

export async function POST(req: Request) {
  try {
    const { prompt, device_status } = await req.json();
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    const getSystemPrompt = (activeModel: string) => `
Kamu adalah J.A.R.V.I.S., asisten pribadi yang cerdas, ringkas, santai tapi cekatan. Panggil user dengan "Bos".
Saat ini otak kamu ditenagai oleh model AI: ${activeModel}. Jika Bos bertanya kamu pakai model apa, sebutkan nama model tersebut dengan jujur.
Balas HANYA dalam format JSON valid tanpa markdown backtick:
{
  "reply": "Kalimat jawaban singkat untuk diucapkan lewat speaker (maksimal 2-3 kalimat natural)",
  "action": "none | check_battery | flashlight_on | flashlight_off | laptop_cmd",
  "payload": "parameter tambahan jika action = laptop_cmd, selain itu kosongkan"
}
Status HP saat ini: ${JSON.stringify(device_status || {})}
`;

    let lastError = 'Jalur otak sibuk.';

    // 1. Jalur Utama Super Cepat (0.3 detik): Groq
    if (groqKey) {
      let candidateModels = [...PREFERRED_GROQ_MODELS];
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
              { role: 'system', content: getSystemPrompt(`Groq (${gModel})`) },
              { role: 'user', content: prompt }
            ]
          })
        });

        const groqData = await groqRes.json();
        const groqText = groqData.choices?.[0]?.message?.content;
        if (groqRes.ok && groqText) {
          return NextResponse.json(JSON.parse(groqText));
        }
        lastError = `Groq ${gModel} (${groqRes.status})`;
      }
    }

    // 2. Jalur Cadangan: Gemini
    if (geminiKey) {
      for (const model of GEMINI_MODELS) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: `${getSystemPrompt(`Google (${model})`)}\n\nPerintah Bos: ${prompt}` }] }],
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
          lastError = `Gemini ${model} timeout`;
        }
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