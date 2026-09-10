# Finding-tag bridge census — 2026-09-10 (AUDIT-226)

**Status: CURRENT.** The registry of every skill tag this app can hand
`mapFindingToNode`, where each one lands, and why. It closes `UX-346`, `UX-347`
and `UX-348`, and it is enforced: `src/test/findingTagBridge.invariant.test.ts`
fails closed when a tag joins the universe unclassified, when a row goes stale
against the source, or when any tag resolves into a domain it does not name.

Every number below is printed by `npm run census:finding-tags` and pasted from
it, per `CLAUDE.md`'s derived-numbers rule. Nothing here is hand-counted.

---

## 1. Why this exists: the technique was the bug, not the entries

`mapFindingToNode` is the one route from a **skill tag** — what an evaluation, a
quest or a priority skill says a child was assessed on — to a **curriculum
node**, and from there, through `foundations/curriculumNodeBridge`, to a
**foundations concept**, where `applyEvalFindingsToModel` may move that concept
UP *or DOWN*. It is the narrowest place in the whole learning engine, and the
only one a guided evaluation passes through.

Its keyword fallback was an ordered chain of `norm.includes(keyword)` tests over
a tag whose separators had been **stripped**. That technique produced at least
three independent defects, and **two of the three were found by accident** by a
run doing something else:

| Filed | The defect | Found by |
|---|---|---|
| `UX-347` | `writing.paragraph` → `math.data.graphs`, because "para**graph**" contains `graph` and the math tests ran first. Unlike `UX-288`'s pair, that target **is** a real foundations concept, so nothing downstream filtered it: a writing finding was written as evidence about reading charts, on the one writer permitted to downgrade | FIX-224, while writing a boundary test for something else |
| `UX-346` | `math.number-sense` — the **first** tag in the evaluation prompt's own math list, Level 1, the floor of the whole ladder — resolved to nothing at all | FIX-224, while deriving UX-288's coverage |
| `UX-348` | `math.wordProblems` answered the band-**5** multi-step concept while the owner-curated `tagConceptBridge` answers the band-**1-2** one-step concept, and nothing compared the two | FIX-224, answering a Codex round |

A fourth, in `curriculumNodeBridge` rather than here, is the same trap:
`math.subtraction.noRegroup` reads as `regroup` once the hyphen is gone, so a
negation matched the thing it negates and marked the **harder** concept solid for
a child who had demonstrated the opposite (Codex round 1 on FIX-224).

Repairing three entries would have left the fourth undiscovered. So this document
does to the tag bridge what `CHILD_SWITCH_SURFACE_CENSUS_2026-09.md` did to the
child-switch class: enumerate the whole surface from the source, classify every
entry, fix what is wrong, and leave a guard that fails when a new tag joins
unclassified. That pattern worked — it is why the child-switch P1 count is zero.

### What was changed

- **The matching rule.** `src/core/curriculum/tagPhrases.ts` is now the ONE
  answer to *does this tag name this thing*, shared by this bridge's keyword
  fallback and `curriculumNodeBridge`'s detail resolvers. A tag is split into
  words on every separator **and** on each camelCase hump, re-joined into every
  contiguous **phrase**, and a keyword matches only as a **prefix of a whole
  phrase**. `graph` is not a prefix of `paragraph`, so `UX-347` is closed by
  construction rather than by re-ordering the tests that exposed it. Prefix
  rather than equality, because the tables' vocabulary is deliberately stemmed
  (`measur`, `multipl`, `divis`, `rhym`) — pinned both ways by
  `tagPhrases.test.ts`, whose first block re-creates the old technique in three
  lines as the run's positive control.
- **The chain became a declared table**, so its order is data a test can
  enumerate. One order rule is mechanical and asserted: *no keyword may be a
  prefix of an earlier-declared keyword*, since the earlier one always wins —
  which is why `cvce` is now declared before `cvc` and `times` before `time`.
  The rest is stated in prose and pinned by named test (`repeatedaddition`
  before `addition`, because repeated addition **is** multiplication).
