/**
 * Grandparent brief (FEAT-95 §4) — a warm, printable one-pager a parent hands (or
 * mails) to Mimi & Papa before the weekly Story Call. Pure HTML builder,
 * opened + printed via the `window.open` → `print()` pattern the catalog sheet
 * (`catalogSheet.ts`) and printable kit (`printableKit.ts`) already use. No AI call,
 * no writes — a pure `childName` → HTML string.
 *
 * The message is deliberately light on rules and heavy on reassurance: this is real
 * school, don't correct mid-read, never quiz for a score, and the only win that
 * matters is the child wanting to read to you again next week.
 *
 * Greeting is personalized to the Barnes household via {@link STORY_CALL_GRANDPARENTS_LABEL}
 * (FEAT-98) — always correct here, since the brief is only ever handed to Mimi & Papa.
 */

import { STORY_CALL_GRANDPARENTS_LABEL } from './storyCallLabels'

/** Local, self-contained HTML escape (keeps this builder free of cross-feature imports). */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const BRIEF_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Georgia', 'Times New Roman', serif; color: #2a2a2a; background: #fff; line-height: 1.5; }
  .page { max-width: 6.5in; margin: 0 auto; padding: 0.7in 0.6in; }
  h1 { font-size: 26pt; color: #7a4bab; margin-bottom: 4pt; font-family: 'Trebuchet MS', sans-serif; }
  .sub { font-size: 13pt; color: #777; font-style: italic; margin-bottom: 22pt; }
  h2 { font-size: 15pt; color: #7a4bab; margin: 18pt 0 6pt; font-family: 'Trebuchet MS', sans-serif; }
  p { font-size: 12.5pt; margin-bottom: 10pt; }
  ul { margin: 0 0 10pt 20pt; }
  li { font-size: 12.5pt; margin-bottom: 7pt; }
  .win { margin-top: 22pt; padding: 14pt 16pt; border-left: 4pt solid #7a4bab; background: #f7f2fb; font-size: 13pt; }
  .foot { margin-top: 24pt; text-align: center; font-size: 10pt; color: #999; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`

/**
 * Build the printable grandparent brief for `childName`. Returns a complete
 * `<!DOCTYPE html>` string for `window.open` + `print()`. Pure — no writes.
 */
export function buildGrandparentBriefHtml(childName: string): string {
  const name = escapeHtml(childName.trim() || 'your grandchild')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reading with ${name} — a guide for ${STORY_CALL_GRANDPARENTS_LABEL}</title>
  <style>${BRIEF_STYLES}</style>
</head>
<body>
  <div class="page">
    <h1>Reading with ${name} 📖</h1>
    <div class="sub">A little guide for ${STORY_CALL_GRANDPARENTS_LABEL}'s weekly Story Call</div>

    <p>Hi ${STORY_CALL_GRANDPARENTS_LABEL}! Thank you for reading with ${name}. When ${name} reads you a book over the
    call, that <strong>is real school</strong> — it's some of the best learning we do
    all week. You don't have to be a teacher. You just have to be their favorite audience.</p>

    <h2>How to help while ${name} reads</h2>
    <ul>
      <li><strong>Don't correct mid-read.</strong> If ${name} gets stuck on a word,
      wait a few seconds — or gently say the word and move on. Keep the story flowing.</li>
      <li><strong>Never ask "how many did you get right?"</strong> There's no score and
      no test here. A struggle is just a word we haven't practiced yet, not a failure.</li>
      <li><strong>Cheer for the trying,</strong> not just the getting-it-right. "You
      sounded that out!" means more than "correct."</li>
    </ul>

    <h2>When the book is done</h2>
    <p>The <strong>last page gives you a few questions to ask</strong> ${name} —
    favorite parts, what might happen next, the tricky words. Read them right off the
    screen. They're there to get ${name} talking, not to grade the answers.</p>

    <div class="win">
      <strong>The win we're going for:</strong> that ${name} wants to read to you
      <em>again next week</em>. That's it. Everything else takes care of itself. 💜
    </div>

    <div class="foot">First Principles Engine · Story Call</div>
  </div>
</body>
</html>`
}
