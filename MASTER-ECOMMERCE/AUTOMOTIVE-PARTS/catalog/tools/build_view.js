#!/usr/bin/env node
'use strict';
/**
 * Normalised view layer builder. Re-runnable.
 *   node catalog/tools/build_view.js [--in catalog/data/supplier-products.json] [--site-name "Apex Lumen"]
 * Reads supplier-products.json (raw supplier rows; or output of import_supplier_csv.js)
 * Writes catalog/data/products.json and catalog/data/vehicles.json
 * Never invents data: display titles are assembled ONLY from supplier fields.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const IN = path.resolve(ROOT, arg('--in', 'catalog/data/supplier-products.json'));
const SITE = arg('--site-name', process.env.SITE_NAME || 'Apex Lumen');
const seed = require('./vehicles-seed.js');

const slugify = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
const tokens = (text) => {
  const parts = String(text || '').toUpperCase().split(/[^A-Z0-9.]+/).filter(Boolean).map((t) => t.replace(/\.$/, ''));
  const out = new Set(parts);
  for (let i = 0; i < parts.length - 1; i++) out.add(parts[i] + parts[i + 1]);
  // "GLC 253", "A-Class": also hyphen-joined forms
  const hy = String(text || '').toUpperCase().match(/[A-Z0-9]+(?:-[A-Z0-9]+)+/g) || [];
  hy.forEach((h) => out.add(h));
  return out;
};

// ---------- title generation ----------
const ACR = { led: 'LED', hid: 'HID', drl: 'DRL', pdc: 'PDC', ahl: 'AHL', pcb: 'PCB', bsd: 'BSD', fcw: 'FCW', adas: 'ADAS', hvac: 'HVAC' };
const TYPE_MAP = {
  'led angel eyes': 'LED Angel Eyes DRL Module', 'led angel eyes kit': 'LED Angel Eyes Kit',
  'led module': 'LED Light Module', 'led headlight module': 'LED Headlight Module', 'headlight led module': 'LED Headlight Module',
  'led turn signal light': 'LED Turn Signal Module', 'led turn light': 'LED Turn Signal Module',
  'led boards': 'LED Board', 'led pcb boards': 'LED PCB Board', 'light guide': 'Headlight Light Guide',
  'hid headlight ballast': 'HID Headlight Ballast', 'headlight internal wiring': 'Headlight Internal Wiring Harness',
  'parking assist system control unit': 'Parking Assist (PDC) Control Unit', 'rear camera': 'Rear View Camera',
};
function cleanType(raw) {
  const k = String(raw || '').trim().toLowerCase();
  if (TYPE_MAP[k]) return TYPE_MAP[k];
  const m = k.match(/^(led boards?|led pcb boards?|set of led modules)\s*(1set=\d+pcs)?$/i);
  if (m) {
    const base = /set of/.test(k) ? 'LED Module Set' : 'LED Board Set';
    return m[2] ? `${base} (${m[2].replace(/1set=/i, '').toUpperCase().replace('PCS', ' pcs')})` : base;
  }
  return String(raw || 'Part').trim().split(/\s+/).map((w) => ACR[w.toLowerCase()] || (/^[A-Z0-9()]+$/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ');
}
const stripYears = (s) => String(s || '').replace(/\b(19|20)\d{2}\s*(-|to)\s*(19|20)\d{2}\b/g, '').replace(/\b(19|20)\d{2}\s*(after|onward|onwards|\+)\b/gi, '').replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
const isJunkModel = (s) => !s || /^(white|yellow|blue|red|black)?\s*colou?r$/i.test(s) || /^(hid use for all|high quality|for all.*)$/i.test(s);
const SIDE_RE = /(\bleft\b|\bright\b|[-\s](?:L|R)$)/ig;
function modelText(p) {
  let m = stripYears(p.models_raw).replace(/\bafter\b/ig, '').replace(/\s+/g, ' ').trim();
  if (isJunkModel(m) || /^[-\s]*$/.test(m)) m = '';
  return m;
}
function codesText(p) {
  let u = String(p.used_for_raw || '').replace(SIDE_RE, ' ').replace(/\s+/g, ' ').trim();
  u = u.replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ');
  if (u.length > 46) { const bits = u.split(/[/ ]+/).filter(Boolean); u = bits.slice(0, 4).join('/') + ' and others'; }
  return u;
}
function yearsText(p) {
  if (p.year_from && p.year_to) return p.year_from === p.year_to ? `${p.year_from}` : `${p.year_from}-${p.year_to}`;
  if (p.year_from) return `${p.year_from} onward`;
  return '';
}
function displayTitle(p) {
  const type = cleanType(p.title_raw);
  const brand = ['Universal', 'Other / multi-brand'].includes(p.brand) ? '' : p.brand;
  const mt = modelText(p);
  const ct = codesText(p);
  let veh = [brand, mt, ct].filter(Boolean).join(' ');
  if (mt && ct && ct.toLowerCase().includes(mt.toLowerCase())) veh = [brand, ct].filter(Boolean).join(' ');
  if (p.brand === 'Universal') veh = ['Universal', ct || mt].filter(Boolean).join(' ');
  const yr = yearsText(p);
  let t = veh ? `${type}, ${veh}` : type;
  if (yr) t += ` (${yr})`;
  if (p.side === 'left') t += ', Left';
  if (p.side === 'right') t += ', Right';
  return t.replace(/\s+/g, ' ').trim();
}

// ---------- vehicles ----------
const vehicles = { generated_at: new Date().toISOString(), notes: 'Public generation codes/years only; empty gens = not mapped. Fitment from supplier listings is never verified.', makes: [] };
for (const mk of seed) {
  const make = { name: mk.make, slug: slugify(mk.make), country: mk.country, models: [] };
  for (const md of mk.models) {
    const model = {
      name: md.name, slug: slugify(md.name),
      tokens: [...new Set([...(md.tokens || []), ...[...tokens(md.name)].filter((t) => t.length >= 2)].map((t) => t.toUpperCase()))],
      generations: md.gens.map((g) => ({ code: g.code, slug: slugify(g.code), name: `${md.name} ${g.code}`, year_from: g.from, year_to: g.to, chassis_codes: g.codes, variants: g.variants || [] })),
    };
    make.models.push(model);
  }
  vehicles.makes.push(make);
}
const makeByBrand = new Map(vehicles.makes.map((m) => [m.name.toLowerCase(), m]));

// ---------- load products ----------
const raw = JSON.parse(fs.readFileSync(IN, 'utf8'));
const rows = Array.isArray(raw) ? raw : raw.products;
const overlap = (a1, a2, b1, b2) => { const A1 = a1 ?? -Infinity, A2 = a2 ?? Infinity, B1 = b1 ?? -Infinity, B2 = b2 ?? Infinity; return A1 <= B2 && B1 <= A2; };
const GENERIC_TOK = new Set(['A', 'E', 'S', 'C', 'L', 'R', 'GT', 'LCI', 'NEW', 'OLD', 'LOW', 'HIGH', 'VERSION', 'LED', 'SERIES', 'CLASS', 'MODEL', 'SPORT', 'RANGE', 'ROVER', 'LAND', 'GRAND', 'CROSS', 'EV', 'V', 'X', 'Z']);

function fitsFor(p) {
  const make = makeByBrand.get(String(p.brand).toLowerCase());
  if (!make) return [];
  const t = tokens(`${p.used_for_raw} ${p.models_raw} ${p.title_raw}`);
  const out = [];
  for (const model of make.models) {
    let strongAny = false;
    for (const g of model.generations) {
      if (g.chassis_codes.some((c) => t.has(c.toUpperCase()))) { out.push({ make: make.slug, model: model.slug, gen: g.slug, level: 'chassis' }); strongAny = true; }
    }
    if (strongAny) continue;
    const modelHit = model.tokens.some((x) => !GENERIC_TOK.has(x) && x.length >= 2 && t.has(x) && !/^\d+$/.test(x));
    if (!modelHit) continue;
    if (!model.generations.length) { out.push({ make: make.slug, model: model.slug, gen: null, level: 'model' }); continue; }
    for (const g of model.generations) {
      if (p.year_from || p.year_to ? overlap(p.year_from, p.year_to, g.year_from, g.year_to) : true) out.push({ make: make.slug, model: model.slug, gen: g.slug, level: 'model' });
    }
  }
  return out;
}

const CAT_LABEL = {
  'headlights/led-modules-boards': 'LED Modules & Boards', 'headlights/drl-angel-eyes': 'DRL / Angel Eyes', 'headlights/turn-signal-modules': 'Turn Signal Modules',
  'electronic-modules/control-modules': 'Control Modules', 'headlights/ballasts-igniters': 'Ballasts & Igniters', 'electronic-modules/cameras-adas': 'Cameras & ADAS',
  'headlights/wiring-harnesses': 'Wiring Harnesses', 'headlights/internal-components': 'Headlight Internal Components', 'electronic-modules/parking-sensors': 'Parking Sensors / PDC',
  'headlights/complete-assemblies': 'Complete Headlight Assemblies', 'tail-lamps/led-driver-boards': 'Tail Lamp Driver Boards',
};

const used = new Set();
const products = rows.map((p) => {
  const title = displayTitle(p);
  const oems = (p.oem_numbers || []).filter(Boolean);
  const fits = fitsFor(p);
  let base = slugify(title); let slug = base;
  if (used.has(slug)) slug = `${base}-${slugify(oems[0] || p.id)}`.slice(0, 110);
  let n = 2; while (used.has(slug)) slug = `${base}-${slugify(p.id)}-${n++}`;
  used.add(slug);
  const pairKey = [p.brand, p.category, cleanType(p.title_raw), slugify(stripYears(p.models_raw)), slugify(String(p.used_for_raw || '').replace(SIDE_RE, ' ')), p.year_from, p.year_to].join('|');
  const cat = String(p.category || '').split('/');
  const yr = yearsText(p);
  const oemTxt = oems.length ? ` OEM reference ${oems.slice(0, 2).join(', ')}.` : '';
  const seoTitle = (title.length > 58 ? title.slice(0, 55).replace(/[\s,(]+\S*$/, '') + '...' : title);
  return {
    sku: p.id, slug, title, title_raw: p.title_raw, part_type: cleanType(p.title_raw),
    category: p.category, category_slug: cat[cat.length - 1], category_group: cat[0], category_label: CAT_LABEL[p.category] || p.category,
    brand: p.brand, brand_slug: slugify(p.brand), model_text: modelText(p), chassis_text: codesText(p), models_raw: p.models_raw, used_for_raw: p.used_for_raw,
    year_from: p.year_from ?? null, year_to: p.year_to ?? null, years_text: yr, side: p.side || 'n/a',
    oem_numbers: oems, oem_norm: oems.map((o) => o.toUpperCase().replace(/[^A-Z0-9]/g, '')), supplier_note: p.supplier_note || '', supplier_ref: p.supplier_ref, supplier_section: p.supplier_section,
    image: p.image || null, image_px: p.image_px || null,
    vehicle_tokens: [...tokens(`${p.used_for_raw} ${p.models_raw}`)].filter((x) => x.length >= 2).slice(0, 40),
    fits, pair_key: pairKey, pair_sku: null,
    fitment_status: 'supplier-listed', price_inr: p.price_inr ?? null, condition: p.condition || 'to-be-confirmed-with-supplier', stock: p.stock || 'on-request',
    seo: { title: `${seoTitle} | ${SITE}`, description: `${title}. Supplier-listed fitment, confirm before ordering.${oemTxt} Price on request. Ships from China, prepaid orders only.`.slice(0, 300) },
  };
});

// left/right pairing
const groups = new Map();
for (const p of products) { if (p.side === 'left' || p.side === 'right') { if (!groups.has(p.pair_key)) groups.set(p.pair_key, { left: [], right: [] }); groups.get(p.pair_key)[p.side].push(p); } }
let pairs = 0;
for (const g of groups.values()) {
  while (g.left.length && g.right.length) { const l = g.left.shift(), r = g.right.shift(); l.pair_sku = r.sku; r.pair_sku = l.sku; pairs++; }
}

// counts into vehicle tree
const cnt = {};
for (const p of products) for (const f of p.fits) { for (const k of [`${f.make}`, `${f.make}/${f.model}`, f.gen ? `${f.make}/${f.model}/${f.gen}` : null]) if (k) cnt[k] = (cnt[k] || 0) + 1; }
for (const m of vehicles.makes) { m.product_count = cnt[m.slug] || 0; for (const md of m.models) { md.product_count = cnt[`${m.slug}/${md.slug}`] || 0; for (const g of md.generations) g.product_count = cnt[`${m.slug}/${md.slug}/${g.slug}`] || 0; } }

fs.writeFileSync(path.join(ROOT, 'catalog/data/products.json'), JSON.stringify({ generated_at: new Date().toISOString(), site_name: SITE, count: products.length, products }));
fs.writeFileSync(path.join(ROOT, 'catalog/data/vehicles.json'), JSON.stringify(vehicles, null, 1));
const unmatched = products.filter((p) => !p.fits.length && !['Universal', 'Other / multi-brand'].includes(p.brand)).length;
console.log(`products=${products.length} unique_slugs=${used.size} pairs=${pairs} with_fits=${products.filter((p) => p.fits.length).length} brand_without_fits=${unmatched}`);
