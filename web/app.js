
"use strict";

/* ================================================
   ENGLISH BATTLE 6.0
   COMPLETE JAVASCRIPT
================================================ */

const app = document.getElementById("app");
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const SAVE_KEY = "english-battle-v1";
const IPA_KEY = "english-battle-ipa-v6";

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

let progress = {
  xp: 0,
  completed: 0,
  mistakes: {},
  ...readStorage(SAVE_KEY, {})
};

if (!progress.mistakes || typeof progress.mistakes !== "object") {
  progress.mistakes = {};
}

let ipaCache = readStorage(IPA_KEY, {});
let words = [];

let currentBook = 1;
let currentUnit = 0;
let mode = "learning";

let queue = [];
let questionIndex = 0;
let options = [];
let answered = false;
let correctCount = 0;
let earnedXP = 0;

let readingIndex = 0;
let readingQuestion = 0;
let readingCorrect = 0;
let readingAnswered = false;

let speakingIndex = 0;
let writingIndex = 0;

let recorder = null;
let micStream = null;
let recordingId = 0;
let recordedURL = null;
let audioPlayer = null;
let pronunciationId = 0;

/* =============== UTILITIES =============== */

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch (error) {
    console.warn(error);
  }
}

function saveIPA() {
  try {
    localStorage.setItem(IPA_KEY, JSON.stringify(ipaCache));
  } catch (error) {
    console.warn(error);
  }
}

function addXP(amount) {
  progress.xp += amount;
  earnedXP += amount;
  save();

  const xp = document.getElementById("totalXP");
  if (xp) xp.textContent = `🏆 ${progress.xp} XP`;
}

function button(text, action, secondary = false) {
  return `
    <button type="button"
      class="btn ${secondary ? "secondary" : ""}"
      onclick="${action}">
      ${text}
    </button>
  `;
}

function layout(content, theme = "") {
  if (!app) return;

  app.innerHTML = `
    <div class="eb-app ${theme}">
      <header class="eb-header">
        <button class="eb-logo" onclick="home()">
          ⚡ English Battle
        </button>
        <span class="eb-xp" id="totalXP">
          🏆 ${progress.xp} XP
        </span>
      </header>

      <main class="eb-main">
        ${content}
      </main>
    </div>
  `;
}

function backButton(action = "home()") {
  return `
    <button class="eb-back" onclick="${action}">
      <span>←</span> Bosh sahifa
    </button>
  `;
}

function toast(message, good = true) {
  document.querySelectorAll(".eb-toast").forEach(el => el.remove());

  const el = document.createElement("div");
  el.className = `eb-toast ${good ? "good" : "bad"}`;
  el.textContent = message;

  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

function progressHTML(index, total) {
  const percent = total ? Math.round(index / total * 100) : 0;

  return `
    <div class="eb-counter">
      <span>📍 ${Math.min(index + 1, total)} / ${total}</span>
      <span>⭐ ${earnedXP} XP</span>
    </div>

    <div class="eb-progress">
      <div style="width:${percent}%"></div>
    </div>
  `;
}

function normalizeWord(w, index) {
  const book = Number(w.book ?? w.book_number ?? 1);
  const unit = Number(w.unit ?? w.unit_number ?? 1);

  return {
    ...w,
    id: String(w.id ?? `${book}-${unit}-${index}`),
    book,
    unit,
    word: String(w.word ?? w.english ?? "").trim(),
    translation: String(
      w.translation ?? w.uzbek ?? w.meaning_uz ?? ""
    ).trim(),
    ipa: String(w.ipa ?? w.phonetic ?? "").trim(),
    pronunciation: String(
      w.pronunciation_uz ?? w.pronunciation ?? ""
    ).trim(),
    example: String(w.example ?? w.example_en ?? "").trim(),
    audio: String(w.audio ?? "")
  };
}

/* =============== AUDIO =============== */


/* =============== AUDIO =============== */

let audioRequestId = 0;

function stopSpeech() {
  audioRequestId++;

  if (audioPlayer) {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer = null;
  }

  if ("speechSynthesis" in window) {
    speechSynthesis.cancel();
  }
}

function validAudio(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

async function getOnlineAudio(text) {
  const key = String(text).trim().toLowerCase();

  if (!key) return "";

  try {
    const response = await fetch(
      "https://api.dictionaryapi.dev/api/v2/entries/en/" +
      encodeURIComponent(key)
    );

    if (!response.ok) return "";

    const data = await response.json();
    const phonetics = data[0]?.phonetics || [];

    for (const item of phonetics) {
      const url = validAudio(item.audio || "");

      if (url) return url;
    }

    return "";
  } catch (error) {
    console.error("Audio qidirishda xato:", error);
    return "";
  }
}

async function speak(text, slow = false) {
  stopSpeech();

  const requestId = audioRequestId;
  const key = String(text).trim().toLowerCase();

  if (!key) return;

  const word = words.find(
    w => String(w.word).toLowerCase() === key
  );

  let audioUrl = validAudio(
    word?.audio || ipaCache[key]?.audio || ""
  );

  if (!audioUrl) {
    audioUrl = await getOnlineAudio(key);
  }

  if (requestId !== audioRequestId) return;

  if (audioUrl) {
    try {
      audioPlayer = new Audio(audioUrl);
      audioPlayer.preload = "auto";
      audioPlayer.playbackRate = slow ? 0.75 : 1;

      await audioPlayer.play();
      return;
    } catch (error) {
      console.error("Audio ijro xatosi:", error);
      audioPlayer = null;
    }
  }

  if ("speechSynthesis" in window) {
    const speech = new SpeechSynthesisUtterance(
      String(text)
    );

    speech.lang = "en-US";
    speech.rate = slow ? 0.65 : 0.9;
    speech.pitch = 1;

    const voices = speechSynthesis.getVoices();

    speech.voice =
      voices.find(v => v.lang === "en-US") ||
      voices.find(v => v.lang.startsWith("en")) ||
      null;

    speechSynthesis.speak(speech);
    return;
  }

  toast(
    "Bu so'z uchun audio topilmadi.",
    false
  );
}

/* =============== IPA =============== */

/* =============== IPA =============== */

function ipaToUzbek(ipa) {
  let text = String(ipa || "")
    .replace(/[\/\[\]]/g, "")
    .replace(/ˈ/g, "-")
    .replace(/ˌ/g, "-");

  const rules = [
    ["tʃ", "CH"], ["dʒ", "J"],
    ["aɪ", "ay"], ["eɪ", "ey"],
    ["ɔɪ", "oy"], ["aʊ", "au"],
    ["əʊ", "ou"], ["oʊ", "ou"],
    ["ɪə", "ia"], ["eə", "ea"],
    ["iː", "iy"], ["uː", "uu"],
    ["ɑː", "a"], ["ɔː", "o"],
    ["ɜː", "yo"], ["ʃ", "sh"],
    ["ʒ", "j"], ["θ", "s"],
    ["ð", "z"], ["ŋ", "ng"],
    ["æ", "e"], ["ə", "a"],
    ["ʌ", "a"], ["ɪ", "i"],
    ["ʊ", "u"], ["ɛ", "e"],
    ["ɒ", "o"], ["ɔ", "o"],
    ["ɑ", "a"], ["ɜ", "yo"],
    ["ɹ", "r"], ["j", "y"],
    ["ː", ""]
  ];

  for (const [from, to] of rules) {
    text = text.split(from).join(to);
  }

  return text
    .replace(/CH/g, "ch")
    .replace(/J/g, "j")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "");
}

function approximateReading(word) {
  let text = String(word || "").toLowerCase();

  const rules = [
    [/tion\b/g, "shn"],
    [/sion\b/g, "jn"],
    [/ture\b/g, "cher"],
    [/ph/g, "f"],
    [/igh/g, "ay"],
    [/ee/g, "iy"],
    [/ea/g, "iy"],
    [/oo/g, "u"],
    [/qu/g, "kv"],
    [/ck/g, "k"],
    [/wr/g, "r"],
    [/kn/g, "n"],
    [/x/g, "ks"],
    [/c(?=[eiy])/g, "s"],
    [/c/g, "k"]
  ];

  for (const [pattern, replacement] of rules) {
    text = text.replace(pattern, replacement);
  }

  return text;
}

const ipaPending = new Map();

async function fetchIPA(word) {
  const key = String(word).toLowerCase().trim();

  if (ipaCache[key]?.ipa) return ipaCache[key];
  if (ipaPending.has(key)) return ipaPending.get(key);

  const task = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);

      let response;

      try {
        response = await fetch(
          "https://api.dictionaryapi.dev/api/v2/entries/en/" +
          encodeURIComponent(key),
          { signal: controller.signal }
        );
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) throw new Error("IPA unavailable");

      const data = await response.json();
      const entry = data[0] || {};
      const phonetics = entry.phonetics || [];

      const ipa =
        phonetics.find(p => p.text)?.text ||
        entry.phonetic ||
        "";

      const audio = validAudio(
        phonetics.find(p => p.audio)?.audio || ""
      );

      const result = {
        ipa,
        reading: ipaToUzbek(ipa),
        audio
      };

      if (ipa) {
        ipaCache[key] = result;
        saveIPA();
      }

      return result;
    } catch {
      return { ipa: "", reading: "", audio: "" };
    } finally {
      ipaPending.delete(key);
    }
  })();

  ipaPending.set(key, task);
  return task;
}

