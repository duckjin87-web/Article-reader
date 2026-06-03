// Vercel 서버리스 — Google Translate TTS 프록시
// 브라우저 CORS 제한 없이 서버에서 음성 파일 생성
export default async function handler(req, res) {
  // 출처 체크: 우리 앱 또는 localhost에서 온 요청만 허용
  const origin  = req.headers['origin']  || '';
  const referer = req.headers['referer'] || '';
  const allowed = origin.includes('vercel.app') || origin.includes('localhost') ||
                  referer.includes('vercel.app') || referer.includes('localhost');
  if (origin && !allowed) return res.status(403).json({ error: 'Forbidden' });

  const { text, lang = 'ko' } = req.query;
  if (!text) return res.status(400).send('');

  let decoded;
  try { decoded = decodeURIComponent(text); }
  catch { return res.status(400).send(''); }

  if (decoded.length > 200) {
    return res.status(400).json({ error: 'text too long (max 200 chars)' });
  }

  const ttsUrl =
    `https://translate.google.com/translate_tts?ie=UTF-8` +
    `&q=${encodeURIComponent(decoded)}` +
    `&tl=${lang}` +
    `&client=tw-ob` +
    `&ttsspeed=1`;

  try {
    const r = await fetch(ttsUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
        'Accept': 'audio/mpeg,audio/*',
      },
    });

    if (!r.ok) return res.status(r.status).send('');

    const buf = await r.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(Buffer.from(buf));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
