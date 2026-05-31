# London Backlog — the deferral register

> **What this is:** the single register of London's (6yo) experience across the app. It records, surface
> by surface, what works for London **today**, what's deliberately held until it's tuned for him, and
> what isn't built yet — each grounded against the code.
> **Created:** 2026-05-31 · **Companion to:** `docs/review/REVIEW_HOME_BASE.md` (ledger), `CLAUDE.md` ›
> AI Development Operating Model (the Lincoln-first policy).

---

## Principle — Lincoln-first, London minimal

We build **for Lincoln first**. London's account and profile stay live and real, but his experience is
**intentionally minimal**: a surface opens for London only when it has been **tuned for a 6-year-old**.
Until then it's **held** — gated **on capability, never on his name** — and the gap is logged here so
nothing is lost.

This is a deliberate change from the old "London parity" goal (former `FEAT-02`). **Parity is no longer
the target.** New work wires for Lincoln first; London tuning is **deferred to this file, not built
speculatively.** When a surface is genuinely ready for a 6-year-old (or simply doesn't depend on age),
London uses it today.

### Status legend
- **Ready** — works for London today (either tuned for him, or age-independent). The Notes say *why
  it's safe*.
- **Hold-until-tuned** — the feature exists for Lincoln but isn't appropriate for a 6-year-old yet.
  Gate London **out on capability** until it's built for him. The Notes say *what's missing*.
- **N/A** — doesn't apply to the youngest child (e.g. teach-back, which is the older child teaching the
  younger).
- **Not-built** — the feature itself doesn't exist yet for anyone.

> **Gating rule:** capability, never name. `isLincoln` (= `themeStyle === 'minecraft'`) and `ageGroup`
> are **cosmetic/personality** signals and stay as-is; they are *not* access controls. A hold is a
> capability gate (e.g. a reading-level threshold, an explicit `hideMine`), not a `child.name` check.

---

## Register

