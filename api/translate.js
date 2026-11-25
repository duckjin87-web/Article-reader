// Vercel 서버리스 — 해외 기사 요약을 한국어로 옮긴다 (무료)
// POST { texts: [..], to: 'ko' } → { texts: [..] }
// Google 번역 웹 위젯이 쓰는 공개 주소(비공식)를 사용한다. 실패하면 앱은 원문을 그대로 보여준다.
export default async function handler(req, res) {
  const origin  = req.headers['origin']  || '';
  const referer = req.headers['referer'] || '';
  const allowed = origin.includes('vercel.app') || origin.includes('localhost') ||
                  referer.includes('vercel.app') || referer.includes('localhost');
  if (origin && !allowed) return res.status(403).json({ error: 'Forbidden' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const to = /^[a-z]{2}(-[A-Z]{2})?$/.test(body.to || '') ? body.to : 'ko';
  const texts = Array.isArray(body.texts) ? body.texts.map(t => String(t || '')).slice(0, 12) : [];
  if (!texts.length) return res.status(400).json({ error: 'no texts' });
  if (texts.some(t => t.length > 1500)) return res.status(413).json({ error: 'text too long' });

  try {
    const out = await Promise.all(texts.map(t => t.trim() ? translate(t, to) : ''));
    res.setHeader('Cache-Control', 'public, s-maxage=86400');
    return res.status(200).json({ texts: out });
  } catch (e) {
    return res.status(502).json({ error: 'translate failed' });
  }
}

async function translate(text, to) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t'
    + '&tl=' + encodeURIComponent(to) + '&q=' + encodeURIComponent(text);
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  // 응답 모양: [[["번역문","원문",...], ...], ...] — 문장 조각을 이어 붙인다
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('unexpected');
  return data[0].map(seg => (Array.isArray(seg) && typeof seg[0] === 'string') ? seg[0] : '').join('').trim();
}
