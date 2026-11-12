# Starter Online Store 2.0 theme skeleton (UNTESTED)

A minimal Shopify OS 2.0 skeleton: `layout/theme.liquid`, `config/settings_schema.json`, JSON templates (index, product, collection, cart), key sections (announcement, header, footer, hero, featured collection, main product/collection/cart), snippets and CSS tokens matching the Paw & Hearth design system.

**Status: not tested against a live Shopify store** and not run through `shopify theme check`. Expect to adjust Liquid, add templates (`page`, `search`, `404`, `blog`, `article`, `customers/*`), navigation menus (`main-menu`, `footer`) and metafield definitions (run `node shopify/push-to-shopify.js --definitions --execute`). Ratings are deliberately not rendered; add a reviews app that publishes only genuine reviews.
