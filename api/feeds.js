// Vercel 서버리스 — 출처별 RSS/Atom 을 모아 새 기사 목록을 돌려준다.
// GET /api/feeds?u=<피드주소>&u=<피드주소>...
// 응답은 Vercel CDN 에 30분 캐시 → 여러 번 열어도 출처 사이트에 부담이 없다.
export default async function handler(req, res) {
  const origin  = req.headers['origin']  || '';
  const referer = req.headers['referer'] || '';
  const allowed = origin.includes('vercel.app') || origin.includes('localhost') ||
                  referer.includes('vercel.app') || referer.includes('localhost');
  if (origin && !allowed) return res.status(403).json({ error: 'Forbidden' });

  let urls = req.query.u;
  if (!urls) return res.status(400).json({ error: 'no feeds' });
  if (!Array.isArray(urls)) urls = [urls];
  urls = [...new Set(urls.map(String))].filter(safeUrl).slice(0, 30);

  const feeds = await Promise.all(urls.map(async url => {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ArticleReaderBot/1.0; +personal feed reader)',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return { url, ok: false, error: 'HTTP ' + r.status };
      const xml = decodeBody(await r.arrayBuffer(), r.headers.get('content-type') || '');
      if (!/<(rss|feed|rdf:RDF)\b/i.test(xml)) return { url, ok: false, error: 'not a feed' };
      return { url, ok: true, title: clean(tag(xml.split(/<(item|entry)\b/i)[0], 'title')), items: parseItems(xml).slice(0, 20) };
    } catch (e) {
      return { url, ok: false, error: e.name === 'TimeoutError' ? 'timeout' : 'fetch failed' };
    }
  }));

  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json({ fetchedAt: Date.now(), feeds });
}

// 내부망 주소로 요청을 보내지 않도록 막는다
function safeUrl(u) {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return false;
    const h = x.hostname;
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
    if (/^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    if (h.includes(':')) return false;   // IPv6 직접 지정 차단
    return true;
  } catch { return false; }
}

// 한국 언론사 RSS 중에는 EUC-KR 인 곳이 있다 → 헤더나 XML 선언의 문자셋으로 읽는다
function decodeBody(buf, contentType) {
  const head = new TextDecoder('latin1').decode(buf.slice(0, 300));
  const cs = (contentType.match(/charset=([\w-]+)/i) || head.match(/encoding=["']([\w-]+)["']/i) || [])[1];
  try { return new TextDecoder((cs || 'utf-8').toLowerCase()).decode(buf); }
  catch { return new TextDecoder('utf-8').decode(buf); }
}

function parseItems(xml) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map(b => {
    const title = clean(tag(b, 'title'));
    let link = clean(tag(b, 'link'));
    if (!/^https?:/i.test(link)) {
      // Atom: <link rel="alternate" href="..."/>
      const alt = b.match(/<link\b[^>]*rel=["']alternate["'][^>]*>/i) || b.match(/<link\b[^>]*>/i);
      const href = alt && alt[0].match(/href=["']([^"']+)["']/i);
      link = href ? decodeEntities(href[1]) : '';
    }
    if (!/^https?:/i.test(link)) link = clean(tag(b, 'guid'));
    const dateStr = clean(tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'published') || tag(b, 'updated'));
    const t = Date.parse(dateStr.replace(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/, '$1T$2'));
    const desc = clean(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content'));
    return { title, link, date: isNaN(t) ? 0 : t, desc: desc.slice(0, 400) };
  }).filter(x => x.title && /^https?:/i.test(x.link));
}

function tag(block, name) {
  const n = name.replace(':', '\\:');
  const m = block.match(new RegExp('<' + n + '\\b[^>]*>([\\s\\S]*?)</' + n + '>', 'i'));
  return m ? m[1] : '';
}
function clean(s) {
  s = String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = decodeEntities(s).replace(/<[^>]+>/g, ' ');      // 본문 HTML 이 엔티티로 들어있는 경우까지 처리
  return decodeEntities(s).replace(/\s+/g, ' ').trim();
}
function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|middot|hellip|lsquo|rsquo|ldquo|rdquo);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k[0] === '#') { const c = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); return c ? String.fromCodePoint(c) : ''; }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' }[k];
  });
}
