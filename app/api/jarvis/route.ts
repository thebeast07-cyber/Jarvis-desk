import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt, device_status } = await req.json();

    const systemInstruction = `
Kamu adalah J.A.R.V.I.S., asisten pribadi yang cerdas, ringkas, santai tapi cekatan. Panggil user dengan "Tuan".
Balas HANYA dalam format JSON valid tanpa markdown backtick:
{
  "reply": "Kalimat jawaban singkat untuk diucapkan lewat speaker (maksimal 2-3 kalimat natural)",
  "action": "none | check_battery | flashlight_on | flashlight_off | laptop_cmd",
  "payload": "parameter tambahan jika action = laptop_cmd, selain itu kosongkan"
}
Status HP saat ini: ${JSON.stringify(device_status || {})}
`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"reply":"Maaf Bos, otak cloud sedang gangguan.","action":"none","payload":""}';
    return NextResponse.json(JSON.parse(rawText));
  } catch (err) {
    return NextResponse.json({ reply: 'Terjadi kesalahan koneksi di server Vercel, Bos.', action: 'none', payload: '' }, { status: 500 });
  }
}