/**
 * Speech Recognition and Text-to-Speech service for Nivara
 * Supports Web Speech API (continuous real-time voice-to-text)
 * and SpeechSynthesis for real-time voice replies.
 */

export const SpeechRecognitionClass =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export const isWebSpeechSupported = () => Boolean(SpeechRecognitionClass);

export function mapLangCode(lang) {
  if (!lang) return 'en-IN';
  const l = lang.toLowerCase();
  if (l === 'ta' || l === 'tamil' || l === 'tanglish') return 'ta-IN';
  if (l === 'hi' || l === 'hindi' || l === 'hinglish') return 'hi-IN';
  if (l === 'te' || l === 'telugu') return 'te-IN';
  if (l === 'ml' || l === 'malayalam') return 'ml-IN';
  if (l === 'kn' || l === 'kannada') return 'kn-IN';
  return 'en-IN';
}

export function createLiveRecognizer({ lang = 'en-IN', onInterim, onFinal, onStart, onEnd, onError }) {
  if (!SpeechRecognitionClass) return null;

  try {
    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = mapLangCode(lang);

    recognition.onstart = () => {
      if (onStart) onStart();
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          finalTranscript += text + ' ';
          if (onFinal) onFinal(text.trim());
        } else {
          interimTranscript += text;
        }
      }

      if (onInterim) {
        onInterim(interimTranscript, finalTranscript);
      }
    };

    recognition.onerror = (event) => {
      if (onError) onError(event);
    };

    recognition.onend = () => {
      if (onEnd) onEnd();
    };

    return recognition;
  } catch (err) {
    console.warn('Could not initialize SpeechRecognition:', err);
    return null;
  }
}

export function playBrowserTTS(text, lang = 'en-IN', { onStart, onEnd, onError } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    if (onError) onError(new Error('SpeechSynthesis not supported'));
    return null;
  }

  try {
    window.speechSynthesis.cancel(); // Stop any pending speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = mapLangCode(lang);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    if (onStart) utterance.onstart = onStart;
    if (onEnd) utterance.onend = onEnd;
    if (onError) utterance.onerror = onError;

    // Pick best natural voice if available
    const voices = window.speechSynthesis.getVoices();
    const targetLang = mapLangCode(lang).split('-')[0];
    const matchVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(targetLang));
    if (matchVoice) {
      utterance.voice = matchVoice;
    }

    window.speechSynthesis.speak(utterance);
    return utterance;
  } catch (e) {
    console.warn('SpeechSynthesis error:', e);
    if (onError) onError(e);
    return null;
  }
}

export function stopAllBrowserSpeech() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
}

