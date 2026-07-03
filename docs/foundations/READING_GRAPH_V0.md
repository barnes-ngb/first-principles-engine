# Reading Concept Graph — v0 DRAFT (pending owner curation)

> ⚠️ **v0 DRAFT — a content proposal for OWNER REVIEW, not shipped data.** This is the first pass at the reading half of the Foundations spine described in [`../LEARNER_MODEL_DESIGN.md`](../LEARNER_MODEL_DESIGN.md) §2. The owner edits node names, descriptions, bands, and edges; the curated result ships as versioned data in a later build slice (Open Decision D2). **Nothing here is live.**

## How to read this

- **Grounded in the repo, not generic standards.** Bands and ordering follow this codebase's actual ladders: `PHONICS` (L1–8) and `COMPREHENSION` (L1–6) in `src/core/curriculum/skillLevelMaps.ts`, the 20 reading nodes in `curriculumMap.ts` (`READING_MAP`), the quest mechanics (`phonics` / `comprehension` / `fluency` modes; `build-word` / `spell-word` / `build-sentence` types), and the Dolch sight-word lists (`DOLCH_PRE_PRIMER` 40, `DOLCH_PRIMER` 52, `LONDON_STARTER_WORDS` 20) in `sightWordMastery.ts`.
- **`id`** reuses `curriculumMap` node ids where an equivalent node already exists (so the tag bridge in §4.3 and the existing Learning-Map UI line up); new ids follow the same `reading.<strand>.<concept>` convention.
- **`underlies`** = concepts this one is a prerequisite *for* (the forward edge, §2.1).
- **Band** = grade band (K–5) mapped from the level ladders (see "Band mapping" below).
- **Kid-word name** obeys the ETHOS-02 no-judge / no-score rail — a positive capability, never a deficit or a grade number.

## Band mapping (from the repo's ladders)

| Band | Phonics ladder (L1–8) | Comprehension ladder (L1–6) |
|---|---|---|
| **K** | L1 letter sounds | — (pre-reading: print & sound awareness) |
| **1** | L2 CVC · L3 blends · L4 digraphs | — |
| **2** | L5 long-vowel/silent-e · L6 vowel teams · L8 r-controlled | — |
| **3** | L7 diphthongs/-le · L8 multisyllable | L1 recall · L2 sequencing · L3 main-idea/character |
| **4** | — | L4 inference/cause-effect |
| **5** | — | L5 compare/theme · L6 critical/synthesis |

*(Fluency and vocabulary are cross-band strands, placed where they first become the working edge.)*

---

## Strand 1 — Print & Phonemic Awareness (pre-reading)

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `reading.print.concepts` | K | How books work | Knows print runs left→right and top→bottom, and where a story begins | `reading.phonics.letterSounds` |
| `reading.phonemic.hearSounds` | K | Hear the sounds in words | Claps syllables, hears rhymes, and catches the first sound in a word | `reading.phonics.letterSounds`, `reading.phonics.cvc` |

## Strand 2 — Phonics & Decoding (the granular spine)

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `reading.phonics.letterSounds` | K | Know letter sounds | Says the sound each letter makes | `reading.phonics.cvc`, `reading.phonics.sightWordsK` |
| `reading.phonics.cvc` | 1 | Sound out short words | Reads simple 3-letter words like cat, run, sit | `reading.phonics.blends`, `reading.phonics.digraphs`, `reading.encoding.spellCvc` |
| `reading.phonics.blends` | 1 | Blend two sounds together | Reads words with blends like stop, frog, jump | `reading.phonics.longVowels` |
| `reading.phonics.digraphs` | 1 | Two letters, one sound | Reads sh/ch/th/wh words like ship, that, when | `reading.phonics.longVowels` |
| `reading.phonics.longVowels` | 2 | Read long-vowel words | Reads silent-e and long-vowel words like cake, bike | `reading.phonics.vowelTeams`, `reading.phonics.rControlled` |
| `reading.phonics.vowelTeams` | 2 | Read vowel teams | Reads ai/ea/oa/ee words like rain, boat, tree | `reading.decoding.multisyllable` |
| `reading.phonics.rControlled` | 2 | Read bossy-r words | Reads ar/or/er/ir/ur words like car, bird, corn | `reading.decoding.multisyllable` |
| `reading.phonics.diphthongs` | 3 | Tricky vowel sounds | Reads oi/oy/ou/ow words and -le endings like coin, cloud, little | `reading.decoding.multisyllable` |
| `reading.decoding.multisyllable` | 3 | Break big words apart | Reads longer words by chunking them into syllables | `reading.fluency.expression`, `reading.vocabulary.wordParts` |

## Strand 3 — Sight Words

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `reading.phonics.sightWordsK` | K | Read starter words | Instantly reads the first tiny words (a, I, the, is) | `reading.phonics.sightWords1` |
| `reading.phonics.sightWords1` | 1 | Read more sight words | Reads the common words that don't sound out (Dolch pre-primer/primer) | `reading.fluency.accuracy` |

> **Seeding note:** these two collapse onto the single existing `reading.phonics.sightWords` node that `deriveSightWordMastery` already lights from the thresholded mastered *share* (`SIGHT_WORD_MASTERED_THRESHOLD = 0.8`). Owner decision: keep two banded nodes here, or keep the one existing node. If two, the derivation needs a per-band split of the Dolch lists.

