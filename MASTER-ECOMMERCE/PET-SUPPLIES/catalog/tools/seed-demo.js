#!/usr/bin/env node
'use strict';
/* Re-runnable DEMO catalogue generator.
 * Writes catalog/data/{products,categories,inventory,bundles,coupons}.json and placeholder SVGs to assets/img/products/.
 * Everything here is demonstration data: generic names, "Demo Brand X" brands, placeholder specs, NOT real products.
 * Usage: node catalog/tools/seed-demo.js */
const fs = require('node:fs');
const path = require('node:path');
const { tree, flatten } = require('../categories');
const { render } = require('./placeholders');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'catalog', 'data');
const IMG = path.join(ROOT, 'assets', 'img', 'products');
fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(IMG, { recursive: true });
for (const f of fs.readdirSync(IMG)) if (f.endsWith('.svg')) fs.unlinkSync(path.join(IMG, f));

const BRANDS = { A: 'Demo Brand A', B: 'Demo Brand B', C: 'Demo Brand C', D: 'Demo Brand D', E: 'Demo Brand E', F: 'Demo Brand F' };
const { flat } = flatten();
const slugify = (s) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// variants helpers -> arrays of {options, mrp, price}
const one = (mrp, price = mrp, label = 'Standard') => [{ options: { Option: label }, mrp, price }];
const vs = (name, rows) => rows.map(([val, mrp, price = mrp]) => ({ options: { [name]: val }, mrp, price }));
const vs2 = (n1, n2, rows, vals2) => rows.flatMap(([v1, mrp, price = mrp]) => vals2.map((v2) => ({ options: { [n1]: v1, [n2]: v2 }, mrp, price })));
const COL3 = ['Forest', 'Oat', 'Terracotta'];

const defs = [];
const P = (o) => defs.push(o);

