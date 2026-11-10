// Service Worker：离线缓存（添加到主屏幕后，没网也能玩）
const VERSION = 'sic-v1.0.1';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/game.css',
  'js/main.js', 'js/i18n.js', 'js/audio.js', 'js/world.js', 'js/plane.js', 'js/fx.js', 'js/input.js',
  'lib/three.module.js', 'lib/GLTFLoader.js', 'lib/BufferGeometryUtils.js',
  'assets/plane.glb',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // 页面：网络优先 (有更新能拿到)，失败回退缓存；其他资源：缓存优先
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => { const cp = res.clone(); caches.open(VERSION).then((c) => c.put('index.html', cp)); return res; })
        .catch(() => caches.match('index.html')),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const cp = res.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); }
      return res;
    })),
  );
});
