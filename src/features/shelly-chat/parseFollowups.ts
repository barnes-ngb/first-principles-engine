// ── [FOLLOWUP] marker parser ────────────────────────────────────
//
// The shellyChat system prompt (functions/src/ai/tasks/shellyChat.ts) may append
// trailing `[FOLLOWUP] <suggestion>` lines to its reply. This pure helper splits
// those markers out of the assistant text: it strips the marker lines from the
// rendered body and returns up to three suggestions for the follow-up chip row.
//
// Extracted from ShellyChatPage so it is unit-testable without the component, and
// to mirror the tag-extraction pattern the portal's `<action>` blocks will reuse
// (see docs/SHELLY_PORTAL_CONTEXT.md §4).

export interface ParsedFollowUps {
  cleanText: string
  followUps: string[]
}

export function parseFollowUps(text: string): ParsedFollowUps {
  const lines = text.split('\n')
  const followUpItems: string[] = []
  const contentLines: string[] = []

  for (const line of lines) {
    const match = line.match(/^\[FOLLOWUP\]\s*(.+)/)
    if (match) {
      followUpItems.push(match[1].trim())
    } else {
      contentLines.push(line)
    }
  }

  return {
    cleanText: contentLines.join('\n').trimEnd(),
    followUps: followUpItems.slice(0, 3),
  }
}
