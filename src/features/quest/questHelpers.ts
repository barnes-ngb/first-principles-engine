import type { QuestQuestion, SessionQuestion } from './questTypes'

// ── Answer checking ────────────────────────────────────────────

/**
 * Check whether the child's selected answer is correct.
 * Handles fill-in-blank where selected is a fragment (e.g. "th")
 * but correctAnswer might be the full word (e.g. "then").
 * Also handles voice/typed open-response answers with fuzzy matching.
 */
export function checkAnswer(selected: string, question: QuestQuestion): boolean {
  const correct = (question.correctAnswer || '').trim().toLowerCase()
  const answer = selected.trim().toLowerCase()

  // Direct match (works for most question types)
  if (answer === correct) return true

  // Open-response fuzzy matching: voice recognition may add/drop articles,
  // produce homophones, or include extra words. Check if the answer
  // contains the correct word or vice versa (for single-word answers only).
  const isOpenResponse = !question.options?.some((o) => o.trim().toLowerCase() === answer)
  if (isOpenResponse && correct.length <= 15) {
    // Strip common voice artifacts
    const cleanAnswer = answer.replace(/^(the|a|an|it's|its)\s+/i, '').trim()
    if (cleanAnswer === correct) return true
    // Check if voice said the correct word among other words
    const words = cleanAnswer.split(/\s+/)
    if (words.some((w) => w === correct)) return true
  }

  // Fill-in-blank fallback: selected is fragment, correctAnswer is full word
  // Check if plugging the fragment into the blank produces the full word
  const stimulus = (question.stimulus || '').toLowerCase()
  if (stimulus.includes('_')) {
    const reconstructed = stimulus.replace(/_+/, answer)
    if (reconstructed === correct) return true
  }

  // Reverse: correctAnswer is the fragment and it matches
  if (question.options?.some((o) => o.trim().toLowerCase() === correct)) {
    // correctAnswer already matches an option, so direct match should have caught it
    return false
  }

  // Last resort: does the correct answer START or END with the selected option?
  // Only if selected is one of the provided options (prevents false positives)
  if (question.options?.some((o) => o.trim().toLowerCase() === answer)) {
    if (correct.startsWith(answer) || correct.endsWith(answer)) return true
  }

  return false
}

// ── Stimulus sanitizer ─────────────────────────────────────────

/**
 * Sanitize the stimulus for display. For fill-in-blank questions,
 * strips leaked answer fragments from the stimulus.
 * Returns the sanitized stimulus or the original if no sanitization needed.
 */
export function sanitizeStimulus(question: QuestQuestion): string | null {
  const stimulus = question.stimulus || null
  if (!stimulus) return null

  // If stimulus contains the correct answer text, strip it for fill-in-blank
  if (question.prompt?.toLowerCase().includes('complete') && question.correctAnswer) {
    const correctLower = question.correctAnswer.toLowerCase()
    const stimLower = stimulus.toLowerCase()
    // "th_en" contains "th" -> the answer is leaked
    // But only strip if stimulus has an underscore (it's a fill-in-blank display)
    if (stimLower.includes('_') && stimLower.includes(correctLower)) {
      // Replace the correctAnswer portion, keeping the underscore pattern
      const idx = stimLower.indexOf(correctLower)
      const replaced = stimulus.slice(0, idx) + stimulus.slice(idx + question.correctAnswer.length)
      // Ensure there's still an underscore; if we stripped it, restore it
      if (!replaced.includes('_')) {
        return '_' + replaced.replace(/^_|_$/g, '')
      }
      return replaced || '_'
    }
  }

  return stimulus
}

// ── Error flagging ─────────────────────────────────────────────

/**
 * Detect if a question is likely an AI generation error.
 * Used to flag skipped questions so they don't count against skill findings.
 */
export function shouldFlagAsError(question: QuestQuestion): boolean {
  // Flag 1: Stimulus contains the correct answer (the "th_en" bug)
  if (question.stimulus && question.correctAnswer) {
    const stim = question.stimulus.toLowerCase()
    const correct = question.correctAnswer.toLowerCase()
    if (stim.includes(correct) && stim.includes('_')) return true
  }

  // Flag 2: correctAnswer doesn't match any option
  if (question.correctAnswer && question.options?.length) {
    const correctLower = question.correctAnswer.trim().toLowerCase()
    const directMatch = question.options.some(
      (opt) => opt.trim().toLowerCase() === correctLower,
    )
    if (!directMatch) {
      // Also check fill-in-blank reconstruction before flagging
      const stimulus = (question.stimulus || '').toLowerCase()
      if (stimulus.includes('_')) {
        const couldMatch = question.options.some((opt) => {
          const reconstructed = stimulus.replace(/_+/, opt.trim().toLowerCase())
          return reconstructed === correctLower
        })
        if (!couldMatch) return true
      } else {
        return true
      }
    }
  }

  // Flag 3: Duplicate options
  if (question.options?.length) {
    const lower = question.options.map((o) => o.trim().toLowerCase())
    if (new Set(lower).size !== lower.length) return true
  }

  // Flag 4: Missing stimulus for types that need it
  if (question.prompt) {
    const promptLower = question.prompt.toLowerCase()
    const needsStimulus = promptLower.includes('what word') || promptLower.includes('complete')
    if (needsStimulus && !question.stimulus?.trim()) return true
  }

  return false
}

// ── Word extraction helpers ────────────────────────────────────

/**
 * Extract the target word from a quest question for word progress tracking.
 */
export function extractTargetWord(question: SessionQuestion & { stimulus?: string }): string | null {
  const stimulus = question.stimulus || ''

  // For word-reading: the stimulus IS the word
  if (stimulus && !stimulus.includes('_')) {
    return stimulus.trim()
  }

  // For fill-in-blank: reconstruct from stimulus + correctAnswer
  if (stimulus.includes('_') && question.correctAnswer) {
    return stimulus.replace(/_+/, question.correctAnswer).trim()
  }

  // For other types: correctAnswer is often the target word
  if (question.correctAnswer && question.correctAnswer.length <= 15) {
    return question.correctAnswer.trim()
  }

  return null
}

/**
 * Extract a pattern tag from the question's skill or type.
 * e.g. "phonics.digraphs.th" -> "digraphs-th"
 */
export function extractPattern(question: SessionQuestion): string {
  // Try to derive from skill tag: "phonics.digraphs.th" -> "digraphs-th"
  if (question.skill) {
    const parts = question.skill.split('.')
    if (parts.length >= 2) {
      return parts.slice(-2).join('-').toLowerCase()
    }
    return parts[parts.length - 1].toLowerCase()
  }

  // Fallback from question type
  return question.type || 'unknown'
}
