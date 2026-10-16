import { describe, expect, it } from 'vitest'

import { ScanFailureKind } from '../../core/hooks/scanAnalysis'
import {
  BEFORE_WORK_DISCLOSURE,
  BEFORE_WORK_UNCERTAINTY,
  BeforeWorkSuitability,
  summarizeBeforeWorkCheck,
  withoutAbilityClaims,
} from './beforeWorkPageCheck'
import type { CertificateScanResult, WorksheetScanResult } from '../../core/types'

/**
 * The prospective answer, and the four ways it is allowed to be wrong.
 *
 * Every case here is a page a parent would actually hold up: one that is far
 * ahead, a blank sheet, something nobody can place, a reply that came back
 * unreadable, and a request that never arrived. None of them may produce a
 * claim about the child, and the three incomplete ones must say so rather than
 * answer from defaults.
 */
const page = (over: Partial<WorksheetScanResult> = {}): WorksheetScanResult => ({
  pageType: 'worksheet',
  subject: 'math',
  specificTopic: 'two-digit addition with regrouping',
  skillsTargeted: [],
  estimatedDifficulty: 'appropriate',
  recommendation: 'do',
  recommendationReason: 'Matches the addition work he is on now.',
  estimatedMinutes: 20,
  teacherNotes: 'Fold the page so only six problems show at a time.',
  ...over,
})

