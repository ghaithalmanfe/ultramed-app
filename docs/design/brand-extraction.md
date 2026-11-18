# UltraMed brand extraction: evidence and recommended app tokens

> In the repository since 13 Nov 2026 (branch `redesign-v1`). The screenshots, page dumps, font and logo files, scripts and extraction outputs this document cites stayed in the working session's scratchpad and are not in the repository: paths that start with `/tmp/…`, `scratchpad/…`, `redesign-brand/…`, `redesign-docs/…`, `brand-scripts/…`, `safe-wt/…` or `home-wt/…` point there. Amounts and the promo code shown on the public shop were left out of this copy (nothing of the shop's prices goes in the repository).

Audit step for the premium redesign (spec §1, §3.1–§3.6; Phase 1.5 and Phase 2 steps 1–2).
Read on 13 Nov 2026 from https://ultramedgcc.com/ in Chromium (Playwright, through the session proxy), from the official logo files on the store's CDN, from the font files' own name tables, and from the two app checkouts (`safe-wt`, branch safety-v123; `home-wt`, branch main-screen-v1 at 3bc411e). Nothing in either checkout was changed.

Every value below has its source. "Site" means a value read from the live site's CSS, computed style or assets. "Derived" means a value I computed from a site value (for example a site color at the opacity the site itself uses). "Recommended" means my proposal for the app, with the reason given.

---

## 0. Bottom line (for the workers who build the design system)

