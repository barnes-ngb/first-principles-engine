import type { DraftDayPlan, SkillSnapshot } from '../../core/types'
import { computeAge, getChildAgeGroup } from '../../core/profile/childIdentity'

export interface GeneratedMaterial {
  dayName: string
  html: string
}

/**
 * The child-identity fields worksheet generation reads. Profile DATA only —
 * age (from `birthdate`) and `ageGroup` calibrate *presentation* (font sizes,
 * problem counts), and `motivators`/`interests` pick the *theme*. Nothing here
 * gates a feature, and no branch keys on the child's name (ARCH-15).
 */
export interface MaterialsChild {
  name: string
  birthdate?: string
  grade?: string
  motivators?: string
  interests?: string
  strengths?: string
}

/** Pick a worksheet theme from the child's interests/motivators (never name). */
function deriveWorksheetTheme(
  child: MaterialsChild,
  ageGroup: 'older' | 'younger',
): { themeStyle: string; isStory: boolean } {
  const text = `${child.motivators ?? ''} ${child.interests ?? ''}`.toLowerCase()
  const hasMinecraft = /minecraft/.test(text)
  const hasStory =
    /stor|adventure|book|fairy|dragon|fantas|princess|knight|magic|draw|art|animal/.test(
      text,
    )
  // Minecraft fans get the blocky theme; story/art kids (or, absent any signal,
  // the younger presentation default) get adventure/story; everyone else gets a
  // neutral "themed around their interests" prompt.
  const isStory = !hasMinecraft && (hasStory || ageGroup === 'younger')
  const themeStyle = hasMinecraft
    ? 'Minecraft-themed'
    : isStory
      ? 'adventure and story themed'
      : 'fun and colorful, themed around the child\'s interests'
  return { themeStyle, isStory }
}

