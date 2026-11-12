'use strict';
const { h, raw, esc } = require('../lib/html');
const { rupee, fmtDate } = require('../lib/util');
const svg = require('../lib/brand-svg');

const ICONS = {
  paw: '<ellipse cx="12" cy="16" rx="4" ry="3.2"/><ellipse cx="5.8" cy="11.4" rx="1.6" ry="2.2"/><ellipse cx="9.6" cy="6.8" rx="1.6" ry="2.3"/><ellipse cx="14.4" cy="6.8" rx="1.6" ry="2.3"/><ellipse cx="18.2" cy="11.4" rx="1.6" ry="2.2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  cart: '<path d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.1"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.2-3.6 4.2-5.5 8-5.5s6.8 1.9 8 5.5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>', chevron: '<path d="m6 9 6 6 6-6"/>', chevronR: '<path d="m9 6 6 6-6 6"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  repeat: '<path d="M4 11V9a3 3 0 0 1 3-3h11l-3-3M20 13v2a3 3 0 0 1-3 3H6l3 3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', filter: '<path d="M4 6h16M7 12h10M10 18h4"/>', home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>', box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>', pin: '<path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21z"/><circle cx="12" cy="10" r="2.5"/>',
  whatsapp: '<path d="M4 20l1.3-4.2A8 8 0 1 1 8.4 18.8z"/><path d="M9 9c.3 2.8 2.7 5.2 6 6l1.3-1.5-2.2-1.2-1 .8c-.9-.4-1.8-1.3-2.2-2.2l.8-1-1.1-2.2z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>', alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', gift: '<rect x="3" y="9" width="18" height="12" rx="1"/><path d="M12 9v12M3 13h18M12 9c-3 0-5-1-5-3s3-3 5 0c2-3 5-2 5 0s-2 3-5 3z"/>',
};
const icon = (name, size = 20, cls = '') => raw(`<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`);

const discount = (mrp, price) => (mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0);

function priceBlock(p, variant) {
  if (p.rx) return h`<p class="price price-rx"><span class="pill pill-rx">Prescription required</span> <span class="muted small">Not sold online without authorisation</span></p>`;
  const v = variant; const now = v ? v.price : p.minPrice; const mrp = v ? v.mrp : p.fromMrp; const d = discount(mrp, now);
  const from = !v && p.minPrice !== p.maxPrice;
  return h`<p class="price"><span class="price-now">${from ? raw('<span class="from">From </span>') : ''}${rupee(now)}</span>${d ? h` <span class="price-mrp"><span class="vh">MRP </span><s>${rupee(mrp)}</s></span> <span class="badge badge-off">${d}% off</span>` : ''}</p>`;
}
const pillBadges = (p) => h`${p.isNew ? h`<span class="badge badge-new">New</span>` : ''}${p.rx ? h`<span class="badge badge-rx">Rx only</span>` : ''}${!p.rx && p.maxDiscount ? h`<span class="badge badge-off">Up to ${p.maxDiscount}% off</span>` : ''}`;

function productCard(p, ctx, { eager = false } = {}) {
  const inStock = p.variants.some((v) => ctx.stockOf(v.sku) > 0);
  const single = p.variants.length === 1 ? p.variants[0] : null;
  const img = p.images[0];
  return h`<article class="card product-card" data-sku="${p.sku}">
    <a class="card-media" href="/products/${p.slug}" tabindex="-1" aria-hidden="true"><img src="${img.src}" width="${img.w}" height="${img.h}" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async"></a>
    <div class="card-badges">${pillBadges(p)}</div>
    ${ctx.wishButton(p.slug, 'card-wish')}
    <div class="card-body">
      <p class="eyebrow">${p.brand}</p>
      <h3 class="card-title"><a href="/products/${p.slug}">${p.title}</a></h3>
      ${priceBlock(p, single)}
      ${p.rx ? h`<a class="btn btn-ghost btn-sm" href="/products/${p.slug}">View details</a>`
        : !inStock ? h`<p class="stock stock-out">Out of stock</p>`
        : single ? h`<form method="post" action="/cart/add" class="add-form" data-add><input type="hidden" name="_csrf" value="${ctx.csrf}"><input type="hidden" name="sku" value="${single.sku}"><input type="hidden" name="qty" value="1"><input type="hidden" name="back" value="${ctx.path}"><button class="btn btn-primary btn-sm" type="submit">${icon('plus', 16)} Add to cart</button></form>`
        : h`<a class="btn btn-ghost btn-sm" href="/products/${p.slug}">Select options</a>`}
    </div></article>`;
}
const productGrid = (items, ctx, opts) => h`<ul class="grid product-grid" role="list">${items.map((p, i) => h`<li>${productCard(p, ctx, { eager: opts && opts.eagerFirst && i < 4 })}</li>`)}</ul>`;
const productRow = (items, ctx) => h`<ul class="row-scroll" role="list" tabindex="0" aria-label="Products, scroll horizontally">${items.map((p) => h`<li>${productCard(p, ctx)}</li>`)}</ul>`;

