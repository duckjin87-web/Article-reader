// Vercel 서버리스 프록시 — CORS 우회 없이 서버에서 직접 URL 가져옴
export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'url 파라미터 필요' });
  }

  let decoded;
  try {
    decoded = decodeURIComponent(url);
    new URL(decoded); // URL 유효성 검사
  } catch {
    return res.status(400).json({ error: '유효하지 않은 URL' });
  }

  try {
    const response = await fetch(decoded, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `upstream ${response.status}` });
    }

    const html = await response.text();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
