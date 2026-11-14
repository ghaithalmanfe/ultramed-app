# Owner's decisions for the redesign (13 Nov 2026)

1. Talk to the owner in plain Arabic only (his words: "احكي معاي عربي", "فهمني").
2. RENAME (owner: "اي yes", 13 Nov): every chart title, tile, label or report line that is called "Sales" but
   shows ORDERS LOGGED IN THE APP (visit orderTotal / order-only entries — not the ERP sales files) is renamed to
   say what it is: English "Orders logged in the app" (natural variants: "Orders logged in the app · trend",
   "… · by rep", "… · by brand"), Arabic "الطلبات المسجّلة بالتطبيق". The FIGURES DO NOT CHANGE — only the words.
   Known places (ui-inventory.md R25): the report charts "Sales trend / Sales by rep / Sales by brand", the
   Calendar insights "Sales" tile, copyReport's "Sales:" line (13-exports.js ~2152). Check every other "Sales"
   label for its data source: ERP-based figures (monthAchievement, erp* functions) keep "Sales"; app-logged
   order sums get the new name. Harness strings that assert the old wording (audit-fixes "Sales by rep") are
   updated to the new wording on purpose — the check still verifies the same figure and element.
3. Decided without asking (spec §0.9): DM Sans + IBM Plex Sans Arabic (the site's Frutiger LT Arabic is
   desktop-licensed only); the official logo kit files; the PWA icon in the official app-icon look (lime mark
   on #022917); white labels on primary buttons, lime-on-green for one hero action per screen; the brand name
   stays "UltraMed" in Latin letters as in the logo.