describe('summarizeBeforeWorkCheck — the tentative answer', () => {
  it('reads a page at his level as about right, and keeps the reason and the adaptation', () => {
    const summary = summarizeBeforeWorkCheck(page())
    expect(summary.conclusive).toBe(true)
    expect(summary.suitability).toBe(BeforeWorkSuitability.Workable)
    expect(summary.subjectLine).toBe('math — two-digit addition with regrouping')
    expect(summary.reason).toContain('addition work he is on now')
    expect(summary.adaptation).toContain('only six problems')
    expect(summary.uncertainty).toBe(BEFORE_WORK_UNCERTAINTY)
  })

  it('a page FAR AHEAD is a stretch for today and never a verdict on the child', () => {
    const summary = summarizeBeforeWorkCheck(
      page({
        estimatedDifficulty: 'too-hard',
        recommendation: 'do',
        specificTopic: 'long division with remainders',
        recommendationReason: 'Several steps past the addition he is working on.',
      }),
    )
    expect(summary.suitability).toBe(BeforeWorkSuitability.Stretch)
    expect(summary.conclusive).toBe(true)
    // "too hard for him" is a statement about the page today; "he can't do
    // this" / "he hasn't mastered" is a statement about the child.
    expect(summary.suitabilityLabel).toBe('Looks like a stretch today')
    expect(JSON.stringify(summary)).not.toMatch(/master/i)
  })

  it("a 'skip' recommendation reads as LOOKS EASY — the one inference this door refuses", () => {
    const summary = summarizeBeforeWorkCheck(
      page({ recommendation: 'skip', estimatedDifficulty: 'easy' }),
    )
    expect(summary.suitability).toBe(BeforeWorkSuitability.Easy)
    expect(summary.suitabilityLabel).toBe('Looks easy for today')
    // The retrospective door reads `skip` as "he is past this, advance the
    // workbook". Nothing in this summary says anything of the kind.
    expect(JSON.stringify(summary)).not.toMatch(/master|advance|past this|complete/i)
  })

  it("'modify' and 'challenging' both land on doable-with-a-tweak", () => {
    expect(summarizeBeforeWorkCheck(page({ recommendation: 'modify' })).suitability).toBe(
      BeforeWorkSuitability.NeedsTweak,
    )
    expect(
      summarizeBeforeWorkCheck(page({ estimatedDifficulty: 'challenging' })).suitability,
    ).toBe(BeforeWorkSuitability.NeedsTweak)
  })

  it('a BLANK or unplaceable page is inconclusive, not a guess', () => {
    const blank = summarizeBeforeWorkCheck(
      page({
        pageType: 'other',
        subject: '',
        specificTopic: '',
        recommendation: 'do',
        recommendationReason: '',
      }),
    )
    expect(blank.conclusive).toBe(false)
    expect(blank.suitability).toBe(BeforeWorkSuitability.Inconclusive)
    expect(blank.suitabilityLabel).toBe("Can't tell from this photo")
    expect(blank.reason).toMatch(/doesn’t show enough|blank/i)
  })

  it('an UNKNOWN subject with no topic is inconclusive even when the model sounded sure', () => {
    const unknown = summarizeBeforeWorkCheck(
      page({ subject: 'unknown', specificTopic: '', recommendation: 'do' }),
    )
    expect(unknown.conclusive).toBe(false)
    expect(unknown.suitability).toBe(BeforeWorkSuitability.Inconclusive)
  })

  it('a reply with a verdict the prompt never offered is inconclusive', () => {
    const odd = summarizeBeforeWorkCheck(
      page({ recommendation: 'maybe' as unknown as WorksheetScanResult['recommendation'] }),
    )
    expect(odd.conclusive).toBe(false)
    // It still shows what it could read, so the parent is not told nothing.
    expect(odd.subjectLine).toBe('math — two-digit addition with regrouping')
  })

  it('a certificate answers a different question and is refused as such', () => {
    const certificate: CertificateScanResult = {
      pageType: 'certificate',
      curriculum: 'reading-eggs',
      curriculumName: 'Reading Eggs',
      level: 'Map 13',
      milestone: 'Map 13 complete',
      lessonRange: '121-130',
      skillsCovered: [],
      wordsRead: [],
      date: '',
      childName: '',
      suggestedSnapshotUpdate: { masteredSkills: ['digraphs'], recommendedStartLevel: 4, notes: '' },
    }
    const summary = summarizeBeforeWorkCheck(certificate)
    expect(summary.conclusive).toBe(false)
    expect(summary.reason).toMatch(/certificate/i)
    // The certificate's own mastery suggestion never reaches the screen.
    expect(JSON.stringify(summary)).not.toContain('digraphs')
  })

  it.each([
    [ScanFailureKind.Unreadable, /couldn’t read/i],
    [ScanFailureKind.CutShort, /cut off/i],
    [ScanFailureKind.Refused, /would not look/i],
    [ScanFailureKind.NotDelivered, /request failed/i],
  ])('a %s reply is inconclusive and claims only what is true', (kind, matcher) => {
    const summary = summarizeBeforeWorkCheck(null, { kind })
    expect(summary.conclusive).toBe(false)
    expect(summary.failureMessage).toMatch(matcher)
    // The honest claim: operational rows (rate limit, AI usage, error log) DO
    // exist, so the promise is about learning and progress records only.
    expect(summary.failureMessage).toMatch(/no learning or progress records change/i)
    expect(summary.failureMessage).not.toMatch(/nothing was recorded/i)
  })

  it('a failed request never claims the photo did not reach the AI', () => {
    // The client cannot know: a request can fail after the image was received.
    const summary = summarizeBeforeWorkCheck(null, { kind: ScanFailureKind.NotDelivered })
    expect(summary.failureMessage).toMatch(/may or may not have reached the AI/i)
    expect(summary.failureMessage).not.toMatch(/didn’t reach the AI/i)
  })

  it('no analysis and no named failure still refuses to answer', () => {
    const summary = summarizeBeforeWorkCheck(null)
    expect(summary.conclusive).toBe(false)
    expect(summary.failureMessage).toMatch(/no learning or progress records change/i)
    expect(summary.failureMessage).toMatch(/may or may not have reached the AI/i)
  })
})

