# SEO / GEO
- Server-rendered pages, unique `<title>`, meta description, H1 (exactly one), canonical (from `SITE_URL`), OG/Twitter tags, alt text on all images; verified per page by `tests/e2e.js`.
- `/sitemap.xml` (all 1,229 products + categories, brands, guides, policies), `/robots.txt` (blocks admin, cart, checkout, account, track, pay, search, api).
- JSON-LD: Organization, WebSite+SearchAction, Product (offers only when a REAL price exists; never for DEV prices; **no aggregateRating/reviews**), BreadcrumbList, FAQPage, Article.
- Filtered/sorted listing URLs are `noindex`; product, category and brand pages indexable.
- GEO (AI-answer visibility): plain-language guides, explicit definitions (OEM vs equivalent vs aftermarket), FAQ with direct answers, honest caveats. No invented claims, so nothing for engines to contradict.
- To do after launch: real domain, Search Console, real photography, per-model landing copy, hreflang if other markets are added.
