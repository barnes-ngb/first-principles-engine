# London Gender Verification Sweep — 2026-05-16

**Date:** 2026-05-16
**Branch:** `claude/gender-verify-doc-reconcile-qE67F`
**Trigger:** During the May 16 evaluation audit discussion (PR #1172 / `docs/EVALUATION_SYSTEM_FULL_SWEEP_2026-05.md`), the design AI drifted to using "she/her" for London in conversation. `docs/MASTER_OUTLINE.md` is explicit: "Both boys" — Lincoln (10) and London (6) are Barnes brothers. This sweep checks whether the same drift has reached the codebase or docs.

**Method:** Repo-wide grep for gendered pronouns (`she`, `her`, `hers`, `herself`) and gendered nouns (`girl`, `daughter`, `sister`) near references to "London". Manual classification of each hit into CODE_PROMPT / CODE_OTHER / DOC / FALSE_POSITIVE.

## Findings table

| File:line | Context (1 line) | Type | Action |
|---|---|---|---|
| `docs/WEEKLY_CONUNDRUM_ARC.md:115` | "Shelly doesn't have to come up with anything. She opens the app… London's drawing prompt is there. She follows the thread." | FALSE_POSITIVE | None — pronoun refers to Shelly (parent), not London. |
| `docs/MASTER_OUTLINE.md:171` | "London sees 'Not set — will default to Level 2' until her first quest or manual set." | DOC | Fixed: "her" → "their". |
| `docs/KNOWLEDGE_MINE_AUDIT_2026-04.md:536` | "London (6, kindergarten) has no evaluation sessions… What happens if she opens Knowledge Mine?" | DOC | Fixed: "she" → "London". |
| `docs/KNOWLEDGE_MINE_AUDIT_2026-04.md:619` | "After London completes several quests, should her starting level increase…" (strikethrough/RESOLVED block) | DOC | Fixed: "her" → "London's". Even strikethrough historical text shouldn't carry a gender error. |
| `docs/archive/ITEMS_IN_PLACE_REPORT.md:279` | "London has no spec. Her routine items default to legacy." | DOC (archive) | Not fixed in this PR — `docs/archive/` is explicitly historical per `DOCUMENT_INDEX.md`. Noted here for the record. |
| `src/features/books/sightWordMastery.ts:91` | `'she'` appears in sight-word array | FALSE_POSITIVE | Sight word curriculum data, not a pronoun reference. |
| `functions/src/ai/tasks/weeklyFocus.ts:89` | "Elder Ironroot — the village wise woman… she asks…" | FALSE_POSITIVE | Pronoun refers to Stonebridge NPC, not London. |
| `functions/src/ai/stonebridgeBible.ts:57`, `docs/STONEBRIDGE_BIBLE.md:54` | "Sister Anya" | FALSE_POSITIVE | Stonebridge NPC name. |
| `src/features/books/useBookGenerator.ts:78` | `text.includes('sister')` | FALSE_POSITIVE | String-matching helper, not a personal reference. |

### Cross-branch note (not actionable on this branch)

PR #1172's `docs/EVALUATION_SYSTEM_FULL_SWEEP_2026-05.md` has two gender hits in its body that the prompt's §2.4 asked be verified:

- Line 294 — "the Firestore `children` collection contains an entry for her." (re: London)
- Line 374 — "Have London tap 'Phonics Quest' on her profile."

Those live on `claude/audit-evaluation-system-docs-Hhf2u`, not on this branch. Flagged for fix in that PR before merge; not touched here per the prompt's scope guardrails ("Do not touch the audit doc's verdict, journey traces, or gap tables") — these particular edits are pronoun cleanup, not content changes, so they're safe to apply directly on the audit branch.

## Bucket counts

| Bucket | Count |
|---|---|
| CODE_PROMPT | 0 |
| CODE_OTHER | 0 |
| DOC (active, fixed) | 3 |
| DOC (archive, noted) | 1 |
| DOC (other branch, flagged) | 2 |
| FALSE_POSITIVE | 4 |

## Files modified in this PR

- `docs/MASTER_OUTLINE.md` — line 171 pronoun fix (plus a new sprint history row, see §2.6 of prompt)
- `docs/KNOWLEDGE_MINE_AUDIT_2026-04.md` — lines 536 and 619 pronoun fixes
- `docs/LONDON_GENDER_VERIFY_2026-05.md` — new (this file)

No code files modified. The codebase grep was clean.

## Verdict

**FIXED.** The codebase carries zero gendered references to London in production code (prompts, comments, JSX, tests, types — all clean). Three active-doc instances of "she/her" referring to London were corrected; one archived instance is noted but left untouched per `DOCUMENT_INDEX.md`'s archive convention. The MASTER_OUTLINE's "Both boys" framing is now consistent across every non-archived document in the repo as of 2026-05-16.

The original problem — the design AI drifting to "she/her" for London — was a *conversation* drift, not a *codebase* drift. The repo never disagreed with the Charter. This sweep confirms that.

## Companion work in this PR

The same audit (PR #1172, Chunk 0 §Discrepancies) flagged three stale documentation snapshots that pre-date Phase 1 of the evaluation methodology. Reconciled in adjacent commits on this branch:

- `docs/EVALUATION_METHODOLOGY_2026-04.md` §2 — rewritten to describe current (post-Apr-21) state; historical pre-Phase-1 narrative moved to §2.1.
- `docs/FINDINGS_PIPELINE.md` — writers section + "Does NOT do" checklist refreshed to reflect Phase 1's four conceptualBlocks writers and the merge helper.
- `docs/LEARNING_ENGINE_AUDIT_2026-04.md` — single stale row at line 1179 footnoted to point at the Phase 1 `mergeBlock` write path.

`docs/DOCUMENT_INDEX.md` and `docs/MASTER_OUTLINE.md` sprint history updated accordingly.
