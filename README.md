# EchoLine — Learn English from YouTube

A small, free-to-host web app for practicing English using real YouTube videos:
shadowing (repeat sentences aloud and get a match score), vocabulary flashcards
and quizzes, and open speaking questions about a lesson.

It's built with plain HTML/CSS/JavaScript — **no build step, no server, no
database.** That means it can be hosted on GitHub Pages or any static file
host for free.

## How it works

- **Admin** logs in and adds lessons: a YouTube link, a transcript (one
  sentence per line), vocabulary (`word | meaning | example`), and speaking
  questions.
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

## File structure

```
index.html        entry page + shell (nav, header, footer)
css/style.css      design system and all styling
js/app.js          data store, auth, router, and every view
README.md          this file
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

## Customizing

- Colors, fonts, and layout are all in `css/style.css` under `:root` at the
  top — change the CSS variables to re-theme the app.
- The scoring logic (shadowing match %) lives in `wordSimilarity()` in
  `js/app.js`, if you want to tune how strict it is.
