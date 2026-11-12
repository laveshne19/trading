/* Cashfree JS SDK v3 launcher. NOT verified against a live account. */
(function () {
  var b = document.getElementById('cf-btn'); if (!b) return;
  b.addEventListener('click', function () {
    if (!window.Cashfree) { alert('Payment SDK could not load. Please retry.'); return; }
    var cf = window.Cashfree({ mode: b.dataset.cfMode === 'production' ? 'production' : 'sandbox' });
    cf.checkout({ paymentSessionId: b.dataset.cfSession, redirectTarget: '_self' });
  });
})();
