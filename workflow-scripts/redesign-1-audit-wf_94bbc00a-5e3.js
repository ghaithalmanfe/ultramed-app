export const meta = {
  name: 'redesign-1-audit',
  description: 'Premium redesign, step 1: extract the real UltraMed brand from ultramedgcc.com and map every screen, modal and harness contract of the app',
  phases: [
    { title: 'Audit', detail: 'brand extraction (colors, fonts, logo, styles, with evidence); UI inventory with the harness contracts and proposed module lanes' },
  ],
}
const S = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad'
const SPEC = S + '/redesign-src/unz/ULTRAMED_PREMIUM_REDESIGN.md'
const DOCS = S + '/redesign-docs'
const STR = { type: 'string' }
const STRS = { type: 'array', items: STR }
const BOOL = { type: 'boolean' }

const COMMON = `The UltraMed field-sales PWA (CLAUDE.md is loaded; its house rules decide every doubt). The owner (13 Nov) asked for a complete premium redesign of the whole app, desktop and mobile, implemented in the codebase, with every function, figure, data and integration preserved. THE SPEC is ${SPEC} — read it completely first; it is the contract for the whole redesign. This step is the AUDIT (spec Phase 1 and Phase 2.1–2.2): nothing in the app's code changes now; what you write goes to ${DOCS}/ (create it). Later workers build the design system, the shell and every screen from your document, so be exact, complete and cite evidence.
The code to read: the data-safety release candidate ${S}/safe-wt (branch safety-v123; the base of the redesign; a worker is finishing fixes in its save/sync code — read, never edit) and, for the Today screen, the held v123 main screen ${S}/home-wt (branch main-screen-v1, commit e40d293: its www/js/app/05-today-calendar.js Today screen, its CSS in www/index.html and its UMCore.execDashboard / execWeek / execDrill / planVisitKeys in www/js/core.js come back in the redesign branch and become the executive dashboard).
Never edit either checkout; never push or commit anything; no changes to any repository.`

const BRAND_SCHEMA = { type: 'object', properties: {
  summary: STR, doc: STR, siteReachable: BOOL,
  colors: { type: 'array', items: { type: 'object', properties: { name: STR, value: STR, where: STR, evidence: STR }, required: ['name', 'value', 'evidence'] } },
  fonts: { type: 'array', items: { type: 'object', properties: { role: STR, family: STR, source: STR, license: STR, usableInApp: STR }, required: ['role', 'family', 'license', 'usableInApp'] } },
  logo: { type: 'object', properties: { repoFiles: STR, siteAssets: STR, same: STR, variants: STR, notes: STR }, required: ['repoFiles', 'siteAssets', 'same'] },
  styleNotes: STR,
  recommendedTokens: { type: 'array', items: { type: 'object', properties: { name: STR, value: STR, why: STR }, required: ['name', 'value', 'why'] } },
  typography: { type: 'object', properties: { latin: STR, arabic: STR, files: STR, scale: STR, numerals: STR }, required: ['latin', 'arabic', 'files'] },
  screenshots: STRS, openQuestions: STRS,
}, required: ['summary', 'doc', 'siteReachable', 'colors', 'fonts', 'logo', 'recommendedTokens', 'typography', 'screenshots'] }

const MODULE = { type: 'object', properties: { key: STR, title: STR, specSection: STR, files: STRS, functions: STRS, screens: STRS, harnesses: STRS, contracts: STRS, notes: STR }, required: ['key', 'title', 'files', 'screens', 'harnesses', 'contracts'] }
const INV_SCHEMA = { type: 'object', properties: {
  summary: STR, doc: STR,
  views: { type: 'array', items: { type: 'object', properties: { id: STR, title: STR, files: STRS, functions: STRS, roles: STR }, required: ['id', 'title', 'files'] } },
  navigation: STR, modals: STR, forms: STR, charts: STR, icons: STR, css: STR, rtl: STR, i18n: STR,
  inlineStyleHotspots: STRS, emojiAsIcons: STRS,
  harnessContracts: STRS,
  modules: { type: 'array', items: MODULE },
  lanes: { type: 'array', items: { type: 'object', properties: { key: STR, title: STR, modules: STRS, files: STRS, sharedFiles: STRS, why: STR }, required: ['key', 'title', 'modules', 'files'] } },
  risks: STRS,
}, required: ['summary', 'doc', 'views', 'navigation', 'modals', 'harnessContracts', 'modules', 'lanes', 'risks'] }

