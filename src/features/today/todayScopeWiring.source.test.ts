import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { TodayDecision } from './todayScope'

const TODAY_PAGE = readFileSync(resolve(__dirname, './TodayPage.tsx'), 'utf8')
const TODAY_CHECKLIST = readFileSync(resolve(__dirname, './TodayChecklist.tsx'), 'utf8')
const KID_TODAY = readFileSync(resolve(__dirname, './KidTodayView.tsx'), 'utf8')
const CHAPTER_POOL = readFileSync(resolve(__dirname, './ChapterQuestionPool.tsx'), 'utf8')

/**
 * Comments stripped, because the rule is about what the page DOES.
 * `UX-358`'s own note quotes the expression it replaced, and a scan that cannot
 * tell code from prose would make explaining a fix impossible — the failure mode
 * `[ledger-shape]` warns about, where a guard is satisfied by malformed input.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const TODAY_PAGE_CODE = code(TODAY_PAGE)
const KID_TODAY_CODE = code(KID_TODAY)

/**
 * UX-343 and UX-358 — two structural properties of the heaviest write surface in
 * the app, asserted where they live rather than through a render.
 *
 * `TodayPage` mounts around fifty subscriptions and a dozen dialogs; a component
 * test proves these only for the paths that test happens to exercise, which is
 * exactly how the original defects survived a green suite (`UX-352`'s source
 * scan made the same call, one row earlier). What is protected here is a
 * property of the page's WIRING.
 *
 * POSITIVE CONTROLS, one per case: drop a target from the scope guard; remove
 * the `key={scopeKey}` from `TodayChecklist`; put a `UserProfile.` comparison
 * back on the page. Each fails exactly one assertion below.
 */

describe('a change of child or day closes what Today had open (UX-343)', () => {
  it('clears every dialog target the page owns', () => {
    const guard = TODAY_PAGE.slice(
      TODAY_PAGE.indexOf('if (openScopeKey !== scopeKey) {'),
      TODAY_PAGE.indexOf('const handleMoveItemToDay'),
    )
    expect(guard).not.toBe('')
    for (const clear of [
      'setStrandSessionId(null)',
      'setMoveTargetIndex(null)',
      'setSwapTargetIndex(null)',
      'setWatchPickerOpen(false)',
    ]) {
      expect(guard, `scope guard does not clear: ${clear}`).toContain(clear)
    }
  })

  it('says what it closed rather than closing it silently', () => {
    // RESET's second half. A dialog that vanishes on a switch is the same defect
    // with the evidence removed.
    expect(TODAY_PAGE).toMatch(/todayScopeResetNotice\(/)
    expect(TODAY_PAGE).toMatch(/setSnackMessage\(notice\)/)
  })

  it('keys the checklist on the scope, so its own drafts cannot outlive it', () => {
    // A typed review note, a half-filled new row, a row's photo dialog and the
    // lesson-video search with its hours logger all live inside this component
    // and all write with the live child and date.
    expect(TODAY_PAGE).toMatch(/key=\{scopeKey\}/)
    expect(TODAY_PAGE).toMatch(/onOpenDecisionsChange=\{/)
  })

  it('keys EVERY card that holds a draft, not only the checklist', () => {
    // Codex round 2 (P1): the chapter pool is mounted outside `TodayChecklist`,
    // so keying the checklist alone left a typed chapter note standing across a
    // child switch, ready to be written onto the newly-selected child's
    // `bookProgress`. Both cards must carry the key AND report their open set,
    // or the notice names fewer things than were closed.
    const keyed = TODAY_PAGE_CODE.match(/key=\{scopeKey\}/g) ?? []
    const reporting = TODAY_PAGE_CODE.match(/onOpenDecisionsChange=\{/g) ?? []
    expect(keyed.length).toBe(2)
    expect(reporting.length).toBe(2)
    expect(CHAPTER_POOL).toContain('TodayDecision.ChapterNote')
  })

  it('reports every one of the checklist decisions the vocabulary names', () => {
    // The four that live in `TodayChecklist` must actually be reported up, or
    // the notice names fewer things than were closed.
    for (const decision of [
      TodayDecision.LessonVideo,
      TodayDecision.AddPhotos,
      TodayDecision.GradeNote,
      TodayDecision.AddItem,
    ]) {
      const member = Object.entries(TodayDecision).find(([, v]) => v === decision)![0]
      expect(
        TODAY_CHECKLIST,
        `TodayChecklist never reports TodayDecision.${member}`,
      ).toContain(`TodayDecision.${member}`)
    }
  })

  it('keeps the Life Day card keyed the same way it already was', () => {
    // The precedent this fix follows, and a regression guard on it.
    expect(TODAY_PAGE).toMatch(/key=\{`\$\{selectedChildId\}_\$\{today\}`\}/)
  })
})

describe('the capability boundary has one definition (UX-358)', () => {
  it('TodayPage names no profile member — it reads the shared answers', () => {
    // `isKidProfile` was a hand-written copy of `useActiveChild().isChildProfile`
    // and `canEditLiveDay` a hand-written copy of `useProfile().canEdit`, on the
    // page that writes nine collections. This repo's standing rule is never to
    // hand-write the member list (`resolveDailyBudget`, `SECTION_FOR_TYPE`,
    // `DAY_TYPE_SHAPE`).
    expect(TODAY_PAGE_CODE).not.toMatch(/UserProfile\./)
    expect(TODAY_PAGE_CODE).toMatch(/isChildProfile: isKidProfile/)
    expect(TODAY_PAGE_CODE).toMatch(/const canEditLiveDay = canEdit/)
  })

  it('the kid view consumes the failed-read flag too (UX-356a, round 2)', () => {
    // Without it his chapter row fell through to the ordinary "a grown-up will
    // add questions" state, presenting a failed read as a book nobody started —
    // on the half of the app that cannot read an error log.
    expect(KID_TODAY_CODE).toMatch(/loadFailed: bookProgressFailed/)
    expect(KID_TODAY_CODE).toMatch(/bookProgressFailed \?/)
  })

  it('the kid artifact list is scoped, and its failure does not need an empty list', () => {
    // Codex round 2 (P2): stale items from another day must never render as this
    // day's, and a refresh that fails must say so even when the list is full.
    expect(KID_TODAY_CODE).toMatch(/artifactScopeRef\.current !== scope/)
    expect(KID_TODAY_CODE).toMatch(/\{artifactsFailed \? \(/)
  })

  it('the kid view reads its capability from the same hook', () => {
    expect(KID_TODAY_CODE).toMatch(/isChildProfile/)
    expect(KID_TODAY_CODE).not.toMatch(/UserProfile\./)
  })
})
