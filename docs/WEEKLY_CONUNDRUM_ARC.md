# Conundrum Weekly Arc — Design Doc

**Date:** March 26, 2026
**Status:** Design for review — not a code prompt yet

---

## The Vision

One conundrum seeds an entire week. Shelly generates it Sunday night. The AI produces not just the scenario but connected activities for every subject. The conundrum is the intellectual fire. The workbooks are the skill scaffold. Together they make a week where Lincoln isn't just doing reading — he's thinking about a real problem through the lens of what he reads.

---

## Weekly Flow

### Sunday: Plan My Week

Shelly enters her routine, picks energy, enters the read-aloud book and chapters. She taps "Generate Conundrum." The AI produces:

```
CONUNDRUM: "The River Problem"

Scenario: A small farming village sits next to a river. Every spring the
river floods and destroys crops. The village has three options:
1. Build a dam to control the water (expensive, takes 2 years)
2. Move the village to higher ground (disruptive, everyone has to rebuild)
3. Plant special trees along the riverbank that absorb water (slow, uncertain)

Central question: Which option would you choose, and why?

WEEKLY CONNECTIONS:
- Reading tie-in: "In Chapter 5, the character faces a choice where
  all options have downsides. How is that similar to the village's problem?"
- Math context: "The dam costs 50,000 coins. The village earns 200 coins
  per day from farming. How many days of farming does the dam cost? What
  if floods destroy 30 days of crops each year?"
- London drawing prompt: "Draw the village before the flood and after.
  What does it look like when the water comes?"
- Dad Lab suggestion: "Build a miniature riverbank with sand/dirt in a
  tray. Pour water and observe what happens. Then add popsicle stick
  'trees' or a small dam. Test which solution works best."
- Virtue connection: "This week's virtue is perseverance. The village
  has to keep farming even while they work on a solution. When have you
  kept going on something even when it was hard?"
```

All of this generates from one prompt. Shelly reviews, adjusts if needed, saves to the week.

### Monday–Thursday: Connected Activities

The conundrum doesn't require a separate discussion block each day. Instead, it flavors existing activities:

| Day | Activity | Conundrum Connection |
|-----|----------|---------------------|
| Mon | Read-aloud chapter 5 | Chapter question ties back to the conundrum theme |
| Tue | Math workbook | One contextual problem uses the conundrum scenario |
| Wed | Lincoln teach-back | "Tell London what you think the village should do" |
| Thu | London drawing time | "Draw the village's solution" |
| Fri | Family discussion | Main conundrum discussion (10-15 min) |
| Sat | Dad Lab | Hands-on experiment connected to the conundrum |

The daily checklist doesn't change. The conundrum connection shows as a small card after relevant activities — "Today's conundrum connection: How is this chapter like the village's problem?"

### Friday: Family Discussion + Evidence Capture

This is the main conundrum event. The app should support:

1. **Shelly reads the scenario aloud** (the scenario text is on Today)
2. **Each person shares their position:**
   - Lincoln records audio: "I think they should... because..."
   - London records audio or Shelly notes his response: "London says move because he doesn't want the fish to be hurt"
3. **Family records the discussion** (optional): one longer audio recording
4. **Shelly adds an observation note:** 2-3 sentences about what happened
5. **Everything saves as artifacts** tagged with the conundrum

### Saturday: Dad Lab

Nathan opens Dad Lab -> "Suggest a Lab" shows the conundrum-connected suggestion prominently. He can use it or pick his own. If he uses it, the lab is pre-structured:

- Prediction: "Which solution will work best for our mini-river?"
- Materials: sand, dirt, tray, water, popsicle sticks, small rocks
- Build: construct the riverbank, try each solution
- Lincoln explains results to London
- Capture: photos, Lincoln's audio explanation

---

## Evidence Types by Person

| Person | Evidence Type | How Captured | Charter Alignment |
|--------|-------------|-------------|-------------------|
| **Lincoln** | Audio recording of his position | Tap -> Record -> Save (like teach-back) | Narration first-class, articulation disposition |
| **Lincoln** | Written position (optional, not required) | Text field, only if he wants to | No pressure on writing |
| **London** | Drawing | Photo capture of his drawing | Creative expression = core curriculum |
| **London** | Audio response | Short recording: "I think they should..." | Voice-first for London |
| **Shelly** | Observation note | Text field: what she noticed | Small artifacts > perfect documentation |
| **Family** | Discussion recording | Single audio recording, 5-15 min | Richest portfolio artifact |
| **Nathan** | Dad Lab artifacts | Photos, Lincoln's prediction/explanation | Dad Lab capture (already built) |

