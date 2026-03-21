import type { DraftDayPlan, SkillSnapshot } from '../../core/types'

export interface GeneratedMaterial {
  dayName: string
  html: string
}

export function buildMaterialsPrompt(
  day: DraftDayPlan,
  childName: string,
  snapshot: SkillSnapshot | null,
  theme?: string,
): string {
  const items = day.items.filter((i) => i.accepted && !i.isAppBlock)

  return `Generate printable Minecraft-themed worksheets for ${childName}'s ${day.day} activities.

CHILD CONTEXT:
${snapshot?.prioritySkills?.length ? `Skill focus: ${snapshot.prioritySkills.map((s) => `${s.label} (${s.level})`).join(', ')}` : ''}
${theme ? `Week theme: ${theme}` : ''}

ACTIVITIES:
${items.map((i) => `- ${i.title} (${i.estimatedMinutes}m, ${i.subjectBucket})${i.skipSuggestion ? ` [Skip: ${i.skipSuggestion.reason}]` : ''}`).join('\n')}

CRITICAL RULES:
1. Return ONLY valid HTML. No markdown fences, no backticks, no explanation outside the HTML.
2. Start directly with <html> tag.
3. Every worksheet must be MINECRAFT THEMED:
   - Math problems use Minecraft items (blocks, diamonds, creepers, etc.)
   - Phonics/reading uses Minecraft vocabulary where possible
   - Story prompts set in Minecraft worlds
   - Headers use blocky/pixel style with emojis: ⛏️ ⚔️ 🧱 💎 🏔️
4. Each activity gets its own page with page-break-before.
5. Include REAL CONTENT — actual problems, actual words, actual questions. NOT blank forms.

PER ACTIVITY TYPE:

MATH: Generate 6-8 actual problems at the child's level.
Example for subtraction with regrouping:
  "Steve has 43 diamond blocks. He gives 17 to Alex. How many does Steve have left?"
  Show work space with place value boxes.
  Include 2 guided examples at top with solutions shown.

PHONICS/READING: Generate actual word lists and activities.
  Word bank: 8-10 real words matching the target pattern
  Sound boxes: empty boxes for each phoneme (e.g., 3 boxes for CVC words)
  Sentences: 3-4 real sentences using the target words
  "Circle the word that rhymes with 'block': clock, creep, stone, sock"

COMPREHENSION: Generate real questions about the reading.
  3-4 specific questions (not generic "what happened")
  Mix: 1 recall, 1 inference, 1 vocabulary, 1 connection
  Include space for answers (lined areas)

FORMATION/PRAYER: Generate a reflection page.
  Scripture verse written out
  "What does this mean to you?" prompt
  Gratitude list: "Name 3 things you're grateful for today"
  Prayer space: "What do you want to talk to God about?"
  Minecraft theme: "In your Minecraft world, what would you build to show gratitude?"

WRITING: Generate a themed writing prompt.
  Minecraft scenario: "You discovered a new biome! Describe what you see."
  Picture area (empty box for drawing)
  4-6 lined spaces for writing
  Word bank with helpful vocabulary

SPEECH: Generate a practice card.
  Target sounds/words listed clearly in large font
  3-4 sentences to practice reading aloud
  "Say each word 3 times. Circle the ones you said clearly."

DESIGN:
<html><head><style>
  @page { margin: 0.5in; }
  @media print { .page { page-break-before: always; } .page:first-child { page-break-before: auto; } }
  body { font-family: Arial, sans-serif; max-width: 7.5in; margin: 0 auto; color: #333; }
  .page { padding: 0.25in 0; }
  .header { text-align: center; border-bottom: 3px solid #4a7c3f; padding-bottom: 12px; margin-bottom: 20px; background: linear-gradient(to right, #e8f5e9, #fff, #e8f5e9); padding: 12px; border-radius: 8px; }
  .header h1 { font-size: 22pt; margin: 0; color: #2e7d32; }
  .header .subtitle { font-size: 11pt; color: #666; margin-top: 4px; }
  .minecraft-box { border: 3px solid #4a7c3f; border-radius: 8px; padding: 16px; margin: 12px 0; background: #f9fbe7; }
  .problem { margin: 16px 0; padding: 12px; border: 1px solid #c8e6c9; border-radius: 6px; background: white; }
  .problem-number { font-weight: bold; color: #2e7d32; font-size: 14pt; }
  .work-space { height: 80px; border: 1px dashed #aaa; margin: 8px 0; border-radius: 4px; }
  .word-box { display: inline-block; border: 2px solid #4a7c3f; padding: 10px 20px; margin: 6px; font-size: 20pt; min-width: 100px; text-align: center; border-radius: 4px; background: white; font-weight: bold; }
  .sound-box { display: inline-block; width: 50px; height: 50px; border: 2px solid #333; margin: 3px; text-align: center; line-height: 50px; font-size: 22pt; border-radius: 4px; }
  .line { border-bottom: 1px solid #999; height: 35px; margin: 8px 0; }
  .example { background: #e8f5e9; padding: 12px; border-radius: 6px; border-left: 4px solid #4caf50; margin-bottom: 16px; }
  .instruction { font-size: 12pt; color: #555; font-style: italic; margin-bottom: 8px; }
  .emoji-header { font-size: 16pt; }
  .word-bank { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; background: #f5f5f5; border-radius: 6px; }
  .word-bank-item { background: white; border: 1px solid #ddd; padding: 6px 14px; border-radius: 20px; font-size: 14pt; }
  .drawing-box { width: 100%; height: 200px; border: 2px dashed #aaa; border-radius: 8px; margin: 12px 0; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 14pt; }
</style></head><body>`
}

export function openPrintWindow(rawHtml: string, title?: string): void {
  let html = rawHtml.trim()

  // Strip markdown code fences (multiple patterns)
  // Pattern 1: ```html ... ```
  const fenceMatch = html.match(/```(?:html)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch) {
    html = fenceMatch[1].trim()
  }

  // Pattern 2: starts with ```html on first line
  if (html.startsWith('```')) {
    html = html.replace(/^```(?:html)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim()
  }

  // Pattern 3: backticks anywhere at start/end
  html = html.replace(/^`+(?:html)?\s*\n?/, '').replace(/\n?\s*`+\s*$/, '').trim()

  // If it doesn't start with <html or <!DOCTYPE, wrap it
  if (!html.match(/^<(!DOCTYPE|html)/i)) {
    html = `<!DOCTYPE html><html><head>
      <style>
        body { font-family: Arial, sans-serif; max-width: 7.5in; margin: 0.5in auto; }
        @media print { .page { page-break-before: always; } .page:first-child { page-break-before: auto; } }
      </style>
    </head><body>${html}</body></html>`
  }

  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
    if (title) printWindow.document.title = title
    setTimeout(() => {
      try { printWindow.print() } catch { /* print dialog blocked */ }
    }, 500)
  }
}
