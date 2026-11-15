# UltraMed design system — the base every screen builds on

> **Update (15 Nov, the integration pass of `redesign-v1`).** This page describes the foundation; the screens were
> then built to the owner's own picture (his final design decision). On top of the tokens below sit the picture's
> `--p-*` tokens on `:root` (`--p-ink`, `--p-sub`, `--p-muted`, `--p-line`, `--p-page`, greens `--p-g5`…`--p-g9`,
> `--p-dark`, `--p-mint` / `--p-mint-soft` — the accent of the final look; the foundation's lime is left in a few badges and aliases —, `--p-up` / `--p-down`
> / `--p-warn`, `--p-shadow`, `--p-radius` 18px); the colours are taken from his picture. 'UM Sans' is now Inter
> (self-hosted, OFL) — not DM Sans; IBM Plex Sans Arabic is unchanged. The logo is a wordmark with an original mark,
> not an official logo file. Amounts: one grouped format ("12,989.00 KD", «12,989.00 د.ك» in Arabic). The shared
> components, the sheet frame and the page head are listed in CLAUDE.md ("Premium redesign").

Where it lives: the one `<style>` in `www/index.html` (fonts → tokens → base → components → shell → main screen →
report → print → the marked sections), the icon sprite at the top of `<body>`, the shell markup (`header.top`,
`nav#bottomNav`, `#gate`) and four small functions (`syncShell`, `syncNav`, `renderMore` in `05`, `toggleUiLang`
in `14`). Sources: `brand-extraction.md` (the real brand), `ui-inventory.md` §14 (what breaks this app).

## 1. Tokens (all on `:root`; exports copy that block)

| Group | Tokens | Notes |
|---|---|---|
| Brand | `--brand-primary #022917` (+ `-hover`, `-pressed`, `-soft`), `--brand-secondary #A5CF63` (+ `-soft #EBF4DD`), `--brand-tertiary #214E39` | Deep green = text, primary buttons, the sidebar. Lime is the ONE accent: on deep green (active nav item, Log visit) or as a soft fill under dark text — never text on white (1.79:1). |
| Surfaces | `--surface-page #F6F8F7`, `--surface-card #FFF`, `--surface-elevated`, `--surface-sunken #F0F2F1`, `--surface-inverse #022917` | Off-white page, white cards, sunken = tracks and wells. |
| Text | `--text-primary`, `--text-secondary`, `--text-muted` (the lightest allowed for text, 6:1), `--text-disabled`, `--text-on-brand`, `--text-on-brand-accent`, `--text-on-inverse`, `--text-on-inverse-muted` | |
| Borders | `--border-subtle` (hairlines), `--border-default` (buttons, chips), `--border-strong` (fields: 3:1), `--focus-ring`, `--focus-ring-on-dark` | |
| Status | `--status-success/-warning/-danger/-info` + `-soft`, `--status-warning-fill` (bars only), `--accent-gold` | Never the brand green; always with a word or an icon. |
| Shape | `--radius-xs 4`, `-sm 8`, `-md 12` (controls, inner tiles), `-lg 16` (cards, panels, sheets), `-pill` | `--shadow-sm` hover, `-md` sticky chrome, `-lg` sheets. Nothing at rest. |
| Space / layout | `--space-1…12` (4 px grid), `--sidebar-w`, `--topbar-h`, `--bottomnav-h`, `--content-max 880`, `--content-wide 1320`, `--gutter`, `--tap-min 44` | |
| Type | `--font-sans` (UM Figures → UM Sans → UM Arabic), `--fs-display/title/section/card-title/kpi/body/small/label/caption/overline`, `--lh-*`, `--track-overline` | DM Sans (Latin), IBM Plex Sans Arabic (Arabic and all digits: tabular). Files in `www/fonts/`, precached by `sw.js`. Weights 400/500/600. |
| Motion / layers | `--dur-fast 120ms`, `-base 180ms`, `-slow 240ms`, `--ease-*`; `--z-topbar 8`, `-nav 10`, `-sheet 20`, `-toast 30`, `-lightbox 40`, `-status 50` | `prefers-reduced-motion` switches motion off. |

**Old names are aliases** (`--ink`, `--paper`, `--card`, `--green…`, `--teal…`, `--gold…`, `--coral…`, `--amber…`,
`--sage…`, `--line`, `--muted`, `--purple…`, `--radius`, and the main screen's `--page`, `--surface`, `--hair`,
`--soft`, `--accent`, `--accent-soft`, `--track`). Templates use them inline hundreds of times: keep them resolving;
in new code use the semantic names.

## 2. Component classes (restyled globally — keep the names and their meaning)