phase('Audit')
const [brand, inv] = await parallel([
  () => agent(`${COMMON}

YOUR PART: BRAND EXTRACTION (spec §1, §3.1–§3.6; Phase 2 steps 1–2). Write ${DOCS}/brand-extraction.md.
1. Open the official site https://ultramedgcc.com/ in a real browser: Playwright resolves globally (require('playwright'); NODE_PATH=/usr/local/lib/node_modules_global if needed); the internet only through the proxy: chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } }) (it works: the home page answers 200; if a request is refused read /root/.ccr/README.md; never disable TLS checks). Look at the home page at 1440x900 and 390x844, a collection/category page, a product page, and the Arabic version if the site has one (look for a language switch or /ar). Save screenshots (deviceScaleFactor 1) to ${S}/redesign-brand/ and LOOK at them.
2. Extract with evidence (the CSS variable or selector, the computed style, the asset URL), never from memory: the brand colors — primary (the site's body text is rgb(2,41,23) = #022917, already the app's --green), its hover/pressed, light tints/surfaces, any secondary/accent colors (check the theme's CSS custom properties, e.g. Shopify theme settings like --color-*, buttons, badges, sale tags, links, footer, announcement bar), text colors, borders, status colors if any; the typography — the site loads custom fonts (computed font-family "Font-1742150501083", "Font-1742150782918") and "DM Sans": find each @font-face src, download the font files to ${S}/redesign-brand/fonts/ and read their name table (family, designer, license/copyright strings) with a small script (fontTools if python has it, else parse the OpenType 'name' table yourself) — say what each font really is and whether its license allows self-hosting it inside the app; radii, shadows, buttons, inputs, icon style, image treatment, spacing and the overall personality.
3. The logo: the app's repo has www/icons/logo-green.png and logo-white.png (1067x240) and icon-192/512, apple-touch-icon, favicon-32 (in ${S}/safe-wt/www/icons). The site serves https://ultramedgcc.com/cdn/shop/files/Ultramed_-_Primary-Logo-Green-EN.png (and maybe AR / white / SVG variants: look in the page source, the footer, the favicon, the og:image). Download the site's variants to ${S}/redesign-brand/logo/, compare with the repo's (same mark and proportions? same color? which is sharper?), and say exactly which official files the app should use where (sidebar on a light surface, a dark surface if any, the sign-in screen, the PWA icons). Never redraw or recolor the logo.
4. Recommend the app's tokens (spec §3.1 names: --brand-primary, --brand-primary-hover, --brand-primary-soft, --brand-secondary, --surface-page, --surface-card, --surface-elevated, --text-primary, --text-secondary, --text-muted, --border-subtle, --status-success/warning/danger/info; plus radii, shadows, spacing scale, type scale, motion) from what you extracted — each with its reason; status colors must stay semantic and distinct from the brand green; text contrast WCAG AA on its surface (compute the ratios). The app already has tokens (www/index.html :root: --ink, --paper #D6ECDD, --card #EBF2EC, --green #022917, --gold, --coral, --amber, --sage, --line, --muted, --purple…): say how each maps.
5. Typography for the app: Latin and Arabic (the app is bilingual, Arabic is right-to-left). The app is an offline PWA: fonts must be self-hosted woff2 files (cached by its service worker), loaded with font-display: swap, subset if large. If the site's own font may not be self-hosted, recommend the closest refined sans with an OFL license (DM Sans is on the site and is OFL — check), and an Arabic companion with an OFL license that pairs with it; give exact download URLs of the woff2 files (official release or Google Fonts' static files), weights needed (keep it to 2–3), sizes in KB, and a type scale (page title, section title, KPI value, body, caption, metadata) with tabular numerals for figures.
Return the structured result (doc = the path of your markdown).`, { label: 'brand extraction', phase: 'Audit', schema: BRAND_SCHEMA }),
  () => agent(`${COMMON}

YOUR PART: the UI INVENTORY and IMPLEMENTATION MAP (spec Phase 1 steps 1–4 and 6). Write ${DOCS}/ui-inventory.md.
1. Every view (www/index.html .view ids: today, log, clinics, products, team, calendar, doctors, clanalysis, playbook, reports, more — check for others), how navigation works (switchView in 05-today-calendar.js, the bottom nav #bottomNav with its data-view buttons and nav dots, the More list #moreContent built by which function, deep links, back behaviour, the pro report overlay #proreport), the sign-in gate (03-gate.js), the header (greeting, date, user chip, alert dot), bars (offline/sync badge, red bars: tooLargeBar, memOnly bar, wipe banner…), toasts (#toast), the modal system (#modalBack/#modalInner, showModal/closeModal in 14-ui-boot.js — every showModal call site grouped by feature with the function names: how many, which are forms, which are long lists), every form (fields, required ones, validation messages), every table/list, every chart (how drawn: SVG strings? canvas?), every empty state, search boxes, filters, date controls, export/print/share paths (PDF, CSV, the weekly deck), role differences (rep vs supervisor; supervisor-only entries).
2. Map spec §6 modules (6.1 Home, 6.2 Visit logging, 6.3 Clinics, 6.4 Doctors, 6.5 Products, 6.6 Team, 6.7 Calendar, 6.8 Clinic sales analysis, 6.9 Selling Playbook, 6.10 Reports) to the app's real views and functions, and list the app areas the spec does not name that still need the design (e.g. Admin, Territory, team settings, KPI scorecard and settings, Month by month, the weekly deck sheet, ERP import and account links, backups and recovery sheets, orders, occasions, requests/escalations/stands, prescriptions types, catalog gaps and duplicates, the doctors-without-a-name and clinics-without-a-name sheets, account menu, change password, the sign-in screen) — every one goes into some module.
3. For each module: files and functions that render it; its screens and modals; the harnesses that exercise it and the DOM CONTRACTS they rely on — grep tests/e2e/*.e2e.js (and their helpers/fixtures) for selectors, ids, classes, data-* attributes, button/link texts clicked (e.g. page.click('text=…'), getByText, :has-text), texts read and asserted, functions called through page.evaluate (render functions, openX functions) and element counts — be exhaustive: these are what the redesign must keep. Note the i18n mechanism (www/js/i18n.js exact-string dictionary + PATTERNS; how translation is applied to the DOM — data-notr opt-outs; what breaks when an English string changes).
4. The look today: the CSS in www/index.html (size, tokens, component classes, breakpoints, RTL handling — logical properties or not), the icon system (I(name) in 02-doctors-model.js → <svg><use href="#i-…"> sprites in index.html: which icons exist; other inline SVGs like the bottom nav), emoji used as interface icons (where: file:line samples and counts), inline style="" hot spots and hard-coded colors per file (counts; the worst functions).
5. The held main screen (home-wt): what it shows for a rep and for the supervisor, its figures' sources, its harnesses (tests/e2e/main-screen.e2e.js, main-screen-cases.e2e.js) and the six target-card harnesses' contracts on #targetCard (audit-fixes, clinics-vs-today, hardening, rollover, seller-parity, shared-accounts).
6. Propose module LANES for parallel redesign work after the shell and the dashboard exist: exactly three lanes, balanced in size, each a sequence of modules, so that two lanes touch different www/js/app files as far as possible (say which files more than one lane must touch, e.g. 05-today-calendar.js has both Today and Calendar, 12-reports.js may have Reports and Team; index.html CSS and i18n.js are shared by all — each lane will write in its own marked CSS section and its own i18n block). The Today screen/dashboard is NOT in a lane (it is built right after the shell).
7. Risks for a redesign (where markup changes could silently break a harness, a save flow, or a translation).
Return the structured result (doc = the path of your markdown).`, { label: 'UI inventory', phase: 'Audit', schema: INV_SCHEMA }),
])
return { brand, inv }
