# Integration Map — are the features talking?

**Audit date:** 2026-06-01 · **Baseline:** `tsc -b` clean, `npm run lint` clean (docs-only run; no code touched).
**Scope:** trace the core learning loop *as it exists in code*, flag each seam (connected / manual /
lossy / broken), and answer two Lincoln-first questions — **where are the level ceilings**, and **does
the system route by frontier + foundation gaps or just march him up levels?**

This map is the grounding for the §6 ledger rows added in the same run (`FEAT-08`/`FEAT-09`/`FEAT-10`,
plus the `FEAT-07` scope sharpen). Every claim below is cited to a file; nothing is marked
connected/broken without reading the code.

---

## 1. The loop, in one breath

```
        ┌──────────────────────────────────────────────────────────────────────┐
        │                                                                        │
   Eval (reading+math) ──manual "Apply"──▶ skillSnapshots ◀──auto on quest-end── Quest (KM)
        │  findings + workingLevels                │  workingLevels + blocks + priority
        │  + conceptualBlocks                      │
        │                                          ▼
        │                                  Planner (plan CF) ──generated checklist──▶ Today
        │   reads: snapshot (priority skills,      │  reads: snapshot, blocks, scans,    │  checklist items
        │   ADDRESS_NOW blocks → "create targeted  │  activityConfigs, workbookPaces     │  (label/min/subject/
        │   activities"), recentScans (skip/do),   │  NOT childSkillMaps                  │   block/skillTags)
        │   activityConfigs                        │                                     ▼
        ▼                                          │                          engagement emoji ──▶ dayLog
  childSkillMaps (coverage)                        │                          per-item mastery ──▶ dayLog (DROP)
  (read by shellyChat + weeklyReview,              │                          teach-back text ──▶ artifacts (DROP)
   NOT by planner)                                 │                          extra logger ──▶ dayLog + XP/diamonds
                                                   ▼
                              Disposition CF ◀── dayLogs(4wk) + engagement + evals +
                                                 dadLab + chapterResponses
                                                 (NOT teach-back, NOT per-item mastery)

   XP: checklist / quest / extra-logger completion ──auto──▶ xpLedger + avatarProfiles.totalXp
```

**Headline:** the spine is wired and mostly automatic. The snapshot is a genuine hub — both eval and
quest write working levels + priority skills + conceptual blocks into it, and the planner reads it and
**acts** on ADDRESS_NOW blocks. The leaks are at the edges (Today→upstream) and at the **top** (level
ceilings), not in the middle.

---

## 2. Seam-by-seam findings (code-grounded)

### Seam 1 — Eval (reading + math) → snapshot · **CONNECTED, but MANUAL**
- Both domains wired. On `<complete>`, findings → working levels via
  `deriveWorkingLevelFromEvaluation(findings, 'phonics'|'comprehension'|'math')`
  (`EvaluateChatPage.tsx:566-583` → `workingLevels.ts:252-297`). Writes priority skills, supports,
  stopRules, evidenceDefinitions, workingLevels, conceptualBlocks.
- **Manual:** nothing persists until the parent taps **"Apply to Skill Snapshot"** (`handleSaveAndApply`,
  `EvaluateChatPage.tsx:492`, write at `:608`/`:611`). By design (parent reviews eval), but it is the one
  hub-write in the loop that is *not* automatic — quest is.

### Seam 2 — Quest (incl. build-word) → snapshot → planner · **CONNECTED, AUTOMATIC**
- `endSession()` auto-writes snapshot (`useQuestSession.ts:906-1004`): priority skills + working level
  (`computeWorkingLevelFromSession`, `workingLevels.ts:85-140`, manual-override-protected) + conceptual
  block lifecycle advance (`detectBlockersFromSession` → `updateBlockerLifecycle`).
- The new **build-word** encoding type produces findings/working-levels **identically** to
  multiple-choice — no distinct encoding stat is persisted (`questHelpers.ts:41-88`,
  `useQuestSession.ts:153-171`). Decoding and encoding fold into the same phonics signal. (Acceptable for
  Phase 1; flagged so a future encoding-vs-decoding split is a known seam, ties to `FEAT-04` history.)
- Planner *does* read the snapshot the quest writes (Seam 3).

