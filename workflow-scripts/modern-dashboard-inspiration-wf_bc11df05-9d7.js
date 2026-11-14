export const meta = {
  name: 'modern-dashboard-inspiration',
  description: 'Collect modern, beautiful sales-dashboard designs from the web (laptop and phone), then curate a varied set into numbered boards for the owner',
  phases: [
    { title: 'Collect', detail: 'two collectors: laptop dashboards, phone screens' },
    { title: 'Curate', detail: 'pick the best varied set, numbered boards with Arabic style names' },
  ],
}

const S = '/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/inspo'
const STR = { type: 'string' }
const ITEM = { type: 'object', properties: { id: STR, file: STR, sourceUrl: STR, title: STR, author: STR, kind: { type: 'string', enum: ['laptop', 'phone', 'both'] }, style: STR, why: STR, width: { type: 'number' }, height: { type: 'number' } }, required: ['id', 'file', 'sourceUrl', 'title', 'kind', 'style', 'why'] }
const COLLECT_SCHEMA = { type: 'object', properties: { items: { type: 'array', items: ITEM }, notes: STR }, required: ['items'] }
const CURATE_SCHEMA = { type: 'object', properties: { boards: { type: 'array', items: STR }, picks: { type: 'array', items: { type: 'object', properties: { n: { type: 'number' }, file: STR, sourceUrl: STR, styleAr: STR, lineAr: STR, kind: STR }, required: ['n', 'file', 'sourceUrl', 'styleAr', 'lineAr', 'kind'] } }, notes: STR }, required: ['boards', 'picks'] }

const COMMON = `Context: the owner of a small dental-products field-sales company in Kuwait (two sales reps and himself) uses a web app whose main screen shows: monthly invoiced sales against target with the pace, what is left and per working day, the month-end forecast, visits per day against a target, today's plan and follow-ups, the three people's progress, one daily sales chart. He looked at our current design (a calm white-card layout in dark green) and said: "the design does not look modern and contemporary, and does not look beautiful — give me shapes/suggestions from the internet". Your job is to find REAL, current, genuinely beautiful and modern designs on the web that he can choose a direction from.

How to browse: this machine reaches the web only through a proxy. Use Node with Playwright: \`const { chromium } = require('playwright'); const b = await chromium.launch({ proxy: { server: 'http://127.0.0.1:37583' } });\` (the browser already trusts the proxy's certificate; never ignore certificate errors). Plain \`curl\` also works (it uses the proxy from the environment). Reachable: dribbble.com (search pages like https://dribbble.com/search/sales-dashboard, shot pages, images on cdn.dribbble.com), mobbin.com (public pages), saasframe.io, and most product websites. behance.net refuses automated access — skip it. Be polite: a few dozen page loads at most, pauses between them, no logins, public pages only; if a site answers 429 or a challenge, move on.

What to keep: designs from 2024-2026 that look polished and current (refined typography, good spacing, tasteful color, modern charts and cards), that a sales/KPI main screen could follow. Variety matters more than quantity: different visual styles (for example clean light SaaS, bento grid, dark premium, soft gradients / glass, bold colorful KPI cards, fintech-style mobile home, green-themed, right-to-left Arabic). Skip low-effort, cluttered, illustration-only or concept-art pieces, and anything that is not a dashboard/home screen.

Save each kept design as a real image file (the full-size image when the page offers it: on Dribbble the shot page's main image, often 1600x1200; else a clean screenshot of just the design, at least 1000 px wide for laptop designs and 700 px tall for phone designs) under ${S}/<your folder>/NN.<ext>. Open each saved file (Read) to make sure it is the design, sharp, and not a cookie banner or a login wall. Record its source page URL and the designer/product name.`

phase('Collect')
const [laptop, phone] = await parallel([
  () => agent(`${COMMON}

Your part: LAPTOP / DESKTOP dashboards. Folder: ${S}/laptop. Search Dribbble (sales dashboard, crm dashboard, kpi dashboard, sales analytics dashboard, bento dashboard, dark dashboard, finance dashboard), SaaSFrame's dashboard category and Mobbin's web dashboard screens, and the product pages of well-designed real tools (for example Stripe, Linear, Attio, Pipedrive, HubSpot, Vercel) when they show their dashboard. Keep the 12-14 best and most varied. Time box: about 12 minutes, then return.`, { label: 'collect: laptop dashboards', phase: 'Collect', schema: COLLECT_SCHEMA }),
  () => agent(`${COMMON}

Your part: PHONE screens (mobile app home / dashboard screens). Folder: ${S}/phone. Search Dribbble (sales app, crm mobile app, dashboard mobile app, field sales app, fintech app home, banking app home, kpi mobile, arabic app, rtl app), Mobbin's public iOS/Android screens of home dashboards (banking, sales, fitness-style progress rings), and a couple of green-themed modern mobile dashboards. Include at least one right-to-left (Arabic) example if you can find a good one. Keep the 12-14 best and most varied. Time box: about 12 minutes, then return.`, { label: 'collect: phone screens', phase: 'Collect', schema: COLLECT_SCHEMA }),
])
const items = [].concat(laptop ? laptop.items : [], phone ? phone.items : [])
log('Collected ' + items.length + ' designs (' + (laptop ? laptop.items.length : 0) + ' laptop, ' + (phone ? phone.items.length : 0) + ' phone)')
if (!items.length) return { laptop, phone, curated: null }

phase('Curate')
const curated = await agent(`You curate design inspiration for a business owner who reads Arabic. ${COMMON.split('How to browse')[0]}

Candidates (already downloaded):
${JSON.stringify(items, null, 1)}

Do:
1. Open every candidate image (Read) and judge it: modern, beautiful, polished, relevant to a sales/KPI main screen. Drop weak, blurry, duplicated-in-style or irrelevant ones.
2. Pick 12 numbered picks: 6 laptop and 6 phone, as varied in style as possible (no two that look alike), each one genuinely beautiful. If the material does not allow 6 good ones of a kind, pick fewer rather than weak ones.
3. For each pick write in Arabic (plain words, no jargon) a short style name (2-4 words, e.g. «بطاقات زجاجية على خلفية متدرجة», «لوحة داكنة فاخرة», «شبكة بطاقات بأحجام مختلفة», «أبيض بسيط بخطوط دقيقة») and one line saying what makes it attractive and what we would take from it for his screen.
4. Build two boards as PNG images with Playwright (deviceScaleFactor 2): ${S}/board-laptop.png (the laptop picks) and ${S}/board-phone.png (the phone picks). An HTML page per board (dir="rtl", lang="ar", font: the local IBM Plex Sans Arabic files at /tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/design/fonts/node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-{400,600,700}-normal.woff2 via @font-face, with 'Inter' for Latin), a light neutral background, a title (laptop board: «أفكار لشاشة اللابتوب — تصاميم حديثة من الإنترنت»; phone board: «أفكار لشاشة الموبايل — تصاميم حديثة من الإنترنت»), and each pick as a large clear image in a rounded frame with a big number badge (1-6 laptop, 7-12 phone), the Arabic style name in bold under it and the one-line note, and the source (site and designer) in small Latin text. Laptop board: 2 columns, about 2400 px wide at 1x? no — keep the page 1600 px wide at 1x (3200 px PNG), images large enough to judge details. Phone board: 3 columns. Footer: «للإلهام فقط — سنصمم تصميمًا خاصًا بكم بالأسلوب الذي تختاره». LOOK at both boards (Read) and fix anything cut off, overlapping or unreadable.
Return the board paths and the picks.`, { label: 'curate + boards', phase: 'Curate', schema: CURATE_SCHEMA })
return { laptop, phone, curated }
