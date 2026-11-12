# Paw & Hearth - premium dog & cat supplies store (India)

Website two of the MASTER-ECOMMERCE build. Zero-dependency Node 22 server (`node:http`), server-rendered, small progressive-enhancement JS, JSON-file storage.

```bash
cp .env.example .env     # optional; sane dev defaults exist
npm start                # http://localhost:4200  (PORT to change)
npm test                 # unit tests (node:test)
npm run e2e              # Playwright walk (needs playwright + chromium)
npm run seed             # regenerate DEMO catalogue + placeholder images
```
Admin: `/admin` (HTTP Basic). In development the default `admin` / `pawhearth-dev` is printed at startup; in production `ADMIN_USER`/`ADMIN_PASS` are mandatory or admin is disabled.

**Everything in the catalogue is DEMO data** (generic names, "Demo Brand A..F", placeholder SVG illustrations marked DEV PLACEHOLDER). Real catalogue: see `catalog/CSV-SPEC.md`. Full documentation is in `documentation/` - start with `documentation/README.md`.
