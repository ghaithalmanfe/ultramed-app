# Database backups

> **بالعربية باختصار:** للبيانات نسختان احتياطيتان خارج التطبيق:
>
> 1. **النسخة الليلية المشفّرة** (هذه الصفحة): تُؤخذ تلقائياً من GitHub كل ليلة الساعة
>    02:15 بتوقيت الكويت وتُحفظ 14 يوماً، ونسخة أسبوعية فجر كل جمعة تُحفظ 60 يوماً، ونسخة
>    شهرية أول كل شهر تُحفظ 90 يوماً. فيها كل مستندات قاعدة البيانات `state` كما هي تماماً:
>    العيادات والأطباء، الزيارات (هذا الشهر وكل الشهور السابقة)، المهام والخطط، ملفات
>    المبيعات وأسطرها، الأهداف، الفريق، الصور، الدردشة والذكريات، سجل التغييرات، والنسخ
>    اليومية الموجودة داخل التطبيق. لا تعمل حتى يضاف السر `BACKUP_PASSPHRASE`: عبارة مرور
>    طويلة عشوائية (20 حرفاً على الأقل) تُحفظ نسختها أيضاً خارج GitHub، فبدونها لا تُفتح
>    أي نسخة. المستودع عام، فيستطيع أي شخص مسجّل في GitHub تنزيل الملف المشفّر، والعبارة هي
>    حمايته الوحيدة. حساب الدخول المستخدم يجب أن يكون على نطاق الشركة `@ultramed-kw.com`
>    (قواعد الحماية ترفض غيره)، ويكفي حساب الإيميلات اليومية الموجود. ما دامت الأسرار غير
>    مضافة يقول كل تشغيل إن النسخ «not configured» (غير مُعدّ) ولا يحفظ شيئاً ويبقى أخضر.
>    أقصى ما قد يضيع: يوم واحد.
> 2. **النسخة الكاملة على الجهاز** (للمشرف: المزيد ← «التصدير والمشاركة» ← «نسخة احتياطية
>    كاملة على هذا الجهاز»): ملف غير مشفّر يُحفظ على الجهاز نفسه، يُفحص بالأمر
>    `node scripts/backup/verify.js`.
>
> الاسترجاع لا يتم أبداً تلقائياً: يكون أولاً في مشروع منفصل للتجربة، والكتابة فوق البيانات
> الحقيقية لا تتم إلا بقرارك وبمساعدة مطوّر.

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
the app keeps (one document per key, `{value, updated}`, as `www/js/app/01-config.js`
stores it): clinics and doctors, visits (this month's `visits`, every past month's
`visitsArch:YYYY-MM`, and `visitsIndex`), tasks, day plans, requests and stands
(`events`), targets, the team list (`staff`), the product catalog, prescription types,
selling guides, discount limits and KPI settings, the ERP sales index (`erpSales`) and
every `erpRows:` chunk, ERP account links and their log, sales notes, the recycle bin and
the delete log, photos (`photo:<id>`), team chat and memories, the e-mail and repair
logs, the change log (`auditLog:YYYY-MM`, once the release that adds it is out), the
app's own daily `snap_` backups, and any older document still there.

Each document is kept whole, exactly as stored (its `value` string is never parsed or
rewritten), with its create and update times. Nothing is chosen by name: the whole
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
never makes GitHub cancel a weekly or monthly backup waiting behind it. The file is
gzip-compressed, then encrypted with AES-256-GCM under a key derived by scrypt from the
passphrase; a random salt and IV are stored in the file's header. The clear data never
touches the runner's disk, and the run log shows only counts, sizes and checksums per key
prefix — never a value, an e-mail address, the passphrase or a token (the repository and
its logs are public).

A run that fails (a sign-in or a page that is refused, a page that cannot be read after
retries, a count that disagrees, an empty listing, a file that does not decrypt back)
keeps nothing and turns red; GitHub notifies a failed scheduled run to the person who
added the schedule, or last changed or re-enabled it (see your Actions notification
settings). Until the secrets are added, every run says "not configured", keeps nothing
and stays green.

## One-time setup (owner)

GitHub → the repository → **Settings → Secrets and variables → Actions → New repository
secret**:

- `BACKUP_PASSPHRASE` (required): a long random passphrase, 20 characters at least (let
  a password manager make 30 or more). Keep a copy outside GitHub as well: without it no
  backup can ever be opened, and GitHub will not show a secret again. If you change it
  later, older files still need the old one until they expire.
