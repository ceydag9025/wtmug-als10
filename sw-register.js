if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' })   // ← HER ZAMAN network'ten çek
      .then(reg => {
        reg.update().catch(()=>{});
        console.log('SW registered, scope:', reg.scope);
      })
      .catch(err => console.warn('SW register hata:', err));
  });
}