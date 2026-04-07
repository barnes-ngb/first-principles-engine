type SpeakMode = 'interrupt' | 'queue'

interface SpeakOptions {
  mode?: SpeakMode
}

function speakText(text: string, { mode = 'interrupt' }: SpeakOptions = {}) {
  if (!('speechSynthesis' in window)) return
  if (mode === 'interrupt') {
    window.speechSynthesis.cancel()
  }

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.85
  utterance.pitch = 1.0
  utterance.volume = 1.0

  const voices = window.speechSynthesis.getVoices()
  const preferred = voices.find((v) =>
    v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Moira'),
  ) || voices.find((v) => v.lang.startsWith('en-US')) || voices[0]
  if (preferred) utterance.voice = preferred

  window.speechSynthesis.speak(utterance)
}

/** TTS helper for reading armor verses aloud */
export function speakVerse(pieceName: string, verseText: string, options?: SpeakOptions) {
  speakText(`${pieceName}. ${verseText}`, options)
}

/** TTS helper for short status messages */
export function speakStatus(message: string, options?: SpeakOptions) {
  speakText(message, options)
}
