/* =========================================================================
   EchoLine — client-side English learning app powered by YouTube shadowing.
   Everything (users, lessons, vocabulary, progress) is stored in this
   browser's localStorage. No server required — safe to host on GitHub
   Pages or any static file host. See README.md for details & limitations.
   ========================================================================= */

const DB_KEY = 'echoline_db_v1';
const SESSION_KEY = 'echoline_session_v1';
const app = document.getElementById('app');
const nav = document.getElementById('nav');

/* ---------------------------- Data layer ------------------------------ */

function loadDB(){
  let raw = localStorage.getItem(DB_KEY);
  if(!raw){
    const seed = {
      users:[{id: uid(), username:'admin', passwordHash: simpleHash('admin123'), role:'admin', createdAt: Date.now()}],
      lessons: [],
      vocab: [],
      questions: [],
      progress: {}
    };
    localStorage.setItem(DB_KEY, JSON.stringify(seed));
    return seed;
  }
  return JSON.parse(raw);
}
function saveDB(db){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }

function getSession(){
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}
function setSession(username){ localStorage.setItem(SESSION_KEY, JSON.stringify({username})); }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }
function currentUser(){
  const s = getSession();
  if(!s) return null;
  const db = loadDB();
  return db.users.find(u => u.username === s.username) || null;
}
function progressFor(db, username){
  if(!db.progress[username]) db.progress[username] = {vocabKnown:[], shadowScores:[], speakAttempts:[]};
  return db.progress[username];
}

/* ---------------------------- Utilities -------------------------------- */

function uid(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }

// NOTE: this is a lightweight obfuscation, not real cryptography. Because
// EchoLine has no server, there is no way to do secure password hashing
// client-side. Do not reuse real passwords here — see README.md.
function simpleHash(str){
  let h = 0;
  for(let i=0;i<str.length;i++){ h = (Math.imul(31,h) + str.charCodeAt(i)) | 0; }
  return 'h' + h.toString(36) + btoa(unescape(encodeURIComponent(str))).slice(0,6);
}

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function extractYouTubeId(url){
  if(!url) return null;
  url = url.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for(const p of patterns){ const m = url.match(p); if(m) return m[1]; }
  if(/^[\w-]{11}$/.test(url)) return url; // raw ID pasted directly
  return null;
}

