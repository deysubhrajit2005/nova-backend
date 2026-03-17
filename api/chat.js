export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, system, maxTokens, jsonMode, useSearch } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    const tools = useSearch ? [{ googleSearch: {} }] : undefined;

    const contents = (messages || []).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: m.images
        ? [...m.images.map(img => ({ inlineData: { mimeType: img.type, data: img.data } })), { text: m.content || 'Analyse this image.' }]
        : [{ text: m.content || '' }]
    })).filter(m => m.parts.length > 0);

    const body = {
      contents,
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      generationConfig: {
        maxOutputTokens: maxTokens || 1500,
        temperature: 0.7,
        responseMimeType: jsonMode ? 'application/json' : 'text/plain',
      },
      ...(tools ? { tools } : {})
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      return res.status(geminiRes.status).json({ error: err?.error?.message || 'Gemini API error' });
    }

    const data = await geminiRes.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map(p => p.text || '').join('') || '';
    const searched = candidate?.groundingMetadata?.webSearchQueries?.length > 0;

    return res.status(200).json({ text, searched });

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