async function updatePronunciation() {
  const word = queue[questionIndex];
  const ipaEl = document.getElementById("wordIPA");
  const readEl = document.getElementById("wordReading");

  if (!word || !ipaEl || !readEl) return;

  const request = ++pronunciationId;
  const cached = ipaCache[word.word.toLowerCase()];

  if (cached) {
    word.ipa ||= cached.ipa;
    word.pronunciation ||= cached.reading;
    word.audio ||= cached.audio;
  }

  function display() {
    ipaEl.textContent = word.ipa
      ? `🔤 IPA: ${word.ipa}`
      : "🔊 Talaffuzni tinglang";

    const reading =
      word.pronunciation ||
      ipaToUzbek(word.ipa) ||
      approximateReading(word.word);

    readEl.textContent =
      `📖 Taxminiy o'qilishi: ${reading}`;
  }

  if (word.ipa && word.pronunciation) {
    display();
    return;
  }

  ipaEl.textContent = "🔄 IPA aniqlanmoqda...";
  readEl.textContent = "🔄 O'qilishi tayyorlanmoqda...";

  const result = await fetchIPA(word.word);

  if (
    request !== pronunciationId ||
    queue[questionIndex] !== word ||
    document.getElementById("wordIPA") !== ipaEl
  ) return;

  word.ipa ||= result.ipa;
  word.pronunciation ||= result.reading;
  word.audio ||= result.audio;

  display();
}

/* =============== SCENES =============== */

const scenes = [
  { name: "Tog'lar", icon: "🏔️", sky: "#178ce9", land: "#3c83c4", type: 0 },
  { name: "Dengiz", icon: "🏝️", sky: "#00b7ee", land: "#09c7d8", type: 1 },
  { name: "O'rmon", icon: "🌲", sky: "#61d2a8", land: "#15945d", type: 2 },
  { name: "Bahor", icon: "🌸", sky: "#ff94cc", land: "#6bc76d", type: 3 },
  { name: "Sahro", icon: "🏜️", sky: "#ffa43d", land: "#d99b5a", type: 4 },
  { name: "Tun", icon: "🌙", sky: "#253a8d", land: "#42538b", type: 5 }
];

