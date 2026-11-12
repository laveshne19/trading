"""Extract rows + thumbnails from the supplier PDF (Jushuo 2026 catalogue).
Usage: python3 -I extract_catalogue.py <pdf> <out_dir>
Writes <out_dir>/rows_raw.json and <out_dir>/img/<md5>.jpg
Nothing is invented: unreadable fields stay empty. Thumbnails are matched to a row by position."""
import sys, json, re, os, hashlib
import pdfplumber
pdf_path, out = sys.argv[1], sys.argv[2]
os.makedirs(out + "/img", exist_ok=True)
SECTIONS = [(1,"Headlight Module Catalog"),(37,"USA Version Car Module Catalog"),(40,"Yellow Colour Module Catalog"),
            (52,"OE Colour Module PCB Catalog"),(63,"Electrical System Catalog"),(70,"Camera Catalog")]
def section(p):
    s = SECTIONS[0][1]
    for start,name in SECTIONS:
        if p >= start: s = name
    return s
rows = []
with pdfplumber.open(pdf_path) as pdf:
    for pno, page in enumerate(pdf.pages, 1):
        for t in page.find_tables():
            for r in t.rows:
                cells = r.cells
                if len(cells) < 7 or any(c is None for c in cells[:7]): continue
                def clamp(c):
                    x0,t0,x1,b0 = c
                    return (max(x0,0),max(t0,0),min(x1,page.width),min(b0,page.height))
                vals = [(page.crop(clamp(c)).extract_text() or "").strip() for c in cells[:7]]
                if not re.fullmatch(r"\d{1,4}", vals[0] or ""): continue
                x0,top,x1,bottom = cells[5]
                imgs = [im for im in page.images if im["top"] >= top-2 and im["bottom"] <= min(bottom,page.height)+2 and im["x0"] >= x0-2 and im["x1"] <= x1+2]
                files = []
                for im in imgs:
                    data = im["stream"].get_data()
                    if data[:2] != b"\xff\xd8": continue
                    h = hashlib.md5(data).hexdigest()[:16]
                    fn = f"{out}/img/{h}.jpg"
                    if not os.path.exists(fn): open(fn,"wb").write(data)
                    files.append({"file": h+".jpg", "w": int(im["srcsize"][0]), "h": int(im["srcsize"][1])})
                rows.append({"no": int(vals[0]), "section": section(pno), "page": pno, "item": " ".join(vals[1].split()),
                             "model_date": vals[2], "oem": vals[3], "used_for": vals[4], "note": vals[6], "images": files})
json.dump(rows, open(out+"/rows_raw.json","w"), indent=1, ensure_ascii=False)
print(len(rows), "rows;", len(os.listdir(out+"/img")), "unique thumbnails")
