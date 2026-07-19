/**
 * TypeScript declarations for the Web Speech API.
 * Extends Window interface to support webkit-prefixed SpeechRecognition.
 */

declare global {
  interface Window {
    webkitSpeechRecognition?: typeof SpeechRecognition;
  }
}

// Export empty to mark this as a module
export {};
