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
| **Knowledge Mine / `/quest`** | **Hold-until-tuned** | A 6-year-old reading-level path: kindergarten content framing, lower/age-shaped level caps, prompts that don't assume Lincoln's reader. | `src/features/quest/workingLevels.ts:49-71` (`computeStartLevel`), `questTypes.ts` (`QUEST_MODE_LEVEL_CAP`), `useQuestSession.ts:491`, prompt builders in `functions/src/ai/chat.ts` | Calibration **is** per-child (reads `skillSnapshot.workingLevels`), so London would get *his* level — but the caps and content framing are identical to Lincoln's and the quest is reading-heavy. **Now held via a reading-snapshot capability gate** (`canAccessKnowledgeMine` in `src/features/quest/knowledgeMineAccess.ts`): no reading skill snapshot → tile hidden + `/quest` redirects to `/today`; **opens automatically once London is evaluated/tuned**. Gate keys on snapshot data, never on name/`isLincoln` (see ARCH-15). |
| **Teach-back** | **N/A** | — | `KidTodayView.tsx:414` (`showTeachBackSection`), `KidTeachBack.tsx:84`, `src/features/today/teachBackRecipient.ts` | Pedagogically this is the **older child teaching the younger** (Lincoln teaches London) — London is the audience/learner, not the teacher. Since **PR #1300** the code renders teach-back **only for a child who has a younger sibling to teach** (`findYoungerSibling`, derived birthdate→grade), so London (youngest) is correctly excluded and no longer sees a stray "I Taught London!" button; the recipient is named dynamically. London-**as-teacher** is not a Lincoln-first priority. Not a gap to fill. |
| **Avatar / Hero Hub** | Ready | — | `src/features/avatar/MyAvatarPage.tsx:304-328` (`LONDON_FEATURES`, `themeStyle: 'platformer'`, `ageGroup: 'younger'`), `src/core/types/xp.ts:149-224` (`londonPowerupPrompt` per piece) | **Fully built for London**: his own features, platformer theme, younger body proportions, and dedicated platformer-style armor-piece image prompts. Tier progression is shared logic. Safe — this is a genuinely complete London path. |
| **My Books** | Ready | — | `src/features/books/BookshelfPage.tsx:82-84` (London → `'storybook'` cover default), book editor/reader | No age/name access gate; London gets a storybook (not Minecraft) cover default. **One of London's strongest surfaces** (drawing + book-making). The Kid-Today must-do gate that fronts it is universal, not a London block. |
| **Story Workshop** | Ready | — | `src/features/workshop/WorkshopPage.tsx`, `steps/` | No age/name access gate; story/adventure/card game types all available. London's drawing/story strength makes this a natural Ready surface. Universal must-do gate fronts it, not a London block. |
| **Conundrum** | Ready | — | `src/features/today/KidConundrumResponse.tsx:378,382-385` (`londonPrompt`, `londonDrawingPrompt`), generated in `functions/src/ai/tasks/conundrum.ts:121,130` | **London-tuned**: he gets a simpler `londonPrompt` and a **drawing-first** `londonDrawingPrompt` (photo capture), generated "accessible to a 6-year-old." Safe by construction. |
| **Chapter question pool** | Ready | (Optional) age-shaped question variants | `KidTodayView.tsx` → `KidChapterPool.tsx`, `bookProgress` | Works for London (shared read-aloud pool); no per-child variant, but read-aloud is age-independent and parent-mediated. Untuned but safe. |
| **Reading evaluation** | Ready (infra) | A London learner profile (see below) | `src/features/evaluate/EvaluateChatPage.tsx:566-577` (phonics/comprehension working-level derivation) | The eval → snapshot → working-level flow is per-child and works for London today; what's missing is London's *starting* profile/defaults, tracked as its own row below. |
| **Math evaluation (FEAT-06)** | **Ready (infra)** | A London learner profile (see row below) — same dependency as Reading eval. | `EvaluateChatPage.tsx:578-584` (math working-level derivation), `:742-746` (live "Evaluate Math" tab), `functions/src/ai/chat.ts:692-824` (guided math diagnostic prompt) | **Reconciled 2026-06-01:** the guided math-eval flow **is** at reading parity and live for Lincoln — a working **Evaluate Math** tab, a server-side diagnostic prompt, and findings → `workingLevels.math` (plus a live Math Quest + scan-derived math levels). The prior "Hold-until-tuned / no guided flow" status was **stale** (FEAT-06 now RESOLVED). What's actually missing is the same thing the Reading-eval row needs: **London's starting profile/defaults** (`londonDefaults`), tracked in the row below. Build, don't gate — incomplete for London, not harmful. **ARCH-16 (2026-06-01):** the Math Quest tile is now gated on `hasMathCalibration` (math working level or `math.`-prefixed priority skill) independently of the Reading quests — so a math-only child (incl. a future math-evaluated London) sees only the Math Quest, never the Reading quests. See hand-off §1 for the open "hold London from the entire Mine" question. |
| **Formal London learner profile** | **Not-built** | A London equivalent of Lincoln's defaults (priority skills, supports, stop rules, starting levels). | `src/features/evaluation/lincolnDefaults.ts` (no London equivalent) | `lincolnDefaults.ts` seeds Lincoln; there is **no `londonDefaults`**. Until built, a parent must set London's snapshot manually. Underpins both eval rows above. |
| **Functions — per-child AI context** | Ready (shared) | — | `functions/src/ai/contextSlices.ts:83-84` (charter names both kids), TASK_CONTEXT slices | Context is assembled from London's own `skillSnapshot`/profile; the charter preamble already describes London (6, story-driven). No London-specific slice needed — slices are child-agnostic and fed his data. |
| **Image-gen theming** | Ready (London-aware) | — | `src/features/planner-chat/generateMaterials.ts:40-44` (London → story theme), `xp.ts` `londonPowerupPrompt` | Worksheet and armor image generation already branch to story/platformer styling for London. Safe by construction. |

