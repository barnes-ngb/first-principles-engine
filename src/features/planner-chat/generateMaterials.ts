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

  const childContext = childName === 'Lincoln'
    ? `Lincoln (10): Speech + neurodivergence. ~3rd grade math, ~1st grade reading. Phonics recently clicking. Motivators: Minecraft, Lego, Art. Short routines, frequent wins.`
    : childName === 'London'
      ? `London (6): Kindergarten. Story-driven, creates own books. Knows most letter sounds. Motivators: Stories, drawing, book-making.`
      : `${childName}: elementary-level student`

  // Build skill-level guidance for specific content generation
  const skillGuidance = childName === 'Lincoln'
    ? `LINCOLN'S CURRENT LEVELS (use these to calibrate difficulty):
  - Math: ~3rd grade. Comfortable with addition/subtraction to 100. Working on regrouping. Multiplication introduced (2s, 5s, 10s).
  - Reading: ~1st grade decoding, improving. CVC words solid, working on blends and digraphs. Sight words: Dolch 1st grade list.
  - Writing: Short sentences. Needs lined paper with visual guides. Prefers copying to composing.
  - Speech: Working on /r/, /l/, multi-syllable words. Keep sentences short (5-8 words).`
    : childName === 'London'
      ? `LONDON'S CURRENT LEVELS (use these to calibrate difficulty):
  - Math: Counting to 100, number recognition, one-to-one correspondence, simple addition to 10.
  - Reading: Most letter sounds known, beginning CVC words. Loves being read to. Prefers stories over drills.
  - Writing: Letter formation, name writing, simple words. Needs large lines.`
      : ''

  return `Generate printable Minecraft-themed worksheets for ${childName}'s ${day.day} activities.

CHILD CONTEXT:
${childContext}
${skillGuidance}
${snapshot?.prioritySkills?.length ? `Skill focus: ${snapshot.prioritySkills.map((s) => `${s.label} (${s.level})`).join(', ')}` : ''}
${theme ? `Week theme: ${theme}` : ''}

ACTIVITIES:
${items.map((i) => `- ${i.title} (${i.estimatedMinutes}m, ${i.subjectBucket})${i.skipSuggestion ? ` [Skip: ${i.skipSuggestion.reason}]` : ''}`).join('\n')}

CRITICAL RULES — READ THESE CAREFULLY:
1. Return ONLY valid HTML. No markdown fences, no backticks, no explanation outside the HTML.
2. Start directly with <html> tag.
3. Every worksheet must be MINECRAFT THEMED:
   - Math problems use Minecraft items (blocks, diamonds, creepers, etc.)
   - Phonics/reading uses Minecraft vocabulary where possible
   - Story prompts set in Minecraft worlds
   - Headers use blocky/pixel style with emojis: ⛏️ ⚔️ 🧱 💎 🏔️
4. Each activity gets its own page with page-break-before.
5. **ABSOLUTELY NO BLANK FORMS.** Every worksheet MUST contain REAL, FILLED-IN content.
   - WRONG: "Problem 1: ___" or "Write a math problem here" or empty boxes
   - RIGHT: "Steve has 43 diamond blocks. He gives 17 to Alex. How many does Steve have left?"
   - If you generate a worksheet with placeholder text or empty problems, the worksheet is USELESS.
6. The child should be able to sit down and DO the worksheet immediately with no teacher setup.
7. Include an ANSWER KEY section at the bottom of each worksheet page (small font, upside-down or in a bordered box marked "Answer Key").

PER ACTIVITY TYPE:

MATH: Generate 6-8 ACTUAL problems with REAL numbers at the child's level.
  EVERY problem must have specific numbers and a clear question.
  Example for subtraction with regrouping:
    "1. Steve has 43 diamond blocks. He gives 17 to Alex. How many does Steve have left?"
    "2. A creeper drops 52 gunpowder. You use 28 to make TNT. How much is left?"
    "3. 64 - 37 = ___"
  Include 2 guided examples at top WITH SOLUTIONS SHOWN (worked out step by step).
  Show work space with place value boxes after each problem.
  Include answer key at bottom.

PHONICS/READING: Generate ACTUAL word lists and activities with REAL words.
  Word bank: 8-10 SPECIFIC real words matching the target pattern (e.g., for CVC -at: cat, hat, sat, mat, bat, rat, fat, pat)
  Sound boxes: boxes for each phoneme with the ACTUAL WORDS listed (e.g., "c-a-t" → 3 boxes)
  Sentences: 3-4 REAL sentences using the target words:
    "The cat sat on the mat."
    "The rat wore a hat."
  Multiple choice: "Circle the word that rhymes with 'block': clock, creep, stone, sock"
  Include answer key.

COMPREHENSION: Generate REAL questions — not generic placeholders.
  3-4 SPECIFIC questions (not "what happened?" — instead "Why did Steve build a shelter before nightfall?")
  Mix: 1 recall, 1 inference, 1 vocabulary, 1 connection
  Include lined space for written answers
  Include answer key with sample answers.

FORMATION/PRAYER: Generate a reflection page with ACTUAL content.
  Scripture verse WRITTEN OUT in full (e.g., "Philippians 4:13 — I can do all things through Christ who strengthens me.")
  Specific prompts: "What does this verse mean for your day today?"
  Gratitude list: "Name 3 things you're grateful for today: 1.___ 2.___ 3.___"
  Prayer space: "What do you want to talk to God about?"
  Minecraft tie-in: "In your Minecraft world, what would you build to show gratitude?"

WRITING: Generate a themed writing prompt with REAL scaffolding.
  Minecraft scenario: "You discovered a new biome called the Crystal Caverns! It's full of glowing crystals and underground rivers. Describe what you see, hear, and feel."
  Picture area (empty box for drawing)
  Word bank with 8-10 SPECIFIC helpful vocabulary words: "glowing, crystals, underground, sparkling, echo, dripping, mysterious, cavern, stalactite, river"
  4-6 lined spaces for writing
  Sentence starters: "When I entered the cavern, I saw..." "The most amazing thing was..."

SPEECH: Generate a practice card with REAL target content.
  Target sounds/words listed clearly in large font (e.g., for /s/ blends: "stop, step, star, stick, stone, stamp")
  3-4 REAL sentences to practice reading aloud:
    "Steve stepped on a stone and stopped to look at the stars."
  "Say each word 3 times. Circle the ones you said clearly."

SELF-CHECK BEFORE OUTPUTTING:
  Before generating the final HTML, verify EVERY worksheet page:
  ✓ Does every math problem have SPECIFIC numbers? (not "___" or "write a problem")
  ✓ Does every phonics activity have REAL words listed? (not "fill in words")
  ✓ Does every comprehension question reference SPECIFIC content? (not "what happened?")
  ✓ Is there an answer key with ACTUAL answers?
  ✓ Could the child sit down RIGHT NOW and do this with zero teacher prep?
  If any check fails, regenerate that section with real content.

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