function normalizeWords(s){
  return String(s ?? '').toLowerCase()
    .replace(/[^a-z0-9' ]/g,' ')
    .split(/\s+/).filter(Boolean);
}

function lcsLength(a,b){
  const dp = Array(a.length+1).fill(null).map(()=>Array(b.length+1).fill(0));
  for(let i=1;i<=a.length;i++){
    for(let j=1;j<=b.length;j++){
      dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }
  return dp[a.length][b.length];
}

function wordSimilarity(target, spoken){
  const a = normalizeWords(target), b = normalizeWords(spoken);
  if(a.length===0) return 0;
  const lcs = lcsLength(a,b);
  return Math.round( (2*lcs / (a.length + Math.max(b.length,1))) * 100 );
}

function scoreClass(score){ return score>=75 ? 'good' : score>=45 ? 'mid' : 'low'; }

function toast(msg, type='info'){
  return `<div class="alert ${type}">${escapeHtml(msg)}</div>`;
}

/* ---------------------------- Speech recognition ------------------------ */

function speechSupported(){
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
function makeRecognizer(){
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new R();
  rec.lang = 'en-US';
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  return rec;
}

/* ---------------------------- Free AI assist (vocabulary + questions) ----
   Uses Puter.js (js.puter.com) — a free, keyless AI helper loaded in
   index.html — so admins don't have to type vocabulary and questions by
   hand. Everything here is optional sugar on top of the existing plain
   textarea import forms: AI just pre-fills them for the admin to review
   and edit before clicking Import / Add, so nothing about the data model
   or the manual-entry flow changes. If the AI helper can't be reached
   (offline, or the script is blocked), a small built-in keyword scan is
   used instead so the buttons still do something useful.
   ---------------------------------------------------------------------- */

const AI_TRANSCRIPT_LIMIT = 4000; // keep prompts small & fast

async function callFreeAI(prompt){
  if(!window.puter || !window.puter.ai || typeof window.puter.ai.chat !== 'function'){
    throw new Error('Free AI helper is not available right now (offline, or js.puter.com is blocked).');
  }
  const res = await window.puter.ai.chat(prompt);
  if(typeof res === 'string') return res;
  if(res && res.message && typeof res.message.content === 'string') return res.message.content;
  if(res && res.message && Array.isArray(res.message.content)){
    return res.message.content.map(c => c.text || '').join('\n');
  }
  if(res && typeof res.text === 'string') return res.text;
  return JSON.stringify(res);
}

function extractJSON(text){
  const candidates = ['[','{'].map(c => text.indexOf(c)).filter(i => i !== -1);
  if(candidates.length === 0) throw new Error('AI response did not contain JSON.');
  const start = Math.min(...candidates);
  const closeChar = text[start] === '[' ? ']' : '}';
  const end = text.lastIndexOf(closeChar);
  if(end === -1 || end < start) throw new Error('AI response did not contain JSON.');
  return JSON.parse(text.slice(start, end + 1));
}

async function aiExtractVocabulary(transcript){
  const clipped = transcript.slice(0, AI_TRANSCRIPT_LIMIT);
  const prompt = `You are helping an English teacher build a vocabulary list from a video transcript, for English learners.

Read the transcript below and pick 6 to 10 of the most useful vocabulary words or short phrases for an intermediate learner. Skip very basic words (like "the", "is", "go", "good"). Prefer words or phrases that actually appear in the transcript.

Transcript:
"""
${clipped}
"""

Reply with ONLY valid JSON — an array of objects — and nothing else. No markdown fences, no explanation, no text before or after.
[{"word": "example", "meaning": "a short, simple one-sentence definition", "example": "a short example sentence using the word"}]`;

  const text = await callFreeAI(prompt);
  const data = extractJSON(text);
  if(!Array.isArray(data)) throw new Error('Unexpected AI response shape.');
  return data
    .filter(v => v && v.word && v.meaning)
    .map(v => ({
      word: String(v.word).trim(),
      meaning: String(v.meaning).trim(),
      example: v.example ? String(v.example).trim() : '',
    }));
}

async function aiGenerateQuestions(transcript, title){
  const clipped = transcript.slice(0, AI_TRANSCRIPT_LIMIT);
  const prompt = `You are helping an English teacher write speaking-practice questions from a video transcript, for English learners.

Video title: "${title}"

Read the transcript below and write 4 to 6 open-ended speaking questions about it. Mix simple questions (recall / main idea) with medium-difficulty questions (opinion / inference). A learner who watched or read this should be able to answer them out loud.

Transcript:
"""
${clipped}
"""

Reply with ONLY a valid JSON array of strings and nothing else. No markdown fences, no explanation, no text before or after.
["question 1", "question 2"]`;

  const text = await callFreeAI(prompt);
  const data = extractJSON(text);
  if(!Array.isArray(data)) throw new Error('Unexpected AI response shape.');
  return data.map(q => String(q).trim()).filter(Boolean);
}

// --- Offline fallback: a small keyword scan, used only if the free AI helper is unreachable ---

const AI_FALLBACK_STOPWORDS = new Set([
  'the','a','an','and','or','but','if','then','so','because','of','to','in','on','at','for','with',
  'about','as','is','are','was','were','be','been','being','have','has','had','do','does','did',
  'will','would','can','could','should','may','might','must','i','you','he','she','it','we','they',
  'this','that','these','those','my','your','his','her','its','our','their','not','no','yes','okay',
  'ok','well','just','really','very','get','got','go','going','went','say','says','said','like',
  'also','more','some','any','all','one','two','into','out','up','down','over','under','than','from',
  'there','here','what','when','where','why','how','who','which','them','us','me','us','been','now',
]);

function fallbackVocabFromTranscript(transcript){
  const sentences = transcript.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const freq = {};
  sentences.forEach(s => {
    normalizeWords(s).forEach(w => {
      if(w.length >= 5 && !AI_FALLBACK_STOPWORDS.has(w)) freq[w] = (freq[w] || 0) + 1;
    });
  });
  const words = Object.keys(freq).sort((a,b) => freq[b]-freq[a]).slice(0, 8);
  return words.map(w => ({
    word: w,
    meaning: '(quick offline scan — add a definition here)',
    example: sentences.find(s => normalizeWords(s).includes(w)) || '',
  }));
}

function fallbackQuestionsFromTranscript(title){
  return [
    `What is the main idea of "${title}"?`,
    `What is one new word or phrase you learned from this video? What does it mean?`,
    `Do you agree with what was said in the video? Why or why not?`,
    `Summarize this video in two or three sentences, in your own words.`,
    `How does this topic connect to your own life or experience?`,
  ];
}

async function aiFillVocab(lessonId){
  const db = loadDB();
  const lesson = db.lessons.find(l => l.id === lessonId);
  const statusEl = document.getElementById('ai-vocab-status');
  const btn = document.getElementById('ai-vocab-btn');
  if(!lesson.transcript || !lesson.transcript.trim()){
    statusEl.textContent = 'Add a transcript above first — the AI reads that to find vocabulary.';
    return;
  }
  btn.disabled = true;
  statusEl.textContent = '✨ Thinking… reading the transcript…';
  try{
    const items = await aiExtractVocabulary(lesson.transcript);
    if(items.length === 0) throw new Error('AI returned no usable words.');
    fillTextareaLines('vocab-import', items.map(v => `${v.word} | ${v.meaning} | ${v.example}`));
    statusEl.textContent = `Found ${items.length} words — review them below, then click Import vocabulary.`;
  }catch(err){
    console.error(err);
    const fallback = fallbackVocabFromTranscript(lesson.transcript);
    fillTextareaLines('vocab-import', fallback.map(v => `${v.word} | ${v.meaning} | ${v.example}`));
    statusEl.textContent = `Free AI wasn't reachable, so here's a quick offline keyword scan instead (${fallback.length} words) — edit the meanings, then click Import vocabulary.`;
  }finally{
    btn.disabled = false;
  }
}

async function aiFillQuestions(lessonId){
  const db = loadDB();
  const lesson = db.lessons.find(l => l.id === lessonId);
  const statusEl = document.getElementById('ai-q-status');
  const btn = document.getElementById('ai-q-btn');
  if(!lesson.transcript || !lesson.transcript.trim()){
    statusEl.textContent = 'Add a transcript above first — the AI reads that to write questions.';
    return;
  }
  btn.disabled = true;
  statusEl.textContent = '✨ Thinking… drafting questions…';
  try{
    const questions = await aiGenerateQuestions(lesson.transcript, lesson.title);
    if(questions.length === 0) throw new Error('AI returned no usable questions.');
    fillTextareaLines('question-import', questions);
    statusEl.textContent = `Drafted ${questions.length} questions — review them below, then click Add questions.`;
  }catch(err){
    console.error(err);
    const fallback = fallbackQuestionsFromTranscript(lesson.title);
    fillTextareaLines('question-import', fallback);
    statusEl.textContent = `Free AI wasn't reachable, so here are some general-purpose starter questions instead — edit as needed, then click Add questions.`;
  }finally{
    btn.disabled = false;
  }
}

function fillTextareaLines(elementId, lines){
  const ta = document.getElementById(elementId);
  const existing = ta.value.trim();
  ta.value = existing ? existing + '\n' + lines.join('\n') : lines.join('\n');
}

/* ---------------------------- PWA: install + offline shell --------------- */

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  renderNav(); // re-render so the Install button appears
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  renderNav();
});

function handleInstallClick(){
  if(!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.finally(() => {
    deferredInstallPrompt = null;
    renderNav();
  });
}

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {
      /* static hosting without HTTPS (e.g. plain file://) may reject this — app still works, just without offline caching */
    });
  });
}

