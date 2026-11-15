# Database backups

> **بالعربية باختصار:** للبيانات نسختان احتياطيتان خارج التطبيق:
>
> 1. **النسخة الليلية المشفّرة** (هذه الصفحة): تُؤخذ تلقائياً من GitHub كل ليلة الساعة
>    02:15 بتوقيت الكويت وتُحفظ 14 يوماً، ونسخة أسبوعية فجر كل جمعة تُحفظ 60 يوماً، ونسخة
>    شهرية أول كل شهر تُحفظ 90 يوماً. فيها كل مستندات قاعدة البيانات `state` كما هي تماماً.
>    المستودع عام، فيستطيع أي شخص له حساب في GitHub تنزيل الملف المشفّر؛ الذي يحميه هو
>    عبارة المرور وحدها، ولذلك لا يقبل النسخ إلا عبارة تصنعها صفحة عبارة المرور. إن ضاعت
>    العبارة فلن يستطيع أحد فتح النسخ. **خطوات المالك مكتوبة بالعربية في آخر هذه الصفحة.**
> 2. **النسخة الكاملة على الجهاز** (للمشرف: المزيد ← «التصدير والمشاركة» ← «نسخة احتياطية
>    كاملة على هذا الجهاز»): ملف غير مشفّر يُحفظ على الجهاز نفسه.
>
> الاسترجاع لا يتم أبداً تلقائياً: يكون أولاً في مشروع منفصل للتجربة، والكتابة فوق البيانات
> الحقيقية لا تتم إلا بقرار المالك وبمساعدة مطوّر.

## Two kinds of backup

| | Nightly encrypted backup (this page) | Full backup taken on the phone |
|---|---|---|
| Made by | GitHub Actions (`.github/workflows/backup.yml`), every night, week and month | the supervisor: More → "Export & share" → "Full backup to this device" → "Full backup — count and download everything" |
| Holds | every document of the Firestore collection `state` | every document of `state`, and this phone's changes the cloud does not have yet, kept apart |
| Kept | in GitHub, encrypted (AES-256-GCM), 14 / 60 / 90 days | wherever the supervisor saves it, **not encrypted** |
| File | `ultramed-state-daily-20261111-231502Z.umbackup` | `ultramed-full-backup-2026-11-11-1000.json` |
| Check | `node scripts/backup/nightly/verify.js <file>` | `node scripts/backup/verify.js <file>` |
| Restore | `node scripts/backup/nightly/restore.js`: into a separate Firebase project (production only with two flags) | `node scripts/backup/restore.js <file> --into <name>.test-cloud.json`: into a local test cloud only |

Each tool, given the other kind of file, says what it is and names the command for it.
The daily backups inside the app (`snap_YYYY-MM-DD`: clinics, products, tasks and this
month's visits, kept about two weeks) live in the same database as the data; both kinds
above include them.

## What the nightly backup holds

Every document of the collection `state` in project `ultramed-field-ops` — everything
the app keeps (one document per key, as `www/js/app/01-config.js` stores it: `{value,
updated}` and, since v123, `rev`, the revision of the app that saved it): clinics and
doctors, visits (this month's `visits`, every past month's `visitsArch:YYYY-MM`, and
`visitsIndex`), tasks, day plans, requests and stands (`events`), targets, the team list
(`staff`), the product catalog, prescription types, selling guides, discount limits and
KPI settings, the ERP sales index (`erpSales`) and every `erpRows:` chunk, ERP account
links and their log, sales notes, the recycle bin and the delete log, photos
(`photo:<id>`), team chat and memories, the e-mail and repair logs, the change log
(`auditLog:YYYY-MM`, once the release that adds it is out), the app's own daily `snap_`
backups, and any older document still there.

Each document is kept whole, exactly as stored — its `value` string never parsed or
rewritten, its `rev` kept where it has one and none added where it has not — with its
create and update times. Nothing is chosen by name, and no field is chosen: the whole
collection is listed, so a kind of document added later is backed up too. All pages are
read at one instant (a Firestore read time), so a save made during the backup cannot
leave it half old, half new; if Firestore refused a fixed read time, the run says so and
reads page by page. The listing is cross-checked against Firestore's own document count.

Not backed up: Firebase Authentication accounts (logins and passwords), project
settings, and the phones' own copies and unsent changes (the phone's full backup keeps
its own apart). The security rules are not in the database: they are `firestore.rules`
in this repository, published by hand. The rules allow no other collection.

## Where it lives, and when