function sceneSVG(scene) {
  const stars = Array.from({ length: 25 }, (_, i) => `
    <circle cx="${(i * 193) % 1200}"
      cy="${(i * 79) % 300}"
      r="${2 + i % 3}" fill="white"/>
  `).join("");

  const clouds = `
    <g fill="white" opacity=".85">
      <ellipse cx="160" cy="110" rx="115" ry="36"/>
      <ellipse cx="230" cy="92" rx="75" ry="43"/>
      <ellipse cx="850" cy="150" rx="125" ry="30"/>
    </g>
  `;

  let land = "";

  if (scene.type === 0 || scene.type === 5) {
    land = `
      <path d="M0 500L280 170L560 500Z" fill="#8db3d5"/>
      <path d="M320 500L690 100L1050 500Z" fill="${scene.land}"/>
      <path d="M760 500L1030 200L1200 500Z" fill="#7396c3"/>
      <path d="M615 182L690 100L765 182L715 158L690 132L660 165Z" fill="white"/>
      <path d="M0 500Q350 430 700 490T1200 440V700H0Z" fill="#2ca8a5"/>
    `;
  } else if (scene.type === 1) {
    land = `
      <rect y="330" width="1200" height="370" fill="#08b8d9"/>
      <path d="M0 460Q300 420 600 460T1200 420"
        stroke="#d3ffff" stroke-width="13" fill="none"/>
      <path d="M0 550Q400 460 800 540T1200 500V700H0Z"
        fill="#f2d18a"/>
      <path d="M180 600Q185 380 250 225"
        stroke="#9d683d" stroke-width="28" fill="none"/>
      <g stroke="#06874d" stroke-width="29" fill="none"
        stroke-linecap="round">
        <path d="M250 225Q120 130 40 220"/>
        <path d="M250 225Q250 100 365 145"/>
        <path d="M250 225Q370 160 430 255"/>
        <path d="M250 225Q110 260 100 355"/>
      </g>
    `;
  } else if (scene.type === 2) {
    land = `
      <path d="M0 470Q350 320 700 440T1200 390V700H0Z"
        fill="#64c777"/>
      ${[90,260,450,680,900,1100].map((x, i) => `
        <rect x="${x}" y="285" width="30" height="350"
          fill="#82573b"/>
        <circle cx="${x+15}" cy="${230+i%3*20}" r="100"
          fill="#087d50"/>
        <circle cx="${x-25}" cy="${260+i%3*20}" r="58"
          fill="#38b66b"/>
      `).join("")}
    `;
  } else if (scene.type === 3) {
    land = `
      <path d="M0 490Q350 360 700 470T1200 400V700H0Z"
        fill="#82d17d"/>
      <path d="M0 590Q400 490 800 580T1200 530V700H0Z"
        fill="#3bb66e"/>
      <path d="M260 560L260 190M260 320L140 230M260 280L400 180"
        stroke="#855444" stroke-width="26" fill="none"/>
      ${[[260,175],[175,210],[135,230],[390,180],[340,145]].map(([x,y]) => `
        <circle cx="${x}" cy="${y}" r="65" fill="#ef75b4"/>
        <circle cx="${x+20}" cy="${y-18}" r="32" fill="#ffc4e0"/>
      `).join("")}
    `;
  } else {
    land = `
      <path d="M0 480Q280 280 590 450T1200 350V700H0Z"
        fill="#f2b56e"/>
      <path d="M0 570Q360 390 730 530T1200 460V700H0Z"
        fill="#d28b4c"/>
      <path d="M940 560V350M940 440Q850 440 850 365M940 470Q1030 460 1030 390"
        stroke="#1d9a68" stroke-width="30"
        stroke-linecap="round" fill="none"/>
    `;
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1200 700">
      <defs>
        <linearGradient id="sky" x2="0" y2="1">
          <stop stop-color="${scene.sky}"/>
          <stop offset="1" stop-color="#e3f7ff"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="700" fill="url(#sky)"/>
      <circle cx="980" cy="115" r="66" fill="#fff3ae"/>
      ${scene.type === 5 ? stars : clouds}
      ${land}
    </svg>
  `;

  return "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(svg);
}

function applyScene() {
  const scene = scenes[questionIndex % scenes.length];
  const card = document.querySelector(".eb-scene");

  if (!card) return;

  card.style.backgroundImage = `url("${sceneSVG(scene)}")`;

  const label = document.getElementById("sceneLabel");
  if (label) label.textContent = `${scene.icon} ${scene.name}`;
}

/* =============== HOME =============== */

function home() {
  stopSpeech();
  recordingId++;
  stopRecording();

  layout(`
    <section class="eb-panel">
      <div class="eb-hero">
        <h1>🚀 English Battle</h1>
        <p>Learn • Practise • Win</p>
        <div class="eb-hero-badges">
          <span>📚 6 Books</span>
          <span>🧠 7 Modes</span>
          <span>🏆 XP System</span>
        </div>
      </div>

      <h2>📚 Essential English Words</h2>
      <p class="eb-muted">
        Kitobni tanlang va ingliz tilini o'rganishni boshlang.
      </p>

      <div class="eb-book-grid">
        ${Array.from({ length: 6 }, (_, i) => {
          const n = i + 1;
          const count = words.filter(w => w.book === n).length;

          return `
            <button class="eb-book eb-book-${n}"
              onclick="openBook(${n})">

              <div class="eb-book-image">
                <img src="assets/book-${n}.jpg"
                  alt="Book ${n}"
                  onerror="
                    if(!this.dataset.ext){
                      this.dataset.ext='png';
                      this.src='assets/book-${n}.png';
                    }else if(this.dataset.ext==='png'){
                      this.dataset.ext='webp';
                      this.src='assets/book-${n}.webp';
                    }else{
                      this.style.display='none';
                    }
                  ">
                <span class="eb-book-fallback">📘</span>
              </div>

              <strong>Book ${n}</strong>
              <small>${count} ta so'z</small>
            </button>
          `;
        }).join("")}
      </div>
    </section>

    <section class="eb-panel">
      <h2>🏆 Mening natijalarim</h2>

      <div class="eb-stats">
        <div>
          <strong>${progress.xp}</strong>
          <small>Jami XP</small>
        </div>
        <div>
          <strong>${progress.completed}</strong>
          <small>Mashqlar</small>
        </div>
        <div>
          <strong>${Object.keys(progress.mistakes).length}</strong>
          <small>Xatolar</small>
        </div>
      </div>
    </section>
  `, "home-theme");
}

/* =============== BOOK MENU =============== */

function openBook(book) {
  stopSpeech();
  recordingId++;
  stopRecording();

  currentBook = book;

  const units = [...new Set(
    words.filter(w => w.book === book).map(w => w.unit)
  )].sort((a, b) => a - b);

  layout(`
    ${backButton()}

    <section class="eb-panel">
      <h2>📖 Book ${book}</h2>

      <div class="eb-form-row">
        <label for="unitSelect">📚 Unit tanlang</label>
        <select id="unitSelect">
          <option value="0">Barcha unitlar</option>
          ${units.map(unit => `
            <option value="${unit}">
              Unit ${unit}
            </option>
          `).join("")}
        </select>
      </div>

      <div class="eb-form-row">
        <label for="countSelect">🧠 Savollar soni</label>
        <select id="countSelect">
          <option value="20">20 ta</option>
          <option value="50">50 ta</option>
          <option value="0">Barchasi</option>
        </select>
      </div>
    </section>

    <section class="eb-panel">
      <h2>🎮 Mashq turini tanlang</h2>

      <div class="eb-mode-grid">
        ${[
          ["learning", "📘", "Word Learning", "So'z, IPA, tarjima va mini test"],
          ["vocabulary", "⚡", "Vocabulary", "4 variantli test"],
          ["listening", "🎧", "Listening", "Eshitib yozish"],
          ["reading", "📖", "Reading", "A2, B1, B2, C1"],
          ["speaking", "🎙️", "Speaking", "Ovozli mashq"],
          ["writing", "✍️", "Writing", "Email va essay"],
          ["review", "🔁", "Review", "Xatolarni takrorlash"]
        ].map(([id, icon, title, description]) => `
          <button class="eb-mode eb-mode-${id}"
            onclick="startMode('${id}')">
            <span class="eb-mode-icon">${icon}</span>
            <strong>${title}</strong>
            <small>${description}</small>
          </button>
        `).join("")}
      </div>
    </section>
  `, "book-theme");
}

function selectedWords() {
  currentUnit = Number(
    document.getElementById("unitSelect")?.value ?? 0
  );

  const count = Number(
    document.getElementById("countSelect")?.value ?? 20
  );

  let result = shuffle(words.filter(w =>
    w.book === currentBook &&
    (!currentUnit || w.unit === currentUnit) &&
    w.word &&
    w.translation
  ));

  if (count > 0) result = result.slice(0, count);

  return result;
}

function startMode(selectedMode) {
  mode = selectedMode;

  if (mode === "reading") return startReading();
  if (mode === "speaking") return startSpeaking();
  if (mode === "writing") return startWriting();

  queue = selectedWords();

  if (mode === "review") {
    queue = queue.filter(w => progress.mistakes[w.id]);
  }

  if (!queue.length) {
    alert("Bu bo'lim uchun so'zlar topilmadi.");
    return;
  }

  questionIndex = 0;
  correctCount = 0;
  earnedXP = 0;

  renderQuestion();
}

function createOptions(word) {
  const distractors = shuffle(
    [...new Set(
      words
        .filter(w => w.id !== word.id)
        .map(w => w.translation)
        .filter(t => t && t !== word.translation)
    )]
  ).slice(0, 3);

  return shuffle([word.translation, ...distractors]);
}

/* =============== WORD LEARNING =============== */

function renderQuestion() {
  if (questionIndex >= queue.length) {
    finishQuiz();
    return;
  }

  answered = false;
  stopSpeech();

  if (mode === "listening") {
    renderListening();
    return;
  }

  const word = queue[questionIndex];
  const learning = mode === "learning";
  options = createOptions(word);

  const title = learning
    ? "📘 Word Learning"
    : mode === "review"
      ? "🔁 Review Battle"
      : "⚡ Vocabulary Battle";

  layout(`
    ${backButton(`openBook(${currentBook})`)}

    <section class="eb-panel eb-animate">
      <h2>${title}</h2>

      ${progressHTML(questionIndex, queue.length)}

      <div class="eb-word-card ${learning ? "eb-scene" : "eb-vocab"}">
        ${learning ? `
          <span class="eb-scene-label" id="sceneLabel"></span>
        ` : ""}

        <span class="eb-word-label">ENGLISH WORD</span>

        <h1 class="eb-word">${esc(word.word)}</h1>

        <div class="eb-ipa" id="wordIPA">
          ${esc(word.ipa || "IPA aniqlanmoqda...")}
        </div>

        <div class="eb-reading" id="wordReading">
          O'qilishi tayyorlanmoqda...
        </div>

        <div class="eb-audio-buttons">
          ${button("🔊 Tinglash", "speak(queue[questionIndex].word)")}
          ${button("🐢 Sekinroq", "speak(queue[questionIndex].word,true)", true)}
        </div>

        ${learning ? `
          <div class="eb-translation">
            <small>🇺🇿 TARJIMASI</small>
            <strong>${esc(word.translation)}</strong>
          </div>
        ` : ""}
      </div>

      <div class="eb-test">
        <h2>🧠 Mini test</h2>

        <div class="eb-choices">
          ${options.map((option, i) => `
            <button class="eb-choice"
              onclick="checkAnswer(${i})">
              <span class="eb-letter">${"ABCD"[i]}</span>
              <span>${esc(option)}</span>
            </button>
          `).join("")}
        </div>

        <div id="feedback"></div>

        <button id="nextButton"
          class="eb-next"
          style="display:none"
          onclick="nextQuestion()">
          Keyingi savol →
        </button>
      </div>
    </section>
  `, learning ? "learning-theme" : "vocabulary-theme");

  if (learning) applyScene();
  updatePronunciation();
}

function checkAnswer(index) {
  if (answered) return;

  answered = true;

  const word = queue[questionIndex];
  const success = options[index] === word.translation;

  document.querySelectorAll(".eb-choice").forEach((el, i) => {
    el.disabled = true;

    if (options[i] === word.translation) {
      el.classList.add("correct");
    } else if (i === index) {
      el.classList.add("wrong");
    }
  });

  if (success) {
    correctCount++;
    addXP(mode === "learning" ? 5 : 10);
    delete progress.mistakes[word.id];
    toast("🎉 To'g'ri javob!");
  } else {
    progress.mistakes[word.id] = true;
    toast("💡 Javobni o'rganing", false);
  }

  save();

  document.getElementById("feedback").innerHTML = `
    <div class="eb-feedback ${success ? "good" : "bad"}">
      <h3>${success ? "✅ To'g'ri!" : "❌ Noto'g'ri"}</h3>
      <p>
        <strong>${esc(word.word)}</strong>
        — ${esc(word.translation)}
      </p>
      ${word.example ? `<p>Example: ${esc(word.example)}</p>` : ""}
    </div>
  `;

  document.getElementById("nextButton").style.display = "block";
}

function nextQuestion() {
  if (!answered) return;
  questionIndex++;
  renderQuestion();
}

/* =============== LISTENING =============== */

function renderListening() {
  if (questionIndex >= queue.length) {
    finishQuiz();
    return;
  }

  answered = false;

  layout(`
    ${backButton(`openBook(${currentBook})`)}

    <section class="eb-panel eb-animate">
      <h2>🎧 Listening Studio</h2>

      ${progressHTML(questionIndex, queue.length)}

      <div class="eb-listening-hero">
        <div class="eb-wave">
          ${Array.from({ length: 17 }, (_, i) => `
            <i style="animation-delay:${i * .06}s"></i>
          `).join("")}
        </div>

        <button class="eb-play"
          onclick="speak(queue[questionIndex].word)">
          ▶
        </button>

        <h3>Listen carefully</h3>
        <p>Inglizcha so'zni tinglang</p>

        ${button("🐢 Sekin tinglash", "speak(queue[questionIndex].word,true)", true)}
      </div>

      <h3>✍️ Qaysi so'zni eshitdingiz?</h3>

      <input id="listeningInput"
        class="eb-input"
        autocomplete="off"
        placeholder="English word..."
        onkeydown="if(event.key==='Enter')checkListening()">

      ${button("Tekshirish", "checkListening()")}

      <div id="feedback"></div>

      <button id="nextButton" class="eb-next"
        style="display:none"
        onclick="nextQuestion()">
        Keyingi audio →
      </button>
    </section>
  `, "listening-theme");
}

function checkListening() {
  if (answered) return;

  const input = document.getElementById("listeningInput");
  const answer = input.value.trim().toLowerCase();

  if (!answer) {
    toast("Avval javob yozing", false);
    return;
  }

  answered = true;
  input.disabled = true;

  const word = queue[questionIndex];
  const success = answer === word.word.toLowerCase();

  if (success) {
    correctCount++;
    addXP(10);
    delete progress.mistakes[word.id];
  } else {
    progress.mistakes[word.id] = true;
  }

  save();

  document.getElementById("feedback").innerHTML = `
    <div class="eb-feedback ${success ? "good" : "bad"}">
      <h3>${success ? "✅ To'g'ri!" : "❌ Noto'g'ri"}</h3>
      <p>${esc(word.word)} — ${esc(word.translation)}</p>
    </div>
  `;

  document.getElementById("nextButton").style.display = "block";
}

/* =============== READING =============== */

const readingPassages = [
  {
    level: "A2",
    title: "A Student's Day",
    description: "Daily life and school",
    text: `Emma gets up at seven o'clock every morning.
She has breakfast with her family and walks to school.
Her favourite subject is English because she enjoys
learning new words.

After school, she plays basketball with her friends.
In the evening, she reads a book and does her homework.
She usually goes to bed at ten o'clock.`,
    questions: [
      {
        q: "When does Emma get up?",
        a: ["At seven", "At nine", "At noon", "At midnight"],
        correct: 0,
        explanation: "Emma gets up at seven o'clock."
      },
      {
        q: "How does Emma go to school?",
        a: ["By car", "On foot", "By bus", "By train"],
        correct: 1,
        explanation: "She walks to school."
      },
      {
        q: "What is Emma's favourite subject?",
        a: ["Maths", "History", "English", "Science"],
        correct: 2,
        explanation: "Her favourite subject is English."
      },
      {
        q: "What does Emma play after school?",
        a: ["Tennis", "Chess", "Football", "Basketball"],
        correct: 3,
        explanation: "She plays basketball."
      }
    ]
  },
  {
    level: "B1",
    title: "Technology and Education",
    description: "Digital learning",
    text: `Technology has changed the way people learn.
Today, students can use online dictionaries,
educational videos and mobile applications
to improve their knowledge.

These tools allow learners to practise independently
and study at their own pace. Language learners can
listen to podcasts and communicate with people
from different countries.

However, spending too much time online can reduce
concentration. Teachers recommend combining digital
learning with traditional reading and classroom
discussions.

A balanced approach can help students develop
both digital and communication skills.`,
    questions: [
      {
        q: "What has technology changed?",
        a: ["The way people learn", "The weather", "Food prices", "The length of the day"],
        correct: 0,
        explanation: "Technology has changed the way people learn."
      },
      {
        q: "Which tool is mentioned?",
        a: ["Cars", "Online dictionaries", "Bicycles", "Televisions only"],
        correct: 1,
        explanation: "Online dictionaries are mentioned."
      },
      {
        q: "What can excessive online activity reduce?",
        a: ["Age", "Height", "Concentration", "Distance"],
        correct: 2,
        explanation: "Too much time online may reduce concentration."
      },
      {
        q: "What do teachers recommend?",
        a: ["Avoiding technology", "Only mobile apps", "No discussions", "Combining digital and traditional learning"],
        correct: 3,
        explanation: "A balanced approach is recommended."
      }
    ]
  },
  {
    level: "B2",
    title: "The Value of Lifelong Learning",
    description: "Education and personal development",
    text: `In a rapidly changing world, lifelong learning
is becoming increasingly important. New technologies
transform workplaces and create demand for different
skills. As a result, people who continue developing
their knowledge are often better prepared for change.

Nevertheless, motivation alone is not enough.
Successful learners set realistic goals, evaluate
reliable resources and apply their knowledge to
practical challenges.

One important advantage of continuous education
is adaptability. Employees who regularly improve
their abilities may find it easier to respond
to unfamiliar situations and professional demands.

However, lifelong learning also requires time
management and persistence. Individuals must
balance their educational ambitions with work,
family responsibilities and other commitments.

Ultimately, the ability to learn independently
can support professional success and personal growth.`,
    questions: [
      {
        q: "Why is lifelong learning important?",
        a: ["The world changes rapidly", "Schools disappear", "Jobs are unnecessary", "Books are unavailable"],
        correct: 0,
        explanation: "Rapid change creates demand for new skills."
      },
      {
        q: "What transforms workplaces?",
        a: ["Holidays", "New technologies", "Sports", "Weather"],
        correct: 1,
        explanation: "New technologies transform workplaces."
      },
      {
        q: "Who may adapt more effectively?",
        a: ["Only managers", "Only students", "Continuous learners", "People avoiding change"],
        correct: 2,
        explanation: "Continuous learning supports adaptability."
      },
      {
        q: "What do successful learners do?",
        a: ["Avoid challenges", "Ignore sources", "Depend only on motivation", "Set realistic goals"],
        correct: 3,
        explanation: "Successful learners set realistic goals."
      },
      {
        q: "What challenge is discussed?",
        a: ["Balancing learning with responsibilities", "Finding entertainment", "Avoiding technology", "Reducing communication"],
        correct: 0,
        explanation: "Learning requires balancing commitments."
      }
    ]
  },
  {
    level: "C1",
    title: "The Paradox of Technological Progress",
    description: "Advanced critical thinking",
    text: `Technological innovation is frequently portrayed
as an unquestionable indicator of human progress.
From artificial intelligence to automated transport,
new developments promise greater efficiency,
improved productivity and unprecedented access
to information. Yet the relationship between
technological advancement and social well-being
is considerably more complex than it initially appears.

Although automation can eliminate repetitive tasks,
it may simultaneously undermine employment security
in industries that depend heavily on routine labour.
The resulting disruption does not necessarily imply
that technological progress should be resisted.
Rather, it highlights the importance of educational
systems and public policies capable of helping
workers adapt to changing economic conditions.

Another significant concern involves the growing
influence of digital platforms over the information
people encounter. Algorithms are often designed
to maximise engagement, but material that attracts
attention is not always accurate, balanced or
socially beneficial. Consequently, access to
an enormous quantity of information does not
automatically translate into a better-informed public.

Nevertheless, dismissing technological innovation
would overlook its substantial contributions to
medicine, scientific research and global communication.
The central challenge is therefore not whether
societies should embrace new technologies,
but how they can ensure that their benefits
are distributed fairly and their potential
consequences are carefully evaluated.

Ultimately, meaningful progress requires more
than technical sophistication. It depends on
ethical judgement, institutional responsibility
and the willingness to reconsider assumptions
that might otherwise remain unquestioned.`,
    questions: [
      {
        q: "What is the author's central argument?",
        a: [
          "Technological progress requires social evaluation",
          "All innovation should stop",
          "Automation never affects jobs",
          "Platforms always improve understanding"
        ],
        correct: 0,
        explanation: "Progress must be considered alongside its consequences."
      },
      {
        q: "What does the author imply about automation?",
        a: [
          "It cannot increase productivity",
          "It creates benefits but may disrupt employment",
          "It affects only researchers",
          "It makes education unnecessary"
        ],
        correct: 1,
        explanation: "Automation offers benefits and employment risks."
      },
      {
        q: "Why might digital platforms fail to improve public understanding?",
        a: [
          "They contain no useful information",
          "Nobody can access them",
          "Engagement may be prioritised over accuracy",
          "They prevent communication"
        ],
        correct: 2,
        explanation: "Popular content is not necessarily accurate."
      },
      {
        q: "What role should education play?",
        a: [
          "Avoiding technology",
          "Teaching only traditional skills",
          "Ignoring economic change",
          "Helping people adapt to technological change"
        ],
        correct: 3,
        explanation: "Education can prepare workers for change."
      },
      {
        q: "What does 'distributed fairly' mean?",
        a: [
          "Benefits should reach different groups",
          "Everyone must own identical devices",
          "Companies must stop innovation",
          "Only scientists may use technology"
        ],
        correct: 0,
        explanation: "The phrase concerns equitable benefits."
      },
      {
        q: "Which description best matches the author's tone?",
        a: [
          "Entirely dismissive",
          "Balanced and analytical",
          "Uncritically enthusiastic",
          "Humorous and informal"
        ],
        correct: 1,
        explanation: "The author considers both advantages and risks."
      }
    ]
  }
];