## Strand 4 — Fluency

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `reading.fluency.accuracy` | 1 | Read the words right | Reads a simple sentence without guessing | `reading.fluency.pace`, `reading.comprehension.explicit` |
| `reading.fluency.pace` | 2 | Read smoothly | Reads a page at a comfortable, steady pace | `reading.fluency.expression` |
| `reading.fluency.expression` | 3 | Read with expression | Reads aloud with feeling, minding the punctuation | `reading.independent.choice` |

> **Seeding note:** fluency has **no working-level field** (`WorkingLevels` has no fluency entry; the quest fluency flow is self-rated, no levels). These nodes start `not-yet` and move only via evaluation findings, teach-back evidence, or a parent attestation. Good candidates for an `openQuestion` → targeted check.

## Strand 5 — Vocabulary

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `reading.vocabulary.everyday` | 2 | Know lots of words | Understands the everyday words in what they read | `reading.comprehension.explicit`, `reading.vocabulary.contextClues` |
| `reading.vocabulary.wordParts` | 4 | Use word parts | Uses prefixes, suffixes, and roots to unlock words | `reading.vocabulary.contextClues` |
| `reading.vocabulary.contextClues` | 4 | Guess words from context | Works out a new word from the sentence around it | `reading.independent.choice` |

## Strand 6 — Comprehension

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `reading.comprehension.explicit` | 3 | Find the answer in the text | Answers questions the text states directly | `reading.comprehension.inference`, `reading.comprehension.mainIdea`, `reading.comprehension.sequence` |
| `reading.comprehension.sequence` | 3 | Tell it in order | Retells beginning, middle, and end in order | `reading.comprehension.mainIdea` |
| `reading.comprehension.character` | 3 | Know the characters | Describes who's in the story and what they want | `reading.comprehension.inference` |
| `reading.comprehension.mainIdea` | 3 | Say what it's mostly about | Names the main idea and a key detail | `reading.comprehension.analysis` |
| `reading.comprehension.inference` | 4 | Read between the lines | Figures out what the text hints but doesn't say | `reading.comprehension.analysis` |
| `reading.comprehension.causeEffect` | 4 | Know why things happen | Explains what caused what in a story or text | `reading.comprehension.analysis` |
| `reading.comprehension.compareTheme` | 5 | Compare and find the theme | Compares two texts and names the lesson or theme | `reading.comprehension.analysis` |
| `reading.comprehension.analysis` | 5 | Dig into a text | Explains how the parts of a text work together | `reading.critical.evaluate` |
| `reading.critical.evaluate` | 5 | Think hard about what I read | Weighs whether a text is convincing or true | *(top)* |

## Strand 7 — Independent Reading

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `reading.independent.choice` | 4 | Read on my own | Chooses and reads a just-right book independently | `reading.critical.evaluate` |

## Strand 8 — Encoding (spelling — the inverse of decoding)

> **Modality-calibration note:** encoding lives here because spelling is *reading run backwards*, and the quest `spell-word` / `build-sentence` types feed `workingLevels.writing` / `workingLevels.sentence`, so these nodes are **seedable day one**. But per the model's modality-calibration principle (§3.3), *"can he write it by hand"* is a **modality question, not a mastery gate** — a child who can spell a word aloud or with tiles but not with a pencil is still `solid` on the concept; the adult scribes. Kept to two nodes to avoid crossing into the separate `writing` curriculum domain.

| id | Band | Kid-word name | Parent description | `underlies` |
|---|---|---|---|---|
| `reading.encoding.spellCvc` | 1 | Spell short words | Spells simple sound-it-out words (aloud, tiles, or scribed) | `reading.encoding.spellPatterns` |
| `reading.encoding.spellPatterns` | 2 | Spell pattern words | Spells blend, digraph, and long-vowel words | *(feeds fluency indirectly)* |

---

## Seeding this graph on day one (bootstrap)

From the Step 0.5 mappability finding, a child's **initial** reading concept states come — with no new assessment — from inverting the existing working levels (`deriveWorkingLevelMastery`):

- **`solid`** ← every phonics concept whose band is *below* the child's `workingLevels.phonics` level (e.g. phonics level 4 ⇒ letter sounds, CVC, blends `solid`), plus `reading.phonics.sightWords*` when the mastered Dolch share ≥ 0.8, plus any completed-program nodes, plus gate-3 priority skills.
- **`forming` / `frontier`** ← the concept(s) at exactly the child's working level (e.g. phonics level 4 ⇒ digraphs is the frontier).
- **`not-yet`** ← everything above the working level, and **the entire Fluency and Comprehension strands** (no working-level field seeds them) until an evaluation, teach-back, scan, or parent attestation touches them.

The two children on day one: **London** seeds near the K/1 phonics frontier with most sight-word and all comprehension nodes `not-yet`; **Lincoln** seeds spiky — several phonics nodes `solid`, a phonics frontier around blends/digraphs/long-vowels, and comprehension `not-yet`/thin (a prime `openQuestion` target for a targeted Mine run).

## Open questions for the owner (curation)

1. Two banded sight-word nodes vs. the one existing `reading.phonics.sightWords` node?
2. Are the K pre-reading nodes worth tracking, or assume-solid for both children and drop them?
3. Encoding: keep the two-node spelling strand, or fold spelling entirely into modality calibration and drop it from the academic graph?
4. Band placement of r-controlled (repo ladder puts it at phonics L8 alongside multisyllable; this draft pulls it to band 2 as is common in practice) — keep the practical band or match the repo ladder?
5. Any concept here that is *not* how the family actually sequences reading (e.g. Reading Eggs order)?
