# First Principles Engine — System Review

## Purpose

This review looks at the full loop from evaluation to weekly planning to daily execution, with special attention to:

- how curriculum pacing should work without creating pressure
- how Lincoln's progress should be evaluated and re-evaluated
- how the milestone / ladder / map pieces should fit together
- how the system should help Shelly know what to skip, what to focus on, and what matters most next
- how ethos, formation, and disposition tracking fit into the operational system

---

## Executive Summary

The system is closer than it feels.

The core loop already exists:

- **Evaluation** produces a Skill Snapshot with priority skills, supports, stop rules, conceptual blocks, and completed programs.
- **Planning** consumes evaluation context, curriculum coverage, recent scans, mastery observations, engagement patterns, and activity configs.
- **Daily execution** captures the evidence that matters: completion, engagement, mastery, grade result, evidence artifacts, and minutes.
- **Weekly review** reads what happened during the week and suggests pace adjustments and next-step recommendations.

The architecture is not missing the loop.

The real problem is that there are **too many overlapping truths** about Lincoln's current state.

Right now the system can answer “Where is Lincoln right now?” from multiple places:

- Skill Snapshot
- Ladders
- Milestones
- Learning Map
- Curriculum position
- Disposition profile

That is the main conundrum.

The system does not need more concepts first. It needs **sharper authority**.

---

## What the System Already Gets Right

### 1. The ethos is strong and coherent

The repo direction is clear and healthy:

- formation first
- no shame
- evaluate before plan
- engagement over completion
- disposition over content mastery
- curriculum should be used for coverage and calibration, not pressure

This is the right foundation.

### 2. The daily checklist is the right evidence surface

The checklist structure already carries the important signals:

- completed
- engagement
- mastery
- grade result
- evidence artifact
- actual minutes
- skip guidance
- content guide

That means the system already has a practical place for "what actually happened today."

### 3. The planner is being fed rich enough context

The planning pipeline already reads:

- recent evaluation context
- skill snapshot
- recent scans
- curriculum coverage
- mastery observations from recent days
- engagement summaries
- activity configs
- completed programs

That is enough information to make strong planning decisions if the authority structure is cleaned up.

### 4. Weekly review is useful in principle

The weekly review already gathers:

- day logs
- checklist completion
- subject minutes
- grade notes
- evidence counts
- energy state
- plan type
- missed days
- book activity

That is enough to generate a real adaptive review.

---

## The Actual System Problem

The main issue is **not missing features**.

The main issue is **too many competing systems trying to describe progress**.

Some of these are tactical.
Some are narrative.
Some are curricular.
Some are dispositional.

But they are not sharply separated.

That creates ambiguity for Shelly.

Instead of one clean answer to:

- what should I work on now?
- what can I skip?
- what is still shaky?
- what is the next frontier?

…she can end up mentally merging multiple pages and multiple concepts.

That is friction.

---

## Recommended Operating Model

The system should be treated as **three legs plus one overlay**.

---

## Leg 1 — Evaluation and Skill Map

### Question this leg answers

**What is Lincoln ready for now, what is shaky, and what should be skipped?**

### What belongs here

- Skill Snapshot
- child skill map / Learning Map
- evaluation findings
- conceptual blocks
- mastery gates
- completed programs

### What this leg should become

This should be the **tactical truth**.

This is the system that decides:

- skip
- focus
- review
- direct instruction
- what is secure
- what is emerging
- what is not yet ready

### Recommendation

Make **Skill Snapshot + Learning Map** the single tactical engine.

Ladders and milestones can remain, but they should stop being separate decision systems.
They should become either:

- visualizations of the same underlying truth, or
- motivational / narrative surfaces

Not independent state systems.

---

## Leg 2 — Weekly Planning and Curriculum Flow

### Question this leg answers

**Given where Lincoln is now, what should this week contain?**

### What belongs here

- Activity Configs
- recent scans
- current curriculum position
- weekly plan
- light-day rules
- MVD logic
- block ordering
- evaluation scheduling

### What this leg should become

This should be the **operational truth**.

This is where Shelly should see:

- what to do this week
- what to drop on light days
- what is worth full effort
- what is skimmable
- what independent items can carry the load
- where to resume in curriculum