/* ---------------------------- Router ------------------------------------ */

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', () => { loadDB(); route(); });

function go(hash){ location.hash = hash; }

function route(){
  renderNav();
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  const user = currentUser();

  if(parts.length === 0) return renderHome();
  if(parts[0]==='login') return renderLogin();
  if(parts[0]==='signup') return renderSignup();

  if(parts[0]==='lessons') return requireAuth() && renderLessons();
  if(parts[0]==='lesson' && parts[1]) return requireAuth() && renderLessonDetail(parts[1]);

  if(parts[0]==='practice' && parts[1]==='shadow' && parts[2]) return requireAuth() && renderShadowPractice(parts[2]);
  if(parts[0]==='practice' && parts[1]==='vocab' && parts[2]) return requireAuth() && renderVocabPractice(parts[2]);
  if(parts[0]==='practice' && parts[1]==='speak' && parts[2]) return requireAuth() && renderSpeakPractice(parts[2]);

  if(parts[0]==='admin' && !parts[1]) return requireAuth('admin') && renderAdmin();
  if(parts[0]==='admin' && parts[1]==='new') return requireAuth('admin') && renderAdminLessonForm();
  if(parts[0]==='admin' && parts[1]==='lesson' && parts[2]) return requireAuth('admin') && renderAdminLessonWorkspace(parts[2]);

  app.innerHTML = `<div class="empty-state"><h3>Page not found</h3><p>That view doesn't exist.</p></div>`;
}

function requireAuth(role){
  const user = currentUser();
  if(!user){ go('#/login'); return false; }
  if(role && user.role !== role){
    app.innerHTML = toast('This area is for admins only.', 'error') +
      `<div class="empty-state"><a class="btn" href="#/lessons">Back to lessons</a></div>`;
    return false;
  }
  return true;
}

function renderNav(){
  const user = currentUser();
  const installBtn = deferredInstallPrompt
    ? `<button class="btn secondary small" onclick="handleInstallClick()">⬇ Install app</button>`
    : '';
  if(!user){
    nav.innerHTML = `${installBtn}<a href="#/login">Log in</a><a class="btn small" href="#/signup">Sign up</a>`;
    return;
  }
  nav.innerHTML = `
    ${installBtn}
    <a href="#/lessons">Lessons</a>
    ${user.role==='admin' ? '<a href="#/admin">Admin</a>' : ''}
    <span class="tag">${escapeHtml(user.username)}${user.role==='admin' ? ' · admin' : ''}</span>
    <button onclick="handleLogout()">Log out</button>
  `;
}

/* ---------------------------- Home / Auth views -------------------------- */

function renderHome(){
  const user = currentUser();
  if(user) return go('#/lessons');
  app.innerHTML = `
    <section class="hero">
      <div>
        <span class="hero-eyebrow">shadow · speak · repeat</span>
        <h1>Learn English by echoing real YouTube speech.</h1>
        <p>Turn any YouTube video into a speaking lesson: shadow sentences aloud, drill the vocabulary that shows up in it, and answer speaking questions about what you watched.</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <a class="btn" href="#/signup">Create free account</a>
          <a class="btn secondary" href="#/login">Log in</a>
        </div>
      </div>
      <div class="hero-tape">
        <div class="eq"><span></span><span></span><span></span><span></span><span></span></div>
      </div>
    </section>
    <div class="grid cols-3">
      <div class="card"><h3>1. Admin adds a lesson</h3><p style="color:var(--text-dim)">Paste a YouTube link, the transcript, vocabulary, and speaking questions.</p></div>
      <div class="card"><h3>2. You shadow it</h3><p style="color:var(--text-dim)">Play a sentence, repeat it aloud into your mic, and get an instant match score.</p></div>
      <div class="card"><h3>3. You speak about it</h3><p style="color:var(--text-dim)">Answer open questions about the video and review your own transcript.</p></div>
    </div>
  `;
}

function renderLogin(){
  app.innerHTML = `
    <div class="auth-box">
      <div class="card">
        <h2>Log in</h2>
        <p style="color:var(--text-dim);margin-top:-8px;">Default admin account: <span class="badge">admin / admin123</span></p>
        <form onsubmit="return handleLogin(event)">
          <label for="u">Username</label>
          <input id="u" type="text" required autofocus>
          <label for="p">Password</label>
          <input id="p" type="password" required>
          <button class="btn" type="submit" style="width:100%;justify-content:center;">Log in</button>
        </form>
        <p style="margin-top:16px;color:var(--text-dim);font-size:.88rem;">No account? <a href="#/signup" style="color:var(--amber-hi);">Sign up</a></p>
      </div>
    </div>
  `;
}

