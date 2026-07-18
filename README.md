# EchoLine — Learn English from YouTube

A small, free-to-host web app for practicing English using real YouTube videos:
shadowing (repeat sentences aloud and get a match score), vocabulary flashcards
and quizzes, open speaking questions about a lesson, and a free **AI Assist**
that drafts vocabulary and questions from the lesson's transcript for you.
It also installs like a native app on a phone (Add to Home Screen / PWA).

It's built with plain HTML/CSS/JavaScript — **no build step, no server, no
database.** That means it can be hosted on GitHub Pages or any static file
host for free.

## How it works

- **Admin** logs in and adds lessons: a YouTube link, a transcript (one
  sentence per line), vocabulary (`word | meaning | example`), and speaking
  questions.
  - Two **"🤖 Auto-detect / Auto-generate"** buttons in the lesson workspace
    use a free AI helper to read the transcript and pre-fill the vocabulary
    (word + meaning + example sentence) and 4–6 simple-to-medium speaking
    questions — the admin still reviews/edits the text before importing it,
    nothing is saved automatically. See "Free AI Assist" below.
- **Learners** sign up, browse lessons, and practice:
  - **Shadowing** — a compact "now playing" style player (small video,
    play/pause, seek bar, speed control) with the transcript next to it
    highlighting and auto-scrolling in sync with the audio; click any line
    to jump the audio there, then record yourself and see a % match score
    against the target sentence (via the browser's built-in speech
    recognition). See "Shadowing sync" below.
  - **Vocabulary** — flip-card review and multiple-choice quiz generated from
    the lesson's word list.
  - **Speaking** — answer open questions about the video by recording an
    answer; the app shows the transcript and which lesson vocabulary was used.
- All data (users, lessons, vocabulary, questions, progress) is stored in the
  browser's `localStorage` — nothing is sent to a server.

Default admin login: **admin / admin123** (change this — see Security notes).

## Shadowing sync (transcript follows the audio)

The Shadowing practice page looks and feels like an audio/podcast player:
what learners see is the video's own thumbnail with a small animated
equalizer over it (not the video itself), play/pause, a seek bar with
current time / duration, and speed controls — with the transcript taking up
the main visual space next to it, highlighting the current line and
auto-scrolling as the audio plays. Clicking any line jumps playback there
and opens the record panel for that sentence. This is automatic for every
lesson — nothing to turn on per lesson.

**Why it's a cover-art overlay rather than truly no video:** YouTube's API
Services Terms require embedded players to stay at least 200×200 px and
forbid disabling/hiding the player element itself — a fully-removed
"audio-only" mode would risk losing embed access. What's shown here keeps
the real player present and correctly sized underneath, just visually
covered by the video's own thumbnail and an equalizer animation, so the
practical experience is "look and feel like audio," while staying on the
right side of that requirement.

**Timestamps — the real key to tight sync:** by default, transcript lines
are spread evenly across the video's duration, which is only a rough
approximation — real speech isn't evenly paced, so evenly-guessed
timestamps will always feel a little "off" no matter how fast the app
checks the playback position. Two ways to fix that:

1. **⏱ Tap timestamps while listening** (button in Admin → manage a
   lesson, under the transcript field) — the real fix. It opens a small
   player plus the transcript list; play the video, and the instant you
   hear a line start, click **Mark line** (or just press the spacebar) —
   it captures the exact playback position and automatically moves to the
   next line. Takes about as long as the video itself to do the whole
   transcript, and gives genuinely accurate, per-line sync. Click **Save
   timestamps to transcript** when done.
2. **Type timestamps by hand**, if you prefer — start any line with
   `[0:12]` (or `[1:05:12]` for videos over an hour):

```
[0:00] Hello, everyone.
[0:03] Welcome back to the channel.
Today we are talking about something exciting.
[0:11] Let's get started.
```