### Recommendation

The weekly plan should become the place where all tactical complexity is translated into simple teaching guidance.

Shelly should not have to mentally merge Progress + Evaluation + Planner.
The plan should already surface:

- **Focus here**
- **Safe to skip**
- **Watch for this**
- **Resume at this spot**

---

## Leg 3 — Daily Execution and Evidence

### Question this leg answers

**What actually happened?**

### What belongs here

- checklist completion
- engagement
- mastery
- grade result
- evidence artifacts
- actual minutes
- teach-back
- chapter response
- extra activity logging

### What this leg should become

This should be the **evidence truth**.

It should not try to be the place where Shelly interprets long-term direction.
Its job is to capture what really happened with low friction.

### Recommendation

Keep daily logging simple and direct.
It is already the strongest part of the loop.

---

## Overlay — Ethos, Formation, and Disposition

### Question this overlay answers

**How is Lincoln showing up as a learner and as a person?**

### What belongs here

- disposition profile
n- conundrums
- teach-back
- chapter discussions
- heart questions
- formation tracking
- narration

### What this overlay should become

This is the **meaning layer**, not the tactical driver of workbook decisions.

It explains:

- how Lincoln approaches learning
- whether he is growing in curiosity, persistence, articulation, self-awareness, and ownership
- how formation is showing up in daily life

### Recommendation

Keep this layer strong, but do not let it compete with Skill Snapshot for operational control.

Conundrums and disposition belong in the engine.
They are not fluff.
They keep the system from becoming sterile.
But they should remain the **meaning layer**, not the tactical planner brain.

---

## Where the System Still Has Structural Conflicts

### 1. Curriculum still has two truth sources

The system still has both:

- `WorkbookConfig`
- `ActivityConfig`

That creates ambiguity.

`ActivityConfig` is clearly the better long-term model because it can hold:

- type
- frequency
- sort order
- schedule block
- light-day behavior
- current position
- scannable state
- completion state

But `WorkbookConfig` still exists and still carries pace-related data.

### Recommendation

Finish the migration.
Make `ActivityConfig` the real operational home for curriculum.
Leave workbook-style pacing only as a helper, not as a live second planning system.

---

### 2. DayLog still carries legacy structure and new structure

The day log still contains both:

- older reading/math/speech routine structures
- block/checklist-based execution structures

That means there is still more than one way for the app to imply what happened today.

### Recommendation

Make checklist + block evidence the primary execution model.
Legacy routine fields should either become derived, hidden, or removed over time.

---

### 3. Weekly review looks informative, but not yet decisive

Weekly review generates:

- celebration
- summary
- wins
- growth areas
- pace adjustments
- recommendations
- energy pattern

That is good.

But it still reads more like a report than a controller.
There does not appear to be a strong closed loop where accepted weekly adjustments write back into the real planning configuration.

### Recommendation

If Shelly accepts a pace or structure adjustment, it should update something real:

- activity frequency
- default minutes
- droppable-on-light-day flags
- planner defaults
- evaluation cadence

Otherwise Weekly Review remains interesting but not operational.

---

### 4. Evaluation is a little too isolated

The evaluation task intentionally loads a narrower context, which avoids over-biasing the diagnostic.
That is good.

But it also means evaluation is not naturally comparing against:

- recent daily mastery observations
- recent scans
- prior frontier decisions
- current curriculum path

This likely contributes to the feeling that you need an “evaluation of the evaluation.”

### Recommendation

Split evaluation into two modes:

#### Diagnostic mode
A cleaner skill check with minimal contamination.

#### Progress-check mode
A targeted re-check against the current frontier and active plan.

That would make the re-evaluation loop much more trustworthy.

---

### 5. Skip guidance is still too prompt-driven

The planner is instructed to generate skip guidance using skill snapshot and curriculum context.
That is useful.

But the logic still leans heavily on AI phrasing rather than a stable decision engine.
Also, mastery summaries are grouped by activity label, which can get fuzzy if names drift.

### Recommendation

Turn skip guidance into a **rules engine with AI wording**.

Base rule:

- **Secure / mastered** → skim or skip
- **Emerging** → full practice
- **Not yet** → direct instruction
- **ADDRESS_NOW conceptual block** → focused work
- **Unknown lesson content** → check scan / content guide first