function startReading() {
  layout(`
    ${backButton(`openBook(${currentBook})`)}

    <section class="eb-panel">
      <h2>📚 Reading Library</h2>
      <p class="eb-muted">Darajangizni tanlang.</p>

      <div class="eb-reading-grid">
        ${readingPassages.map((passage, i) => `
          <button class="eb-reading-level eb-level-${passage.level.toLowerCase()}"
            onclick="openReading(${i})">
            <span class="eb-level-badge">${passage.level}</span>
            <strong>${esc(passage.title)}</strong>
            <small>${esc(passage.description)}</small>
            <span>📝 ${passage.questions.length} ta savol →</span>
          </button>
        `).join("")}
      </div>
    </section>
  `, "reading-theme");
}

function openReading(index) {
  readingIndex = index;
  readingQuestion = 0;
  readingCorrect = 0;
  readingAnswered = false;
  renderReading();
}

function renderReading() {
  const passage = readingPassages[readingIndex];

  if (!passage) return startReading();
  if (readingQuestion >= passage.questions.length) {
    finishReading();
    return;
  }

  readingAnswered = false;
  const question = passage.questions[readingQuestion];
  const percent = readingQuestion / passage.questions.length * 100;

  layout(`
    ${backButton("startReading()")}

    <section class="eb-panel eb-animate">
      <div class="eb-reading-top">
        <span class="eb-level-badge">${passage.level}</span>
        <span>⭐ ${readingCorrect * 10} XP</span>
      </div>

      <h2>📖 ${esc(passage.title)}</h2>

      <div class="eb-counter">
        Savol ${readingQuestion + 1} / ${passage.questions.length}
      </div>

      <div class="eb-progress">
        <div style="width:${percent}%"></div>
      </div>

      <article class="eb-reading-paper">
        <small>ENGLISH READING · ${passage.level}</small>
        <p>${esc(passage.text)}</p>
      </article>

      <div class="eb-test">
        <h2>🧠 ${esc(question.q)}</h2>

        <div class="eb-choices">
          ${question.a.map((answer, i) => `
            <button class="eb-choice reading-choice"
              onclick="checkReading(${i})">
              <span class="eb-letter">${"ABCD"[i]}</span>
              <span>${esc(answer)}</span>
            </button>
          `).join("")}
        </div>
      </div>

      <div id="readingFeedback"></div>

      <button id="readingNext"
        class="eb-next"
        style="display:none"
        onclick="nextReading()">
        ${readingQuestion === passage.questions.length - 1
          ? "🏆 Natijani ko'rish"
          : "Keyingi savol →"}
      </button>
    </section>
  `, "reading-theme");
}