### Seam 3 — Snapshot + workbooks + findings → planner → Today · **CONNECTED, with two drops**
- `plan` task loads (`contextSlices.ts` TASK_CONTEXT `plan`, lines 46-52): `skillSnapshot` (priority
  skills, supports, stopRules, **conceptualBlocks** via `formatConceptualBlocks`), `recentScans`
  (skip/do/modify verdicts), `activityConfigs`, `workbookPaces`, engagement, wordMastery, recentEval. It
  is **not blind**.
- **Drop A — `childSkillMaps` not loaded by planner.** Curriculum coverage is read by `shellyChat` +
  `weeklyReview` only, never by `plan` (`contextSlices.ts:46-52`). Planner can't "suggest the next
  uncovered node." *Already tracked as `FEAT-03` — referenced, not re-logged.*
- **Drop B — plan→Today surface loss.** `contentGuide` and `skipGuidance` are generated per item
  (`plan.ts:99-118,289-310`) and stored on the checklist item, but the Today UI never renders them
  (`TodayChecklist.tsx`/`KidChecklist.tsx` show label/min/subject/block/skillTags only). The planner's
  per-item "skip if mastered / go slow if new" guidance dies on the day log.

### Seam 4 — Today → back upstream · **PARTIAL — two dead-ends**
- **Engagement emoji:** feeds back. Persisted to `dayLog.checklist[].engagement`
  (`TodayChecklist.tsx`); read by both `plan` and `disposition` via `loadEngagementSummary`
  (`contextSlices.ts:374-376`, last 14 days). ✅
- **Extra-activity logger:** feeds back. Writes a `dayLog` checklist item + auto XP + diamonds
  (`KidExtraLogger.tsx:47-92`); engagement default `'engaged'` flows into the summary. ✅
- **Teach-back text — DEAD-END.** Written to `artifacts` + sets `dayLog.teachBackDone`
  (`TeachBackSection.tsx:74-82`), but the *content* is never queried by `disposition` or `plan`
  (`disposition.ts:275-279` loads day logs / labs / chapter responses, **not** artifacts). The North
  Star's "richest learning evidence" is write-only.
- **Per-item mastery (got-it / working / stuck) — DEAD-END.** Collected on each checklist item and stored
  on the day log, but never aggregated into disposition or snapshot (`disposition.ts` ignores the
  `mastery` field). A daily self-assessment signal that nothing consumes.

### Seam 5 — Conceptual blocks (ADDRESS_NOW / RESOLVING / DEFER) → planner & quest · **CONNECTED — NOT display-only**
- States: `ConceptualBlockStatus` = ADDRESS_NOW / RESOLVING / RESOLVED / DEFER
  (`evaluation.ts:49-56`); lifecycle in `blockerLifecycle.ts` (thresholds, 2× weight for targeted
  evidence).
- Detection: pattern analysis across current + ≤5 historical eval sessions
  (`analyzePatterns.ts:114-317`); **requires ≥2 historical sessions** (`analyzePatterns.ts:165`).
- **Planner acts:** ADDRESS_NOW blocks are formatted into the prompt with an explicit instruction —
  *"Conceptual Blocks marked ADDRESS_NOW → create targeted activities"* (`contextSlices.ts:948`,
  formatting `:813-852`). DEFER blocks are labelled "do NOT push on these right now."
- **Quest acts:** 2-3 of 10 questions are deliberately generated to probe ADDRESS_NOW/RESOLVING blocks
  and tagged `targetedBlockerId` (`buildKnownBlockersSection`, `chat.ts:1257-1325`; quest builder filters
  to ADDRESS_NOW/RESOLVING, **excludes DEFER**). Targeted-question evidence is weighted 2× in lifecycle.
- This is the system's real **foundation-routing** mechanism — and it works. Its limits are the routing
  question below, not "display-only."

### Seam 6 — Disposition / Learning Profile · **CONNECTED (broad inputs)**
- Pulls: charter, child profile, engagement (14d), grade results, recent eval history by domain, skill
  snapshot (incl. blocks + working levels), word mastery (shared context, `contextSlices.ts:63-66`) +
  **4-week day logs**, **Dad Lab reports**, **chapter responses** (`disposition.ts:275-279`).
- Does **not** pull teach-back content or per-item mastery (the Seam 4 dead-ends). Otherwise rich.

### Seam 7 — XP / avatar · **CONNECTED, AUTOMATIC**
- Checklist-item completion auto-awards XP (`KidChecklist.tsx:94-100` → `addXpEvent.ts:53-147`); extra
  logger awards XP + diamonds (`KidExtraLogger.tsx:74-81`); quest/book completion route through the same
  `addXpEvent` types. Writes per-event + cumulative `xpLedger` + `avatarProfiles.totalXp`. No manual step.

