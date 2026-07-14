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
  - **Shadowing** — pick a transcript line, play/replay/slow the video, then
    record themselves and see a % match score against the target sentence
    (via the browser's built-in speech recognition).
  - **Vocabulary** — flip-card review and multiple-choice quiz generated from
    the lesson's word list.
  - **Speaking** — answer open questions about the video by recording an
    answer; the app shows the transcript and which lesson vocabulary was used.
- All data (users, lessons, vocabulary, questions, progress) is stored in the
  browser's `localStorage` — nothing is sent to a server.

Default admin login: **admin / admin123** (change this — see Security notes).

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

## Cloud sync (push lessons to every device)

By default, lesson content still only lives in whichever browser created
it. **Admin → ☁ Cloud sync** turns on a small, free, key-free shared JSON
store (via jsonblob.com) so lessons, vocabulary, and speaking questions
reach every learner, on every device — accounts and personal progress stay
local to each device, same as before.

Setup (one time, per deployment):

1. Go to **Admin → ☁ Cloud sync → Create a shared store**. This creates a
   free store pre-loaded with whatever lessons already exist on this device.
2. It shows you a `blobId` value — open `sync-config.json` in your deployed
   files, paste that value in, save, and redeploy (push to GitHub, re-drag
   into Netlify, etc.).
3. From then on, every device that loads the app reads `sync-config.json`,
   finds the same store, and pulls the latest lessons on load (and again
   when opening the Lessons page, if more than ~15 seconds have passed).
   Any admin change (add/edit/delete lesson, vocab, or question) is pushed
   to the store automatically.

This is a "syncs on refresh" model, not instant real-time push — a learner
who's mid-session won't see a brand-new lesson appear without reloading or
re-opening the Lessons page, but any refresh afterwards will have it. Use
**Admin → ☁ Cloud sync → Push / Pull** buttons any time to sync on demand.

To turn cloud sync back off, clear the `blobId` in `sync-config.json` and
redeploy — the app falls back to local-only storage exactly as before.



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
js/app.js                 data store, auth, router, every view, AI Assist, PWA install logic
manifest.json             PWA manifest (name, icons, colors)
service-worker.js         offline cache for the app's own static files
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
- **Cloud sync depends on a third-party free service** (jsonblob.com) too.
  It's free and needs no signup or key, but treat the store like a shared
  link: anyone who has the `blobId` can read and overwrite it, so don't rely
  on it for anything sensitive — it's meant for lesson content only. If the
  service is ever down or the store is deleted, cloud sync simply stops
  updating until a new store is created; each device's local copy keeps
  working in the meantime.

## Customizing

- Colors, fonts, and layout are all in `css/style.css` under `:root` at the
  top — change the CSS variables to re-theme the app.
- The scoring logic (shadowing match %) lives in `wordSimilarity()` in
  `js/app.js`, if you want to tune how strict it is.
