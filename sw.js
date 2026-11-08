// Service worker básico: permite instalar la app y abrirla sin conexión.
const CACHE = 'reservas-v34';
const FILES = ['./', './index.html', './css/fonts.css', './css/styles.css', './js/store.js', './js/app.js', './js/brand.js', './js/import.js', './js/pagos.js', './js/turnos.js', './js/entrenos.js', './js/personal.js', './js/config.js', './js/vendor/supabase.min.js', './js/remote.js', './manifest.json', './icons/icon-192.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => e.respondWith(fetch(e.request).catch(() => caches.match(e.request))));
