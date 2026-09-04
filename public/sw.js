// Service worker volutamente minimo: non mette nulla in cache, si limita
// a lasciar passare le richieste di rete. Serve solo a soddisfare il
// requisito tecnico di Chrome per considerare l'app "installabile" —
// aggiungere una vera cache offline è un passo separato, da valutare
// quando l'app sarà più stabile (altrimenti si rischia di mostrare
// contenuti vecchi mentre continuiamo a svilupparla).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
