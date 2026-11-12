# Catalogue CSV specification

One row per **variant**. Rows with the same `slug` form one product (title, brand, category must match). Template: `catalog/templates/products-template.csv`. Validate with `npm run import -- yourfile.csv` (dry-run); add `--write` to replace `catalog/data/products.json` and `inventory.json`.

Lists use `;` (pet_type, age_group, size, breed_suitability, tags) or `|` (benefits, nutrition `key:value|key:value`, faqs `question::answer|question::answer`, image_urls).

| Column | Required | Rules |
|---|---|---|
| slug | yes | lowercase-hyphen, unique per product |
| title, brand | yes | |
| pet_type | yes | `dog`, `cat` or `dog;cat` |
| category | yes | a slug from `catalog/categories.js` (e.g. `dog-dry-food`) |
| breed_suitability | no | e.g. `All breeds;Small breeds` |
| age_group | no | `puppy`, `kitten`, `adult`, `senior` |
| size | no | `small`, `medium`, `large` |
| pet_weight_min_kg / max | no | suitable pet weight range |
| food_type / food_preference / litter_type | no | `dry`/`wet`/`treat`/`supplement`; `Chicken`/`Fish`; `Clumping`/`Plant-based` |
| description, benefits, ingredients, nutrition, feeding_instructions, materials, storage | no | |
| manufacturer, country_of_origin | recommended | legal labelling info |
| tags, faqs, featured, new | no | `featured`/`new` accept yes/true/1 |
| rx | no | `yes` marks prescription/regulated: product becomes non-purchasable, variants ignored |
| image_urls | recommended | `|`-separated; real photography required |
| variant_sku | yes | globally unique |
| variant_label | yes | shown to customers |
| option_1_name/value, option_2_name/value | no | e.g. Size / M |
| barcode | no | |
| mrp, price | yes | whole rupees, tax-inclusive; price must not exceed MRP |
| stock | yes | integer >= 0 |
| reorder_threshold, weight_g, warehouse_location, batch, expiry (YYYY-MM-DD) | no | batch/expiry required for food in practice |

Validation reports every problem with its CSV row number and exits non-zero. Bundles (`catalog/data/bundles.json`) reference variant SKUs and must be updated by hand after a real import. Regenerate the demo data any time with `npm run seed`.