function checkReading(index) {
  if (readingAnswered) return;
  readingAnswered = true;

  const question = readingPassages[readingIndex]
    .questions[readingQuestion];

  const success = index === question.correct;

  if (success) {
    readingCorrect++;
    toast("🎉 To'g'ri javob!");
  } else {
    toast("Javobni tahlil qiling", false);
  }

  document.querySelectorAll(".reading-choice").forEach((el, i) => {
    el.disabled = true;

    if (i === question.correct) {
      el.classList.add("correct");
    } else if (i === index) {
      el.classList.add("wrong");
    }
  });

  document.getElementById("readingFeedback").innerHTML = `
    <div class="eb-feedback ${success ? "good" : "bad"}">
      <h3>${success ? "✅ To'g'ri!" : "❌ Noto'g'ri"}</h3>
      <p><b>Correct answer:</b>
        ${esc(question.a[question.correct])}</p>
      <p><b>Explanation:</b>
        ${esc(question.explanation)}</p>
    </div>
  `;

  document.getElementById("readingNext").style.display = "block";
}

function nextReading() {
  if (!readingAnswered) return;
  readingQuestion++;
  renderReading();
}

function finishReading() {
  const passage = readingPassages[readingIndex];
  const total = passage.questions.length;
  const percentage = Math.round(readingCorrect / total * 100);
  const xp = readingCorrect * 10;

  progress.xp += xp;
  progress.completed++;
  save();

  layout(`
    <section class="eb-panel eb-result">
      <div class="eb-trophy">🏆</div>
      <h2>${passage.level} Reading yakunlandi!</h2>
      <div class="eb-result-score">${readingCorrect} / ${total}</div>
      <h3>📊 ${percentage}%</h3>
      <h3>⭐ +${xp} XP</h3>

      ${button("🔄 Qayta ishlash", `openReading(${readingIndex})`)}
      ${button("📚 Boshqa daraja", "startReading()")}
      ${button("🏠 Bosh sahifa", "home()", true)}
    </section>
  `, "result-theme");
}