function renderSignup(){
  app.innerHTML = `
    <div class="auth-box">
      <div class="card">
        <h2>Create your account</h2>
        <form onsubmit="return handleSignup(event)">
          <label for="u">Username</label>
          <input id="u" type="text" required autofocus>
          <label for="p">Password</label>
          <input id="p" type="password" required minlength="4">
          <button class="btn" type="submit" style="width:100%;justify-content:center;">Sign up</button>
        </form>
        <p style="margin-top:16px;color:var(--text-dim);font-size:.88rem;">Already have an account? <a href="#/login" style="color:var(--amber-hi);">Log in</a></p>
      </div>
    </div>
  `;
}

function handleLogin(e){
  e.preventDefault();
  const u = document.getElementById('u').value.trim();
  const p = document.getElementById('p').value;
  const db = loadDB();
  const user = db.users.find(x => x.username.toLowerCase() === u.toLowerCase());
  if(!user || user.passwordHash !== simpleHash(p)){
    app.insertAdjacentHTML('afterbegin', toast('Incorrect username or password.', 'error'));
    return false;
  }
  setSession(user.username);
  go('#/lessons');
  return false;
}

function handleSignup(e){
  e.preventDefault();
  const u = document.getElementById('u').value.trim();
  const p = document.getElementById('p').value;
  const db = loadDB();
  if(db.users.some(x => x.username.toLowerCase() === u.toLowerCase())){
    app.insertAdjacentHTML('afterbegin', toast('That username is already taken.', 'error'));
    return false;
  }
  db.users.push({id: uid(), username:u, passwordHash: simpleHash(p), role:'user', createdAt: Date.now()});
  saveDB(db);
  setSession(u);
  go('#/lessons');
  return false;
}

function handleLogout(){ clearSession(); go('#/'); }

/* ---------------------------- Lessons (learner) -------------------------- */

function renderLessons(){
  const db = loadDB();
  const lessons = db.lessons.slice().sort((a,b)=>b.createdAt-a.createdAt);
  app.innerHTML = `
    <div class="section-title">
      <h1>Lessons</h1>
    </div>
    ${lessons.length===0 ? `<div class="empty-state"><h3>No lessons yet</h3><p>Ask an admin to add the first YouTube lesson.</p></div>` : `
    <div class="grid cols-3">
      ${lessons.map(l => `
        <a class="lesson-card" href="#/lesson/${l.id}">
          <div class="lesson-thumb" style="background-image:url('https://i.ytimg.com/vi/${l.youtubeId}/mqdefault.jpg')">
            <div class="eq"><span></span><span></span><span></span></div>
          </div>
          <div class="lesson-body">
            <h3>${escapeHtml(l.title)}</h3>
            <p>${escapeHtml(l.description || 'No description yet.')}</p>
            <div class="lesson-meta">
              <span>${db.vocab.filter(v=>v.lessonId===l.id).length} words</span>
              <span>${db.questions.filter(q=>q.lessonId===l.id).length} questions</span>
            </div>
          </div>
        </a>
      `).join('')}
    </div>`}
  `;
}

function renderLessonDetail(id){
  const db = loadDB();
  const lesson = db.lessons.find(l=>l.id===id);
  if(!lesson){ app.innerHTML = toast('Lesson not found.', 'error'); return; }
  const vocab = db.vocab.filter(v=>v.lessonId===id);
  const questions = db.questions.filter(q=>q.lessonId===id);
  app.innerHTML = `
    <a href="#/lessons" class="btn ghost small">&larr; All lessons</a>
    <div class="section-title" style="margin-top:14px;">
      <h1>${escapeHtml(lesson.title)}</h1>
    </div>
    <div class="practice-panel">
      <div class="video-wrap"><iframe src="https://www.youtube.com/embed/${lesson.youtubeId}" allowfullscreen></iframe></div>
      <div class="card">
        <h3>What you'll practice</h3>
        <p style="color:var(--text-dim)">${escapeHtml(lesson.description || '')}</p>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px;">
          <a class="btn" href="#/practice/shadow/${lesson.id}">Shadowing practice <span class="badge">${(lesson.transcript||'').split('\n').filter(Boolean).length} lines</span></a>
          <a class="btn secondary" href="#/practice/vocab/${lesson.id}">Vocabulary practice <span class="badge">${vocab.length} words</span></a>
          <a class="btn secondary" href="#/practice/speak/${lesson.id}">Speaking practice <span class="badge">${questions.length} questions</span></a>
        </div>
      </div>
    </div>
    <div class="divider"></div>
    <h3>Full transcript</h3>
    <div class="transcript-box">${escapeHtml(lesson.transcript || 'No transcript added yet.')}</div>
  `;
}

/* ---------------------------- Shadowing practice -------------------------- */

let ytPlayer = null, ytReady = false, pendingVideoId = null;
window.onYouTubeIframeAPIReady = function(){
  ytReady = true;
  if(pendingVideoId) createYTPlayer(pendingVideoId);
};
function createYTPlayer(videoId){
  if(!ytReady){ pendingVideoId = videoId; return; }
  ytPlayer = new YT.Player('yt-player-target', {
    videoId,
    playerVars:{rel:0},
  });
}

let currentShadowLesson = null, currentSentenceIdx = null;