1. **One deep green is the brand: #022917.** It is in the official logo files ("Green"), the theme's text, heading, accent and button colors (`--color-base-text/-accent: 2, 41, 23`), the announcement bar, the footer and every primary button. It is already the app's `--green`. The site never uses black for text.
2. **The official logo kit has exactly three greens:** Green #022917, Pale-Green #214E39 and Light-Green #A5CF63 (the names come from the official file names), plus white and black. The lime #A5CF63 is the brand's single accent. The site uses it on dark green (button labels, announcement text, the footer mark, the official app icon) or as a soft highlight behind dark text, and never as text on white (1.79:1).
3. **The site is white and calm:** white page, 1px #ECEAED hairlines, white cards with radius 10px and no shadow, thin outline icons, small tracked uppercase micro-type, and bold DM Sans titles. Translucent "glass" (white at 75%, blur 20px) appears only on the sticky header, the mobile dock, badges and inputs. Its main navigation is light, not dark, so the app's sidebar should be light (spec §4.1: no forced dark sidebar).
4. **Fonts on the site:** DM Sans (OFL 1.1, the theme font) sets the section and product titles and the `<button>` CTAs. **Frutiger LT Arabic 55 Roman / 65 Bold** (Linotype) sets body, links, navigation, prices and all Arabic text through a "font-picker" app. The Frutiger files say "*your use of this font software is limited to your workstation … You may not copy or distribute this font software*", and the app's repository and site are public. **Frutiger cannot ship.**
5. **App typography (recommended):** DM Sans for Latin, plus **IBM Plex Sans Arabic** (OFL) for Arabic. Plex is the closest OFL relative of the site's Frutiger Arabic (humanist Kufi with gentle modulation), compared side by side with five alternatives. **DM Sans has no tabular figures at all** (no `tnum`, no `.tf` glyphs, upstream included), so figures come from IBM Plex's Latin digits through a digits-only `unicode-range` face ("UM Figures"). Those digits are tabular by default, like the Frutiger digits the site's prices use. Five self-hosted woff2 files total about 186 KiB. Exact URLs are in §8.
6. **Logo:** the repo's `logo-green.png` / `logo-white.png` (1067×240) and the 56.5 KB base64 `LOGO_DATAURI` in `01-config.js` are the **same artwork** as the official `Ultramed_-_Primary-Logo-*-EN.png` (2000×450): same mark, letters and spacing (aspect ratio within 0.2%). The official files are sharper (1.87× the pixels) and **smaller in bytes** (26.3 KB vs 42.4 KB). Use the official files.
7. **PWA icons are off-brand:** the repo's icon-192/512, apple-touch-icon and favicon put the lime mark on a **teal #0F5257**, a color that appears nowhere on the site, in the logo kit or in UltraMed's own iOS app icon (lime mark on #022917). Their 66% mark is also clipped by a circular maskable mask. Recompose them from the official mark (§6.3; a preview is already made).
8. **Status colors come from the site's theme** (success #1F7A3A, danger #C0270B), with two darkened inks where the site's value misses AA: warning #A86B00 (4.40:1) becomes **#8A5800**, and info #1A64F0 becomes **#1554CC** on its soft fill. Always pair status color with an icon and a word.
9. **Three site values are not accessible enough for an app,** so the recommendations differ: the focus ring #87ADF5 (2.25:1, needs 3:1), the input border #A69DAB (2.61:1) and the 9px dock labels. The replacements are in §7.
10. **Keep the existing token names as aliases** (`--muted` alone appears 432 times in JS-generated markup). Define the new semantic tokens and point the old names at them (§7.5). The held v123 screen's `--accent #1E7A55` is the weekly deck's palette, not UltraMed's site or logo. Map it to the brand primary.

---

## 1. Sources and method

| What | How |
|---|---|
| Pages | Home EN `https://ultramedgcc.com/` · collection `/collections/brands-philips` · product `/products/philips-sonicare-rechargeable-toothbrush-5300-series-white` · home AR `/ar` (the site has a language switch; `/ar` serves `lang="ar" dir="rtl"`) |
| Viewports | 1440×900 desktop; 390×844 mobile with `isMobile`, touch and an iPhone user agent; deviceScaleFactor 1 |
| Theme | Shopify **"Be Yours" 9.1.0** (theme store 1399), store theme name **"Ultramed GCC Glass - Pivot"**, id 162748793076 (from `window.Shopify.theme`). `<body class="… glass-enabled …">`. Root font-size `calc(var(--font-body-scale) * 62.5%)`, so 1rem = 10px in the theme CSS. |
| Popup | A promo popup ("Download the App … LOYALTY PROGRAM …" with a promo code) opens on every first visit. The `*-first.png` screenshots include it; `*-view.png` and `*-seg*.png` are taken after closing it. |
| Extraction | `document.styleSheets` (all custom properties on `:root`/`html`/`body` and all `@font-face` rules), `getComputedStyle` of real elements at rest, on hover and on keyboard focus, pixel sampling of screenshots (for rendered translucent colors), the theme CSS files saved locally, the page HTML saved, and font name tables read with fontTools 4.68 |
| Tools | `/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/brand-scripts/` (probe1.js, shots.js, states.js, fontinfo.py, imginfo.py, logocompare.py, contrast*.js, specimen*.js, board.js) |

The evidence file list is in §10.

---

## 2. The brand's visual personality (what the screenshots show)

- **Desktop home** (`home-1440-view.png`, `home-1440-seg1..3.png`): a 36px announcement bar in #022917 with lime text ("Free delivery on … orders!", the amount left out here), then a white header with the centered logo (mark + ULTRAMED wordmark, 222×50) and thin outline icons (search, wishlist, account, bag) on the right. The navigation row is 12px bold uppercase with 2.4px tracking. Active "HOME" is underlined, and "SPECIAL OFFERS" sits on a lime marker highlight. Full-width product banners use pastel backgrounds (the brands' own art). Section titles ("New Arrivals", "Best Sellers") are DM Sans 35px bold with a tiny tracked "VIEW ALL" link. Product cards are white with a 1px #ECEAED border and radius 10px. "NEW", "MOST-SOLD" and "EXCLUSIVE" badges are outlined and almost square (radius 2px). "SALE" and "-35%" badges are dark green at 75%. Review stars are lime. "Shop by" category tiles are solid #022917 with white bold text, and the footer is #022917 with a lime mark.
- **Mobile home** (`home-390-view.png`, `home-390-seg1.png`): a smart-app banner ("Ultramed — Open in the Ultramed App", dark-green pill button), the announcement bar, and a compact header (hamburger, logo, icons). Card add-to-cart buttons are dark-green circles with a lime icon. **A fixed bottom dock** (Home · Search · Shop · Cart: thin outline icons, tiny uppercase labels, translucent white) is a direct precedent for the app's bottom navigation. A translucent "Spend … KWD more…" bar (free-delivery progress) sits above it.
- **Collection** (`collection-1440-view.png`, `collection-1440-seg1.png`, `collection-390-seg1.png`): on desktop, a calm filter column (accordions with hairline dividers, small checkboxes, underlined "Reset" links), an outlined "SORT BY" control with radius ~10px, a muted product count and a three-up card grid. **On mobile, all filters collapse into one full-width dark-green "FILTER AND SORT" button** (lime label and icon) that opens a drawer, above a two-column grid with 15px gutters.
- **Product** (`product-1440-view.png`, `product-390-view.png`): tracked uppercase breadcrumbs (10px), a DM Sans 35px bold title, the SKU with a green "IN STOCK" dot, and a red sale price beside a struck-through regular price. Variant swatches are 44px squares (radius 3px), and the quantity stepper uses 36px round buttons (#022917 at 6%). A full-width **ADD TO CART** (dark green, lime label, radius 10px, 50px tall) sits above an outlined "Add to wishlist" and a rounded "Secure Payment" box. Accordions use 13px titles with 3px tracking.
- **Arabic** (`ar-home-1440-view.png`, `ar-home-390-seg1.png`): fully mirrored. The **logo stays the English lockup and is not mirrored** (no Arabic logo exists, see §6.1). Arabic navigation drops the tracking (computed `letter-spacing: normal`). Arabic headings are Frutiger LT Arabic 65 Bold at 35px. Prices keep Western digits (three decimals and "KWD"). The dock is mirrored but its labels stay English. The app banner spells the brand **"ألترامد"**.

**Brand DNA to carry into the app**

1. One deep green for text, headings and primary actions. No pure black, no second strong color.
2. The lime as a scarce accent: on dark green, or as a soft fill behind dark text.
3. White with hairlines, plenty of air, radius 10px, almost no shadow, and only light translucency.
4. Small tracked uppercase labels (Latin only) next to confident sans titles.
5. Thin outline icons in `currentColor`.
6. On mobile, a bottom dock and one dark-green action button.

**What not to copy (commerce patterns, or below the app's bar)**

- Promo popups, pastel brand banners and red sale prices.
- 9px dock labels.
- Faux-bold: the site requests weight 700 from a 400-only Frutiger face for navigation.
- Uppercase CTA labels in Arabic.
- Third-party app colors on the page (Growave `--gw-*` pinks and blues, `--xflow-*`, the font-picker's `#008060`). These belong to installed apps, not to UltraMed.

---

## 3. Colors: extracted with evidence

### 3.1 The official logo kit (store CDN `https://ultramedgcc.com/cdn/shop/files/…`)

| Name in the official file names | Hex | Evidence |
|---|---|---|
| **Green** | **#022917** | `Ultramed_-_Primary-Logo-Green-EN.png`: every opaque pixel is exactly #022917 (26.0% of the canvas). The same holds for `Icon-Green-EN` (the site favicon) and `Secondary-Logo-Green-EN`. |
| **Pale-Green** | **#214E39** | `Primary-Logo-Pale-Green-EN.png`, `Secondary-Logo-Pale-Green-EN.png` and `Icon-Pale-Green-EN.png` are exactly #214E39. The Icon is the smart-app-banner icon (`iconUrl` in the page's banner config). |
| **Light-Green** | **#A5CF63** | `Primary/Secondary/Icon-Light-Green-EN.png` are exactly #A5CF63. The Icon is the footer mark on the dark footer. |
| White / Black | #FFFFFF / #000000 | `-White-EN` / `-Black-EN` files |

**UltraMed's iOS app icon** (`https://apps.apple.com/app/id6751394853`, linked from the site's banner config): the lime mark #A5CF63 on #022917/#072919. The mark is 48% of the icon's height. Saved as `logo/appstore/app-icon-512.png`.

### 3.2 Theme color settings (inline `:root{}` in the page head; `--color-*` values are RGB triplets)

| Variable | Value | Hex | Used on the page for |
|---|---|---|---|
| `--color-base-text` | `2, 41, 23` | #022917 | all text (`body` color) |
| `--color-base-heading` | `2, 41, 23` | #022917 | headings |
| `--color-base-accent` | `2, 41, 23` | #022917 | `--color-button-background` (solid buttons) |
| `--color-base-solid-button-labels` | `165, 207, 99` | #A5CF63 | `--color-button-text` (labels on solid buttons) |
| `--color-base-outline-button-labels` | `2, 41, 23` | #022917 | `--color-link`, secondary-button text |
| `--color-base-background` | `255, 255, 255` | #FFFFFF | page |
| `--color-base-border` | `236, 234, 237` | #ECEAED | hairlines, card borders, header bottom line |
| `--color-base-border-strong` | `166, 157, 171` | #A69DAB | `.field__input` / `.select__select` inset outline |
| `--color-background-dark` | `235, 235, 235` | #EBEBEB | dark background sections (2 uses) |
| `--color-overlay` | `2, 41, 23` | #022917 | overlays |
| `--color-keyboard-focus` | `135, 173, 245` | #87ADF5 | `*:focus-visible` outline |
| `--color-shadow` | `168, 232, 226` | #A8E8E2 | button and card shadows, all with 0 offsets, so in practice no shadow |
| `--color-price` | `#022917` | | prices |
| `--color-sale-price` / `--color-sale-badge-background` | `#d72c0d` / `#c0270b` | | sale price text / sale badge |
| `--color-reviews` | `#A5CF63` | | review stars |
| `--color-success` | `#1f7a3a` | | 2 uses in the CSS |
| `--color-critical` | `#c0270b` | | 3 uses (error borders and text) |
| `--color-warning` / `--color-error` / `--color-info` | `168, 107, 0` / `192, 39, 11` / `26, 100, 240` | #A86B00 / #C0270B / #1A64F0 | defined, not used on these pages |
| `--color-highlight` | `255, 181, 3` (#FFB503) in 13 places; `165, 207, 99` on the visible menu item | | marker gradient `linear-gradient(to right, rgb(var(--color-highlight)) 0, rgb(var(--color-background)))`. The visible one is lime. |
| `--color-accent-strong` | `184, 132, 26` | #B8841A | defined, unused (a gold) |
| `--color-surface-warm` / `--color-surface-card` | `251, 247, 241` / `239, 230, 220` | #FBF7F1 / #EFE6DC | defined, unused |
| Glass | `--glass-tint: 255,255,255`; `--glass-bg-opacity: 0.75`; `--glass-blur: 20px`; `--glass-border-opacity: 0.2` | | `component-glass.css` |
| Header | `--color-header-background: 255,255,255`; `--color-header-foreground: 2,41,23`; `--color-header-border: 236,234,237` | | |
| Other | `--card-radius: 10px`; `--button-radius: 10px`; `--card-border-width: 1px`; `--button-border-width: 0px`; `--page-width: 160rem` | | |

### 3.3 Computed colors of real elements (getComputedStyle, 1440 wide)

| Element | Selector | Computed |
|---|---|---|
| Announcement bar | `div.announcement-bar` | bg rgb(2,41,23) · text rgb(165,207,99) · 13px · letter-spacing 0.78px · height 36px |
| Header | `sticky-header.header-wrapper` | transparent on white · `box-shadow: rgba(236,234,237,.3) 0 1px 0` · header padding 12px 50px · height 130px |
| Nav link | `a.header__menu-item` | rgb(2,41,23) · 12px · 700 · uppercase · letter-spacing 2.4px (Arabic: `normal`) · padding 12px 6px |
| Primary button | `button.product-form__submit` | bg rgb(2,41,23) · label rgb(165,207,99) · DM Sans 12px 600 uppercase · letter-spacing 2.4px · **radius 10px** · padding 12px 30px 10px · **height 50px** · transition `color .5s, background-color .5s, box-shadow .5s` |
| Primary button, hover | same | bg **rgba(2,41,23,.933)** (#133727 on white) · `box-shadow: rgba(255,255,255,.25) 0 1px 0 inset, rgba(0,0,0,.12) 0 4px 20px` (glass rule `.button:hover`) |
| Keyboard focus | `*:focus-visible` | `outline: .2rem solid rgb(135,173,245); outline-offset: .3rem; box-shadow: 0 0 0 .3rem rgb(255,255,255), 0 0 .5rem .4rem rgba(135,173,245,.5)` |
| Small button (banners) | `a.button.button--small` | white bg · text rgb(26,27,24) · 12px 600 uppercase · radius 10px · height 40px |
| Card quick button | card "VIEW PRODUCT" | pixel #28493A = #022917 at 85% on white · lime label |
| Product card | `.card.card--product` | white · `1px solid rgb(236,234,237)` · radius 10px · no shadow |
| Badge (outline) | `span.badge` | bg rgba(255,255,255,.75) + `backdrop-filter: blur(10px)` · `1px solid rgb(2,41,23)` · **radius 2px** · 11px uppercase · padding 7px 10px 5px · `box-shadow: inset 0 1px rgba(255,255,255,.12), 0 2px 8px rgba(0,0,0,.06)` |
| Badge (sale) | `span.badge--onsale` | bg rgba(2,41,23,.75) (pixel #415F51) · white text |
| Quantity button | `.quantity__button` | 36×36 · radius 50% · bg **rgba(2,41,23,.06)** (pixel #F0F2F1) |
| Variant swatch | `.swatch-input__label--square` | 44×44 · radius 3px |
| Breadcrumb / meta | `a.link` | rgba(2,41,23,.75) · 10px uppercase · letter-spacing 1.3px · underline by a background gradient in #ECEAED |
| Subtitle / regular price | `.product__text.subtitle`, `s.price-item--regular` | rgba(2,41,23,.70) |
| Sale price | `.price-item--sale` | rgb(215,44,13) |
| In stock / low stock dot | `.icon--inventory:before/:after` | #54C63A / #F4AF29 (pulsing) |
| Accordion title | `.accordion__title` | 13px uppercase · letter-spacing 3px |
| Footer | `footer.footer` | bg rgb(2,41,23) · white text 18px · headings 10px 700 uppercase, letter-spacing 2px |
| Footer newsletter input | `input.field__input` | bg rgba(2,41,23,.376) · `1px solid rgba(236,234,237,.2)` · white text |
| "Shop by" tiles | pixels | #012917 at the top, #022013 at the bottom: solid green, slightly darker toward the bottom |
| Marker highlight | pixel behind "SPECIAL OFFERS" | #DEEDC6, which is lime #A5CF63 at about 37% on white |
| Mobile dock | `.mobile-dock` (+ glass) | bg rgba(255,255,255,.75) + blur 20px · `border-top: 1px solid rgba(255,255,255,.2)` · `box-shadow: 0 -4px 16px #0000000f` · icons 18px · labels .9rem (9px) uppercase, letter-spacing .13rem, at 75% opacity |
| Smart app banner | page script config | `bannerColor: '#fff'`, `buttonColor: '#022917'`, `buttonTextColor: '#fff'`, icon `Ultramed_-_Icon-Pale-Green-EN.png` |
| `<meta name="theme-color">` | | `#ffffff` |

### 3.4 Status colors on the site

| Meaning | Site value | Where it comes from | Contrast on white |
|---|---|---|---|
| success | #1F7A3A | `--color-success` | 5.38:1 |
| warning | #A86B00 | `--color-warning` (defined, unused) | **4.40:1, just under AA for small text** |
| danger | #C0270B | `--color-critical` / `--color-error` | 5.94:1 |
| info | #1A64F0 | `--color-info` (defined, unused) | 5.09:1 (4.49:1 on its own 9% tint) |
| sale | #D72C0D | `--color-sale-price` | 4.93:1 (commerce only; do not use) |
| stock dots | #54C63A / #F4AF29 | `.icon--inventory` | 2.21 / 1.91 (decorative, always beside a label) |

### 3.5 On the page but not UltraMed's (ignore)

`--gw-*` (Growave loyalty app: #E86C8B, #0B1E47 …), `--xflow-*`, `.rafp-*` (#008060, the font-picker app's own admin UI), payment-method logos, and each product brand's banner colors (TePe blue, Hismile purple, Flash yellow …).

---

## 4. Typography: extracted with evidence

### 4.1 What loads and where it applies

`@font-face` rules on the page:

| Family | Files (exactly as referenced) | Weight / style |
|---|---|---|
| `"DM Sans"` (theme setting `--font-body-family` and `--font-heading-family`) | `//ultramedgcc.com/cdn/fonts/dm_sans/dmsans_n4.ec80bd4dd7e1a334c969c265873491ae56018d72.woff2`, `…n6.70a2453ea926d613c6a2f89af05180d14b3a7c96.woff2`, `…n7.97e21d81502002291ea1de8aefb79170c6946ce5.woff2` (and `i4`, `i6` italics) | 400 / 600 / 700, `font-display: swap` |
| `Font-1742150501083` | `https://cdn.shopify.com/s/files/1/0438/3575/2606/files/FrutigerLTArabic55Roman_9211a963-e853-4deb-a12b-ebe5508ebc34.ttf?v=1742150979` (served as woff2, 47,688 B) | none declared |
| `Font-1742150782918` | `https://cdn.shopify.com/s/files/1/0438/3575/2606/files/FrutigerLTArabic65Bold_94609ab9-a9c9-46b5-a236-b38cc017b5a6.ttf?v=1742150984` (served as woff2, 46,204 B) | none declared |

The rule that applies the two Frutiger faces (an inline `<style>` injected by the Shopify "font-picker" app extension):

```css
body,li,a,em,html[lang="ar"] body {font-family:"Font-1742150501083"!important;}
h1,h2,h3,h4,h5,h6,blockquote,strong,b,html[lang="ar"] h1,…,html[lang="ar"] h6 {font-family:"Font-1742150782918";}
```

The theme's class rules (`.h2`, `.title`, `.badge`, buttons) are more specific than the bare `h2` rule, so in **English** the section titles, product titles, badges and `<button>` CTAs stay **DM Sans**. In **Arabic** the rule `html[lang="ar"] h2` wins, so titles become Frutiger 65 Bold.

| Computed font | English page | Arabic page |
|---|---|---|
| `body`, `p`, `a`, nav links, prices, breadcrumbs, `<a>` buttons | Frutiger LT Arabic 55 Roman (Latin glyphs) | Frutiger LT Arabic 55 Roman |
| Section titles `h2.title`, product title `h1.product__heading.h2` | DM Sans 700, 35px | Frutiger LT Arabic 65 Bold, 35px |
| `<button>` CTA (ADD TO CART), badges | DM Sans 600 / 400 | DM Sans (Latin labels) |
| Testimonial `p`, `strong` | Frutiger LT Arabic 65 Bold | Frutiger LT Arabic 65 Bold |

### 4.2 What each font really is (name tables read from the downloaded files)

**Frutiger LT Arabic 55 Roman and 65 Bold**

- Copyright and vendor: © 1981–2007 **Linotype GmbH** (with Adobe Systems), vendor ID `LINO`, Version 1.00, 2007.
- Designers: **Nadine Chahine and Adrian Frutiger**.
- `fsType` 4 (Preview & Print embedding only).
- 559 glyphs: Basic Latin, Latin-1, Arabic, and Arabic-Indic and Persian digits. Default digits are **tabular** (all 1139 units), with a `pnum` feature for proportional figures.
- Description: "a humanist Kufi … based on the Kufi style but incorporates aspects of Ruqaa and Naskh".
- Quirk: the 65 Bold file's Macintosh family name is mislabelled "Frutiger LT Arabic 45 Light"; its full name and weight class (700) are correct.

License (name ID 13, quoted): "*This font software is a valuable asset of Linotype GmbH. Unless you have entered into a specific license agreement granting you additional rights, your use of this font software is limited to your workstation for your own use. You may not copy or distribute this font software.*" Name ID 0 adds: "*may not be reproduced, used, displayed, modified, disclosed or transferred without the express written approval of Linotype GmbH*".

→ **Not usable in the app.** Self-hosting would copy and distribute it from a public GitHub repository and public GitHub Pages. Whether UltraMed holds a separate web license is unknown (open question §9); even then, a public repository would expose the files.

**DM Sans**

- Copyright 2014 The DM Sans Project Authors. Designers (upstream google/fonts `ofl/dmsans/METADATA.pb` and name ID 9): **Colophon Foundry, Jonny Pinhorn**. **SIL OFL 1.1**, no Reserved Font Name, `fsType` 0 (installable).
- Latin only (no Arabic glyphs). Variable axes `opsz` 9–40 and `wght` 100–1000.
- **No tabular figures:** default digits are proportional (advance widths 656, 342, 589 … units). There is no `tnum` feature and no `.tf` glyphs, in the Shopify files, Google's served files and the upstream `DMSans[opsz,wght].ttf` alike. `ss07` ("Alternative Numbers") only reshapes 1, 3, 4, 6 and 9.

→ **Usable; it is the site's own font.** `font-variant-numeric: tabular-nums` has no effect with it.

### 4.3 The site's type scale (computed)

| Role | Font | Size / line-height | Weight | Tracking | Case |
|---|---|---|---|---|---|
| Section / product title | DM Sans | 35px / 45.5px | 700 | 0.6px | as written |
| Testimonial | Frutiger 65 | 20px / 28px | 400 (bold face) | — | — |
| Body | Frutiger 55 | 16px / 28.8px (1.8) | 400 | — | — |
| Product subtitle | Frutiger 55 | 16px | 400 | 0.5px | — |
| Price | Frutiger 55 | 14px | 400 | 1–1.3px | — |
| Navigation | Frutiger 55 (faux bold) | 12px / 21.6px | 700 | 2.4px (0.2em) | uppercase |
| Buttons | DM Sans / Frutiger | 12px | 600 | 2.4px | uppercase |
| Accordion title | Frutiger 55 | 13px | 400 | 3px | uppercase |
| Badge | DM Sans | 11px | 400 | 1.3px | uppercase |
| Breadcrumb / meta | Frutiger 55 | 10px | 400 | 1.3px | uppercase |
| Footer heading | DM Sans | 10px | 700 | 2px | uppercase |
| Dock label | theme | 9px | 400 | 1.3px | uppercase |

---

## 5. Shape, depth, motion, icons, imagery, layout (site)

- **Radii:** 10px for cards, buttons and the sort control (`--card-radius`, `--button-radius`); 2px badges; 3px swatches; 50% for round icon buttons (quantity, add-to-cart circle); 2rem pill for the glass breadcrumb wrapper.
- **Borders:** 1px #ECEAED everywhere. The header bottom line is #ECEAED at 30%. Inputs use an inset 1px #A69DAB.
- **Shadows:** cards and buttons at rest have none (`--color-shadow` with 0 offsets). Button hover: `inset 0 1px #ffffff40, 0 4px 20px rgba(0,0,0,.12)`. Sticky header / dock: `0 1px rgba(255,255,255,.2), 0 4px 16px #0000000f`. Badge: `0 2px 8px #0000000f`. Popup: `0 8px 32px #0000001f`.
- **Glass** (`component-glass.css`): white at 0.75 + `blur(20px)` on the sticky header, mobile dock, quick-view, sticky filters and popups. Badges and fields use half the blur. Without `backdrop-filter` support the theme falls back to +0.3 opacity.
- **Motion:** `--duration-short .1s`, `--duration-default .25s`, `--duration-long .5s`. Buttons change color over .5s (slow, commerce style), links underline over .25s, the dock slides over .25s.
- **Icons:** thin outline glyphs drawn in `currentColor`: hairline paths (hamburger, account, search) and the wishlist heart at `stroke-width 1.5` on a 24 grid. Rounded terminals; icons are 18–24px. Social icons are filled (Font Awesome style) and only in the footer.
- **Imagery:** packshots on white inside cards; banners carry each product brand's own art and pastel backgrounds; people photography in campaign banners. Nothing applies to an internal sales tool except that photos sit on white in thin-bordered cards with radius 10px.
- **Layout:** `--page-width: 160rem` (1600px max); 50px side margins at 1440; 15px gutters on mobile; header 130px desktop / about 62px mobile; announcement 36px; dock about 58px.
- **Breakpoints** (base.css media queries): 480, **750** (34 rules), **990** (15 rules), 1200.

---

## 6. Logo

### 6.1 Official files (store CDN; downloaded to `redesign-brand/logo/site-*.png`)

All files are PNG, RGBA, transparent, with a 10px transparent margin and flat, exact colors.

| File (`https://ultramedgcc.com/cdn/shop/files/<file>`) | Pixels | Bytes | Color | Used on the site |
|---|---|---|---|---|
| `Ultramed_-_Primary-Logo-Green-EN.png` | 2000×450 | 26,306 | #022917 | header (rendered 222×50), EN and AR |
| `Ultramed_-_Primary-Logo-White-EN.png` | 2000×450 | 20,789 | #FFFFFF | — |
| `Ultramed_-_Primary-Logo-Light-Green-EN.png` | 2000×451 | 27,062 | #A5CF63 | — |
| `Ultramed_-_Primary-Logo-Pale-Green-EN.png` | 2000×451 | 26,447 | #214E39 | — |
| `Ultramed_-_Primary-Logo-Black-EN.png` | 2000×450 | 19,230 | #000000 | — |
| `Ultramed_-_Secondary-Logo-{Green,White,Light-Green,Pale-Green}-EN.png` | 2001×272 (Light-Green 2001×271) | 24,778 / 19,074 / 25,243 / 24,740 | as named | — (wordmark only) |
| `Ultramed_-_Icon-Green-EN.png` | 2001×2077 | 46,106 | #022917 | favicon (`?crop=center&height=32&width=32`) |
| `Ultramed_-_Icon-Light-Green-EN.png` | 2001×2077 | 47,132 | #A5CF63 | footer mark on #022917 |
| `Ultramed_-_Icon-Pale-Green-EN.png` | 2001×2077 | 46,930 | #214E39 | smart-app-banner icon |
| `Ultramed_-_Icon-{White,Black}-EN.png` | 2001×2077 | 40,584 / 38,389 | as named | — |
| Not present (HTTP 404) | — | — | — | `…-AR` variants, an SVG, `Icon-Dark-Green`, `Secondary-Logo-Black` |

Primary = mark + wordmark (ink aspect 4.61:1). Secondary = wordmark only (7.86:1). Icon = mark only (0.963:1, two leaves forming a U). There is **no Arabic logo and no vector file** on the site. The Arabic site uses the EN lockup unmirrored.

### 6.2 The repo's files compared (`safe-wt/www/icons/`, `01-config.js`)

| Repo file | Verdict |
|---|---|
| `logo-green.png` 1067×240, 42,384 B, sha1 33f62c7919… | **Same artwork as `Primary-Logo-Green-EN`.** Same color #022917. Compared at equal height (400px), the column runs of the mark and of each letter match within 1–3px; ink aspect 4.636 vs 4.626; overlap image `logo/compare-primary-green-vs-repo.png`. It is a 53% downscale with softer edges (3.8% semi-transparent pixels vs 0.9%). The official file is sharper and 38% smaller in bytes. |
| `logo-white.png` 1067×240, 24,313 B | Same artwork as `Primary-Logo-White-EN` (aspect 4.636 vs 4.615). |
| `LOGO_DATAURI` in `js/app/01-config.js` (56,512 base64 chars) | **Byte-identical to `logo-green.png`** (same sha1). Used by the sign-in gate (`#gateLogo`, on a white chip: `background:#FFFFFF; border-radius:14px; padding:16px 20px`) and by the exported/printed report brand bar (`13-exports.js:728`, `.mr-brandbar`). |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon-32.png` | **Off-brand:** the lime mark #A5CF63 on **teal #0F5257** (68% of pixels). The teal appears nowhere on the site, in its CSS or HTML, in the logo kit, or in the official iOS app icon (lime on #022917). The mark is 66% of the canvas; its bounding-box diagonal (466px at 512) exceeds the 410px maskable safe circle, so **the leaf tips are cut by circular masks** (preview `logo/proposed-pwa/compare.png`). `manifest.json` lists the same file for both `any` and `maskable`. |

### 6.3 PWA icons: proposed composition (made only as a preview, nothing committed)

- Composition: `Ultramed_-_Icon-Light-Green-EN.png` trimmed of its transparent margin, scaled with Lanczos to **48% of the canvas height**, centered on a flat **#022917** square, opaque. This is how the official iOS app icon is composed (its mark is 48.2% tall, centered).
- Safe zone: the mark's diagonal is 342px at 512, inside the 410px circle, so **one file serves both `any` and `maskable`**.
- Previews: `logo/proposed-pwa/icon-512.png`, `icon-192.png`, `apple-touch-icon.png` (180), and `compare.png` (official iOS icon / proposed / repo today, square and under a circle mask).
- **Favicon:** the site uses `Icon-Green-EN` (dark mark, transparent) at 32×32. For the app, use the same lime-on-#022917 square at 32×32, which stays visible on dark browser tabs. Alternatively copy the site's choice. Either way, use the official file.
- This is composition of the official file. Never trace, redraw, stretch or recolor the mark.

### 6.4 Which official file goes where (recommended)

| Surface | File | Size and notes |
|---|---|---|
| Desktop sidebar (light surface; see §7: the site's navigation is light) | `Primary-Logo-Green-EN.png` → save as `www/icons/logo-green.png` (same name; keeps `sw.js` SHELL and the deck working) | about 30px tall (≈134px wide) |
| Collapsed sidebar (72px rail) / compact mobile top bar | `Icon-Green-EN.png` → new `www/icons/mark-green.png` | 28px tall |
| Any dark-green surface (sign-in brand panel, `surface-inverse` panels) | `Primary-Logo-White-EN.png` → `www/icons/logo-white.png` (same name; the deck uses it too). For a brand moment, `Icon-Light-Green-EN` (the footer's choice). | white logo 32–40px tall |
| Sign-in gate (`#gateLogo`) | On a white card: `LOGO_DATAURI` re-encoded from the official `Primary-Logo-Green-EN.png` (about 35 KB of base64 instead of 56.5 KB), and **drop the white "chip" workaround**. On a dark panel: the white logo file (add `icons/logo-white.png` to `sw.js` SHELL so the gate works offline on first run). | 200–230px wide |
| More screen header (`index.html:881`, green logo on a white chip) | `icons/logo-green.png` on the light surface, without the chip | 40–48px tall |
| Printed / exported reports brand bar (`.mr-brandbar`) | keep `LOGO_DATAURI` (exports must be self-contained), re-encoded from the official file | — |
| Weekly deck (`15-weekly-deck.js`: `icons/logo-white.png`, `icons/logo-green.png`) | same file names replaced by the official files. Box aspects 2.4×0.54 / 1.25×0.28 / 2.8×0.63 ≈ 4.44 equal the official 2000/450 = 4.444. **Run `tests/e2e/weekly-deck.e2e.js` after.** | — |
| PWA (`manifest.json`, `apple-touch-icon`, `favicon`) | composed icons per §6.3 (overwrite `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon-32.png`; keep the names) | 192 / 512 / 180 / 32 |
| `theme-color` / manifest colors | `#022917` stays valid (it matches the official app icon). If the redesigned mobile top bar is white, set `<meta name="theme-color" content="#FFFFFF">` (the site's value) so the status bar matches the bar; keep the manifest `background_color: #022917` (splash with the lime mark, as the native app does). | — |

**Rules**

- Never redraw, recolor (only the five official colorways exist), stretch, add effects to, or mirror the logo in RTL.
- Clear space of at least half the logo's height on every side (this is my recommendation; the site publishes no guideline).
- Minimum size: Primary lockup 24px tall on screen; below that use the Icon.
- `alt="UltraMed"` stays.
- Copy the official files byte-for-byte (`curl` the URLs above). They are public, UltraMed's own, and the repo already holds the same artwork.

---

## 7. Recommended design tokens for the app

### 7.1 Tokens (paste into `:root` in `www/index.html`)

```css
:root{
  /* Brand: official logo kit and the site's theme settings */
  --brand-primary:#022917;          /* logo "Green"; site text, headings, CTA background (--color-base-text/-accent 2,41,23) */
  --brand-primary-hover:#133727;    /* the site's own hover: #022917 at 93.3% on white (.button:hover), plus --shadow-hover */
  --brand-primary-pressed:#011A0E;  /* derived darker step for :active (not on the site) */
  --brand-primary-soft:#F0F2F1;     /* the site's 6% tint (quantity buttons): hover fills, ghost buttons */
  --brand-secondary:#A5CF63;        /* logo "Light-Green": labels and icons ON dark green, indicators, highlight fills. Never text on light surfaces (1.79:1). */
  --brand-secondary-soft:#EBF4DD;   /* lime at 22%: selected and active fills under #022917 text (13.9:1); site marker is the 37% #DEEDC5 */
  --brand-tertiary:#214E39;         /* logo "Pale-Green": secondary emphasis on light (9.49:1), second chart series, icons */

  /* Surfaces */
  --surface-page:#F6F8F7;           /* #022917 at 3.5% on white: the site's own tint method; neutral, not "green" */
  --surface-card:#FFFFFF;           /* site cards: white + 1px border, no shadow */
  --surface-elevated:#FFFFFF;       /* + --shadow-lg: menus, popovers, dialogs, sheets */
  --surface-sunken:#F0F2F1;         /* wells, table header band, progress tracks, segmented-control track */
  --surface-inverse:#022917;        /* brand panels (sign-in panel, primary band), the site's announcement bar and footer */
  --surface-glass:rgba(255,255,255,.75); /* sticky mobile top bar and bottom nav only (site glass); solid #FFF fallback */
  --glass-blur:20px;

  /* Text */
  --text-primary:#022917;           /* 15.76:1 on white, 14.78:1 on page */
  --text-secondary:#415F51;         /* site rgba(2,41,23,.75): breadcrumbs, inventory; 7.05:1 white, 6.61:1 page */
  --text-muted:#4E695D;             /* site rgba(2,41,23,.70): subtitles, compare-at price; 6.00:1 / 5.62:1. Lightest allowed for text. */
  --text-disabled:#8D9F97;          /* #022917 at 45%; disabled controls only (exempt from contrast rules) */
  --text-on-brand:#FFFFFF;          /* on #022917: 15.76:1 */
  --text-on-brand-accent:#A5CF63;   /* the site's CTA label colour on #022917: 8.79:1 */
  --text-on-inverse-muted:#B8C3BE;  /* white at 72% on #022917: 8.70:1 */

  /* Borders and focus */
  --border-subtle:#ECEAED;          /* site --color-base-border: hairlines, card borders, dividers (decorative) */
  --border-strong:#7B9086;          /* #022917 at 52%: input, select and checkbox outlines (3.40:1 white, 3.19 page, 3.02 sunken). The site's #A69DAB is 2.61:1. */
  --focus-ring:#022917;             /* 2px ring, 2px offset, on light surfaces. The site's #87ADF5 is only 2.25:1. */
  --focus-ring-on-dark:#A5CF63;     /* on #022917: 8.79:1 */

  /* Status: semantic, never the brand green, always with an icon and a word */
  --status-success:#1F7A3A;  --status-success-soft:#E9F2EB;   /* site --color-success; 5.38:1 white, 4.71:1 on soft */
  --status-warning:#8A5800;  --status-warning-soft:#F6F0E6;   /* ink darkened from the site's #A86B00 (4.40:1): 6.04:1 / 5.33:1 */
  --status-warning-fill:#A86B00;                              /* site value: bars and dots only, never small text */
  --status-danger:#C0270B;   --status-danger-soft:#F9ECE9;    /* site --color-critical / --color-error; 5.94:1 / 5.15:1 */
  --status-info:#1554CC;     --status-info-soft:#EAF1FE;      /* ink darkened from the site's #1A64F0 (4.49:1 on its soft): 6.62:1 / 5.84:1 */
  --accent-gold:#B8841A;                                      /* site --color-accent-strong: category accents (gifts, exchanges), borders and fills only */

  /* Data visualisation (minimal; the dashboard worker validates with the dataviz skill) */
  --chart-1:#022917;                /* actual / current period */
  --chart-2:#7B9086;                /* comparison / previous period (3.4:1 on white) */
  --chart-3:#A5CF63;                /* highlight fill only, with dark labels or an outline; never the only cue */
  --chart-grid:#ECEAED; --chart-label:#4E695D;

  /* Radius: small for controls, medium for cards, large only for major panels (spec 3.4) */
  --radius-xs:4px;                  /* badges, tags, status pills (site badges 2px, swatches 3px: crisp) */
  --radius-sm:6px;                  /* checkboxes, small chips, tooltips */
  --radius-md:10px;                 /* buttons, inputs, selects, cards, list groups (= site --button-radius / --card-radius) */
  --radius-lg:16px;                 /* dialogs, sheets, drawers, major panels */
  --radius-pill:999px;              /* round icon buttons, FAB, avatars, switches */

  /* Elevation: the site's own values; cards at rest have none */
  --shadow-sm:0 2px 8px rgba(0,0,0,.06);     /* site .badge */
  --shadow-md:0 4px 16px rgba(0,0,0,.06);    /* site sticky header and mobile dock */
  --shadow-lg:0 8px 32px rgba(0,0,0,.12);    /* site .popup: dialogs, menus, sheets */
  --shadow-hover:inset 0 1px 0 rgba(255,255,255,.25),0 4px 20px rgba(0,0,0,.12); /* site primary-button hover */

  /* Spacing: 4px grid */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:20px; --space-6:24px;
  --space-8:32px; --space-10:40px; --space-12:48px; --space-16:64px;

  /* Layout */
  --sidebar-w:248px; --sidebar-w-collapsed:72px; --topbar-h:60px; --bottomnav-h:64px;
  --content-max:1200px; --gutter-mobile:16px; --gutter-desktop:32px; --tap-min:44px;

  /* Type (section 8) */
  --font-sans:'UM Figures','UM Sans','UM Arabic',system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans Arabic',Tahoma,sans-serif;
  --fs-display:32px; --fs-title:24px; --fs-section:18px; --fs-card-title:15px; --fs-kpi:26px;
  --fs-body:15px; --fs-small:14px; --fs-label:14.5px; --fs-caption:12.5px; --fs-overline:11px;
  --lh-tight:1.15; --lh-title:1.25; --lh-body:1.55; --lh-body-ar:1.7; --track-overline:.12em;

  /* Motion: spec 150-220ms for hover and focus; the site's default is .25s */
  --dur-fast:120ms; --dur-base:180ms; --dur-slow:240ms;
  --ease-standard:cubic-bezier(.2,0,0,1); --ease-exit:cubic-bezier(.4,0,1,1);
}
@media (max-width:749px){ :root{ --fs-display:28px; --fs-title:22px; --fs-section:17px; --fs-kpi:24px; --fs-body:16px; --fs-label:15px; } }
@media (prefers-reduced-motion:reduce){ :root{ --dur-fast:.01ms; --dur-base:.01ms; --dur-slow:.01ms; } }
```

**Breakpoints** (CSS variables cannot be used in media queries, so use these constants). They follow the site's own: **480**, **750** (phone → tablet; the site's dock disappears at 750), **990** (desktop navigation), **1200**, plus **1440** for wide desktop.

- Below 750: bottom navigation, single column, 16px gutters.
- 750–989: tablet (bottom navigation or a 72px rail).
- 990 and up: sidebar.

**How to use the palette (spec §1: "green with discipline")**

- **Light sidebar and top bar.** The site's navigation is white with dark-green text. The active item is a `--brand-secondary-soft` pill with `--text-primary` at weight 600 and a 3px `--brand-primary` indicator on the inline-start edge; hover is `--brand-primary-soft`.
- **Dark green is reserved** for primary actions, the mobile "Log a visit" action and brand panels.
- **The lime accent appears only on dark green** (the site's CTA label style) or as the selected-state fill.
- **Cards and charts stay mostly neutral:** the primary series in `--chart-1`, everything else neutral.
- **Status color only where something has a status.**

Rendered board: `redesign-brand/specimen/token-board.png` (sidebar, KPI cards in EN and AR, controls at rest, hover and focus, badges, swatches, mobile docks in LTR and RTL, the white logo on #022917).

### 7.2 Contrast (computed, WCAG 2.x relative luminance; script `brand-scripts/contrast.js`)

| Pair | Ratio | Result |
|---|---|---|
| #022917 text on #FFFFFF / on page #F6F8F7 / on sunken #F0F2F1 | 15.76 / 14.78 / 14.02 | AAA |
| #415F51 secondary on white / page / sunken / lime-soft | 7.05 / 6.61 / 6.27 / 6.21 | AA (AAA on white) |
| #4E695D muted on white / page / sunken / lime-soft | 6.00 / 5.62 / 5.33 / 5.29 | AA |
| #022917 at 60% (#677F74) on white | 4.32 | fails for small text, so never go lighter than `--text-muted` |
| #A5CF63 on #022917 (CTA label) / on hover #133727 | 8.79 / 7.30 | AAA |
| #FFFFFF on #022917 / on #214E39 | 15.76 / 9.49 | AAA |
| #A5CF63 on white | 1.79 | **fail**: never lime text or lone lime marks on white |
| #022917 on #EBF4DD (selected) / on #DEEDC5 (site marker) | 13.90 / 12.78 | AAA |
| #7B9086 border-strong on white / page / sunken | 3.40 / 3.19 / 3.02 | passes 1.4.11 (3:1) |
| site #A69DAB / #87ADF5 on white | 2.61 / 2.25 | fail 1.4.11, so not used for inputs or focus |
| success #1F7A3A on white / on #E9F2EB | 5.38 / 4.71 | AA |
| warning site #A86B00 on white / ink #8A5800 on white / on #F6F0E6 | 4.40 / 6.04 / 5.33 | site value fails; ink passes |
| danger #C0270B on white / on #F9ECE9 | 5.94 / 5.15 | AA |
| info site #1A64F0 on #EAF1FE / ink #1554CC on white / on soft | 4.49 / 6.62 / 5.84 | ink passes |
| app today: `--muted` #4E5A53 on white / on `--paper` | 7.21 / 5.81 | (for reference) |
| held v123 `--soft` #86928B on white | 3.23 | **fails for text**; only for icons and chevrons (map to `--text-muted` for text) |
| held v123 `--accent` #1E7A55 on white | 5.29 | passes, but it is not a brand colour (§7.6) |

### 7.3 Categorical colours (suggested for the calendar; confirm in that module's redesign)

Shape and icon carry the type; colour only supports it.

| Type | Colour | Shape |
|---|---|---|
| Logged visit | `--brand-primary` | solid dot |
| Planned visit | `--brand-primary` | hollow ring (or a `--brand-secondary` fill with dark text) |
| Follow-up due | `--status-warning` | — |
| Task | `--text-secondary` | square |
| Event | `--status-info` | — |

Overdue items add the word "Overdue" with `--status-danger`. Never use colour alone (spec §10).

### 7.4 Component cues taken from the site (for the design-system worker)

- **Primary button:** `--brand-primary` background, white label for app actions (sentence case, 14.5–15px, weight 600), 44px desktop / 48–52px mobile, `--radius-md`. Hover: `--brand-primary-hover` + `--shadow-hover` over `--dur-base`. The site's lime uppercase label (8.79:1) can mark the single hero action per screen (for example "Log a visit") so lime stays scarce.
- **Secondary button:** white with an inset 1px `--border-strong`, `--text-primary` label. **Ghost:** transparent, `--brand-primary-soft` on hover.
- **Inputs:** white, inset 1px `--border-strong`, `--radius-md`, at least 44px tall, 16px text on mobile (prevents iOS zoom). Focus: ring `0 0 0 3px rgba(2,41,23,.12)` + a 1px `--brand-primary` outline, or the `--focus-ring` 2px outline with 2px offset for keyboard focus (`:focus-visible`).
- **Badges / pills:** `--radius-xs`, 12px weight 600, soft status background + status ink + a 6px dot or icon (site badges are crisp rectangles).
- **Cards:** `--surface-card`, 1px `--border-subtle`, `--radius-md`, no shadow at rest, padding 16 / 20 / 24px.
- **Round icon buttons:** 44px (site 36px is below the touch minimum), `--radius-pill`, `--brand-primary-soft` background (site quantity button).
- **Mobile bottom navigation:** like the site's dock (glass white, top hairline, `--shadow-md` upward). Labels at 11px weight 500 (not 9px uppercase), icons 22px with stroke 1.75. Active: `--text-primary` at weight 600 with a 3px lime indicator. Inactive: `--text-muted`. Respect `env(safe-area-inset-bottom)`.
- **Mobile filters:** one full-width "Filters" control opening a sheet, as the site's "FILTER AND SORT" does.
- **Overline labels** (table headers, sidebar groups, KPI eyebrows): 11px weight 600 uppercase, `--track-overline`, `--text-secondary`. Latin only; Arabic gets 12.5px weight 600 and no tracking.
- **Icons:** keep the app's own inline line icons (`.svgi`, 24 grid, round caps, Lucide-style paths) as the single family. Set `stroke-width: 1.75` (the site's icons are lighter, about 1–1.5px) and size 20px in navigation, 18px inline, all in `currentColor`. Replace emoji in navigation and core UI (spec §3.5).

### 7.5 Mapping the app's current tokens (`safe-wt/www/index.html` `:root`; usage counts are `var(--x)` occurrences in CSS / in `js/app/*.js`)

Keep every old name as an **alias** of a new token, so the generated markup (`--muted` alone has 432 JS uses) adopts the new palette without touching the logic files. Then migrate hot spots by hand. There are also 101 hard-coded hex colors in the CSS and 188 in `js/app` to convert.

| Current | Value | Uses css / js | What it does today | New token |
|---|---|---|---|---|
| `--ink` | #1C1C1E | 13 / 10 | body text (iOS black) | `--text-primary` #022917 |
| `--ink-2` | #3A3A3C | 0 / 2 | secondary text | `--text-secondary` |
| `--paper` | #D6ECDD | 14 / 18 | mint page; progress tracks, textarea and photo backgrounds | `--surface-sunken` (page background becomes `--surface-page`) |
| `--card` | #EBF2EC | 15 / 0 | mint cards | `--surface-card` #FFFFFF |
| `--green`, `--green-deep` | #022917 | 20 / 8, 2 / 0 | primary | `--brand-primary` |
| `--green-dark` | #0B3D22 | 12 / 3 | gradient top, hovers, small badge text | `--brand-primary-hover` (as text: `--brand-primary`) |
| `--green-dim` | #C4E4CE | 8 / 3 | round number badges and soft fills | `--brand-secondary-soft` |
| `--green-soft` | #9ED0AF | 6 / 0 | `.stamp` circle and accents | `--brand-secondary` (with #022917 text, 8.79:1) |
| `--teal`, `--teal-dim` | aliases | 10 / 26, 3 / 6 | progress fills, prescription lines | `--brand-primary`, `--brand-secondary-soft` |
| `--on-green` | #FFFFFF | 0 / 0 | — | `--text-on-brand` |
| `--gold` | #C9A664 | 2 / 10 | category stripe (doctor cards, gifts, exchange lines) | `--accent-gold` #B8841A |
| `--gold-ink` | #7A5C22 | 0 / 10 | middle tier of the 3-tier achievement colour (≥60%) | `--status-warning` #8A5800 |
| `--coral`, `--coral-dim`, `--coral-ink` | #FF3B30, #FFEBEA, #BE1D12 | 5 / 27, 2 / 5, 5 / 59 | overdue / negative | `--status-danger`, `-soft`, `--status-danger` |
| `--amber`, `--amber-dim`, `--amber-ink` | #FF9500, #FFF4E5, #9A5B00 | 1 / 24, 4 / 21, 4 / 32 | behind / due | `--status-warning-fill`, `--status-warning-soft`, `--status-warning`. White text on amber fails, so use `--status-warning` as such a background. |
| `--sage`, `--sage-dim`, `--sage-ink` | #34C759, #E8F8EC, #1B7A36 | 7 / 17, 2 / 3, 3 / 31 | good / ≥100% bars | `--status-success`, `-soft`, `--status-success` (#1B7A36 ≈ the site's #1F7A3A) |
| `--line` | #E5E5EA | 24 / 49 | hairlines | `--border-subtle` #ECEAED |
| `--muted` | #4E5A53 | 50 / 432 | secondary text | `--text-muted` #4E695D (6.00:1) |
| `--purple`, `-dim`, `-ink` | #5E5CE6, #ECECFE, #4644C9 | 1 / 4, 1 / 1, 2 / 3 | category (email-sourced tasks, some cards) | `--status-info`, `-soft`, `--status-info` |
| `--radius` | 16px | 7 / 0 | cards and sheets | cards `--radius-md` 10px; sheets and dialogs `--radius-lg` 16px |

Fonts to replace:

- `h1,h2,h3,.disp`, `.gate-word` and `.pr-letterhead .brand` use **Fraunces** (serif, Google Fonts CDN, lines 15–17). It is not a brand font and is not cached by `sw.js`, which ignores cross-origin requests other than the Firebase SDK, so offline it falls back to Georgia.
- `body` uses the system stack.
- `body.ar h1…` uses `'Segoe UI','Noto Naskh Arabic','Geeza Pro',Tahoma`.

All become `var(--font-sans)` (§8). Keep `body.ar *{letter-spacing:0 !important}` (index.html:379); it already enforces the no-tracking-in-Arabic rule the site follows.

### 7.6 Mapping the held v123 main screen (`home-wt/www/index.html` lines 37–38)

| Held token | Value | New token | Note |
|---|---|---|---|
| `--page` | #F3F6F3 | `--surface-page` #F6F8F7 | |
| `--surface` | #FFFFFF | `--surface-card` | |
| `--hair` | #E3EAE5 | `--border-subtle` #ECEAED | |
| `--soft` | #86928B | text: `--text-muted`; icons and chevrons: `--border-strong` #7B9086 | 3.23:1, fails for text |
| `--accent` | #1E7A55 | `--brand-primary` (buttons, bars, links); `--brand-secondary` for the bottom-nav "+" icon on the dark circle | #1E7A55 is the weekly deck's "Ultramed green" (CLAUDE.md v110). It is not on ultramedgcc.com and not in the official logo files. |
| `--accent-soft` | #E4F2EA | `--brand-secondary-soft` #EBF4DD | |
| `--track` | #E8EEEA | `--surface-sunken` #F0F2F1 | |

The deck (`15-weekly-deck.js`, PPTX with Calibri, 0B2A1B / 1E7A55 / F2B705) is a generated file with its own approved look. Out of scope; leave it.

---

## 8. Typography for the app

### 8.1 Decision

| Role | Font | Why |
|---|---|---|
| Latin text (all UI) | **DM Sans** (variable, `opsz` 9–40, `wght` 100–1000), OFL 1.1 | It is the site's own font: section titles, product titles, `<button>` CTAs and badges. It is licensable, a refined low-contrast geometric sans, and one 62.7 KB file covers every weight. |
| Arabic text | **IBM Plex Sans Arabic** 400 + 600, OFL 1.1 (Reserved Font Name "Plex"), designers Mike Abbink, Bold Monday, Khajag Apelian, Wael Morcos | It is the closest OFL relative of the site's Frutiger LT Arabic: a humanist, Kufi-structured Arabic with gentle modulation and calm, compact proportions. It sits at an even colour next to DM Sans at 400 and 600, and has full Arabic coverage (252/256 of U+0600–06FF, all Arabic-Indic digits and ، ؛ ؟ ٪ ٫ ٬). Seen side by side in `specimen/type-study.png` and `specimen/arabic-closeup.png` (40px). |
| Figures (digits, %, +, −) in every context | **IBM Plex Sans Arabic's Latin digits** through a digits-only `@font-face` named "UM Figures", first in the stack | DM Sans has **no tabular figures** (§4.2). Plex's Latin digits are **tabular by default** (all 600 units), as the Frutiger digits on the site's prices are. The app shows Western digits in both languages (`toLocaleString('en-US')`, `ar-KW-u-nu-latn`), so one figures face gives aligned columns and steady live numbers everywhere. Verified in `specimen/figures-test.png`: with DM Sans, "1,111.000" visibly pulls in; with Plex the columns align in English and Arabic, and the digits sit well beside DM Sans letters. |

**Why not the alternatives** (all OFL; measured: the width of the same phrase at 40px, where Frutiger 55 is 292px)

| Font | Width | Verdict |
|---|---|---|
| Readex Pro | 308px | Arabic co-designed by Nadine Chahine, Frutiger Arabic's designer, and only 22.9 KB. But it reads a weight heavier and rounder than DM Sans at 400 and lacks گ/ی. A fine second choice if bytes matter most. |
| Noto Kufi Arabic | 307px | geometric and mechanical, wide spacing, 123.7 KB, very tall Latin line metrics |
| Alexandria | — | very wide and display-like |
| Tajawal | — | small next to DM Sans; missing ٫ ٬ ٱ گ ی |
| Noto Sans Arabic | — | Naskh-style, 166 KB, does not match the site's Kufi Frutiger |
| Frutiger LT Arabic | — | not licensable (§4.2) |

### 8.2 Files

Download once from Google Fonts' static host and commit them under `www/fonts/`. All URLs answered 200 on 13 Nov 2026; sizes and hashes are of the files fetched. **Ship the IBM Plex files exactly as served:** no re-subsetting or instancing, because of its Reserved Font Name; a CSS alias does not modify the file. DM Sans has no Reserved Font Name and may be instanced if ever needed.

| Save as `www/fonts/…` | Source URL | Bytes | sha256 (first 16) | Covers |
|---|---|---|---|---|
| `dm-sans-latin-var.woff2` | `https://fonts.gstatic.com/s/dmsans/v17/rP2Hp2ywxg089UriCZOIHQ.woff2` | 62,724 | ca72d2bcea8f4daa | DM Sans latin subset, `wght` 100–1000, `opsz` 9–40 (one file for 400/500/600/700) |
| `ibm-plex-sans-arabic-arabic-400.woff2` | `https://fonts.gstatic.com/s/ibmplexsansarabic/v15/Qw3CZRtWPQCuHme67tEYUIx3Kh0PHR9N6Ys43PWrfQ.woff2` | 42,848 | 6010e7fd0dce5d52 | Arabic 400 (also serves 500) |
| `ibm-plex-sans-arabic-arabic-600.woff2` | `https://fonts.gstatic.com/s/ibmplexsansarabic/v15/Qw3NZRtWPQCuHme67tEYUIx3Kh0PHR9N6YPi-OCRXMR5Kw.woff2` | 45,688 | 16734a5adb27b0f3 | Arabic 600 (also serves 700) |
| `ibm-plex-sans-arabic-latin-400.woff2` | `https://fonts.gstatic.com/s/ibmplexsansarabic/v15/Qw3CZRtWPQCuHme67tEYUIx3Kh0PHR9N6Ys93PU.woff2` | 19,164 | 9ed8dcb02e6c7246 | "UM Figures" 400 |
| `ibm-plex-sans-arabic-latin-600.woff2` | `https://fonts.gstatic.com/s/ibmplexsansarabic/v15/Qw3NZRtWPQCuHme67tEYUIx3Kh0PHR9N6YPi-OCUXMQ.woff2` | 20,500 | 63f4757271e403f7 | "UM Figures" 600 |
| `OFL-DMSans.txt` | `https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt` | 4,482 | — | the license must travel with the fonts (OFL condition 2) |
| `OFL-IBMPlexSansArabic.txt` | `https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsansarabic/OFL.txt` | 4,456 | — | same (first line: "Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"") |

- **Total: 190,924 B (about 186 KiB)** for 3 weights in Latin and 2 files per role in Arabic and figures. The Fraunces CDN download goes away.
- Optional 500-weight Arabic (`…/Qw3NZRtWPQCuHme67tEYUIx3Kh0PHR9N6YPO_-CRXMR5Kw.woff2`, 45,296 B) only if 500 must differ from 400.
- Local copies of every file are in `redesign-brand/fonts/gf/` (and `fonts/upstream/` for the full DM Sans TTF and the METADATA/OFL files).

### 8.3 CSS

Paste at the top of the `<style>` block. The `unicode-range` values for latin and arabic are Google's published ones.

```css
@font-face{font-family:'UM Sans';font-style:normal;font-weight:100 1000;font-display:swap;
  src:url('fonts/dm-sans-latin-var.woff2') format('woff2');
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}
@font-face{font-family:'UM Arabic';font-style:normal;font-weight:400 500;font-display:swap;
  src:url('fonts/ibm-plex-sans-arabic-arabic-400.woff2') format('woff2');
  unicode-range:U+0600-06FF,U+0750-077F,U+0870-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC;}
@font-face{font-family:'UM Arabic';font-style:normal;font-weight:600 700;font-display:swap;
  src:url('fonts/ibm-plex-sans-arabic-arabic-600.woff2') format('woff2');
  unicode-range:U+0600-06FF,U+0750-077F,U+0870-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC;}
/* Digits only: tabular figures everywhere. Do NOT add U+0020/U+00A0 (space) to this range: the "first available font"
   (line metrics) is the first face whose range covers the space, which keeps DM Sans' metrics. Comma and period stay DM Sans. */
@font-face{font-family:'UM Figures';font-style:normal;font-weight:400 500;font-display:swap;
  src:url('fonts/ibm-plex-sans-arabic-latin-400.woff2') format('woff2');unicode-range:U+0030-0039,U+0025,U+002B,U+2212;}
@font-face{font-family:'UM Figures';font-style:normal;font-weight:600 700;font-display:swap;
  src:url('fonts/ibm-plex-sans-arabic-latin-600.woff2') format('woff2');unicode-range:U+0030-0039,U+0025,U+002B,U+2212;}

html{font-family:var(--font-sans);font-synthesis-weight:none;-webkit-font-smoothing:antialiased;}
body{font-size:var(--fs-body);line-height:var(--lh-body);color:var(--text-primary);background:var(--surface-page);}
body.ar{line-height:var(--lh-body-ar);}
.num,.kpi-value,td.num{font-variant-numeric:tabular-nums;} /* harmless with UM Figures; keeps intent explicit */
```

- `font-synthesis-weight:none` prevents the site's faux-bold mistake. Each requested weight maps to a real file: 400–500 to the 400 Arabic file, 600–700 to the 600 file.
- In the Google range above, the Arabic `unicode-range` is trimmed of the SMP blocks (U+102E0…, U+10E60…, U+1EE00…: Rumi numerals, Arabic extended and math symbols) the app never uses; this is harmless. Keep it whole if preferred.
- Preload the Latin file: `<link rel="preload" href="fonts/dm-sans-latin-var.woff2" as="font" type="font/woff2" crossorigin>`. Optionally preload `ibm-plex-sans-arabic-latin-600.woff2`, used for KPI figures.
- Remove: index.html lines 15–17 (Google Fonts preconnects and the Fraunces stylesheet) and every `'Fraunces'` reference (`h1,h2,h3,.disp`, `.gate-word`, `.pr-letterhead .brand`); line 38's system stack; line 378's Arabic heading stack.

### 8.4 Type scale (desktop / mobile below 750px)

DM Sans for Latin, Plex for Arabic, UM Figures for digits.

| Role | Desktop | Mobile | Weight | Line-height | Latin tracking | Notes |
|---|---|---|---|---|---|---|
| Display: hero KPI on the executive dashboard | 32px | 28px | 600 | 1.15 | −0.01em | figures face |
| Page title (h1) | 24px | 22px | 600 | 1.25 | −0.005em | the site's 35/700 is marketing scale; the app is calmer (spec: avoid oversized headings) |
| Section title (h2) | 18px | 17px | 600 | 1.35 | 0 | |
| Card title (h3) | 15px | 15px | 600 | 1.4 | 0 | |
| KPI value (card) | 26px | 24px | 600 | 1.15 | −0.01em | unit (KD / د.ك) at 14px weight 500 in `--text-secondary` |
| Body | 15px | 16px | 400 | 1.55 (Arabic 1.7) | 0 | form inputs always ≥16px on mobile |
| Small / table cell | 14px | 14px | 400 | 1.45 (Arabic 1.6) | 0 | |
| Label / nav item / button | 14.5px | 15px | 500 (nav), 600 (button) | 1.2 | 0 | sentence case |
| Caption / metadata | 12.5px | 12.5px | 500 | 1.4 | 0 | Arabic minimum 12px |
| Overline: eyebrow, table header, sidebar group | 11px | 11px | 600 | 1.2 | **0.12em, uppercase** | the site's signature tracked caps (nav 12px/0.2em, meta 10px/0.13em). **Latin only.** Arabic: 12.5px weight 600, no tracking, no case. |

Three weights (400, 500, 600) are enough; 700 is not needed. The DM Sans variable file serves all of them; Arabic has two files.

### 8.5 Rules

- **Arabic:** letter-spacing 0, never `text-transform`, line-height +0.15, the same font-size as Latin (Plex Arabic and DM Sans balance at equal size, `specimen/arabic-closeup.png`), and mirrored layout. The logo is never mirrored.
- **Numbers:** keep the app's Western digits and its existing formatting (`toLocaleString('en-US')`, `ar-KW-u-nu-latn`, `UMCore.money`). In RTL, put a figure with its unit or sign in its own element (`<bdi>` or `unicode-bidi:isolate`) and check the screenshots. In my RTL test, "33%" at the end of a sentence rendered as "%33". Keep whatever the app already does for percentages and negatives (CLAUDE.md: the deck's `wdArBidi`; the v123 "Arabic negatives" fix).
- **Offline / PWA:**
  - Add the five font files to `SHELL` in `www/sw.js` (`'./fonts/dm-sans-latin-var.woff2'`, …). `install` uses `cache.addAll`, so a missing file fails the install: commit them all.
  - Bump `APP_REV` and `CACHE` together (CLAUDE.md). Same-origin fonts are also runtime-cached by the existing fetch handler.
  - `scripts/build.js` copies `www/` wholesale (`copyDir`), so `fonts/` reaches `dist/`.
  - `tests/confidential.test.js` already skips `.woff2/.ttf` as binary (line 22). The OFL texts hold no contacts.
- **Exports:** standalone exported HTML reports that reference `fonts/…` relatively will fall back to system fonts when opened elsewhere. That is acceptable; they keep `LOGO_DATAURI` for the brand bar.

---

## 9. Open questions for the owner (none blocks the redesign)

1. **Frutiger LT Arabic:** does UltraMed hold a web or app license from Monotype/Linotype? The site's files carry the desktop "workstation only, may not copy or distribute" notice. Even with a license, the public repository would expose the files, so the plan uses DM Sans + IBM Plex Sans Arabic.
2. **PWA icon:** adopt the official app-icon look (lime mark on #022917) in place of today's teal square? This changes the home-screen icon on every phone after the update.
3. **Lime CTA labels:** the site labels primary buttons in lime on dark green. The plan keeps white labels for app actions and reserves lime for one hero action per screen ("Log a visit"). Confirm the preference.
4. **Brand name in Arabic UI:** the site's app banner writes "ألترامد". Should the app's Arabic texts use it, or keep "UltraMed" in Latin? Today the Arabic UI keeps the Latin logo, which is correct either way.

---

## 10. Evidence index

Base: `/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/redesign-brand/`

**Screenshots** (1× DPR; `-first` = as loaded with the promo popup, `-view` = first screen after closing it, `-seg1..n` = the page in two-screen segments, `-full.jpg` = whole page)

- `home-1440-*.png`, `home-390-*.png`
- `collection-1440-*.png`, `collection-390-*.png`
- `product-1440-*.png`, `product-390-*.png`
- `ar-home-1440-*.png`, `ar-home-390-*.png`

**Page sources and computed-style dumps**

- `probe/html/home.html`, `probe/html/ar-home.html`
- `probe/json/home.json`, `probe/json/ar-home.json`: every `:root` variable, `@font-face` rule and computed element style
- `probe/json/product-states.json`: rest, hover and focus states

**Theme CSS:** `css/base.css`, `component-glass.css`, `section-mobile-dock.css`, `section-announcement-bar.css`, `component-card.css`, `section-footer.css`, `component-price.css`, `component-list-menu.css`, `section-collection-list.css`, `component-search.css`, `component-free-shipping.css`, `font.css` (the font-picker's admin UI only)

**Fonts**

- `fonts/site/`: the site's DM Sans n4/n6/n7 and the two Frutiger files (kept for evaluation only; never ship)
- `fonts/gf/`: Google Fonts CSS and woff2 for DM Sans, IBM Plex Sans Arabic, Readex Pro, Noto Kufi Arabic, Alexandria, Tajawal, Noto Sans Arabic
- `fonts/upstream/`: `DMSans[opsz,wght].ttf`, METADATA.pb files, OFL texts

**Logo**

- `logo/site-Ultramed_-_*.png`: 14 official files
- `logo/appstore/app-icon-512.png`: the official iOS icon
- `logo/app-embedded/LOGO_DATAURI.png`: decoded from `01-config.js`
- `logo/compare-primary-green-vs-repo.png`, `logo/compare-primary-white-vs-repo.png`: overlays
- `logo/logo-kit-board.png`: all variants against the repo's
- `logo/proposed-pwa/`: composed icons and the mask comparison

**Specimens and boards**

- `specimen/type-study.png`: all Arabic candidates, Frutiger reference, figure columns
- `specimen/arabic-closeup.png`: 40px comparison with measured widths
- `specimen/figures-test.png`: DM Sans digits vs UM Figures, EN and AR
- `specimen/token-board.png`: proposed tokens rendered (each has its `.html` source)

**Scripts:** `/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/brand-scripts/`
