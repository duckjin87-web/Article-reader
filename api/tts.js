// Vercel 서버리스 — TTS 프록시
// 우선순위: Fish Audio (env) → Azure TTS (env) → OpenAI TTS (env) → Google TTS (폴백)
export default async function handler(req, res) {
  const origin  = req.headers['origin']  || '';
  const referer = req.headers['referer'] || '';
  const allowed = origin.includes('vercel.app') || origin.includes('localhost') ||
                  referer.includes('vercel.app') || referer.includes('localhost');
  if (origin && !allowed) return res.status(403).json({ error: 'Forbidden' });

  const { text, lang = 'ko', voice } = req.query;
  if (!text) return res.status(400).send('');

  let decoded;
  try { decoded = decodeURIComponent(text); }
  catch { return res.status(400).send(''); }

  const FISH_KEY     = process.env.FISH_API_KEY;
  const FISH_VOICE   = process.env.FISH_VOICE_ID;          // fish.audio 마켓에서 고른 목소리 ID
  const FISH_MODEL   = process.env.FISH_TTS_MODEL || 's2.1-pro';
  const AZURE_KEY    = process.env.AZURE_TTS_KEY;
  const AZURE_REGION = process.env.AZURE_TTS_REGION;
  const OPENAI_KEY   = process.env.OPENAI_API_KEY;

  const isPremium = !!(FISH_KEY || AZURE_KEY || OPENAI_KEY);
  const maxLen = isPremium ? 400 : 300;
  if (decoded.length > maxLen) {
    return res.status(400).json({ error: `text too long (max ${maxLen})` });
  }

  function sendAudio(buf, backend) {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('X-TTS-Backend', backend);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(Buffer.from(buf));
  }

  // ── Fish Audio TTS ─────────────────────────────────────────────────────────
  // POST /v1/tts, Bearer 인증, model 헤더로 모델 선택, 응답은 mp3 바이너리
  if (FISH_KEY) {
    // voice 쿼리로 넘어온 reference_id 우선, 없으면 환경변수 기본 목소리
    const refId = voice || FISH_VOICE;
    const body = { text: decoded, format: 'mp3', mp3_bitrate: 64, normalize: true };
    if (refId) body.reference_id = refId;
    try {
      const r = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${FISH_KEY}`,
          'Content-Type': 'application/json',
          'model': FISH_MODEL,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) {
        const buf = await r.arrayBuffer();
        if (buf.byteLength > 1000) return sendAudio(buf, 'fish');
      }
    } catch (_) { /* fall through */ }
  }

  // ── Azure Cognitive Services TTS ──────────────────────────────────────────
  if (AZURE_KEY && AZURE_REGION) {
    const defaultVoice = lang === 'ko'
      ? (process.env.AZURE_TTS_VOICE || 'ko-KR-SunHiNeural')
      : 'en-US-AriaNeural';
    const azVoice = voice || defaultVoice;
    const xmlLang = lang === 'ko' ? 'ko-KR' : 'en-US';
    const safe = decoded
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${xmlLang}"><voice name="${azVoice}">${safe}</voice></speak>`;
    try {
      const r = await fetch(
        `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': AZURE_KEY,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          },
          body: ssml,
          signal: AbortSignal.timeout(10000),
        }
      );
      if (r.ok) return sendAudio(await r.arrayBuffer(), 'azure');
    } catch (_) { /* fall through */ }
  }

  // ── OpenAI TTS ─────────────────────────────────────────────────────────────
  if (OPENAI_KEY) {
    const oaiVoice = voice || (lang === 'ko' ? 'nova' : 'alloy');
    try {
      const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'tts-1', input: decoded, voice: oaiVoice, response_format: 'mp3' }),
        signal: AbortSignal.timeout(12000),
      });
      if (r.ok) return sendAudio(await r.arrayBuffer(), 'openai');
    } catch (_) { /* fall through */ }
  }

  // ── Google Translate TTS (무료 폴백) ────────────────────────────────────────
  const ttsUrl =
    `https://translate.google.com/translate_tts?ie=UTF-8` +
    `&q=${encodeURIComponent(decoded)}&tl=${lang}&client=tw-ob&ttsspeed=1`;
  try {
    const r = await fetch(ttsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
        'Accept': 'audio/mpeg,audio/*',
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return res.status(r.status).send('');
    return sendAudio(await r.arrayBuffer(), 'google');
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