/* =============== SPEAKING =============== */

const speakingTopics = [
  {
    title: "Free Time",
    question: "What do you usually do in your free time?",
    sample: "In my free time, I enjoy reading books and playing football with my friends."
  },
  {
    title: "Technology",
    question: "How does technology help students?",
    sample: "Technology helps students find information and develop new skills."
  },
  {
    title: "Education",
    question: "Why is learning English important?",
    sample: "English helps people communicate internationally and access educational opportunities."
  },
  {
    title: "Sports",
    question: "What is your favourite sport?",
    sample: "My favourite sport is football because it encourages teamwork."
  },
  {
    title: "Hometown",
    question: "Can you describe your hometown?",
    sample: "My hometown is a beautiful place with friendly people and interesting traditions."
  },
  {
    title: "Environment",
    question: "What can people do to protect the environment?",
    sample: "People can recycle, save energy and use public transport."
  }
];

function startSpeaking() {
  speakingIndex = 0;
  renderSpeaking();
}

function renderSpeaking() {
  const topic = speakingTopics[speakingIndex];

  layout(`
    ${backButton(`openBook(${currentBook})`)}

    <section class="eb-panel eb-animate">
      <h2>🎙 Speaking Studio</h2>
      <p class="eb-muted">
        Mavzu ${speakingIndex + 1} / ${speakingTopics.length}
      </p>

      <div class="eb-speaking-hero">
        <div class="eb-microphone">🎙️</div>
        <h2>${esc(topic.title)}</h2>
        <p>${esc(topic.question)}</p>
      </div>

      ${button("🔊 Savolni eshitish", "speak(speakingTopics[speakingIndex].question)")}

      <div class="eb-record-actions">
        ${button("🔴 Yozishni boshlash", "startRecording()")}
        ${button("⏹ To'xtatish", "stopRecording()", true)}
      </div>

      <p id="recordStatus" class="eb-muted">Mikrofon tayyor</p>
      <div id="recordPlayback"></div>

      ${button("📖 Namunaviy javob", "showSpeakingSample()", true)}

      <div id="speakingSample"></div>

      ${button("Keyingi mavzu →", "nextSpeaking()")}
    </section>
  `, "speaking-theme");
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    toast("Mikrofon uchun localhost yoki HTTPS kerak", false);
    return;
  }

  if (recorder?.state === "recording") return;

  const id = ++recordingId;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    if (id !== recordingId) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }

    micStream = stream;
    const chunks = [];

    recorder = new MediaRecorder(stream);

    recorder.ondataavailable = event => {
      if (event.data.size) chunks.push(event.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, {
        type: recorder.mimeType || "audio/webm"
      });

      if (recordedURL) URL.revokeObjectURL(recordedURL);
      recordedURL = URL.createObjectURL(blob);

      if (id === recordingId) {
        const holder = document.getElementById("recordPlayback");

        if (holder) {
          const audio = document.createElement("audio");
          audio.controls = true;
          audio.src = recordedURL;
          holder.replaceChildren(audio);
        }
      }

      stream.getTracks().forEach(t => t.stop());

      if (micStream === stream) micStream = null;
    };

    recorder.start();

    const status = document.getElementById("recordStatus");
    if (status) status.textContent = "🔴 Ovoz yozilmoqda...";
  } catch (error) {
    toast("Mikrofon ochilmadi: " + error.message, false);
  }
}

