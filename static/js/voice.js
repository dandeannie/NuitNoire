/* Shared browser voice helpers for command capture and spoken summaries. */

(function initVoiceModule() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function isSupported() {
    return Boolean(SpeechRecognition);
  }

  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function listenOnce(options) {
    if (!isSupported()) {
      if (typeof options?.onError === 'function') {
        options.onError(new Error('Speech recognition not supported in this browser.'));
      }
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = options?.lang || 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (typeof options?.onResult === 'function') {
        options.onResult(transcript.trim());
      }
    };

    recognition.onerror = (event) => {
      if (typeof options?.onError === 'function') {
        options.onError(new Error(event.error || 'Speech recognition error'));
      }
    };

    recognition.start();
    return recognition;
  }

  window.NuitVoice = { isSupported, listenOnce, speak };
})();
