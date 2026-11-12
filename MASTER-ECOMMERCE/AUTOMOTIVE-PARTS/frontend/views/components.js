'use strict';
const { html, raw, esc } = require('../lib/html');
const { inr } = require('../lib/util');
const fitment = require('../lib/fitment');

const csrfInput = (ctx) => html`<input type="hidden" name="_csrf" value="${ctx.session.csrf}">`;

function crumbs(items) {
  return html`<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map((it, i) => html`<li>${it.url && i < items.length - 1 ? html`<a href="${it.url}">${it.name}</a>` : html`<span ${i === items.length - 1 ? raw('aria-current="page"') : ''}>${it.name}</span>`}</li>`)}</ol></nav>`;
}

function priceBlock(price, compact = false) {
  if (!price) return html`<span class="price price--req">Price on request</span>`;
  return html`<span class="price">${inr(price.amount)}${price.dev ? html`<span class="dev">DEV PLACEHOLDER PRICE</span>` : ''}</span>`;
}

function productImg(p, { eager = false, caption = true } = {}) {
  if (!p.image) return html`<div class="noimg">No supplier photo<br>listed</div>`;
  const [w, h] = p.image_px || [400, 400];
  return html`<img src="/assets/products/${p.image}" width="${w}" height="${h}" alt="${p.title} - photo from supplier catalogue" loading="${eager ? 'eager' : 'lazy'}" decoding="async">${caption ? html`<span class="pcard__cap">Photo from supplier catalogue</span>` : ''}`;
}

function productCard(ctx, p) {
  const price = ctx.catalog.price(p);
  return html`<article class="pcard">
    <div class="pcard__img">${productImg(p)}</div>
    <div class="pcard__body">
      <span class="pcard__brand">${p.brand === 'Universal' ? 'Universal' : p.brand}${p.side !== 'n/a' ? html` &middot; ${p.side}` : ''}</span>
      <h3 class="pcard__title"><a href="/product/${p.slug}">${p.title}</a></h3>
      ${p.oem_numbers.length ? html`<span class="pcard__oem">OEM ${p.oem_numbers[0]}</span>` : ''}
      <div class="pcard__foot">${priceBlock(price)}<span class="tag">Supplier-listed</span></div>
    </div></article>`;
}

function pager(base, page, pages) {
  if (pages <= 1) return '';
  const q = (n) => { const u = new URLSearchParams(base); u.set('page', n); return '?' + u.toString(); };
  const nums = []; for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 2) nums.push(i);
  const out = []; let prev = 0;
  for (const n of nums) { if (n - prev > 1) out.push(html`<span aria-hidden="true">...</span>`); out.push(n === page ? html`<span aria-current="page">${n}</span>` : html`<a href="${q(n)}" aria-label="Page ${n}">${n}</a>`); prev = n; }
  return html`<nav class="pager" aria-label="Pagination">${page > 1 ? html`<a href="${q(page - 1)}" rel="prev">Prev</a>` : ''}${out}${page < pages ? html`<a href="${q(page + 1)}" rel="next">Next</a>` : ''}</nav>`;
}

// Cascading finder (server-rendered state; JS enhances with /api/vehicles)
function finderForm(ctx, sel = {}, { compact = false, id = 'finder' } = {}) {
  const o = fitment.options(ctx.catalog.vehicles, sel);
  const opt = (v, l, cur) => html`<option value="${v}" ${String(cur) === String(v) ? raw('selected') : ''}>${l}</option>`;
  return html`<form class="finder__form" action="/vehicle" method="get" data-finder aria-label="Vehicle finder">
    <div class="finder__grid">
      <div><label for="${id}-make">Make</label><select id="${id}-make" name="make"><option value="">Make</option>${o.makes.map((m) => opt(m.slug, m.name, sel.make))}</select></div>
      <div><label for="${id}-model">Model</label><select id="${id}-model" name="model" ${o.models.length ? '' : raw('disabled')}><option value="">Model</option>${o.models.map((m) => opt(m.slug, m.name, sel.model))}</select></div>
      <div><label for="${id}-gen">Generation</label><select id="${id}-gen" name="gen" ${sel.model ? '' : raw('disabled')}><option value="">${sel.model && !o.generations.length ? 'All generations' : 'Generation'}</option>${o.generations.map((g) => opt(g.slug, `${g.code} (${g.year_from}${g.year_to ? '-' + g.year_to : ' onward'})`, sel.gen))}</select></div>
      <div><label for="${id}-year">Year</label><select id="${id}-year" name="year" ${o.years.length ? '' : raw('disabled')}><option value="">Year (optional)</option>${o.years.map((y) => opt(y, y, sel.year))}</select></div>
      <div><button class="btn btn--primary btn--block" type="submit">Find parts</button></div>
    </div></form>`;
}

function csrfForm(ctx, attrs, inner) { return html`<form ${raw(attrs)}>${csrfInput(ctx)}${inner}</form>`; }

module.exports = { csrfInput, crumbs, priceBlock, productImg, productCard, pager, finderForm, csrfForm };