The AI can phrase the note, but the underlying decision should be stable.

---

### 6. Weekly review may be learning from estimated time instead of actual time

If pacing and effort are inferred mainly from estimated or planned minutes instead of actual minutes, the review loop can drift.

### Recommendation

Use actual minutes as the primary signal when available.
Fallback to estimated minutes only when real timing was not captured.

---

## The Core Conundrum: Pace Without Pressure

This is one of the most important tensions in the whole system.

You want curriculum to maintain a healthy pace.
You do **not** want the system to pressure Lincoln or shame Shelly.

That is the right tension to protect.

### What should happen

Curriculum should be used for:

- coverage
- calibration
- resume point
- next content suggestion
- parent awareness

Curriculum should **not** be used to create child-facing pressure language.

### Best model

Keep pace as a **private parent-side signal**.

For Shelly, it is helpful to know:

- comfortable pace
- needs nudge
- likely late if unchanged

But that should be a planning aid, not a moral verdict.

### Recommendation

Add a soft pace gauge for the parent, built from:

- current position
- finish window
- school days per week
- recent scan data
- recent actual completion pattern

This gauge should guide weekly planning quietly.
It should not leak into the emotional logic of the system.

---

## How Shelly Should Experience the System

Every week, Shelly should not have to interpret six surfaces.
She should be given three simple answers:

### 1. What should I focus on?
Examples:

- decoding multisyllable words
- subtraction with regrouping when the smaller number is not obvious
- reading motivation and willingness to start

### 2. What is safe to skip?
Examples:

- phonics patterns already secured
- repetitive workbook practice on mastered material
- app activities tied to completed programs

### 3. What should I watch for?
Examples:

- guessing instead of decoding
- frustration after two hard items
- needing manipulatives to stay accurate
- refusing when the task looks too long, not when it is actually too hard

That is what the system should hand her.
Not just data.
Interpretation.

---

## Recommended Authority Model

This is the sharpest version of the system:

### Skill Snapshot owns
- what is next
- what is secure
- what is emerging
- what is not yet
- what should be skipped
- what conceptual blocks matter now

### Activity Configs own
- what recurs
- what belongs in the week
- frequency
- default minutes
- schedule order
- light-day droppability
- curriculum position

### Daily Checklist owns
- what actually happened
- how it went
- what was mastered
- what was frustrating
- what evidence exists
- what real minutes were spent

### Weekly Review owns
- what should change next week
- pacing adjustments
- energy-informed plan changes
- recommendations that can be accepted and written back

### Disposition / Conundrum / Formation own
- the meaning of the learning
- heart-level evidence
- articulation
- reflection
- ethical reasoning
- growth narrative

That is the clean operating model.

---

## Recommended Next Moves

### 1. Make Skill Snapshot + Learning Map the tactical source of truth
Ladders and milestones can stay, but stop letting them function as separate progress engines.

### 2. Finish migration from WorkbookConfig to ActivityConfig
One operational curriculum system is better than two.

### 3. Keep pace soft and parent-facing
Use pace to help Shelly plan, not to pressure Lincoln.

### 4. Convert skip guidance into explicit rules with AI wording
Do not leave skip/focus decisions mostly inside prompt behavior.

### 5. Make weekly review write back into the system
Accepted recommendations should update real planner configuration.

### 6. Split evaluation into diagnostic mode and progress-check mode
That gives you a clearer “evaluation of the evaluation.”

### 7. Reduce the number of surfaces Shelly has to mentally merge
The plan and the Today page should surface the key interpretation directly.

---

## Final Judgment

The system does **not** mainly need more features.
It needs **sharper authority and simpler operational ownership**.

The right center of gravity is:

- **Skill Snapshot** for tactical truth
- **Activity Configs + weekly plan** for operational truth
- **Daily checklist** for evidence truth
- **Weekly review** for adaptation
- **Disposition / formation layer** for meaning

If that authority model is clarified, the system can genuinely help Shelly:

- move quickly
- skip what Lincoln already knows
- focus on the frontier
- use curriculum without becoming trapped by it
- preserve ethos without losing practical clarity

That is the path forward.
