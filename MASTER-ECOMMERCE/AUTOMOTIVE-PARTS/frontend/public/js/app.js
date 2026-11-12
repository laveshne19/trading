/* Minimal progressive-enhancement JS. Site works without it (server-rendered forms). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---- drawers ----
  var lastFocus = null;
  function openDrawer(id) { var d = document.getElementById(id); if (!d) return; lastFocus = document.activeElement; d.dataset.open = 'true'; var f = d.querySelector('a,button,input'); if (f) f.focus(); document.body.style.overflow = 'hidden'; }
  function closeDrawers() { $$('.drawer[data-open=true]').forEach(function (d) { d.dataset.open = 'false'; }); document.body.style.overflow = ''; if (lastFocus) lastFocus.focus(); }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open-drawer]');
    if (t) { e.preventDefault(); if (t.dataset.openDrawer === 'cart-drawer') refreshCart().then(function () { openDrawer('cart-drawer'); }); else openDrawer(t.dataset.openDrawer); return; }
    if (e.target.closest('[data-close-drawer]')) closeDrawers();
    var mb = e.target.closest('button.navlink'); if (mb) { var li = mb.parentNode; var o = li.classList.toggle('open'); mb.setAttribute('aria-expanded', o); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeDrawers(); $$('.nav li.open').forEach(function (l) { l.classList.remove('open'); l.firstElementChild.setAttribute('aria-expanded', 'false'); }); }
    if (e.key === 'Tab') {
      var d = $('.drawer[data-open=true] .drawer__panel');
      if (d) {
        var f = $$('a[href],button,input,select', d).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
        if (f.length) { var first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); } }
      }
    }
  });

  // ---- cart (fetch enhancement; plain forms still work) ----
  function refreshCart() {
    return fetch('/cart/drawer', { headers: { Accept: 'text/html' }, credentials: 'same-origin' }).then(function (r) { return r.text(); }).then(function (h) {
      var b = $('#cart-drawer-body'); if (b) b.innerHTML = h;
      var n = (h.match(/data-count="(\d+)"/) || [0, 0])[1];
      $$('[data-cart-count]').forEach(function (el) { el.textContent = n; el.hidden = n === '0'; });
    });
  }
  function toast(msg) { var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.parentNode && t.parentNode.removeChild(t); }, 2600); }
  document.addEventListener('submit', function (e) {
    var f = e.target;
    var post = function () { return fetch(f.action, { method: 'POST', body: new URLSearchParams(new FormData(f)), headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, credentials: 'same-origin' }).then(function (r) { return r.json(); }); };
    if (f.matches('form[data-ajax-cart]')) {
      e.preventDefault();
      post().then(function (j) { if (j.error) { toast(j.error); return; } refreshCart().then(function () { openDrawer('cart-drawer'); }); }).catch(function () { f.submit(); });
    }
    if (f.matches('form[data-drawer-form]')) { e.preventDefault(); post().then(refreshCart); }
  });

  // ---- cascading vehicle finder (data-driven via /api/vehicles) ----
  $$('form[data-finder]').forEach(function (form) {
    var sels = { make: form.elements.make, model: form.elements.model, gen: form.elements.gen, year: form.elements.year };
    function fill(sel, items, ph) {
      if (!sel) return; sel.innerHTML = '';
      var o = document.createElement('option'); o.value = ''; o.textContent = ph; sel.appendChild(o);
      items.forEach(function (it) { var op = document.createElement('option'); op.value = it.value; op.textContent = it.label; sel.appendChild(op); });
      sel.disabled = items.length === 0;
    }
    function load(level) {
      var q = new URLSearchParams({ make: sels.make.value, model: level === 'make' ? '' : sels.model.value, gen: level === 'gen' ? sels.gen.value : '' });
      return fetch('/api/vehicles?' + q, { credentials: 'same-origin' }).then(function (r) { return r.json(); });
    }
    if (sels.make) sels.make.addEventListener('change', function () {
      fill(sels.gen, [], 'Generation'); fill(sels.year, [], 'Year');
      if (!sels.make.value) { fill(sels.model, [], 'Model'); return; }
      load('make').then(function (j) { fill(sels.model, j.models, 'Model'); });
    });
    if (sels.model) sels.model.addEventListener('change', function () {
      fill(sels.year, [], 'Year');
      if (!sels.model.value) { fill(sels.gen, [], 'Generation'); return; }
      load('model').then(function (j) { fill(sels.gen, j.generations, j.generations.length ? 'Generation' : 'All generations'); sels.gen.disabled = false; });
    });
    if (sels.gen) sels.gen.addEventListener('change', function () {
      if (!sels.gen.value) { fill(sels.year, [], 'Year'); return; }
      load('gen').then(function (j) { fill(sels.year, j.years, 'Year (optional)'); });
    });
  });

  // ---- gallery zoom ----
  var gm = $('.gallery__main');
  if (gm) {
    gm.addEventListener('click', function () { gm.classList.toggle('zoomed'); });
    gm.addEventListener('mousemove', function (e) { if (!gm.classList.contains('zoomed')) return; var r = gm.getBoundingClientRect(); gm.style.setProperty('--zx', ((e.clientX - r.left) / r.width * 100) + '%'); gm.style.setProperty('--zy', ((e.clientY - r.top) / r.height * 100) + '%'); });
    gm.setAttribute('role', 'button'); gm.setAttribute('tabindex', '0'); gm.setAttribute('aria-label', 'Toggle image zoom');
    gm.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); gm.classList.toggle('zoomed'); } });
  }

  // ---- collapse filters on small screens ----
  if (window.matchMedia && window.matchMedia('(max-width:1023px)').matches) { $$('details.filters-wrap').forEach(function (d) { d.open = false; }); }

  // ---- qty steppers ----
  $$('.qty').forEach(function (q) { var i = q.querySelector('input'); q.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var v = parseInt(i.value, 10) || 1; v += b.dataset.d === '+' ? 1 : -1; i.value = Math.max(1, Math.min(10, v)); }); });

  // ---- recently viewed (localStorage, per-browser only) ----
  try {
    var pd = $('[data-product]');
    var KEY = 'rv', list = JSON.parse(localStorage.getItem(KEY) || '[]');
    var cur = pd ? JSON.parse(pd.dataset.product) : null;
    if (cur) { list = [cur].concat(list.filter(function (x) { return x.slug !== cur.slug; })).slice(0, 8); localStorage.setItem(KEY, JSON.stringify(list)); }
    var box = $('#recently-viewed');
    if (box) {
      var show = list.filter(function (x) { return !cur || x.slug !== cur.slug; }).slice(0, 4);
      if (show.length) { var ul = box.querySelector('ul'); show.forEach(function (x) { var li = document.createElement('li'); var a = document.createElement('a'); a.href = '/product/' + encodeURIComponent(x.slug); a.textContent = x.title; li.appendChild(a); ul.appendChild(li); }); box.hidden = false; }
    }
  } catch (e) { /* storage unavailable */ }
})();
