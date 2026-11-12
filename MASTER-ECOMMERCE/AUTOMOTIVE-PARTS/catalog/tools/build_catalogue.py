"""Turn rows_raw.json into catalog/data/supplier-products.json.
Brand/model are INFERRED from the supplier's own 'Used For' / 'Mode&Date' text with keyword rules.
Every product keeps `source` (page/row) and `fitment_status: supplier-listed` -- never 'verified'."""
import json, re, sys, os, shutil
raw_dir, out_dir = sys.argv[1], sys.argv[2]
rows = json.load(open(raw_dir + "/rows_raw.json"))
BRAND_RULES = [  # (brand, regex) first match wins; applied to model/used-for/oem text
 ("Universal", r"HID USE FOR ALL|High Quality|\bD[1-8][SR]?\b"),
 ("Infiniti", r"Infiniti|QX\d{2}|\bQ30\b|\bQ50\b"),
 ("Renault", r"Renault|Megane|Kadjar|Clio|Captur|Talisman|Koleos"),
 ("Nissan", r"Nissan|Qashqai|X-Trail|Juke|Altima|Murano|Rogue"),
 ("Jeep", r"Jeep|Cherokee|Compass|Renegade|Wrangler"),
 ("Tesla", r"Model ?[3SXY]\b|Model3"),
 ("Opel / Vauxhall", r"Opel|Vauxhall|Astra|Insignia|Insinia|Zafira|Corsa"),
 ("GM (Buick / Cadillac / Chevrolet)", r"Buick|Cadillac|Chevrolet|\bGM\b|\bATS\b|\bXTS\b|\bCTS\b|Regal|Cruze"),
 ("Ford", r"Ford|Fiesta|Puma|Focus|Mondeo|Kuga|Mustang"),
 ("Honda", r"Honda|Accord|Civic|CR-V"),
 ("Maserati", r"Maserati|Quattroporte|Ghibli|Levante"),
 ("Mercedes-Benz", r"\bGL[CESAB]\s?\d{3}|\bGLS\s?\d{3}"),
 ("Mercedes-Benz", r"\bW\d{3}\b|\bC\d{3}\b|\bX\d{3}\b|\bV\d{3}\b|\bR\d{3}\b|\bA-?Class|\bCLA\b|\bCLS\b|\bGLC\b|\bGLE\b|\bGLS\b|\bGLA\b|\bGLB\b|S-?Class|E-?Class|C-?Class|\bA2\d{9}|\bA1\d{9}|\bA0\d{9}|benz|maybach|\bSprinter|\bVito|\bML\b|\bGL\b|\bSLK\b|\bSL\b"),
 ("Porsche", r"Cayenne|Panamera|Macan|Cayman|Boxster|Taycan|Porsche|\b9[5-9]\d\.\d{3}\.\d{2}|\b7P5|\b95B|\b970\b"),
 ("Audi", r"\bA[1-8]\b|\bS[1-8]\b|\bQ[2-8]\b|\bRS\d?\b|\bA3/|\bAudi|\b8[A-Z]\d\s?9\d\d|\b4[A-Z]\d\s?9\d\d|\b80A|\b83A|\b82A|\b8W|\b4M0|\b4G0|\b4H0|\b8V0|\bB[789]\b|\bC[67]\b"),
 ("SEAT", r"Leon|Ibiza|Tarraco|Ateca|Arona|Cupra|5F[A-Z0-9]|6F0|5FJ"),
 ("Skoda", r"Yeti|Octavia|Superb|Kodiaq|Karoq|Fabia|Rapid|Skoda|5L0"),
 ("Volkswagen", r"\bGolf\b|Passat|Tiguan|Touareg|Polo|Jetta|Arteon|Touran|\bVW\b|Volkswagen|\bMK[67]\b"),
 ("Kia", r"Sorento|Sportage|Carnival|Optima|Kia|Seltos|Sonet|Cerato|Stinger|Telluride|957602"),
 ("Hyundai", r"Hyundai|Tucson|Santa ?Fe|Elantra|Sonata|Creta|Verna|i20|i30|Palisade|Venue"),
 ("Land Rover", r"Land Rover|Range Rover|Evoque|Discovery|Velar|Defender|Freelander|L405|L494|L538"),
 ("Jaguar", r"Jaguar|\bXF\b|\bXJ\b|\bXE\b|F-?Pace|F-?Type|E-?Pace"),
 ("Volvo", r"Volvo|\bXC\d0\b|\bS[689]0\b|\bV[469]0\b"),
 ("Lexus", r"Lexus|\bRX\d{3}\b|\bNX\b|\bES\d{3}\b|\bLS\d{3}\b"),
 ("Toyota", r"Toyota|Camry|Corolla|Fortuner|Innova|Land Cruiser|Prado|Highlander|\bRAV4\b|Hilux"),
 ("BMW", r"\bSeries\b|\b[EFGU]\d{2}\b|\b[EFGU]\d{2}[/ ]|\bF\d{2}\b|\bX[1-7]\b|\bX[1-7]M?\b|\bM[2-8]\b|\bZ4\b|\biX\d?\b|\bi[3-8]\b|\b6[1-3]\d{9}\b|\b6\s?[1-3]\d{2}\s?\d{4}\b|\bGT\b|\bMini\b|BMW|Rolls"),
]
def txt(x): return " ".join([x["model_date"], x["used_for"], x["item"], x["note"], x["oem"]]).replace("\n", " ")
def brand_of(x):
    t = txt(x)
    primary = (x["model_date"] + " " + x["used_for"]).replace("\n", " ")
    for b, rx in BRAND_RULES:
        if re.search(rx, primary, 0 if b in ("Mercedes-Benz","Audi","BMW","Universal","Tesla") else re.I): return b
    for b, rx in BRAND_RULES:
        if re.search(rx, t): return b
    return None