---

## What the AI Generates vs. What Humans Do

The line matters. The AI generates the material. The family uses it.

| AI Generates | Family Does |
|-------------|------------|
| The conundrum scenario | Reads it, discusses it |
| Chapter question connected to conundrum | Lincoln answers after reading |
| Math problem in conundrum context | Lincoln solves it during math time |
| London drawing prompt | London draws |
| Dad Lab suggestion with materials/structure | Nathan runs the lab |
| Virtue connection | Shelly weaves it into formation time |

**Shelly doesn't have to come up with anything.** She opens the app, the conundrum is there, the chapter questions are there, the math connection is there, London's drawing prompt is there. She follows the thread. The AI did the curriculum design. She does the teaching.

---

## Data Model

### Conundrum on WeekPlan (already exists, needs extension)

```typescript
conundrum?: {
  title: string
  scenario: string
  question: string
  angles: string[]
  lincolnPrompt: string
  londonPrompt: string
  virtueConnection: string
  subjectConnection: string
  // NEW: weekly connections generated by AI
  readingTieIn?: string        // connected to read-aloud chapter
  mathContext?: string          // contextual math problem
  londonDrawingPrompt?: string  // creative prompt for London
  dadLabSuggestion?: string    // suggested Saturday lab
  // Evidence collected during the week
  responses?: Array<{
    childId: string
    type: 'audio' | 'drawing' | 'text' | 'discussion'
    mediaUrl?: string
    note?: string
    createdAt: string
  }>
  discussed?: boolean
  discussedAt?: string
}
```

### Conundrum Artifacts

When evidence is captured, create artifacts tagged:
```typescript
{
  type: 'conundrum',
  tags: {
    engineStage: 'Wonder',  // or 'Explain' for Lincoln's audio
    subjectBucket: 'Other', // conundrums are cross-curricular
    conundrumTitle: weekFocus.conundrum.title,
  }
}
```

---

## Implementation Phases

### Phase A: Enrich the conundrum generation (Cloud Function change)

Update the conundrum task handler to also generate:
- `readingTieIn` — if read-aloud book is specified in the week
- `mathContext` — a contextual math problem
- `londonDrawingPrompt` — creative prompt for London
- `dadLabSuggestion` — structured lab suggestion

This just extends the existing prompt. No new task type needed.

### Phase B: Show connections on daily view

On Today (both parent and kid), after relevant activities show a small "Conundrum Connection" card:
- After read-aloud item: show `readingTieIn`
- After math item: show `mathContext`
- On London's view: show `londonDrawingPrompt`
- The conundrum scenario stays in the week focus area

### Phase C: Friday discussion evidence capture

Replace the current "We discussed this!" button with a richer capture flow:
1. Show the full scenario + question
2. "Record Lincoln's position" -> audio capture
3. "Record London's position" -> audio capture
4. "Record family discussion" -> longer audio capture
5. "Shelly's observation" -> text note
6. "London's drawing" -> photo capture
7. All save as artifacts + mark `discussed: true` on the conundrum

### Phase D: Dad Lab integration

In the "Suggest a Lab" flow (`LabSuggestions.tsx`), if the current week has a conundrum with a `dadLabSuggestion`, show it as the featured suggestion above the AI-generated options. "This week's conundrum suggests: [lab title]"

---

## What This Replaces

The conundrum weekly arc replaces the need for Shelly to:
- Come up with discussion questions (AI generates them)
- Connect subjects to each other (the conundrum IS the connection)
- Think of activities for London (drawing prompts generated)
- Plan Dad Lab topics (suggestion generated)
- Figure out how to make math relevant (contextual problems generated)

**Shelly's job becomes: read the conundrum, follow the thread, capture the evidence.**

The AI does curriculum design. The family does learning.

---

*Design doc for review. Not a code prompt. Nathan decides what to build and when.*