Either way, lines left without a timestamp get one interpolated between the
nearest ones that *are* set — so partial timing (even just a handful of
anchor points) is still noticeably better than none. Skip timestamps
entirely and lines are just spread evenly across the whole video, same as
before.

## Free AI Assist (vocabulary + questions)

In **Admin → Manage lesson**, above the vocabulary and questions forms, there
are two buttons:

- **🤖 Auto-detect vocabulary** — sends the lesson transcript to a free AI
  helper and asks it for 6–10 useful words/phrases, each with a plain-English
  meaning and an example sentence. Results are written into the existing
  `word | meaning | example` textarea for you to review, edit, or delete
  lines from — nothing is saved until you click **Import vocabulary**.
- **🤖 Auto-generate questions** — sends the transcript and asks for 4–6
  speaking questions, mixing simple (recall / main idea) and medium
  (opinion / inference) difficulty, all grounded in that lesson's content.
  Same review-before-saving flow, via **Add questions**.

This uses [Puter.js](https://developers.puter.com/) (`js.puter.com`), a free,
keyless AI API — no OpenAI/Anthropic key, no billing, no server of your own
required, which keeps EchoLine deployable as a plain static site. If it can't
be reached (offline, or the script is blocked by a strict ad-blocker/firewall),
both buttons automatically fall back to a small built-in keyword scan so
they still produce a useful starting draft.

## Bulk-add videos (no API key needed)

**Admin → + Add multiple videos** lets you paste several YouTube links at
once (one per line). EchoLine looks up each video's real title for free via
YouTube's public oEmbed endpoint — no API key required — and creates one
lesson per link with an empty transcript for you to fill in.

A playlist link itself (`.../playlist?list=...`) can't be expanded into its
individual videos this way — that requires Google's paid/keyed YouTube Data
API, which this app deliberately avoids to stay a free, key-free static
site. Instead: open the playlist on YouTube, copy each video's own link, and
paste that whole batch into the bulk-add box.

## Cloud sync (push lessons to every device, via GitHub)

By default, lesson content still only lives in whichever browser created
it. **Admin → ☁ Cloud sync** commits lessons, vocabulary, and speaking
questions straight into this site's own GitHub repo, as a JSON file —
learners' devices then pull that file automatically. Accounts and personal
progress stay local to each device, same as before, and **learners can only
pull** — the push controls only exist on the Admin page, and are never
shown to a non-admin account.

Two GitHub endpoints make this work from a plain static site with no server
of its own, both confirmed to support cross-origin (CORS) requests from the
browser:
- `api.github.com` — used to commit the updated file (admin only, needs a
  token).
- `raw.githubusercontent.com` — used to read it back (everyone, no token
  needed, since reading is just fetching a public file from the repo).

Because pushing is a real commit straight into the repo, there's **no
manual file-editing-and-redeploy step** for the common case (a standard
GitHub Pages site) — click Push and it's live within moments.

(Earlier versions of this used jsonblob.com, then jsonbin.io, both
third-party JSON-store services. jsonblob turned out not to support CORS at
all — every request silently failed with "Failed to fetch." jsonbin.io
worked, but needed a separate free account/service; this version uses the
GitHub repo the admin already owns and deploys from instead.)

Setup (one time, per admin device):

1. Go to **Admin → ☁ Cloud sync**. If this is deployed at a standard GitHub
   Pages address (`https://yourname.github.io/` or
   `https://yourname.github.io/your-repo/`), the repo owner/name are
   auto-filled for you — check they're correct, adjust the branch/path if
   you want, then click **Save repo settings**.
2. Create a free, **fine-grained** Personal Access Token at
   [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):
   under "Repository access," pick this one repo only; under "Repository
   permissions," grant **Contents: Read and write**. Paste it into the app
   and click **Save token**. This token stays only in this browser's
   storage — it's never committed anywhere, and learners are never shown
   this field at all.
3. Click **⬆ Push my local content to GitHub**. This commits your current
   lessons/vocab/questions to `data/lessons.json` (or wherever you set the
   path) in your repo.
4. From then on, every device — including learners, with zero setup on
   their end — reads that same file from `raw.githubusercontent.com` on
   load and when opening the Lessons page (if more than ~15 seconds have
   passed). Any further admin change (add/edit/delete lesson, vocab, or
   question) is pushed automatically, from any browser that has the token
   saved (step 2). Other admin devices need their own copy of that token to
   push too; they can always pull without it.

If your site isn't at a standard `*.github.io` address (a custom domain, or
lessons stored in a different repo than the one serving the site), auto-
detection won't find the right repo. In that case, either fill in the repo
fields manually in **Admin → ☁ Cloud sync** (each admin device needs this
once), or ship a `data-config.json` file with the deployed app (same idea
as before — edit it once with `{"owner": "...", "repo": "...", "branch":
"...", "path": "..."}` and redeploy) so every device, including learners,
can find the right repo without needing to auto-detect it.