- The login: nothing to add if the daily e-mails are set up — the backup then signs in
  with `REPORT_LOGIN_EMAIL` / `REPORT_LOGIN_PASSWORD`. To give the backup a login of its
  own (better: it can be changed without touching the e-mails), add
  `BACKUP_LOGIN_EMAIL` and `BACKUP_LOGIN_PASSWORD`, an e-mail/password login made in the
  Firebase console → Authentication → Users → Add user. It must be on the company domain
  (`…@ultramed-kw.com`): the security rules in `firestore.rules`, once published, refuse
  any other login, and the run turns red with "page 1: HTTP 403 PERMISSION_DENIED".

Then Actions → "Database backup" → **Run workflow** once and check that the run is green
and lists an artifact. The schedule only runs from the default branch (`main`).

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
   and a changed or damaged file are told apart and refused (exit code 1).
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
the backup (a phone that still holds its own later changes may send them again when it
next saves). It needs both `--i-understand-this-overwrites-production` and, unless the
database is empty, `--force`; `RESTORE_API_KEY` is then the app's own web API key and the
login is the supervisor's (the published rules let only the supervisor write the team
list, targets, settings and sales files).

The published security rules (`firestore.rules`) refuse a **whole** restore: they never
let anyone write a daily backup older than yesterday (`snap_`) or a key they do not list
(an old app version's document). The restore then stops at the batch that holds one,
writes none of that batch's documents (the message counts any batch written before it)
and says the rules refused it. Two ways:

- restore the documents the app uses, which the rules accept:

  ```sh
  node scripts/backup/nightly/restore.js <bundle.json> --i-understand-this-overwrites-production --force \
    --only=clinics,visits,visitsIndex,visitsArch:,tasks,dayPlans,events,tombs,recycleBin,erpNotes,products,repairLog,chat,memories,mailLog,auditLog:,photo:,staff,targets,benchmarks,categoryGuides,erpSales,erpRows:,erpMap,erpMapLog,rxTypes
  ```

  (the first phone that opens the app that day makes the day's backup again);
- or, for the minutes of the restore, publish rules that let the restore login write
  `state`, restore everything, then publish `firestore.rules` again (with the supervisor's
  address in place of the placeholder, as when it was first published).

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
- **Public repository**: anyone signed in to GitHub can download the encrypted files and
  see their names, sizes and times; only the passphrase protects the contents.
- **Inactivity**: GitHub disables scheduled workflows of a public repository after 60
  days without repository activity (it e-mails a warning first); re-enable it on the
  workflow's page.
- **The backup login can also write**: the security rules have no read-only role, so the
  backup's login may write what that login may write anywhere — the team's documents
  (clinics, visits, tasks …) for a team login, everything for the supervisor's. A login
  used only by the backup, with a long password, limits who knows it; a read-only role
  for it would be a change to `firestore.rules`.
- **The in-app `snap_` backups** stay as they are; they live in the same database and are
  included in this backup.

## For developers

- `scripts/backup/nightly/bundle.js`: bundle, manifest, file format and encryption (pure).
  `scripts/backup/nightly/firestore.js`: REST sign-in, paged listing, count, commits,
  retries and a log scrubber. `run.js`, `verify.js`, `restore.js` in the same folder: the
  three commands (`--help` on each). The project id and API key are read from
  `www/js/app/01-config.js`. The phone's full backup has its own tools,
  `scripts/backup/verify.js` and `scripts/backup/restore.js` (`UMCore.fullBackupFile` /
  `verifyBackupFile` in `www/js/core.js`).
- `tests/backup-nightly.test.js` (part of `npm test`) runs the three commands against a
  local fake of Firestore's REST API and identitytoolkit, with a guard that blocks any
  non-local request; its data holds a document of every kind the app keeps (taken from
  `UMCore.BACKUP_SETS` and `firestore.rules`). `tests/rules/backup.test.js` (the rules
  suite: `cd tests/rules && npm ci && npm test`) runs them on Google's own Firestore and
  Auth emulators under the published rules. `FIRESTORE_EMULATOR_HOST` +
  `FIREBASE_AUTH_EMULATOR_HOST` (both, local addresses only) point the scripts at an
  emulator; its REST layer does not read an RFC 3339 read time in a query string, so
  there a run says "Firestore refused a fixed read time" and reads page by page.
- `scripts/build.js` refuses a `.umbackup` file or a decrypted bundle in the published
  folder, `tests/confidential.test.js` one under `www/` or `tests/`, and `.gitignore`
  keeps `/backups/`, `*.umbackup` and `*.umbackup.partial` out of git.