### Cross-seam — central vs inline snapshot writers · **DRIFT RISK (already `ARCH-12`)**
- Three inline `skillSnapshots` writers (`EvaluateChatPage`, `useQuestSession`, `SkillSnapshotPage`)
  bypass the central `skillSnapshotWrites.ts`. Mostly safe (additive merges), but **supports/stopRules**
  diverge: eval overwrites, quest ignores, SkillSnapshotPage full-replaces — a parent-edited support can
  be clobbered by a later eval Apply. *Tracked as `ARCH-12` — referenced, not re-logged.*

---

## 3. Lincoln's growth loop

### 3a. Level ceilings — all **principled** (content runs out), not arbitrary numbers

| Mode | Range | Cap | At the cap | Raising it requires |
|---|---|---|---|---|
| **Phonics** | 1-8 | **8** (`questTypes.ts:56-60`) | L8 = affixes/morphology; L9-10 in the prompt are deliberately *comprehension*, not phonics (`chat.ts:1387-1396`) | New L9 phonics band **and** relocating the L9=comprehension slot — architecturally entangled |
| **Comprehension** | 1-6 | **6** | L6 = theme / author's purpose / multi-step inference | New L7 deep-analysis question types, defined inline in `chat.ts` (moderate coupling) |
| **Math** | 1-6 | **6** | L6 = fractions / measurement / multi-step word problems | New L7 band in `MATH_CONCEPT_BANDS` (SSOT constant, `levelDefinitions.ts:14-21`) — **cheapest**, auto-propagates |
| **Build-word** | piggybacks phonics 1-6 | **6** (UX rule) | CVCe / vowel-team tiles; prompt *forbids* >L6 ("too hard from tiles", `chat.ts:1508`) | Remove UX rule + add L7-8 morpheme-tile guidance; no cap constant change |
| **Fluency** | passage-based, no levels | n/a | 5-diamond cap per passage | n/a |

**The Lincoln ceiling is real.** At 10, he is plausibly at/over the phonics (8) and comprehension (6)
caps. Once capped, the adaptive engine can only offer **variation within the level** — different words,
same cognitive demand (`questAdaptive.ts:34-43` promotes only while `currentLevel < cap`). "Add more
levels/depth" is mostly a **content + prompt-band** job (new bands + question-type guidance + skill→level
map entries), not a one-line cap bump — and phonics specifically is blocked by the L9=comprehension
design. Math is the cheapest to extend; phonics the most entangled.

### 3b. Foundation routing — **yes, it routes; the spine underneath is still level-linear**
- The system **does** identify and act on foundation gaps: conceptual blocks (Seam 5) drive both
  planner activities and 2-3 targeted quest questions, and the adaptive engine moves **down** on 2 wrong
  just as it moves up on a 3-streak (`questAdaptive.ts:44-56`). So it is **not** a blind march up levels.
- But the routing is an **overlay**, with three evidence-backed limits:
  1. **Detection latency:** blocks need ≥2 historical eval sessions before pattern analysis emits them
     (`analyzePatterns.ts:165`) — a sparsely-evaluated child gets no foundation routing yet.
  2. **No frontier/foundation discrimination in the spine:** `questAdaptive` is pure streak up/down with
     no notion of "extend where strong / shore up where weak" beyond the block-targeted question quota.
  3. **No re-test/expiry:** RESOLVED blocks don't re-surface on a schedule (overlaps the close-the-loop
     gap, `FEAT-07`).
- **Net:** "build the foundation while adding levels" is *half-built* — the foundation half exists
  (blocks), the "adding levels" half is capped (3a). The highest-leverage Lincoln work is **content
  depth at the ceiling**, with foundation-routing hardening second.

---

## 4. Gap table

