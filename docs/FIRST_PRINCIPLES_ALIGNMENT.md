# First Principles Alignment — Architecture Direction

> Where Ad Astra meets the Barnes Charter.
>
> Created: March 25, 2026

---

## Ad Astra Core Principles (Distilled)

Elon Musk's Ad Astra (now Astra Nova) school operates on a few core ideas:

1. **No grades** — assessment is about understanding, not ranking
2. **First principles reasoning** — break problems down to fundamentals, reason up from there
3. **Ethics through conundrums** — open-ended scenarios with no right answer force genuine moral reasoning
4. **Learning by teaching** — if you can't explain it, you don't understand it (Feynman technique)
5. **Disposition over content mastery** — curiosity, persistence, and self-awareness matter more than passing a skill check
6. **Project-based, not subject-based** — real problems don't come labeled "math" or "reading"
7. **Agency** — kids choose what to work on, within constraints

---

## Where Barnes Charter Already Aligns

The Barnes family charter and this app already embody many of these principles:

| Ad Astra Principle | Barnes Implementation |
|---|---|
| No grades | Portfolio over grades (Design Decision #1). "Diamonds, not scores" (#12). |
| No shame | MVD is real school. Bad days count. App never makes Shelly feel like failing (#2). |
| Learning by teaching | "Lincoln teaches London" is Design Decision #4. Teach-back prompt already built. |
| Ethics / formation | Formation first (#3). Prayer/scripture before academics every day. Heart questions in weekly focus. |
| Engagement > completion | Design Decision #7. Emoji feedback tracks HOW it went, not just IF. |
| Agency | Kid Today view. Lincoln chooses from Must-Do/Choose lists. Extra activity logger. |
| Curiosity-driven | Dad Lab (Nathan's domain). Wonder-based Saturday experiments. |

**The alignment is strong.** The Barnes charter was built from similar instincts — just expressed through a Christian homeschool lens rather than a Silicon Valley one.

---

## Where They Diverge (And Why That's OK)

### The daily flow is traditional in Minecraft clothes

The Plan My Week → Today → checklist flow is fundamentally a **structured school day**. It has subjects, time blocks, and must-do items. Ad Astra would push for more project-based, self-directed work.

**Why this is fine:**
- Shelly needs structure. Fibromyalgia means she can't facilitate open-ended exploration every day.
- Lincoln needs structure. Neurodivergence means executive function scaffolding is essential.
- London needs attention. He disengages without direct interaction.
- MVD mode already provides the escape valve. The floor is prayer + read aloud + math + one reflection.
- The structure IS the support. Without it, nothing happens.

### Subject buckets exist

Reading, Math, Formation, Together — these are labeled subjects. Ad Astra would blur these boundaries.

**Why this is fine:**
- Missouri requires hours-by-subject reporting. The labels serve compliance.
- Shelly thinks in subjects. The app serves her mental model.
- The AI planner can cross-pollinate (reading about math concepts, math in cooking) while still tagging for compliance.

---

## The Reframe: Disposition Signals vs Ladder Rungs

### What was: Ladders as scoring

The original engine tracked skill progression through ladders — discrete rungs a child climbs. This created:
- Tracking burden (Shelly has to assess and log rung advancement)
- Binary thinking (you're on rung 3 or rung 4, nothing in between)
- Content mastery focus (can Lincoln decode CVC words? yes/no)

### What replaces it: Disposition signals

The Learning Profile (DispositionProfile.tsx) reads existing data — engagement emojis, grade notes, checklist completion, Dad Lab reports, teach-back entries — and synthesizes a **narrative about how each child approaches learning**.

Five dispositions, mapped to a learning loop:

| Disposition | Learning Phase | Signal Sources |
|---|---|---|
| **Curiosity** | Wonder | Engagement emojis (excited), voluntary activities, Dad Lab predictions |
| **Persistence** | Build | Completion rates on hard items, retry patterns, frustration recovery |
| **Articulation** | Explain | Teach-back entries, grade notes with detail, Dad Lab explanations |
| **Self-Awareness** | Reflect | Emoji accuracy (does engagement match grade?), self-selected activities |
| **Ownership** | Share | Kid-initiated logging, extra activities, portfolio artifacts created |

**Key insight:** Shelly already captures all this data through her normal daily flow. The AI just reads it differently.

---

## What a Disposition Dashboard Looks Like

The Learning Profile tab (first tab in Progress) shows:

1. **Narrative summary** — 2-3 paragraphs about each child's learning disposition, written by AI from 4 weeks of data
2. **Disposition cards** — each of the 5 dispositions with:
   - Current signal strength (not a score — a qualitative read)
   - Evidence quotes (pulled from actual grade notes, engagement patterns)
   - Growth trajectory (compared to prior 4-week window)
3. **Learning loop visualization** — Wonder→Build→Explain→Reflect→Share as a cycle, with indicators of where each child spends most time

This replaces ladder progress as the **primary growth visibility tool**.

---

## What to Build

### Phase 1 (March 25 — DONE)
- [x] DispositionProfile.tsx — AI-generated narrative from day log data
- [x] Disposition task handler in Cloud Functions
- [x] Teach-back prompt (parent + kid views)
- [x] Conundrum generation tied to week plan
- [x] Extra activity logger (kid-initiated, all taps)
- [x] Weekly review rewrite (reads day logs, not sessions)

### Phase 2 (Future)
- [ ] Disposition trend tracking (4-week rolling windows, stored snapshots)
- [ ] Conundrum response capture (what did they actually discuss?)
- [ ] Teach-back quality signals (did Lincoln explain accurately?)
- [ ] Cross-child disposition comparison (how Lincoln and London differ)
- [ ] Dad Lab → disposition pipeline (Saturday experiments feed curiosity/persistence signals)

### Phase 3 (Future)
- [ ] Content generation from conundrums (conundrum → project → reading list → math connections)
- [ ] Adaptive conundrum difficulty (based on prior responses)
- [ ] Family disposition profile (how the Barnes family learns together)
- [ ] Quarterly disposition reports (exportable for portfolio)

---

## What to Retire

| Feature | Status | Replacement |
|---|---|---|
| Ladders as scoring mechanism | Keep data, deprioritize UI | Disposition signals from existing data |
| Engine as counting system | Keep stage tags for artifacts | Learning loop phases (Wonder→Build→Explain→Reflect→Share) |
| Manual skill rung assessment | Stop asking Shelly to do this | AI reads engagement + grade notes instead |

**Note:** Ladder definitions and progress data stay in Firestore. The Ladders tab stays in Progress. But they're no longer the primary growth story — dispositions are.

---

## What to Keep (Unchanged)

These features are working well and aligned with both Ad Astra principles and the Barnes charter:

- **Daily flow** (Today page, checklists, energy selector, MVD mode)
- **Engagement emojis** (the richest disposition signal source)
- **Quick capture** (photos, audio, notes — small artifacts > perfect documentation)
- **Evaluations** (reading diagnostic, Knowledge Mine — assessment as learning)
- **Dad Lab** (wonder-based, project-oriented, Nathan's domain)
- **Story Game Workshop** (London creates, Lincoln refines — agency + collaboration)
- **My Books** (reading = building, words are learnable anywhere)
- **Armor of God** (devotional ritual, formation-first identity)
- **Plan My Week** (structure as support, not as control)

### Capture matches reality.

A Lego build is artifact + hours + category, not three separate logs. The Capture card on Today adapts to what the moment actually was — sometimes a photo is enough, sometimes you log time without media, sometimes both. The form follows the activity, not the other way around. Preset chips (Lego, baking, nature, music, drawing, reading, zoo/museum, sports) cover the common shapes without locking Shelly into them: she can de-select, override, or go fully free-form.

### Consolidation doesn't mean flattening.

The Unified Capture Card collapses three logging surfaces into one — but preset chips stay grouped (Creative / Active) so categories remain visible at a glance. Reducing component count without reducing visual hierarchy. The kid variant takes the same principle further: same card, same chip grouping, but every input adapted to the kid (chip-required, +/- duration, audio-only note, per-child theme) so Lincoln and London can capture their own creative time regardless of whether a plan is locked in for the day. One mental model, two physical surfaces shaped to who is holding the phone.

### Evidence beats narrative.

The AI's weekly narrative is helpful, but the raw counts of books created/completed/read and teach-back moments captured are the unfalsifiable record of what actually happened. The "Week in Evidence" section on the Weekly Review page (`src/features/weekly-review/WeekInEvidence.tsx`) surfaces these counts directly — book activity in one column, teach-backs in the other with expandable audio playback — so Shelly always sees the data, not just the story. The narrative can miss a beat; the evidence cannot. Together they answer two different questions: "What's the pattern?" (narrative) and "What did we actually do?" (evidence).

### Worked example — "Low cognitive load for Shelly"

Plan My Week's compact setup (`src/features/planner-chat/PlannerCompactSetup.tsx`, May 2026) is a concrete instance of this principle. Returning users — Sunday night, week 2+ — see a single focused card: energy toggle, read-aloud picker, workbook chips, special notes, Generate or Repeat Last Week. The full wizard and the chat thread are still available (full wizard for first-visit users; chat collapsed to a drawer for power-user adjustments), but the default surface is sized to a 60-second pass. Friction goes down without removing capability — which is what "structure as support, not control" looks like in practice.

---

## Content Generation Threads

The conundrum-as-content-generation vision:

```
Weekly Conundrum (ethical scenario tied to theme/virtue/subjects)
  ↓
Project Ideas (what could we build/make/explore related to this?)
  ↓
Reading Connections (books/articles that touch this topic)
  ↓
Math Connections (quantitative aspects of the scenario)
  ↓
Quest Integration (Knowledge Mine questions calibrated to topic)
```

**Example:** Week theme is "stewardship." Conundrum: "You find a wallet with $200 and an ID. The person lives 2 hours away. What do you do?" This generates:
- **Project:** Budget exercise (what would $200 buy for our family?)
- **Reading:** Story about honesty, age-appropriate ethics book
- **Math:** Distance/time/gas cost calculation for the drive
- **Quest:** Reading comprehension on a related passage

The conundrum becomes the **seed** for cross-subject integration — which is exactly what Ad Astra does with projects, just adapted for a structured homeschool day.

---

## Summary

The First Principles Engine isn't trying to be Ad Astra. It's a homeschool management app for a family with specific constraints (fibromyalgia, neurodivergence, compliance requirements, Christian formation priorities).

But the **philosophical alignment** is real:
- Track disposition, not just content mastery
- Use teach-back as the richest evidence
- Build ethical reasoning through conundrums
- Let AI synthesize growth narratives from existing data
- Respect the child's challenges (all taps, no typing for Lincoln)
- Never shame — struggles are data, not failure

The daily flow stays structured. The compliance stays. The Minecraft framing stays. But the **growth story** shifts from "what rung are you on?" to "how are you showing up as a learner?"

---

## One Narrative Home for the Kid

**Hero Hub** is where the threads braid — formation (armor of God), ethics (today's conundrum), curriculum (launcher to Knowledge Mine), creativity (launchers to Workshop and My Books). Three parallel mental models — Today checklist, Knowledge Mine, the old My Armor page — used to compete for Lincoln's attention. Hero Hub unifies them around identity: *here is who you are*, then *here is the work*. Today stays the daily list; Hero Hub stays the story.

---

## Curriculum Tracking — Coverage, Not Pace

Curriculum position data (workbook configs) is used for **skill calibration**:
- "Lincoln has covered consonant blends through GATB Lesson 47 — suggest vowel teams next"
- "Reading Eggs complete — don't suggest basic phonics"

It is NEVER used for **pace pressure**:
- ~~"Lincoln is behind — needs 1.5 lessons/day to finish by June"~~
- ~~"39% complete, should be at 50%"~~

The AI context pipeline sends covered skills and upcoming topics.
It does NOT send pace status, deadline math, or completion percentages.

---

## Faith Stats (kid-facing layer)

Faith Stats are the gamified Lincoln-side view of growth — four named stat bars that surface on `/avatar` (under the existing XP bar) and on the Quest Complete screen. They speak the Minecraft-and-armor language Lincoln already lives in, so growth shows up where he already looks.

The four stats:

| Stat | What it tracks |
|---|---|
| **Strength** | Stuck → came-back ratio. How often he picked himself up after hitting a wall. |
| **Wisdom** | Mastery average across subjects. The "what he knows" stat. |
| **Mercy** | Times he chose the gentler retry path or helped London. The "how he treats others" stat. |
| **Courage** | Suit-up streak × tier multiplier. The "showing up every day" stat. |

**Proposed derivation formulas** (verbatim from `/docs/design-pass-v1/README.md` §State management — pending Shelly review):

- Strength = % of "stuck" entries with a "came back" follow-up.
- Wisdom = mastery average across subjects.
- Mercy = times Lincoln chose the gentler retry path or helped London.
- Courage = streak of suit-up days × tier multiplier.

**Faith Stats do not replace Dispositions.** Dispositions (Curiosity / Persistence / Articulation / Self-Awareness / Ownership) remain the canonical parent-facing report card on Progress → Learning Profile — the AI-synthesized narrative Shelly reads. Faith Stats are the kid-facing translation of the same growth philosophy: same instinct, two audiences, two vocabularies. Where data can be shared between them (e.g. persistence signal feeding Strength), share it — but never collapse one into the other.

---

## No-judge vocabulary

The Behavior Log and every other user-facing surface speak in a deliberate vocabulary that frames hard moments as data, not failure. This is the **enforced word list** for any string the user reads:

**Banned:**
- "missed"
- "behind"
- "failed"
- "couldn't"

**Required (when these moments happen):**
- "noticed"
- "flow"
- "stuck"
- "tried"
- "took a break"
- "came back"

**The "stuck" rule:** Every "stuck" must be paired with what came next. "Stuck" on its own is a verdict; "stuck, then took a break, then came back and finished 4 of 6" is a story. The amber "stuck" tag in the Behavior Log is a context flag, never a closing punctuation.

This vocabulary will be swept through `features/today/`, `features/records/`, and `features/avatar/` as step 1 of the Design Pass v1 Implementation Queue (see MASTER_OUTLINE.md). The copy pass is small in code surface area and large in emotional surface area — it's the cheapest, highest-leverage move in the design pass.

### Scope clarification

> Language directed *at* the learner needs care. Language describing app state (errors, failures, network issues) needs accuracy. The no-judge rule applies to the first, not the second. A terse "Photo upload failed" is not a judgment on the learner; it's the app being honest about itself.

---

## Measurement-sensitivity guardrail (the mechanic carries the message)

The no-judge vocabulary rail governs the *words* a learner reads. This rail governs the *mechanics* —
the counters, streaks, scores, and progress-to-target bars. **Both apply.** Kind words wrapped around a
"0/10" still ship a verdict, because **the mechanic carries the message**. For Lincoln specifically — a
perfectionist who is sensitive to measurement — a counter that can read as "how far short you are" lands
as judgment even when every string around it is gentle.

**Principle.** Each measurement mechanic on a kid surface is a **deliberate choice**, reviewed against
Lincoln's sensitivity — not an accident of iteration. When a counter appears on a kid screen, someone
chose to measure that thing, in that framing, in front of him. That choice deserves the same care we give
the word list.

**Preference, not prohibition.** Measurement isn't banned — it's chosen on purpose. The preference is for
**accumulating / one-direction** framings over **implied-target / scored** framings *where the latter
would induce shame on a low day*:

- **Favor:** collect, earn, "N done", "N mined", a bag that fills, a count that only goes up.
- **Use with care:** "3/10", "0/N", percentages, and **streaks that can break**. These imply a target the
  child can fall short of, and a streak that resets turns a single hard day into a visible loss.

This is a preference, not a ban: a fraction or a streak can be the right call when it genuinely motivates
without threatening. The rule is that picking the scored framing is a decision made on purpose, not a
default reached for.

**Complements no-judge vocabulary.** That rail = words; this rail = mechanics. A surface passes only when
*both* read as "here is what you built," never "here is where you fell short."

### Live surfaces to review against this rail

A quick read of the current kid-facing surfaces (`features/today/`, `features/avatar/`, `features/quest/`)
turns up these measurement mechanics. Listed here as **review items only — no code is changed by this
guardrail.** Disposition (keep / soften / rework) is a per-surface call for Nathan (see the open question
below).

| Surface | Mechanic | Framing | Suggested review |
|---|---|---|---|
| **Faith Stats — Courage** (`FIRST_PRINCIPLES_ALIGNMENT.md` above; derivation in `/docs/design-pass-v1`) | `Courage = suit-up streak × tier multiplier` | **Breakable streak** — the clearest test case | **Rework candidate:** a breakable streak → an accumulating "days suited up" badge count that never resets down. |
| **Armor suit-up streak** (`avatar/MyAvatarPage.tsx` `checkArmorStreak`) | `armorStreak`, resets on a missed day | **Breakable streak** (feeds Courage) | **Rework candidate:** same — accumulate lifetime suit-up days rather than reset on a gap. |
| **Quest "day streak"** (`quest/QuestSummary.tsx`) | `{n} day streak!` on Quest Complete | **Breakable streak** | **Rework candidate:** celebrate the day's diamonds mined (accumulating) rather than a streak that a missed day breaks. |
| **Kid Today must-do counter** (`today/KidChecklist.tsx`, `today/KidTodayView.tsx`) | `X of N quests done`, `X/N quests done`, gate dots | **Implied-target fraction (0/N)** | **Soften candidate:** lead with "N done" (accumulating) and keep the gate framing as "N more to craft" rather than a bare `0/N` on a fresh day. |
| **Suit-up pieces counter** (`today/KidTodayView.tsx`) | `{n}/6 pieces on` | **Implied-target fraction** | **Soften candidate:** acceptable as a daily-ritual readout; consider "N pieces on" if `/6` reads as a shortfall. |
| **Stonebridge mission bar** (`avatar/stonebridge/StonebridgeMissionCard.tsx`) | `X / Y reading actions` + progress bar | **Progress-to-target bar** | **Keep / soften:** target is a *repair goal* (build toward), surplus carries forward — closer to accumulating; watch the `X / Y` label on a zero day. |
| **XP-to-next-tier / next-piece** (`avatar/MinecraftXpBar.tsx`, `avatar/MyAvatarPage.tsx`) | `{xp} XP to {next}`, % bar to next unlock | **Progress-to-target bar** | **Keep:** frames an *unlock ahead* (earn toward), not a shortfall behind; one-direction by construction. |
| **Accumulating counters** — `+X XP today`, `X XP earned`, diamonds mined, `X min mined today`, `🚩 N banners raised`, diamond balance (`today/`, `avatar/`, `quest/ReadingQuest.tsx`) | count only goes up | **Accumulating / one-direction** | **Keep:** these are the preferred shape — collect/earn, never a target to fall short of. |

### Open question for Nathan

This rail is written in a **deliberate-moderation** stance — measurement is used on purpose, not minimized
on principle. The live code already reflects that (the Courage streak exists by choice). The unsettled
question from the original thread — *minimize measurement* vs *measurement-in-moderation* — is left open
**per surface**: whether any of the listed mechanics (especially the three breakable streaks) should
actually change is a decision for Nathan, to be made surface-by-surface in a later run. This guardrail
documents the rail and the review list; it does **not** change any mechanic.

---

## Quest Complete mom-note guardrail

Quest Complete (the celebration screen Lincoln sees on quest completion) always renders a **Note from Mom** card. The note is **hand-written by Shelly** in her parallel "Shelly noticed" insight surface — it is never AI-generated.

When Shelly hasn't written one yet, the card shows a soft fallback line:

> "Mom will see this tonight."

This is the only acceptable substitute. **AI-generated praise blurbs are explicitly prohibited** in this slot. A generic AI "Great job!" would corrode the meaning of every real mom-note — Lincoln has to be able to trust that if the card says something specific, his mom actually said it. The fallback is a promise of a real note later, not a placeholder pretending to be one.

This is the same instinct as Design Decision #3 in MASTER_OUTLINE.md ("Charter alignment: all AI-generated content must be reviewable against family values") taken one step further: in this single surface, AI content is not just reviewable — it's banned outright. The note is the relationship; the AI never gets to forge that signature.
