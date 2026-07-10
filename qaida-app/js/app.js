// App Ihsan — Logique d'onboarding, diagnostic, adaptation.
import { engine } from "./engine.js";
import { LEVELS } from "./store.js";

// ===== ONBOARDING =====
const onboardModal = document.getElementById("onboard");
const obName = document.getElementById("ob-name");
const obReciter = document.getElementById("ob-reciter");
const obReciterDesc = document.getElementById("ob-reciter-desc");
const obStart = document.getElementById("ob-start");

function initOnboarding() {
  if (engine.isOnboardingDone()) {
    onboardModal.close();
    initDiagnostic();
    return;
  }

  // Remplir le sélecteur
  obReciter.innerHTML = `<option value="">— Choisir un récitateur —</option>` +
    engine.getReciters().map((r) => `<option value="${r.id}">${r.nom}</option>`).join("");
  obReciter.value = engine.getReciter().id;

  obName.addEventListener("input", checkObReady);
  obReciter.addEventListener("change", () => {
    engine.setReciter(obReciter.value);
    updateReciterDesc();
    checkObReady();
  });
  obStart.addEventListener("click", finishOnboarding);

  updateReciterDesc();
  onboardModal.showModal();
}

function updateReciterDesc() {
  const style = engine.getReciterStyle();
  obReciterDesc.textContent = style ? style.description : "";
}

function checkObReady() {
  obStart.disabled = !obName.value.trim() || !obReciter.value;
}

function finishOnboarding() {
  const name = obName.value.trim() || "Apprenant";
  window.childName = name;
  // Sauvegarder de manière interne (engine se chargera)
  initDiagnostic();
}

// ===== DIAGNOSTIC =====
const diagnosticModal = document.getElementById("diagnostic");
const diagVersesContainer = document.getElementById("diag-verses");
const diagResultsContainer = document.getElementById("diag-results");
const diagLevelResult = document.getElementById("diag-level-result");
const diagFinish = document.getElementById("diag-finish");

let diagnosticScores = {};

function initDiagnostic() {
  if (engine.isDiagnosticDone()) {
    diagnosticModal.close();
    showHome();
    return;
  }

  onboardModal.close();

  // Choisir 3 versets au hasard pour le test
  const verses = Array.from(engine.getVerse("fatiha:1") ? ["fatiha:1", "fatiha:3", "fatiha:5"] : ["fatiha:1"]);
  diagVersesContainer.innerHTML = verses.map((id) => {
    const v = engine.getVerse(id);
    return `
      <div class="diag-verse">
        <div class="diag-verse-arabic" dir="rtl" lang="ar" style="font-size: 24px; font-weight: bold; margin-bottom: 8px; color: #0058be;">${v.arabic}</div>
        <div class="diag-verse-translit" style="font-size: 14px; color: #666; margin-bottom: 6px; font-style: italic;">${v.translit}</div>
        <div class="diag-verse-text" style="font-size: 13px; color: #999; margin-bottom: 12px;">${v.meaning}</div>
        <button class="diag-verse-btn" data-id="${id}">🔊 Écouter</button>
        <input type="range" min="0" max="100" value="75" class="diag-accuracy" data-id="${id}" style="width: 100%; margin-top: 8px;" />
        <span class="diag-accuracy-text" data-id="${id}" style="font-size: 0.8rem;">Précision: 75%</span>
      </div>
    `;
  }).join("");

  // Events
  document.querySelectorAll(".diag-verse-btn").forEach((btn) => {
    btn.addEventListener("click", () => playVerseAudio(btn.dataset.id));
  });

  document.querySelectorAll(".diag-accuracy").forEach((input) => {
    input.addEventListener("input", (e) => {
      const id = e.target.dataset.id;
      document.querySelector(`.diag-accuracy-text[data-id="${id}"]`).textContent = `Précision: ${e.target.value}%`;
    });
  });

  diagFinish.addEventListener("click", finishDiagnostic);
  diagnosticModal.showModal();
}

function playVerseAudio(verseId) {
  const url = engine.getAudioUrl(verseId);
  if (url) {
    const audio = new Audio(url);
    audio.play().catch(() => {
      // Synthèse vocale fallback
      const v = engine.getVerse(verseId);
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(v.arabic);
        u.lang = "ar-SA";
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      }
    });
  }
}

