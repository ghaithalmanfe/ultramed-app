# UltraMed premium redesign — UI inventory and implementation map

> In the repository since 13 Nov 2026 (branch `redesign-v1`). The screenshots, page dumps, font and logo files, scripts and extraction outputs this document cites stayed in the working session's scratchpad and are not in the repository: paths that start with `/tmp/…`, `scratchpad/…`, `redesign-brand/…`, `redesign-docs/…`, `brand-scripts/…`, `safe-wt/…` or `home-wt/…` point there. Amounts and the promo code shown on the public shop were left out of this copy (nothing of the shop's prices goes in the repository).

Phase 1 audit (spec ULTRAMED_PREMIUM_REDESIGN.md §12 Phase 1 steps 1–4 and 6). Nothing in either checkout was changed.

| | |
|---|---|
| Base of the redesign | `scratchpad/safe-wt` — branch `safety-v123`. Audited on the working tree while the v123 review fixes were being finished; they have since been committed (`d3482b5`, then `c3406ec` "a failing harness fails the run (no retry)", HEAD `0190dc0`, tree clean). The extraction tools re-run on `0190dc0` give **identical** contracts (0 differences in ids, selectors, functions, texts, regexes); sheet and inline-style counts unchanged |
| Today screen that returns | `scratchpad/home-wt` — branch `main-screen-v1`, commit `e40d293` (05-today-calendar.js main screen, its CSS in index.html, `UMCore.execDashboard / execWeek / execDrill / planVisitKeys` in core.js, harnesses `main-screen.e2e.js` (port 8277) and `main-screen-cases.e2e.js` (8278)). In safe-wt it is held by commit `8670308` ("Hold the main screen …"), which set 16 files back to v122 |
| Paths | `safe-wt/…` and `home-wt/…` below are relative to `/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/` |
| Evidence | Raw extraction outputs in `redesign-docs/evidence/`, the scripts that made them in `redesign-docs/tools/` (re-runnable on the redesign branch to prove the contracts are still there — Appendix C) |

---

## 0. The rules this audit leads to (read before touching markup)

1. **Every English string on screen is three things at once: the text, the Arabic dictionary key, and a harness contract.** Do not reword, split or re-punctuate any existing string; restyle around it (§10, §14 R1–R3).
2. **Keep every id, class hook, `data-*` attribute and inline `onclick` text the harnesses read** (§9, Appendix B). Hook-only classes with no CSS today (`rx-doc`, `rx-tile`, `rx-plus`, `rx-qty`, `rxt-name`, `rxt-retire`, `cgap`, `el-month`, `el-move`, `el-outside`, `el-today`, `ms-cx`) must survive even if they look unused.
3. **Selected state is the class `on`** (`.chip.on`, `.dt.on`, `.t2.on`); open is `open`, shown is `show`, active view `.view.active`, active nav `nav.bottom button.active`. JS toggles these names everywhere and harnesses select on them.
4. **Keep the 24 legacy colour token names** (`--muted` is used 432 times inline from JS) as aliases of the new semantic tokens, and keep tokens on `:root` (§11.2).
5. **Sheets stay sheets**: every detail/edit flow is `showModal(html)` into `#modalInner` (87 calls in 84 functions). A desktop drawer/dialog look is fine; a new DOM for details is not (harnesses read `#modalInner`, `#modalBack`).
6. **The "Save visit" control is one `<button onclick="saveVisit()">` inside `#view-log`, visible, never `position:fixed`** (four photo harnesses find it by that exact `onclick` text and require `offsetParent`) (§14 R6).
7. **Harnesses run at two widths**: 12 files at 390×844 (phone), 18 at Playwright's default 1280×720 — i.e. the new **desktop** layout. Anything hidden at one of those widths disappears from `innerText` checks there (§14 R4).
8. **Native `confirm()` dialogs are asserted** (8 call sites; clinic-recovery matches their text, hardening counts them). Do not replace them with in-app dialogs.
9. **No blocking prompts on navigation, no new storage keys, no network-loaded JS.** UI preferences go to `localStorage` in `try/catch` only (a new cloud key would be refused by `firestore.rules`).
10. **Each lane writes CSS only in its own marked section of index.html and Arabic only in its own block of i18n.js** (§13).

---

## 1. The stack in one page

| Item | Fact (evidence) |
|---|---|
| Framework | None. Vanilla JS; every screen is a template literal assigned to `innerHTML`; handlers are inline `onclick="fn(…)"` strings; all state is global `let` variables (`clinics`, `visits`, `tasks`, `events`, `dayPlans`, `targets`, `erpSales`, `products`, `currentUser`, `REPS`, …, declared in `02-doctors-model.js`, `01-config.js`, `05`, `06`, `12`). |
| Entry | `www/index.html` (963 lines, 88.8 KB: 454 lines of CSS in one `<style>`, 43-symbol SVG sprite, all static markup) loads `js/core.js` (6,649 lines, pure helpers `UMCore`), `js/i18n.js` (2,298 lines, `UMI18N`), then 16 classic scripts `js/app/01-config.js … 16-kpi.js` sharing ONE global scope (`index.html:944-961`). Boot = `renderGate(); tryAutoLogin();` at the end of `14-ui-boot.js:260-261`. |
| Build | `scripts/build.js` inlines the js/app files into one `<script>` for `dist/`. It **fails** if: a js/app file lost its two-line header (`// <area>` + `// (part of the UltraMed app script — …)`), the `<script src="js/app/NN-x.js">` tags are not one contiguous block in file order, a top-level name is declared twice across js/app files, a file contains `</script`, `sw.js` lists js/app files, or any spreadsheet/CSV/sales-JSON sits in www/ (`build.js:64-95`). Unit test `tests/build.test.js` checks the output. |
| Offline / PWA | `www/sw.js`: `CACHE = 'ultramed-field-ops-v123'` must equal `APP_REV` (`01-config.js:7`); `SHELL` precaches `./, index.html, js/core.js, js/i18n.js, manifest.json, icons/icon-192.png, icons/logo-green.png, icons/icon-512.png`; other same-origin files are cached on first fetch (stale-while-revalidate); only `www.gstatic.com/firebasejs/*` is cached cross-origin — **Google Fonts are not cached** (`sw.js:30-45`). `manifest.json`: standalone, portrait, `theme/background #022917`. |
| Auth / data | Firebase compat SDK 10.13 from gstatic (`index.html:18-20`); email + password sign-in (`03-gate.js`); data = Firestore collection `state` through the `window.storage` adapter (`04-sync.js`). The redesign touches none of it. |
| Hosting | GitHub Pages under `/ultramed-app/`: every path in index.html, sw.js and manifest is relative (checked: no `/icons`, `/js`, `src="/` anywhere) — keep it that way. (The Capacitor Android wrapper was removed in v127.) |
| Viewport | `<meta name="viewport" content="width=device-width, initial-scale=1.0">` — **no `viewport-fit=cover`**, so `env(safe-area-inset-*)` is 0 on iOS although `apple-mobile-web-app-status-bar-style` is `black-translucent` (`index.html:5,11`). The redesign should add `viewport-fit=cover` and pad the shell with the insets. |
| Fonts | Headings `'Fraunces',Georgia,serif` from Google Fonts (`index.html:17,39`); body `-apple-system,…,Roboto`; Arabic `'Segoe UI','Noto Naskh Arabic','Geeza Pro',Tahoma` with `letter-spacing:0 !important` (`index.html:378-383`). |

### 1.1 Files by area (safe-wt; lines)

| File | Lines | Area (file header) |
|---|---|---|
| 01-config.js | 504 | APP_REV, logo data URI, Firebase config, product/guide seeds, staff seed, `SPECIALTY_PLAYBOOK` (emoji icons per specialty) |
| 02-doctors-model.js | 118 | doctor-card labels, globals, `showToast`, `I(name)` icon helper, `fmtDate`, `money` |
| 03-gate.js | 217 | sign-in gate, account menu, change password, auto-login |
| 04-sync.js | 2,430 | load/save/merge/outbox; **renders the status bars** (`syncPill`, `memOnlyBar`, `tooLargeBar`, `refusedPill`, `erpDirtyPill`, `visitsNudge`) — the safety worker's file |
| 05-today-calendar.js | 976 (home-wt 1,837) | Calendar, navigation (`switchView`, `renderMore`, `renderAll`), Today, plans, planner |
| 06-log-visit.js | 1,014 | Log-a-visit form, orders, follow-ups, prescriptions step |
| 07-clinics.js | 1,573 | Clinics dashboard/list/detail, add/edit clinic, nameless/lost/duplicate doctors, edit product, recycle bin |
| 08-team-orders.js | 722 | staff form, Order only, Call log, Edit visit, edit history, delete visit |
| 09-admin.js | 996 | Admin panel, visit log, photo gallery, doctors on a clinic, add to plan, delete clinic, missing clinics, manage clinics |
| 10-doctors-products.js | 2,073 | Products, catalog gaps/duplicates, Doctors DB & prescriptions, doctor records/profile, contact import, data entry, Rx types editor, Clinic sales analysis, Playbook, product detail, category guides, Coverage board, ERP nudge |
| 11-erp.js | 2,221 | ERP import, DSR targets, salesmen, returns policy, month reports & month close, product movement, reconciliation, ERP account links |
| 12-reports.js | 1,501 | Report view, compare, report tools, photos & lightbox, team chat & memories, achievements, SVG charts, scorecards, e-mail → tasks |
| 13-exports.js | 2,170 | master report (HTML/PDF), pro report overlay, CSV/XLSX exports, backups, full backup, recovery, device copy, wipe banner |
| 14-ui-boot.js | 261 | modal, drag-to-dismiss, language, translation observer, nudges, keyboard layer, boot |
| 15-weekly-deck.js | 1,143 | weekly management deck (PowerPoint builder; UI is one sheet) |
| 16-kpi.js | 220 | KPI scorecard & settings, requests/escalations/stands, month by month |

---

## 2. Shell and navigation

### 2.1 Views (`index.html` `.view` ids — there are exactly 11)

| `#view-…` | index.html | Rendered by (`renderView`, `05:286`) | Reached from | Nav highlight |
|---|---|---|---|---|
| `today` | 561 (`.view.active` at load) | `renderToday()` 05:630 (home-wt 05:1463) | bottom nav | Today |
| `log` | 593 | `prepLogView()` 06:33 — **resets the form on every entry** | bottom nav; plan rows `quickLogFrom(id)` 06:259; "See all" | Log visit |
| `clinics` | 683 | `setClinicMode(clinicMode)` 07:7 → `renderClinicDash()` 07:208 / `renderClinics()` 07:358 | bottom nav | Clinics |
| `calendar` | 750 | `renderCalendar()` 05:34 | bottom nav | Calendar |
| `reports` | 824 | `renderReports()` 12:201 | bottom nav ("Report"); target card tap | Report |
| `more` | 879 | `renderMore()` 05:309 | bottom nav | More |
| `products` | 710 | `renderProducts()` 10:29 | More | More (`MORE_CHILDREN`) |
| `playbook` | 817 | `renderPlaybookGrid()` 10:1561 | More | More |
| `team` | 722 | `setTeamTab(teamTab)` 12:875 + `loadTeam()` then `renderChat()`/`renderMemories()` | More | More |
| `clanalysis` | 809 | `renderClinicAnalysis()` 10:1377 | More | More |
| `doctors` | 797 | `renderDoctorsDb()` 10:253 | More; Clinics list button; Occasions card | More |

### 2.2 How navigation works
- `switchView(name)` (05:299): sets `activeView`, toggles `body.not-today` (home-wt also `body.on-today`), removes `.active` from every `.view`, adds it to `#view-<name>`, highlights `nav.bottom button` whose `data-view` equals `name` — or `more` when `name` is in `MORE_CHILDREN = ['products','playbook','team','clanalysis','doctors','more']` (05:285) — then `renderView(name)`.
- `renderAll()` (05:356) repaints header text, the three rep-filter chip rows (`#clinicRepFilter`, `#reportRepFilter`, `#calRepFilter`: "All" + REPS for the supervisor, only her own name for a rep) and **only the active view** (on Log only `renderLogHistory()`).
- **No router, no URL hash, no `history.pushState`, no deep links** (grep: none of `location.hash`, `URLSearchParams`, `pushState`, `popstate`). The Android/OS back gesture leaves the app. "Back" exists only inside flows: `Escape` closes the lightbox or the sheet (not while focus is in an input — 14:236-246), the sheet closes by backdrop tap (`closeModalBg`), the × button, or a 110 px downward drag (14:60-102); in-sheet "‹ Back" buttons re-render the same sheet; the pro report has "← Back to app".
- Desktop today (safe-wt): one 640 px column for every width; at ≥ 920 px only the fixed bottom nav is centred to 640 px (`index.html:422-426`).
- Held v123 (home-wt): < 1024 px bottom bar with a raised round "Log visit" in the middle; ≥ 1024 px the same `<nav>` becomes a 96 px dark-green side rail on every view (`rail-mark` "UM", Log visit first), Today 1420 px wide in a 12-column grid, other views stay 640 px (home-wt `index.html:602-666`).

### 2.3 Bottom navigation `#bottomNav` (`index.html:899-926`)
- `<nav class="bottom" id="bottomNav" style="display:none;">` — shown with `style.display='flex'` by `selectUser` (03:12) and `hideProReport` (13:1119), hidden with `'none'` by `showGateScreen` (03:32) and `showProReport` (13:1113).
- Six `<button data-view="…" onclick="switchView('…')">`: `today` (+ `#navDotToday`), `log`, `clinics`, `calendar`, `reports` (label "Report"), `more` (+ `#navDotTeam`, never set by any code — dead). Icons are **inline SVGs, not the sprite** (sun-like, plus, building, calendar, chart, menu).
- Alert dots: `#navDotToday` and `#headerDot` get `.show` when follow-ups are due (05:658-659; **no null check** — removing either throws in `renderToday`).
- The main-screen harness requires `#bottomNav button[data-view="log"]` (phone: inside the bottom 120 px, ≥ 44×44; laptop: a full-height rail at x = 0, ≤ 110 px wide — see §12.4).

### 2.4 More list `#moreContent` — `renderMore()` (05:309-345)
Header: logo `icons/logo-green.png` on a white rounded box + "CLINICAL SALES TEAM" (`index.html:880-883`). Tiles `.card.clickable` (icon `I(name)`, title, subtitle, `›`), in three `.section-title` groups:

| Group | Tile (title — subtitle) | Action | Role |
|---|---|---|---|
| Reference | Products & prices — Catalog, prices and specs | `switchView('products')` | all |
| | Clinic sales analysis — Per-clinic targets, purchases and next moves | `switchView('clanalysis')` | all |
| | Product movement — Every brand → its products ranked by real sales: fast, mid, slow | `openProductMovement()` | all |
| | Doctors database — Profiles, birthdays, follow-up rhythm & prescriptions | `switchView('doctors')` | all |
| | Doctor records — Who is who in every clinic — fill one card per doctor | `openDoctorRecords()` | all |
| | Selling playbook — Tips per doctor specialty | `switchView('playbook')` | all |
| | Category guides — How to sell every category | `openCategoryGuides()` | all |
| Team | Team chat & memories — Messages and shared photos | `switchView('team')` | all |
| | Achievements — Badges, streaks and milestones | `openAchievements()` | all |
| Tools | Export & share — CSV files and report sharing | `openExport()` | all |
| | Weekly management deck — PowerPoint for the Thursday meeting (supervisor) | `openWeeklyDeck()` | **supervisor** |
| | KPI scorecard — The 10 measures management follows, score out of 100 | `openKpiScorecard()` | all |
| | Month by month — Sales, field work and KPI against earlier months | `openMonthByMonth()` | all |
| | Requests, escalations & stands — Log client requests, escalations and stands | `openClientLog()` | all |
| | ERP import — Sales & targets files (supervisor) | `openErpImport()` | **supervisor** |
| | Admin panel — Team, targets & data (supervisor) | `openAdminPanel()` | **supervisor** |

Footer "UltraMed Clinical Sales Team · v123" in `rgba(255,255,255,.5)` (dark-page colour). Harnesses read the body text after `switchView('more')`: "KPI scorecard", "Requests, escalations & stands", "Month by month" (kpi), "Weekly management deck" (weekly-deck, supervisor), and require **no** "Ask anything about your data" tile (save-truth F1 — the held home-wt build re-adds an "Assistant" tile; drop it, §12.6).

### 2.5 Header `header.top` (`index.html:549-558`)
- Logo `<img class="logo">`: a 200×208 PNG of the **lime UltraMed leaf mark only** (`#A5CF63`), inline base64 (~11.7 KB) — not the wordmark.
- `#dateLabel` (`.eyebrow`, e.g. "Friday, November 13") and `#greeting` (`h1`, "Good morning, Mariam" / "Dr. Ghaith"), set by `renderAll()` with **no null checks**; both hidden by `body.not-today` on other views (`index.html:401-403`).
- `.userchip` → `openAccountMenu()`; `#headerStamp` = initials (**its first child node must stay the initials text node**: `stamp.childNodes[0].textContent = initials(...)`, 05:367) containing `#headerDot`; `.stamp.sup` colour for the supervisor.
- Held v123: on a phone the Today header becomes a full-width dark band (`clip-path` trick); on a laptop it is hidden on Today and the screen draws its own head (`#msHead`: hello, date, data-source line, person switch, KPI pill, avatar `.ms-av` with its own dot).