/** Snapshot-derived working-level line, or '' when there's no snapshot yet. */
function formatWorkingLevels(snapshot: SkillSnapshot | null): string {
  const wl = snapshot?.workingLevels
  if (!wl) return ''
  const entries = Object.entries(wl)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: level ${(v as { level: number }).level}`)
  return entries.length
    ? `CURRENT WORKING LEVELS (calibrate difficulty to these): ${entries.join(', ')}.`
    : ''
}

export function buildMaterialsPrompt(
  day: DraftDayPlan,
  child: MaterialsChild,
  snapshot: SkillSnapshot | null,
  theme?: string,
  conundrum?: { title?: string; scenario?: string; question?: string },
  virtue?: string,
  scriptureRef?: string,
  scriptureText?: string,
): string {
  const items = day.items.filter((i) => i.accepted && !i.isAppBlock)

  const childName = child.name
  const age = computeAge(child.birthdate)
  const ageGroup = getChildAgeGroup(child)
  const isYounger = ageGroup === 'younger'
  const { themeStyle, isStory } = deriveWorksheetTheme(child, ageGroup)

  // Identity context, assembled from profile data — no hardcoded per-child prose.
  const traits = [
    age !== undefined ? `age ${age}` : null,
    child.grade ? child.grade : null,
  ]
    .filter(Boolean)
    .join(', ')
  const softBits = [
    child.motivators?.trim() ? `Motivators: ${child.motivators.trim()}.` : '',
    child.interests?.trim() ? `Interests: ${child.interests.trim()}.` : '',
    child.strengths?.trim() ? `Strengths: ${child.strengths.trim()}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const childContext = traits
    ? `${childName} (${traits}). ${softBits}`.trim()
    : `${childName}: elementary-level student. ${softBits}`.trim()

  // Skill calibration: prefer real snapshot data; otherwise seed a sensible
  // default from grade/age (data may SEED, never gate).
  const workingLevels = formatWorkingLevels(snapshot)
  const skillGuidance = workingLevels
    ? workingLevels
    : `No skill snapshot yet — calibrate difficulty to ${
        child.grade
          ? `${child.grade} level`
          : age !== undefined
            ? `age ${age}`
            : 'an early-elementary level'
      } and keep it accessible; adjust from there.`

  return `Generate printable ${themeStyle} worksheets for ${childName}'s ${day.day} activities.

CHILD CONTEXT:
${childContext}
${skillGuidance}
${snapshot?.prioritySkills?.length ? `Skill focus: ${snapshot.prioritySkills.map((s) => `${s.label} (${s.level})`).join(', ')}` : ''}
${theme ? `Week theme: ${theme}` : ''}

ACTIVITIES:
${items.map((i) => `- ${i.title} (${i.estimatedMinutes}m, ${i.subjectBucket})${i.skipSuggestion ? ` [Skip: ${i.skipSuggestion.reason}]` : ''}`).join('\n')}
${theme || conundrum?.title ? `
WEEKLY THEME CONTEXT — USE THIS TO CONNECT WORKSHEETS:
${theme ? `Theme: ${theme}` : ''}
${virtue ? `Virtue: ${virtue}` : ''}
${scriptureRef ? `Scripture: ${scriptureRef}${scriptureText ? ` — "${scriptureText}"` : ''}` : ''}
${conundrum?.title ? `This week's story: "${conundrum.title}"` : ''}
${conundrum?.scenario ? `Story summary: ${conundrum.scenario.slice(0, 200)}...` : ''}

IMPORTANT: Connect at least 2 worksheets to this theme:
- Math problems should reference the story characters/setting when possible
- Phonics word lists should include words related to the theme
- The formation worksheet should use the scripture and virtue above
- Writing prompts should connect to the story world
` : ''}
CRITICAL RULES — READ THESE CAREFULLY:
1. Return ONLY valid HTML. No markdown fences, no backticks, no explanation outside the HTML.
2. Start directly with <html> tag.
${isStory ? `3. Every worksheet must be ADVENTURE/STORY THEMED:
   - Math problems use story characters and adventure scenarios (dragons, explorers, treasure, animals)
   - Reading/phonics uses adventure vocabulary and simple stories
   - Prompts connect to imagination and drawing
   - Headers use adventure emojis: 🦕 🗺️ 🌟 🎨 🏰 🐉` : `3. Every worksheet must be ${themeStyle.toUpperCase()}:
   - Math problems use characters/items from the child's interests${child.interests?.trim() ? ` (${child.interests.trim()})` : child.motivators?.trim() ? ` (${child.motivators.trim()})` : ''}
   - Phonics/reading uses vocabulary from that theme where possible
   - Story/writing prompts are set in that world
   - Headers use playful emojis that fit the theme`}
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
${isYounger ? `  For a younger learner${age !== undefined ? ` (age ${age})` : ''}:
  Generate 4-6 problems at an early level (addition/subtraction to 10, counting, number recognition).
  Example: "A dragon has 3 eggs in one nest and 4 in another. How many eggs total?"
  Use large fonts, pictures, and simple number lines.
  Include visual counting aids (dot groups, tally marks).` : ''}

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
${isStory
    ? `  Drawing connection: "Draw a picture of something you want to thank God for today."`
    : `  Interest tie-in: "Connect today's gratitude to ${themeStyle} — what would you build or make to show it?"`}

${isStory ? `DRAWING + WRITING: Generate a story-based activity.
  Adventure prompt: "You found a baby dragon in the forest! Draw your dragon and write its name."
  Large drawing box (at least 250px tall)
  2-3 lined spaces for writing (large lines, 40px height)
  Word bank: 5-6 simple words with pictures: "dragon, fly, fire, egg, cave, friend"
  Sentence starter: "My dragon is..."` : `WRITING: Generate a ${themeStyle} writing prompt with REAL scaffolding.
  Scenario: an immersive scene from the child's theme (e.g. discovering a new place full of vivid detail). Describe what you see, hear, and feel.
  Picture area (empty box for drawing)
  Word bank with 8-10 SPECIFIC helpful vocabulary words drawn from that theme.
  4-6 lined spaces for writing
  Sentence starters: "When I arrived, I saw..." "The most amazing thing was..."`}

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
${isYounger ? `  ✓ Are fonts large enough for a young learner? (minimum 16pt body, 18pt problems)
  ✓ Is there a drawing space on every page?
  ✓ Are word banks 5-6 words max with simple vocabulary?
  ✓ Is there NO more than one paragraph of instructions per activity?` : ''}

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
${isYounger ? `  body { font-size: 16pt; }
  .problem { font-size: 18pt; padding: 16px; }
  .line { height: 45px; margin: 12px 0; }
  .drawing-box { height: 280px; }
  .word-box { font-size: 24pt; padding: 14px 24px; }
  .sound-box { width: 60px; height: 60px; font-size: 26pt; line-height: 60px; }` : ''}
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
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: Arial, sans-serif; max-width: 7.5in; margin: 0.5in auto; }
        @media print { .page { page-break-before: always; } .page:first-child { page-break-before: auto; } }
      </style>
    </head><body>${html}</body></html>`
  }

  // Strategy 1: Try window.open (works on desktop)
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
    if (title) printWindow.document.title = title
    setTimeout(() => {
      try { printWindow.print() } catch { /* blocked */ }
    }, 500)
    return
  }

  // Strategy 2: Fallback for mobile — download as HTML file
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(title ?? 'worksheet').replace(/[^a-zA-Z0-9 -]/g, '')}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
