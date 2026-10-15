const CACHE = 'article-reader-v11';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 외부 API(CORS 프록시, 폰트 등)와 서버 API는 캐시 안함
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // 페이지(HTML)는 네트워크 우선 → 배포하면 바로 최신 버전이 뜨고, 오프라인일 때만 캐시 사용
  // (공유하기로 열린 /?url=... 도 같은 페이지로 처리)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); }
        return r;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});