| Seam | Status | What's missing | Where (file) | Priority |
|---|---|---|---|---|
| Level ceilings (phonics 8 / comp 6 / math 6) | **lossy (caps content)** | New bands + question types + skill-map entries above cap; math cheapest, phonics entangled (L9=comp) | `questTypes.ts:56-60`, `functions/src/ai/chat.ts:1387-1396,1030-1059,1708-1715`, `levelDefinitions.ts:14-21`, `workingLevels.ts:148-236` | **P1 — Lincoln** (`FEAT-08`) |
| Foundation routing | **partial** | Block detection needs ≥2 sessions; spine has no frontier/foundation discrimination; routing is an overlay only | `analyzePatterns.ts:165`, `questAdaptive.ts:34-56`, `chat.ts:1257-1325` | **P2 — Lincoln** (`FEAT-10`) |
| Teach-back content → upstream | **lossy (dead-end)** | Content written to `artifacts` but never read by disposition/plan | `TeachBackSection.tsx:74-82`, `disposition.ts:275-279` | **P2 — coherence** (`FEAT-09`) |
| Per-item mastery → upstream | **lossy (dead-end)** | got-it/working/stuck stored on day log, never aggregated | `TodayChecklist.tsx`, `disposition.ts` (ignores `mastery`) | **P2 — coherence** (`FEAT-09`) |
| Plan `contentGuide`/`skipGuidance` → Today | **lossy** | Generated + stored, never rendered on Today | `plan.ts:99-118,289-310`, `TodayChecklist.tsx`/`KidChecklist.tsx` | **P3 — coherence** (`FEAT-09`) |
| Eval → snapshot | **manual** | Hub-write needs a parent tap (by design; noted, not a defect) | `EvaluateChatPage.tsx:492,608` | P3 — by design |
| `childSkillMaps` → planner | **not loaded** | Planner can't suggest next uncovered node | `contextSlices.ts:46-52` | P2 — *existing `FEAT-03`* |
| Inline vs central snapshot writers | **drift** | supports/stopRules diverge across 3 writers | `skillSnapshotWrites.ts`, `EvaluateChatPage`, `useQuestSession`, `SkillSnapshotPage` | P2 — *existing `ARCH-12`* |
| Close-the-loop (practice story → findings; re-test) | **broken/not-built** | Reading a story yields no findings; no re-test schedule | `docs/FINDINGS_PIPELINE.md` (Known Limitations 2-4) | P1 — *sharpened `FEAT-07`* |
| Build-word encoding vs decoding signal | **lossy (folds together)** | Encoding produces no distinct stat; folds into phonics | `useQuestSession.ts:153-171`, `questHelpers.ts:41-88` | P3 — *`FEAT-04` history* |

---

## 5. Highest-value gaps

**(a) For coherence —** the Today→upstream dead-ends (`FEAT-09`). Teach-back is named in the North Star
as the richest evidence and it's write-only; per-item mastery is a free daily signal nobody reads.
Wiring both into disposition is small and high-trust (read-only consumption of data already captured).

**(b) For Lincoln's growth —** content depth at the ceiling (`FEAT-08`) is the single highest-leverage
item: he is at/over the phonics and comprehension caps and the engine can only re-serve the same level.
Foundation routing already works (blocks), so depth — not routing — is what's actually throttling him.
Foundation-routing hardening (`FEAT-10`) is the natural second once depth exists, so new levels route
intelligently rather than marching linearly.

---

## 6. Recommended build order

1. **`FEAT-08` — content depth at the ceiling (Lincoln-first).** Start with **math** (`MATH_CONCEPT_BANDS`
   is a single SSOT constant — add L7+, it auto-propagates), then **comprehension** L7 (moderate, inline
   in `chat.ts`). Defer **phonics** L9+ until the L9=comprehension entanglement is decided. This is what
   unblocks Lincoln *today*.
2. **`FEAT-10` — foundation-routing hardening (Lincoln-first).** Give the adaptive spine explicit
   frontier/foundation awareness and reduce block-detection latency, so the new depth from step 1 routes
   by gap instead of linearly. Pairs naturally with step 1.
3. **`FEAT-09` — close the Today→upstream drops (cross-cutting).** Read teach-back content + per-item
   mastery into disposition; surface `skipGuidance` on Today. Small, high-trust, makes the loop *feel*
   connected.
4. **`FEAT-07` — close-the-loop automation (cross-cutting, design-first).** Practice-story → findings and
   scheduled re-test. Largest surface, touches the findings pipeline; do it last and design-first.

**Lincoln-first:** `FEAT-08`, `FEAT-10`. **Cross-cutting:** `FEAT-09`, `FEAT-07` (and the existing
`FEAT-03` planner-coverage / `ARCH-12` writer-consolidation items the map references).

> Docs-only audit — no code changed. Builds are human-assigned from these ledger rows, one issue per PR.