| Class | What it is |
|---|---|
| `.btn` | the main action: full width, deep green, white label. `.secondary` = neutral (white, bordered); `.ghost` = cancel / remove (red text); `.small` = compact. All ≥ 44 px. |
| `.chip` (`.on`, `.small`, `.withimg`), `.quickdate button` | pill filters and choices; `.on` = chosen (deep green). `.toggle-row` = two chips sharing a row. |
| `.tabs2 > .t2`, `.dash-toggle > .dt` | segmented tabs: a sunken track, the chosen one (`.on`) a white thumb. |
| inputs, `select`, `textarea`, `label` | 48 px fields (44 on desktop), 16 px text on phones, `--border-strong`, a soft ring on focus. |
| `.card` (`.clickable`, `.dim`), `.chartcard` | white, hairline, radius 16, no shadow. |
| `.section-title` (`.link`) | the overline above a block (uppercase in English — do not change its case: `innerText` follows it). |
| `.badge.overdue/.today/.upcoming/.none/.done`, `.cls-A…F/Closed`, `.rep-tag` | a word or a letter in a soft pill. |
| `.kpi-grid > .kpi`, `.kpi4 > .k (.kn .kl .ki)` | figure tiles (tabular digits). `.bar-track > .bar-fill`, `.segbar`, `.rank`, `.report-line`, `.spec-row`. |
| `.empty` (`.big`) | an empty state: dashed box on the page, plain inside a card or a sheet. |
| `.nudge` | a quiet tip; `.focus-card`, `.hero`, `.welcome`, `.streak`, `.tile`, `.ach` keep their roles. |
| `.modal` (in `#modalBack`, one instance, outside `#app`) | a bottom sheet on a phone, a centred 640 px dialog from 720 px; `.modal-close` stays in sight while it scrolls. Sheets keep `<h3>` then `<p>` as siblings. |
| `#toast`, `.sbar` (`.sbar-pill`, `.sbar-wide`, `.sbar-warn`, `.sbar-danger`) | the toast; the status bars of `04-sync.js` / `13-exports.js` (classes instead of inline styles). |
| `.navlist > .navrow (.ri .rt .rn .rs)` | a grouped list of destinations (the More screen). `.hbtn` = a round 44 px action in a view's first row. |
| `.stamp` (`.sup`), `.dot`, `.navdot`, `.svgi`, `.ui-chev` | avatar, alert dots, line icons (`I('name')`; a chevron that mirrors in Arabic). |

Icons: one family, the sprite (`#i-name`, 24 grid, stroke 1.9). Added here: `home grid x flag trend pie activity search`.
No emoji as interface icons in new markup; an emoji inside a message string (toasts, bars) is content — leave it.

## 3. The shell

- **Navigation = one element**, `<nav class="bottom" id="bottomNav">`. Below 1024 px: the bottom bar, only the
  `.nav-tab` buttons show (Today · Log visit · Clinics · Calendar · More). From 1024 px: the deep-green sidebar
  (official white logo, six groups: Overview, Customers, Sales, Field operations, Intelligence, Management).
  `data-sup` = supervisor only (`renderAll` sets `hidden`). To add a destination: one `<button>` in its group with
  `data-view="<view>"` (or just an `onclick` for a sheet), and the same row in `renderMore()`.
- **`switchView(name)` is the only navigation.** It calls `syncShell(name)`: `body[data-view]`, the top bar's title
  (`VIEW_TITLES`), the active item (`.active`, `aria-current`). A view reached from More marks the phone's More tab.
- **Top bar = `header.top` inside `#app`** (so the sign-in screen and the full-screen report hide it with the app):
  title (Today: `#greeting` + `#dateLabel`; other views: `#topTitle`), Log visit (desktop), language, the account
  (`#topUserName`, `#topUserRole`, `#headerStamp` whose first child stays the initials text, `#headerDot`).
  A view's own `<h2>` title stays in the markup, out of sight (the top bar shows it).
- **Content**: phone/tablet one 672 px column; desktop `#app` beside the sidebar, each view
  `min(100% − 2 gutters, --col)` centred (`--col` = 880; 1320 on Today), the title on the same edge.
- **Sign-in** `#gate`: the green logo on the light page; from 900 px a deep-green brand panel with the white logo.
- JS still sets inline `display` on `#app`, `#gate`, `#bottomNav` — never make layout depend on those values.

## 4. Breakpoints

`< 1024` bottom bar (tested at 360, 390, 768) · `≥ 1024` sidebar 232 px, gutters 20, Today two cards a row ·
`≥ 1280` sidebar 248, gutters 32 · `≥ 1440` Today three cards a row · `≥ 720` sheets become dialogs ·
`≥ 900` sign-in brand panel. `msFold()` in `05` uses the same 1024.

## 5. Arabic and strings

- Every English string on screen is the Arabic dictionary key and often a harness contract: never reword an
  existing one; a new one needs its entry in `www/js/i18n.js` (`aria-label`, `title`, `placeholder` too).
- Words whose only entry starts with an emoji are found without it as well (`lookup` → `bare`).
- Names and figures that must not be translated sit in `data-notr`; data typed by people in `dir="auto"`.
- Layout mirrors by itself: use logical properties (`inset-inline-*`, `margin-inline-*`, `padding-inline-*`,
  `text-align:start/end`). No letter-spacing and no `text-transform` in Arabic (`body.ar`). The logo is never mirrored.
- Each part of the screen work writes CSS only in its marked section at the end of the `<style>`
  (`/* === DASHBOARD === */`, `SCREENS A`, `B`, `C`) and Arabic only in the block of the same name at the end of `AR`.

## 6. The screenshot tool

`node tests/e2e/tools/shots.js --out <dir> [--as supervisor|rep] [--views today,log,clinics,calendar,reports,more,gate,…]
[--step "name=js"] [--widths 1440,390] [--langs en,ar] [--dpr 2] [--viewport-only] [--www dist]` — invented fixture
data, fixed clock, no network. It writes `<lang>-<width>-<who>-<step>.png` and `report.txt`: horizontal overflow,
elements past the viewport, tap targets under 44 px on phones, page errors. Not a harness (never in `npm run e2e`).
