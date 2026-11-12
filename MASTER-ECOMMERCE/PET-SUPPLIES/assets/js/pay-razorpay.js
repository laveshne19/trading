/* Razorpay Standard Checkout launcher. Requires checkout.razorpay.com/v1/checkout.js. NOT verified against a live account. */
(function () {
  var b = document.getElementById('rzp-btn'); if (!b) return;
  b.addEventListener('click', function () {
    if (!window.Razorpay) { alert('Payment SDK could not load. Please retry.'); return; }
    var f = document.getElementById('rzp-form');
    var rz = new window.Razorpay({ key: b.dataset.rzpKey, order_id: b.dataset.rzpOrder, amount: b.dataset.rzpAmount, currency: 'INR', name: b.dataset.rzpName, prefill: { email: b.dataset.rzpEmail, contact: b.dataset.rzpPhone },
      handler: function (r) { f.razorpay_payment_id.value = r.razorpay_payment_id; f.razorpay_order_id.value = r.razorpay_order_id; f.razorpay_signature.value = r.razorpay_signature; f.submit(); } });
    rz.open();
  });
})();
