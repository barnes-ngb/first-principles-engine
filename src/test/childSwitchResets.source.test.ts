import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * FIX-232 — the three child-scoped RESETs whose hosts are too heavy to mount,
 * asserted where the property actually lives: the source.
 *
 * The other four rows in this run carry render tests, because their components
 * mount in a few mocks. These three do not: `PlannerChatPage` is 3,900 lines
 * with the whole planner arc behind it, `AvatarAdminTab` reaches eight
 * Firestore collections and two image callables, and `KnowledgeMinePage` pulls
 * the quest session hook. Mounting them would mean a mock surface larger than
 * the fix, and — the `dayStatusSaveReporting` lesson — a render test proves a
 * call-site property only for the paths that test happens to exercise, which is
 * how the original defect survived a green suite in the first place.
 *
 * Each block names its own positive control.
 */

const PLANNER = readFileSync(
  resolve(__dirname, '../features/planner-chat/PlannerChatPage.tsx'),
  'utf8',
)
const AVATAR_ADMIN = readFileSync(
  resolve(__dirname, '../features/settings/AvatarAdminTab.tsx'),
  'utf8',
)
const KNOWLEDGE_MINE = readFileSync(
  resolve(__dirname, '../features/quest/KnowledgeMinePage.tsx'),
  'utf8',
)
const MY_AVATAR = readFileSync(
  resolve(__dirname, '../features/avatar/MyAvatarPage.tsx'),
  'utf8',
)

/** The snapshot listener's body, so the assertions are about that and not the file. */
function snapshotListener(source: string): string {
  const start = source.indexOf('const ref = doc(skillSnapshotsCollection(familyId), activeChildId)')
  expect(start, 'the skill-snapshot listener moved').toBeGreaterThan(-1)
  return source.slice(start, start + 600)
}

