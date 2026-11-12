# Design system

Direction: warm premium lifestyle, calm and editorial (Apple-like restraint in product presentation), not childish. Derived from a ui-ux-pro-max design-system query (pattern "feature-rich showcase", warm neutral palette, serif/sans pairing, accessibility checklist); the tool's suggested "liquid glass" style and handwritten fonts were rejected as wrong for the brief.

## Tokens (`assets/css/app.css :root`)
- Colour: cream `#FBF6EC` (page), ivory `#FFFDF8` (cards), sand `#F3EADB`, deep forest `#1F3D2E` (primary/footer), green `#2F5A43`, sage `#9DB5A0` / `#DCE6D8`, peach `#F6D5BC`, warm orange `#E07A32` (decorative) and **burnt orange `#B8531B`** for text/buttons (white on it = 4.9:1; on cream 4.6:1). Muted text `#5E5E52` (6:1 on cream).
- Type: **Fraunces** (display, characterful serif, optical size) + **DM Sans** (body) from Google Fonts, with Georgia/system fallbacks. Fluid `clamp()` headings.
- Spacing: 8pt scale `--s1..--s9` (4/8/12/16/24/32/48/64/96). Radii: 10/16/24px and pill. Two soft shadows. Motion 150-300ms, `prefers-reduced-motion` disables transforms/animation.
- Layout: `.wrap` (78rem max, 100rem+ 84rem), root font-size steps up at 120rem (112.5%) and 175rem (150%) so 1920 and 3840 displays scale instead of leaving tiny content.
- Breakpoints: 40rem, 56rem (filters become sidebar), 62rem (desktop header/mega menu, hides tab bar), 90rem.

## Components
Buttons (primary forest, secondary burnt orange, ghost, sm/lg), form fields with labels/hints/errors (`aria-invalid`, `aria-describedby`), pills (variant selectors), badges, product card (soft radius, hover lift, stretched link, wishlist, quick add), horizontal scroll rows (snap), tiles, mega menu, drawers (menu, cart), filter bottom sheet, tab bar, toast, breadcrumbs, pagination, spec table, FAQ accordions (native `<details>`), stat tiles, status pills.

## Illustration language
Hand-built SVG (`frontend/lib/brand-svg.js`): hearth-arch logo mark with a paw and an orange ember, sitting dog and cat figures, a hero scene (arched window, plant, rug), pet head badges, paw motif. Used sparingly: hero, pet cards, mega menu, empty states, 404. Flat shapes in the brand palette; no stock clip-art feel. Product images are generated placeholder illustrations per product type (`catalog/tools/placeholders.js`, 41 drawings) with a visible DEV PLACEHOLDER mark - **photography is required** (MISSING-INFO.md).

## Accessibility (WCAG 2.2 AA intent)
Skip link, landmarks, one h1 per page, visible `:focus-visible` rings, 44px targets on controls, labelled inputs, `aria-live` for PIN results/cart count/toast, focus trap and Escape for drawers, native disclosure widgets, colour contrast as above, reduced-motion support, forced-colors fallbacks, form errors announced. Not audited with a screen reader or an automated axe run in this repository (see TEST-REPORT).