function renderShadowPractice(lessonId){
  const db = loadDB();
  const lesson = db.lessons.find(l=>l.id===lessonId);
  if(!lesson){ app.innerHTML = toast('Lesson not found.', 'error'); return; }
  currentShadowLesson = lesson;
  currentSentenceIdx = null;
  const sentences = (lesson.transcript||'').split('\n').map(s=>s.trim()).filter(Boolean);

  app.innerHTML = `
    <a href="#/lesson/${lesson.id}" class="btn ghost small">&larr; ${escapeHtml(lesson.title)}</a>
    <div class="section-title" style="margin-top:14px;"><h1>Shadowing practice</h1></div>
    ${speechSupported() ? '' : toast('Your browser does not support speech recognition (try Chrome or Edge on desktop). You can still play sentences and read along.', 'info')}
    <div class="practice-panel">
      <div>
        <div class="video-wrap"><div id="yt-player-target" style="width:100%;height:100%;"></div></div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
          <button class="btn secondary small" onclick="ytControl('replay')">&#8634; Replay video</button>
          <button class="btn secondary small" onclick="ytControl('slow')">&#128034; Slow (0.75x)</button>
          <button class="btn secondary small" onclick="ytControl('normal')">Normal speed</button>
          <button class="btn secondary small" onclick="ytControl('pause')">Pause</button>
        </div>
        <div id="shadow-result" style="margin-top:16px;"></div>
      </div>
      <div class="card">
        <h3>Sentences</h3>
        <p style="color:var(--text-dim);font-size:.85rem;margin-top:-8px;">Pick a line, listen, then press record and say it aloud.</p>
        ${sentences.length===0 ? `<div class="empty-state">No transcript lines yet. Ask an admin to add one.</div>` : `
        <div class="sentence-list">
          ${sentences.map((s,i)=>`
            <div class="sentence-item" id="sent-${i}" onclick="selectSentence(${i})">
              <span class="sentence-index">${String(i+1).padStart(2,'0')}</span>${escapeHtml(s)}
            </div>
          `).join('')}
        </div>
        <div id="record-controls" style="margin-top:18px;"></div>
        `}
      </div>
    </div>
  `;
  pendingVideoId = lesson.youtubeId;
  if(ytReady) createYTPlayer(lesson.youtubeId);
  else if(window.YT && window.YT.Player) { ytReady = true; createYTPlayer(lesson.youtubeId); }
}

function ytControl(action){
  if(!ytPlayer || !ytPlayer.playVideo) return;
  if(action==='replay'){ ytPlayer.seekTo(0); ytPlayer.playVideo(); }
  if(action==='slow'){ ytPlayer.setPlaybackRate(0.75); ytPlayer.playVideo(); }
  if(action==='normal'){ ytPlayer.setPlaybackRate(1); ytPlayer.playVideo(); }
  if(action==='pause'){ ytPlayer.pauseVideo(); }
}