function stopRecording() {
  if (recorder?.state === "recording") {
    recorder.stop();

    const status = document.getElementById("recordStatus");
    if (status) status.textContent = "✅ Yozuv tayyor";
  }

  if (micStream && recorder?.state !== "recording") {
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }
}

function showSpeakingSample() {
  const element = document.getElementById("speakingSample");
  if (!element) return;

  element.innerHTML = `
    <div class="eb-feedback good">
      <h3>Namunaviy javob</h3>
      <p>${esc(speakingTopics[speakingIndex].sample)}</p>
    </div>
  `;
}

function nextSpeaking() {
  recordingId++;
  stopRecording();

  speakingIndex = (speakingIndex + 1) % speakingTopics.length;
  renderSpeaking();
}

/* =============== WRITING =============== */

const writingTopics = [
  {
    title: "Informal Email",
    task: "Write an email to your friend about your weekend.",
    sample: `Hi Alex,

I hope you are well. Last weekend, I visited my relatives and played football with my friends. We had a great time together.

Best wishes,
Ali`
  },
  {
    title: "Formal Email",
    task: "Write to a manager suggesting two improvements.",
    sample: `Dear Manager,

I am writing to suggest improvements to your services. Firstly, I recommend updating the equipment. Secondly, additional activities would benefit everyone.

Yours faithfully,
Ali`
  },
  {
    title: "Opinion Essay",
    task: "Do you think technology improves education?",
    sample: `Technology plays an important role in education. In my opinion, it makes learning more accessible. Students can use online resources to improve their knowledge. However, they should manage their screen time carefully.`
  },
  {
    title: "Discussion Essay",
    task: "Discuss the advantages and disadvantages of social media.",
    sample: `Social media has both advantages and disadvantages. On the one hand, it makes communication easier. On the other hand, excessive use may reduce concentration. Therefore, people should use social media responsibly.`
  },
  {
    title: "Online Learning",
    task: "Discuss the advantages and disadvantages of studying online.",
    sample: `Online learning offers flexibility and access to educational resources. However, it may create distractions and reduce face-to-face communication. A balanced approach can help students achieve better results.`
  }
];