describe('the prospective schema’s own honesty fields', () => {
  it('"unclear" — the answer for no recorded evidence to judge against — is inconclusive', () => {
    const summary = summarizeBeforeWorkCheck(
      page({
        estimatedDifficulty: 'unclear' as unknown as WorksheetScanResult['estimatedDifficulty'],
        recommendation: 'unclear' as unknown as WorksheetScanResult['recommendation'],
        recommendationReason: 'No recorded level for this student, so I can’t judge the fit.',
      }),
    )
    expect(summary.conclusive).toBe(false)
    expect(summary.suitability).toBe(BeforeWorkSuitability.Inconclusive)
    // The model's own reason survives — the parent is told WHY it can't say.
    expect(summary.reason).toMatch(/no recorded level/i)
  })

  it('`readable: false` is believed over anything else the reply filled in', () => {
    const summary = summarizeBeforeWorkCheck({
      ...page({ recommendation: 'do', estimatedDifficulty: 'appropriate' }),
      readable: false,
    } as unknown as WorksheetScanResult)
    expect(summary.conclusive).toBe(false)
    expect(summary.subjectLine).toBeNull()
    expect(summary.pageLine).toBeNull()
  })

  it('carries the model’s "what I could not tell" through to the screen', () => {
    const summary = summarizeBeforeWorkCheck({
      ...page(),
      limits: 'The bottom third of the page is cut off.',
    } as unknown as WorksheetScanResult)
    expect(summary.limits).toBe('The bottom third of the page is cut off.')
  })

  it('and an ability claim smuggled into that field is filtered too', () => {
    const summary = summarizeBeforeWorkCheck({
      ...page(),
      limits: 'He has mastered this already.',
    } as unknown as WorksheetScanResult)
    expect(summary.limits).toBeNull()
  })
})

describe('withoutAbilityClaims — the model may not claim ability from the material', () => {
  it('drops the sentence that claims mastery and keeps the one about the page', () => {
    const text = withoutAbilityClaims(
      'He has mastered regrouping. The page has 30 problems in small print.',
    )
    expect(text).toBe('The page has 30 problems in small print.')
  })

  it.each([
    'He already knows this.',
    'Lincoln is proficient in two-digit addition.',
    'The previous lessons are complete.',
    'He no longer needs practice here.',
    'He is at level 3 for phonics.',
  ])('drops "%s" outright', (claim) => {
    expect(withoutAbilityClaims(claim)).toBeNull()
  })

  it('leaves ordinary page talk alone, and treats empty as absent', () => {
    expect(withoutAbilityClaims('Read the instructions aloud; the font is small.')).toBe(
      'Read the instructions aloud; the font is small.',
    )
    expect(withoutAbilityClaims('   ')).toBeNull()
    expect(withoutAbilityClaims(undefined)).toBeNull()
  })

  it('is applied to BOTH model paragraphs the panel shows', () => {
    const summary = summarizeBeforeWorkCheck(
      page({
        recommendationReason: 'He has mastered this already.',
        teacherNotes: 'He knows all of these. Give him the second half only.',
      }),
    )
    expect(summary.reason).toBeNull()
    expect(summary.adaptation).toBe('Give him the second half only.')
  })
})

describe('the disclosure — compact, and true about what is kept', () => {
  it('is three phone-width lines, not a policy page', () => {
    expect(BEFORE_WORK_DISCLOSURE).toHaveLength(3)
    for (const line of BEFORE_WORK_DISCLOSURE) {
      expect(line.length).toBeLessThanOrEqual(110)
    }
  })

  it('says where the photo goes and that neither photo nor answer is saved', () => {
    const text = BEFORE_WORK_DISCLOSURE.join(' ')
    expect(text).toMatch(/sent to the AI/i)
    expect(text).toMatch(/saves neither the photo nor the answer/i)
  })

  it('admits the operational rows that DO remain', () => {
    const text = BEFORE_WORK_DISCLOSURE.join(' ')
    expect(text).toMatch(/logged like any other AI call/i)
    expect(text).toMatch(/AI usage/i)
    expect(text).toMatch(/error entry/i)
  })

  it('claims no quota, no cancellation and no provider-side deletion', () => {
    const text = BEFORE_WORK_DISCLOSURE.join(' ')
    expect(text).toMatch(/Closing doesn’t cancel a request already sent/i)
    expect(text).not.toMatch(/quota|allowance|credits?\b|remaining calls/i)
    expect(text).not.toMatch(/delete|deleted|erase/i)
    expect(text).not.toMatch(/nothing is recorded|nothing was recorded/i)
  })

  it('and the uncertainty line makes the same two claims under every answer', () => {
    expect(BEFORE_WORK_UNCERTAINTY).toMatch(/guess/i)
    expect(BEFORE_WORK_UNCERTAINTY).toMatch(/not a measure of what he knows/i)
    expect(BEFORE_WORK_UNCERTAINTY).toMatch(/No learning or progress records change/i)
    expect(BEFORE_WORK_UNCERTAINTY).not.toMatch(/not a record of anything|nothing was saved/i)
  })
})
