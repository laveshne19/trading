'use strict';
const { html } = require('../lib/html');
const { layout } = require('../lib/layout');
const C = require('./components');
const seo = require('../lib/seo');
const { policies, faqs, posts, reviewedNote } = require('../lib/content');

const wrap = (inner) => html`<div class="container section--tight">${inner}</div>`;

function about(ctx) {
  const { cfg } = ctx;
  return layout(ctx, { title: `About | ${cfg.siteName}`, description: `About ${cfg.siteName}: an India-first importer of lighting parts and electronics for European luxury vehicles.`, canonical: '/about',
    body: wrap(html`${C.crumbs([{ name: 'Home', url: '/' }, { name: 'About' }])}<div class="article"><h1>About ${cfg.siteName}</h1>
    <p class="lede">We help owners of European luxury vehicles in India find and order headlight modules and lighting electronics that are otherwise hard to source locally.</p>
    <h2>What we do</h2><p>We list parts from a Guangzhou-based supplier catalogue and ship them prepaid from China. We are an independent reseller, not a vehicle manufacturer or authorised dealer.</p>
    <h2>What we are careful about</h2><ul class="feature-list"><li>Fitment is shown as supplier-listed and is never described as verified.</li><li>Prices are shown only when confirmed; otherwise you can request a quote.</li><li>Warranty and returns terms are published as pending until the supplier agreement is in place.</li><li>We do not publish reviews, ratings or testimonials we do not have.</li></ul>
    <h2>Supplier</h2><p>${cfg.site.supplier_disclosure}</p><p class="muted small">Company registration, address and contact details: to be published by the business owner (see documentation/MISSING-INFO.md).</p></div>`),
    jsonld: [seo.org(cfg)] });
}
function contact(ctx) {
  const { cfg } = ctx;
  return layout(ctx, { title: `Contact | ${cfg.siteName}`, description: `Contact ${cfg.siteName} to confirm part fitment, request a quote or ask about an order.`, canonical: '/contact',
    body: wrap(html`${C.crumbs([{ name: 'Home', url: '/' }, { name: 'Contact' }])}<div class="article"><h1>Contact</h1>
    <p>The fastest way to get help with fitment or a quote is the enquiry form: you can attach a photo of your part.</p><p><a class="btn btn--primary" href="/enquiry">Send a photo / enquiry</a></p>
    <ul class="feature-list">${cfg.whatsapp ? html`<li>WhatsApp: <a href="https://wa.me/${cfg.whatsapp}">+${cfg.whatsapp}</a></li>` : html`<li class="muted">WhatsApp: not configured yet (set WHATSAPP_NUMBER)</li>`}${cfg.contactEmail ? html`<li>Email: <a href="mailto:${cfg.contactEmail}">${cfg.contactEmail}</a></li>` : html`<li class="muted">Email: not published yet (set CONTACT_EMAIL)</li>`}<li>Track an order: <a href="/track">/track</a></li></ul>
    <p class="small muted">Business address and phone: to be published by the business owner.</p></div>`) });
}
function faq(ctx) {
  const { cfg } = ctx;
  return layout(ctx, { title: `FAQ | ${cfg.siteName}`, description: 'Answers about fitment, pricing, prepaid orders, delivery, duties, warranty and returns.', canonical: '/faq',
    body: wrap(html`${C.crumbs([{ name: 'Home', url: '/' }, { name: 'FAQ' }])}<div class="article"><h1>Frequently asked questions</h1><div class="acc">${faqs.map(([q, a]) => html`<details><summary>${q}</summary><div class="body">${a}</div></details>`)}</div></div>`),
    jsonld: [seo.faqPage(faqs), seo.breadcrumbs(cfg, [{ name: 'Home', url: '/' }, { name: 'FAQ', url: '/faq' }])] });
}
function blogIndex(ctx) {
  const { cfg } = ctx;
  return layout(ctx, { title: `Guides | ${cfg.siteName}`, description: 'Buying guides for headlight modules, OEM vs aftermarket parts, DRL repair and importing parts to India.', canonical: '/blog',
    body: wrap(html`${C.crumbs([{ name: 'Home', url: '/' }, { name: 'Guides' }])}<h1 style="font-size:2.25rem">Guides</h1><p class="lede">${reviewedNote}</p><div class="articles" style="margin-top:32px">${posts.map((p) => html`<a class="tile" style="min-height:180px;gap:12px" href="/blog/${p.slug}"><b>${p.title}</b><span style="font-family:var(--font-sans);font-size:.9rem;color:var(--text-2)">${p.desc}</span><span>${p.date}</span></a>`)}</div>`) });
}
function blogPost(ctx, post) {
  const { cfg } = ctx;
  return layout(ctx, { title: `${post.title} | ${cfg.siteName}`, description: post.desc, canonical: `/blog/${post.slug}`, ogType: 'article',
    body: wrap(html`${C.crumbs([{ name: 'Home', url: '/' }, { name: 'Guides', url: '/blog' }, { name: post.title }])}<article class="article"><h1 style="font-size:2.25rem">${post.title}</h1><p class="muted small">${post.date} &middot; ${reviewedNote}</p>${post.bodyHtml}</article>`),
    jsonld: [seo.article(cfg, post), seo.breadcrumbs(cfg, [{ name: 'Home', url: '/' }, { name: 'Guides', url: '/blog' }, { name: post.title, url: `/blog/${post.slug}` }])] });
}
function policiesIndex(ctx) {
  const { cfg } = ctx;
  return layout(ctx, { title: `Policies | ${cfg.siteName}`, description: 'Privacy, terms, shipping, duties, returns, refunds, cancellation, warranty and compatibility policies.', canonical: '/policies',
    body: wrap(html`${C.crumbs([{ name: 'Home', url: '/' }, { name: 'Policies' }])}<h1 style="font-size:2.25rem">Policies</h1><div class="tiles tiles--cat" style="margin-top:24px">${policies.map((p) => html`<a class="tile" href="/policies/${p.slug}"><b>${p.title}</b><span style="font-family:var(--font-sans)">${p.desc}</span></a>`)}</div>`) });
}
function policyPage(ctx, pol) {
  const { cfg } = ctx;
  return layout(ctx, { title: `${pol.title} | ${cfg.siteName}`, description: pol.desc, canonical: `/policies/${pol.slug}`,
    body: wrap(html`${C.crumbs([{ name: 'Home', url: '/' }, { name: 'Policies', url: '/policies' }, { name: pol.title }])}<article class="article prose"><h1 style="font-size:2.25rem">${pol.title}</h1>${pol.bodyHtml}<p class="small muted" style="margin-top:32px">Working draft for the business owner to review with a qualified adviser before launch.</p></article>`) });
}
function notFound(ctx) {
  return layout(ctx, { title: `Page not found | ${ctx.cfg.siteName}`, description: 'The page you are looking for could not be found on this site.', noindex: true, body: wrap(html`<div class="article center" style="padding-block:64px"><h1>Page not found</h1><p>The page you are looking for does not exist.</p><p><a class="btn btn--primary" href="/shop">Browse parts</a></p></div>`) });
}
module.exports = { about, contact, faq, blogIndex, blogPost, policiesIndex, policyPage, notFound };
