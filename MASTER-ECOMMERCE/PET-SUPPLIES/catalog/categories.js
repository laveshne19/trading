'use strict';
// Category tree. pet: 'dog' | 'cat' | 'both'. rx:true => regulated: listed for information, NOT purchasable online without authorisation.
const T = (slug, title, pet, children = [], extra = {}) => ({ slug, title, pet, children, ...extra });
const tree = [
  T('dog-food', 'Dog Food', 'dog', [
    T('dog-dry-food', 'Dry Food', 'dog'), T('dog-wet-food', 'Wet Food', 'dog'), T('puppy-food', 'Puppy Food', 'dog'),
    T('senior-dog-food', 'Senior Dog Food', 'dog'), T('grain-free-dog-food', 'Grain-Free', 'dog'),
    T('vet-diet-dog', 'Veterinary Diets', 'dog', [], { rx: true, note: 'Veterinary diets are recommended and prescribed by a veterinarian. They are listed for information and are not sold online without authorisation.' }),
    T('dog-treats', 'Treats & Chews', 'dog'),
  ]),
  T('cat-food', 'Cat Food', 'cat', [
    T('cat-dry-food', 'Dry Food', 'cat'), T('cat-wet-food', 'Wet Food', 'cat'), T('kitten-food', 'Kitten Food', 'cat'),
    T('senior-cat-food', 'Senior Cat Food', 'cat'), T('grain-free-cat-food', 'Grain-Free', 'cat'),
    T('vet-diet-cat', 'Veterinary Diets', 'cat', [], { rx: true, note: 'Veterinary diets are recommended and prescribed by a veterinarian. They are listed for information and are not sold online without authorisation.' }),
    T('cat-treats', 'Treats', 'cat'),
  ]),
  T('collars-walking', 'Collars & Walking', 'dog', [
    T('dog-collars', 'Collars', 'dog'), T('dog-harnesses', 'Harnesses', 'dog'), T('dog-leashes', 'Leashes', 'dog'),
    T('id-tags', 'ID Tags', 'dog'), T('waste-management', 'Waste Bags & Dispensers', 'dog'),
  ]),
  T('cat-accessories', 'Cat Accessories', 'cat', [
    T('cat-collars-harnesses', 'Collars & Harnesses', 'cat'), T('litter', 'Cat Litter', 'cat'), T('litter-boxes', 'Litter Boxes & Scoops', 'cat'),
    T('scratchers-posts', 'Scratchers & Posts', 'cat'),
  ]),
  T('beds-furniture', 'Beds & Furniture', 'both', [
    T('dog-beds', 'Dog Beds', 'dog'), T('cat-beds', 'Cat Beds', 'cat'), T('mats-blankets', 'Mats & Blankets', 'both'),
    T('cat-trees-perches', 'Cat Trees & Perches', 'cat'), T('crates-pens', 'Crates & Pens', 'dog'),
  ]),
  T('toys', 'Toys', 'both', [
    T('dog-chew-toys', 'Dog Chew Toys', 'dog'), T('dog-fetch-tug', 'Fetch & Tug', 'dog'), T('dog-interactive-toys', 'Interactive & Puzzle', 'dog'),
    T('cat-wand-teasers', 'Wands & Teasers', 'cat'), T('cat-catnip-plush', 'Catnip & Plush', 'cat'), T('cat-tunnels-interactive', 'Tunnels & Interactive', 'cat'),
  ]),
  T('feeders-drinking', 'Feeders & Drinking', 'both', [
    T('bowls', 'Bowls', 'both'), T('slow-feeders', 'Slow Feeders', 'both'), T('automatic-pet-feeders', 'Automatic Feeders', 'both'),
    T('water-fountains', 'Water Fountains', 'both'), T('food-storage', 'Food Storage', 'both'),
  ]),
  T('pet-grooming-products', 'Grooming & Hygiene', 'both', [
    T('brushes-combs', 'Brushes & Combs', 'both'), T('shampoo-conditioners', 'Shampoos & Conditioners', 'both'),
    T('nail-dental-care', 'Nail & Dental Care', 'both'), T('wipes-odour', 'Wipes & Hygiene', 'both'),
  ]),
  T('health-wellness', 'Health & Wellness', 'both', [
    T('supplements', 'Supplements (OTC)', 'both'), T('skin-coat-care', 'Skin & Coat Care (OTC)', 'both'),
    T('prescription-medicines', 'Prescription Medicines', 'both', [], { rx: true, note: 'Prescription and regulated veterinary medicines cannot be bought online without authorisation. Please consult your veterinarian.' }),
  ]),
  T('travel-outdoor', 'Travel & Outdoor', 'both', [
    T('carriers', 'Carriers', 'both'), T('travel-bowls-accessories', 'Travel Bowls & Accessories', 'both'), T('car-travel', 'Car Travel', 'dog'),
  ]),
  T('clothing-lifestyle', 'Clothing & Lifestyle', 'both', [
    T('sweaters-coats', 'Sweaters & Coats', 'both'), T('raincoats', 'Raincoats', 'dog'), T('bandanas-accessories', 'Bandanas & Accessories', 'both'),
  ]),
];

// Smart collections (not in the tree): merchandising + SEO landings that cut across categories.
const smart = [
  { slug: 'dog-supplies', title: 'All Dog Supplies', pet: 'dog', filter: {} },
  { slug: 'cat-supplies', title: 'All Cat Supplies', pet: 'cat', filter: {} },
  { slug: 'dog-toys', title: 'Dog Toys', pet: 'dog', filter: { top: ['toys'] } },
  { slug: 'cat-toys', title: 'Cat Toys', pet: 'cat', filter: { top: ['toys'] } },
  { slug: 'new-arrivals', title: 'New Arrivals', pet: 'both', filter: { flag: 'isNew' } },
  { slug: 'bestsellers', title: 'Featured Favourites', pet: 'both', filter: { flag: 'featured' } },
  { slug: 'offers', title: 'Offers', pet: 'both', filter: { flag: 'discounted' } },
];

function flatten() {
  const flat = {}; const parentOf = {};
  const walk = (n, parent) => { flat[n.slug] = n; if (parent) parentOf[n.slug] = parent.slug; n.children.forEach((c) => walk(c, n)); };
  tree.forEach((n) => walk(n, null));
  return { flat, parentOf };
}
module.exports = { tree, smart, flatten };