This is a "syncs on refresh" model, not instant real-time push — a learner
who's mid-session won't see a brand-new lesson appear without reloading or
re-opening the Lessons page, but any refresh afterwards will have it
(usually within moments; occasionally a couple of minutes, since GitHub's
CDN briefly caches raw file reads). Use **Admin → ☁ Cloud sync → Push /
Pull** buttons any time to sync on demand.

To turn cloud sync off, remove the admin's saved token (clear the token
field and click Save) — pushing stops, and reads simply return nothing new
until it's turned back on. The repo file itself isn't deleted.

⚠️ The token you create should be scoped to **only this one repo**, with
**only** Contents: Read & write — never use a broad, all-repos token here.
Treat it like a password: it lives only in that browser's local storage, so
don't paste it on a shared/public computer without clearing it afterwards.

### Fixed: push/pull silently failing

An earlier version of this had two bugs that made push/pull unreliable:

1. **A disallowed header silently blocked every GitHub API call.** The code
   sent `X-GitHub-Api-Version` on every request, but that header isn't in
   GitHub's own CORS allow-list (confirmed against GitHub's current CORS
   docs), so browsers blocked the preflight check before the request ever
   went out — with no error the app could actually see, just a dead push
   button. That header has been removed; only headers GitHub explicitly
   allows (`Authorization`, `Content-Type`, plus the CORS-safelisted
   `Accept`) are sent now.
2. **A failed pull could retry in a tight loop.** If cloud sync was turned
   on but nothing had been pushed yet (a very common state — right after
   first setting it up), every pull attempt "failed" (404, nothing there
   yet), which used to leave the retry-throttle timer un-set, so the very
   next render would immediately try again — and again, as fast as the
   browser could go. Retries are now throttled on every attempt, success or
   not, so a not-yet-populated or temporarily unreachable store just waits
   quietly for the next scheduled check instead of hammering the network.

If push/pull still isn't working after updating, the error message shown
next to the Push/Pull buttons is now GitHub's actual response (e.g. "Bad
credentials", "Not Found", "Resource not accessible by personal access
token") rather than a generic failure — that's almost always enough to spot
whether it's the token's permissions, the repo/branch/path, or something
else.

## Install on a phone (or desktop) like an app

EchoLine is an installable Progressive Web App:

- **Android (Chrome)**: open the site, tap the **⬇ Install app** button in
  the top bar (or the browser's own "Add to Home screen" prompt/menu item).
- **iPhone/iPad (Safari)**: open the site, tap the Share icon, then **"Add to
  Home Screen."** iOS doesn't support the automatic install-prompt button, so
  this manual step is required there.
- **Desktop (Chrome/Edge)**: click the install icon in the address bar, or
  the **⬇ Install app** button in the nav.


Once installed it opens full-screen without browser chrome, and its own
static files (HTML/CSS/JS/icons) are cached by a service worker so the app
shell still opens when offline — lesson data already saved in `localStorage`
is available too. Loading a *new* lesson's YouTube video, or using AI Assist,
still needs an internet connection.

## File structure

```
index.html               entry page + shell (nav, header, footer), PWA meta tags
css/style.css             design system and all styling
js/app.js                 data store, auth, router, every view, AI Assist, cloud sync, PWA install logic
manifest.json             PWA manifest (name, icons, colors)
service-worker.js         offline cache for the app's own static files
data-config.json          optional override for cloud sync's repo owner/name/branch/path
icons/                    app icons for home-screen / install
README.md                 this file
```

## Run it locally

No install needed. From this folder:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

(Opening `index.html` directly with `file://` also mostly works, but some
browsers restrict speech recognition on `file://` — a local server is safer.)

## Deploy for free

### Option A — GitHub Pages
1. Create a new GitHub repository and push these files to the root of the
   `main` branch (or a `docs/` folder).
2. In the repo, go to **Settings → Pages**, set **Source** to the branch/folder
   you used, and save.
3. GitHub gives you a URL like `https://<username>.github.io/<repo>/`.

### Option B — Netlify / Vercel / Cloudflare Pages
Drag-and-drop this folder into Netlify Drop, or connect the repo in Vercel /
Cloudflare Pages with **no build command** and **publish directory = `/`**.
All three have free tiers and work exactly like GitHub Pages for a static
site like this.

## Important limitations (please read)

- **Storage is per-browser, per-device.** Because there's no backend,
  accounts and progress live only in the browser that created them — a user
  who signs up on their phone won't see that account on their laptop. If you
  need real multi-device accounts, you'd need to swap `localStorage` in
  `js/app.js` for a free backend such as Firebase Auth + Firestore or Supabase
  (both have generous free tiers and work fine from a static site).
- **Login is not secure.** Passwords are only lightly obfuscated client-side,
  not properly hashed or encrypted, since there's no server to do that safely.
  Don't reuse a real password here, and treat this as a learning-app demo
  rather than something holding sensitive data.
- **Speech recognition** uses the Web Speech API, which currently only works
  well in Chrome and Edge (desktop and Android). Safari and Firefox support is
  limited or missing — those users can still watch, read, and use flashcards,
  but the recording/scoring features will be disabled.
- **Transcripts are typed in by the admin**, not auto-fetched from YouTube.
  YouTube doesn't allow browser-based apps to download official captions
  without a server and API credentials, so the simplest reliable path on free
  static hosting is to paste the transcript (many videos already show a
  transcript under "..." → "Show transcript" on YouTube — copy it in, one
  sentence per line).
- **The YouTube video must allow embedding.** A small number of videos block
  embedding by their owner and won't play inside the app; try a different
  video in that case.
- **AI Assist depends on a third-party free service** (Puter.js /
  `js.puter.com`) that EchoLine doesn't control. It's free and keyless today,
  but if it's ever unreachable, slow, or discontinued, the buttons fall back
  to the built-in offline keyword scan automatically — the rest of the app
  is unaffected either way. AI-drafted meanings/questions can occasionally be
  imperfect, so review them before importing, same as you would any
  auto-generated content.
- **Cloud sync depends on GitHub's API and CDN.** Reading is keyless and
  works for anyone, but pushing needs a Personal Access Token with write
  access to the repo — treat that token like a password (see "Cloud sync"
  above). Raw file reads go through GitHub's CDN, which briefly caches
  responses, so a push can take up to a couple of minutes to show up for
  everyone rather than being truly instant. If GitHub is ever unreachable,
  cloud sync simply stops updating until it's back; each device's local
  copy keeps working in the meantime. The Contents API used for pushing
  also caps file size around 1MB, which is far more than typical lesson
  content needs.

## Customizing

- Colors, fonts, and layout are all in `css/style.css` under `:root` at the
  top — change the CSS variables to re-theme the app.
- The scoring logic (shadowing match %) lives in `wordSimilarity()` in
  `js/app.js`, if you want to tune how strict it is.
