/* Paw & Hearth - progressive enhancement. Everything works without this file (server-rendered forms). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var csrf = function () { var m = $('meta[name="csrf-token"]'); return m ? m.content : ''; };
  var rupee = function (n) { return '₹' + Number(n).toLocaleString('en-IN'); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function post(url, data) {
    var body = new URLSearchParams(data); if (!body.has('_csrf')) body.set('_csrf', csrf());
    return fetch(url, { method: 'POST', body: body, headers: { 'X-Requested-With': 'fetch', 'Accept': 'application/json', 'X-CSRF-Token': csrf() }, credentials: 'same-origin' });
  }
  function toast(msg) { var t = $('[data-toast]'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3200); }
  function setCount(n) { $$('[data-cart-count]').forEach(function (e) { e.textContent = n; e.hidden = !n; }); var b = $('.cart-btn'); if (b) b.setAttribute('aria-label', 'Open cart, ' + n + ' items'); }

  // ---- announcement rotator
  (function () { var items = $$('[data-rotate] .ann'); if (items.length < 2 || reduce) return; var i = 0; setInterval(function () { items[i].classList.remove('on'); i = (i + 1) % items.length; items[i].classList.add('on'); }, 4500); })();

  // ---- drawers
  var scrim = $('[data-scrim]'); var openEl = null; var lastFocus = null;
  function loadCart() { var body = $('[data-cart-body]'); if (!body) return Promise.resolve(); return fetch('/cart/drawer', { credentials: 'same-origin' }).then(function (r) { return r.text(); }).then(function (h) { body.innerHTML = h; }); }
  function openDrawer(id) {
    var d = document.getElementById(id); if (!d) return; lastFocus = document.activeElement; closeAll(true);
    d.hidden = false; scrim.hidden = false; requestAnimationFrame(function () { d.classList.add('open'); scrim.classList.add('on'); });
    openEl = d; document.body.style.overflow = 'hidden'; $$('[data-open="' + id + '"]').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
    if (id === 'cart-drawer') loadCart();
    var f = $('button, a[href], input', d); if (f) setTimeout(function () { f.focus(); }, 50);
  }
  function closeAll(quiet) {
    if (!openEl) return; var d = openEl; openEl = null; d.classList.remove('open'); scrim.classList.remove('on'); document.body.style.overflow = '';
    $$('[data-open]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    setTimeout(function () { if (!openEl) { d.hidden = true; scrim.hidden = true; } }, reduce ? 0 : 300); if (!quiet && lastFocus) lastFocus.focus();
  }
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]'); if (o) { e.preventDefault(); openDrawer(o.getAttribute('data-open')); return; }
    if (e.target.closest('[data-close]') || e.target === scrim) { closeAll(); return; }
    var mt = e.target.closest('.mega-toggle');
    if (mt) { var li = mt.closest('.has-mega'); var was = li.classList.contains('open'); $$('.has-mega.open').forEach(function (x) { x.classList.remove('open'); $('.mega-toggle', x).setAttribute('aria-expanded', 'false'); }); if (!was) { li.classList.add('open'); mt.setAttribute('aria-expanded', 'true'); } return; }
    if (!e.target.closest('.has-mega')) $$('.has-mega.open').forEach(function (x) { x.classList.remove('open'); $('.mega-toggle', x).setAttribute('aria-expanded', 'false'); });
    if (!e.target.closest('.search')) hideSuggest();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeAll(); closeFilters(); $$('.has-mega.open').forEach(function (x) { x.classList.remove('open'); $('.mega-toggle', x).setAttribute('aria-expanded', 'false'); }); hideSuggest(); }
    if (e.key === 'Tab' && openEl) { var f = $$('a[href], button:not([disabled]), input, select, textarea', openEl).filter(function (x) { return x.offsetParent !== null; }); if (!f.length) return; var first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
  });

  // ---- add to cart (cards + pdp) and drawer cart edits
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.hasAttribute('data-add') || f.id === 'buy-form') {
      var submitter = e.submitter; if (submitter && submitter.name === 'buy') return; // buy now: normal submit
      e.preventDefault(); var btn = $('button[type=submit]', f); if (btn) btn.disabled = true;
      var fd = new FormData(f); var data = {}; fd.forEach(function (v, k) { data[k] = v; });
      post('/cart/add', data).then(function (r) { return r.json(); }).then(function (j) { toast(j.message); if (typeof j.count === 'number') setCount(j.count); if (j.ok && f.id === 'buy-form') openDrawer('cart-drawer'); })
        .catch(function () { f.submit(); }).then(function () { if (btn) btn.disabled = false; });
      return;
    }
    if (f.hasAttribute('data-cart-form') && f.closest('#cart-drawer')) {
      e.preventDefault(); var d2 = {}; new FormData(f).forEach(function (v, k) { d2[k] = v; }); if (e.submitter && e.submitter.name) d2[e.submitter.name] = e.submitter.value;
      post(f.getAttribute('action'), d2).then(function (r) { return r.json(); }).then(function (j) { setCount(j.count); return loadCart(); }).catch(function () { f.submit(); });
    }
  });

  // ---- search suggestions
  var sInput = $('.search input[type=search]'); var sList = $('#suggest'); var sIdx = -1; var sTimer;
  function hideSuggest() { if (sList) { sList.hidden = true; sInput && sInput.setAttribute('aria-expanded', 'false'); sIdx = -1; } }
  function li(parent, href, text, img, price) { var l = document.createElement('li'); l.setAttribute('role', 'option'); var a = document.createElement('a'); a.href = href; if (img) { var im = document.createElement('img'); im.src = img; im.width = 44; im.height = 44; im.alt = ''; a.appendChild(im); } var s = document.createElement('span'); s.textContent = text + (price ? ' - ' + rupee(price) : ''); a.appendChild(s); l.appendChild(a); parent.appendChild(l); }
  if (sInput && sList) {
    sInput.addEventListener('input', function () {
      clearTimeout(sTimer); var q = sInput.value.trim(); if (q.length < 2) { hideSuggest(); return; }
      sTimer = setTimeout(function () { fetch('/api/suggest?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (j) {
        sList.textContent = ''; if (!j.products.length && !j.categories.length) { var n = document.createElement('li'); n.className = 'sg-head'; n.textContent = 'No matches'; sList.appendChild(n); }
        if (j.categories.length) { var h = document.createElement('li'); h.className = 'sg-head'; h.textContent = 'Categories'; sList.appendChild(h); j.categories.forEach(function (c) { li(sList, c.url, c.title); }); }
        if (j.products.length) { var h2 = document.createElement('li'); h2.className = 'sg-head'; h2.textContent = 'Products'; sList.appendChild(h2); j.products.forEach(function (p) { li(sList, p.url, p.title, p.image, p.rx ? 0 : p.price); }); }
        sList.hidden = false; sInput.setAttribute('aria-expanded', 'true'); sIdx = -1; }).catch(function () {}); }, 160);
    });
    sInput.addEventListener('keydown', function (e) { var items = $$('a', sList); if (sList.hidden || !items.length) return; if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sIdx = (sIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach(function (a, i) { a.setAttribute('aria-selected', i === sIdx); }); items[sIdx].focus(); sInput.focus(); } else if (e.key === 'Enter' && sIdx >= 0) { e.preventDefault(); location.href = items[sIdx].href; } });
  }

  // ---- filters sheet + autosubmit
  var filters = $('#filters'); function closeFilters() { if (!filters) return; filters.classList.remove('open'); scrim && scrim.classList.remove('on'); if (!openEl && scrim) scrim.hidden = true; var ob = $('[data-open-filters]'); if (ob) ob.setAttribute('aria-expanded', 'false'); }
  $$('[data-open-filters]').forEach(function (b) { b.addEventListener('click', function () { filters.classList.add('open'); scrim.hidden = false; requestAnimationFrame(function () { scrim.classList.add('on'); }); b.setAttribute('aria-expanded', 'true'); scrim.onclick = closeFilters; var f = $('input', filters); if (f) f.focus(); }); });
  $$('[data-close-filters]').forEach(function (b) { b.addEventListener('click', closeFilters); });
  $$('[data-autosubmit]').forEach(function (s) { s.addEventListener('change', function () { s.form.submit(); }); });
  if (filters) filters.addEventListener('change', function (e) { if (e.target.type === 'checkbox' && window.innerWidth >= 896) filters.submit(); });

  // ---- PIN checker
  $$('[data-pin-check], [data-checkout]').forEach(function (form) {
    var input = $('input[name=pin]', form); var out = $('[data-pin-result]', form); if (!input || !out) return;
    function run() {
      var pin = input.value.trim(); if (!/^[1-9][0-9]{5}$/.test(pin)) { out.textContent = pin ? 'Enter a valid 6-digit PIN code.' : ''; out.className = 'pin-result small bad'; return Promise.resolve(); }
      out.textContent = 'Checking...'; out.className = 'pin-result small';
      return fetch('/api/pincode?pin=' + pin, { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
        out.textContent = j.message || ''; out.className = 'pin-result small ' + (j.ok && j.serviceable ? 'ok' : 'bad');
        var codOpt = $('[data-cod-opt]'); if (codOpt && j.ok && 'cod' in j) { var inp = $('input', codOpt); var reason = $('[data-cod-reason]', codOpt); inp.disabled = !j.cod; codOpt.classList.toggle('disabled', !j.cod); if (reason) { reason.hidden = j.cod; reason.textContent = j.cod ? '' : j.codReason; } if (!j.cod && inp.checked) { var other = $('input[name=payment]:not([value=cod]):not(:disabled)', form); if (other) other.checked = true; } }
        var eta = $('[data-eta]'); if (eta && j.ok && j.serviceable) eta.textContent = j.message;
      }).catch(function () { out.textContent = 'Could not check right now. You can still continue; we verify at checkout.'; out.className = 'pin-result small'; });
    }
    if (form.hasAttribute('data-pin-check')) form.addEventListener('submit', function (e) { e.preventDefault(); run(); });
    else { input.addEventListener('change', run); input.addEventListener('blur', run); if (input.value) run(); }
    if (form.hasAttribute('data-pin-check') && input.value && /^[1-9][0-9]{5}$/.test(input.value)) run();
  });

  // ---- saved address prefill (checkout)
  var sa = $('[data-saved-addr]'); var ad = $('#addr-data');
  if (sa && ad) { var addrs = JSON.parse(ad.textContent); sa.addEventListener('change', function () { var a = addrs.filter(function (x) { return x.id === sa.value; })[0]; if (!a) return; var map = { name: 'name', line1: 'line1', line2: 'line2', pin: 'pin', city: 'city', state: 'state', phone: 'phone' }; Object.keys(map).forEach(function (k) { var el = $('[name=' + map[k] + ']'); if (el && a[k] !== undefined) el.value = a[k]; }); var p = $('[name=pin]'); if (p) p.dispatchEvent(new Event('change')); }); }

  // ---- product page: gallery, qty, variants, sticky ATC
  var gal = $('[data-gallery]');
  if (gal) $$('.thumb', gal).forEach(function (t) { t.addEventListener('click', function () { var m = $('#gal-main'); m.src = t.dataset.src; m.alt = t.dataset.alt; $$('.thumb', gal).forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); }); t.classList.add('on'); t.setAttribute('aria-pressed', 'true'); }); });
  $$('[data-qty]').forEach(function (q) { var inp = $('input', q); $('[data-dec]', q).addEventListener('click', function () { inp.value = Math.max(1, (+inp.value || 1) - 1); }); $('[data-inc]', q).addEventListener('click', function () { inp.value = Math.min(10, (+inp.value || 1) + 1); }); });
  var vd = $('#variants-data'); var vsel = $('[data-variant-select]');
  if (vd && vsel) {
    var variants = JSON.parse(vd.textContent); var names = Object.keys(variants[0].options); var pills = $('[data-pills]'); var cur = variants.filter(function (v) { return v.sku === vsel.value; })[0] || variants[0]; var sel = JSON.assign ? null : null; var chosen = Object.assign({}, cur.options);
    function find(opts) { return variants.filter(function (v) { return names.every(function (n) { return v.options[n] === opts[n]; }); })[0]; }
    function apply(v) {
      cur = v; vsel.value = v.sku; var pb = $('#price-block'); pb.textContent = ''; var p = document.createElement('p'); p.className = 'price'; var now = document.createElement('span'); now.className = 'price-now'; now.textContent = rupee(v.price); p.appendChild(now);
      if (v.mrp > v.price) { var m = document.createElement('span'); m.className = 'price-mrp'; var vh = document.createElement('span'); vh.className = 'vh'; vh.textContent = 'MRP '; var s = document.createElement('s'); s.textContent = rupee(v.mrp); m.appendChild(vh); m.appendChild(s); p.appendChild(document.createTextNode(' ')); p.appendChild(m); var b = document.createElement('span'); b.className = 'badge badge-off'; b.textContent = Math.round((v.mrp - v.price) / v.mrp * 100) + '% off'; p.appendChild(document.createTextNode(' ')); p.appendChild(b); }
      pb.appendChild(p);
      var st = $('#stock-line'); st.className = 'stock stock-' + v.status; st.textContent = v.status === 'out' ? 'Out of stock' : v.status === 'low' ? 'Only ' + v.left + ' left in stock' : 'In stock';
      ['#atc', '#buy-now', '[data-sticky-click]'].forEach(function (s2) { var b2 = $(s2); if (b2) b2.disabled = v.status === 'out'; });
      var sl = $('#sub-link'); if (sl) sl.href = '/subscriptions/new?sku=' + v.sku; var sp = $('#sticky-price'); if (sp) sp.textContent = rupee(v.price);
      $$('input[type=radio]', pills).forEach(function (r) { r.checked = chosen[r.name] === r.value; });
    }
    names.forEach(function (n) {
      var fs = document.createElement('fieldset'); fs.className = 'pill-group'; var lg = document.createElement('legend'); lg.textContent = n; fs.appendChild(lg); var wrap = document.createElement('div'); wrap.className = 'pills'; fs.appendChild(wrap);
      var vals = []; variants.forEach(function (v) { if (vals.indexOf(v.options[n]) < 0) vals.push(v.options[n]); });
      vals.forEach(function (val) { var lab = document.createElement('label'); lab.className = 'pill-opt'; var r = document.createElement('input'); r.type = 'radio'; r.name = n; r.value = val; r.checked = chosen[n] === val; var sp2 = document.createElement('span'); sp2.textContent = val; lab.appendChild(r); lab.appendChild(sp2); wrap.appendChild(lab);
        r.addEventListener('change', function () { chosen[n] = val; var v = find(chosen); if (!v) { v = variants.filter(function (x) { return x.options[n] === val; })[0]; chosen = Object.assign({}, v.options); } apply(v); }); });
      pills.appendChild(fs);
    });
    apply(cur);
  }
  var atc = $('#atc'), sticky = $('[data-sticky-atc]');
  if (atc && sticky && 'IntersectionObserver' in window) { var io = new IntersectionObserver(function (en) { sticky.hidden = en[0].isIntersecting || window.innerWidth >= 992; }, { rootMargin: '0px 0px -60px 0px' }); io.observe(atc); $('[data-sticky-click]').addEventListener('click', function () { var f = $('#buy-form'); if (f.requestSubmit) f.requestSubmit(atc); else f.submit(); }); }
})();