function startWriting() {
  writingIndex = 0;
  renderWriting();
}

function renderWriting() {
  const topic = writingTopics[writingIndex];

  layout(`
    ${backButton(`openBook(${currentBook})`)}

    <section class="eb-panel eb-animate">
      <h2>✍️ Writing Lab</h2>

      <p class="eb-muted">
        Topshiriq ${writingIndex + 1} / ${writingTopics.length}
      </p>

      <div class="eb-writing-paper">
        <h3>${esc(topic.title)}</h3>
        <p>${esc(topic.task)}</p>

        <textarea id="writingText"
          placeholder="Write your answer here..."
          oninput="updateWordCount()"></textarea>

        <div class="eb-writing-counter">
          <span id="wordCount">0 words</span>
          <span>English Battle Editor</span>
        </div>
      </div>

      ${button("📝 Tekshirish", "checkWriting()")}
      ${button("📖 Namunaviy javob", "showWritingSample()", true)}

      <div id="writingFeedback"></div>
      <div id="writingSample"></div>

      ${button("Keyingi topshiriq →", "nextWriting()")}
    </section>
  `, "writing-theme");
}

function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function updateWordCount() {
  const input = document.getElementById("writingText");
  const counter = document.getElementById("wordCount");

  if (input && counter) {
    counter.textContent = `${countWords(input.value)} words`;
  }
}

function checkWriting() {
  const text = document.getElementById("writingText").value.trim();

  if (!text) {
    toast("Avval matn yozing", false);
    return;
  }

  const count = countWords(text);
  const notes = [];

  if (count < 30) {
    notes.push("Matnni kengaytiring.");
  } else {
    notes.push("Matn hajmi dastlabki tekshiruvdan o'tdi.");
  }

  if (!/^[A-Z]/.test(text)) {
    notes.push("Bosh harf bilan boshlang.");
  }

  if (!/[.!?]$/.test(text)) {
    notes.push("Oxiriga tinish belgisi qo'ying.");
  }

  document.getElementById("writingFeedback").innerHTML = `
    <div class="eb-feedback good">
      <h3>📝 Dastlabki tekshiruv</h3>
      <p>So'zlar soni: ${count}</p>
      ${notes.map(note => `<p>• ${esc(note)}</p>`).join("")}
      <small>Bu grammatik yoki AI baholash emas.</small>
    </div>
  `;
}

function showWritingSample() {
  document.getElementById("writingSample").innerHTML = `
    <div class="eb-feedback good">
      <h3>Namunaviy javob</h3>
      <p style="white-space:pre-line">
        ${esc(writingTopics[writingIndex].sample)}
      </p>
    </div>
  `;
}

function nextWriting() {
  writingIndex = (writingIndex + 1) % writingTopics.length;
  renderWriting();
}

/* =============== RESULTS =============== */

function finishQuiz() {
  progress.completed++;
  save();

  const percent = queue.length
    ? Math.round(correctCount / queue.length * 100)
    : 0;

  layout(`
    <section class="eb-panel eb-result">
      <div class="eb-trophy">🏆</div>
      <h2>Battle yakunlandi!</h2>

      <div class="eb-result-score">
        ${correctCount} / ${queue.length}
      </div>

      <h3>📊 Natija: ${percent}%</h3>
      <h3>⭐ Yig'ilgan XP: +${earnedXP}</h3>

      ${button("🔄 Yana mashq qilish", `openBook(${currentBook})`)}
      ${button("🏠 Bosh sahifa", "home()", true)}
    </section>
  `, "result-theme");
}

/* =============== LOAD WORDS =============== */

async function loadWords() {
  if (!app) {
    console.error("HTML ichida id='app' topilmadi.");
    return;
  }

  layout(`
    <section class="eb-panel">
      <h2>⏳ English Battle yuklanmoqda...</h2>
    </section>
  `);

  try {
    const response = await fetch(
      "../data/words.json",
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("words.json massiv bo'lishi kerak.");
    }

    words = data.map(normalizeWord);

    for (const word of words) {
      const cached = ipaCache[word.word.toLowerCase()];

      if (cached) {
        word.ipa ||= cached.ipa;
        word.pronunciation ||= cached.reading;
        word.audio ||= cached.audio;
      }
    }

    home();
  } catch (error) {
    console.error(error);

    layout(`
      <section class="eb-panel">
        <h2>❌ Lug'at yuklanmadi</h2>
        <p>${esc(error.message)}</p>
        <p>data/words.json va serverni tekshiring.</p>
      </section>
    `);
  }
}

loadWords();
