// sw.js
// Development-oriented cache policy for Hex-crpg.
// Keep app code fresh while this project is changing rapidly.

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    const destination = request.destination;
    const isAppCode = destination === 'document' || destination === 'script' || destination === 'style';
    if (!isAppCode) return;

    event.respondWith(fetch(request, { cache: 'no-store' }));
});