- **A domain anchor.** A tag whose leading segment declares a domain may not
  resolve outside it. There is exactly one lane and **it is gated on the tag, not
  on its domain**: a `writing.*` tag that *names spelling* may reach a `reading.*`
  node, the lane `deriveWorkingLevelMastery` already permits ("spelling a CVC
  word implies you can decode it"), and it is one-directional.
  **Codex round 1 on PR #1827 is why the gate exists** (P1): the first version
  allowed the pairing at the domain level, which is a much wider claim than the
  justification supports — `writing.fluency` reached `reading.fluency.accuracy`
  and `writing.inference` reached `reading.comprehension.inference`, both real
  foundations concepts, so a writing evaluation could update or **downgrade** an
  unrelated reading one. That is `UX-347`'s exact shape, reintroduced by the
  guard written to stop it. **The anchor changes no answer for any of the 177
  tags below** — it is a guard against the tags the universe does not yet
  contain, `writing.paragraph` being exactly one of those.
- **The curated table is now the authority, not merely something to agree
  with.** Where `tagConceptBridge` has a non-empty answer it is taken verbatim
  and the derived route is not consulted — which is `UX-348`. An **empty** entry
  is the declared curation gate ("not decided yet") and does not suppress a
  working derived route. Agreement is still asserted, against the exported
  `derivedFoundationConcepts`, because *"the curated answer wins"* and *"the
  derived route would have said the same"* are different claims and only the
  second catches the next `UX-348`.
- **Narrowing.** Four curriculumMap ids that **are** foundations concepts carry
  more specific concepts underneath them, and the coarse id is the harder one.
  `curriculumNodeBridge` now reads the tag's own detail *before* the passthrough:
  `math.problemSolving` → `oneStep`, `math.number.counting` →
  `digitRecognition` / `comparison` / `skipCount`, `math.measurement.time` →
  `money`, `math.fractions.concepts` → `compare`. The last two were found by
  **this census**, not by a report.

### What was NOT changed

`mapFindingToNode`'s contract: **it answers with `curriculumMap` node ids and
nothing else.** `curriculumMap.ts`, both skill-map writers and the stored
`childSkillMaps` entries are untouched, and FIX-224's source scan — which fails
if a skill-map writer ever reads the foundations module — is still green. Every
narrowing target above (`math.problemSolving.oneStep`,
`math.number.digitRecognition`, `math.measurement.money`,
`math.fractions.compare`) exists **only** in the foundations graph, which is why
that is where the repair had to be: the skill map keeps recording the coarse
node, which is the only answer the curriculum map has.

---

## 2. The five verdicts

Every row declares one, **and says why in the same cell** — an unexplained
verdict is the row that comes back as a P1, which AUDIT-222 wrote down and then
proved by having three of its own rows overturned by a review round.

| Verdict | It means | Example |
|---|---|---|
| **CORRECT** | it lands on the node, and the concept, the tag names | `math.subtraction.within-20` → `math.operations.subWithin20` |
| **DROPPED-RIGHT** | it reaches no foundations concept, and that is right — because no such node exists, because the domain has no foundations half, or because the tag names several concepts and choosing one would be a guess | every `speech.*` tag; `math.number-sense` |
| **DROPPED-WRONG** | it resolves to nothing while a real node names it (`UX-346`'s class) | `literal-recall`, with `reading.comprehension.explicit` sitting right there |
| **MIS-ROUTED** | it lands on a concept the tag does not name (`UX-347` / `UX-348`'s class — **the dangerous one, because it writes**) | `multiplication.fluency` → a *reading* node |
| **CURATED** | `tagConceptBridge` owns the answer and it is taken verbatim | `math.wordProblems` → `math.problemSolving.oneStep` |

**On the reason text.** A row that carries a finding has a reason written for it.
A row in a mechanical class — every `speech.articulation.*` tag, every
working-level key that lands on the node its level-mates already write — carries
its class's reason, worded once and repeated, so that each row is still readable
on its own and no cell is blank. Which rows are which is visible at a glance: the
class reasons are the repeated ones.

---

## 3. The tag universe is not one list

Four sources, each **derived** from the code rather than copied into this
document — the lesson of FIX-224, whose first hand-copied probe list was wrong
twice on two consecutive review rounds.

| Source | What it is | Count | Reaches the learner model? |
|---|---|---|---|
| `prompt-list` | the three `SKILL TAGS` blocks in `functions/src/ai/chat.ts` — what an evaluation or quest is **told** to emit | 52 | yes |
| `prompt-example` | the `"skill": "…"` literals in the same prompts, placeholders excluded. **The reading evaluation has no `SKILL TAGS` block at all**, so its examples are the only statement of its vocabulary that exists | 11 | yes |
| `catalog` | `skillTags.ts`'s `ALL_SKILL_TAGS`, carried by a `prioritySkill` into `seedLearnerModel`'s Gate 3 | 22 | yes |
| `level-map` | the keys of the five `skillLevelMaps.ts` maps, which `deriveWorkingLevelMastery` hands to the bridge directly | 96 | **no** — `childSkillMaps` only |

**177 distinct tags** in total (some appear in more than one source). **81** of
them can reach a foundations concept; the other 96 are working-level keys, whose
`curriculumNodeBridge →` column is therefore informational and is marked
`n/a — never reaches it` in the eval column.

---

## 4. What the survey found

Derived by `npm run census:finding-tags`:

| | Before FIX-226 | After |
|---|---|---|
| tags that resolve to **no curriculum node at all** | 39 | 35 |
| foundations concepts the whole tag universe can reach | **28 of 60** | **35 of 60** |
| tags reaching the learner model that are **kept** | 52 | 53 |
| tags reaching the learner model that are **dropped** | 29 | 28 |
| tags resolving **outside the domain they declare** | 1 (`writing.paragraph`, unenumerated) | **0** |

The headline is the second row, and it is not the first: what changed is mostly
**which** concept a finding lands on, not how many findings land. Seven concepts
became reachable and none stopped being reachable:

`math.fractions.compare` · `math.measurement.money` · `math.number.comparison` ·
`math.number.digitRecognition` · `math.operations.arrays` ·
`math.problemSolving.oneStep` · `reading.phonemic.hearSounds`

By verdict, over the 177 rows in §5:

| Verdict | Rows |
|---|---|
| **CORRECT** | 106 |
| **DROPPED-RIGHT** | 46 |
| **CURATED** | 9 |
| **DROPPED-WRONG** | 8 |
| **MIS-ROUTED** | 8 |

**Sixteen rows still carry a defect, and none of them is a mis-route that
writes a foundations concept the tag does not name.** All eight MIS-ROUTED rows
are either contained by their only caller's own domain filter
(`multiplication.fluency`) or a coarse collapse inside the right domain (the
comprehension family, seven rows) — and all sixteen are filed as `UX-350`, with
the reasons in §6 rather than fixed here.

---

## 5. The registry

One row per tag. Columns 2-5 are **derived** and are compared against the live
source on every test run, so a row cannot go stale; columns 6-7 are the
judgement. Sorted by tag.

| Tag | Where it comes from | `mapFindingToNode` → | `curriculumNodeBridge` → | `computeEvalRead` | Verdict | Severity |
|---|---|---|---|---|---|---|
| `addition-within-20` | level-map | `math.operations.addSub` | `math.operations.addWithin20` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.addSub` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `addition.within-20` | level-map | `math.operations.addSub` | `math.operations.addWithin20` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.addSub` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `basic-division` | level-map | `math.operations.multDiv` | `math.operations.division` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.multDiv` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `blend` | level-map | `reading.phonics.blends` | `reading.phonics.blends` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.blends` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `blends` | level-map | `reading.phonics.blends` | `reading.phonics.blends` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.blends` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `borrowing` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — a synonym of its level-mates `subtraction.regrouping` / `multi-digit.subtraction` (L7), which already write `math.operations.addSub` | — |
| `cause-effect` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — the curriculum map has no cause-effect node; its level-mate `inference` (L4) maps, so L4 is not silent | — |
| `character` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — the curriculum map has no character node (the foundations graph does, and a working-level key cannot reach it); its level-mate `main-idea` (L3) maps, so L3 is not silent | — |
| `compare-contrast` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — the curriculum map has no compare/contrast node. **Comprehension L5 therefore contributes nothing**, since `theme` is its only other key and also drops — filed as UX-350 | P3 |
| `composition.sentence` | level-map | `writing.composition.sentence` | — (outside-domain) | n/a — never reaches it | **CORRECT** — lands on `writing.composition.sentence`, the node the tag names. A working-level key reaches `childSkillMaps` only, so the foundations boundary never applies to it | — |
| `consonant-blend` | level-map | `reading.phonics.blends` | `reading.phonics.blends` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.blends` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `consonant-digraph` | level-map | `reading.phonics.digraphs` | `reading.phonics.digraphs` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.digraphs` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `conventional` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-WRONG** — `writing.mechanics.conventionalSpelling` is a live curriculumMap node that this L6 spelling key names almost word for word, and nothing points at it; filed as UX-350 | P3 |
| `counting` | level-map | `math.number.counting` | `math.number.counting` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.number.counting` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `critical-thinking` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-WRONG** — `reading.critical.evaluate` and `reading.comprehension.analysis` are both live curriculumMap nodes. No comprehension L6 key maps, so that level contributes nothing; filed as UX-350 | P3 |
| `cvc` | level-map | `reading.phonics.cvc` | `reading.phonics.cvc` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.cvc` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `cvce` | level-map | `reading.phonics.longVowels` | `reading.phonics.longVowels` (direct) | n/a — never reaches it | **CORRECT** — FIXED by FIX-226. `cvc` is a prefix of `cvce`, so the shorter keyword always won and this L5 key was recorded on the L2 CVC node; the ordering rule now declares `cvce` first. Its level-mate `long-vowel` already wrote this node, so no stored answer moves | — |
| `digit-recognition` | level-map | `math.number.counting` | `math.number.digitRecognition` (detail-narrowed) | n/a — never reaches it | **CORRECT** — FIXED by FIX-226 with UX-346. It used to resolve to nothing; the skill map now gets `math.number.counting`, the only Level-1 number node the curriculum map has, and the concept column shows the narrowing that would apply if this key reached the foundations side | — |
| `digraph` | level-map | `reading.phonics.digraphs` | `reading.phonics.digraphs` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.digraphs` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `digraphs` | level-map | `reading.phonics.digraphs` | `reading.phonics.digraphs` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.digraphs` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `diphthong` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — the curriculum map defines no diphthong node, so there is nothing to point at. The foundations graph does (`reading.phonics.diphthongs`) but this function answers with curriculumMap ids by contract. **Its consequence is a real gap**: no phonics L7 key maps, so that whole working level contributes nothing to `childSkillMaps` — filed as UX-350 | P3 |
| `diphthongs` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — as `diphthong` — the curriculum map defines no diphthong node. Phonics L7 contributes nothing at all as a result; filed as UX-350 | P3 |
| `division.basic` | level-map | `math.operations.multDiv` | `math.operations.division` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.multDiv` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `doubles` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — a strategy inside addition-within-20; its level-mates (L2) already write `math.operations.addSub`, the only node the map has | — |
| `evaluation` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-WRONG** — `reading.critical.evaluate` is a live node and nothing points at it. Part of the comprehension-L6 gap filed as UX-350 | P3 |
| `fact-family` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — its level-mates (L3) already write `math.operations.addSub`. The foundations graph does have `math.operations.factFamilies`, but a working-level key never reaches the foundations side, so nothing is lost by the drop | — |
| `final-stable` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — no node exists in either map for final-stable syllables. Part of the phonics-L7 gap filed as UX-350 | P3 |
| `fractions` | level-map | `math.fractions.concepts` | `math.fractions.concepts` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.fractions.concepts` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `fractions.comparing` | level-map | `math.fractions.concepts` | `math.fractions.compare` (detail-narrowed) | n/a — never reaches it | **CORRECT** — FIXED by FIX-226 with `math.fractions.comparing`. A working-level key, so the concept column is informational | — |
| `fractions.operations` | level-map | `math.fractions.concepts` | `math.fractions.concepts` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.fractions.concepts` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `fractions.recognizing` | level-map | `math.fractions.concepts` | `math.fractions.concepts` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.fractions.concepts` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `inference` | level-map | `reading.comprehension.inference` | `reading.comprehension.inference` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.comprehension.inference` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `larger-subtraction` | level-map | `math.operations.addSub` | — (no-detail) | n/a — never reaches it | **CORRECT** — a working-level key: the skill map gets `math.operations.addSub`, which is the right node. The `no-detail` is informational, since this key never reaches the foundations side | — |
| `le-ending` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — neither map defines a final-stable-syllable node, so there is nothing to point at. Part of the phonics-L7 gap filed as UX-350 | P3 |
| `le-endings` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — as `le-ending` — no node exists in either map. Part of the phonics-L7 gap filed as UX-350 | P3 |
| `letter-recognition` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — the curriculum map has one letter node, `reading.phonics.letterSounds`, which its level-mate `letter-sounds` (L1) already writes — so the drop changes no answer | — |
| `letter-sounds` | level-map | `reading.phonics.letterSounds` | `reading.phonics.letterSounds` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.letterSounds` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `literal-recall` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-WRONG** — `reading.comprehension.explicit` is exactly what literal recall names, and it is a live node in both maps. No comprehension L1 key maps, so a child at comprehension level 2+ has no L1 node marked mastered — filed as UX-350 | P3 |
| `long-vowel` | level-map | `reading.phonics.longVowels` | `reading.phonics.longVowels` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.longVowels` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `main-idea` | level-map | `reading.comprehension.explicit` | `reading.comprehension.explicit` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.comprehension.explicit` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `making-10` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — a strategy inside addition-within-20; its level-mates (L2) already write `math.operations.addSub` | — |
| `math.addition.facts` | catalog | `math.operations.addSub` | `math.operations.addWithin20` (curated) | kept | **CURATED** — `tagConceptBridge` owns this pair and its answer is taken verbatim; the derived route agrees with it, asserted over the whole curated table rather than row by row | — |
| `math.addition.within-20` | prompt-list + prompt-example | `math.operations.addSub` | `math.operations.addWithin20` (detail-resolved) | kept | **CORRECT** — `math.operations.addSub` is a curriculumMap-only id, and the tag's own detail names `math.operations.addWithin20`, which `curriculumNodeBridge` resolves it to (FIX-224) | — |
| `math.division.basic` | prompt-list | `math.operations.multDiv` | `math.operations.division` (detail-resolved) | kept | **CORRECT** — `math.operations.multDiv` is a curriculumMap-only id, and the tag's own detail names `math.operations.division`, which `curriculumNodeBridge` resolves it to (FIX-224) | — |
| `math.fractions.comparing` | prompt-list | `math.fractions.concepts` | `math.fractions.compare` (detail-narrowed) | kept | **CORRECT** — FIXED by FIX-226, and found by this census. The curriculum map has only `concepts` and `operations`, so comparing fractions was recorded as understanding what a fraction is; the foundations graph has `math.fractions.compare` and now gets it | — |
| `math.fractions.operations` | prompt-list | `math.fractions.operations` | `math.fractions.operations` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `math.fractions.operations` | — |
| `math.fractions.recognizing` | prompt-list | `math.fractions.concepts` | `math.fractions.concepts` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `math.fractions.concepts` | — |
| `math.measurement` | prompt-list | `math.measurement.length` | `math.measurement.length` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `math.measurement.length` | — |
| `math.money` | prompt-list | `math.measurement.time` | `math.measurement.money` (detail-narrowed) | kept | **CORRECT** — FIXED by FIX-226, and found by this census. The curriculum map has ONE node for both, labelled "Time & money", so `math.money` and `math.time` share it there and always did — but the foundations graph keeps "Count money" (band 3) apart from "Tell time" (band 2) and makes the first depend on the second, so a money finding was recorded against telling the time: a different skill, and the easier one. Narrowed on the foundations side; `mapFindingToNode` is unchanged | — |
| `math.multi-digit.multiplication` | prompt-list | `math.operations.multDiv` | `math.operations.multiDigit` (detail-resolved) | kept | **CORRECT** — `math.operations.multDiv` is a curriculumMap-only id, and the tag's own detail names `math.operations.multiDigit`, which `curriculumNodeBridge` resolves it to (FIX-224) | — |
| `math.multi-digit.subtraction` | prompt-list | `math.operations.addSub` | `math.operations.multiDigit` (detail-resolved) | kept | **CORRECT** — `math.operations.addSub` is a curriculumMap-only id, and the tag's own detail names `math.operations.multiDigit`, which `curriculumNodeBridge` resolves it to (FIX-224) | — |
| `math.multiplication.facts` | prompt-list | `math.operations.multDiv` | `math.operations.multFacts` (detail-resolved) | kept | **CORRECT** — `math.operations.multDiv` is a curriculumMap-only id, and the tag's own detail names `math.operations.multFacts`, which `curriculumNodeBridge` resolves it to (FIX-224) | — |
| `math.multiplication.tables` | prompt-list | `math.operations.multDiv` | `math.operations.multiTables` (detail-resolved) | kept | **CORRECT** — `math.operations.multDiv` is a curriculumMap-only id, and the tag's own detail names `math.operations.multiTables`, which `curriculumNodeBridge` resolves it to (FIX-224) | — |
| `math.multiplication.tables-2-5-10` | prompt-example | `math.operations.multDiv` | `math.operations.multiTables` (detail-resolved) | kept | **CORRECT** — `math.operations.multDiv` is a curriculumMap-only id, and the tag's own detail names `math.operations.multiTables`, which `curriculumNodeBridge` resolves it to (FIX-224) | — |
| `math.number-sense` | prompt-list | `math.number.counting` | — (no-detail) | dropped | **DROPPED-RIGHT** — UX-346 FIXED, and the drop that remains is now a RULE. It used to resolve to nothing at all — no prefix entry, no keyword — so the eval prompt's own Level-1 tag reached neither `childSkillMaps` nor the model and logged a `console.warn`. It now answers `math.number.counting` for the skill map, and the foundations half declines because the tag's own gloss names three K-band concepts at once (counting, digit recognition, comparison) and this writer may move a concept DOWN. A Level-1 tag that says WHICH lands | — |
| `math.place-value` | prompt-list | `math.number.placeValue` | `math.number.placeValue` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `math.number.placeValue` | — |
| `math.placeValue` | catalog | `math.number.placeValue` | `math.number.placeValue` (curated) | kept | **CURATED** — `tagConceptBridge` owns this pair and its answer is taken verbatim; the derived route agrees with it, asserted over the whole curated table rather than row by row | — |
| `math.subtraction.noRegroup` | catalog | `math.operations.addSub` | `math.operations.twoDigit` (curated) | kept | **CURATED** — `tagConceptBridge` owns this pair and its answer is taken verbatim; the derived route agrees with it, asserted over the whole curated table rather than row by row | — |
| `math.subtraction.regroup` | catalog | `math.operations.addSub` | `math.operations.regrouping` (curated) | kept | **CURATED** — `tagConceptBridge` owns this pair and its answer is taken verbatim; the derived route agrees with it, asserted over the whole curated table rather than row by row | — |
| `math.subtraction.regrouping` | prompt-list | `math.operations.addSub` | `math.operations.regrouping` (detail-resolved) | kept | **CORRECT** — `math.operations.addSub` is a curriculumMap-only id, and the tag's own detail names `math.operations.regrouping`, which `curriculumNodeBridge` resolves it to (FIX-224) | — |
| `math.subtraction.within-20` | prompt-list | `math.operations.addSub` | `math.operations.subWithin20` (detail-resolved) | kept | **CORRECT** — `math.operations.addSub` is a curriculumMap-only id, and the tag's own detail names `math.operations.subWithin20`, which `curriculumNodeBridge` resolves it to (FIX-224) | — |
| `math.time` | prompt-list | `math.measurement.time` | `math.measurement.time` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `math.measurement.time` | — |
| `math.times-tables` | prompt-list | `math.operations.multDiv` | `math.operations.multiTables` (detail-resolved) | kept | **CORRECT** — `math.operations.multDiv` is a curriculumMap-only id, and the tag's own detail names `math.operations.multiTables`, which `curriculumNodeBridge` resolves it to (FIX-224) | — |
| `math.two-digit.addition` | prompt-list | `math.operations.addSub` | `math.operations.twoDigit` (detail-resolved) | kept | **CORRECT** — `math.operations.addSub` is a curriculumMap-only id, and the tag's own detail names `math.operations.twoDigit`, which `curriculumNodeBridge` resolves it to (FIX-224) | — |
| `math.two-digit.subtraction` | prompt-list | `math.operations.addSub` | `math.operations.twoDigit` (detail-resolved) | kept | **CORRECT** — `math.operations.addSub` is a curriculumMap-only id, and the tag's own detail names `math.operations.twoDigit`, which `curriculumNodeBridge` resolves it to (FIX-224) | — |
| `math.word-problems.multi-step` | prompt-list | `math.problemSolving` | `math.problemSolving` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `math.problemSolving` | — |
| `math.wordProblems` | catalog | `math.problemSolving` | `math.problemSolving.oneStep` (curated) | kept | **CURATED** — UX-348 FIXED. `mapFindingToNode` answers the band-5 multi-step `math.problemSolving`; the curated table answers the band-1-2 `math.problemSolving.oneStep` and says why ("catalog evidence is single-step word problems"). Nothing compared the two, so a Gate-3 priority skill seeded the harder concept `solid` from easier evidence. Curated precedence plus a narrowing resolver; `mapFindingToNode` is unchanged, because `oneStep` is not a curriculumMap id | — |
| `measurement` | level-map | `math.measurement.length` | `math.measurement.length` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.measurement.length` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `missing-addend` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — its level-mates (L3) already write `math.operations.addSub`, and the map has no missing-addend node | — |
| `money` | level-map | `math.measurement.time` | `math.measurement.money` (detail-narrowed) | n/a — never reaches it | **CORRECT** — FIXED by FIX-226 with `math.money`. A working-level key, so the concept column is informational, but the skill-map answer `math.measurement.time` is the only one the curriculum map has for money | — |
| `multi-digit-multiplication` | level-map | `math.operations.multDiv` | `math.operations.multiDigit` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.multDiv` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `multi-digit-subtraction` | level-map | `math.operations.addSub` | `math.operations.multiDigit` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.addSub` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `multi-digit.multiplication` | level-map | `math.operations.multDiv` | `math.operations.multiDigit` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.multDiv` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `multi-digit.subtraction` | level-map | `math.operations.addSub` | `math.operations.multiDigit` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.addSub` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `multi-step` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — its level-mate `word-problems.multi-step` (L4) already writes `math.problemSolving` | — |
| `multi-syllable` | level-map | `reading.decoding.multisyllable` | `reading.decoding.multisyllable` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.decoding.multisyllable` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `multiplication-facts` | level-map | `math.operations.multDiv` | `math.operations.multFacts` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.multDiv` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `multiplication-tables` | level-map | `math.operations.multDiv` | `math.operations.multiTables` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.multDiv` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `multiplication.facts` | level-map | `math.operations.multDiv` | `math.operations.multFacts` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.multDiv` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `multiplication.fluency` | level-map | `reading.fluency.accuracy` | `reading.fluency.accuracy` (direct) | n/a — never reaches it | **MIS-ROUTED** — a MATH key landing on a READING node, because `fluency` is a reading keyword and the tag declares no domain for the anchor to catch (its leading segment is `multiplication`, not `math`). **Contained, not harmless**: its only emitter is `deriveWorkingLevelMastery`, whose own `KEY_TO_DOMAINS` filter drops a math key that resolves outside math — a workaround written for exactly this. Fixing it at the bridge wants the level-map keys to carry their domain; filed as UX-350 | P3 |
| `multiplication.tables` | level-map | `math.operations.multDiv` | `math.operations.multiTables` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.multDiv` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `multisyllable` | level-map | `reading.decoding.multisyllable` | `reading.decoding.multisyllable` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.decoding.multisyllable` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `number-comparison` | level-map | `math.number.comparison` | `math.number.comparison` (direct) | n/a — never reaches it | **CORRECT** — FIXED by FIX-226 with UX-346. It used to resolve to nothing, and `math.number.comparison` is a live node in both maps that the tag names exactly | — |
| `number-sense` | level-map | `math.number.counting` | — (no-detail) | n/a — never reaches it | **CORRECT** — the bare working-level key: `deriveWorkingLevelMastery` writes `math.number.counting` to `childSkillMaps`, which is the only Level-1 number node the map has. The `no-detail` in the concept column is informational — a working-level key never reaches the foundations side | — |
| `phonetic` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — the spelling map's L2 key; its level-mates `cvc` / `sight-word` already write their nodes, and the map has no phonetic-spelling node of its own | — |
| `phonics.cvc.short-a` | prompt-example | `reading.phonics.cvc` | `reading.phonics.cvc` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `reading.phonics.cvc` | — |
| `phonics.cvc.short-o` | prompt-example | `reading.phonics.cvc` | `reading.phonics.cvc` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `reading.phonics.cvc` | — |
| `phonics.cvce.long-a` | prompt-example | `reading.phonics.longVowels` | `reading.phonics.longVowels` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `reading.phonics.longVowels` | — |
| `phonics.digraphs.sh` | prompt-example | `reading.phonics.digraphs` | `reading.phonics.digraphs` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `reading.phonics.digraphs` | — |
| `phonics.letter-sounds.consonants` | prompt-example | `reading.phonics.letterSounds` | `reading.phonics.letterSounds` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `reading.phonics.letterSounds` | — |
| `place-value` | level-map | `math.number.placeValue` | `math.number.placeValue` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.number.placeValue` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `r-controlled` | level-map | `reading.phonics.rControlled` | `reading.phonics.rControlled` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.rControlled` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `reading.comprehension.authorsPurpose` | prompt-list | `reading.comprehension.explicit` | `reading.comprehension.explicit` (direct) | kept | **MIS-ROUTED** — a Level 5-6 analytic skill recorded as Level 1-2 explicit recall; `reading.comprehension.analysis` is a live node. Filed as UX-350 with the comprehension family | P3 |
| `reading.comprehension.character` | prompt-list | `reading.comprehension.explicit` | `reading.comprehension.explicit` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `reading.comprehension.explicit` | — |
| `reading.comprehension.compareContrast` | prompt-list | `reading.comprehension.explicit` | `reading.comprehension.explicit` (direct) | kept | **MIS-ROUTED** — a Level 3-4 analytic skill recorded as Level 1-2 explicit recall; `reading.comprehension.analysis` is a live node. Filed as UX-350 with the comprehension family | P3 |
| `reading.comprehension.detail` | prompt-list | `reading.comprehension.explicit` | `reading.comprehension.explicit` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `reading.comprehension.explicit` | — |
| `reading.comprehension.feelings` | prompt-list | `reading.comprehension.explicit` | `reading.comprehension.explicit` (direct) | kept | **MIS-ROUTED** — a Level 3-4 inferential skill ("Character feelings") recorded as Level 1-2 explicit recall. The curriculum map has four comprehension nodes and the quest prompt emits seventeen tags, so most collapse — but `inference` and `analysis` are live nodes this one is closer to. Filed as UX-350 with the rest of the family, because choosing which of 17 goes to which of 4 is owner curation, not a technique repair | P3 |
| `reading.comprehension.inferCause` | prompt-list + prompt-example | `reading.comprehension.inference` | `reading.comprehension.inference` (direct) | kept | **CORRECT** — FIXED by FIX-226. The prompt's own label is "Cause-effect inference" and it used to fall to the generic `comprehension` keyword and be recorded as explicit recall — a different, easier skill. A prefix entry now routes it to `reading.comprehension.inference`, a live node in both maps | — |
| `reading.comprehension.mainIdea` | prompt-list | `reading.comprehension.mainIdea` | `reading.comprehension.mainIdea` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `reading.comprehension.mainIdea` | — |
| `reading.comprehension.multiStepInference` | prompt-list | `reading.comprehension.inference` | `reading.comprehension.inference` (direct) | kept | **CORRECT** — FIXED by FIX-226, with `inferCause`. The prompt labels it "Multi-step inference"; it was recorded as explicit recall | — |
| `reading.comprehension.pointOfView` | prompt-list | `reading.comprehension.explicit` | `reading.comprehension.explicit` (direct) | kept | **MIS-ROUTED** — a Level 5-6 analytic skill recorded as Level 1-2 explicit recall; `reading.comprehension.analysis` is a live node. Filed as UX-350 with the comprehension family | P3 |
| `reading.comprehension.prediction` | prompt-list | `reading.comprehension.explicit` | `reading.comprehension.explicit` (direct) | kept | **MIS-ROUTED** — a Level 3-4 inferential skill recorded as Level 1-2 explicit recall; `reading.comprehension.inference` is a live node in both maps. Filed as UX-350 with the comprehension family | P3 |
| `reading.comprehension.sequencing` | prompt-list | `reading.comprehension.explicit` | `reading.comprehension.explicit` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `reading.comprehension.explicit` | — |
| `reading.comprehension.statedCause` | prompt-list + prompt-example | `reading.comprehension.explicit` | `reading.comprehension.explicit` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `reading.comprehension.explicit` | — |
| `reading.comprehension.summary` | prompt-list | `reading.comprehension.explicit` | `reading.comprehension.explicit` (direct) | kept | **MIS-ROUTED** — a Level 5-6 skill ("Best summary") recorded as Level 1-2 explicit recall; `reading.comprehension.mainIdea` and `analysis` are both closer live nodes. Filed as UX-350 with the comprehension family | P3 |
| `reading.comprehension.theme` | prompt-list | `reading.comprehension.explicit` | `reading.comprehension.explicit` (direct) | kept | **MIS-ROUTED** — a Level 5-6 skill recorded as Level 1-2 explicit recall; `reading.comprehension.analysis` is a live node. Filed as UX-350 with the comprehension family | P3 |
| `reading.comprehension.whereWhen` | prompt-list | `reading.comprehension.explicit` | `reading.comprehension.explicit` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `reading.comprehension.explicit` | — |
| `reading.comprehension.whoWhat` | prompt-list | `reading.comprehension.explicit` | `reading.comprehension.explicit` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `reading.comprehension.explicit` | — |
| `reading.cvcBlend` | catalog | `reading.phonics.cvc` | `reading.phonics.cvc` (curated) | kept | **CURATED** — `tagConceptBridge` owns this pair and its answer is taken verbatim; the derived route agrees with it, asserted over the whole curated table rather than row by row | — |
| `reading.fluency.short` | catalog | `reading.fluency.accuracy` | `reading.fluency.accuracy` (direct) | kept | **CORRECT** — the prefix entry `reading.fluency` answers `reading.fluency.accuracy`, the entry point of a three-node strand (accuracy / pace / expression, all live in both maps). Its curated entry is `[]` precisely because the owner declined to choose between them — "straddles accuracy / pace / expression, no clean single node" — so the derived answer stands rather than being suppressed by a curation gate. Whether a short-passage tag should reach `expression`, whose evidence sentence it quotes, is a curation question filed as UX-350 | P3 |
| `reading.letterSound` | catalog | `reading.phonics.letterSounds` | `reading.phonics.letterSounds` (curated) | kept | **CURATED** — `tagConceptBridge` owns this pair and its answer is taken verbatim; the derived route agrees with it, asserted over the whole curated table rather than row by row | — |
| `reading.phonemicAwareness` | catalog | — | `reading.phonemic.hearSounds` (curated) | kept | **CURATED** — the derived route answers nothing for it, and the owner-curated table answers `reading.phonemic.hearSounds`. Since FIX-226 the curated answer is the AUTHORITY rather than something to agree with, so this catalog priority skill reaches its concept for the first time — the second defect the UX-348 precedence fix closed | — |
| `reading.sightWords` | catalog | `reading.phonics.sightWords` | `reading.phonics.sightWords` (curated) | kept | **CURATED** — `tagConceptBridge` owns this pair and its answer is taken verbatim; the derived route agrees with it, asserted over the whole curated table rather than row by row | — |
| `reading.vocabulary.contextClues` | prompt-list | `reading.vocabulary.contextClues` | `reading.vocabulary.contextClues` (direct) | kept | **CORRECT** — the tag names this concept and lands on it, through the curriculum node `reading.vocabulary.contextClues` | — |
| `recall` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-WRONG** — as `literal-recall` — `reading.comprehension.explicit` exists and nothing points at it from comprehension L1; filed as UX-350 | P3 |
| `regulation.attention` | catalog | — | — (unmapped) | dropped | **DROPPED-RIGHT** — self-regulation is not a curriculum domain in either map, by declared design — `tagConceptBridge` curates every `regulation.*` tag to `[]` because a regulation struggle is not a concept miss to re-test | — |
| `regulation.frustration` | catalog | — | — (unmapped) | dropped | **DROPPED-RIGHT** — as every `regulation.*` tag: not a curriculum domain in either map, curated `[]` by declared design | — |
| `regulation.frustrationTolerance` | catalog | — | — (unmapped) | dropped | **DROPPED-RIGHT** — as every `regulation.*` tag: not a curriculum domain in either map, curated `[]` by declared design | — |
| `regulation.stamina` | catalog | — | — (unmapped) | dropped | **DROPPED-RIGHT** — as every `regulation.*` tag: not a curriculum domain in either map, curated `[]` by declared design | — |
| `regulation.startAnyway` | catalog | — | — (unmapped) | dropped | **DROPPED-RIGHT** — as every `regulation.*` tag: not a curriculum domain in either map, curated `[]` by declared design | — |
| `repeated-addition` | level-map | `math.operations.multDiv` | `math.operations.arrays` (detail-resolved) | n/a — never reaches it | **CORRECT** — FIXED by FIX-226. Repeated addition IS multiplication, and the tag matched both `repeatedaddition` and `addition`; the more specific keyword is now declared first, so it lands on the multiplication strand and resolves to `math.operations.arrays` instead of declining on the addition one | — |
| `sentence` | level-map | `writing.composition.sentence` | — (outside-domain) | n/a — never reaches it | **CORRECT** — lands on `writing.composition.sentence`, the node the tag names. A working-level key reaches `childSkillMaps` only, so the foundations boundary never applies to it | — |
| `sentence.adjective` | level-map | `writing.composition.sentence` | — (outside-domain) | n/a — never reaches it | **CORRECT** — lands on `writing.composition.sentence`, the node the tag names. A working-level key reaches `childSkillMaps` only, so the foundations boundary never applies to it | — |
| `sentence.capitalization` | level-map | `writing.composition.sentence` | — (outside-domain) | n/a — never reaches it | **CORRECT** — lands on `writing.composition.sentence`, the node the tag names. A working-level key reaches `childSkillMaps` only, so the foundations boundary never applies to it | — |
| `sentence.expanded` | level-map | `writing.composition.sentence` | — (outside-domain) | n/a — never reaches it | **CORRECT** — lands on `writing.composition.sentence`, the node the tag names. A working-level key reaches `childSkillMaps` only, so the foundations boundary never applies to it | — |
| `sentence.order` | level-map | `writing.composition.sentence` | — (outside-domain) | n/a — never reaches it | **CORRECT** — lands on `writing.composition.sentence`, the node the tag names. A working-level key reaches `childSkillMaps` only, so the foundations boundary never applies to it | — |
| `sentence.prepositional` | level-map | `writing.composition.sentence` | — (outside-domain) | n/a — never reaches it | **CORRECT** — lands on `writing.composition.sentence`, the node the tag names. A working-level key reaches `childSkillMaps` only, so the foundations boundary never applies to it | — |
| `sentence.punctuation` | level-map | `writing.composition.sentence` | — (outside-domain) | n/a — never reaches it | **CORRECT** — lands on `writing.composition.sentence`, the node the tag names. A working-level key reaches `childSkillMaps` only, so the foundations boundary never applies to it | — |
| `sentence.subject-verb` | level-map | `writing.composition.sentence` | — (outside-domain) | n/a — never reaches it | **CORRECT** — lands on `writing.composition.sentence`, the node the tag names. A working-level key reaches `childSkillMaps` only, so the foundations boundary never applies to it | — |
| `sequencing` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-WRONG** — the prefix table maps the dotted `reading.comprehension.sequencing` to `reading.comprehension.explicit`, so the target exists and the bare key alone misses it. Comprehension L2 has no other key; filed as UX-350 | P3 |
| `short-vowel` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — a synonym of its level-mate `cvc` (L2), which already writes `reading.phonics.cvc` — the only node the map has for it | — |
| `sight-word` | level-map | `reading.phonics.sightWords` | `reading.phonics.sightWords` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.sightWords` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `sightword` | level-map | `reading.phonics.sightWords` | `reading.phonics.sightWords` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.sightWords` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `silent-e` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — a synonym of its level-mates `cvce` / `long-vowel` (L5), which already write `reading.phonics.longVowels` | — |
| `single-digit-addition` | level-map | `math.operations.addSub` | `math.operations.addWithin20` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.addSub` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `single-digit-subtraction` | level-map | `math.operations.addSub` | `math.operations.subWithin20` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.addSub` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `speech.articulation.ch` | prompt-list | `speech.sounds.late` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.sounds.late`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `speech.articulation.j` | prompt-list | `speech.sounds.late` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.sounds.late`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `speech.articulation.l.final` | prompt-list | `speech.sounds.late` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.sounds.late`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `speech.articulation.l.initial` | prompt-list | `speech.sounds.late` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.sounds.late`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `speech.articulation.l.medial` | prompt-list | `speech.sounds.late` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.sounds.late`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `speech.articulation.r` | prompt-example | `speech.sounds.late` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.sounds.late`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `speech.articulation.r.final` | prompt-list | `speech.sounds.late` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.sounds.late`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `speech.articulation.r.initial` | prompt-list + prompt-example | `speech.sounds.late` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.sounds.late`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `speech.articulation.r.medial` | prompt-list | `speech.sounds.late` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.sounds.late`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `speech.articulation.s` | prompt-list | `speech.sounds.late` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.sounds.late`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `speech.articulation.sh` | prompt-list | `speech.sounds.late` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.sounds.late`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `speech.articulation.th.initial` | prompt-list | `speech.sounds.late` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.sounds.late`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `speech.articulation.th.medial` | prompt-list | `speech.sounds.late` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.sounds.late`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `speech.articulation.z` | prompt-list | `speech.sounds.late` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.sounds.late`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `speech.connectedSpeech` | prompt-list | `speech.connected` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.connected`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `speech.metathesis` | prompt-list | `speech.sequencing` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `speech.sequencing`, the node the prefix table declares for every articulation tag — and then stops, because `FoundationDomain` is reading + math by design and the graph has no speech half. The declared boundary, not a miss | — |
| `subtraction-regrouping` | level-map | `math.operations.addSub` | `math.operations.regrouping` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.addSub` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `subtraction-within-20` | level-map | `math.operations.addSub` | `math.operations.subWithin20` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.addSub` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `subtraction.regrouping` | level-map | `math.operations.addSub` | `math.operations.regrouping` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.addSub` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `subtraction.within-20` | level-map | `math.operations.addSub` | `math.operations.subWithin20` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.addSub` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `synthesis` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-WRONG** — `reading.comprehension.analysis` is a live node and nothing points at it. Part of the comprehension-L6 gap filed as UX-350 | P3 |
| `theme` | level-map | — | — (unmapped) | n/a — never reaches it | **DROPPED-RIGHT** — the curriculum map has no theme node. With `compare-contrast` it leaves comprehension L5 contributing nothing; filed as UX-350 | P3 |
| `time` | level-map | `math.measurement.time` | `math.measurement.time` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.measurement.time` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `times-table` | level-map | `math.operations.multDiv` | — (no-detail) | n/a — never reaches it | **CORRECT** — a working-level key: the skill map gets `math.operations.multDiv`, the right node. The `no-detail` is informational — `resolveMultDiv` reads the plural `tables`, and a working-level key never reaches it anyway | — |
| `times-tables` | level-map | `math.operations.multDiv` | `math.operations.multiTables` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.multDiv` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `two-digit-addition` | level-map | `math.operations.addSub` | `math.operations.twoDigit` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.addSub` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `two-digit-subtraction` | level-map | `math.operations.addSub` | `math.operations.twoDigit` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.addSub` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `two-digit.addition` | level-map | `math.operations.addSub` | `math.operations.twoDigit` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.addSub` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `two-digit.subtraction` | level-map | `math.operations.addSub` | `math.operations.twoDigit` (detail-resolved) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.operations.addSub` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `vowel-digraph` | level-map | `reading.phonics.digraphs` | `reading.phonics.digraphs` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.digraphs` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `vowel-team` | level-map | `reading.phonics.longVowels` | `reading.phonics.longVowels` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.longVowels` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `vowel-teams` | level-map | `reading.phonics.longVowels` | `reading.phonics.longVowels` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.longVowels` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `vowelteam` | level-map | `reading.phonics.longVowels` | `reading.phonics.longVowels` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `reading.phonics.longVowels` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `word-problems.multi-step` | level-map | `math.problemSolving` | `math.problemSolving` (direct) | n/a — never reaches it | **CORRECT** — a working-level key: `deriveWorkingLevelMastery` writes `math.problemSolving` to `childSkillMaps`, which is the node the tag names. The concept column is informational — this key never reaches the foundations side | — |
| `writing.composition.sentence` | catalog | `writing.composition.sentence` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `writing.composition.sentence`, which is the node the tag names — and then stops, because `FoundationDomain` is reading + math by design and the graph has no `writing` half. The declared boundary, not a miss | — |
| `writing.copyWords` | catalog | — | — (unmapped) | dropped | **DROPPED-RIGHT** — neither map defines a copying node; the nearest, `writing.mechanics.spacing`, is about spacing rather than copying, and naming it would be a guess. Curated `[]` | — |
| `writing.gripPosture` | catalog | — | — (unmapped) | dropped | **DROPPED-RIGHT** — neither map defines a grip-or-posture node — the curriculum map's writing half starts at letter formation — so there is nothing to point at, and `tagConceptBridge` curates it to `[]` for the same reason | — |
| `writing.letterFormation` | catalog | — | — (unmapped) | dropped | **DROPPED-WRONG** — `writing.mechanics.letterFormation` is a live curriculumMap node with the same name, and this tag reaches nothing. The foundations graph has no writing half, so the loss is on the skill-map side only; filed as UX-350 | P3 |
| `writing.sentence.order` | catalog | `writing.composition.sentence` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `writing.composition.sentence`, which is the node the tag names — and then stops, because `FoundationDomain` is reading + math by design and the graph has no `writing` half. The declared boundary, not a miss | — |
| `writing.spelling.phonetic` | catalog | `writing.mechanics.spelling` | — (outside-domain) | dropped | **DROPPED-RIGHT** — lands on `writing.mechanics.spelling`, which is the node the tag names — and then stops, because `FoundationDomain` is reading + math by design and the graph has no `writing` half. The declared boundary, not a miss | — |
| `writing.spelling.sightWord` | catalog | `reading.phonics.sightWords` | `reading.phonics.sightWords` (direct) | kept | **CORRECT** — the ONE declared cross-domain lane: a spelling tag reaching `reading.phonics.sightWords`, which `deriveWorkingLevelMastery` already permits for its writing key ("spelling a CVC word implies you can decode it"). Its curated entry is `[]` — a curation gate, not an authoritative "nothing" — so precedence deliberately leaves this derived answer standing | — |

---

## 6. What this census found and did **not** fix — filed as `UX-350`

Every row below is classified above with its reason. They are collected here so
the remainder is one ledger row rather than sixteen, and so the shape of each is
stated rather than left in a table cell.

**a. A working level whose keys all resolve to nothing contributes nothing.**
`deriveWorkingLevelMastery` inverts the five working-level maps: for a child at
level *N*, every key below *N* marks its node mastered. A key that resolves to no
node contributes nothing, silently — and for three whole levels, *every* key
does:

- **Phonics L7** — `diphthong`, `diphthongs`, `le-ending`, `le-endings`,
  `final-stable`. The curriculum map defines no diphthong or final-stable node,
  so there is genuinely nothing to point at (the foundations graph has
  `reading.phonics.diphthongs`, but this function answers with curriculumMap ids
  by contract). Closing it means adding a node to `curriculumMap.ts`, which is
  curriculum data and therefore an owner decision.
- **Comprehension L1, L2 and L6** — `literal-recall` / `recall`; `sequencing`;
  `critical-thinking` / `evaluation` / `synthesis`. Here real nodes **do** exist
  and nothing points at them: `reading.comprehension.explicit` is exactly what
  literal recall names, and `reading.critical.evaluate` and
  `reading.comprehension.analysis` are both live. Six DROPPED-WRONG rows.
- **Comprehension L5** — `compare-contrast`, `theme`. No curriculumMap node
  (the foundations graph has `reading.comprehension.compareTheme`).

**b. Seventeen comprehension tags, four comprehension nodes.** The Knowledge Mine
prompt emits seventeen `reading.comprehension.*` tags and the curriculum map has
four comprehension nodes, so most collapse. FIX-226 fixed the two the prompt
itself labels as inference (`inferCause`, `multiStepInference` → 
`reading.comprehension.inference`) because those are literal correspondences.
The other seven MIS-ROUTED rows — `feelings`, `prediction`, `compareContrast`,
`theme`, `authorsPurpose`, `summary`, `pointOfView` — are Level 3-6 inferential
or analytic skills recorded as Level 1-2 explicit recall. Deciding which of
seventeen goes to which of four is **owner curation**, not a technique repair,
and guessing it here is exactly what this module's no-guess rule forbids. The
same shape as `UX-289`'s workbook bridges, and it wants the same treatment.

**c. A working-level key carries no domain, so the anchor cannot help it.**
`multiplication.fluency` is a MATH key that lands on `reading.fluency.accuracy`,
because `fluency` is a reading keyword and the tag's leading segment is
`multiplication` rather than `math`. It is **contained, not harmless**: its only
emitter is `deriveWorkingLevelMastery`, whose `KEY_TO_DOMAINS` filter drops a
math key resolving outside math — a workaround written for exactly this leak, and
the third piece of evidence that the technique was the problem. Fixing it at the
bridge wants the working-level keys to carry their domain, which is a change to
five data tables and their two consumers.

**d. Two catalog tags name a live node and reach it not at all.**
`writing.letterFormation` and the working-level key `conventional` name
`writing.mechanics.letterFormation` and `writing.mechanics.conventionalSpelling`
almost word for word. Both losses are on the skill-map side only — the
foundations graph has no writing half — so neither is urgent, and both are one
prefix entry each once someone decides the writing half of the skill map matters.

**e. A short-passage fluency tag lands on accuracy.** `reading.fluency.short`'s
own evidence sentence is *"reads a decodable sentence with expression"*, and its
curated entry is `[]` precisely because the owner declined to choose between
`accuracy`, `pace` and `expression` — all three live in both maps. The derived
answer takes `accuracy`, the strand's entry point. Whether it should take
`expression` is that same declined curation question.

**f. Twenty-five of the sixty foundations concepts are named by no tag any source
emits.** Not a bridge defect and not fixable here — it means the prompts and the
catalog simply have no tag for those concepts. The largest blocks are the reading
strands the graph carries and the curriculum map does not
(`reading.comprehension.sequence` / `character` / `causeEffect` / `compareTheme`,
`reading.encoding.spell*`, `reading.fluency.pace` / `expression`) and the math
strands the eval prompt's tag list omits entirely — geometry, data and graphs,
patterns and algebra, decimals. It overlaps `UX-295`, which measured concept
reachability from the writer side; this is the same wall seen from the tag side.

### Deliberately out of scope for this run

- `UX-289` — the Good & Beautiful / TGTB workbook bridges. Blocked on the
  owner's course-book table of contents, not on code.
- `UX-293` — sight-word mastery reaching the model exactly once.
- `UX-349` — the `?diag=1` re-seed still performs its transitions silently.
- The six P2s and three P3s in the child-switch census.
- Anything that writes `skillSnapshots`, `hours` or `xpLedger`. This run reads
  tags and repairs a pure resolution; **no rail is written**.

---

## 7. What the guard cannot see

`src/test/findingTagBridge.invariant.test.ts` derives the tag universe from the
four sources in §3 and fails on an unclassified tag, a stale derived cell, a
duplicate row, a blank cell, a bad or unexplained verdict, a verdict that
contradicts what the source does, a table that parses to nothing, and **any** tag
resolving outside the domain it declares. It proves it fails by feeding itself an
unclassified tag and a deliberately cross-domain resolution, per PR #1814's
lesson that a guard which passes on malformed input is worse than no guard.

Three things it cannot see, checked by hand:

0. **Nothing, about the anchor's own width.** The guard checks that no tag in the
   universe resolves cross-domain, and **no enumerated tag uses the lane except
   `writing.spelling.sightWord`** — so a lane that was too *wide* passed it
   silently, which is what Codex round 1 caught. The width is pinned directly, by
   named test in `mapFindingToNode.test.ts` (`writing.fluency`,
   `writing.inference`, `writing.cvc`, `writing.sightWords` → null) and by one in
   the guard, because the registry cannot see a hole no enumerated tag falls
   into. The registry classifies by the app's own `resolvesOutsideDeclaredDomain`
   rather than a copy of the rule, so a future narrowing cannot leave this
   document reporting the old one.
1. **A tag the model invents.** The reading evaluation prompt gives the model no
   closed list at all — only the `"skill": "…"` examples in §3 — so it can emit
   anything, and `writing.paragraph`, the tag `UX-347` was reported on, is
   exactly such a tag: **no source in §3 emits it**. That is why the domain
   anchor exists even though it changes no enumerated answer, and why the
   `writing.paragraph` case is pinned directly in `mapFindingToNode.test.ts`
   rather than through the registry.
2. **Whether a CORRECT row is correct.** The guard checks that a verdict does not
   contradict the source — a row cannot say CORRECT about a tag that resolves to
   nothing, or CURATED about a tag the curated table has no answer for — but
   *"`math.money` should reach the money concept, not the time one"* is a
   judgement, and it took a person reading two graphs side by side to see it.
3. **A `curriculumMap.ts` or foundations-graph edit that changes a node's
   meaning.** The registry pins ids, not semantics. A renamed node whose id stays
   the same passes.