---

## Counts by status (as of 2026-05-31)

16 surfaces classified:

- **Ready:** 13 — Kid Today checklist, XP/diamonds bar, extra-activity logger, greeting/celebration tone,
  Avatar/Hero Hub, My Books, Story Workshop, Conundrum, Chapter pool, Reading-eval infra, Math-eval infra,
  Functions per-child context, Image-gen theming. (Most are age-independent or already London-tuned.)
- **Hold-until-tuned:** 1 — Knowledge Mine. (Math eval reclassified Ready (infra) on 2026-06-01 — FEAT-06 RESOLVED.)
- **N/A:** 1 — Teach-back (the youngest is the audience, not the teacher).
- **Not-built:** 1 — Formal London learner profile.

---

## Hand-off — Hold-until-tuned surfaces that need a code gate next

Prioritized. Each is a **small, reviewable follow-up PR** (this run is docs-only — it set policy and the
register, it did not change gating).

1. **Knowledge Mine — gate London out until a 6-year-old reading path exists.** ✅ **Shipped** (capability
   gate on reading-snapshot presence; opens automatically once London is evaluated).
   - **Tile gate:** `src/features/avatar/MyAvatarPage.tsx:1622` — now
     `<HeroLauncherTiles isLincoln={isLincoln} hideMine={hideKnowledgeMine} />`, driven by
     `canAccessKnowledgeMine(skillSnapshot)` via the shared `useChildSkillSnapshot` hook. Held = tile
     absent (no "you can't" messaging).
   - **Route guard:** `src/app/router.tsx:65` — `/quest` is wrapped in `RequireKnowledgeMineAccess`,
     which silently redirects an ineligible child to `/today` (kid home) so a direct link can't bypass
     the tile gate.
   - **Capability signal, not name:** `canAccessKnowledgeMine` (`src/features/quest/knowledgeMineAccess.ts`)
     keys on snapshot calibration data (priority skills / completed program / working levels), **never**
     on `child.name` or `isLincoln`. **Smoke-check after merge:** confirm Lincoln still sees the Mine
     tile and can open `/quest`. Data-gap that forces this shape is tracked as `ARCH-15`.
   - **Per-quest domain gating (ARCH-16, 2026-06-01):** the Mine is a multi-domain hub, so the *entry*
     gate above stays generic but each quest tile is now gated on its **own** domain's calibration —
     `hasReadingCalibration` for the Reading quests, `hasMathCalibration` for the Math Quest. London
     (no calibration anywhere) is still held at entry, unchanged. **Design choice to note:** *if* London
     is later math-evaluated but not reading-tuned, he would enter the Mine and see **only the Math
     Quest** — never the Reading quests (reading calibration absent). That is intentional under
     Lincoln-first / shame-free absence. **Open question for the owner:** if instead you want London held
     from the *entire* Mine until his full experience (incl. math) is tuned for a 6-year-old, that is a
     broader gate (hide the tile whenever `isLincoln` is false / age < N) — flagged here, **not built**,
     pending your call. Build it only on an explicit assignment.

2. **Math eval (FEAT-06) — done (infra); no gate, no build needed for Lincoln.** Reconciled 2026-06-01:
   the guided math-eval flow is already live at reading parity (FEAT-06 **RESOLVED**). No harmful surface
   to gate. The only remainder is London's learner profile (`londonDefaults`) — the **Not-built** row
   below, shared with Reading eval — not a FEAT-06 build.

The **Not-built** (London learner profile) and **N/A** (teach-back) rows need no gate — the former is a
build, the latter doesn't apply.
</content>
</invoke>
