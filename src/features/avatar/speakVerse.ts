/** TTS helper for reading armor verses aloud */
export function speakVerse(pieceName: string, verseText: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()

  const text = `${pieceName}. ${verseText}`
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
