// Interface interactive pour la session de pratique.
// Affiche: granule arabe, bouttons tarteel/enregistrement, feedback.

export class PracticeUI {
  constructor(containerId, practiceSession) {
    this.container = document.getElementById(containerId);
    this.session = practiceSession;
    this.isRecording = false;
  }

  render() {
    const granule = this.session.getCurrentGranule();
    if (!granule) return;

    const html = `
      <div class="practice-container">
        <!-- En-tête -->
        <div class="practice-header">
          <h2>Pratique - Étape 2</h2>
          <p class="practice-progress">
            Granule ${this.session.currentGranuleIndex + 1}/${this.session.granules.length}
          </p>
        </div>

        <!-- Affichage du granule (ARABE + TRANSLIT) -->
        <div class="granule-display">
          <div class="granule-arabic" dir="rtl" lang="ar">
            ${granule.arabic}
          </div>
          <div class="granule-translit">
            ${granule.translit}
          </div>
          <div class="granule-meaning">
            ${granule.meaning}
          </div>
        </div>

        <!-- Contrôles -->
        <div class="practice-controls">
          <button id="btn-tarteel" class="btn btn-primary">
            🔊 Écouter le Tarteel
          </button>

          <button id="btn-record" class="btn btn-record">
            🎙️ Enregistrer
          </button>

          <button id="btn-stop" class="btn btn-danger" hidden>
            ⏹️ Arrêter
          </button>

          <button id="btn-playback" class="btn btn-secondary" hidden>
            ▶️ Rejouer mon enregistrement
          </button>
        </div>

        <!-- Indicateur d'enregistrement -->
        <div id="recording-indicator" class="recording-indicator" hidden>
          🔴 En cours d'enregistrement...
        </div>

        <!-- Zone feedback -->
        <div id="feedback-zone" class="feedback-zone" hidden>
          <div id="feedback-content"></div>
        </div>

        <!-- Boutons navigation -->
        <div class="practice-navigation" hidden id="nav-buttons">
          <button id="btn-next" class="btn btn-success">
            ✅ Granule suivante →
          </button>
          <button id="btn-retry" class="btn btn-warning">
            🔄 Réessayer
          </button>
        </div>

        <!-- Résumé session -->
        <div id="session-summary" class="session-summary" hidden>
          <h3>Résumé de la session</h3>
          <div id="summary-content"></div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.attachEvents();
  }

  attachEvents() {
    const btnTarteel = document.getElementById("btn-tarteel");
    const btnRecord = document.getElementById("btn-record");
    const btnStop = document.getElementById("btn-stop");
    const btnPlayback = document.getElementById("btn-playback");
    const btnNext = document.getElementById("btn-next");
    const btnRetry = document.getElementById("btn-retry");

    btnTarteel.addEventListener("click", () => this.playTarteel());
    btnRecord.addEventListener("click", () => this.startRecording());
    btnStop.addEventListener("click", () => this.stopRecording());
    btnPlayback.addEventListener("click", () => this.playBackRecording());
    btnNext.addEventListener("click", () => this.nextGranule());
    btnRetry.addEventListener("click", () => this.retry());
  }

  async playTarteel() {
    const btn = document.getElementById("btn-tarteel");
    btn.disabled = true;
    btn.textContent = "🔊 Écoute...";

    const result = await this.session.playTarteel();

    btn.disabled = false;
    btn.textContent = "🔊 Écouter encore";

    if (!result.success) {
      this.showError(`Erreur audio: ${result.error}`);
    }
  }

  async startRecording() {
    const result = await this.session.startRecording();

    if (!result.success) {
      this.showError(`Impossible d'enregistrer: ${result.error}`);
      return;
    }