def years_of(s):
    m = re.search(r"(20\d{2}|19\d{2})\s*[-–~]\s*(20\d{2}|19\d{2})", s)
    if m: return int(m.group(1)), int(m.group(2))
    m = re.search(r"(20\d{2})\s*(after|up|\+|on)", s, re.I)
    if m: return int(m.group(1)), None
    m = re.search(r"(20\d{2}|19\d{2})", s)
    if m: return int(m.group(1)), int(m.group(1))
    return None, None
def clean(s): return re.sub(r"\s+", " ", s.replace("\n", " ")).strip()
def side_of(x):
    t = txt(x)
    if re.search(r"\(L\)|\bLeft\b|\bL\b(?!ED)|-L\b|\bLH\b", t) and not re.search(r"\(R\)|\bRight\b", t): return "left"
    if re.search(r"\(R\)|\bRight\b|-R\b|\bRH\b", t) and not re.search(r"\(L\)|\bLeft\b", t): return "right"
    return "n/a"
def category_of(x):
    i = x["item"].lower(); sec = x["section"]
    if "camera" in i or "camara" in i or "bsd" in i or "blind spot" in i or "collision" in i or "radar" in i: return "electronic-modules/cameras-adas"
    if "parking" in i or "pdc" in i: return "electronic-modules/parking-sensors"
    if "ballast" in i or "igniter" in i or "hid headlight module" in i: return "headlights/ballasts-igniters"
    if "driver module" in i or "control module" in i or "control unit" in i or "converter" in i or "computer" in i or "supply module" in i or "air suspension" in i or "function module" in i: return "electronic-modules/control-modules"
    if "turn" in i or "indicator" in i or "cornering" in i: return "headlights/turn-signal-modules"
    if "angel" in i or "drl" in i: return "headlights/drl-angel-eyes"
    if "wiring" in i or "cable" in i: return "headlights/wiring-harnesses"
    if "light guide" in i or "heat sink" in i or "reflector" in i: return "headlights/internal-components"
    if "complete" in i or "upgrade" in i or "headlight set" in i: return "headlights/complete-assemblies"
    if "pcb" in i or "board" in i or "led module" in i or "led headlight module" in i or "headlight module" in i or "led bulb" in i or "hid bulb" in i: return "headlights/led-modules-boards"
    if "tail" in i: return "tail-lamps/led-driver-boards"
    return "headlights/led-modules-boards" if "light" in i else "electronic-modules/control-modules"
products, unassigned = [], []
used_imgs = set()
for x in rows:
    b = brand_of(x)
    if not b: unassigned.append(x); b = "Other / multi-brand"
    ys, ye = years_of(clean(x["model_date"]) + " " + clean(x["used_for"]))
    oems = [clean(o) for o in re.split(r"\n|/(?=\s*\w)", x["oem"]) if clean(o)] if "\n" in x["oem"] else [clean(x["oem"])]
    oems = [o for o in oems if o]
    sku = f"JS-{x['section'][:3].upper().replace(' ','')}{x['page']:02d}-{x['no']:03d}"
    img = x["images"][0] if x["images"] else None
    products.append({
      "id": sku, "supplier": "jushuo", "supplier_section": x["section"], "supplier_ref": f"p{x['page']}#{x['no']}",
      "title_raw": x["item"], "category": category_of(x), "brand": b, "models_raw": clean(x["model_date"]), "used_for_raw": clean(x["used_for"]),
      "year_from": ys, "year_to": ye, "oem_numbers": oems, "side": side_of(x), "supplier_note": clean(x["note"]),
      "image": img["file"] if img else None, "image_px": [img["w"], img["h"]] if img else None,
      "fitment_status": "supplier-listed", "price_inr": None, "condition": "to-be-confirmed-with-supplier", "stock": "on-request"})
os.makedirs(out_dir + "/data", exist_ok=True); os.makedirs(out_dir + "/../assets/products", exist_ok=True)
for p in products:
    if p["image"]:
        shutil.copyfile(f"{raw_dir}/img/{p['image']}", f"{out_dir}/../assets/products/{p['image']}")
json.dump(products, open(out_dir + "/data/supplier-products.json", "w"), indent=1, ensure_ascii=False)
from collections import Counter
print(len(products), "products"); print(Counter(p["brand"] for p in products)); print(Counter(p["category"] for p in products))
print("unassigned", len(unassigned))
for x in unassigned[:50]: print(x["section"][:5], x["no"], "|", x["item"][:28], "|", clean(x["model_date"])[:28], "|", clean(x["used_for"])[:40], "|", clean(x["oem"])[:25])