| Surface | London status | What London would need | Where (code) | Notes |
|---|---|---|---|---|
| **Kid Today — checklist** | Ready | — | `src/features/today/KidTodayView.tsx` (checklist render), `KidChecklist.tsx` | Renders for any active child; the only gates (must-do count, armor gate) are **universal**, not name-gated. Safe: it's the daily floor, age-independent. |
| **Kid Today — XP / diamonds bar** | Ready | — | `KidTodayView.tsx:560-565` (`XpDiamondBar` + `MinecraftXpBar`), `src/core/xp/` | Ungated for London (former FEAT-02 de-gating). Safe: progress display, no reading load. |
| **Kid Today — extra-activity logger** | Ready | — | `KidTodayView.tsx:666` → `KidExtraLogger.tsx` | Renders unconditionally ("I did more!" capture). Safe: low-friction, photo/voice capture, no reading load. |
| **Kid Today — greeting / celebration tone** | Ready | — | `KidTodayView.tsx:102-135` (`getGreeting`, `CELEBRATIONS` vs `MC_CELEBRATIONS`) | Already London-tuned: he gets the generic warm pool, Lincoln gets Minecraft phrasing. Safe by construction. |
| **Knowledge Mine / `/quest`** | **Hold-until-tuned** | A 6-year-old reading-level path: kindergarten content framing, lower/age-shaped level caps, prompts that don't assume Lincoln's reader. | `src/features/quest/workingLevels.ts:49-71` (`computeStartLevel`), `questTypes.ts` (`QUEST_MODE_LEVEL_CAP`), `useQuestSession.ts:491`, prompt builders in `functions/src/ai/chat.ts` | Calibration **is** per-child (reads `skillSnapshot.workingLevels`), so London would get *his* level — but the caps and content framing are identical to Lincoln's and the quest is reading-heavy. **Confirmed first gate target** (see hand-off below). |
| **Teach-back** | **N/A** | — | `KidTodayView.tsx:414` (`showTeachBackSection`), `KidTeachBack.tsx:84` | Pedagogically this is the **older child teaching the younger** (Lincoln teaches London) — London is the audience/learner, not the teacher. The code currently renders a generic teach-back for whatever child is active, but London-**as-teacher** is not a Lincoln-first priority. Not a gap to fill. |
| **Avatar / Hero Hub** | Ready | — | `src/features/avatar/MyAvatarPage.tsx:304-328` (`LONDON_FEATURES`, `themeStyle: 'platformer'`, `ageGroup: 'younger'`), `src/core/types/xp.ts:149-224` (`londonPowerupPrompt` per piece) | **Fully built for London**: his own features, platformer theme, younger body proportions, and dedicated platformer-style armor-piece image prompts. Tier progression is shared logic. Safe — this is a genuinely complete London path. |
| **My Books** | Ready | — | `src/features/books/BookshelfPage.tsx:82-84` (London → `'storybook'` cover default), book editor/reader | No age/name access gate; London gets a storybook (not Minecraft) cover default. **One of London's strongest surfaces** (drawing + book-making). The Kid-Today must-do gate that fronts it is universal, not a London block. |
| **Story Workshop** | Ready | — | `src/features/workshop/WorkshopPage.tsx`, `steps/` | No age/name access gate; story/adventure/card game types all available. London's drawing/story strength makes this a natural Ready surface. Universal must-do gate fronts it, not a London block. |
| **Conundrum** | Ready | — | `src/features/today/KidConundrumResponse.tsx:378,382-385` (`londonPrompt`, `londonDrawingPrompt`), generated in `functions/src/ai/tasks/conundrum.ts:121,130` | **London-tuned**: he gets a simpler `londonPrompt` and a **drawing-first** `londonDrawingPrompt` (photo capture), generated "accessible to a 6-year-old." Safe by construction. |
| **Chapter question pool** | Ready | (Optional) age-shaped question variants | `KidTodayView.tsx` → `KidChapterPool.tsx`, `bookProgress` | Works for London (shared read-aloud pool); no per-child variant, but read-aloud is age-independent and parent-mediated. Untuned but safe. |
| **Reading evaluation** | Ready (infra) | A London learner profile (see below) | `src/features/evaluate/EvaluateChatPage.tsx:566-577` (phonics/comprehension working-level derivation) | The eval → snapshot → working-level flow is per-child and works for London today; what's missing is London's *starting* profile/defaults, tracked as its own row below. |
| **Math evaluation (FEAT-06)** | **Hold-until-tuned** | Reading-style **guided** math eval flow + London calibration. | `EvaluateChatPage.tsx:578-584` (math working-level derivation exists) | Working-level **derivation** for math now exists, but there's no guided math-eval flow at reading parity and no London-specific calibration. Build, don't gate (it's incomplete, not harmful). |
| **Formal London learner profile** | **Not-built** | A London equivalent of Lincoln's defaults (priority skills, supports, stop rules, starting levels). | `src/features/evaluation/lincolnDefaults.ts` (no London equivalent) | `lincolnDefaults.ts` seeds Lincoln; there is **no `londonDefaults`**. Until built, a parent must set London's snapshot manually. Underpins both eval rows above. |
| **Functions — per-child AI context** | Ready (shared) | — | `functions/src/ai/contextSlices.ts:83-84` (charter names both kids), TASK_CONTEXT slices | Context is assembled from London's own `skillSnapshot`/profile; the charter preamble already describes London (6, story-driven). No London-specific slice needed — slices are child-agnostic and fed his data. |
| **Image-gen theming** | Ready (London-aware) | — | `src/features/planner-chat/generateMaterials.ts:40-44` (London → story theme), `xp.ts` `londonPowerupPrompt` | Worksheet and armor image generation already branch to story/platformer styling for London. Safe by construction. |

---

## Counts by status (as of 2026-05-31)

16 surfaces classified:

- **Ready:** 12 — Kid Today checklist, XP/diamonds bar, extra-activity logger, greeting/celebration tone,
  Avatar/Hero Hub, My Books, Story Workshop, Conundrum, Chapter pool, Reading-eval infra, Functions
  per-child context, Image-gen theming. (Most are age-independent or already London-tuned.)
- **Hold-until-tuned:** 2 — Knowledge Mine, Math eval.
- **N/A:** 1 — Teach-back (the youngest is the audience, not the teacher).
- **Not-built:** 1 — Formal London learner profile.

---

## Hand-off — Hold-until-tuned surfaces that need a code gate next

Prioritized. Each is a **small, reviewable follow-up PR** (this run is docs-only — it set policy and the
register, it did not change gating).

1. **Knowledge Mine — gate London out until a 6-year-old reading path exists.** *(confirmed first)*
   - **Tile gate:** `src/features/avatar/MyAvatarPage.tsx:1622` — `<HeroLauncherTiles isLincoln={isLincoln} />`
     → pass `hideMine={<capability check>}`. The `hideMine` prop already exists
     (`src/features/avatar/HeroLauncherTiles.tsx:16,27`), so this is a one-line, clean seam.
   - **Route guard:** `src/app/router.tsx:65` — the `/quest` route (`KnowledgeMinePage`) should redirect
     (e.g. to `/progress` or Hero Hub) when the active child isn't capability-eligible, so the gate holds
     even via a direct link.
   - **Capability signal, not name:** gate on a reading-level / working-level threshold (e.g.
     `skillSnapshot.workingLevels.phonics`), not on `child.name` or `isLincoln`.

2. **Math eval (FEAT-06) — build, don't gate.** No harmful surface to close off; the work is *building*
   the guided math-eval flow + London calibration. Tracked in the ledger as `FEAT-06`. No gate PR needed.

The **Not-built** (London learner profile) and **N/A** (teach-back) rows need no gate — the former is a
build, the latter doesn't apply.
</content>
</invoke>