    this.isRecording = true;
    document.getElementById("btn-tarteel").hidden = true;
    document.getElementById("btn-record").hidden = true;
    document.getElementById("btn-stop").hidden = false;
    document.getElementById("recording-indicator").hidden = false;
  }

  async stopRecording() {
    const result = await this.session.stopRecordingAndAnalyze();
    this.isRecording = false;

    document.getElementById("btn-stop").hidden = true;
    document.getElementById("recording-indicator").hidden = true;

    if (!result.success) {
      this.showError(`Erreur analyse: ${result.error}`);
      document.getElementById("btn-record").hidden = false;
      return;
    }

    // Affiche le feedback
    this.displayFeedback(result.result);

    // Affiche les boutons navigation
    document.getElementById("nav-buttons").hidden = false;
    document.getElementById("btn-playback").hidden = false;
  }

  displayFeedback(result) {
    const feedbackZone = document.getElementById("feedback-zone");
    const feedbackContent = document.getElementById("feedback-content");

    let html = `
      <div class="feedback-header">
        <h3>Résultat</h3>
        <div class="score-display">
          <div class="score ${result.success ? 'passed' : 'failed'}">
            ${result.score}%
          </div>
          <div class="score-label">
            ${result.success ? '✅ Réussi !' : '⚠️ Presque !'}
          </div>
        </div>
      </div>

      <div class="feedback-details">
        <h4>Ce que tu as dit:</h4>
        <div class="transcription">${result.transcription}</div>

        <h4>À dire:</h4>
        <div class="expected">${result.expected}</div>

        <h4>Feedback prononciation:</h4>
        <div class="feedback-list">
          ${result.feedback.map(f => `
            <div class="feedback-item feedback-${f.type}">
              ${f.message}
            </div>
          `).join('')}
        </div>

        <h4>Règles Tajweed:</h4>
        <div class="tajweed-summary">
          ${result.tajweedSummary}
        </div>
    `;

    if (result.pointsGained) {
      html += `
        <div class="points-earned">
          ⭐ +${result.pointsGained} Hasanat !
        </div>
      `;
    }

    html += `</div>`;

    feedbackContent.innerHTML = html;
    feedbackZone.hidden = false;
  }

  async playBackRecording() {
    // À implémenter : rejoue l'enregistrement
    alert("Fonctionnalité à implémenter");
  }

  async nextGranule() {
    const result = await this.session.nextGranule();

    if (!result.success) {
      // Fin de session
      this.displaySessionSummary();
    } else {
      // Réinitialise l'UI pour le granule suivant
      this.resetUI();
      this.render();
    }
  }

  retry() {
    this.resetUI();
    this.render();
  }

  resetUI() {
    document.getElementById("feedback-zone").hidden = true;
    document.getElementById("nav-buttons").hidden = true;
    document.getElementById("btn-tarteel").hidden = false;
    document.getElementById("btn-record").hidden = false;
    document.getElementById("btn-playback").hidden = true;
  }

  displaySessionSummary() {
    const summary = this.session.getSessionSummary();
    const summaryDiv = document.getElementById("session-summary");
    const summaryContent = document.getElementById("summary-content");

    const html = `
      <p><strong>Verset:</strong> ${summary.verseMeaning}</p>
      <p><strong>Granules tentées:</strong> ${summary.granulesAttempted}</p>
      <p><strong>Granules réussies:</strong> ${summary.granulesPassed}</p>
      <p><strong>Taux de réussite:</strong> ${summary.successRate}%</p>
      <p><strong>Total Hasanat gagnés:</strong> ⭐ ${summary.totalPointsGained}</p>
      <button id="btn-finish" class="btn btn-success" onclick="location.reload()">
        ✅ Terminer la session
      </button>
    `;

    summaryContent.innerHTML = html;
    summaryDiv.hidden = false;

    // Cache les autres contrôles
    document.querySelector(".practice-controls").hidden = true;
    document.getElementById("granule-display").hidden = true;
    document.getElementById("nav-buttons").hidden = true;
    document.getElementById("feedback-zone").hidden = true;
  }

  showError(message) {
    const feedbackZone = document.getElementById("feedback-zone");
    feedbackZone.innerHTML = `
      <div class="feedback-item feedback-error">
        ❌ ${message}
      </div>
    `;
    feedbackZone.hidden = false;
  }
}