function finishDiagnostic() {
  const accuracies = [];
  document.querySelectorAll(".diag-accuracy").forEach((input) => {
    accuracies.push(parseInt(input.value));
  });
  const avgAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;

  // Placer selon la moyenne
  let level = LEVELS.BEGINNER;
  if (avgAccuracy >= 85) level = LEVELS.ADVANCED;
  else if (avgAccuracy >= 75) level = LEVELS.INTERMEDIATE;

  engine.completeDiagnostic(level);
  diagnosticModal.close();
  showHome();
}

// ===== NAVIGATION & RENDU =====
function showHome() {
  renderHeader();
  renderHome();
  document.querySelector(".tab[data-tab='home']").hidden = false;
  document.querySelector('[data-tab="home"]').parentElement.hidden = false;
}

function renderHeader() {
  document.getElementById("hasanat").textContent = engine.getPoints();
  document.getElementById("streak").textContent = engine.getStreak().days;

  const progress = engine.getProgressTo1000();
  document.getElementById("progress-fill").style.width = `${progress.ratio * 100}%`;
  document.getElementById("progress-text").textContent = `${progress.reps}/1000 reps`;

  const name = window.childName || "Apprenant";
  document.getElementById("welcome-name").textContent = `Bienvenue, ${name}! 🎓`;
  document.getElementById("level-display").textContent = engine.getLevelLabel();
}

function renderHome() {
  const summary = engine.getReviewSummary();
  const surah = engine.getCurrentSurah();
  const html = `
    <div class="stats">
      <p>📖 ${summary.learned}/${summary.total} versets appris</p>
      <p>🔥 Série : ${engine.getStreak().days} jours</p>
    </div>
    <div class="quest">
      <h3>Sourate en cours : ${surah.name}</h3>
      <p>${surah.meaning} — ${surah.versesLearned}/${surah.verseCount} versets</p>
      <button onclick="window.startPractice()">Pratiquer → 🎙️</button>
    </div>
  `;
  document.getElementById("home-content").innerHTML = html;
}

window.startPractice = () => {
  const v = engine.getNextVerse();
  if (v) {
    // Modal de pratique simple (à développer)
    alert(`Pratique : ${v.meaning}`);
  }
};

// ===== NAVIGATION ONGLETS =====
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((s) => s.hidden = true);
    btn.classList.add("active");
    document.querySelector(`.tab[data-tab="${tab}"]`).hidden = false;

    if (tab === "home") renderHome();
    else if (tab === "learn") renderLearn();
    else if (tab === "videos") renderVideos();
    else if (tab === "progress") renderProgress();
  });
});

function renderLearn() {
  const html = engine.getSurahs().map((s) => `
    <div style="padding: 12px; background: #f0f0f0; border-radius: 8px; margin: 8px 0;">
      <strong>${s.name}</strong> — ${s.versesLearned}/${s.verseCount} versets
    </div>
  `).join("");
  document.getElementById("surahs-content").innerHTML = html;
}

function renderVideos() {
  const html = engine.getVideos().map((v) => `
    <div style="padding: 12px; background: #f0f0f0; border-radius: 8px; margin: 8px 0;">
      ${v.emoji} <strong>${v.name}</strong> — ${v.unlocked ? "🔓 Débloquée" : `${v.pointsAway} hasanat`}
    </div>
  `).join("");
  document.getElementById("videos-content").innerHTML = html;
}

function renderProgress() {
  const summary = engine.getReviewSummary();
  const progress = engine.getProgressTo1000();
  const html = `
    <p>⭐ Hasanat : ${engine.getPoints()}</p>
    <p>📖 Versets appris : ${summary.learned}/${summary.total}</p>
    <p>🔥 Série : ${engine.getStreak().days} jours</p>
    <p>🏆 Répétitions totales : ${progress.reps}/1000</p>
    ${progress.isExcellence ? "<p style='color: green; font-weight: bold;'>✅ EXCELLENCE EN ARABE!</p>" : ""}
  `;
  document.getElementById("progress-content").innerHTML = html;
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  engine.subscribe(renderHeader);
  initOnboarding();
});