describe('UX-334 — a child with no skill snapshot does not inherit his brother’s', () => {
  /**
   * `snapshot` is a PROMPT input: it reaches `buildPlannerPrompt` through the
   * `inputs` object at all three generate paths. The listener's
   * `if (snap.exists())` made it replace-only, so a child with no
   * `skillSnapshots` document was planned against the previous child's working
   * levels and priority skills, with nothing on screen saying so.
   *
   * POSITIVE CONTROL: restore `if (snap.exists()) { setSnapshot(...) }` and the
   * first two cases fail.
   */
  it('clears the snapshot when the document does not exist', () => {
    const listener = snapshotListener(PLANNER)
    // A ternary or an explicit else — what must not survive is a branch that
    // only ever writes and never clears.
    expect(listener).toMatch(/setSnapshot\(\s*snap\.exists\(\)/)
    expect(listener).toMatch(/:\s*null/)
  })

  it('clears the snapshot when the read FAILS, rather than keeping a stale one', () => {
    // A failed read is not an affirmative empty result (UX-329, Codex round 5)
    // — but the only two outcomes available here are "plan with this child's
    // snapshot" and "plan with none", and planning with the WRONG child's is
    // not one of them. So the error arm clears too.
    expect(snapshotListener(PLANNER)).toMatch(/\(\)\s*=>\s*setSnapshot\(null\)/)
  })

  it('clears the snapshot when there is no active child at all', () => {
    expect(PLANNER).toMatch(/if\s*\(!activeChildId\)\s*\{\s*\n\s*setSnapshot\(null\)/)
  })
})

describe('UX-341 — the avatar admin award forms do not re-target on a switch', () => {
  /**
   * `ArmorTab`'s shape (UX-336) on the admin surface, holding more: two typed
   * amounts, a shared reason, and two confirm dialogs whose own buttons call
   * handlers reading the live `activeChildId`.
   *
   * POSITIVE CONTROL: delete the `if (formChildId !== activeChildId)` block and
   * every case below fails.
   */
  it('compares the form’s child against the live one during render', () => {
    expect(AVATAR_ADMIN).toMatch(/const \[formChildId, setFormChildId\] = useState\(activeChildId\)/)
    expect(AVATAR_ADMIN).toMatch(/if \(formChildId !== activeChildId\)/)
  })

  it('clears the draft through the one shared rule, not a second inline list', () => {
    expect(AVATAR_ADMIN).toMatch(/clearedAvatarAdminDraft\(\)/)
    expect(AVATAR_ADMIN).toMatch(/avatarAdminDraftIsEmpty\(/)
    expect(AVATAR_ADMIN).toMatch(/avatarAdminSwitchNotice\(/)
  })

  it('closes BOTH confirm dialogs with the draft', () => {
    // Not cosmetic: *Deduct diamonds* names the child in its text and its own
    // button calls `handleDeductDiamonds` directly, so an open one would read
    // "Remove 10 diamonds from <the other boy>" over a live button — UX-336's
    // Correction dialog exactly. *Regenerate base character* spends a paid
    // image call against whoever is selected when it is confirmed.
    const block = AVATAR_ADMIN.slice(
      AVATAR_ADMIN.indexOf('if (formChildId !== activeChildId)'),
      AVATAR_ADMIN.indexOf('// ── Listen to profile'),
    )
    expect(block).toMatch(/setConfirmDeduct\(false\)/)
    expect(block).toMatch(/setRegenBaseCharConfirmOpen\(false\)/)
    // A green "Awarded 10 XP" left standing under the new boy's name reads as a
    // receipt for him.
    expect(block).toMatch(/setFeedback\(null\)/)
  })

  it('says what went, rather than emptying the form in silence', () => {
    expect(AVATAR_ADMIN).toMatch(/switchNotice &&/)
  })
})

describe('UX-341 / UX-332 — DOC-25: the xpLedger writes are attribution-only', () => {
  /**
   * `CLAUDE.md`'s pre-authorisation covers a change that alters only **whose** a
   * record is. Both of these fixes do less than that — they PREVENT a write
   * rather than re-point one — so the arithmetic must be provably identical.
   *
   * POSITIVE CONTROL: change the `5` in either `addXpEvent` call, or the 200
   * diamond cap, and these fail. That is what makes "no number changed" an
   * assertion rather than a claim.
   */
  it('the Hero Hub daily-armor award is still 5 XP under the same event and key', () => {
    const calls = MY_AVATAR.match(/addXpEvent\([^)]*\)/g) ?? []
    expect(calls.length).toBe(2)
    for (const call of calls) {
      expect(call).toBe(
        "addXpEvent(familyId, childId, 'ARMOR_DAILY_COMPLETE', 5, `armor_daily_${today}`)",
      )
    }
  })

  it('the admin XP adjust still passes the typed delta straight through', () => {
    expect(AVATAR_ADMIN).toMatch(
      /await addXpEvent\(familyId, activeChildId, eventType, delta, dedupKey, meta\)/,
    )
  })

  it('the diamond guards are untouched — the 200 cap and the positive-amount rule', () => {
    expect(AVATAR_ADMIN).toMatch(/amount <= 0 \|\| amount > 200/)
  })

  it('neither surface WRITES skillSnapshots', () => {
    // The rails this run must not touch. `MyAvatarPage` does READ the snapshot
    // — `useChildSkillSnapshot`, for the `canAccessKnowledgeMine` gate — and a
    // read is not the rail; what must be absent is any route to the write, so
    // this names the two writers rather than the word.
    for (const source of [AVATAR_ADMIN, MY_AVATAR]) {
      expect(source).not.toMatch(/skillSnapshotsCollection/)
      expect(source).not.toMatch(/skillSnapshotWrites/)
      expect(source).not.toMatch(/workingLevels/)
      expect(source).not.toMatch(/prioritySkills/)
    }
  })
})

describe('UX-338 — the Knowledge Mine resume card does not outlive its child', () => {
  /**
   * The page has no `ChildSelector` of its own; the shell's chip is the only way
   * the child changes here, which is why `FIX-231` is what made this reachable.
   * Between a switch and the next query's answer the card held the previous
   * boy's partial quest with both buttons live — and *Start fresh* writes
   * `status: 'abandoned'` onto that session, closing out one boy's unfinished
   * quest because a parent tidied up while looking at his brother.
   *
   * POSITIVE CONTROL: delete the `if (resumeChildId !== activeChildId)` block
   * and both cases below fail.
   */
  it('drops the resume card and the picked domain on a child change', () => {
    const block = KNOWLEDGE_MINE.slice(
      KNOWLEDGE_MINE.indexOf('if (resumeChildId !== activeChildId)'),
      KNOWLEDGE_MINE.indexOf('useEffect(() => {\n    if (!activeChildId || !familyId) return'),
    )
    expect(block).toMatch(/setResumeSession\(null\)/)
    expect(block).toMatch(/setActiveDomain\(null\)/)
  })

  it('does it during render, not inside the load effect', () => {
    // That effect also re-runs on `quest.screen`, so clearing there would blank
    // the card every time a parent returned to the intro.
    expect(KNOWLEDGE_MINE).toMatch(
      /const \[resumeChildId, setResumeChildId\] = useState\(activeChildId\)/,
    )
    const effectStart = KNOWLEDGE_MINE.indexOf(
      'useEffect(() => {\n    if (!activeChildId || !familyId) return',
    )
    const compareStart = KNOWLEDGE_MINE.indexOf('if (resumeChildId !== activeChildId)')
    expect(compareStart).toBeGreaterThan(-1)
    expect(compareStart).toBeLessThan(effectStart)
  })
})

describe('UX-332 — the Hero Hub draft does not outlive its child', () => {
  /**
   * `MyAvatarPage` is the fourth too-heavy host: Three.js, a voxel handle, six
   * Firestore listeners and the Stonebridge progress hook. The rule itself —
   * what the notice says and when there is anything to say — is covered
   * behaviourally in `avatarChildSwitch.test.ts`; what belongs here is that the
   * page WIRES it, which is the half a pure test cannot see.
   *
   * The one that crosses a rail is `screenshotData`: `saveToPortfolio` stamps
   * an `artifacts` document with the live `childId` and titles it with the live
   * child's name, while the PNG is a picture of the previous boy's character.
   *
   * POSITIVE CONTROL: delete the `if (hubChildId !== childId)` block and every
   * case below fails.
   */
  it('compares the hub’s child against the live one during render', () => {
    expect(MY_AVATAR).toMatch(/const \[hubChildId, setHubChildId\] = useState\(childId\)/)
    expect(MY_AVATAR).toMatch(/if \(hubChildId !== childId\)/)
  })

  it('drops the captured screenshot and closes its modal', () => {
    const block = MY_AVATAR.slice(
      MY_AVATAR.indexOf('if (hubChildId !== childId)'),
      MY_AVATAR.indexOf('const siblingChild ='),
    )
    expect(block).toMatch(/setScreenshotData\(null\)/)
    expect(block).toMatch(/setShowScreenshotModal\(false\)/)
  })

  it('closes the tuner and clears the two debug overlays', () => {
    const block = MY_AVATAR.slice(
      MY_AVATAR.indexOf('if (hubChildId !== childId)'),
      MY_AVATAR.indexOf('const siblingChild ='),
    )
    expect(block).toMatch(/setTunerOpen\(false\)/)
    expect(block).toMatch(/setHeroAnimationTuning\(\{\}\)/)
    expect(block).toMatch(/setArmorDebugValues\(ARMOR_DEBUG_DEFAULTS\)/)
  })

  it('leaves localProportions to the profile listener — one writer, not two', () => {
    // It already re-seeds from the new child's saved customization before
    // `loading` clears. A second writer here would race it.
    const block = MY_AVATAR.slice(
      MY_AVATAR.indexOf('if (hubChildId !== childId)'),
      MY_AVATAR.indexOf('const siblingChild ='),
    )
    expect(block).not.toMatch(/setLocalProportions/)
  })

  it('says what went, through the shared rule rather than an inline sentence', () => {
    expect(MY_AVATAR).toMatch(/heroHubSwitchNotice\(/)
    expect(MY_AVATAR).toMatch(/childSwitchNotice &&/)
  })
})