### 2.6 Sign-in gate (`index.html:528-546`, `03-gate.js`)
- `#gate` (`display:none` by `selectUser` 03:10, `flex` by `showGateScreen` 03:30), radial dark-green background. Wordmark `#gateLogo` = `LOGO_DATAURI` (1067×240 dark-green wordmark) in a white rounded box (inline style); tag "CLINICAL SALES TEAM"; "Tap your profile to start".
- `#gateGrid` ← `renderGate()` (03:96): one `.gate-tile` per staff member (`.gate-av` initials on the person's avatar gradient, `.gate-name`, `.gate-role` with tooth/star icon "Sales Rep"/"Supervisor"); reps two per row, supervisors full width; empty: "No team members yet."
- "Sign in with email instead" (`#gateOther` → `openEmailLogin()`); four `.gate-badge`s (Clinics, Products, Reports, Playbook); foot "Ultramed International General Trading Co.".
- Tap → `gateTap(name)` (03:114) opens a **sheet** (`#gatePassword` + "Log in") or, on a phone that never signed in, `openEmailLogin(name)` (`#elEmail`, `#elPwd`, "First sign-in on this phone: enter your work email and password…"). Validation toasts: "Enter your password", "Enter email and password", "Wrong password, try again", "Wrong email or password", "📴 No connection — sign in once online, then the app works offline", "Offline mode — tap your name".
- **The modal must stay outside `#app`** (it is shown while `#app` is `display:none`). no-real-data reads `#gateGrid` text (names) and the presence of `#elEmail` vs `#gatePassword`.
- `selectUser` (03:4) hides the gate, shows `#app` (`display:block`) and `#bottomNav` (`flex`), then `loadAll()`. `switchUser()` (03:18) / `signInEnded()` (03:39) return to the gate; held v123 also removes `body.on-today` there.

### 2.7 Account menu, password, language (`03:46-95`, `14:104-123`)
- `openAccountMenu()` sheet: name, e-mail, "Language / اللغة" chips (`data-notr`, English / العربية → `setUiLang`), "Change password" (Firebase only) → `openChangePassword()` (`#cpCurrent`, `#cpNew` "At least 6 characters", `#cpConfirm`; toasts "Enter your current password", "New password must be at least 6 characters", "New passwords don’t match", "Current password is incorrect", "Choose a stronger password", "Too many attempts — try again later", "Could not update password", "✅ Password updated"), "Sign out" (`.btn.ghost`).
- `setUiLang('ar')` translates in place (no reload); back to English **reloads the page**. `applyLangChrome()` sets `<html lang dir>` and `body.ar`.

### 2.8 Overlays
- **Pro report** `#proreport` (`index.html:888-897`): `.pr-toolbar` ("← Back to app" `hideProReport()`, `#prLangBtns` EN/عربي/Full/1-page, PDF `downloadReportPdf()`, Print `window.print()`, Share `shareReportFile()`), `#prDoc` ← `buildMasterReportBody(reportLang, reportFormat)`. `showProReport()` (13:1100) adds `.active`, hides `#app` and `#bottomNav` — **any new shell element outside `#app` (side bar, top bar) must be hidden here too**. `@media print` hides everything but `.proreport` (`index.html:469-475`). The report is skipped by the translator (`.proreport` in `TR_SKIP`) and uses its own CSS `MASTER_REPORT_CSS` (13:358).
- **Lightbox** `#lightbox` (`index.html:936-940`): `.lightbox.show`, `#lbImg`, `#lbCap`, `.lbclose` (`aria-label="Close photo"`); `showLightbox(photoId, cap, direct)` (12:700) loads the full photo from phone or cloud, else the thumbnail with `#lbNote` (created in 12:692, `data-notr`). Harness-read: `#lbImg`, `#lbCap`, `#lbNote`, `#lightbox`.

### 2.9 Toast `#toast` (`index.html:942`, `02:111`)
- `showToast(msg, ms)`: text through `trOf()` (Arabic), class `show` for `ms || 1800` ms; fixed bottom 88 px, centred dark pill, `dir="auto"`.
- **Contract**: every module calls the global `showToast` by name (harnesses replace `window.showToast` to record messages, e.g. visit-photo-sync expects exactly `'Already saving…'`), several harnesses read `#toast.textContent`. Toast wording is asserted in many harnesses (Appendix B).
- Save outcomes go through `saveToast(r, key, okMsg)` / `saveFailText` (04:2314-2346) — `tests/save-messages.test.js` scans js/app and fails if a save's result is thrown away before a success toast.

### 2.10 Status bars and nudges (all created by JS; inline `style.cssText`)

| Element | Made by | Where/look | Content |
|---|---|---|---|
| `#syncPill` | `updateSyncBadge()` 04:1633 | fixed top 10 px centre, amber `#B8860B` pill, `pointer-events:none` | "📴 Offline — saving locally" / "⏳ Uploading offline changes (n)…" |
| `#memOnlyBar` | `renderMemOnlyBar()` 04:1302 | fixed top, full width red `#B3261E`, `role=alert`, `data-notr` | visit/other/photos only in memory (phone storage full) |
| `#tooLargeBar` | `renderTooLargeBar()` 04:2221 | fixed bottom `calc(84px + safe-area)`, red, `role=alert`, `data-notr`, "Try again" chip → `retryBlockedSaves()` | a document too large for the cloud / saves refused |
| `#refusedPill` | `refusedSave()` 04:2130 | fixed top 78 px, red, tap clears | "⚠️ Not saved — …" |
| `#erpDirtyPill` | `renderErpDirtyPill()` 04:891 | fixed top 44 px, red, tap retries | Arabic: unsaved sales changes |
| `#wipeBanner` | `checkWipeBanner()` 13:2105 | fixed top 0, full width `#8B0000`, button → `openExport()` (supervisor) | Arabic: clinic list much smaller than a backup |
| `#visitsNudge` | `renderVisitsNudge()` 04:350 | card on Today | Arabic: months of visits not loaded + retry |
| `#erpNudge` | `renderErpNudge()` 10:2056 (+ `erpHealthCard` 10:2026, `monthInputsCard` 10:2047) | cards on Today (supervisor) | sales-file health, "المدخلات الشهرية مطلوبة", "Weekly sales file due" |
| `.nudge[data-nudge]` | static markup + `14:174-194` adds `.nudge-x` (dismissal kept in `localStorage['ultramed_nudges_dismissed']`) | in-view explainer banners (products, team-mem, calendar, doctors, clanalysis, playbook, reports-coach, reports-perf) | tips |

Five bars overlap the same top 10–78 px band with z-index 9999–10001 and none respects the safe-area top inset. Harness-read ids: `memOnlyBar`, `tooLargeBar`, `refusedPill`, `erpDirtyPill`, `wipeBanner`, `visitsNudge`, `erpNudge` (§9). Restyling them means editing 04-sync.js/13-exports.js creation code — limit that to swapping `cssText` for a class (§14 R16).

### 2.11 The modal (sheet) system (`index.html:928-934`, `14-ui-boot.js:3-17,60-102`)
```
#modalBack.modal-back (onclick="closeModalBg(event)" — closes only when e.target.id==='modalBack'; .show = open)
  #modalContent.modal (position:relative inline; bottom sheet, max-width 640, max-height 90vh, overflow-y:auto, 22px top radius, slide-up animation)
    button.modal-close (aria-label="Close") → closeModal()
    div.modal-handle
    #modalInner   ← showModal(html) replaces its content; dir set to rtl when the UI is Arabic or the content is mostly Arabic
```
- **One sheet at a time.** A sub-flow replaces the content (no stacking); `closeModal()` only removes `.show`.
- Drag-to-dismiss on `#modalContent` (touch only, ignores inner scrollers). Escape closes unless an input/textarea/select has focus.
- 87 `showModal` calls in 84 functions (46 with form fields) — full list in §4. Harnesses read `#modalInner`, `#modalBack` (incl. `#modalBack.show`), click `#modalContent .modal-close`.
- On a laptop the sheet is a 640 px bottom sheet; a centred dialog or right-hand drawer is a free presentation choice **as long as these ids, the single-instance behaviour and the outside-`#app` placement stay**.

### 2.12 Accessibility layer (`14-ui-boot.js:195-259`)
A MutationObserver gives every element with an `onclick` (that is not a button/link/input) `tabindex=0`, `data-kbd`, `role=button` (unless it contains interactive content), `aria-pressed` from `.on` for `.chip/.dt/.t2`, `role=checkbox` + `aria-checked` for `.task-check/.plan-check`; Enter/Space activate. Focus ring `:focus-visible{outline:3px solid var(--green); box-shadow:0 0 0 6px rgba(201,166,100,.85)}`; `prefers-reduced-motion` kills animations (`index.html:409-421`). New components should be real `<button>`s with `aria-label`s that have Arabic entries.

### 2.13 State classes the JS toggles (must keep their meaning)
`.view.active`, `nav.bottom button.active`, `body.not-today`, `body.on-today` (home), `body.ar`, `#modalBack.show`, `.lightbox.show`, `#toast.show`, `.dot.show`, `.navdot.show`, `.chip.on`, `.dt.on`, `.t2.on`, `.quickdate button.on`, `.brand-body.open`, `.ms-fold.open` (home), `.task-check.checked`, `.plan-check.done`, `.card.dim`, `.cal-cell.today/.sel/.other/.wkend`, `.badge.overdue/.today/.upcoming/.none/.done`, `.cls-A…F/.cls-Closed`, `.stamp.sup`, `#view-log.log-saving`, `.proreport.active`, `.print.off`, `.bar-fill.coral`, `.ms-grid.ms-vteam/.ms-vperson` (home).

---

## 3. Screens, view by view

### 3.1 Today (`#view-today`)
**safe-wt (v122 look, what the base shows now)** — `renderToday()` 05:630:
1. `#heroCard` dark hero: "Sales this week (ERP-verified)" (ERP week figure when a file covers the week, else app-logged), visits · orders, three tiles DUE / CONVERSION / TASKS.
2. `#erpNudge` (supervisor cards), `#visitsNudge`, `#occasionsCard` (birthdays ≤ 7 days, doctors due — taps to Doctors), `#targetCard` (`renderTargetCard` 05:451: "<Month> target" + Months chip + "details ›"; per rep a bar, %, "<a> KD of <t> KD · Achieved|On pace|Behind · Visits n/m (p%)", "Achieved: <source> · target: DSR", stale-target note; supervisor: Team row; cross-invoice notice `crossInvoiceNoteHTML` 05:518), `#docCardsNudge` (`renderDocCardsNudge` 10:750).
3. "Today's plan" + link `#planLink` "Plan today" → `openPlanDay()`; `#planList` (`renderPlanList` 05:749: cards with `.plan-check`, tap → `quickLogFrom`; supervisor grouped by person `.doc-group-head`; empty "Plan beats improvise").
4. `#missedTitle`/`#missedList` "Missed planned visits" (`renderMissedPlans` 05:538: Reschedule → `openReschedulePlan`, ✕ → `removeMissedPlan`).
5. "Follow-ups due" `#dueList` (cards → `confirmFollowUp(id)` 06:667; empty "✅ All caught up").
6. "Tasks" + link "Import from email" → `openEmailImport()`; `#newTaskInput` + "+" (`addTask`); `#taskList` (`renderTasks` 05:711: `.task-check` toggle, due badge, `.del` ×; empty "✨ Clear head, clear road. No open tasks.").
7. "Recent visits" + "See all" (→ Log view) `#recentVisits` (3 latest; empty "🌱 Your first logged visit starts the story.").

Called but render nothing (their host elements are gone from index.html): `renderWelcome` (#welcomeCard), `renderFocusCard` (#focusCard), `renderDormant` (#dormantList), `renderStreak` (#streakCard), `renderBadges` (#badgeStrip), `#nudgeCard`, `#tileTeamSub`, `#adminPanelBtn`, `#erpImportBtn` — do **not** re-create elements with these ids by accident (they would come back to life).

**home-wt (held v123, the one that returns — details in §12).**

### 3.2 Log a visit (`#view-log`, `index.html:593-680`; `06-log-visit.js`)
Head: "Log a visit" + chips "Call" (`openCallLog()`) and "Order only" (`openStandaloneOrder()`); `#logAsLabel` "Takes about a minute."; `#logAsWrap` "Logging as" `#logAsChips` (**supervisor only**). Then seven `.step-h` steps (`.n` number, `.hint`):

| Step | Markup | Behaviour |
|---|---|---|
| 1 Where were you? (pick the clinic) | `#clinicSearchLog` (oninput `renderClinicSelect()`), `#clinicPickList`, `#selectedClinicCard` (with "Change" `button.chip`), "+ Add a new customer" `#newClinicBtn` → `#newClinicFields`: `#newClinicName`, `#newClinicContact` (optional), `#newClinicPhone` (optional), `#newClinicAsk` (owner/sales check card, v123), "Class" `#newClinicClsChips`, "Account type" `#newClinicAcctChips`, "Cancel" | required: a clinic ("Pick a clinic first"); new: "Enter a clinic name", "A clinic with this name already exists", the sales check "⚠️ Not saved — this clinic name needs a check first (see under the name)" |
| 2 Who did you meet? (tap everyone — each counts as a contact) | `#doctorPickWrap`, `#doctorPickChips`, `#docTipLink`; "+ Add doctor" → `openQuickAddDoctor` (`#newDocName`) | **required** for a listed clinic: "👨‍⚕️ Pick who you met — required" / "👨‍⚕️ Add the doctor you met first (+ Add doctor)" |
| 3 What did you discuss? (products you presented) | `#prodSearchLog`, `#productChips` (brand groups `.chip-brand-group`, `.chip.withimg`, max-height 180 scroller with a mask) | optional |
| 4 Prescriptions given? (the pads you left today) | `#rxWrap` > `.step-h`, `#rxYes`/`#rxNo` (`setRx`), `#rxBlocks` (per person `[data-rx-doc]` × type `[data-rx-type]` rows with `.pname`, `.rx-plus`, `input.rx-qty`), `#rxAddClinic-log`, `#rxTotal-log`, notes `#rxStaleNote` / `#rxTypesNote`, "Edit types" `#rxEditTypes` (supervisor → `openRxTypes()`, 06:844) | pads, whole numbers; Arabic checked word by word (visit-rx) |
| 5 Any order? | `#orderYes`/`#orderNo` (`setOrder`); no: `#noOrderWrap` "Why no order this visit?" `#noOrderChips` + `#noOrderOther`; yes: `#orderItemsWrap` > `#ordersContainer` (`renderOrders` 06:322: per order product rows `.qty-row` with `.stepper` −/`input.val`/+ (`#q-<orderId>-<slug>`), discount `.disc-chips` presets + `.disc-other`, notes, "Net" row), "+ Add another order", "Visit total (after discount)" `#orderTotalDisplay` | totals via `UMCore.orderGross/orderNet` |
| 6 When is the next visit? (a promise is a pipeline) | `#quickDates` (+3 days, +1 week, +2 weeks, +1 month), `#followUpDate` | optional |
| 7 Notes & extras (optional) | "How did the doctor feel about us today?" `#moodChips`; `#visitNotes`; "Photos from this visit" `#visitPhotoRow` (`.photo-thumb`, `.ph-del`, `.photo-add` → `addVisitPhoto()` → global `pickImage(cb)`); `#jointWrap` "Joint visit with (a colleague who was with you)" `#jointChips` | optional |

Then `<button class="btn" onclick="saveVisit()">Save visit</button>` and "My visit log" + "Full log & search" (`openVisitLog()`) with `#logHistory` (12 latest, edit pencil → `openEditVisit`).
Save lock (v122): `setLogFormBusy` (06:474) adds `#view-log.log-saving` + `aria-busy`, inserts `#logSavingNote` "⏳ Saving the visit…" right after the button found by `onclick === 'saveVisit()'`; CSS `#view-log.log-saving > *:not(.btn):not(#logSavingNote):not(#logHistory):not(.section-title){pointer-events:none; opacity:.5}` (`index.html:97`). After a save the app switches to Today **only if the same form is still open** (`_logFormGen`).
Dark-page specifics: step headings white, hint text `rgba(255,255,255,.55/.6)`, `#rxTotal-log` `color:#fff` inline (06:834,846).

### 3.3 Clinics (`#view-clinics`, `index.html:683-707`; `07-clinics.js`)
Head "Clinics" + gear `#manageClinicsBtn` (**supervisor**, → `openManageClinics()`) + "+" (`openAddClinic()`); `#clinicRepFilter` chips; toggle `.dash-toggle` `#dtDash` "Dashboard" / `#dtList` "List" (`setClinicMode`).
- **Dashboard** `#clinicDash` (`renderClinicDash` 07:208): `.kpi4` tiles (Active clinics · "Orders logged in visits · all time" · Visits logged · Orders · % conv. · Doctors on file · Discount given), then `erpDashSection()` (07:139: "🧾 Customer sales (ERP)" `.chartcard` — its own `.kpi4` tiles "Bought / Didn't buy / Online / channels …", donut `svgDonut`, top-buyers `svgBars`, class bars, tabs bought/not (`erpDashTab`), list of buyers, the reconciliation `#erpDashRecon` with `[data-part="clinics|channels|ignored|total"]` and `[data-person]` rows), Coverage (`.bar-track`), Portfolio by class (`.segbar` + `.seglegend`, tap → `showClinicClass`), Account mix (svgBars), "🏆 Top clinics by orders logged", "👟 Most visited", dormant, priority unseen, doctors by specialty (`.rank` rows).
- **List** `#clinicListPane`: `#clinicSearch` (oninput `renderClinics()`), `#clinicVisitChips` (All / ⭕ Never visited / 1–2 / 3–5 / 6+ visits, with counts), `#clinicClsChips` (All classes / Class A–F / Unclassified, with counts), "Doctors database" button, `#namelessCard` (clinics/doctors without a name, duplicate doctors), `#clinicList` (`.card.clickable` with class-colour start border, `.cls` badge, `.clinic-name` (+🆕), `.clinic-sub` rep · visits · 📞 calls · last · account, specialty emoji row, follow-up `.badge`, next-action line + "Reschedule" chip; empty "No clinics here").
- **Clinic card** `openClinicDetail(id)` 07:949 (sheet): details, `#profileNotesEdit`, doctors (`renderDoctorRows` 09:579, `#newDocName` + add), lost-doctors line, visits with `.visit-hist`, orders (`renderClinicOrders`), ERP ledger (`clinicErpSection` 07:1175, notes per line `erpNoteInput`, return kinds, FOC kinds, no-sale reason), "ERP accounts counted here" `#clinicErpAccounts` with `[data-erp-link]` buttons (Move… / Count another ERP account here…), follow-up actions, "Add to today's plan" (`addToPlan` 09:648), Edit (`openEditClinic` 07:1237), Remove (`deleteClinic` 09:673 → recycle bin).
- Add clinic `openAddClinic()` 07:806 (`#mClinicName`, `#mClinicContact`, `#mClinicPhone`, owner chips `#mClinicRep` (v123), deal-type and class chips, `#mClinicAsk` owner/sales check with `[data-ask]` "Count from this month").

### 3.4 Products (`#view-products`, `index.html:710-719`; 10)
"Products" + "+" (`openAddProduct()`); nudge; "Selling guides — how to sell every category" (`openCategoryGuides()`); `#productSearch` "Search products or brand..."; `#productListWrap` (`renderProducts` 10:29): catalog-gap note (`catalogGapNote` → `openCatalogGaps`, supervisor) and duplicate note (`productDupNote` → `openProductDups`), then per brand `.brand-group.card` with `.brand-head[data-brand]` (swatch, name, count, +/−, `toggleBrand`) and `.brand-body(.open)` `#brand-<slug>` of `.product-item` (thumbnail `.pthumb`/`.pthumb-fb`, name, price) → `openProductDetail(key)` (specs `.spec-row`, notes, sales materials — supervisor edits). Empty "No products found."

### 3.5 Team (`#view-team`, `index.html:722-746`; 12)
"Team"; `.tabs2` `#tabChat` "Chat" / `#tabMem` "Memories" (`setTeamTab`).
- Chat `#teamChat`: `#chatList` (`.chatwrap` of `.msg.me/.them` with `.who`, `.when`, image; empty "💬 Start the conversation"); `.composer` (sticky above the bottom nav): `button.iconbtn[aria-label="Attach from gallery"]` → `pickChatPhoto(false)`, `[aria-label="Take a photo"]` → `pickChatPhoto(true)`, `#chatInput` "Message the team...", `#chatSendBtn.iconbtn.send` → `sendChat()`; `#chatPhotoPreview`; "Refresh messages" (`refreshTeam()`).
- Memories `#teamMem`: nudge; `.btn` "Add a memory" → `pickMemoryPhoto()` → sheet with `#memCap` and "Share memory" (`saveMemory`); `#memGrid.mgrid` of `.mcard` (photo, `.mcap`, `.mwho`) → lightbox; empty "📸 No memories yet".

### 3.6 Calendar (`#view-calendar`, `index.html:750-795`; 05:3-280, 832-975)
"Calendar"; nudge; `#calRepFilter`; `#calModeMonth`/`#calModeWeek` chips (`setCalMode`); `.cal-nav` ‹ (`shiftCal(-1)`), "Today" (`calGoToday`), › ; card with `#calRangeLabel`, `#calBody` (month: `.cal-dow` + `.cal-grid` of `button.cal-cell` (`.today`, `.sel`, `.wkend` Fri/Sat, `.other`) with `.cal-dots` coloured `<i>`; week: seven `.card.clickable` rows with counts "n planned · n visited · n follow-ups · n tasks · n events" / "Nothing scheduled"), `.cal-legend` (Planned hollow green, Visited sage, Follow-up amber, Task purple, Event `#3478F6`).
`#calAgendaTitle` + `#calAgenda` (`renderCalAgenda` 05:85): "+ Event" (`openAddEvent`) and "+ Plan visits" (`calOpenPlanner` → `openDatePlanner`), then `.cal-item` rows tagged EVENT / PLAN / FOLLOW-UP / VISITED / CALL / ORDER / TASK (task "Done" chip `calDoneTask`; visits with photo thumbnails → lightbox); empty "Nothing scheduled this day yet."
`<details class="card">` "📊 Insights for any date range ▾": presets This week / This month / Last month / Next 7 days (`calRangePreset`), `#calFrom`/`#calTo`, "Show insights" → `#calRangeResult` (11 tiles: Visits, Orders, Sales, Conversion, Contacts seen, Clinics covered, Calls, Planned visits, Events, Follow-ups due, Open tasks due; per-rep lines; "Open this period in Report →" `openReportForRange`). Validation "Pick both dates", '"From" must be before "To"'.
Sheets: `openEventForm` (Title, Date, Time, Type select [Meeting, Training, Conference, Marketing, Personal, Other], Who is it for? (supervisor: Whole team + REPS), Notes; "Give the event a title", "Pick a date"; delete via native `confirm('Delete this event?')`), `openDatePlanner(date, rep)` (supervisor rep chips `#dpRepChips`, `#dpSearch`, `#dpPicker` chips, "Planned" `#dpSelected` cards with note inputs), `openWeekMonthPlan()` (Weekly/Monthly, ‹ ›, `#pvBody` day cards) — **no UI entry point reaches `openWeekMonthPlan` today** (audit-fixes CAL-3 calls it directly).

### 3.7 Doctors database (`#view-doctors`, `index.html:797-807`; 10:250-1296)
Title with stethoscope icon; nudge; chips `#ddTabDb` "Doctors" / `#ddTabRx` "Prescriptions growth" (`ddTab`); `#ddFilters` (All / Follow-up due / Birthdays soon / On prescriptions / Incomplete cards, with counts); `#ddSearch`; `#ddBody`: action chips (Import contacts — supervisor, Doctor records, Complete data (n), Export (Excel), "Data completeness: n%") and doctor cards (`openDoctorProfile(clinicId, docId)`: specialty emoji, name, title, `docBadges` influence/role/stage, clinic · rep · visits · calls, badges "n d late", "✓ cadence", birthday, "💊 n pads this month"); empty "👨‍⚕️ No doctors match…". Rx tab `renderRxStats` (10:330): `.rx-tile` tiles with `[data-rx-total="week|month|all"]`, By doctor `[data-rx-doctor]`, By center `[data-rx-center]`, By type `[data-rx-bytype]`, growth "▲/▼ n%" / "from zero", Export, "Prescription types" `#rxTypesBtn` (supervisor, 10:386 → `openRxTypes()`), `#rxIncomplete` (months of visits not loaded, 10:395).

### 3.8 Clinic sales analysis (`#view-clanalysis`, `index.html:809-815`; 10:1297-1560)
Title with target icon; nudge; `#caRepChips` (supervisor: one chip per rep, `caRep`); `#caSearch`; `#caBody` (`renderClinicAnalysis`): per clinic its share of each brand target (`UMCore.allocateClinicTargets` over all uploaded invoices), this month's purchases (`caMonthClinicSales`), what to sell next (`sellGuideBlock`) → `openClinicAllocDetail(clinicId)` sheet. Empty: "No reps configured yet.", "🎯 No brand targets yet".

### 3.9 Selling playbook (`#view-playbook`, `index.html:817-821`; 10:1561-1640)
"Selling Playbook"; nudge; `#playbookGrid.tile-grid`: a card of doctors without a specialty (one-tap specialty chips → `tagDoctorSpecialty`), then one `.tile` per specialty (`.ic` emoji from `SPECIALTY_PLAYBOOK`, name, "n in your clinics") → `openPlaybook(sp)` sheet (`.pb-hero`, angle, pains, lead products, hooks `.pb-item`, objection `.pb-obj`, the doctors of that specialty in your clinics). Category guides (`openCategoryGuides` 10:1791 → `openCategoryGuide` → supervisor `openEditCategoryGuide` with `#cgSell`, `#cgHow`, `#cgObj`, links `#cgLinkTitle`/`#cgLinkUrl`).

### 3.10 Report (`#view-reports`, `index.html:824-876`; 12:1-287, 1068-1434)
"Report" + "Month reports" chip (`openMonthReports()`); `#reportRepFilter`; range chips `#repWeek` This week (7) / `#repMonth` This month (30, default) / `#repQuarter` This quarter (90) / `#repAll` All time (9999) / `#repCustom` Pick dates → `#repCustomRow` (`#repFrom`, `#repTo`, "Show this period"); chips "Coverage" (`openCoverageBoard()`), "Compare" (`openCompare()`).
"Sales coach — read this first" + nudge + `#coachCard` (`renderCoach`: cards with DO NOW / WATCH / WORKING labels, emoji icon from core).
Card of `.report-line`s: Visits logged `#repVisits`, Contacts seen `#repContacts`, Orders taken `#repOrders`, `#repRevenueLabel` "Sales" / "Sales (ERP-verified)" `#repRevenue` (+ `#repErpRow` "logged in app for the same period: …"), Discount given `#repDiscount`, Clinics covered `#repClinics`, Overdue follow-ups `#repOverdue`.
`#chartsWrap` (`renderCharts` 12:1275): six `.chartcard`s — Sales trend (svgLine), Sales by rep (svgBars), Visit outcome (svgDonut), Sales by brand, Why orders weren't placed, Coverage by clinic class.
`#teamCompareTitle`/`#teamCompareCard` "Team comparison" (**supervisor**: `.compare-row` grid Rep / Visits / Logged / ERP / Target + Team row).
"Top products discussed" `#repTopProducts`; "Why orders weren't placed" `#repNoOrder` (`.bar-row` coral bars); "Performance evaluation" + nudge + `#scorecards` (`renderScorecards` 12:1358: `.score-card` per person with `.kpi-grid`, `.bar-row`s, `.guidance-block` "Your focus this period"/"Coaching guidance" (uppercase by CSS), ends with the "Team · <Month> target" card); "Export & share this report" → `openReportTools()`.

### 3.11 More (`#view-more`) — §2.4.

---

## 4. Every sheet (`showModal`) — 87 calls in 84 functions, grouped by feature

F = has form fields (46); L = long list inside (scrolls; needs a sticky header/footer on phones).

| Feature | Function (file:line) — sheet |
|---|---|
| **Sign-in & account** (shell) | `gateTap` 03:114 F (password) · `openEmailLogin` 03:131 F · `openAccountMenu` 03:46 · `openChangePassword` 03:60 F |
| **Today** (dashboard) | `openPlanDay` 05:785 F L (clinic chips) · `openReschedulePlan` 05:562 F · `confirmFollowUp` 06:667 ("What's the next step?", "Not yet — reschedule") · `openRescheduleFollowUp` 06:678 F · `openEmailImport` 12:1436 F (paste → task list) · home-wt: `msHow(id)` ("How it is calculated", 8 variants), `msActSheet` L |
| **Visit logging** | `openQuickAddDoctor` 06:240 F · `openCallLog` 08:323 F L (clinic search, contact, notes, follow-up) · `openStandaloneOrder` 08:133 F L (clinic search, date, products, qty, discount, notes) · `openEditVisit` 08:458 F (date, joint, follow-up, notes, doctors `#editDocChips`, photos `#editPhotoRow`, Rx `#evRx`, total) · `showEditHistory` 08:665 L · `confirmDeleteVisit` 08:686 · `openVisitLog` 09:438 F L (`#vlSearch`, ranges, `#vlBody`, "Photo gallery") · `openPhotoGallery` 09:538 L |
| **Calendar & planning** | `openEventForm` 05:224 F · `openDatePlanner` 05:904 F L · `openWeekMonthPlan` 05:839 L (no entry point) |
| **Clinics** | `openClinicDetail` 07:949 F L · `openAddClinic` 07:806 F · `openEditClinic` 07:1237 F · `openLostDoctors` 07:473 F L · `openDupDoctors` 07:596 L · `openNamelessClinics` 07:692 F L · `openDeletedClinic` 07:1442 · `openRecreateClinic` 07:1471 F · `deleteClinic` 09:673 · `openMissingClinics` 09:765 L (Arabic, ticks) · `openManageClinics` 09:846 F L (file import, search, bulk select) |
| **Doctors & prescriptions** | `openDoctorsDirectory` 10:4 F L (no entry point) · `openDoctorProfile` 10:787 F L (handover form `#hoWhat`, `#hoQty`, `#hoDate`, `#hoKind` chips) · `openDoctorRecords` 10:616 F L · `openDoctorRecord` 10:675 F (10 fields) · `openDataEntry` 10:545 / `renderDataEntryStep` 10:550 F (Arabic wizard) · `openContactImport` 10:401 F · `renderRxTypesWaiting` 10:1060 · `renderRxTypesEditor` 10:1103 F L (`#rxtNewName`, `#rxtAdd`, `#rxtList [data-rxt]` `input.rxt-name` / `button.rxt-retire`, `#rxtSave`, `#rxtRetry`) |
| **Products & guides** | `openAddProduct` 10:76 F · `openProductDetail` 10:1642 F · `openEditProduct` 07:1313 F · `openCatalogGaps` 10:127 F L (`<label>` ticks `input.cgap`) · `openProductDups` 10:193 F L (`#dupReportText`) · `openCategoryGuides` 10:1791 L · `openCategoryGuide` 10:1811 · `openEditCategoryGuide` 10:1834 F · `openPlaybook` 10:1602 L · `openProductMovement` 11:391 F L (`#pmSearch`) |
| **Clinic sales analysis** | `openClinicAllocDetail` 10:1497 L |
| **Team** | `pickMemoryPhoto` 12:999 F (`#memCap`, "Share memory") |
| **Reports** | `openCompare` 12:59 F (`#cmpRep`, `#cmpAF`, `#cmpAT`, `#cmpBF`, `#cmpBT`) · `openReportTools` 12:145 · `openAchievements` 12:1196 L · `openAssistant` 12:51 (stub "not available", no entry point) · `renderCoverageBoard` 10:1929 L · `openMonthReports` 11:274 L (Arabic) · `renderMonthClose` 11:315 L (Arabic) |
| **KPI & logs** | `openKpiScorecard` 16:21 L (table) · `openKpiSettings` 16:65 F · `openClientLog` 16:94 L · `openClientLogForm` 16:122 F (`#clForm_clinic` datalist, `#clForm_via`, `#clForm_brand`, `#clForm_text`) · `openMonthByMonth` 16:177 L (table) |
| **ERP** | `openErpImport` 11:471 F (`#erpFile`, `#erpPaste`) · `erpParse` 11:756 F L (salesman selects `#erpRep-n`, "💾 Save & analyze") · `applyTargetsFile` 11:728 · `openErpRecon` 11:927 L (75 inline styles — the worst) · `openErpLinks` 11:1320 F L (`#elSearch`, `#elList`) · `openErpLinkEdit` 11:1463 F L · `openErpLinkPreview` 11:1618 L |
| **Admin** | `openAdminPanel` 09:8 (tabs `#apTabTeam/Territory/Prices/Data/Mail` → `#apBody`; F L inside: targets `#tgRev<i>`/`#tgVis<i>`, benchmarks `#bm*`, staff list `#apStaffList`, territory `#apTerrSearch`/`#apTerrBody`/`#apDistFile`, prices `#apPriceSearch`, data health / recycle bin `#apDataBody`, mail `#mailStatusCard`/`#mailSendNow`) · `previewDigest` 09:78 · `openDistributionPreview` 09:281 L · `applyDistributionUpload` 09:304 (2) · `openStaffForm` 08:4 F (`#sfName`, `#sfEmail`, role/sells chips `#sfSells`) · `removeStaff` 08:101 |
| **Export & backups** | `openExport` 13:1308 F L (`#expFrom`/`#expTo`, presets, five Excel/Copy pairs, full backup, automatic backups list `#backupList`, Find missing clinics) · `openFullBackup` 13:1690 L (`#fullBackupBody`) · `openClinicRecovery` 13:1779 L (`#recovBody`, `input[data-recov]` in `<label>`s) · `restoreSnapshotNow` 13:1871 · `restoreDeviceClinics` 13:2014 L (`#devCopyBody`, `input[data-devcopy]`) |
| **Weekly deck** | `openWeeklyDeck` 15:41 F (`#wdEnd`, `#wdAsk`, language chips `#wdLang`, checks) |

---

## 5. Forms, required fields and validation messages
Validation is by toast (no inline field errors anywhere) except the v123 "asked in the card" flows (`askInCard`, `newClinicAskCard`, `[data-ask]` buttons). Full per-function list: `evidence/forms-safe.txt`.

| Form | Required / validated (toast text, verbatim) |
|---|---|
| Log a visit `saveVisitNow` 06:495 | supervisor: "Choose which rep you are logging for"; new clinic: "Enter a clinic name", "A clinic with this name already exists", owner check card; "Pick a clinic first"; doctors: "👨‍⚕️ Pick who you met — required" / "👨‍⚕️ Add the doctor you met first (+ Add doctor)"; double tap: "Already saving…"; results via `visitSaveMsg` / `visitNotSaved` ("Visit not saved — not allowed …", "… too large …") |
| Order only `saveStandaloneOrder` 08:267 | "Enter the customer name", "Pick a clinic first", "Add at least one product" |
| Call log `saveCallLog` 08:417 | "Enter the customer name", "Pick a clinic first", "Add a quick note about the call" |
| Edit visit `saveEditVisit` 08:581 | "Pick a date" |
| Event `saveEventForm` 05:247 | "Give the event a title", "Pick a date"; owner-only edit/delete "🔒 Only its owner can edit this event" |
| Reschedule plan / follow-up | "Pick a date" |
| Add / edit clinic 07:911 / 07:1272 | "Enter a name" / "Enter a clinic name", "A clinic with this name already exists", "Another clinic already has that name"; owner check |
| Add / edit product 10:90 / 07:1338 | "Enter a product name", "That product already exists", "Enter a product code" |
| Doctor (quick add, records, clinic card, profile) | "Enter a doctor name"; profile name: "الاسم لا يمكن أن يكون فارغًا"; handover: "اكتبي ماذا سُلِّم" |
| Rx types editor | "Every type needs a name", "A name can be up to 40 characters", "Keep at least one active type", "The previous save is still on its way — tap Save again in a moment." |
| Staff `saveStaff` 08:27 | "Enter a name", "That name or email is already used" |
| Compare `renderCompare` 12:108 | "Fill in all four dates" |
| Report custom range / calendar insights | "Pick both dates", '"From" must be before "To"' |
| Requests log `saveClientLog` 16:133 | "Pick a clinic from the list" |
| Catalog gaps / missing clinics / backups ticks | "Tick at least one product", "Nothing ticked", "لم تعلّم شيئًا", "Nothing selected" |
| Change password | §2.7 |
| E-mail → tasks | "Nothing selected", "Type a task first" |
| Weekly deck | "The weekly management deck is a supervisor tool" |

---

## 6. Lists, charts, empty states, search, filters, dates, exports

**Lists / tables.** Card lists (`.card` rows): plans, missed plans, follow-ups, recent visits, visit history, clinics list, clinic buyers/non-buyers, doctors, products (brand accordions), clinic analysis, chat, memories grid, calendar agenda, admin staff/territory/prices, ERP account list. Row lists: `.report-line`, `.rank`, `.spec-row`, `.qty-row`, `.doc-row`, `.sg-row/.sg-buy`, `.alertrow`, `.pr-list-item`. Real `<table>`s: KPI scorecard, Month by month, ERP reconciliation, master report `.pr-tbl`/`.mr-*`, distribution preview; CSS grid "tables": `.compare-row` (Team comparison). Harnesses read the KPI and Month-by-month tables **as row text** (kpi: `/Sep 26 0 0 — — \d+ Oct 26 \(to 8\) 0\.2 1 — — \d+/`, "Sales achievement 30%") — a stacked-card mobile version must not change the desktop (1280) DOM order, and must not put both versions in the DOM unless one is `display:none`.

**Charts — all hand-drawn, no library, no canvas charts.**
| Chart | Drawn by | Used in |
|---|---|---|
| `svgBars(data)` 12:1218 — `<svg viewBox 320×130 preserveAspectRatio=none>`, `<rect rx=4>`, value labels, `<title>` tooltips, "Not enough data yet." | Reports (5), Clinics dashboard (top buyers, class, account mix) |
| `svgLine(points)` 12:1234 — path + area with a **fixed gradient id `lg`** (two line charts on one page would collide), circles with `<title>` | Reports "Sales trend" |
| `svgDonut(slices)` 12:1251 — arcs, centre total + label, legend | Reports "Visit outcome", Clinics "Bought / Didn't buy" |
| CSS bars `.bar-track/.bar-fill(.coral)` | Reports no-order reasons, scorecards, Clinics coverage, achievements, doctor records completeness |
| `.segbar` | Clinics "Portfolio by class" |
| inline `<div>` progress bars | safe-wt target card rows, admin, KPI, month close |
| `msChartSVG` home-wt 05:1112 — cumulative sales vs straight line to target vs forecast, 600×220, mirrored in Arabic, labels `data-notr`, `role="img"` + aria-label | held Today (laptop) |
| `mrChartSvg` 13:414 | master report document (HTML/PDF) |
| PPTX charts (PptxGenJS, vendored) | weekly deck file |
Colours: `CHART_COLORS = ['#022917','#0B3D22','#FF9500','#5E5CE6','#34C759','#FF3B30','#C98A1E','#0F5257']` (12:1217), `clsColor` A `#34C759`, B `#57B85D`, C `#FF9500`, D `#C7C7CC`, F `#FF3B30` (06:158), `brandColor` per brand (10:53).

**Empty states** (`.empty` + `.big` title; 37 across 8 files — `grep 'class="empty"'`): Today (all caught up, first visit, plan beats improvise, no tasks), Log history, Clinics (no clinics here, nothing to name/check, recycle bin empty), Products (no products, no duplicates), Doctors (no doctors match, no pads), Analysis (no reps, no brand targets), Team (start the conversation, no memories), visit log/gallery, coverage, ERP mapping, exports. Under the dark page `.view .empty` is white-on-transparent (`index.html:74-75`).

**Search boxes** (all filter on input, no debounce): `#clinicSearchLog`, `#prodSearchLog`, `#clinicSearch`, `#productSearch`, `#ddSearch`, `#caSearch`, `#planSearch`, `#dpSearch`, `#vlSearch`, `#docDirSearch`, `#drSearch`, `#pmSearch`, `#elSearch`, `#elClinicSearch`, `#mgSearch`, `#apTerrSearch`, `#apPriceSearch`, `#soClinicSearch`, `#soProdSearch`, `#clClinicSearch`. There is **no global search** (the spec's top-bar search is "where the existing app supports it" — it does not).

**Filters** (all `.chip` rows): rep filters (Clinics, Report, Calendar, analysis, coverage, KPI, month by month, plan view), clinic visit buckets & classes, doctors filters, report ranges, calendar month/week, dashboard/list, chat/memories, doctors/prescriptions, admin tabs, ERP link list filters (`elSetFilter`), export presets.

**Date controls** (native `<input type="date">` everywhere): `#followUpDate` + quick-date buttons, `#repFrom/#repTo`, `#calFrom/#calTo`, `#evDate`/`#evTime`, `#rsDate`, `#rfDate`, `#soDate`, `#clFollowUp`, `#evFollow`, `#cmpAF…`, `#expFrom/#expTo`, `#wdEnd`, `#deDocBday`, `#drBirthday`, `#hoDate`, KPI open days (text list).

**Export / print / share paths**
| Path | Function | Output |
|---|---|---|
| Report → Export & share | `openReportTools` 12:145 | Share (`shareReportFile` — Web Share of an HTML file), Save as PDF (`downloadReportPdf` — hand-built PDF from rasterized pages, 13:795-1011), Save as HTML (`downloadReportFile`), View on screen / print (`showProReport` → `window.print()`), Copy as text (`copyReport`), Data exports (`openExport`) |
| More → Export & share | `openExport` 13:1308 | Excel (`makeXlsx`, no library) / copy-as-CSV for visits, clinics, doctors, scorecard, tasks; full backup JSON; automatic backups (restore) |
| Doctors | `exportDoctorsDbXlsx`, `exportDoctorReportXlsx`, `exportRxXlsx` (10) | Excel |
| ERP reconciliation | `downloadErpReconFile` / `shareErpReconFile` (13:1051-1099) | HTML via `wrapReportDoc` + `collectReportCss()` — **copies `:root` and every rule whose selector matches `/\.pr|\.proreport|\.kpi|\.stamp/` from the page's stylesheets** |
| Product duplicates | `copyProductDupReport` | clipboard text |
| Visit log | `copyVisitLog` | clipboard text |
| Weekly deck | `downloadWeeklyDeck` 15:81 | .pptx (EN / AR / both) |

---

## 7. Roles
`currentUser.role` is `'rep'` or `'supervisor'`; `REPS` = reps + supervisors who sell. Reps are hard-scoped: `canViewClinic`, `ownRepOnly` (every rep-filter setter collapses to her own name), `visibleVisits/Tasks/DueClinics` (05:396-430).

| Area | Supervisor only / different |
|---|---|
| Shell | `.stamp.sup` colour; More tiles Weekly deck, ERP import, Admin panel |
| Today | Team row and every person on the target card (rep: her own line, **no "Team", no "2 reps"**); ERP nudge cards; plan list grouped per person; held v123: team view + person switch `#msSwitch`, rep sees only hers (leak checks in main-screen) |
| Log a visit | "Logging as" chips |
| Clinics | All + REPS chips; Manage clinics gear; ERP account links; nameless/lost/duplicate tools also for the clinic owner |
| Calendar | "Whole team" events; edits others' events |
| Report | Team comparison card; scorecards of everyone with "Coaching guidance" |
| Doctors | Import contacts; Rx types editor |
| Products | Catalog gaps & duplicates notes; edit guides; sales materials |
| Analysis | rep chips |
| KPI | Team chip, KPI settings |
| Export | Full backup, automatic backups, find missing clinics, restore |

---

## 8. Module map — spec §6 → the app

| Spec module | App views and functions | Lane (§13) |
|---|---|---|
| 6.1 Field Ops / Home | `#view-today`: plan (`renderPlanList`, `openPlanDay`), missed plans, follow-ups (`#dueList` → `confirmFollowUp`), tasks + quick task + e-mail import, recent visits, Log a visit; held v123 main screen (§12) | **Dashboard** (not a lane) |
| 6.2 Visit logging | `#view-log` (06 all), Call log, Order only, Edit visit, edit history, delete (08:131-722), photos & lightbox (12:288-734), visit log & gallery (09:436-578) | A |
| 6.3 Clinics | `#view-clinics` (07), clinic card & ERP section, add/edit, nameless/lost/duplicate sheets, deleted/recreate, doctors on a clinic, add to plan, delete clinic, manage/missing clinics (09:579-996) | B |
| 6.4 Doctors | `#view-doctors`, doctor profile, records, data entry, directory, contact import, Rx tab, Rx types editor, decision map shown in the clinic card (10:3-26, 250-749, 762-1296) | A |
| 6.5 Products | `#view-products`, add product, product detail & materials, Edit product (07:1312-1395), `removeProduct` (07:1424), catalog gaps, duplicates, category guides | B |
| 6.6 Team | `#view-team` (12:735-1067) | A |
| 6.7 Calendar | `#view-calendar`, events, date planner, week/month plan (05:1-281, 832-975) | A |
| 6.8 Clinic sales analysis | `#view-clanalysis`, `openClinicAllocDetail` (10:1297-1560) | B |
| 6.9 Selling playbook | `#view-playbook`, `openPlaybook`, category guides (10:1561-1640, 1762-1890) | B |
| 6.10 Reports | `#view-reports` (12:1-287, 1068-1434), compare, report tools, pro report & PDF/HTML/share (13), month reports & month close (11:262-370), coverage board (10:1891-2025) | C (coverage board B) |

**Areas the spec does not name — each still gets the design:**
| Area | Where | Module / lane |
|---|---|---|
| Sign-in screen, account menu, change password, language switch | 03, 14 | Shell |
| Header, bottom nav / side bar, More list | index.html, 05:282-345 | Shell |
| Status bars, toasts, modal, lightbox, nudges | 04, 13:2105, 02, 14, 12:686-734 | Shell (lightbox look: A) |
| Today nudges: ERP health, month inputs, visits not loaded, occasions, doctor cards | 10:2026-2073, 04:350, 05:435, 10:750 | Dashboard |
| E-mail → tasks | 12:1435-1501 | Dashboard |
| Follow-up confirm / reschedule sheets | 06:647-722 | A (opened from Today and Clinics) |
| Orders (Order only), calls | 08 | A |
| Prescriptions step & Rx types | 06:751-1014, 10:1024-1296 | A |
| Requests, escalations & stands; KPI scorecard & settings; Month by month | 16 | A |
| Occasions (birthdays) | 05:435 + Doctors filters | Dashboard / A |
| Achievements | 12:1068-1215 (motivation engine) | C |
| Assistant stub (no entry point) | 12:51 | C (leave as is) |
| Clinics without a name, doctors without a name, duplicate doctors | 07:430-805 | B |
| Missing clinics and Manage clinics (Admin → Manage clinics) | 09:722-842, 843-996 | B |
| Catalog gaps & duplicate SKUs | 10:105-223 | B |
| Product movement | 11:371-470 | C |
| ERP import, DSR targets, salesmen map, returns policy, reconciliation | 11:1-1122 | C |
| ERP account links (clinic card entry, recon, Unrecognized, import card) | 11:1123-2221 | **B** (balance, §13) |
| Admin panel: Team & targets & benchmarks, Territory (shared/gov chips, distribution upload), Catalog prices, Data health & recycle bin, E-mail reports; staff form | 09:1-435, 08:1-130, 07:1507-1573 | C |
| Export, automatic backups, full backup, clinic recovery, device copy, wipe banner | 13:1123-2170 | C |
| Weekly deck sheet | 15:41-97 | C |
| Master report / PDF document look | 13:5-1122 (`MASTER_REPORT_CSS`) | C, optional — exported documents, not screens |

---

## 9. Modules in detail — files, screens, harnesses, DOM contracts
Harness ↔ app-file usage matrix (functions each harness calls, by file) is in `evidence/js-contracts.txt`; per-harness ids and selectors in `evidence/sel-safe.txt` / `sel-home.txt`; texts and regexes in `evidence/text-*.txt`; elements found by their text in `evidence/clicks.txt`.

### 9.0 Shell
- **Files**: index.html (header, nav, gate, modal, lightbox, toast, overlay markup + all CSS), 02 (`showToast`, `I()`), 03, 14, 05:282-430 (`switchView`, `renderView`, `renderAll`, `renderMore`, visibility helpers), 04 bar renderers (creation code only), 13:2105 wipe banner.
- **Harnesses**: no-real-data (gate), smoke-all (every view and 30+ sheets, both roles, "no NaN/undefined/[object Object]" in any view's text, no page errors), save-truth (`#refusedPill`, `#tooLargeBar`, More view has no Assistant tile, no `#aiFab`), sync-core (`#refusedPill`, `#wipeBanner`), sync-safety / sync-review / team-chat / photo-honesty / photo-lifecycle (`#memOnlyBar` text), hardening (`#erpDirtyPill`), main-screen (`#bottomNav` geometry).
- **Contracts**: ids `gate`, `gateGrid`, `gateLogo`, `gatePassword`, `elEmail`, `elPwd`, `app`, `bottomNav` + `button[data-view=…]`, `navDotToday`, `headerDot`, `headerStamp`, `dateLabel`, `greeting`, `modalBack`, `modalContent`, `modalInner`, `.modal-close`, `lightbox`, `lbImg`, `lbCap`, `lbNote`, `toast`, `proreport`, `prDoc`, the bar ids; functions `selectUser`, `switchUser`, `gateTap`, `switchView`, `renderMore`, `showModal`, `closeModal`, `setUiLang`, `showToast` (global), `renderAll`; texts: "first sign-in on this phone", names in `#gateGrid`, "KPI scorecard", "Requests, escalations & stands", "Month by month", "Weekly management deck" in the More view.

### 9.1 Home / dashboard (not in a lane — §12)
- **Files**: 05 Today region (home-wt 05:436-1600 + plan 1602-1693), 10 `renderDocCardsNudge`/`renderErpNudge`/`erpHealthCard`/`monthInputsCard`, 12 `openEmailImport…`, 06 follow-up sheets (styled by A), 04 `renderVisitsNudge`, index.html Today CSS.
- **Harnesses**: main-screen, main-screen-cases, and the six target-card harnesses (audit-fixes, clinics-vs-today, hardening, rollover, seller-parity, shared-accounts) — §12.5; smoke-all (task add/toggle/delete through `#newTaskInput`, `addTask`).
- **Contracts**: §12.3–12.5.

### 9.2 Visit logging (lane A)
- **Files/functions**: 06 (`prepLogView`, `renderClinicSelect`, `pickClinic`, `clearClinicPick`, `startNewClinic`, `cancelNewClinic`, `renderDoctorPick`, `pickDoctorSeen`, `openQuickAddDoctor`, `quickAddDoctorSave`, `renderProductChips`, `toggleProductChip`, `renderNoOrderChips`, `setOrder`, order editing `renderOrders`…`updateOrderTotalDisplay`, `pickQuickDate`, `setLogFormBusy`, `saveVisit`, mood chips, Rx step `rx*`, `renderLogHistory`, `setLogAsRep`, `renderJointChips`), 08:131-722, 12:288-734, 09:436-578.
- **Harnesses**: order-form (390, touch), visit-rx (390, touch), visit-photo-offline, visit-photo-sync, photo-honesty, photo-lifecycle (all 390), supervisor-sells, seller-parity (log chips), smoke-all (log/edit/delete flow), audit-fixes (CV-2…CV-6), save-truth (B-section visits, new-clinic owner check `#newClinicAsk [data-ask]`, `#soNewClinicName`/`#soNewClinicAsk`), safety-review, visits-storage.
- **DOM contracts**:
  - ids: `view-log`, `clinicSearchLog`, `clinicPickList`, `selectedClinicCard` (+ `button.chip` "Change"), `newClinicName`, `newClinicAsk`, `doctorPickChips .chip` (hasText doctor name), `productChips`, `rxWrap` (+ `.step-h`), `rxYes`, `rxNo`, `rxBlocks`, `rxAddClinic-log`, `rxTotal-log`, `rxEditTypes`, `rxStaleNote`, `rxTypesNote`, `orderYes`, `orderNo`, `ordersContainer` (`.disc-chips .chip` hasText "40%"/"20%", `.chip.on`, `.disc-other`, `.row-between` containing "Net", `.stepper button`, `input.val`, `#q-<orderId>-<slugify(productKey)>`), `orderTotalDisplay`, `followUpDate`, `visitNotes`, `visitPhotoRow`, `logAsChips .chip`, `jointChips .chip`, `logHistory`, `logSavingNote`; Edit visit: `evDate`, `evNotes`, `evFollow`, `evTotal`, `evRx` (`.rx-doc`, `[data-rx-type]`), `editDocChips .chip`, `editPhotoRow` (`.photo-add`, `.photo-thumb`, `.ph-del[onclick*="'<photoId>'"]`), `editPhotoWait`; Order only: `soTotal`, `soProdChips .chip.on`, `soQtyWrap .qty-row` / `input`, `soNewClinicName`, `soNewClinicAsk`; visit log: `vlSearch`, `vlSummary`, `vlBody .card`, `#modalInner button[onclick*="openEditVisit('<id>')"]`, button text "Photo gallery", gallery `[data-photo-state] img` whose **`onclick` text contains `showLightbox('<photoId>'`**.
  - Rx data attributes: `[data-rx-doc]`, `[data-rx-type]`, `button.rx-plus`, `input.rx-qty`, `.pname [dir="auto"]` (type names), `[data-rx-total]`.
  - **The Save button**: exactly one `<button>` inside `#view-log` with `onclick` attribute that trims to `saveVisit()`, visible (`offsetParent` non-null ⇒ not `position:fixed`, not in a hidden container). Edit visit save: a `#modalInner button` whose `onclick` starts with `saveEditVisit(`.
  - Photo picking: the photo buttons call the **global `pickImage(cb, useCamera)` at click time** (harnesses replace `window.pickImage`).
  - Texts (asserted): "Saving the visit" note, "Already saving…", toasts "📸 Photo added…", "Photo added on this phone", "Visit saved…", "2 photos waiting to upload", "⏳ n photos waiting to upload · n kept on this phone", "✅ Saved — it reached the cloud…", "A photo reached the cloud", "Photo lost before it uploaded — only this small preview is kept", "✅ Changes saved", "Delete this visit", Rx: "Prescriptions given?", "6 pads", "Ortho care prescription ×5", "incl. 2 pads left at the clinic", "not marked as met", "Pads typed for the previous clinic were cleared", Arabic "سلّمت بريسكريبشن؟", "الدفاتر"… (`evidence/text-safe.txt` visit-rx, photo-*). Arabic: Rx step, Edit-visit Rx block and photo notes must have **no English left** (aria-label/placeholder/title included).
  - Lock: `#view-log.log-saving`, `aria-busy="true"`; first save leaves you on a newly opened form (G2).

### 9.3 Doctors & prescriptions (lane A)
- **Files**: 10:3-26, 250-749 (incl. `decisionMapBlock` 10:737, which lane B's clinic card calls at 07:988), 762-1296; 02 `docBadges`.
- **Harnesses**: visit-rx (Doctors Rx tab, profile handover, Rx types editor, Arabic), hardening (duplicate doctors merge by tap — sheet is in 07, B), smoke-all (`openDoctorsDirectory`, `openDoctorRecords`, `openDoctorProfile`, `openDataEntry`, `openContactImport`), audit-fixes (ADM-4 playbook doctors).
- **Contracts**: `ddBody`, `ddTabDb`, `ddTabRx`, `ddFilters`, `ddSearch`; Rx tab `#rxTypesBtn`, `#rxIncomplete`, `.rx-tile` + `[data-rx-total]`, `[data-rx-doctor]`, `[data-rx-center]`, `[data-rx-bytype]`, `[data-pct]`, growth "▲ 100%" / "from zero" / "Same days last month: —"; profile `hoWhat`, `hoQty`, `hoDate`, `#hoKind .chip[data-kind]`/`.chip.on`; Rx types editor `rxEditTypes`, `rxtNewName`, `rxtAdd`, `#rxtList [data-rxt] input.rxt-name`, `[data-rxt] button.rxt-retire`, `rxtSave`, `rxtRetry`, `(retired)`, "Last changed by", "Not set up yet", "Loading the prescription types|could not be loaded", "Cancel" button text; Arabic of the editor and the Rx tab fully translated ("Excel" and type names aside); toasts "✅ Prescription types saved", "⚠️ Not saved — the handover was not added. Try again with a connection.", "🎁 سُجِّل التسليم".

### 9.4 Calendar & planner (lane A)
- **Files**: 05:1-281 and 832-975 (planner). `05` is shared with the dashboard — the dashboard worker finishes 05 before lane A starts.
- **Harnesses**: smoke-all (`setCalMode` + `shiftCal` across month/week, view text > 50 chars), audit-fixes (CAL-2 plan merge, CAL-3 `openWeekMonthPlan`/`setPlanViewMode`/`shiftPlanView` from the 31st, CAL-4 `#planPicker .chip`/`.chip.on`), visit-photo-offline (`#calAgenda .photo-thumb`), kpi (requests never in `UMCore.calendarDayItems`), save-truth ("Event added 📅" only when it landed, `#evTitle`).
- **Contracts**: `view-calendar` text, `calAgenda`, `calModeMonth/Week`, `calRangeLabel`, `calBody`, `calFrom/calTo`, `calRangeResult`, `evTitle`, `evDate`, `evTime`, `evType`, `evRep`, `evNotes`, `dpSearch`, `dpPicker`, `dpSelected`, `dpRepChips`, `pvBody`, `pvRangeLabel`, `pvModeWeek/Month`, `planPicker`/`planSearch` (from Today); globals `calAnchor`, `calSelected`, `calMode`, `calRepFilter`, `planViewAnchor`.

### 9.5 Team (lane A)
- **Files**: 12:735-1067.
- **Harnesses**: team-chat (390), photo-honesty/visit-photo-offline (memories photo states).
- **Contracts**: `chatInput` (fill), `chatSendBtn` (click), `chatList`, `#chatPhotoPreview img`, `button[aria-label="Attach from gallery"]` (exact aria-label, English run), `#teamMem button:has-text("Add a memory")`, `#modalBack.show #memCap`, `#modalInner button:has-text("Share memory")`, `#memGrid .mcard` (innerText), `#modalContent .modal-close`; toasts "📸 Memory shared with the team", "Saved on this device", "✅ Offline changes uploaded & merged" (exact); functions `loadTeam`, `refreshTeam`, `sendChat`, `saveMemory`, `pickChatPhoto`, `pickMemoryPhoto`, `setTeamTab`, globals `chatMsgs`, `memories`, `pendingChatPhoto`, `chatSending`.

### 9.6 KPI scorecard, Month by month, Requests/escalations/stands (lane A)
- **Files**: 16 (own file).
- **Harnesses**: kpi (1280), seller-parity, main-screen (`msKpi()` opens the same sheet: "KPI scorecard", "Mariam · This month · 6 working days", "n/100", "x.x a day (n in m working days)", "n doctors met", "n new account(s)").
- **Contracts**: `#modalBack` innerText (whitespace-collapsed): "Total score", "Sales achievement 30%", "Answering clients on time 5%", "Open requests (1)", "Escalation · Alpha Dental Center · Mariam", "went to the manager", "1 escalation", "1 of 1 answered within 24h", "1 active · 1 checked", "of 1 government accounts", Month by month "Sep 26", "Oct 26 (to 8)", "no sales file", "day 1–8", row text `Sep 26 0 0 — — n Oct 26 (to 8) 0.2 1 — — n`, team "Visits a day (each)", "KPI (avg)"; a rep's sheets contain **no "Team"** and no "KPI settings"; ids `clForm_clinic`, `clForm_text`, `clForm_via`, `clForm_brand`, `kpi_<key>` (e.g. `kpi_discountOther`), `kpi_openDays`; globals `_kpiRep`, `_kpiPeriod`, `_mbmRep`; functions `openKpiScorecard`, `openKpiSettings`, `saveKpiSettings`, `openClientLogForm`, `saveClientLog`, `resolveClientLog`, `checkStand`, `openMonthByMonth`, `kpiCards`, `kpiSettings`, `toggleGovClinic` (Admin → Territory).

### 9.7 Clinics (lane B)
- **Files**: 07 (all but 1507-1573 bin restore/purge/adminBinHTML), 09:579-996.
- **Harnesses**: clinics-vs-today (390), clinic-recovery (390), erp-links (clinic card part, 390), hardening (`#modalInner [data-dupdoc]`, `[data-ask]` "Yes, merge"), save-truth (`#mClinicName`, `#mClinicRep .chip`/`.chip.on`, `#mClinicAsk [data-ask]` "Count from this month", `#namelessCard`, duplicate doctors), no-real-data (first clinic saves), smoke-all (rep isolation in `#view-clinics` text), audit-fixes (ADM-1/3/5, CV-1, CV-6), seller-parity (`#view-clinics`), supervisor-sells (`.clinic-name`).
- **Contracts**: `#clinicDash > .kpi4 .k` (**direct child**) with `.kn`/`.kl`; `#clinicDash .chartcard` containing "Customer sales" (or "مبيعات العملاء") with `.csub` and `.kpi4 .k` tiles (`^Bought`, "Online / channels"), `#erpDashRecon [data-part="clinics|channels|ignored|total"]` and `[data-person]`; `#clinicDash .clinic-name` inside a `.card`; global `erpDashTab`; texts "Orders logged in visits · all time" (never "Total sales"), "This month", "sales files to Oct 8", "the Today screen figure", "The Today screen shows 92.00 KD", "No sales file for this month yet: the Today screen shows 0", "not on the team list — not on the Today screen", "please report this difference"; clinic list `#clinicList .clinic-name`; `#namelessCard`; nameless sheet `#modalInner [data-nameless]`, `button[data-ask]`, texts "Use the name anyway", "The app recorded its name: …", "This phone kept its record: …", "Doctors without a name", "2 doctors from earlier visits have no name", "Nothing left to name"; Admin missing clinics `#mcCount`, buttons "العيادات الناقصة", "إرجاع المعلَّم"; clinic card `#clinicErpAccounts [data-erp-link]`, `#clinicErpAccounts button` "Count another ERP account here", `#profileNotesEdit`, `#newDocName`, `.visit-hist`; functions `openClinicDetail`, `openAddClinic`, `submitAddClinic`, `openEditClinic`, `saveEditClinic`, `renderClinics`, `renderClinicDash`, `setClinicMode`, `setClinicRepFilter`, `openNamelessClinics`, `nameNamelessClinic`, `openLostDoctors`, `nameLostDoctor`, `markDoctorGone`, `openDupDoctors`, `mergeDupDoctors`, `keepDupDoctors`, `addToPlan`, `removeDoctor`, `deleteClinic`, `openManageClinics`, `bulkDeleteClinics`, `openMissingClinics`, `missingClinicCandidates`, `restoreFromBin`.

### 9.8 Products, catalog tools, guides, playbook, analysis, coverage (lane B)
- **Files**: 10:27-249, 1297-2025; 07:1312-1395, 1424-1441.
- **Harnesses**: catalog-gaps (1280), erp-links (products list & category guide), seller-parity (`caBody`, `caRepChips`), audit-fixes (ADM-3 product code, ADM-4 playbook), smoke-all (`openPlaybook(SPECIALTIES[0])`, `openCategoryGuides`, `openCoverageBoard`).
- **Contracts**: `productListWrap` (`.brand-head` click, `.brand-body.open`), `modalBack [data-key]` / `input[data-key]` (duplicate SKUs), `dupReportText`, `label` rows with `input.cgap` (row text read from `closest('label')`), "1 product missing from the catalog", "Duplicate SKUs / barcodes 3 products share an item code or a barcode — tap to review", "Same item code (SKU) (1)", "Same barcode (1)", "nothing is merged or deleted here"; **no button on the duplicates sheet may have an `onclick` containing merge/delete/remove/persist**; `epName`, `epCode` (edit product); category guide: buttons "Edit this guide", "Edit", "Save guide", `#cgSell`, heading "Edit guide — Kerr's"; `caBody`, `caRepChips`; functions `renderProducts`, `openCatalogGaps`, `addCatalogGaps`, `openProductDups`, `copyProductDupReport`, `openProductDetail`, `openEditProduct`, `saveEditProduct`, `openCategoryGuides`, `openPlaybook`, `renderClinicAnalysis`, `caMonthClinicSales`, `openCoverageBoard`, `setCovRep`; globals `openBrands`, `caRep`, `products`, `categoryGuides`.

### 9.9 ERP account links (lane B, file 11:1123-2221)
- **Harnesses**: erp-links (1,081 lines, 390), erp-links-late (390), smoke-all (`openErpLinks`, `openErpLinkEdit`, `elChoose('@ignore')`).
- **Contracts**: ids `elList`, `elSearch`, `elSave`, `elBack`, `elErr` (visible ⇒ `offsetParent`), `elReopen`, `elUndo` (`data-undo`), `elLast` (visible), `elLastChange`, `elPreview`, `elClosedCard`, `elClosedOk`, `elNewName`, `elClinicSearch`, `erpLinksCard`, `erpImportNote`, `erpUnrNameless`, `clinicErpAccounts`; `[data-erp-link]` (value = ERP name, read via `dataset.erpLink`), `[data-target]`, `[data-closed]`, `.el-month[data-month]`, `.el-move[data-month]`, `.el-outside`, `.el-today[data-rep]`, `#modalInner select`, `tr`, `details`, `h3`; texts (128 regexes) incl. "Where do this account's invoices count?", "Check before saving", "Show the invoices (3)", "Counted now at …", "Still counts for", "Undo", "Undone", "Saving", "Saved", "No confirmation from the cloud yet", "changed on another device", "Reopen this page", "‹ Back" / "Back"; globals `_el`, `_elBusy`, `_elPv`, `_elSheet`, `_elUndo`, `_elLogChain`, `_erpLinkSaving`, `erpMap`; functions `openErpLinks`, `openErpLinkEdit`, `openErpLinkPreview(For)`, `elChoose`, `saveErpLink`, `erpLinksPaused`, `erpLinkLog`.

### 9.10 Reports (lane C)
- **Files**: 12:1-287, 1068-1434; 13:5-1122 (report docs & overlay); 11:262-370 (month reports & close).
- **Harnesses**: smoke-all (ranges 7/30/9999 text > 200, `openCompare`, `openReportTools`, `openAchievements`, `openMonthReports`, `renderMonthClose`), audit-fixes (RE-2 `#chartsWrap .chartcard` with "Sales by rep" and an `svg`; RE-5; RE-6 `#repNoOrder`; RE-7 export range; `#repRevenue`), hardening (`#teamCompareCard` Team row %, `#scorecards` "Team · \w+ target", PDF cover regex `Achieved sales[^<]*<span class="num">(\d+)%</span> of target` on `buildMasterReportBody` HTML), seller-parity (`#scorecards .score-card` shapes, "YOUR FOCUS THIS PERIOD" / "COACHING GUIDANCE" case-insensitive), rollover (`#view-reports` text length, month report Arabic "التارغت"), main-screen (Months button → "تقارير الشهور", October report shows each person's figure).
- **Contracts**: `repWeek/Month/Quarter/All/Custom`, `repCustomRow`, `repFrom`, `repTo`, `coachCard`, `repVisits`, `repContacts`, `repOrders`, `repRevenueLabel`, `repRevenue`, `repErpRow`, `repErpRevenue`, `repDiscount`, `repClinics`, `repOverdue`, `chartsWrap`, `teamCompareTitle`, `teamCompareCard`, `repTopProducts`, `repNoOrder`, `scorecards`, `proreport`, `prDoc`, `prLangBtns`; globals `reportRange`, `reportCustom`, `reportRepFilter`, `reportLang`, `reportFormat`; functions `renderReports`, `setReportRange`, `reportVisitsBase`, `reportRangeBounds`, `openCompare`, `openReportTools`, `buildMasterReportBody`, `computePrevPeriodScore`.

### 9.11 ERP import & reconciliation, product movement (lane C, 11:1-1122)
- **Harnesses**: hardening (`#erpStatus` Arabic statuses, `#erpNudge`, upload note "الفريق: n% → m%", "شاشة اليوم الآن", dialogs count), erp-split (`#erpStatus`), rollover (`applyTargetsFile`), catalog-gaps/shared-accounts/weekly-deck ("Save & analyze" button text), seller-parity (DSR read), smoke-all (`openErpImport`, `openErpRecon('seed_sales3_aug26')`, `openProductMovement`).
- **Contracts**: `erpStatus`, `erpFile`, `erpPaste`, `erpRep-<i>`, button "💾 Save & analyze" (found by `/Save & analyze/`), two Arabic native `confirm()`s about older/undated files (hardening expects exactly one dialog), functions `openErpImport`, `erpImportXlsx`, `erpAutoImport`, `applyTargetsFile`, `dsrDateFromName`, `openErpRecon`, `openMonthReports`, `renderMonthClose`, `openProductMovement`, `setReturnPolicy`, `erpPeriods`, `erpMtdMap`, `digestData`, `bestMonthRevenue`, `teamTargetNow`, `targetPctMap`, `unpackErpRows`.

### 9.12 Admin panel (lane C, 09:1-435, 08:1-130, 07:1507-1573)
- **Harnesses**: shared-accounts (tab found by text "Territory" among `button, .tab, .chip`; `#apTerrSearch`, `#apTerrBody`, `#apDistFile` (setInputFiles), "Save 2 changes", "Distribution saved", "Shared" chip and "shared – each invoice counts for whoever issued it"), audit-fixes (MAIL: `#apBody`, `#mailStatusCard`, `#mailSendNow`, "07:30", "18:30", "GitHub", "آخر إرسال", "لم يُرسَل أي تقرير بعد"; ADM-1 rename via `#sfName`; `saveTargets`, `#tgRev0`), supervisor-sells (`#apStaffList`, `#sfSells .chip`, `#apTerrBody .chip`), kpi (`setAdminTab('territory')`, `toggleGovClinic`), save-truth (`#tgRev0`, `#sfName`, "targets saved"), smoke-all (`openAdminPanel`).
- **Contracts**: `apTabTeam/Territory/Prices/Data/Mail` (`.chip.on`), `apBody`, `apDataHealth`, `apDataBin`, `apDataBody`, `tgRev<i>`, `tgVis<i>`, `bm*`, `sfName`, `sfEmail`, `sfSells`; functions `openAdminPanel`, `setAdminTab`, `saveTargets`, `saveBenchmarks`, `openStaffForm`, `saveStaff`, `reassignClinic`, `toggleSharedClinic`, `renderAdminTerritory`, `previewDigest`, `restoreFromBin`.

### 9.13 Export, backups & recovery (lane C, 13:1123-2170)
- **Harnesses**: full-backup (390 + 1280, downloads), clinic-recovery (backups sheet: `#recovBody .section-title`, `input[data-recov]` in `<label>`, `#recovNote`, buttons "Find missing clinics|ابحث عن العيادات الناقصة", "Full backup first", texts "now 0 · most in a backup 3 (Oct 15)", "deleted in the app (recycle bin)", restore asks by native confirm `/^Restore data from 2026-10-18/`), sync-core (`#devCopyBody`, `input[data-devcopy]`, `#wipeBanner`), save-truth (`#backupList`, `#devCopyNote`, "Today's backup was not saved from this phone: it is too large for the cloud"), photo-honesty/photo-lifecycle (`[data-backup-download]`, `[data-backup-pending]`, `[data-backup-landed]`), smoke-all (CSV builders, `exportRange`).
- **Contracts**: `fullBackupBody` (`[data-set]`), `[data-backup-download]` (click → a download), `[data-backup-failed]`, `[data-backup-pending]`, `[data-backup-landed]`, `[data-backup-store]`, `backupList`, `recovBody`, `recovNote`, `devCopyBody`, `devCopyNote`, `expFrom`, `expTo`, button text "Full backup" / "نسخة احتياطية كاملة"; functions `openExport`, `openFullBackup`, `downloadFullBackup`, `readCloudForBackup`, `openClinicRecovery`, `restoreMissingClinics`, `restoreSnapshot`, `restoreDeviceClinics`, `devCopyToggle`, `applyDeviceCopy`, `buildVisitsCSV`, `buildClinicsCSV`, `buildTasksCSV`, `buildScorecardCSV`, `buildDoctorsCSV`; globals `_fullBackup`, `_fullBackupSavedAt`. Arabic: the full-backup sheet must have no English left (names and codes aside).

### 9.14 Weekly deck sheet (lane C, 15:41-97)
- **Harness**: weekly-deck (1280; aborts every non-localhost request). Contracts: body text "Weekly management deck" on More (supervisor), `openWeeklyDeck()` → `#modalBack` text and `#wdAsk`; `wdSetLang`, `downloadWeeklyDeck()` produces a download; 108 regexes check the **deck's own text** (unaffected by the app's CSS). Do not change the deck builder.

---

## 10. The i18n mechanism and what breaks it

- `www/js/i18n.js`: `AR` = 1,862 exact English → Arabic entries in themed blocks (`// ---- shell & navigation ----`, `// ---- Today ----`, … lines 15-1996), `PATTERNS` = 191 regex → function entries for sentences with numbers/names, `tr(text)` (lines 2256-2293): exact lookup (after `trim`, and again with whitespace flattened), then PATTERNS, then a **leading emoji/arrow peeled** (`LEAD`, arrows mirrored `→←`, `›‹`) and the rest looked up, then ` · `-separated segments each looked up, then multi-line blocks line by line.
- Applied by the app, not by templates: `translateTree(root)` (14:125) walks every text node and every `placeholder`, `aria-label`, `title` attribute and replaces exact matches; a `MutationObserver` on `<html>` translates every node as it is added (14:165-168); `showToast` and the bars call `trOf()` themselves. **Skipped**: `[dir="auto"]` (data typed by people: clinic, doctor, product names, notes), `[data-notr]`, `script`, `style`, `textarea`, `option:not([value])`, `.proreport` (`TR_SKIP` 14:124). English UI → Arabic is in place; Arabic → English reloads the page.
- Unit test `tests/core.test.js:2753+`: every AR value contains Arabic; `tr()` behaviours. **No duplicate-key test** — a key added twice silently keeps the last value (two duplicates already exist: "Clinic name", "Enter the clinic name"; check with `scratchpad/dupkeys.js www/js/i18n.js`).
- **What breaks when markup changes**
  1. Any reworded English string → no dictionary entry → English on the Arabic screen (and the harness that asserts the old wording fails).
  2. Splitting one sentence into several text nodes (e.g. `Visits <b>3</b>/20`) → each fragment must itself be a key or match a PATTERN; usually neither.
  3. Joining nodes (e.g. putting a label and its value in one text node) defeats the exact match.
  4. **Emoji → icon**: 161 keys start with an emoji/symbol; for **154 of them the bare words are not a key** (e.g. "✅ All caught up", "🌱 Your first logged visit starts the story.", "💾 Save & analyze", "🧾 Customer sales (ERP)"). Removing the emoji from the source leaves English in Arabic unless the bare key is added (with the Arabic minus its emoji). Simplest safe route: one shared i18n change — make `lookup()` fall back to an index of keys with their leading emoji peeled — done once by the shell worker.
  5. New `aria-label` / `placeholder` / `title` strings are translated too and are inspected by the "no English left" checks (Today, Rx step, Rx editor, Doctors Rx tab, Edit-visit Rx, full backup sheet, photo notes, ERP-links toasts).
  6. A person's name or a figure that should not be translated must sit in `data-notr` (or `dir="auto"` for data); the held main screen wraps names in `msWho()` (`data-notr`, Arabic names via `wdArNames`) and negatives in `dir="ltr"` isolates.
  7. `text-transform: uppercase` and `display` both change `innerText`, which is what harnesses compare (see §14 R4).

---

## 11. The look today

### 11.1 CSS
- One `<style>` in index.html: safe-wt 454 lines / 42 KB / ~430 rules; home-wt 694 lines / 63 KB (+240 lines of main-screen CSS, `index.html:431-667`).
- Breakpoints: safe-wt only `@media (min-width:920px)` (centre the bottom nav), `prefers-reduced-motion`, `print`. home-wt adds `≤380`, `≤420`, `≤1023`, `920–1023`, `≥1024` (side rail), `1024–1365`, `≥1024 and min-height 640`.
- Page: dark-green gradient body (`linear-gradient(180deg,#0B3D22 0,#022917 340px)`), mint cards `#EBF2EC`, mint sheet `#D6ECDD`, gold selected chips `#C9A664`; `.view` text is white (`.view h2`, `.view label`, `.view > .section-title`, `.view .empty`, `.step-h`, `#productChips .chip-brand-label`, `.view .doc-group-head`, `.view .btn.ghost` — `index.html:51-52,74-75,86,132-133,197,236,417`) and several JS templates hard-code light-on-dark colours (05:344 More footer, 06:130/834/846 log hints and Rx total, 09:46/92/105 admin texts **inside a light sheet**). Moving to a light page needs both changed together.
- RTL: partly logical — 18 logical properties vs 10 physical in the CSS (`inset-inline-*`, `margin-inline-*`, `border-inline-start`, `text-align:start/end`); physical leftovers: `.msg.them/.me` corner radii, `.pr-tbl th{text-align:left}`, `.pr-headline{border-left}`, `#toast{left:50%}`, `nav.bottom{left:0;right:0}`; JS templates: 128 logical uses vs 10 physical. `body.ar` swaps heading fonts and forces `letter-spacing:0 !important`, `text-transform:none` on uppercase labels.
- Fonts: Fraunces for `h1,h2,h3,.disp` (serif "luxury" headings), system UI for body, SF Pro Display stacks for figures in `.kpi .n`, `.stamp`, `.pr-kpi .n`; no tabular numerals anywhere.

### 11.2 Tokens (`index.html:23-36`)
`--ink #1C1C1E`, `--ink-2 #3A3A3C`, `--paper #D6ECDD`, `--card #EBF2EC`, `--green #022917`, `--green-dark #0B3D22`, `--green-deep #022917`, `--green-dim #C4E4CE`, `--green-soft #9ED0AF`, `--teal: var(--green)`, `--teal-dim: var(--green-dim)`, `--on-green #FFF`, `--gold #C9A664`, `--gold-ink #7A5C22`, `--coral #FF3B30` (+ `-dim #FFEBEA`, `-ink #BE1D12`), `--amber #FF9500` (+ `#FFF4E5`, `#9A5B00`), `--sage #34C759` (+ `#E8F8EC`, `#1B7A36`), `--line #E5E5EA`, `--muted #4E5A53`, `--purple #5E5CE6` (+ `#ECECFE`, `#4644C9`), `--radius 16px`. Held v123 adds `--page #F3F6F3`, `--surface #FFF`, `--hair #E3EAE5`, `--soft #86928B`, `--accent #1E7A55`, `--accent-soft #E4F2EA`, `--track #E8EEEA`.
**Used inline by the JS** (safe-wt app files, count): `--muted` 432, `--coral-ink` 59, `--line` 55, `--amber-ink` 32, `--sage-ink` 31, `--coral` 27, `--teal` 26, `--amber` 25, `--amber-dim` 22, `--sage` 20, `--paper` 18, `--gold-ink` 11, `--ink` 10, `--gold` 10, `--green` 9, `--teal-dim` 6, `--coral-dim` 5, `--purple` 4, `--sage-dim` 3, `--purple-ink` 3, `--green-dim` 3, `--green-dark` 3, `--ink-2` 2, `--purple-dim` 1 — plus 12 `var(--x, #fallback)` forms. **All 24 names must keep resolving** (alias them to the new semantic tokens). `collectReportCss()` exports `:root` into the ERP reconciliation file, so tokens must live on `:root`.

### 11.3 Component classes in the CSS
`.card(.clickable/.dim)`, `.chip(.on/.small/.withimg)`, `.btn(.secondary/.ghost/.small)` (used 73 / 68 / 21 / 11 times in markup), `.badge(.overdue/.today/.upcoming/.none/.done)`, `.cls(.cls-A…F/Closed)`, `.empty(.big)`, `.section-title(.link)`, `.row-between`, `.toggle-row`, `.quickdate`, `.kpi-grid/.kpi`, `.kpi4 .k(.kn/.kl/.ki)`, `.chartcard(h4/.csub)`, `.bar-row/.bar-track/.bar-fill`, `.segbar/.seglegend`, `.rank`, `.alertrow`, `.dash-toggle .dt`, `.tabs2 .t2`, `.tile-grid/.tile`, `.spec-row`, `.report-line`, `.compare-row(.c4/.c5)`, `.score-card/.score-head`, `.focus-*`, `.guidance-*`, `.nudge(.nudge-x)`, `.hero`, `.welcome`, `.streak`, `.ach`, `.msg/.chatwrap/.composer/.iconbtn`, `.mgrid/.mcard`, `.photo-row/.photo-thumb/.photo-add/.ph-wrap/.ph-del`, `.lightbox`, `.modal-*`, `#toast`, `.gate-*`, `.cal-*`, `.task-*`, `.plan-check`, `.stepper`, `.disc-chips`, `.qty-row`, `.total-row`, `.doc-row/.doc-group-head`, `.pthumb(-fb)`, `.product-item/.pinfo/.pname2/.product-price`, `.brand-group/.brand-head/.brand-body`, `.pb-*`, `.sg-*`, `.rep-tag`, `.export-*`, `.pr-*`, `.svgi`, `.stamp`, `.dot`, `.navdot`, `.ai-fab` (no element in safe-wt), `.step-h(.n/.hint)`, `.visit-hist`, `.log-saving-note`, `.clinic-name/.clinic-sub`, `.del`, `.search-box`; home-wt `.ms-*` (≈80 rules).

### 11.4 Icons
- **Sprite** (`index.html:482-526`): 43 Feather/Lucide-style 24×24 stroke symbols `#i-<name>` (phone, cart, pencil, calendar, chart, package, target, stethoscope, book, layers, chat, award, share, sparkles, download, settings, camera, image, arrow-up, refresh, users, printer, clipboard, pill, alert, bell, wrench, bot, building, tooth, star, gift, cake, coffee, lock, file, globe, database, eye, shield, check, plus, compass); home-wt adds `info`, `chev`. Drawn by `I(name)` (02:114) → `<svg class="svgi" aria-hidden="true"><use href="#i-name"/></svg>` (1.05 em, `stroke-width:2`, round caps). Used: target 15, pencil 14, pill 9, chart 9, clipboard 8, sparkles 7, … (`alert`, `wrench`, `bot` unused). The set is suitable to keep and extend with Lucide paths (spec §3.5).
- Bottom-nav icons are separate inline SVGs (`index.html:901-922`).
- **Emoji as interface icons**: 652 emoji characters in the UI files (+ 76 `\u{…}` escapes): 07 102, 10 142, 11 114, 09 57, 04 56, 13 49, 06 28, 08 22, 12 19 (+48 escaped), 05 13, 16 6, 03 6, index.html 6 (nudges). Samples: section/card heads "🧾 Customer sales (ERP)", "🏆 Top clinics by orders logged", "👟 Most visited" (07:149-298), clinic list "⭕", "📞", "🆕" and **specialty emoji per doctor** (`SPECIALTY_PLAYBOOK[...].icon`, 01:440-503, shown in Clinics list, Doctors list, Playbook tiles and chips), doctor-card influence icons 👑🗣️🦷🚪 (02:8), calendar insights "📊", occasions 🎂 ⏰, nudges 📦📸📅🧠📈, message prefixes ⚠️ ✅ ⏳ 🔒 📴 🛑 in toasts and bars. Trademark ™/® in 01 are product names (data). **Toast and bar messages with emoji are asserted verbatim by harnesses** (e.g. "✅ Offline changes uploaded & merged", "📸 Memory shared with the team", "Event added 📅", "⏳ 2 photos waiting to upload · 1 kept on this phone") — treat message strings as content; replace emoji only where they act as standalone icons in markup, and add the bare i18n keys (§10.4).

### 11.5 Inline styles and hard-coded colours
- 1,790 inline `style=` attributes in the UI (index.html 118; 10: 385, 11: 344, 07: 197, 09: 172, 05: 132, 13: 113, 16: 99, 12: 96, 06: 53, 08: 48) plus 110 `.style.x=`/`cssText` assignments.
- Hard-coded hex colours: 222 in index.html markup + JS (13: 74 — mostly document CSS; 12: 27; 10: 33; 01: 21; 11: 15; 04: 12; 07: 11), 101 more inside the `<style>`. Most frequent in JS: `#FF9500` ×17, `#0B3D22` ×15, `#022917` ×10, `#5E5CE6` ×7, `#B3261E` ×6, `#C7C7CC` ×5, `#3478F6` (events) ×3, `#8B0000` (wipe banner).
- Worst functions (inline styles): `openErpRecon` 11:927 (75), `renderRxStats` 10:330 (38), `openKpiScorecard` 16:21 (37), `openDoctorProfile` 10:787 (36), `renderClinicAnalysis` 10:1377 (34), `elRenderMoves` 11:1676 (32), `renderCoverageBoard` 10:1929 (30), `erpAuditSection` 11:884 (30), `openMonthByMonth` 16:177 (28), `renderCalAgenda` 05:85 (26), `renderTargetCard` 05:451 (25), `renderMonthClose` 11:315 (24), `openClinicDetail` 07:949 (21), `renderClinicDash` 07:208 (20), `renderDataEntryStep` 10:550 (20). Full ranking: `evidence/stylecount-safe.txt`.

### 11.6 Brand assets in the repository (sampled pixel colours, `tools/pngcolors.py`)
| Asset | Size | Colours |
|---|---|---|
| `icons/logo-green.png` (wordmark: leaf mark + "ULTRAMED"), also `LOGO_DATAURI` (01:8) used by the gate and reports | 1067×240 | `#022917` (= `--green`) |
| `icons/logo-white.png` (same, white) | 1067×240 | `#FFFFFF` |
| header mark (inline base64 in index.html:551) | 200×208 | lime `#A5CF63` |
| `icons/icon-192/512.png`, `favicon-32.png`, `apple-touch-icon.png` | — | teal `#0F5257` background + lime `#A5CF63` mark |
| `img/deck/` (manifest, product and scene photos) | — | weekly deck only |
These are the official-logo variants already in the repo (dark wordmark, white wordmark, lime leaf mark, teal app icon). Brand colours from the website are Phase 2's job; the repo's own assets already give `#022917`, `#A5CF63`, `#0F5257`.

---

## 12. The held main screen (home-wt `e40d293`)

### 12.1 What it shows
**Supervisor (team view, `.ms-vteam`)** — head: hello + date (laptop), the source line ("Invoiced sales from the ERP files to <day> · targets from the DSR · working days: n of m done"), the person switch `#msSwitch` (Team + every person of REPS, himself included, Arabic names in Arabic), account button. Cards:
- `#msSales` "Team sales this month": amount (`data-ms="sales"`), "of the team target <t> KD" (`of-target`), bar with the "expected by <day>" mark, "% achieved", pill (Target reached / Ahead of pace / On pace / Behind pace), stats Remaining · Per work day (+ "n days left") · Forecast (+ "n% of target"); notes for people with a target but no figure / a figure but no target.
- `#targetCard` "<Month> target" (Tap a name to open their screen · Months · ⓘ): one row per person `.ms-person[data-person]` (name, thin bar, %, "<a> KD of <t> KD · <state> · Visits n/m (p%)", growth vs same days last month, field visits, orders logged in the app), the Team line, "The dark line on each bar = expected by …", "Achieved: <src> · target: DSR", stale-target note, cross-invoice notice `.ms-cx`.
- `#msWork` "Visits & orders": field visits this month (team), Conversion to an order, Orders logged in the app (count + value), New customers; note "Orders logged in the app are not invoiced sales…"; the week line `#heroCard` ("Sales this week (ERP-verified): … · n visits · n orders logged in the app (… KD)").
- `#msNext` "Needs you today": follow-ups due (overdue · today), first under-performing customer, first opportunity, "… — see all" → `msActSheet()`.
- Laptop only (`.ms-laptop`): `#msChart` day-by-day SVG + Same days last month / Same month last year / Year to date; `#msBrands` brands vs brand target (top 5); `#msCust` biggest customers (top 5) + "All customers".
- Phone only `#msRows`: Sales day by day, Brands, Customers rows.
- Folded cards (phone; open on laptop): `#msPlanCard` (Plan today link `#planLink`, `#planList`, missed plans), `#msDueCard` (`#dueList`), `#msTaskCard` (`.ms-taskadd` `#newTaskInput`, `#taskList`, `#docCardsNudge`, `#occasionsCard`), `#msRecentCard` ("See all", `#recentVisits`) with one-line summaries `#msPlanSum/#msDueSum/#msTaskSum/#msRecentSum`.

**A rep (and the supervisor on a person, `.ms-vperson`, "Showing the screen of X · Back to the team")**: `#targetCard` becomes her sales card ("My sales this month", Months chip, same stats, "Achieved: … · target: DSR", stale note, her cross-invoice notice); `#msWork` "My visits" (visits a day + goal + Above/Below goal pill, This week, Doctors "n of m", New accounts); `#msNext` "My next step" (next planned clinic + "Log a visit" `quickLogFrom`, or "Log a visit" + "Plan today"; Then: a follow-up, a task); laptop `#msChart` (orders I logged, conversion), `#msBrands`, `#msCust` "My customers to act on" + "My biggest customers"; KPI pill "Performance score n of 100" (laptop head) / `#msRows [data-row="kpi"]` (phone); `#msSales` hidden. A rep never sees another person's name or figure except inside the cross-invoice notice (owner's v100 rule).
Every card with figures has an ⓘ (`.ms-i` → `msHow('sales'|'work'|'visits'|'chart'|'brands'|'act'|'pcust'|'cust')`, "How it is calculated": source, formula, this view's numbers).

### 12.2 Where its figures come from (one code path each)
| Figure | Source |
|---|---|
| A person's month sales | `bestMonthRevenue(r)` = `UMCore.monthAchievement` (11:142), via `UMCore.erpMtd` once per data state (`msMtd`) |
| Targets | DSR (`targets[r].revenue`, `.visits`, `.brands`), stale note `staleTargetNote` (11:163) |
| Team line | `teamTargetNow()` / `teamTargetTotal()` (11:148-169) |
| Achievement, remaining, per working day, forecast, same days, last year, YTD, daily, new customers, visits, orders, conversion, follow-ups, act (under/potential), customers, byPerson, byBrand, byProduct | `UMCore.execDashboard(data, {rep, reps, rows})` (core 3870; return contract core 3828-3869) |
| The week so far | `UMCore.execWeek` (core 4179) |
| Visits a day, doctors, new accounts, KPI total | `UMCore.kpiScorecard` via `kpiSettings()` / `kpiRange()` (16) |
| Invoices on another rep's clinic | `UMCore.crossInvoices(digestData())` |
| Plan done / missed | `UMCore.planVisitKeys` (core 297), `UMCore.missedPlans` |
| Occasions | `UMCore.doctorAnalytics` |
| One customer's or product's drill-down | `UMCore.execDrill` — in core and unit-tested, **not used by any screen** in home-wt (a full management dashboard that uses it lives in another branch, `exec-dash-ui`, file `18-exec-dashboard.js` — not part of this base) |
Caching: `msSig(v)` fingerprints the inputs; `msEnsure` → `msRun` (setTimeout 0) computes `msBuild` once per change; `msPaint` fills the cards; `msWhenReady()` resolves when the figures on screen match the data (harnesses wait on it); `_msModel.ms` = compute time. Nothing on the main screen writes to storage.

### 12.3 Its DOM contracts (main-screen, main-screen-cases)
- ids: `msHead`, `msHello`, `msDate`, `msSource`, `msSwitch` (`button[data-r]`, `role=tab`), `msWho` (`.ms-kpi`, `.ms-av`), `msWhose` (`.ms-back`), `msGrid` (class `ms-vteam`/`ms-vperson`), `msSales`, `targetCard`, `msWork`, `msNext`, `msChart` (`svg text`), `msBrands` (`.ms-person[data-brand]`, `[data-ms="brand-pct"]`, `.s`), `msCust` (`.ms-item`, `.ms-i`), `msRows` (`.ms-item`, `[data-row="kpi"]`), `msPlanCard`, `msDueCard` (`> .ms-ct`, `.ms-body`), `msTaskCard` (`.ms-taskadd button`), `msRecentCard` (`.link` "See all"), `planLink`, `planList` (`.card[onclick]`), `dueList` (`.card`), `taskList`, `newTaskInput`, `recentVisits`, `heroCard`.
- `data-ms` keys with `data-value` (numbers or empty for "not measured"): `sales`, `of-target`, `sales-all`, `achievement`, `pace`, `remaining`, `perday`, `forecast`, `visits`, `conversion`, `orders`, `orders-value`, `newcustomers`, `perday-visits`, `week-visits`, `doctors`, `accounts`, `week-sales`, `week-orders`, `person-growth` (+ `data-r`), `brand-pct`, `cmp`, `cmp-year`, `ytd`, `ytd-sales`.
- Classes read: `.ms-card`, `.ms-stats > div > *`, `.ms-person` (`.n`, `.p`, `.s`, `.team`), `.ms-item`, `.ms-i`, `.ms-btn` ("Log a visit", "Plan today"), `.ms-back`, `.ms-more`, `.ms-ct .link`, `.ms-cx` (`details`/`summary`), `.ms-fold.open`.
- Functions: `msWhenReady`, `msOpenPerson`, `msHow`, `msKpi`, `msActSheet`, `msFold`, `renderToday`, `renderTargetCard`, `quickLogFrom`, `openPlanDay`, `addTask`, `visibleDueClinics`, `kpiCards`, `kpiSettings`; globals `_msModel`, `activeView`, `selectedClinicId`.
- Texts: "Team", names (exact switch text `^Team Mariam Renova Dr\. Ghaith$`, Arabic `^الفريق مريم رانوفا د\. غيث$`), "of the team target <t> KD", "expected by Oct 8: n%", "Orders logged in the app n orders", "not invoiced sales: sales come from the ERP files only", "n follow-ups due", "n under-performing", "Showing the screen of Mariam", "Back to the team", "Performance score n of 100", "Performance score (KPI) n of 100", "Per work day x KD n days left", "Forecast x KD n% of target", "Same month last year — No sales figure for October 2025", "Same days last month — No sales figure for September 2026", "No ERP sales file for this month yet", "The sales files of this month hold no line of this person yet", "Renova: a target but no sales figure in the files, so not in the percentage.", "of the target of the people with a sales figure 13000.00 KD", "Renova 0% 0.00 KD of 8000.00 KD · no figure yet", "What's the next step?", "Not yet — reschedule", "Plan today's visits", "How it is calculated", "The ERP sales files only", "Achievement % = invoiced sales ÷ target × 100", "تقارير الشهور", Arabic "مبيعاتي هذا الشهر", "د.ك", "التوقع للشهر", "لكل يوم عمل", "يومًا باقية"…
- Quality checks it encodes: no horizontal scroll at 360/390/768/1024/1280/1366/1440; no figure spills out of `.ms-card`, `.ms-stats > div`, `.ms-person`, `.ms-item`; the three stats under the sales card stay one line each from 390 px (EN and AR); every control on the phone has a 44 px hit area (`.ms-ct .link`, `.ms-ct button`, `.ms-taskadd input/button`, `.ms-i`, `.ms-back`, `.ms-more`, `.ms-btn`, `.ms-item`, `#msSwitch button`); the switch never cuts a name (3 people at 360, 4 at 360/390); a render < 150 ms; looking writes nothing to the cloud; Arabic leaves no English (`[A-Za-z]` outside `[dir=auto]`/`[data-notr]`, attributes included, ERP/DSR/KPI allowed); the rep's screen contains no other name/figure even in hidden HTML (`view-today` cloned minus `.ms-cx`).

### 12.4 Layout checks in main-screen.e2e.js that encode the held design (to be re-specified deliberately when the dashboard is restyled — never the figure checks)
- "Laptop 1440×900: the first cards sit side by side in one row" — `#msSales`, `#msWork`, `#msNext` same top, increasing x, `300 < msSales.width < 520`.
- "Laptop: the navigation is a side rail (full height, narrow)" — `#bottomNav` height ≥ viewport−1, **width ≤ 110**, x = 0. A labelled sidebar (spec §4.1) breaks this check by design.
- "Narrow laptop (1024 and 1280 px): two cards a row, each ≥ 360 px, the next card below; three a row from 1366 px".
- "Phone 390×844: one column — her sales, her visits, her next step stacked, each ≥ 340 px wide".
- "Phone: the fixed bottom navigation, with 'Log visit' in it (≥ 44 px) on the first screen" — nav bottom = viewport height, full width, < 120 px tall; `#bottomNav button[data-view="log"]` inside the bottom 120 px.
- "Laptop: every card with figures has its ⓘ … the plan, follow-ups, tasks and visits are open; no phone rows" — `#msRows` `display:none` at 1440; `.ms-body` displayed.
- "Phone: the rest is one tap away" — `#msDueCard .ms-body` `display:none` before and `block` after a tap on `#msDueCard > .ms-ct`; `#msRows` shown with ≥ 5 rows.

### 12.5 The six target-card harnesses (`#targetCard` innerText; identical files in both checkouts except hardening's v123 doctor-merge part)
| Harness (viewport) | What it requires of `#targetCard` |
|---|---|
| audit-fixes (1280) | rep: **no "Team", no "2 reps"**, "Visits 3/20" (field visits incl. joint, not calls); other rep: no other rep's name; supervisor: "Team" and "2 reps"; a visits-only target renders "<name> … Visits 2 of 15" (`renderTargetCard()` called on its own); missed plans `#missedTitle.style.display`, `#missedList` text ("Reschedule" once per missed plan) |
| clinics-vs-today (390) | whitespace-collapsed: `Mariam \d+% 91.00 KD of 1000.00 KD`, `Renova \d+% 30.00 KD of 1000.00 KD`, `121.00 KD of 2000.00 KD` — **DOM order name → % → "<a> KD of <t> KD"** |
| hardening (1280) | "Achieved: no ERP sales file for this month yet · target: DSR" + "0.00 KD of 10000.00 KD"; "Achieved: ERP to Sep 21 · target: DSR" and never the DSR's own achieved (3000.00); Team row with the team % and "2 reps"; "Target is from August 2026"; `#erpNudge` "المدخلات الشهرية مطلوبة" |
| rollover (1280) | "Target is from September 2026" (and gone after the new DSR); `#erpNudge` Arabic month-inputs card; **`#heroCard` contains "2 visits"** (the week) |
| seller-parity (1280) | supervisor who sells: his own row next to the reps' (both names); rep: "KD" in her card |
| shared-accounts (1280) | "Dr. Ghaith 1% 121.25 KD of 9400.00 KD"; "October target"; notice "Invoices on another rep's clinic this month" + "Mariam invoiced at <clinic> · 1 × · 60.00 KD · counted for the clinic owner: Dr. Ghaith"; `#targetCard details` → `summary` click shows "SINV9101 · Oct 3 · 60.00 KD" and "Test product · Intensiv · 1 × · 60.00 KD" **without leaving Today** (the notice stops propagation); still renders with an older core.js |

### 12.6 Bringing it back onto safety-v123 (notes for the dashboard worker)
- Revert `8670308` brings back 16 files; then keep safe-wt's v123 changes where they overlap: `saveEventForm` and `saveReschedulePlan` use `persistTold` + `saveToast` (safe-wt 05:265-267, 587-589) — home-wt still has `persist` + `showToast`; `switchUser`/`showGateScreen`/`signInEnded` were rewritten in 03 (put `document.body.classList.remove('on-today')` into the new `showGateScreen`); 09 `addToPlan` (`msPlanChanged()`); 10 `renderDocCardsNudge` (+ `_msNudge` written from 10, declared `var` in 05); `WD_NAMES_AR`/`wdArNames` move from 15 to 01; i18n.js (+325 lines), core.js (+774), tests/core.test.js (+617), `tests/e2e/fixtures/main-screen-data.js`.
- **Drop** what v123 removed: `<button class="ai-fab" id="aiFab">` (home-wt `index.html:1209`), the `fab.style.display='flex'` line in `renderAll` (home-wt 05:377-378) and the More tile "Assistant — Ask anything about your data" (home-wt 05:343) — save-truth F1 requires no ✨ button and no tile.
- The held CSS centres every non-Today view at 640 px beside a 96 px rail; the redesign's shell replaces that.

---

## 13. Lanes for parallel work (after the shell and the dashboard exist)

UI surface per module (functions, lines, inline `style=`, sheets — `tools/modsize.js`, `evidence/modsize-functions.txt`):

| Module | fns | lines | style= | sheets |
|---|---|---|---|---|
| Visit logging | 159 | 2,138 | 122 | 8 |
| Doctors & prescriptions | 49 | 1,067 | 174 | 11 |
| Calendar & planner | 30 | 419 | 68 | 3 |
| Team | 17 | 340 | 7 | 1 |
| KPI / month by month / requests | 17 | 213 | 99 | 5 |
| Clinics | 101 | 1,756 | 243 | 11 |
| Products & catalog (+guides) | ~45 | ~610 | ~103 | 8 |
| Playbook | 4 | 92 | 15 | 1 |
| Clinic sales analysis | 7 | 254 | 59 | 1 |
| Coverage board | 5 | ~130 | ~30 | 1 |
| ERP account links | 81 | 1,061 | 133 | 3 |
| Reports (+month reports, report tools, achievements) | ~42 | ~776 | ~104 | 6 |
| ERP import & reconciliation | 51 | 962 | 159 | 4 |
| Product movement | 7 | ~80 | ~11 | 1 |
| Admin panel (+staff, bin) | 37 | 660 | 100 | 7 |
| Export, backups & recovery | 54 | 1,020 | 91 | 5 |
| Weekly deck sheet | 5 | 57 | 13 | 1 |

### Lane A — Field work (score ≈ 750: 470 inline styles + 28 sheets; ≈ 4,180 lines)
1. **Visit logging** — 06 (all), 08:131-722 (Order only, Call, Edit visit, history, delete), 12:288-734 (photo strip, lightbox look), 09:436-578 (visit log, photo gallery).
2. **Doctors & prescriptions** — 10:3-26, 250-749, 762-1296 (database, Rx tab, profile, records, data entry, contact import, decision map, Rx types editor); 02 `docBadges`.
3. **Calendar & planner** — 05:1-281, 832-975.
4. **Team** — 12:735-1067.
5. **KPI scorecard & settings, Month by month, Requests/escalations/stands** — 16.
Own harnesses: order-form, visit-rx, visit-photo-offline, visit-photo-sync, photo-honesty, photo-lifecycle, team-chat, kpi, supervisor-sells, safety-review, visits-storage; parts of smoke-all, audit-fixes (CAL-*, CV-*), save-truth, seller-parity.

### Lane B — Accounts & catalog (score ≈ 830: ≈ 580 styles + 25 sheets; ≈ 3,900 lines)
1. **Clinics** — 07 (all but 1507-1573), 09:579-996.
2. **ERP account links** — 11:1123-2221 (entry from the clinic card; the links are about which clinic an account counts on).
3. **Products & catalog tools & category guides** — 10:27-249, 1641-1890; 07:1312-1395 (Edit product), 1424-1441 (`removeProduct`).
4. **Selling playbook** — 10:1561-1640 (its photo helpers `findCatalogProduct` / `BRAND_TILE_COLORS` / `playbookThumb` sit at 10:224-249, inside the Products range — same lane).
5. **Clinic sales analysis** — 10:1297-1560.
6. **Coverage board** — 10:1891-2025 (opened from Report, lives in 10).
Own harnesses: clinics-vs-today (Clinics card), clinic-recovery (nameless/lost doctors, Admin missing clinics), catalog-gaps, erp-links, erp-links-late, hardening (duplicate doctors), no-real-data (clinics), seller-parity (analysis), parts of save-truth (Add clinic owner), audit-fixes (ADM-*).

### Lane C — Management & admin (score ≈ 720: ≈ 480 inline styles + 24 sheets; ≈ 3,550 lines)
1. **Reports** — 12:1-287, 1068-1434 (view, coach, charts, scorecards, compare, report tools, achievements); 13:5-1122 overlay/toolbar (document CSS optional); 11:262-370 (month reports, month close).
2. **ERP import, DSR targets, reconciliation, salesmen, returns, product movement** — 11:1-1122.
3. **Admin panel** — 09:1-435, 08:1-130, 07:1507-1573.
4. **Export, backups & recovery** — 13:1123-2170 (+ wipe banner look with the shell).
5. **Weekly deck sheet** — 15:41-97.
Own harnesses: rollover, erp-split, hardening (ERP import, nudges, month close), shared-accounts, full-backup, clinic-recovery (backups sheet, restore), sync-core (device copy, backups list), weekly-deck, parts of audit-fixes (MAIL, RE-*), seller-parity (scorecards), save-truth (targets, backups).

### Files more than one actor touches
| File | Who (regions) |
|---|---|
| `www/index.html` | shell (tokens, components, shell markup), dashboard, A, B, C — **each in its own marked CSS section**: `/* === DS tokens (shell) === */`, `/* === DS components (shell) === */`, `/* === SHELL === */`, `/* === HOME (dashboard) === */`, `/* === LANE A: field === */`, `/* === LANE B: accounts & catalog === */`, `/* === LANE C: management & admin === */`; markup edits inside a lane's own views only (`#view-log`, `#view-calendar`, `#view-team`, `#view-doctors` = A; `#view-clinics`, `#view-products`, `#view-playbook`, `#view-clanalysis` = B; `#view-reports` = C, `#proreport` toolbar = C) |
| `www/js/i18n.js` | everyone — each adds keys in its own block at the end of `AR` (`// ---- redesign: shell ----`, `… dashboard`, `… lane A`, `… lane B`, `… lane C`) and runs the duplicate-key check |
| `05-today-calendar.js` | dashboard (Today, before the lanes) → A (calendar & planner) — sequential |
| `10-doctors-products.js` | A (3-26, 250-749, 762-1296) and B (27-249, 1297-2025); 750-761 (`renderDocCardsNudge`) and 2026-2073 (`erpHealthCard`, `monthInputsCard`, `renderErpNudge`) belong to the dashboard — untouched by lanes |
| `09-admin.js` | C (1-435), A (436-578), B (579-996) |
| `08-team-orders.js` | C (1-130), A (131-722) |
| `07-clinics.js` | B (1-1506), C (1507-1573) |
| `12-reports.js` | C (1-287, 1068-1434), A (288-1067), dashboard (1435-1501 = "Import from email" → tasks, opened from Today's Tasks card; the vestigial welcome/streak/focus renderers inside 1068-1434 stay untouched) |
| `11-erp.js` | C (1-1122), B (1123-2221) |
| `04-sync.js`, `13-exports.js:2105` bars | shell only, class swaps only |
Single-owner files: 06, 16 (A); 13 (C, bars aside); 15 (C); 01, 02, 03, 14 (shell).
Running harnesses in parallel: ports are fixed per file (Appendix A; **audit-fixes and rollover both use 8211**, so they never run at the same time unshifted). Each lane runs with its own offset through `scratchpad/run-shifted.sh <checkout> <offset> <outdir>` (e.g. A +1000, B +2000, C +3000), each in its own checkout. Every lane runs the whole suite (`npm test`, all harnesses on source and on `dist` — `npm run e2e:dist`) before it merges; the runner has no retry (§14 R31).

---

## 14. Risks — where a markup change silently breaks a harness, a save or a translation

| # | Risk | Evidence / mitigation |
|---|---|---|
| R1 | Rewording or re-punctuating a string breaks its Arabic and the harnesses asserting it (hundreds of regexes, `evidence/text-safe.txt`) | Keep every English string; only add new ones, with AR |
| R2 | Splitting/joining text nodes defeats exact-match translation | Wrap numbers/names only where a PATTERN or `data-notr` already handles it; check `UMI18N.tr()` |
| R3 | Emoji → icon leaves English in Arabic (154 keys) and changes asserted toast/bar texts | Keep emoji inside message strings; peel-index fallback in i18n; add bare keys |
| R4 | `innerText` follows CSS: `text-transform` changes case, `display:none` removes text — 18 harnesses read the **1280 px desktop layout**, 12 the **390 px phone layout** | Never hide information at those widths; don't add uppercase to sentences; case-sensitive checks exist ("Achieved: ERP to Sep 21 · target: DSR", "October target"…) |
| R5 | Absence checks: a rep's `#targetCard`/KPI sheet must not contain "Team"; rep views must not contain other reps' names/figures; Clinics card never "Total sales"; More never "Ask anything about your data" | New labels, breadcrumbs or section names inside these containers can trip them |
| R6 | A `position:fixed` or hidden Save button: `offsetParent` is null → four photo harnesses cannot tap it | Use `position:sticky` inside `#view-log`, keep one `onclick="saveVisit()"` button |
| R7 | Inline `onclick` text is parsed: `saveVisit()`, `saveEditVisit(`, `showLightbox('<id>'`, `.ph-del[onclick*="'<id>'"]`, `[onclick*="openEditVisit('<id>')"]`; catalog-duplicates buttons must not mention merge/delete/remove/persist | Keep inline handlers as they are; no `addEventListener` rewrites |
| R8 | Structural selectors: `#clinicDash > .kpi4 .k`, `#modalInner h3 + p` (photo-honesty reads the Edit visit sheet's clinic name: `<h3>Edit visit</h3>` immediately followed by `<p>clinic</p>`, 08:464-465 — the same "title + muted subtitle" pattern — `<h3 style="margin-top:0;">` (79 sheets) then a muted `<p … margin-top:-6px>` (34 of them)), `#msDueCard > .ms-ct`, `#msSales .ms-stats > div > *`; CSS lock `#view-log.log-saving > *` | Don't wrap these in new containers; a sheet-header component must keep `h3` then `p` as siblings |
| R9 | 77 static ids are dereferenced with no null check (list in `evidence/static-ids.txt`): removing/renaming any throws during render (e.g. `headerDot`, `navDotToday`, `dateLabel`, `greeting`, `clinicDash`, `repVisits`, `calModeMonth`, `ddTabDb`, `playbookGrid`, `proreport`, `bottomNav`, `modalContent`, `lbCap`) | Keep every id; move, don't remove |
| R10 | JS sets inline `display`: `#app` block/none, `#gate` flex/none, `#bottomNav` flex/none, `#clinicDash`/`#clinicListPane`, `#repCustomRow`, `#teamChat`/`#teamMem`, `#logAsWrap`, `#newClinicFields`, `#orderItemsWrap`, `#noOrderWrap`, `#jointWrap`, `#missedTitle`, `#teamCompareTitle/Card`, `#erpNudge`, `#visitsNudge`, `#msWhose` | A grid/flex shell must not depend on those elements' display value — put layout on wrappers |
| R11 | `switchView` highlights only `nav.bottom button[data-view]`, mapping `MORE_CHILDREN` to "more"; a separate sidebar element would never be highlighted, and a sidebar listing every view needs its own mapping | Extend the selector/mapping in `switchView` (05:299-308) or keep one `<nav>` restyled per breakpoint |
| R12 | The modal is a single instance outside `#app`; harnesses read `#modalInner`/`#modalBack` | Restyle only; no stacked dialogs, no page-level detail panes replacing sheets |
| R13 | Native `confirm()` (8 sites: delete event, bulk delete clinics, 4 ERP file prompts, restore snapshot, remove stand) — harnesses match their messages or count them | Keep them native |
| R14 | Renaming tokens breaks 24 inline token names; tokens off `:root` break the exported ERP reconciliation file (`collectReportCss`), and new classes starting `.pr`, `.kpi`, `.stamp` get copied into it | Alias old names; tokens on `:root` |
| R15 | Light page vs dark-page leftovers: white text rules in CSS and `rgba(255,255,255,…)`/`#fff` inline in 05, 06, 09 would turn invisible | Change those rules and templates in the same lane commit |
| R16 | Status bars are built in 04-sync.js with inline `cssText` (the sync file the safety worker is still finishing) | Shell swaps `cssText` for classes in one small commit after the safety branch lands; or `#id{…!important}` overrides |
| R17 | Merging the held main screen can resurrect the Assistant (`#aiFab`, More tile) and drop v123 save-truth (`persistTold`/`saveToast`) | §12.6 |
| R18 | main-screen.e2e.js layout checks (rail ≤ 110 px, 2/3 columns, bottom bar geometry) contradict a labelled sidebar | Update those checks consciously in the dashboard commit; keep every figure/truth check |
| R19 | `switchView('log')` → `prepLogView()` clears a half-typed visit (spec 6.2 "prevent accidental loss") | Any draft keeping must not use `confirm()` (harnesses dismiss dialogs and would be blocked) and must keep `prepLogView(qClinicId)` starting a fresh form when called explicitly |
| R20 | Build rules: two-line header per js/app file, contiguous ordered script tags, no duplicate top-level names across js/app (a component helper named like an existing function fails the build), no `</script` in app code, SW SHELL must not list js/app; `APP_REV` = `CACHE` | New code goes into existing files or a new numbered file with header + tag |
| R21 | Network: some harnesses abort every non-localhost request; Google Fonts are not cached by the SW | Self-host any brand font under www/ and add it to SHELL; vendor any JS; no CDN |
| R22 | "No English left" checks (Today, Rx step, Rx editor, Doctors Rx tab, Edit-visit Rx, full backup sheet, photo notes, ERP-links toasts) include `aria-label`, `placeholder`, `title` | Every new attribute string needs an AR entry |
| R23 | `svgLine` uses the fixed gradient id `lg` | Unique ids if more than one line chart can be on a page (dashboard + reports are different views, OK; two in one sheet are not) |
| R24 | New storage keys are refused by `firestore.rules` (`tests/rules`, `npm run scan`), and `tests/save-messages.test.js` fails a save whose result is thrown away before a success toast | UI preferences in `localStorage` (try/catch); never wrap saves in new helpers that drop their result |
| R25 | Report charts titled "Sales trend / Sales by rep / Sales by brand", the Calendar insights tile "Sales" and the "Sales:" line of the copied report text (`copyReport`, 13:2152, Report tools → Copy) are **app-logged order values**, not ERP sales — contrary to the owner's rule that only the ERP files measure sales; audit-fixes asserts "Sales by rep" | Pre-existing labelling issue: report it to the owner, do not relabel silently in the redesign |
| R26 | Unreachable features: `openWeekMonthPlan` (weekly/monthly visit plan), `openDoctorsDirectory`, `openAssistant` (stub), `renderProDoc` (dead); `#navDotTeam` never set | Preserve; surfacing the visit plan from Calendar is a safe improvement if the owner wants it |
| R27 | `showProReport` hides only `#app` and `#bottomNav`; a new top bar/sidebar outside them would show over the report and print | Hide them there too (13:1100-1121) and in `@media print` |
| R28 | Performance: main-screen requires a render < 150 ms with 3 people × 12 months of lines; heavy DOM/CSS effects inside Today slow it | Keep the dashboard DOM lean; avoid backdrop-filter on large scrolling areas |
| R29 | `#headerStamp`'s first child node must be the initials text node | Keep `#headerDot` inside after the text, or update 05:367 |
| R30 | `.view .empty`, `.section-title` and labels change colour by context (`.view > …` vs inside `.card`/`.chartcard`/`.kpi`) — the cascade relies on the dark page | Redefine per surface in the token pass, not per screen |
| R31 | `run-all.js` picks up every `*.e2e.js`, including the `_sh-*.e2e.js` copies `run-shifted.sh` writes while it runs; and since `c3406ec` there is **no retry** — one flaky harness fails the run (and the deploy) | Never run `run-all.js` in a checkout where a shifted run is in progress; a redesign change that makes a harness timing-sensitive (animations, transitions on elements the harness waits for) is a real failure. Keep motion off for `prefers-reduced-motion` and short elsewhere |

---

## Appendix A — harness index

| Harness | Port | Viewport | Main modules |
|---|---|---|---|
| audit-fixes | 8211 | 1280 | Today target card, missed plans, calendar plans, visit edits, admin rename, reports charts, mail tab |
| catalog-gaps | 8203 | 1280 | Products catalog gaps & duplicates, ERP import button |
| clinic-recovery | 8217 | 390 | nameless clinics/doctors, backups sheet & restore, Admin missing clinics |
| clinics-vs-today | 8214 | 390 | Clinics ERP card vs Today card |
| erp-links-late | 8209 | 390 | ERP links late saves |
| erp-links | 8204 | 390 | ERP links, clinic card, products list, category guide, recon |
| erp-split | 8188 | 1280 | ERP rows chunks (`#erpStatus`) |
| full-backup | 8231 | 390 (+1280 contexts) | Export → full backup |
| hardening | 8177 | 1280 | ERP import/nudges, target card, team %, duplicate doctors |
| kpi | 8202 | 1280 | KPI, requests log, month by month, add to plan |
| no-real-data | 8240 | 1280 | gate, empty account |
| order-form | 8222 | 390 touch | visit orders, Order only, Edit visit total |
| photo-honesty | 8273 | 390 | visit photos, gallery, lightbox, backups |
| photo-lifecycle | 8274 | 390 | photos over days/tabs, backups |
| rollover | 8211 | 1280 | month change: target card, nudge, week line, month report |
| safety-review | 8288 | 1280 | v123 review cases |
| save-truth | 8286 | 1280 | honest save messages everywhere |
| seller-parity | 8193 | 1280 | supervisor who sells: Today, log chips, reports, analysis |
| shared-accounts | 8198 | 1280 | shared accounts, territory distribution, cross invoices |
| smoke-all | 8199 | 1280 | every view and sheet, both roles |
| supervisor-sells | 8191 | 1280 | staff "Also sells", log chips, territory |
| sync-core | 8287 | 1280 | refused saves, wipe banner, device copy |
| sync-review | 8251 | 1280 | merges, `#memOnlyBar` |
| sync-safety | 8250 | 1280 | merges, `#erpDirtyPill`, `#memOnlyBar` |
| team-chat | 8272 | 390 | chat & memories |
| visit-photo-offline | 8270 | 390 | photos with no signal |
| visit-photo-sync | 8271 | 390 | photo marks, save lock |
| visit-rx | 8206 | 390 touch | prescriptions: visit, edit, doctors tab, types editor |
| visits-storage | 8233 | 1280 | visits archives, `#visitsNudge` |
| weekly-deck | 8201 | 1280 | deck sheet & file |
| main-screen (home-wt) | 8277 | 360…1440 | held Today |
| main-screen-cases (home-wt) | 8278 | 360…1440 | held Today edge cases |

Ports are hard-coded as `const PORT = NNNN`, `server.listen(NNNN, …)` or `localhost:NNNN`; `scratchpad/run-shifted.sh` rewrites all three forms when it shifts a run.

## Appendix B — JS names the harnesses call or read (must keep their names and behaviour)
From `evidence/js-contracts.txt` (count = number of harness files):
- **03**: `selectUser`[32], `switchUser`[3], `gateTap`[1]. **14**: `closeModal`[27], `setUiLang`[3], `showModal`[1]. **02**: `todayStr`[12], `uid`[5], `daysBetween`, `showToast`.
- **04**: `persist`[15], `outboxList`[9], `loadAll`[7], `outboxHas`[7], `flushOutbox`[5], `tombSet`[5], `persistFor`[3], `tomb`, `untomb`, `persistTold`, `persistOutcome`, `mergeById`, `mergeBaseFor`, `normalizeClinic`, `erpMirrorSave`, `maybeSnapshot`, `retryBlockedSaves`, `retryErpRows`, `retryVisitsArchives`, `visitsIndexOwed`, `outboxWrite`.
- **05**: `switchView`[22], `renderToday`[6], `openPlanDay`, `openDatePlanner`, `togglePlanClinic`, `planEntryId`, `canViewClinic`, `addTask`, `deleteTask`, `toggleTask`, `calGoToday`, `isFieldVisit`, `openAddEvent`, `openEventForm`, `saveEventForm`, `openWeekMonthPlan`, `setPlanViewMode`, `shiftPlanView`, `setCalMode`, `shiftCal`, `renderMissedPlans`, `renderMore`, `renderTargetCard`, `setClinicRepFilter`, `setReportRepFilter`, `visibleDueClinics`, `visibleTasks`, `visibleVisits`, `getWeekDates`, `localDateStr`, `planEntryNote`; home: `msWhenReady`, `msOpenPerson`, `msHow`, `msFold`, `msKpi`, `msActSheet`.
- **06**: `prepLogView`[13], `saveVisit`[12], `pickClinic`[11], `pickDoctorSeen`[7], `toggleProductChip`[3], `startNewClinic`[3], `openQuickAddDoctor`, `quickAddDoctorSave`, `setOrder`, `setLogAsRep`, `orderGross`, `orderNet`, `bumpQty`, `setQty`, `setDraftDiscount`, `setJointRep`, `cancelNewClinic`, `scheduleFollowUp`, `visitDoctorNames`, `rxTypes`.
- **07**: `openClinicDetail`[6], `restoreFromBin`[4], `openAddClinic`[3], `openDupDoctors`[3], `productKey`[3], `renderClinics`[3], `assignProductKeys`, `openEditClinic`, `openEditProduct`, `saveEditProduct`, `mergeDupDoctors`, `setClinicMode`, `erpDashData`, `renderClinicDash`, `findProduct`, `keepDupDoctors`, `markDoctorGone`, `nameLostDoctor`, `nameNamelessClinic`, `openLostDoctors`, `openNamelessClinics`, `saveEditClinic`, `saveNoSaleReason`, `submitAddClinic`, `binCount`.
- **08**: `openEditVisit`[9], `deleteVisit`[7], `saveEditVisit`[6], `addEditPhoto`[4], `openStaffForm`[4], `saveStaff`[4], `openStandaloneOrder`[4], `openCallLog`, `removeEditPhoto`, `confirmDeleteVisit`, `saveStandaloneOrder`, `showEditHistory`, `startSoNewClinic`, `toggleSoProduct`.
- **09**: `openAdminPanel`[8], `setAdminTab`[6], `openVisitLog`[5], `addToPlan`[3], `openManageClinics`[3], `reassignClinic`[3], `removeDoctor`[3], `saveTargets`, `bulkDeleteClinics`, `copyVisitLog`, `deleteClinic`, `mgToggle`, `missingClinicCandidates`, `openMissingClinics`, `openPhotoGallery`, `previewDigest`, `renderAdminTerritory`, `renderVisitLog`, `toggleSharedClinic`.
- **10**: `openCategoryGuides`, `openCoverageBoard`, `openDoctorProfile`, `openPlaybook`, `caMonthClinicSales`, `addCatalogGaps`, `addHandover`, `copyProductDupReport`, `ddPool`, `openCatalogGaps`, `openContactImport`, `openDataEntry`, `openDoctorRecords`, `openDoctorsDirectory`, `openProductDetail`, `openProductDups`, `openRxTypes`, `renderClinicAnalysis`, `renderDoctorsDb`, `renderProducts`, `setCovRep`, `slugify`.
- **11**: `openErpImport`[10], `digestData`[9], `erpPeriods`[8], `bestMonthRevenue`[5], `erpImportXlsx`[5], `erpMtdMap`[5], `teamTargetNow`[5], `erpAutoImport`[4], `renderMonthClose`[4], `openErpLinkEdit`[3], `openErpLinks`[3], `applyTargetsFile`, `openErpRecon`, `openProductMovement`, `targetPctMap`, `dsrDateFromName`, `elChoose`, `erpBrandMtd`, `erpLinkLog`, `erpLinksPaused`, `openErpLinkPreview(For)`, `openMonthReports`, `saveErpLink`, `setReturnPolicy`, `unpackErpRows`.
- **12**: `renderReports`[4], `renderVisitPhotos`[4], `reportVisitsBase`[3], `closeLightbox`[3], `saveMemory`[3], `sendChat`[3], `loadTeam`, `persistTeam`, `photoWaitHTML`, `showLightbox`, `openAchievements`, `openAssistant`, `openCompare`, `openReportTools`, `photoDb`, `pickChatPhoto`, `pickMemoryPhoto`, `refreshTeam`, `renderChat`, `renderMemories`, `reportRangeBounds`, `setTeamTab`, `teamMerge`; **`pickImage` and `showToast` are replaced by harnesses at run time — keep calling them by their global names**.
- **13**: `buildMasterReportBody`[5], `openExport`[4], `restoreSnapshot`[4], `openFullBackup`[3], `applyDeviceCopy`, `buildScorecardCSV`, `buildVisitsCSV`, `devCopyToggle`, `restoreDeviceClinics`, `buildClinicsCSV`, `buildDoctorsCSV`, `buildTasksCSV`, `computePrevPeriodScore`, `downloadFullBackup`, `exportRange`, `readCloudForBackup`, `restoreMissingClinics`.
- **15**: `openWeeklyDeck`, `downloadWeeklyDeck`, `buildWeeklyDeck`, `wdSetLang`. **16**: `openKpiScorecard`, `openKpiSettings`, `saveKpiSettings`, `openClientLogForm`, `saveClientLog`, `resolveClientLog`, `checkStand`, `openMonthByMonth`, `kpiCards`, `kpiSettings`, `toggleGovClinic`.
- Globals set/read by harnesses: `staff`, `REPS`, `clinics`, `visits`, `tasks`, `events`, `dayPlans`, `targets`, `erpSales`, `erpMap`, `erpNotes`, `products`, `recycleBin`, `categoryGuides`, `currentUser`, `uiLang`, `activeView`, `selectedClinicId`, `selectedDoctorIds`, `draftOrders`, `noOrderReason`, `logAsRep`, `rxDrafts`, `rxTypesDoc`, `visitPhotos`, `chatMsgs`, `memories`, `pendingChatPhoto`, `chatSending`, `reportRange`, `reportCustom`, `reportRepFilter`, `clinicRepFilter`, `erpDashTab`, `soItems`, `ddTab`, `caRep`, `openBrands`, `planViewAnchor`, `_kpiRep`, `_kpiPeriod`, `_mbmRep`, `_msModel`, `_visitSaveBusy`, `_flushing`, `_memOnly`, `_loadFailed`, `_mirrorUsed`, `_erpDirty`, `_erpBroken`, `_visitsBroken`, `_photoKept`, `_fullBackup`, `_el`, `_elBusy`, `_erpLinkSaving`, `SPECIALTIES`, `SPECIALTY_PLAYBOOK`, `SAVE_MSGS`, `AUTO_FOLLOWUP_NOTE` (full list with counts in the evidence file).

## Appendix C — evidence and how to re-check it on the redesign branch
All under `/tmp/claude-0/-home-user-ultramed-app/3a55f116-358d-52a7-8820-6a19a1a37318/scratchpad/redesign-docs/`:
- `evidence/sel-safe.txt`, `sel-home.txt` — per harness: ids read, CSS selectors used.
- `evidence/text-safe.txt`, `text-home.txt` — per harness: `.includes()` texts and regexes asserted.
- `evidence/clicks.txt` — elements found by their text or data attribute before a click/read.
- `evidence/js-contracts.txt` — app functions and globals each harness calls/reads, grouped by file.
- `evidence/static-ids.txt` — every static id in index.html and the 77 the JS dereferences without a null check.
- `evidence/modals-safe.txt` — every `showModal` site, its title and field count.
- `evidence/forms-safe.txt` — form fields and validation toasts per function.
- `evidence/stylecount-safe.txt`, `stylecount-home.txt` — inline styles, colours, emoji per file; worst functions.
- `evidence/modsize-functions.txt` — every UI function assigned to a module (the lane split).
- `tools/*.js|py` — the extractors. Re-run on the redesign branch and diff, e.g. `node tools/contracts.js <checkout>/www <checkout>/tests/e2e/*.e2e.js` (every id and selector a harness reads must still be produced by index.html or the templates), `node tools/stylecount.js <checkout>/www` (inline styles and hex colours should fall), `python3 -I tools/pngcolors.py <png>`.