// ---- DOG FOOD
P({ t: 'Chicken & Rice Adult Dry Dog Food', c: 'dog-dry-food', pet: ['dog'], b: 'A', ty: 'bag', col: 'forest', v: vs('Pack', [['1.5 kg', 599, 549], ['3 kg', 1099, 989], ['10 kg', 2899, 2549]]), age: ['adult'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [5, 40], food: 'dry', feat: true, key: 'chicken and rice' });
P({ t: 'Small Breed Adult Dry Dog Food', c: 'dog-dry-food', pet: ['dog'], b: 'B', ty: 'bag', col: 'sage', v: vs('Pack', [['1 kg', 449, 399], ['3 kg', 1199, 1079]]), age: ['adult'], size: ['small'], breed: ['Small breeds'], wt: [2, 10], food: 'dry', key: 'small-kibble chicken' });
P({ t: 'Large Breed Adult Dry Dog Food', c: 'dog-dry-food', pet: ['dog'], b: 'A', ty: 'bag', col: 'tan', v: vs('Pack', [['3 kg', 1149, 1034], ['12 kg', 3899, 3509]]), age: ['adult'], size: ['large'], breed: ['Large breeds'], wt: [25, 60], food: 'dry', key: 'larger-kibble chicken' });
P({ t: 'Lamb & Oats Adult Dry Dog Food', c: 'dog-dry-food', pet: ['dog'], b: 'C', ty: 'bag', col: 'rose', v: vs('Pack', [['3 kg', 1249], ['10 kg', 3199, 2879]]), age: ['adult'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [5, 40], food: 'dry', key: 'lamb and oats' });
P({ t: 'Chicken Chunks in Gravy Wet Dog Food', c: 'dog-wet-food', pet: ['dog'], b: 'B', ty: 'pouch', col: 'orange', v: vs('Pack', [['100 g x 6 pouches', 540, 486], ['100 g x 12 pouches', 1020, 918]]), age: ['adult'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [3, 60], food: 'wet', key: 'chicken chunks in gravy', packG: 600 });
P({ t: 'Lamb & Vegetable Pate Wet Dog Food Tray', c: 'dog-wet-food', pet: ['dog'], b: 'C', ty: 'can', col: 'peach', v: vs('Pack', [['150 g x 4 trays', 480, 432], ['150 g x 8 trays', 920, 829]]), age: ['adult'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [3, 60], food: 'wet', key: 'lamb and vegetable pate', packG: 600 });
P({ t: 'Puppy Dry Food Chicken & Milk', c: 'puppy-food', pet: ['dog'], b: 'A', ty: 'bag', col: 'peach', v: vs('Pack', [['1.5 kg', 699, 629], ['3 kg', 1249, 1124]]), age: ['puppy'], size: ['small', 'medium'], breed: ['All breeds'], wt: [1, 25], food: 'dry', feat: true, isNew: true, key: 'chicken and milk puppy' });
P({ t: 'Large Breed Puppy Dry Food', c: 'puppy-food', pet: ['dog'], b: 'B', ty: 'bag', col: 'tan', v: vs('Pack', [['3 kg', 1399, 1259], ['10 kg', 3499, 3149]]), age: ['puppy'], size: ['large'], breed: ['Large breeds'], wt: [5, 40], food: 'dry', key: 'large-breed puppy' });
P({ t: 'Senior 7+ Dry Dog Food', c: 'senior-dog-food', pet: ['dog'], b: 'C', ty: 'bag', col: 'slate', v: vs('Pack', [['3 kg', 1299, 1169], ['10 kg', 3399, 3059]]), age: ['senior'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [5, 50], food: 'dry', key: 'senior recipe' });
P({ t: 'Grain-Free Salmon & Sweet Potato Dry Dog Food', c: 'grain-free-dog-food', pet: ['dog'], b: 'D', ty: 'bag', col: 'sage', v: vs('Pack', [['2 kg', 1499, 1349], ['6 kg', 3799, 3419]]), age: ['adult'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [5, 50], food: 'dry', feat: true, isNew: true, key: 'grain-free salmon and sweet potato' });
P({ t: 'Demo Veterinary Renal Diet (prescription-only listing)', c: 'vet-diet-dog', pet: ['dog'], b: 'E', ty: 'bag', col: 'slate', v: [], age: ['adult'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [5, 50], food: 'dry', rx: true, key: 'veterinary diet' });
P({ t: 'Chicken Jerky Strips Dog Treats', c: 'dog-treats', pet: ['dog'], b: 'B', ty: 'pouch', col: 'orange', v: vs('Pack', [['100 g', 249, 224], ['250 g', 549, 494]]), age: ['adult', 'puppy'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [3, 60], food: 'treat', key: 'chicken jerky treats' });
P({ t: 'Textured Chew Sticks for Dogs', c: 'dog-treats', pet: ['dog'], b: 'D', ty: 'jar', col: 'sage', v: vs('Pack', [['Pack of 7', 349, 314], ['Pack of 28', 1099, 989]]), age: ['adult'], size: ['medium', 'large'], breed: ['All breeds'], wt: [10, 60], food: 'treat', key: 'textured chew sticks' });
P({ t: 'Peanut Butter Biscuit Dog Treats', c: 'dog-treats', pet: ['dog'], b: 'C', ty: 'jar', col: 'tan', v: vs('Pack', [['200 g', 299, 269], ['500 g', 649, 584]]), age: ['adult', 'puppy'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [3, 60], food: 'treat', key: 'peanut butter biscuits' });
// ---- CAT FOOD
P({ t: 'Chicken & Rice Adult Dry Cat Food', c: 'cat-dry-food', pet: ['cat'], b: 'A', ty: 'bag', col: 'forest', v: vs('Pack', [['400 g', 299, 269], ['1.2 kg', 749, 674], ['3 kg', 1599, 1439]]), age: ['adult'], breed: ['All breeds'], wt: [2, 8], food: 'dry', pref: 'Chicken', feat: true, key: 'chicken and rice' });
P({ t: 'Ocean Fish Adult Dry Cat Food', c: 'cat-dry-food', pet: ['cat'], b: 'B', ty: 'bag', col: 'slate', v: vs('Pack', [['1.2 kg', 799, 719], ['3 kg', 1699, 1529]]), age: ['adult'], breed: ['All breeds'], wt: [2, 8], food: 'dry', pref: 'Fish', key: 'ocean fish' });
P({ t: 'Indoor Adult Dry Cat Food', c: 'cat-dry-food', pet: ['cat'], b: 'C', ty: 'bag', col: 'sage', v: vs('Pack', [['1.2 kg', 849], ['3 kg', 1799, 1619]]), age: ['adult'], breed: ['All breeds'], wt: [2, 8], food: 'dry', pref: 'Chicken', key: 'indoor chicken' });
P({ t: 'Kitten Dry Food Chicken & Milk', c: 'kitten-food', pet: ['cat'], b: 'A', ty: 'bag', col: 'peach', v: vs('Pack', [['400 g', 329, 296], ['1.2 kg', 849, 764]]), age: ['kitten'], breed: ['All breeds'], wt: [1, 4], food: 'dry', pref: 'Chicken', isNew: true, key: 'kitten chicken and milk' });
P({ t: 'Tuna in Jelly Wet Cat Food Pouches', c: 'cat-wet-food', pet: ['cat'], b: 'B', ty: 'pouch', col: 'slate', v: vs('Pack', [['70 g x 6 pouches', 330, 297], ['70 g x 12 pouches', 640, 576]]), age: ['adult'], breed: ['All breeds'], wt: [2, 8], food: 'wet', pref: 'Fish', key: 'tuna in jelly', packG: 420 });
P({ t: 'Chicken Pate Wet Cat Food Tray', c: 'cat-wet-food', pet: ['cat'], b: 'C', ty: 'can', col: 'orange', v: vs('Pack', [['85 g x 6 trays', 390, 351], ['85 g x 12 trays', 750, 675]]), age: ['adult'], breed: ['All breeds'], wt: [2, 8], food: 'wet', pref: 'Chicken', key: 'chicken pate', packG: 510 });
P({ t: 'Senior 7+ Dry Cat Food', c: 'senior-cat-food', pet: ['cat'], b: 'C', ty: 'bag', col: 'tan', v: vs('Pack', [['1.2 kg', 899, 809], ['3 kg', 1899, 1709]]), age: ['senior'], breed: ['All breeds'], wt: [2, 8], food: 'dry', pref: 'Chicken', key: 'senior recipe' });
P({ t: 'Grain-Free Chicken & Turkey Dry Cat Food', c: 'grain-free-cat-food', pet: ['cat'], b: 'D', ty: 'bag', col: 'forest', v: vs('Pack', [['1.2 kg', 999, 899], ['3 kg', 2099, 1889]]), age: ['adult'], breed: ['All breeds'], wt: [2, 8], food: 'dry', pref: 'Chicken', key: 'grain-free chicken and turkey' });
P({ t: 'Demo Veterinary Urinary Diet (prescription-only listing)', c: 'vet-diet-cat', pet: ['cat'], b: 'E', ty: 'bag', col: 'slate', v: [], age: ['adult'], breed: ['All breeds'], wt: [2, 8], food: 'dry', pref: 'Chicken', rx: true, key: 'veterinary diet' });
P({ t: 'Crunchy Chicken Cat Treats', c: 'cat-treats', pet: ['cat'], b: 'B', ty: 'jar', col: 'orange', v: vs('Pack', [['60 g', 149, 134], ['Value pack of 3', 419, 377]]), age: ['adult', 'kitten'], breed: ['All breeds'], wt: [1, 8], food: 'treat', pref: 'Chicken', key: 'crunchy chicken treats' });
P({ t: 'Lickable Tuna Cat Treat Tubes', c: 'cat-treats', pet: ['cat'], b: 'D', ty: 'pouch', col: 'slate', v: vs('Pack', [['Pack of 4', 199, 179], ['Pack of 12', 549, 494]]), age: ['adult', 'kitten'], breed: ['All breeds'], wt: [1, 8], food: 'treat', pref: 'Fish', key: 'lickable tuna treats' });
// ---- COLLARS & WALKING
P({ t: 'Padded Nylon Dog Collar', c: 'dog-collars', pet: ['dog'], b: 'A', ty: 'collar', col: 'forest', v: vs2('Size', 'Colour', [['S (25-35 cm)', 349, 299], ['M (33-45 cm)', 399, 349], ['L (42-58 cm)', 449, 399]], COL3), age: ['adult', 'puppy', 'senior'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [3, 40], feat: true, mat: 'Nylon webbing, soft padded lining, powder-coated metal buckle' });
P({ t: 'Full-Grain Leather Dog Collar', c: 'dog-collars', pet: ['dog'], b: 'D', ty: 'collar', col: 'tan', v: vs('Size', [['M (35-45 cm)', 899, 799], ['L (43-55 cm)', 999, 899], ['XL (52-68 cm)', 1099, 999]]), age: ['adult', 'senior'], size: ['medium', 'large'], breed: ['Medium breeds', 'Large breeds'], wt: [12, 50], mat: 'Leather, stainless steel hardware' });
P({ t: 'No-Pull Front-Clip Dog Harness', c: 'dog-harnesses', pet: ['dog'], b: 'A', ty: 'harness', col: 'orange', v: vs('Size', [['S (chest 45-60 cm)', 799, 699], ['M (chest 58-75 cm)', 899, 799], ['L (chest 70-90 cm)', 999, 899], ['XL (chest 85-105 cm)', 1099, 999]]), age: ['adult', 'senior'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [5, 45], feat: true, mat: 'Padded mesh, reflective piping, nylon webbing' });
P({ t: 'Breathable Mesh Step-In Dog Harness', c: 'dog-harnesses', pet: ['dog'], b: 'B', ty: 'harness', col: 'sage', v: vs('Size', [['XS (chest 32-40 cm)', 449, 399], ['S (chest 38-50 cm)', 499, 449], ['M (chest 48-62 cm)', 549, 499]]), age: ['puppy', 'adult'], size: ['small'], breed: ['Small breeds', 'Flat-faced breeds'], wt: [2, 12], isNew: true, mat: 'Air mesh, nylon webbing, plastic buckles' });
P({ t: 'Reflective Nylon Dog Leash 1.2 m', c: 'dog-leashes', pet: ['dog'], b: 'A', ty: 'leash', col: 'forest', v: vs('Colour', [['Forest', 449, 399], ['Terracotta', 449, 399]]), age: ['adult', 'puppy', 'senior'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [3, 45], mat: 'Reflective-stitched nylon, swivel clip' });
P({ t: 'Retractable Dog Leash 5 m', c: 'dog-leashes', pet: ['dog'], b: 'C', ty: 'leash', col: 'slate', v: vs('Rated for', [['Dogs up to 15 kg', 799, 719], ['Dogs up to 30 kg', 999, 899]]), age: ['adult'], size: ['small', 'medium'], breed: ['All breeds'], wt: [3, 30], mat: 'ABS housing, nylon tape' });
P({ t: 'Brass ID Tag - Bone Shape (blank)', c: 'id-tags', pet: ['dog', 'cat'], b: 'D', ty: 'tag', col: 'mustard', v: vs('Size', [['Small', 199, 179], ['Large', 249, 224]]), age: ['adult', 'puppy', 'kitten', 'senior'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [1, 60], mat: 'Solid brass. Blank tag - engraving not offered in the demo store' });
P({ t: 'Waste Bag Dispenser with Roll Set', c: 'waste-management', pet: ['dog'], b: 'B', ty: 'dispenser', col: 'orange', v: vs('Set', [['Dispenser + 4 rolls', 299, 269], ['Refill 20 rolls', 349, 314]]), age: ['adult', 'puppy', 'senior'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [1, 100], mat: 'Dispenser: ABS plastic. Bags: polyethylene' });
// ---- CAT ACCESSORIES
P({ t: 'Breakaway Cat Collar with Bell', c: 'cat-collars-harnesses', pet: ['cat'], b: 'A', ty: 'collar', col: 'peach', v: vs('Colour', [['Forest', 199, 179], ['Terracotta', 199, 179], ['Sage', 199, 179]]), age: ['adult', 'kitten'], breed: ['All breeds'], wt: [2, 8], mat: 'Soft nylon with safety-release clasp' });
P({ t: 'Cat Harness & Leash Set', c: 'cat-collars-harnesses', pet: ['cat'], b: 'B', ty: 'harness', col: 'sage', v: vs('Size', [['S (chest 28-36 cm)', 599, 539], ['M (chest 34-44 cm)', 649, 584]]), age: ['adult'], breed: ['All breeds'], wt: [2, 8], mat: 'Breathable mesh, nylon leash' });
P({ t: 'Sisal Scratching Post 60 cm', c: 'scratchers-posts', pet: ['cat'], b: 'C', ty: 'scratcher', col: 'tan', v: one(1199, 1079, '60 cm'), age: ['adult', 'kitten', 'senior'], breed: ['All breeds'], wt: [1, 10], mat: 'Natural sisal rope, engineered-wood base' });
P({ t: 'Cardboard Scratcher Lounge', c: 'scratchers-posts', pet: ['cat'], b: 'D', ty: 'mat', col: 'tan', v: vs('Pack', [['Single', 499, 449], ['Pack of 2', 899, 809]]), age: ['adult', 'kitten'], breed: ['All breeds'], wt: [1, 8], mat: 'Recycled corrugated cardboard' });
P({ t: 'Clumping Bentonite Cat Litter', c: 'litter', pet: ['cat'], b: 'A', ty: 'bag', col: 'tan', v: vs('Pack', [['5 kg', 449, 404], ['10 kg', 849, 764]]), age: ['adult', 'kitten', 'senior'], breed: ['All breeds'], wt: [1, 10], litter: 'Clumping', mat: 'Natural bentonite clay', key: 'litter' });
P({ t: 'Plant-Based Cat Litter', c: 'litter', pet: ['cat'], b: 'D', ty: 'bag', col: 'sage', v: vs('Pack', [['2.5 kg', 549, 494], ['6 kg', 1099, 989]]), age: ['adult', 'kitten', 'senior'], breed: ['All breeds'], wt: [1, 10], litter: 'Plant-based', isNew: true, mat: 'Plant fibre pellets', key: 'litter' });
P({ t: 'Hooded Cat Litter Box', c: 'litter-boxes', pet: ['cat'], b: 'C', ty: 'litterbox', col: 'slate', v: vs('Size', [['Medium', 1299, 1169], ['Large', 1599, 1439]]), age: ['adult', 'kitten', 'senior'], breed: ['All breeds'], wt: [1, 10], mat: 'Polypropylene with replaceable carbon filter slot' });
P({ t: 'Litter Scoop with Deep Slots', c: 'litter-boxes', pet: ['cat'], b: 'B', ty: 'scoop', col: 'orange', v: one(149, 134), age: ['adult', 'kitten', 'senior'], breed: ['All breeds'], wt: [1, 10], mat: 'Reinforced polypropylene' });
// ---- BEDS & FURNITURE
P({ t: 'High-Density Foam Dog Bed', c: 'dog-beds', pet: ['dog'], b: 'A', ty: 'bed', col: 'forest', v: vs2('Size', 'Cover', [['S (60 x 45 cm)', 1499, 1349], ['M (80 x 60 cm)', 1999, 1799], ['L (100 x 70 cm)', 2599, 2339]], ['Forest', 'Oat']), age: ['adult', 'senior', 'puppy'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [3, 45], feat: true, mat: 'High-density foam base, removable washable cover' });
P({ t: 'Plush Donut Cuddler Bed', c: 'dog-beds', pet: ['dog', 'cat'], b: 'B', ty: 'bed', col: 'peach', v: vs('Size', [['S (55 cm)', 1099, 989], ['M (70 cm)', 1399, 1259]]), age: ['adult', 'puppy', 'kitten'], size: ['small'], breed: ['Small breeds'], wt: [1, 12], mat: 'Plush polyester fill, non-slip base' });
P({ t: 'Cooling Gel Mat', c: 'mats-blankets', pet: ['dog', 'cat'], b: 'C', ty: 'mat', col: 'slate', v: vs('Size', [['M (50 x 65 cm)', 899, 809], ['L (65 x 90 cm)', 1199, 1079]]), age: ['adult', 'senior'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [3, 45], mat: 'Pressure-activated gel layer, fabric top' });
P({ t: 'Soft Fleece Pet Blanket', c: 'mats-blankets', pet: ['dog', 'cat'], b: 'D', ty: 'mat', col: 'rose', v: vs('Size', [['S (60 x 80 cm)', 399, 359], ['M (80 x 100 cm)', 549, 494], ['L (100 x 140 cm)', 749, 674]]), age: ['adult', 'puppy', 'kitten', 'senior'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [1, 50], mat: 'Double-sided polyester fleece, machine washable' });
P({ t: 'Felt Cat Cave Bed', c: 'cat-beds', pet: ['cat'], b: 'A', ty: 'cave', col: 'sage', v: vs('Colour', [['Sage', 1299, 1169], ['Peach', 1299, 1169]]), age: ['adult', 'kitten'], breed: ['All breeds'], wt: [1, 7], isNew: true, mat: 'Wool-blend felt' });
P({ t: '3-Tier Cat Tree with Scratching Posts', c: 'cat-trees-perches', pet: ['cat'], b: 'C', ty: 'tree', col: 'tan', v: one(3499, 2999, '115 cm'), age: ['adult', 'kitten'], breed: ['All breeds'], wt: [1, 8], feat: true, mat: 'Engineered wood, sisal posts, plush platforms', packG: 14000 });
P({ t: 'Window Perch Hammock for Cats', c: 'cat-trees-perches', pet: ['cat'], b: 'B', ty: 'perch', col: 'slate', v: one(1299, 1169, 'Standard'), age: ['adult', 'kitten'], breed: ['All breeds'], wt: [1, 7], mat: 'Oxford fabric, suction mounts (rated load stated on pack)' });
P({ t: 'Foldable Wire Dog Crate', c: 'crates-pens', pet: ['dog'], b: 'D', ty: 'crate', col: 'slate', v: vs('Size', [['S (61 cm)', 2999, 2699], ['M (76 cm)', 3799, 3419], ['L (91 cm)', 4799, 4319]]), age: ['adult', 'puppy'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [3, 40], mat: 'Powder-coated steel wire, plastic tray', packG: 9000 });
// ---- TOYS
P({ t: 'Natural Rubber Chew Ball', c: 'dog-chew-toys', pet: ['dog'], b: 'A', ty: 'ball', col: 'orange', v: vs('Size', [['S (6 cm)', 299, 269], ['L (9 cm)', 449, 404]]), age: ['adult', 'puppy'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [3, 50], feat: true, mat: 'Natural rubber' });
P({ t: 'Knotted Cotton Rope Tug', c: 'dog-fetch-tug', pet: ['dog'], b: 'B', ty: 'rope', col: 'tan', v: vs('Size', [['M (35 cm)', 249, 224], ['L (50 cm)', 349, 314]]), age: ['adult', 'puppy'], size: ['medium', 'large'], breed: ['All breeds'], wt: [8, 50], mat: 'Braided cotton' });
P({ t: 'Treat-Dispensing Puzzle Toy', c: 'dog-interactive-toys', pet: ['dog'], b: 'C', ty: 'puzzle', col: 'forest', v: vs('Size', [['Medium', 599, 539], ['Large', 799, 719]]), age: ['adult', 'senior'], size: ['medium', 'large'], breed: ['All breeds'], wt: [8, 50], isNew: true, mat: 'Food-grade TPR and ABS' });
P({ t: 'Flexible Fetch Disc', c: 'dog-fetch-tug', pet: ['dog'], b: 'D', ty: 'frisbee', col: 'peach', v: one(249, 224, 'Standard'), age: ['adult'], size: ['medium', 'large'], breed: ['All breeds'], wt: [8, 50], mat: 'Soft TPR' });
P({ t: 'Feather Wand Cat Teaser', c: 'cat-wand-teasers', pet: ['cat'], b: 'A', ty: 'wand', col: 'orange', v: one(199, 179, 'Standard'), age: ['adult', 'kitten'], breed: ['All breeds'], wt: [1, 8], feat: true, mat: 'Wooden handle, feather and cord' });
P({ t: 'Catnip Mice Set of 4', c: 'cat-catnip-plush', pet: ['cat'], b: 'B', ty: 'mice', col: 'rose', v: one(249, 224, 'Set of 4'), age: ['adult', 'kitten'], breed: ['All breeds'], wt: [1, 8], mat: 'Cotton blend, dried catnip filling' });
P({ t: 'Crinkle Play Tunnel', c: 'cat-tunnels-interactive', pet: ['cat'], b: 'C', ty: 'tunnel', col: 'sage', v: one(699, 629, 'Standard'), age: ['adult', 'kitten'], breed: ['All breeds'], wt: [1, 8], mat: 'Crinkle polyester, steel-wire frame' });
P({ t: 'Interactive Rolling Ball Toy (USB rechargeable)', c: 'cat-tunnels-interactive', pet: ['cat'], b: 'D', ty: 'ball', col: 'forest', v: one(799, 719, 'Standard'), age: ['adult', 'kitten'], breed: ['All breeds'], wt: [1, 8], isNew: true, mat: 'ABS shell, silicone cover, rechargeable battery (USB cable included)' });
// ---- FEEDERS & DRINKING
P({ t: 'Stainless Steel Pet Bowl with Anti-Skid Base', c: 'bowls', pet: ['dog', 'cat'], b: 'A', ty: 'bowl', col: 'sage', v: vs('Size', [['S (350 ml)', 299, 269], ['M (700 ml)', 399, 359], ['L (1.4 L)', 549, 494]]), age: ['adult', 'puppy', 'kitten', 'senior'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [1, 60], mat: 'Food-grade stainless steel, rubber base' });
P({ t: 'Slow Feeder Bowl', c: 'slow-feeders', pet: ['dog', 'cat'], b: 'B', ty: 'slowbowl', col: 'orange', v: vs('Size', [['Small', 449, 404], ['Large', 649, 584]]), age: ['adult', 'senior'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [2, 50], mat: 'Food-grade BPA-free plastic' });
P({ t: 'Programmable Automatic Pet Feeder 4 L', c: 'automatic-pet-feeders', pet: ['dog', 'cat'], b: 'C', ty: 'feeder', col: 'forest', v: one(3999, 3499, '4 L'), age: ['adult', 'senior'], size: ['small', 'medium'], breed: ['All breeds'], wt: [2, 25], feat: true, isNew: true, mat: 'ABS body, stainless tray. Timer-based; mains adaptor + battery backup' });
P({ t: 'Pet Water Fountain 2 L', c: 'water-fountains', pet: ['dog', 'cat'], b: 'D', ty: 'fountain', col: 'slate', v: one(1999, 1799, '2 L'), age: ['adult', 'senior', 'kitten', 'puppy'], size: ['small', 'medium'], breed: ['All breeds'], wt: [1, 25], mat: 'BPA-free plastic, replaceable filter, quiet pump' });
P({ t: 'Airtight Food Storage Container', c: 'food-storage', pet: ['dog', 'cat'], b: 'A', ty: 'tub', col: 'tan', v: vs('Capacity', [['5 L (approx. 2 kg kibble)', 799, 719], ['10 L (approx. 4 kg kibble)', 1199, 1079]]), age: ['adult', 'puppy', 'kitten', 'senior'], breed: ['All breeds'], wt: [1, 100], mat: 'Food-safe polypropylene, silicone seal' });
// ---- GROOMING & HYGIENE
P({ t: 'Self-Cleaning Slicker Brush', c: 'brushes-combs', pet: ['dog', 'cat'], b: 'A', ty: 'brush', col: 'sage', v: vs('Size', [['Small', 449, 404], ['Large', 549, 494]]), age: ['adult', 'puppy', 'kitten', 'senior'], breed: ['Long-coat breeds', 'All breeds'], wt: [1, 60], mat: 'Stainless pins, ergonomic handle' });
P({ t: 'Dual-Row Grooming Comb', c: 'brushes-combs', pet: ['dog', 'cat'], b: 'B', ty: 'comb', col: 'orange', v: one(299, 269, 'Standard'), age: ['adult', 'puppy', 'kitten', 'senior'], breed: ['Long-coat breeds', 'All breeds'], wt: [1, 60], mat: 'Stainless steel teeth, wooden spine' });
P({ t: 'Oatmeal Coat Shampoo for Dogs', c: 'shampoo-conditioners', pet: ['dog'], b: 'C', ty: 'bottle', col: 'tan', v: vs('Size', [['250 ml', 349, 314], ['500 ml', 599, 539]]), age: ['adult', 'puppy'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [2, 60], key: 'shampoo', mat: 'Cleansing formula with oat extract. Not a medicated product' });
P({ t: 'Gentle Cat Shampoo', c: 'shampoo-conditioners', pet: ['cat'], b: 'D', ty: 'bottle', col: 'rose', v: one(399, 359, '200 ml'), age: ['adult'], breed: ['All breeds'], wt: [1, 8], key: 'shampoo', mat: 'Mild cleansing formula. Not a medicated product' });
P({ t: 'Nail Clipper with Safety Guard', c: 'nail-dental-care', pet: ['dog', 'cat'], b: 'A', ty: 'clipper', col: 'forest', v: vs('Size', [['Small / cats', 349, 314], ['Medium / large dogs', 399, 359]]), age: ['adult', 'puppy', 'kitten', 'senior'], breed: ['All breeds'], wt: [1, 60], mat: 'Stainless steel blades, rubber-grip handle' });
P({ t: 'Toothbrush & Toothpaste Set for Dogs', c: 'nail-dental-care', pet: ['dog'], b: 'B', ty: 'bottle', col: 'sage', v: one(449, 404, 'Set'), age: ['adult', 'senior'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [2, 60], key: 'dental hygiene set', mat: 'Dual-ended brush, pet-safe poultry-flavour paste' });
P({ t: 'Grooming Wipes, 100 Count', c: 'wipes-odour', pet: ['dog', 'cat'], b: 'C', ty: 'tub', col: 'peach', v: one(299, 269, '100 wipes'), age: ['adult', 'puppy', 'kitten', 'senior'], breed: ['All breeds'], wt: [1, 60], mat: 'Alcohol-free, fragrance-light cleansing wipes' });
P({ t: 'Reusable Pet Hair Roller', c: 'wipes-odour', pet: ['dog', 'cat'], b: 'D', ty: 'roller', col: 'slate', v: one(349, 314, 'Standard'), age: ['adult', 'puppy', 'kitten', 'senior'], breed: ['All breeds'], wt: [1, 60], mat: 'Self-cleaning roller with debris chamber' });
// ---- HEALTH & WELLNESS (OTC / supplement-type only)
P({ t: 'Multivitamin Soft Chews for Dogs', c: 'supplements', pet: ['dog'], b: 'A', ty: 'jar', col: 'orange', v: vs('Count', [['60 chews', 699, 629], ['120 chews', 1199, 1079]]), age: ['adult', 'senior'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [3, 60], food: 'supplement', key: 'multivitamin', mat: 'General wellness supplement. Not a substitute for a balanced diet or veterinary care' });
P({ t: 'Leave-in Coat Conditioning Spray', c: 'skin-coat-care', pet: ['dog', 'cat'], b: 'C', ty: 'bottle', col: 'mustard', v: one(399, 359, '200 ml'), age: ['adult', 'puppy', 'kitten', 'senior'], breed: ['Long-coat breeds', 'All breeds'], wt: [1, 60], key: 'coat spray', mat: 'Cosmetic coat conditioner. Not a medicated product' });
P({ t: 'Probiotic Powder Supplement for Dogs & Cats', c: 'supplements', pet: ['dog', 'cat'], b: 'D', ty: 'jar', col: 'sage', v: one(749, 674, '100 g'), age: ['adult', 'senior'], breed: ['All breeds'], wt: [1, 60], food: 'supplement', key: 'probiotic powder', mat: 'General wellness supplement. Not a substitute for veterinary care' });
P({ t: 'Demo Prescription Tick & Flea Treatment (prescription-only listing)', c: 'prescription-medicines', pet: ['dog'], b: 'E', ty: 'bottle', col: 'slate', v: [], age: ['adult'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [3, 60], rx: true, key: 'regulated veterinary medicine' });
// ---- TRAVEL & OUTDOOR
P({ t: 'Soft-Sided Pet Carrier', c: 'carriers', pet: ['dog', 'cat'], b: 'A', ty: 'carrier', col: 'forest', v: vs('Size', [['S (up to 5 kg)', 1999, 1799], ['M (up to 8 kg)', 2499, 2249]]), age: ['adult', 'puppy', 'kitten', 'senior'], size: ['small'], breed: ['Small breeds'], wt: [1, 8], mat: 'Water-resistant polyester, mesh panels, padded base' });
P({ t: 'Hard-Shell Cat Carrier', c: 'carriers', pet: ['cat'], b: 'B', ty: 'carrier', col: 'tan', v: one(1799, 1619, 'Standard'), age: ['adult', 'kitten', 'senior'], breed: ['All breeds'], wt: [1, 8], mat: 'Polypropylene shell, steel-wire door' });
P({ t: 'Collapsible Travel Bowl', c: 'travel-bowls-accessories', pet: ['dog', 'cat'], b: 'C', ty: 'bowl', col: 'orange', v: one(199, 179, '500 ml'), age: ['adult', 'puppy', 'kitten', 'senior'], breed: ['All breeds'], wt: [1, 60], mat: 'Food-grade silicone, carabiner clip' });
P({ t: 'Waterproof Car Seat Cover', c: 'car-travel', pet: ['dog'], b: 'D', ty: 'carseat', col: 'slate', v: one(1499, 1349, 'Standard'), age: ['adult', 'puppy', 'senior'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [3, 50], mat: 'Quilted waterproof polyester, non-slip backing' });
// ---- CLOTHING & LIFESTYLE
P({ t: 'Cable-Knit Dog Sweater', c: 'sweaters-coats', pet: ['dog'], b: 'A', ty: 'sweater', col: 'rose', v: vs('Size', [['XS (back 25 cm)', 599], ['S (back 32 cm)', 649, 584], ['M (back 40 cm)', 749, 674], ['L (back 50 cm)', 899, 809]]), age: ['adult', 'senior', 'puppy'], size: ['small', 'medium', 'large'], breed: ['Small breeds', 'Short-coat breeds'], wt: [2, 30], mat: 'Acrylic-cotton blend knit' });
P({ t: 'Waterproof Dog Raincoat', c: 'raincoats', pet: ['dog'], b: 'B', ty: 'raincoat', col: 'mustard', v: vs('Size', [['S (back 32 cm)', 799, 719], ['M (back 40 cm)', 899, 809], ['L (back 50 cm)', 999, 899]]), age: ['adult', 'senior'], size: ['small', 'medium', 'large'], breed: ['All breeds'], wt: [3, 35], mat: 'Waterproof polyester, reflective trim' });
P({ t: 'Cotton Bandana Set of 3', c: 'bandanas-accessories', pet: ['dog', 'cat'], b: 'C', ty: 'bandana', col: 'orange', v: vs('Size', [['S / M', 349, 314], ['L', 399, 359]]), age: ['adult', 'puppy', 'kitten', 'senior'], breed: ['All breeds'], wt: [1, 50], mat: '100% cotton, machine washable' });

// ---------------------------------------------------------------- generators
const FAQ = {
  food: (p) => [
    { q: 'How much should I feed my pet?', a: 'Follow the feeding guide on the pack as a starting point and adjust to your pet\'s age, activity and body condition. Your veterinarian can advise on exact amounts.' },
    { q: 'How should I store opened food?', a: 'Reseal the pack tightly or use an airtight container, keep it cool and dry, away from direct sunlight, and use within the period stated on the pack. Check the batch and expiry shown on the pack at delivery.' },
    { q: 'Can I switch my pet to this food straight away?', a: 'Introduce any new food gradually over about 7 to 10 days by mixing it with the current food. If your pet shows signs of digestive upset, contact your veterinarian.' },
  ],
  collar: () => [{ q: 'How do I pick the right size?', a: 'Measure around the neck (or chest for harnesses) with a soft tape and compare to the size chart. You should be able to slide two fingers between the strap and your pet.' }, { q: 'Can my pet wear it all the time?', a: 'Check the fit regularly, especially for growing pets, and remove wet gear to dry. Always supervise pets wearing new accessories.' }],
  bed: () => [{ q: 'What size should I choose?', a: 'Measure your pet from nose to base of tail while they are stretched out, then add roughly 15-20 cm. If between sizes, choose the larger one.' }, { q: 'Is the cover washable?', a: 'Check the care label on the product. Most covers in this range are designed to be machine washed on a gentle cycle.' }],
  toy: () => [{ q: 'Is this toy safe to leave with my pet?', a: 'No toy is indestructible. Supervise play, check toys regularly for damage and replace worn ones. Choose a size appropriate for your pet.' }],
  feeder: () => [{ q: 'How do I clean it?', a: 'Wash regularly with warm water and mild soap and dry thoroughly. Check the product care notes for any parts that are not dishwasher safe.' }],
  grooming: () => [{ q: 'How often should I groom my pet?', a: 'It depends on coat type and lifestyle. Short coats may need weekly brushing, long or double coats more often. A professional groomer can advise on routines.' }],
  health: () => [{ q: 'Is this a medicine?', a: 'No. Supplements and care products here are general wellness items and are not a substitute for veterinary care. Speak to your veterinarian before starting any supplement.' }],
  travel: () => [{ q: 'Is this approved for airline travel?', a: 'Airlines and railways have their own rules on carriers and pets. Check their current policy before you travel; this listing does not claim airline approval.' }],
  clothing: () => [{ q: 'How do I measure for clothing?', a: 'Measure from the base of the neck to the base of the tail (back length) and around the widest part of the chest, then compare to the size chart.' }],
  litter: () => [{ q: 'How often should I change the litter?', a: 'Scoop daily and top up as needed; do a full change and wash of the tray on a regular schedule following the pack guidance.' }],
  scratcher: () => [{ q: 'Where should I place it?', a: 'Cats like to scratch near where they sleep and in busy areas. Try placing it next to a favourite spot and keep it stable.' }],
};
const groupOf = (d) => (['food', 'treat'].includes(d.food) ? 'food' : d.food === 'supplement' ? 'health' : null)
  || ({ 'dog-collars': 'collar', 'dog-harnesses': 'collar', 'dog-leashes': 'collar', 'id-tags': 'collar', 'waste-management': 'collar', 'cat-collars-harnesses': 'collar', 'litter': 'litter', 'litter-boxes': 'litter', 'scratchers-posts': 'scratcher', 'dog-beds': 'bed', 'cat-beds': 'bed', 'mats-blankets': 'bed', 'cat-trees-perches': 'bed', 'crates-pens': 'bed', 'bowls': 'feeder', 'slow-feeders': 'feeder', 'automatic-pet-feeders': 'feeder', 'water-fountains': 'feeder', 'food-storage': 'feeder', 'brushes-combs': 'grooming', 'shampoo-conditioners': 'grooming', 'nail-dental-care': 'grooming', 'wipes-odour': 'grooming', 'skin-coat-care': 'health', 'supplements': 'health', 'prescription-medicines': 'health', 'carriers': 'travel', 'travel-bowls-accessories': 'travel', 'car-travel': 'travel', 'sweaters-coats': 'clothing', 'raincoats': 'clothing', 'bandanas-accessories': 'clothing' }[d.c])
  || 'toy';

const benefitsFor = (d) => {
  if (d.food === 'dry' || d.food === 'wet') return [`${d.key ? d.key[0].toUpperCase() + d.key.slice(1) : 'Complete'} recipe in a ${d.food} format`, `Designed for ${d.age.join(' / ')} ${d.pet.join(' & ')}s`, 'Feeding guide printed on pack', 'Batch and expiry shown on every pack'];
  if (d.food === 'treat') return ['Intended as an occasional treat, not a complete meal', 'Resealable or portion-friendly pack', 'Batch and expiry shown on pack'];
  if (d.food === 'supplement') return ['General wellness supplement format', 'Clear dosing guide on pack', 'Use alongside a balanced diet; not a replacement for veterinary care'];
  const m = d.mat ? [`Made from: ${d.mat}`] : [];
  return [...m, `Suits ${d.pet.join(' and ')}s - see size guide on this page`, 'Return-eligible if unused and in original packaging (see return policy)'];
};
const descFor = (d) => {
  const who = d.pet.join(' and ');
  if (d.food === 'dry' || d.food === 'wet') return `${d.t} for ${who}s: a ${d.key} recipe in ${d.food} form, made for ${d.age.join(' / ')} ${who}s. This is placeholder catalogue copy for a demonstration listing - replace with supplier-approved text and the exact pack label before selling.`;
  if (d.food === 'treat') return `${d.t}: an occasional treat for ${who}s (${d.key}). Treats should make up only a small part of the daily diet. Placeholder catalogue copy for a demonstration listing.`;
  if (d.rx) return `${d.t}. Regulated veterinary product shown for information only. It is not sold online without veterinary authorisation. Placeholder listing for demonstration.`;
  return `${d.t}: ${d.mat ? d.mat.toLowerCase() + '. ' : ''}Designed for ${who}s${d.size ? ' (' + d.size.join(', ') + ' sizes)' : ''}. Placeholder catalogue copy for a demonstration listing - replace with supplier-approved description and measurements.`;
};
const ingredientsFor = (d) => {
  if (d.rx) return '';
  if (d.food === 'dry') return `${d.key} (principal protein source), cereals or legumes, vegetable fibre, animal fat, minerals and vitamins. Demo placeholder - not a real label; replace with the declared composition from the supplier.`;
  if (d.food === 'wet') return `${d.key} with broth or gravy, vegetables, minerals and vitamins. Demo placeholder - not a real label.`;
  if (d.food === 'treat') return `${d.key} base, binders and natural flavour. Demo placeholder - not a real label.`;
  if (d.food === 'supplement') return 'Vitamins, minerals and carrier ingredients. Demo placeholder - not a real label.';
  return '';
};
const nutritionFor = (d) => {
  if (d.rx) return null;
  if (d.food === 'dry') return d.pet[0] === 'cat' ? { 'Crude protein (min)': '32 %', 'Crude fat (min)': '14 %', 'Crude fibre (max)': '3 %', 'Moisture (max)': '10 %', 'Ash (max)': '8 %' } : { 'Crude protein (min)': '24 %', 'Crude fat (min)': '12 %', 'Crude fibre (max)': '4 %', 'Moisture (max)': '10 %', 'Ash (max)': '8 %' };
  if (d.food === 'wet') return { 'Crude protein (min)': '8 %', 'Crude fat (min)': '4 %', 'Crude fibre (max)': '1 %', 'Moisture (max)': '80 %' };
  if (d.food === 'treat') return { 'Crude protein (min)': '18 %', 'Crude fat (min)': '8 %', 'Moisture (max)': '15 %' };
  return null;
};
const feedingFor = (d) => {
  if (d.food === 'dry' || d.food === 'wet') return 'Feed according to the guide on the pack, based on your pet\'s weight and age, split across meals. Always provide fresh drinking water. Demo placeholder text.';
  if (d.food === 'treat') return 'Offer as an occasional treat. Reduce the main meal portion accordingly. Demo placeholder text.';
  if (d.food === 'supplement') return 'Follow the dosing guide on the pack. Consult your veterinarian before starting any supplement. Demo placeholder text.';
  return '';
};

const products = []; const inventory = {}; let n = 0;
const bySlug = {};
defs.forEach((d, i) => {
  n++;
  const base = 'PH-' + String(n).padStart(3, '0');
  const slug = slugify(d.t).replace(/-prescription-only-listing$/, '-rx-listing');
  const cat = flat[d.c]; if (!cat) throw new Error('bad category ' + d.c);
  const variants = d.v.map((v, vi) => {
    const optVals = Object.values(v.options).join(' / ');
    return { sku: `${base}-${String(vi + 1).padStart(2, '0')}`, label: optVals, options: v.options, mrp: v.mrp, price: v.price, barcode: '' };
  });
  const seed = (i * 7 + 3);
  variants.forEach((v, vi) => {
    let available = 12 + ((seed * (vi + 2)) % 55); let thr = 8;
    if (i % 17 === 3 && vi === 0) available = 4;        // some low stock
    if (i % 23 === 5 && vi === variants.length - 1) available = 0; // some out of stock
    const food = ['dry', 'wet', 'treat', 'supplement'].includes(d.food);
    inventory[v.sku] = { available, reserved: 0, threshold: thr, location: `WH1-${String.fromCharCode(65 + (i % 6))}-${String(1 + (i % 12)).padStart(2, '0')}-${1 + (vi % 4)}`, batch: food ? `DEMO-B${String(100 + i)}` : '', expiry: food ? `${2027 + (i % 2)}-${String(1 + ((i * 5) % 12)).padStart(2, '0')}-28` : '', weightG: d.packG || (d.food ? 1500 : 400 + (i % 5) * 150) };
  });
  const images = [1, 2].map((k) => { const f = `${slug}-${k}.svg`; fs.writeFileSync(path.join(IMG, f), render(d.ty, { color: d.col, variant: k, label: d.t })); return { src: `/assets/img/products/${f}`, alt: `${d.t} - ${k === 1 ? 'front view' : 'detail view'} (development placeholder illustration)`, w: 800, h: 800 }; });
  const prod = {
    id: base, slug, sku: base, title: d.t, brand: BRANDS[d.b], petType: d.pet, category: d.c, categoryPath: [], rx: !!d.rx,
    regulated: !!d.rx, purchasable: !d.rx,
    breedSuitability: d.breed || ['All breeds'], ageGroup: d.age || ['adult'], size: d.size || [], petWeightKg: { min: d.wt ? d.wt[0] : 0, max: d.wt ? d.wt[1] : 100 },
    foodType: d.food || '', foodPreference: d.pref || '', litterType: d.litter || '',
    description: descFor(d), benefits: benefitsFor(d), ingredients: ingredientsFor(d), materials: d.mat || '', nutrition: nutritionFor(d), feedingInstructions: feedingFor(d),
    manufacturer: 'Demo Manufacturer Pvt Ltd (placeholder)', countryOfOrigin: ['A', 'B', 'C'].includes(d.b) ? 'India' : 'India (demo value)',
    storage: ['dry', 'wet', 'treat', 'supplement'].includes(d.food) ? 'Store in a cool, dry place away from direct sunlight. Refrigerate opened wet food and use within the time stated on pack.' : '',
    faqs: FAQ[groupOf(d)](d), tags: [...new Set([...d.pet, d.c, ...(d.age || []), d.food].filter(Boolean))],
    featured: !!d.feat, isNew: !!d.isNew, createdAt: new Date(Date.UTC(2026, 9, 1) - i * 86400000 * (d.isNew ? 1 : 9)).toISOString(),
    variants, images, imageType: d.ty, demo: true, status: 'active',
  };
  // category path
  let cur = d.c; const { parentOf } = require('../categories').flatten(); const path_ = [cur]; while (parentOf[cur]) { cur = parentOf[cur]; path_.unshift(cur); } prod.categoryPath = path_;
  if (bySlug[slug]) throw new Error('dup slug ' + slug);
  bySlug[slug] = prod; products.push(prod);
});

// bundles (reference first-variant SKUs by product slug)
const sk = (slug, vi = 0) => bySlug[slug].variants[vi].sku;
const bundles = [
  { slug: 'puppy-starter-kit', title: 'Puppy Starter Kit', pet: 'dog', discountPct: 10, description: 'A starter set for a new puppy: collar, leash, bowl and a chew ball. Demo bundle.', items: [{ sku: sk('padded-nylon-dog-collar', 0), qty: 1 }, { sku: sk('reflective-nylon-dog-leash-1-2-m', 0), qty: 1 }, { sku: sk('stainless-steel-pet-bowl-with-anti-skid-base', 1), qty: 1 }, { sku: sk('natural-rubber-chew-ball', 0), qty: 1 }], image: bySlug['padded-nylon-dog-collar'].images[0].src },
  { slug: 'walk-essentials-set', title: 'Walk Essentials Set', pet: 'dog', discountPct: 10, description: 'Harness, leash and waste bag dispenser for everyday walks. Demo bundle.', items: [{ sku: sk('no-pull-front-clip-dog-harness', 1), qty: 1 }, { sku: sk('reflective-nylon-dog-leash-1-2-m', 0), qty: 1 }, { sku: sk('waste-bag-dispenser-with-roll-set', 0), qty: 1 }], image: bySlug['no-pull-front-clip-dog-harness'].images[0].src },
  { slug: 'new-kitten-kit', title: 'New Kitten Kit', pet: 'cat', discountPct: 10, description: 'Litter box, litter, scoop and a wand teaser to set up your home for a kitten. Demo bundle.', items: [{ sku: sk('hooded-cat-litter-box', 0), qty: 1 }, { sku: sk('clumping-bentonite-cat-litter', 0), qty: 1 }, { sku: sk('litter-scoop-with-deep-slots', 0), qty: 1 }, { sku: sk('feather-wand-cat-teaser', 0), qty: 1 }], image: bySlug['hooded-cat-litter-box'].images[0].src },
  { slug: 'cat-play-and-scratch-set', title: 'Cat Play & Scratch Set', pet: 'cat', discountPct: 12, description: 'Scratching post, catnip mice and a crinkle tunnel. Demo bundle.', items: [{ sku: sk('sisal-scratching-post-60-cm'), qty: 1 }, { sku: sk('catnip-mice-set-of-4'), qty: 1 }, { sku: sk('crinkle-play-tunnel'), qty: 1 }], image: bySlug['sisal-scratching-post-60-cm'].images[0].src },
  { slug: 'grooming-essentials-set', title: 'Grooming Essentials Set', pet: 'both', discountPct: 10, description: 'Slicker brush, comb and nail clipper for regular home grooming. Demo bundle.', items: [{ sku: sk('self-cleaning-slicker-brush', 0), qty: 1 }, { sku: sk('dual-row-grooming-comb'), qty: 1 }, { sku: sk('nail-clipper-with-safety-guard', 0), qty: 1 }], image: bySlug['self-cleaning-slicker-brush'].images[0].src },
];
const coupons = [
  { code: 'WELCOME10', type: 'percent', value: 10, maxDiscount: 150, minCart: 499, expiresAt: '2027-12-31T23:59:59+05:30', usageLimit: 1000, perUserLimit: 1, active: true, note: 'DEMO coupon' },
  { code: 'FLAT100', type: 'flat', value: 100, maxDiscount: 0, minCart: 999, expiresAt: '2027-12-31T23:59:59+05:30', usageLimit: 500, perUserLimit: 5, active: true, note: 'DEMO coupon' },
  { code: 'EXPIRED5', type: 'percent', value: 5, maxDiscount: 0, minCart: 0, expiresAt: '2024-01-01T00:00:00+05:30', usageLimit: 0, perUserLimit: 0, active: true, note: 'DEMO - expired on purpose, for testing' },
];
const w = (f, o) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(o, null, 1) + '\n');
w('products.json', products); w('categories.json', { tree, smart: require('../categories').smart }); w('inventory.json', inventory); w('bundles.json', bundles); w('coupons.json', coupons);

// brand assets: logo/favicon (static files)
const { logoSvg, markSvg } = require('../../frontend/lib/brand-svg');
fs.writeFileSync(path.join(ROOT, 'assets', 'img', 'favicon.svg'), markSvg());
fs.writeFileSync(path.join(ROOT, 'assets', 'img', 'logo.svg'), logoSvg());
console.log(`Seeded ${products.length} demo products, ${Object.keys(inventory).length} variants, ${bundles.length} bundles, ${coupons.length} coupons, ${products.length * 2} placeholder images.`);
