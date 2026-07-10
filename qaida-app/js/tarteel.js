// Gestion de l'audio Tarteel (récitation de référence) et enregistrement de l'enfant.
// Tarteel = récitation correcte du Coran avec les règles de prononciation.

export class TarteelPlayer {
  constructor(reciterId = "al_husary_muallim") {
    this.reciterId = reciterId;
    this.currentAudio = null;
    this.audioContext = null;
    this.gainNode = null;
  }

  // URL de base pour les audios tarteel (à configurer selon votre source)
  getTarteelUrl(surahNum, verseNum, reciterId = this.reciterId) {
    // Format: audio/quran/[reciter]/[surah]/[verse].mp3
    // À adapter selon votre infrastructure d'audio
    return `/audio/quran/${reciterId}/${surahNum}/${verseNum}.mp3`;
  }

  async playTarteel(surahNum, verseNum, speed = 1.0) {
    // Joue l'audio tarteel du verset à la vitesse spécifiée.
    if (this.currentAudio) this.currentAudio.pause();

    const url = this.getTarteelUrl(surahNum, verseNum);
    this.currentAudio = new Audio(url);
    this.currentAudio.playbackRate = speed;

    return new Promise((resolve, reject) => {
      this.currentAudio.onended = resolve;
      this.currentAudio.onerror = reject;
      this.currentAudio.play().catch(reject);
    });
  }

  stopTarteel() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
    }
  }
}

export class PronunciationRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.isRecording = false;
  }

  async startRecording() {
    // Demande la permission et démarre l'enregistrement.
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];

      this.mediaRecorder = new MediaRecorder(this.stream);
      this.mediaRecorder.ondataavailable = (e) => this.audioChunks.push(e.data);
      this.mediaRecorder.start();
      this.isRecording = true;

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async stopRecording() {
    // Arrête l'enregistrement et retourne le blob audio.
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve({ success: false, error: "Pas d'enregistrement en cours" });
        return;
      }

      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        const audioBlob = new Blob(this.audioChunks, { type: "audio/webm" });

        // Arrête le stream
        this.stream.getTracks().forEach(track => track.stop());

        resolve({
          success: true,
          audio: audioBlob,
          duration: this.getRecordingDuration(),
        });
      };

      this.mediaRecorder.stop();
    });
  }

  cancelRecording() {
    // Annule l'enregistrement sans le sauvegarder.
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.stream.getTracks().forEach(track => track.stop());
      this.audioChunks = [];
      this.isRecording = false;
    }
  }

  getRecordingDuration() {
    // Retourne la durée approximative de l'enregistrement en secondes.
    if (!this.mediaRecorder) return 0;
    return this.mediaRecorder.stream ?
      Math.floor((Date.now() - this.mediaRecorder.createdTime) / 1000) : 0;
  }

  async playRecording(audioBlob) {
    // Rejoue l'enregistrement de l'enfant pour vérification.
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    return new Promise((resolve) => {
      audio.onended = resolve;
      audio.play();
    });
  }
}

export class AudioAnalyzer {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  async analyzeAudio(audioBlob) {
    // Analyse les caractéristiques audio (MFCC, spectrale, etc.)
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioData = await this.audioContext.decodeAudioData(arrayBuffer);

    return {
      sampleRate: audioData.sampleRate,
      duration: audioData.duration,
      channels: audioData.numberOfChannels,
      samples: audioData.getChannelData(0),
    };
  }

  // Calcule les MFCC (Mel-Frequency Cepstral Coefficients)
  calculateMFCC(audioData, numCoefficients = 13) {
    // Implémentation simplifiée (la vraie MFCC est complexe)
    // À améliorer avec librosa.js ou tfjs-models
    const fft = this.performFFT(audioData.samples);
    const melScale = this.applyMelScale(fft);
    return this.extractCoefficients(melScale, numCoefficients);
  }

  performFFT(samples) {
    // Implémentation FFT simplifiée (à remplacer par KissFFT ou similar)
    return samples; // Placeholder
  }

  applyMelScale(fft) {
    // Applique l'échelle Mel aux fréquences
    return fft; // Placeholder
  }

  extractCoefficients(melScale, numCoefficients) {
    // Extrait les coefficients cepstraux
    return new Array(numCoefficients).fill(0); // Placeholder
  }
}