function section(id, title, { eyebrow, link, linkText = 'View all', intro, body, cls = '' }) {
  return h`<section class="section ${cls}" aria-labelledby="${id}-h"><div class="wrap">
    <header class="section-head"><div>${eyebrow ? h`<p class="eyebrow">${eyebrow}</p>` : ''}<h2 id="${id}-h">${title}</h2>${intro ? h`<p class="lead">${intro}</p>` : ''}</div>${link ? h`<a class="link-arrow" href="${link}">${linkText} ${icon('chevronR', 16)}</a>` : ''}</header>${body}</div></section>`;
}
function breadcrumbs(items) { // [{name,url}] last = current
  return h`<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${items.map((it, i) => h`<li>${i < items.length - 1 ? h`<a href="${it.url}">${it.name}</a>` : h`<span aria-current="page">${it.name}</span>`}</li>`)}</ol></nav>`;
}
const breadcrumbLd = (items, siteUrl) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: siteUrl + it.url })) });

function pagination(page, pages, makeUrl) {
  if (pages <= 1) return '';
  const nums = []; for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
  return h`<nav class="pagination" aria-label="Pagination">${page > 1 ? h`<a class="btn btn-ghost btn-sm" rel="prev" href="${makeUrl(page - 1)}">Previous</a>` : ''}<ol>${nums.map((n) => (n === '…' ? h`<li aria-hidden="true">…</li>` : h`<li>${n === page ? h`<span class="pg current" aria-current="page">${n}</span>` : h`<a class="pg" href="${makeUrl(n)}" aria-label="Page ${n}">${n}</a>`}</li>`))}</ol>${page < pages ? h`<a class="btn btn-ghost btn-sm" rel="next" href="${makeUrl(page + 1)}">Next</a>` : ''}</nav>`;
}
const flash = (f) => (f ? h`<div class="flash flash-${f.type || 'info'}" role="${f.type === 'error' ? 'alert' : 'status'}">${icon(f.type === 'error' ? 'alert' : 'info', 18)}<span>${f.msg}</span></div>` : '');
const field = (o) => h`<div class="field${o.error ? ' has-error' : ''}"><label for="${o.id}">${o.label}${o.required ? h`<span class="req" aria-hidden="true"> *</span>` : ''}${o.optional ? h` <span class="muted small">(optional)</span>` : ''}</label>${o.control || h`<input id="${o.id}" name="${o.name || o.id}" type="${o.type || 'text'}" value="${o.value ?? ''}" ${o.required ? raw('required') : ''} ${o.autocomplete ? raw(`autocomplete="${esc(o.autocomplete)}"`) : ''} ${o.inputmode ? raw(`inputmode="${esc(o.inputmode)}"`) : ''} ${o.pattern ? raw(`pattern="${esc(o.pattern)}"`) : ''} ${o.maxlength ? raw(`maxlength="${o.maxlength}"`) : ''} ${o.min !== undefined ? raw(`min="${o.min}"`) : ''} ${o.step ? raw(`step="${o.step}"`) : ''} ${o.error ? raw(`aria-invalid="true" aria-describedby="${o.id}-err"`) : ''}>`}${o.hint ? h`<p class="hint">${o.hint}</p>` : ''}${o.error ? h`<p class="error" id="${o.id}-err">${o.error}</p>` : ''}</div>`;
const select = (id, name, options, value, attrs = '') => h`<select id="${id}" name="${name}" ${raw(attrs)}>${options.map((o) => { const v = typeof o === 'string' ? o : o.value; const l = typeof o === 'string' ? o : o.label; return h`<option value="${v}" ${String(v) === String(value) ? raw('selected') : ''}>${l}</option>`; })}</select>`;
const csrfInput = (ctx) => h`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;
const STATES_IN = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];
module.exports = { icon, priceBlock, productCard, productGrid, productRow, section, breadcrumbs, breadcrumbLd, pagination, flash, field, select, csrfInput, discount, pillBadges, STATES_IN, svg, fmtDate };