`.github/workflows/backup.yml` runs `scripts/backup/nightly/run.js` and keeps one
encrypted file per run as an **artifact** of that run (GitHub → Actions → "Database
backup"). Cron times are UTC; Kuwait is UTC+3 all year.

| Kind | Cron (UTC) | Kuwait time | Kept |
|---|---|---|---|
| daily | `15 23 * * *` | 02:15 every day | 14 days |
| weekly | `45 23 * * 4` | 02:45 every Friday | 60 days |
| monthly | `15 0 1 * *` | 03:15 on the 1st | 90 days (GitHub's maximum) |

Each is a fresh backup of its own. "Run workflow" on the same page makes one now
(choose the kind). Each kind waits only behind runs of its own kind, so a late daily
never makes GitHub cancel a weekly or monthly backup waiting behind it. The clear data
never touches the runner's disk, and the run log shows only counts, sizes and checksums
per key prefix — never a value, an e-mail address, the passphrase or a token (the
repository and its logs are public).

GitHub starts a scheduled workflow **only from the default branch** (`main`). Until the
release that carries `backup.yml` is merged there, nothing runs at night and "Database
backup" is not in the Actions tab; after it, GitHub may still be late with the first
scheduled runs. So the first backup is made by hand ("One-time setup", below), not
waited for.

A run that fails (a sign-in or a page that is refused, a page that cannot be read after
retries, a count that disagrees, an empty listing, a passphrase the passphrase page did
not make, a file that does not decrypt back) keeps nothing and turns red, and its first
error line says why and what to do. GitHub notifies a failed scheduled run to the
person who added the schedule, or last changed or re-enabled it (see your Actions
notification settings) — do not count on that mail alone: look at the Actions tab once a
week. Until the secrets are added, every run says "not configured", keeps nothing and
stays green.

## Who can download a backup, and what protects it

**The repository is public, so the encrypted backups are public to GitHub users.** Each
backup is an artifact of a workflow run, and anyone signed in to GitHub can download the
artifacts of a public repository for as long as GitHub keeps them, and see their names,
sizes and times. Nobody can stop a stranger keeping a copy and trying passphrases
against it on their own computers, for as long as they like.

What protects the data is the encryption alone: the file is gzip-compressed, then
encrypted with AES-256-GCM under a key that scrypt derives from the passphrase (N = 2^17,
r = 8, p = 1: about half a second and 128 MB of memory for every guess; a random salt
and IV in the file's header). scrypt slows guessing; it cannot protect a passphrase a
person could think of. That is why the backup takes only a passphrase made by the
passphrase page — 200 random bits, which no amount of computing guesses — and a run
given anything else makes no backup (next section).

What a stranger learns without the passphrase: that backups exist, when each was made
and how large it is, and, from the run's public log and summary, how many documents of
each kind the database holds and their size (for example how many photos). Never a
value.

The alternative is a **private repository**: its artifacts and logs are seen only by
the people given access to it. That is the owner's decision, and nothing here changes
it: on GitHub's free plan a private repository cannot publish the app with GitHub Pages
and its Actions minutes are limited. The passphrase stays necessary either way.

## The passphrase

**One way to make it: the passphrase page**, published with the app —
`https://ghaithalmanfe.github.io/ultramed-app/backup-passphrase.html` (it is there once
the release that carries this backup is published). Open it on a phone or a computer;
nothing is installed. Press the button: the passphrase is made on that device by the
browser's secure random numbers, is sent nowhere, is stored nowhere, and is gone when
the page is closed. It looks like

```
k3x9-7hq2-m4tz-0b8w-y6de-r1ns-5vca-9pfj-2gk7-x0mt-4h8q
```

eleven groups of four digits and lower-case letters (never i, l, o or u, which read as
other characters). The last group checks the rest.

**The backup takes no other passphrase.** A run given a word, a sentence, another
generator's password — however long — or a page-made passphrase pasted short or with a
character changed, turns red, makes no backup, and says which it is and what to do. It
never prints the value or its length.

**Where to keep it — two places, both outside GitHub** (GitHub never shows a secret
again):

1. in a password manager — the copy to paste from;
2. on paper, in a safe place. The box at the bottom of the page checks a passphrase
   typed back from the paper; capitals or small letters, with or without the hyphens,
   all read the same, here and in the tools below.

**If it is lost, no backup can be opened — by anyone.** There is no recovery, no reset
and no second key: not GitHub, not a developer. If both copies are lost, make a new
passphrase at once and replace the secret, so that the next backups can be opened; the
ones made before cannot.

**Changing it**: make a new one on the page and replace the secret. Files made before
the change need the old passphrase until they expire (90 days at most): keep the old
one, with the date it was replaced, until then.

**Who knows it**: the owner. Whoever restores a backup needs it for that restore: it is
typed at the tool's prompt, never sent in a chat or an e-mail, and changed afterwards if
that person should no longer hold it.

## One-time setup (owner)

After the release is published (the workflow and the passphrase page come with it):

1. Make the passphrase on the passphrase page and keep it in the two places (above).
2. GitHub → the repository → **Settings → Secrets and variables → Actions → New
   repository secret**:
   - `BACKUP_PASSPHRASE` (required): the passphrase, pasted from the password manager.
   - The login: nothing to add if the daily e-mails are set up — the backup then signs
     in with `REPORT_LOGIN_EMAIL` / `REPORT_LOGIN_PASSWORD`. To give the backup a login
     of its own (better: its password can be changed without touching the e-mails), add
     `BACKUP_LOGIN_EMAIL` and `BACKUP_LOGIN_PASSWORD`, an e-mail/password login made in
     the Firebase console → Authentication → Users → Add user; when both are set, the
     backup uses them. Either login must be on the company's domain: the security rules
     in `firestore.rules`, once published, refuse any other, and the run turns red with
     "page 1: HTTP 403 PERMISSION_DENIED … the security rules refused the read".
3. Make that login read-only: when the security rules are published, its address goes
   in `JOB_EMAILS()` (in the Firebase console only, never in the repository — the rules
   file says how, beside the supervisor's). A login listed there reads every document
   and can write nothing but the e-mail job's log (`mailLog`). Until it is listed the
   backup works all the same, but the login is an ordinary team login: it could write
   the team's documents if its password leaked.
4. **Make the first backup by hand**: Actions → "Database backup" → **Run workflow**
   (kind: daily) → Run workflow. Do not wait for the night (see "Where it lives, and
   when").
5. **Check the result** on that run's page, a minute or two later:
   - a green tick, the summary "Database backup: done (daily)" with the number of
     documents and their size, and under **Artifacts** one file named like
     `ultramed-backup-daily-20261111-231502Z` — the backup is made;
   - a green tick with the warning "Backup not configured" and no artifact — a secret
     is missing (the warning names it); nothing was backed up;
   - a red cross — it failed and kept nothing; the first error line says why and what
     to do (for example a passphrase the page did not make, or a login the rules
     refuse).

   A green tick alone is not the proof: the artifact is.
6. Once, have a developer download that first backup and open it with the passphrase
   you keep ("Download and verify a backup"): it proves that the passphrase in GitHub is
   the one in your password manager and on your paper.

## Download and verify a backup

1. Actions → "Database backup" → a green run → **Artifacts** → download the one you want
   (a .zip holding one `.umbackup` file: unzip it), or with the GitHub CLI, which unzips
   it: `gh run download <run-id> --dir ~/ultramed-backups`.
2. With Node.js 22 and a copy of this repository (nothing to install):

   ```sh
   node scripts/backup/nightly/verify.js ~/ultramed-backups/ultramed-state-daily-20261111-231502Z.umbackup
   ```

   It asks for the passphrase without showing it (or reads `BACKUP_PASSPHRASE`), checks
   the encryption tag, the data's sha256 and the manifest, prints the number of documents
   and their size per key prefix, and ends with "The backup is sound." A wrong passphrase
   and a changed or damaged file are told apart and refused (exit code 1); a passphrase
   typed with a mistake is named as that ("a character is missing or wrong").
3. To get the clear-text bundle (for a restore, or to look inside), add
   `--out ~/ultramed-restore/bundle.json`. That file is the whole database in clear text:
   it is created readable by you only, refused inside this repository's folder (the
   repository is public — the build and the tests also refuse one put in it), and should
   be deleted when you are done.

## Restore into a separate project

Never restore into production to "have a look". Use a separate Firebase project:

1. Firebase console → **Add project** (e.g. `ultramed-restore-check`) → Firestore
   Database → Create database → Authentication → enable Email/Password → add a user.
2. Its Firestore rules must let that user read and write `state`, e.g.

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /state/{doc} { allow read, write: if request.auth.uid == '<that user's UID>'; }
     }
   }
   ```
3. Project settings → General → copy its **Web API key**.
4. Restore (the input is the bundle from step 3 above, or the `.umbackup` file itself,
   decrypted in memory after asking for the passphrase):

   ```sh
   export RESTORE_PROJECT_ID=ultramed-restore-check
   export RESTORE_API_KEY=<that project's Web API key>
   export RESTORE_LOGIN_EMAIL=<the user you added>
   read -rs RESTORE_LOGIN_PASSWORD && export RESTORE_LOGIN_PASSWORD
   node scripts/backup/nightly/restore.js ~/ultramed-restore/bundle.json --dry-run
   node scripts/backup/nightly/restore.js ~/ultramed-restore/bundle.json
   ```

   It writes every document whole, in atomic batches, then reads the project back and
   compares each document with the backup ("all N restored documents are identical").
   `--only=clinics,visitsArch:` limits a restore to named documents (a name ending in `:`
   or `_` is a prefix). A write the project's rules refuse stops the restore, writes none
   of that batch, and says it was the rules.

Refusals: the production project `ultramed-field-ops` (or its API key) unless
`--i-understand-this-overwrites-production` is given; a target whose `state` already has
documents unless `--force` (which replaces the documents with the same names and leaves
the others); a full backup taken on the phone (that one goes into a test cloud only, with
`scripts/backup/restore.js`).

## Restore into production (last resort)

Only with the owner's approval, and with a developer: it replaces every change made since
the backup. Have everyone close the app before the restore and open it again after; a
phone that held changes it had not sent yet sends them when it opens, and they merge
into the restored data.

It needs both `--i-understand-this-overwrites-production` and, because production is not
empty, `--force`. `RESTORE_API_KEY` is then the app's own web API key, and the login is
the **supervisor's**: under the published rules only the supervisor writes the team list,
the targets, the settings and the sales files, and the e-mail and backup jobs' logins
only read (a restore with one of them is refused).

What the published security rules (`firestore.rules`, v123) accept from a restore — a
batch they refuse writes none of its documents (the message counts any batch written
before it), and the tool says it was the rules:

- **Not the whole backup.** They never let anyone write a daily backup older than
  yesterday (`snap_`) or a key they do not list (an old app version's document). Restore
  the documents the app keeps, with the list below.
- **Documents exactly as they were.** A restored document is the stored one, field for
  field: it carries the app revision `rev` if it had one, and none is added. Rules
  published before v123 accept only `value` and `updated`, so they refuse a document
  that carries `rev`: publish the v123 rules first.
- **The oldest revision allowed.** `MIN_APP_REV()` is 0 in the repository (every version
  may write). If it was raised in the console, the rules refuse every document an older
  version saved — one with a lower `rev`, or with none — except `mailLog`. Set it back
  to 0 for the minutes of the restore, then raise it again.

```sh
node scripts/backup/nightly/restore.js <bundle.json> --i-understand-this-overwrites-production --force \
  --only=clinics,visits,visitsIndex,visitsArch:,tasks,dayPlans,events,tombs,recycleBin,erpNotes,products,repairLog,chat,memories,mailLog,auditLog:,photo:,staff,targets,benchmarks,categoryGuides,erpSales,erpRows:,erpMap,erpMapLog,rxTypes
```

Every document in that list comes back exactly as the backup holds it. The app's own
daily backups (`snap_`) and any document not in the list stay as they are — the daily
backup taken on the day of the damage included.

The other way, to restore everything: for the minutes of the restore publish rules that
let the restore login write `state` (as for a separate project, above), restore, then
publish `firestore.rules` again with the addresses in place of its two placeholders, as
when it was first published.

## Recovery objectives

- **RPO 24 hours**: one backup a day; GitHub can start a scheduled run late (minutes,
  rarely an hour), and a failed run extends the gap until the next good one.
- **RTO about 30–60 minutes** for someone with the passphrase and this page: downloading
  and verifying take a minute or two, preparing a restore project 15–30 minutes the first
  time, and the restore itself well under a minute for a database of this size (hundreds
  of documents, tens of MB).

## Limits

- **Size: about 500 MB of data.** A run builds the whole file in memory before it writes
  it, and one JavaScript string holds about 512 MB, so the backup stops working when the
  database reaches about 500 MB (measured on a 16 GB machine, the size of GitHub's: 480 MB
  of photos back up in about half a minute, 560 MB do not). What grows is the photos
  (`photo:<id>`, one document each). Long before that — from 300 MB of data on
  (`BACKUP_WARN_MB`) — every run still makes its backup and carries the yellow warning
  "Database backup nearing its size limit", on the run's page and in its summary. Past the
  limit a run turns red with "the database is too large for this backup to build in
  memory" and keeps nothing; the backups already made stay until they expire. When the
  warning first appears, have a developer change the tools to work piece by piece
  (`run.js` to write the file, `verify.js` and `restore.js` to read it). The size of the
  data is on every run's summary ("Documents … of data").
- **Retention**: artifacts last at most 90 days (and less if the repository's Settings →
  Actions → General → "Artifact and log retention" is lower). For a longer history, also
  copy each encrypted file to a private Google Cloud Storage bucket in a separate Google
  account (object versioning and a retention policy on), or to any other off-site
  storage: the file is encrypted and safe to copy anywhere.
- **Public repository**: see "Who can download a backup, and what protects it".
- **Inactivity**: GitHub disables scheduled workflows of a public repository after 60
  days without repository activity (it e-mails a warning first); re-enable it on the
  workflow's page.
- **The backup's login**: listed in `JOB_EMAILS()` when the rules are published (see the
  setup), it only reads — the rules refuse every write but the e-mail log. Not listed,
  or while the published rules are older than v123, it is an ordinary team login that
  may write the team's documents (clinics, visits, tasks …). Never use the supervisor's
  login for the backup: it may write everything.
- **The in-app `snap_` backups** stay as they are; they live in the same database and are
  included in this backup.

## For developers

- `scripts/backup/nightly/bundle.js`: bundle, manifest, file format, encryption and the
  passphrase's format (pure). `scripts/backup/nightly/firestore.js`: REST sign-in, paged
  listing, count, commits, retries and a log that cannot leak (it scrubs the secrets,
  addresses and tokens, and prints of a server's error only its codes, never its words:
  a message may quote what it was sent).
  `run.js`, `verify.js`, `restore.js` in the same folder: the three commands (`--help` on
  each). The project id and API key are read from `www/js/app/01-config.js`. The phone's
  full backup has its own tools, `scripts/backup/verify.js` and
  `scripts/backup/restore.js` (`UMCore.fullBackupFile` / `verifyBackupFile` in
  `www/js/core.js`).
- The passphrase: 25 random bytes written as 40 characters of
  `0123456789abcdefghjkmnpqrstvwxyz`, then 4 check characters (the first 20 bits of
  sha256 of `UMBACKUP passphrase v1:` and the 40), in groups of four. `www/backup-passphrase.html`
  makes one in the browser (one inline script, allowed by its hash in the page's
  Content-Security-Policy, which lets nothing else run and nothing out; a change to the
  script needs the new hash, which the test prints); `bundle.js` checks it
  (`passphraseProblem`) and reads a typed one forgivingly (`canonicalPassphrase`).
  `require('./scripts/backup/nightly/bundle.js').makePassphrase()` makes the same kind.
- `tests/backup-nightly.test.js` (part of `npm test`) runs the three commands against a
  local fake of Firestore's REST API and identitytoolkit, with a guard that blocks any
  non-local request; its data holds a document of every kind the app keeps (taken from
  `UMCore.BACKUP_SETS` and `firestore.rules`), with and without `rev`; it runs the
  passphrase page's own script against `bundle.js`, and checks this guide against the
  rules and the tools' messages. `tests/e2e/backup-passphrase.e2e.js` opens the page in
  a browser. `tests/rules/backup.test.js` (the rules suite: `cd tests/rules && npm ci &&
  npm test`) runs the commands on Google's own Firestore and Auth emulators under the
  published rules. `FIRESTORE_EMULATOR_HOST` + `FIREBASE_AUTH_EMULATOR_HOST` (both, local
  addresses only) point the scripts at an emulator; its REST layer does not read an RFC
  3339 read time in a query string, so there a run says "Firestore refused a fixed read
  time" and reads page by page.
- `scripts/build.js` refuses a `.umbackup` file or a decrypted bundle in the published
  folder, `tests/confidential.test.js` one under `www/` or `tests/`, and `.gitignore`
  keeps `/backups/`, `*.umbackup` and `*.umbackup.partial` out of git.

## خطوات المالك

كل ليلة تُؤخذ نسخة كاملة من بيانات التطبيق، تُشفَّر، وتُحفظ في GitHub. المستودع عام، فأي
شخص له حساب في GitHub يستطيع تنزيل الملف المشفّر؛ الذي يحميه هو عبارة المرور وحدها. لذلك
لا يقبل النسخ إلا عبارة تصنعها صفحة عبارة المرور، ويرفض أي كلمة أو جملة يختارها إنسان.

**مرة واحدة، بعد نشر الإصدار الجديد**

1. اصنع عبارة المرور: افتح صفحة عبارة المرور من الهاتف أو الحاسوب واضغط «اصنع عبارة
   مرور». لا يلزم تثبيت أي شيء، والعبارة لا تخرج من جهازك. الرابط:
   https://ghaithalmanfe.github.io/ultramed-app/backup-passphrase.html
2. احفظها في مكانين قبل أي شيء آخر: في مدير كلمات المرور، وعلى ورقة تضعها في مكان آمن. ثم
   اكتبها من الورقة في الخانة أسفل الصفحة لتتأكد أنك نقلتها بلا خطأ.
3. انتبه: إن ضاعت العبارة فلن يستطيع أحد فتح النسخ الاحتياطية، ولا توجد أي طريقة
   لاسترجاعها.
4. أضف السرّ في صفحة الأسرار من إعدادات المستودع، وهذا رابطها المباشر:
   https://github.com/ghaithalmanfe/ultramed-app/settings/secrets/actions/new
   اكتب في الخانة الأولى الاسم `BACKUP_PASSPHRASE`، والصق في الخانة الثانية عبارة المرور من
   مدير كلمات المرور، ثم اضغط الزر الأخضر.
5. حساب الدخول: إن كانت الإيميلات اليومية تعمل فلا يلزم شيء، فالنسخ يستخدم حسابها. والأفضل
   حساب خاص بالنسخ على بريد الشركة: أضف من الرابط نفسه سرّين، الأول باسم
   `BACKUP_LOGIN_EMAIL` فيه بريد الحساب، والثاني باسم `BACKUP_LOGIN_PASSWORD` فيه كلمة مروره.
   وعند نشر قواعد الحماية الجديدة اطلب من المطوّر أن يضع بريد هذا الحساب في خانة حسابات
   المهام، فيصبح للقراءة فقط.
6. شغّل أول نسخة بيدك ولا تنتظر الليل: افتح صفحة النسخ الاحتياطي من هذا الرابط
   https://github.com/ghaithalmanfe/ultramed-app/actions/workflows/backup.yml
   ثم اضغط زر التشغيل فوق قائمة التشغيلات، ثم الزر الأخضر الذي يظهر تحته.
7. تأكد أنها نجحت: بعد دقيقة أو دقيقتين يظهر التشغيل في القائمة. النجاح علامة خضراء، وإذا
   فتحته وجدت في أعلاه عدد المستندات التي نُسخت، وفي أسفله ملفاً واحداً هو النسخة. العلامة
   الخضراء وحدها لا تكفي: إن ظهر تحذير أصفر بلا ملف فهناك سرّ ناقص ولم تُحفظ أي نسخة. وإن
   ظهرت علامة حمراء فالسطر الأول من الخطأ يقول السبب وما العمل.

**بعد ذلك، تلقائياً**

8. تُؤخذ نسخة كل ليلة وتبقى أسبوعين، ونسخة كل جمعة وتبقى شهرين، ونسخة أول كل شهر وتبقى
   ثلاثة أشهر.
9. مرة كل أسبوع افتح صفحة النسخ الاحتياطي (رابط الخطوة ٦) وتأكد أن آخر تشغيل أخضر وفيه ملف.
   إن توقف العمل على المستودع ستين يوماً يوقف GitHub النسخ التلقائي بعد أن يرسل تنبيهاً؛
   أعد تفعيله من الصفحة نفسها.

**تنزيل نسخة**

10. افتح أي تشغيل أخضر، وانزل إلى أسفل صفحته، واضغط اسم الملف فينزل على جهازك. الملف مشفّر
    ولا يُفتح إلا بعبارة المرور، فيمكن حفظه في أي مكان.

**الاسترجاع**

11. يسترجع النسخة مطوّرٌ تعطيه عبارة المرور وقت الاسترجاع فقط: يفتحها ويتحقق منها، ثم يعيد
    البيانات أولاً إلى مشروع تجريبي منفصل. أما الكتابة فوق البيانات الحقيقية فلا تتم إلا
    بموافقتك، وبحساب المشرف، وبعد أن يغلق الجميع التطبيق.

**قرار يعود إليك**

12. المستودع عام. جعله خاصاً يمنع الغرباء من تنزيل الملفات المشفّرة ومن رؤية سجلات
    التشغيل، لكنه يغيّر طريقة نشر التطبيق وما يقدّمه GitHub مجاناً. لن يغيّره أحد غيرك، وعبارة
    المرور تبقى لازمة في الحالتين.