function selectSentence(i){
  document.querySelectorAll('.sentence-item').forEach(el=>el.classList.remove('active'));
  const el = document.getElementById('sent-'+i);
  if(el) el.classList.add('active');
  currentSentenceIdx = i;
  const sentences = (currentShadowLesson.transcript||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const text = sentences[i];
  document.getElementById('record-controls').innerHTML = `
    <div class="card" style="background:var(--surface-2);">
      <p style="margin-top:0;"><strong>Target:</strong> ${escapeHtml(text)}</p>
      <button class="btn" id="rec-btn" onclick="recordShadow(${i})" ${speechSupported() ? '' : 'disabled'}>&#127908; Record my voice</button>
    </div>
  `;
  document.getElementById('shadow-result').innerHTML = '';
}

function recordShadow(i){
  const sentences = (currentShadowLesson.transcript||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const target = sentences[i];
  const btn = document.getElementById('rec-btn');
  btn.classList.add('recording'); btn.textContent = '● Listening…'; btn.disabled = true;
  const rec = makeRecognizer();
  rec.onresult = (ev) => {
    const spoken = ev.results[0][0].transcript;
    const score = wordSimilarity(target, spoken);
    const db = loadDB();
    const user = currentUser();
    const prog = progressFor(db, user.username);
    prog.shadowScores.push({lessonId: currentShadowLesson.id, sentence: target, score, date: Date.now()});
    saveDB(db);
    document.getElementById('shadow-result').innerHTML = `
      <div class="card">
        <span class="score-pill ${scoreClass(score)}">${score}% match</span>
        <p style="margin-top:12px;"><strong>You said:</strong> ${escapeHtml(spoken)}</p>
        <p style="color:var(--text-dim);"><strong>Target:</strong> ${escapeHtml(target)}</p>
      </div>`;
  };
  rec.onerror = () => { document.getElementById('shadow-result').innerHTML = toast('Could not hear you clearly — try again.', 'error'); };
  rec.onend = () => { btn.classList.remove('recording'); btn.textContent = '🎤 Record my voice'; btn.disabled = false; };
  rec.start();
}

/* ---------------------------- Vocabulary practice -------------------------- */

function renderVocabPractice(lessonId){
  const db = loadDB();
  const lesson = db.lessons.find(l=>l.id===lessonId);
  if(!lesson){ app.innerHTML = toast('Lesson not found.', 'error'); return; }
  const vocab = db.vocab.filter(v=>v.lessonId===lessonId);
  app.innerHTML = `
    <a href="#/lesson/${lesson.id}" class="btn ghost small">&larr; ${escapeHtml(lesson.title)}</a>
    <div class="section-title" style="margin-top:14px;"><h1>Vocabulary practice</h1></div>
    ${vocab.length===0 ? `<div class="empty-state">No vocabulary added for this lesson yet.</div>` : `
    <div class="tabs">
      <button class="active" id="tab-flash" onclick="switchVocabTab('flash')">Flashcards</button>
      <button id="tab-quiz" onclick="switchVocabTab('quiz')">Quiz</button>
    </div>
    <div id="vocab-body"></div>
    `}
  `;
  window.__vocab = vocab;
  window.__vocabIdx = 0;
  if(vocab.length) switchVocabTab('flash');
}

function switchVocabTab(tab){
  document.getElementById('tab-flash').classList.toggle('active', tab==='flash');
  document.getElementById('tab-quiz').classList.toggle('active', tab==='quiz');
  if(tab==='flash') renderFlashcard();
  else renderQuiz();
}

function renderFlashcard(){
  const vocab = window.__vocab;
  const i = window.__vocabIdx % vocab.length;
  const v = vocab[i];
  document.getElementById('vocab-body').innerHTML = `
    <div class="flashcard" id="flashcard" onclick="document.getElementById('flashcard').classList.toggle('flipped')">
      <span class="word">${escapeHtml(v.word)}</span>
      <span class="meaning">${escapeHtml(v.meaning)}${v.example ? '<br><br><em style="color:var(--text-dim);font-size:.9rem;">"'+escapeHtml(v.example)+'"</em>' : ''}</span>
      <span class="hint">tap card to flip</span>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:16px;">
      <span class="badge">${i+1} / ${vocab.length}</span>
      <div style="display:flex;gap:10px;">
        <button class="btn secondary small" onclick="prevCard()">&larr; Prev</button>
        <button class="btn small" onclick="nextCard()">Next &rarr;</button>
      </div>
    </div>
  `;
}
function nextCard(){ window.__vocabIdx = (window.__vocabIdx+1) % window.__vocab.length; renderFlashcard(); }
function prevCard(){ window.__vocabIdx = (window.__vocabIdx-1+window.__vocab.length) % window.__vocab.length; renderFlashcard(); }

function renderQuiz(){
  const vocab = window.__vocab;
  const v = vocab[Math.floor(Math.random()*vocab.length)];
  const distractors = vocab.filter(x=>x.id!==v.id).map(x=>x.meaning);
  const options = shuffle([v.meaning, ...shuffle(distractors).slice(0,3)]);
  document.getElementById('vocab-body').innerHTML = `
    <div class="card">
      <p style="color:var(--text-dim);margin-top:0;">What does this word mean?</p>
      <h2>${escapeHtml(v.word)}</h2>
      <div class="quiz-options">
        ${options.map(opt => `<button onclick="checkQuiz(this,'${escapeHtml(opt).replace(/'/g,"\\'")}','${escapeHtml(v.meaning).replace(/'/g,"\\'")}')">${escapeHtml(opt)}</button>`).join('')}
      </div>
      <button class="btn secondary small" style="margin-top:18px;" onclick="renderQuiz()">Next question &rarr;</button>
    </div>
  `;
}
function checkQuiz(btn, chosen, correct){
  document.querySelectorAll('.quiz-options button').forEach(b=>{
    b.disabled = true;
    if(b.textContent === correct) b.classList.add('correct');
  });
  if(chosen !== correct) btn.classList.add('wrong');
}
function shuffle(arr){ return arr.map(v=>[Math.random(),v]).sort((a,b)=>a[0]-b[0]).map(v=>v[1]); }

/* ---------------------------- Speaking practice -------------------------- */

function renderSpeakPractice(lessonId){
  const db = loadDB();
  const lesson = db.lessons.find(l=>l.id===lessonId);
  if(!lesson){ app.innerHTML = toast('Lesson not found.', 'error'); return; }
  const questions = db.questions.filter(q=>q.lessonId===lessonId);
  app.innerHTML = `
    <a href="#/lesson/${lesson.id}" class="btn ghost small">&larr; ${escapeHtml(lesson.title)}</a>
    <div class="section-title" style="margin-top:14px;"><h1>Speaking practice</h1></div>
    ${speechSupported() ? '' : toast('Your browser does not support speech recognition (try Chrome or Edge on desktop).', 'info')}
    ${questions.length===0 ? `<div class="empty-state">No speaking questions added for this lesson yet.</div>` : `
    <div class="grid cols-2">
      <div class="card">
        <h3>Choose a question</h3>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${questions.map((q,i)=>`<button class="btn secondary" style="justify-content:flex-start;" onclick="selectQuestion('${q.id}')">${i+1}. ${escapeHtml(q.text)}</button>`).join('')}
        </div>
      </div>
      <div id="speak-panel" class="card"><p style="color:var(--text-dim);">Pick a question to begin.</p></div>
    </div>
    `}
  `;
  window.__speakLesson = lesson;
  window.__speakQuestions = questions;
}

function selectQuestion(qId){
  const q = window.__speakQuestions.find(x=>x.id===qId);
  document.getElementById('speak-panel').innerHTML = `
    <h3>${escapeHtml(q.text)}</h3>
    <button class="btn" id="speak-rec-btn" onclick="recordSpeak('${qId}')" ${speechSupported() ? '' : 'disabled'}>&#127908; Record my answer</button>
    <div id="speak-result" style="margin-top:16px;"></div>
  `;
}

function recordSpeak(qId){
  const q = window.__speakQuestions.find(x=>x.id===qId);
  const btn = document.getElementById('speak-rec-btn');
  btn.classList.add('recording'); btn.textContent = '● Listening…'; btn.disabled = true;
  const rec = makeRecognizer();
  rec.onresult = (ev) => {
    const spoken = ev.results[0][0].transcript;
    const words = normalizeWords(spoken);
    const db = loadDB();
    const lessonVocab = db.vocab.filter(v=>v.lessonId===window.__speakLesson.id).map(v=>v.word.toLowerCase());
    const used = lessonVocab.filter(w => words.includes(w));
    const user = currentUser();
    const prog = progressFor(db, user.username);
    prog.speakAttempts.push({lessonId: window.__speakLesson.id, questionId: qId, transcript: spoken, date: Date.now()});
    saveDB(db);
    document.getElementById('speak-result').innerHTML = `
      <div class="card" style="background:var(--surface-2);">
        <p><strong>Your answer:</strong> ${escapeHtml(spoken)}</p>
        <p style="color:var(--text-dim);">${words.length} words spoken${used.length ? ' · used vocabulary: '+used.map(escapeHtml).join(', ') : ''}</p>
      </div>`;
  };
  rec.onerror = () => { document.getElementById('speak-result').innerHTML = toast('Could not hear you clearly — try again.', 'error'); };
  rec.onend = () => { btn.classList.remove('recording'); btn.textContent = '🎤 Record my answer'; btn.disabled = false; };
  rec.start();
}

/* ---------------------------- Admin: dashboard -------------------------- */

function renderAdmin(){
  const db = loadDB();
  const lessons = db.lessons.slice().sort((a,b)=>b.createdAt-a.createdAt);
  app.innerHTML = `
    <div class="section-title">
      <h1>Admin</h1>
      <a class="btn" href="#/admin/new">+ Add YouTube lesson</a>
    </div>
    ${lessons.length===0 ? `<div class="empty-state"><h3>No lessons yet</h3><p>Add your first YouTube lesson to get started.</p></div>` : `
    <div class="table-scroll"><table>
      <thead><tr><th>Title</th><th>Video</th><th>Vocab</th><th>Questions</th><th></th></tr></thead>
      <tbody>
        ${lessons.map(l => `
          <tr>
            <td>${escapeHtml(l.title)}</td>
            <td><span class="badge">${l.youtubeId}</span></td>
            <td>${db.vocab.filter(v=>v.lessonId===l.id).length}</td>
            <td>${db.questions.filter(q=>q.lessonId===l.id).length}</td>
            <td style="display:flex;gap:8px;">
              <a class="btn secondary small" href="#/admin/lesson/${l.id}">Manage</a>
              <button class="btn danger small" onclick="handleDeleteLesson('${l.id}')">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>`}
  `;
}

function renderAdminLessonForm(){
  app.innerHTML = `
    <a href="#/admin" class="btn ghost small">&larr; Admin</a>
    <div class="section-title" style="margin-top:14px;"><h1>Add a YouTube lesson</h1></div>
    <div class="card" style="max-width:640px;">
      <form onsubmit="return handleAddLesson(event)">
        <label for="title">Lesson title</label>
        <input id="title" type="text" required placeholder="e.g. Ordering coffee in English">
        <label for="url">YouTube link or video ID</label>
        <input id="url" type="text" required placeholder="https://www.youtube.com/watch?v=...">
        <label for="desc">Short description</label>
        <input id="desc" type="text" placeholder="What learners will get out of this video">
        <label for="transcript">Transcript (one sentence per line)</label>
        <textarea id="transcript" rows="8" placeholder="Hello, everyone.&#10;Welcome back to the channel.&#10;Today we are talking about..."></textarea>
        <span class="field-hint">Each line becomes one shadowing sentence for learners to repeat.</span>
        <button class="btn" type="submit">Save lesson</button>
      </form>
    </div>
  `;
}

function handleAddLesson(e){
  e.preventDefault();
  const title = document.getElementById('title').value.trim();
  const rawUrl = document.getElementById('url').value.trim();
  const desc = document.getElementById('desc').value.trim();
  const transcript = document.getElementById('transcript').value.trim();
  const youtubeId = extractYouTubeId(rawUrl);
  if(!youtubeId){
    app.insertAdjacentHTML('afterbegin', toast("Couldn't read a video ID from that link. Paste a full YouTube URL or an 11-character video ID.", 'error'));
    return false;
  }
  const db = loadDB();
  const lesson = {id: uid(), title, youtubeId, description: desc, transcript, createdAt: Date.now()};
  db.lessons.push(lesson);
  saveDB(db);
  go('#/admin/lesson/'+lesson.id);
  return false;
}

function handleDeleteLesson(id){
  if(!confirm('Delete this lesson and all of its vocabulary and questions?')) return;
  const db = loadDB();
  db.lessons = db.lessons.filter(l=>l.id!==id);
  db.vocab = db.vocab.filter(v=>v.lessonId!==id);
  db.questions = db.questions.filter(q=>q.lessonId!==id);
  saveDB(db);
  renderAdmin();
}

/* ---------------------------- Admin: lesson workspace -------------------------- */

function renderAdminLessonWorkspace(lessonId){
  const db = loadDB();
  const lesson = db.lessons.find(l=>l.id===lessonId);
  if(!lesson){ app.innerHTML = toast('Lesson not found.', 'error'); return; }
  const vocab = db.vocab.filter(v=>v.lessonId===lessonId);
  const questions = db.questions.filter(q=>q.lessonId===lessonId);
  app.innerHTML = `
    <a href="#/admin" class="btn ghost small">&larr; Admin</a>
    <div class="section-title" style="margin-top:14px;">
      <h1>${escapeHtml(lesson.title)}</h1>
      <a class="btn secondary small" href="#/lesson/${lesson.id}" target="_blank">Preview as learner</a>
    </div>

    <h3>Details</h3>
    <div class="card">
      <form onsubmit="return handleUpdateLesson(event,'${lesson.id}')">
        <label>Title</label>
        <input id="e-title" type="text" value="${escapeHtml(lesson.title)}" required>
        <label>YouTube link or video ID</label>
        <input id="e-url" type="text" value="${lesson.youtubeId}" required>
        <label>Description</label>
        <input id="e-desc" type="text" value="${escapeHtml(lesson.description||'')}">
        <label>Transcript (one sentence per line)</label>
        <textarea id="e-transcript" rows="8">${escapeHtml(lesson.transcript||'')}</textarea>
        <button class="btn" type="submit">Save changes</button>
      </form>
    </div>

    <div class="divider"></div>
    <h3>Vocabulary (${vocab.length})</h3>
    <div class="card ai-assist-card">
      <p style="margin:0 0 12px;color:var(--text-dim);">✨ <strong style="color:var(--text);">Free AI assist</strong> — scans this lesson's transcript, picks out the standout vocabulary, and drafts a meaning + example sentence for each word.</p>
      <button class="btn secondary small" id="ai-vocab-btn" onclick="aiFillVocab('${lesson.id}')">🤖 Auto-detect vocabulary</button>
      <p id="ai-vocab-status" class="ai-status"></p>
    </div>
    <div class="grid cols-2">
      <div class="card">
        <p style="color:var(--text-dim);margin-top:0;">Import format: one word per line — <span class="badge">word | meaning | example</span></p>
        <form onsubmit="return handleImportVocab(event,'${lesson.id}')">
          <textarea id="vocab-import" rows="6" placeholder="fluent | able to speak smoothly and easily | She is fluent in English.
budget | a plan for spending money | We need to stick to our budget."></textarea>
          <button class="btn" type="submit">Import vocabulary</button>
        </form>
      </div>
      <div class="card">
        ${vocab.length===0 ? '<p style="color:var(--text-dim);">No vocabulary yet.</p>' : `
        <div class="table-scroll"><table>
          <thead><tr><th>Word</th><th>Meaning</th><th></th></tr></thead>
          <tbody>
            ${vocab.map(v=>`<tr><td>${escapeHtml(v.word)}</td><td>${escapeHtml(v.meaning)}</td><td><button class="btn danger small" onclick="handleDeleteVocab('${v.id}','${lesson.id}')">Delete</button></td></tr>`).join('')}
          </tbody>
        </table></div>`}
      </div>
    </div>

    <div class="divider"></div>
    <h3>Speaking questions (${questions.length})</h3>
    <div class="card ai-assist-card">
      <p style="margin:0 0 12px;color:var(--text-dim);">✨ <strong style="color:var(--text);">Free AI assist</strong> — reads this lesson's transcript and drafts a few simple-to-medium speaking questions based on it.</p>
      <button class="btn secondary small" id="ai-q-btn" onclick="aiFillQuestions('${lesson.id}')">🤖 Auto-generate questions</button>
      <p id="ai-q-status" class="ai-status"></p>
    </div>
    <div class="grid cols-2">
      <div class="card">
        <p style="color:var(--text-dim);margin-top:0;">One question per line.</p>
        <form onsubmit="return handleAddQuestions(event,'${lesson.id}')">
          <textarea id="question-import" rows="6" placeholder="What is the main topic of this video?
Do you agree with the speaker? Why or why not?"></textarea>
          <button class="btn" type="submit">Add questions</button>
        </form>
      </div>
      <div class="card">
        ${questions.length===0 ? '<p style="color:var(--text-dim);">No questions yet.</p>' : `
        <div class="table-scroll"><table>
          <tbody>
            ${questions.map(q=>`<tr><td>${escapeHtml(q.text)}</td><td><button class="btn danger small" onclick="handleDeleteQuestion('${q.id}','${lesson.id}')">Delete</button></td></tr>`).join('')}
          </tbody>
        </table></div>`}
      </div>
    </div>
  `;
}

function handleUpdateLesson(e, lessonId){
  e.preventDefault();
  const youtubeId = extractYouTubeId(document.getElementById('e-url').value.trim());
  if(!youtubeId){
    app.insertAdjacentHTML('afterbegin', toast("Couldn't read a video ID from that link.", 'error'));
    return false;
  }
  const db = loadDB();
  const lesson = db.lessons.find(l=>l.id===lessonId);
  lesson.title = document.getElementById('e-title').value.trim();
  lesson.youtubeId = youtubeId;
  lesson.description = document.getElementById('e-desc').value.trim();
  lesson.transcript = document.getElementById('e-transcript').value.trim();
  saveDB(db);
  renderAdminLessonWorkspace(lessonId);
  return false;
}

function handleImportVocab(e, lessonId){
  e.preventDefault();
  const raw = document.getElementById('vocab-import').value;
  const lines = raw.split('\n').map(l=>l.trim()).filter(Boolean);
  const db = loadDB();
  lines.forEach(line => {
    const [word, meaning, example] = line.split('|').map(s=>s?.trim());
    if(word && meaning) db.vocab.push({id: uid(), lessonId, word, meaning, example: example||''});
  });
  saveDB(db);
  renderAdminLessonWorkspace(lessonId);
  return false;
}

function handleDeleteVocab(id, lessonId){
  const db = loadDB();
  db.vocab = db.vocab.filter(v=>v.id!==id);
  saveDB(db);
  renderAdminLessonWorkspace(lessonId);
}

function handleAddQuestions(e, lessonId){
  e.preventDefault();
  const raw = document.getElementById('question-import').value;
  const lines = raw.split('\n').map(l=>l.trim()).filter(Boolean);
  const db = loadDB();
  lines.forEach(text => db.questions.push({id: uid(), lessonId, text}));
  saveDB(db);
  renderAdminLessonWorkspace(lessonId);
  return false;
}

function handleDeleteQuestion(id, lessonId){
  const db = loadDB();
  db.questions = db.questions.filter(q=>q.id!==id);
  saveDB(db);
  renderAdminLessonWorkspace(lessonId);
}
