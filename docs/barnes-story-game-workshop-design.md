# Story Game Workshop — Feature Design Doc

**Version:** March 21, 2026  
**Status:** Phase 1 Design — Pre-Implementation  
**Owner:** Nathan (build), London (creative lead)  
**Tier 2 project doc** — include when working on Story Game Workshop

---

## Vision

London already makes games. He invents rules with his figures, assigns roles, narrates what happens next. He doesn't need to learn game design — he needs a tool that captures what's already in his head and turns it into something the whole family can play.

This is a **voice-first experience**. London talks to the app. The app talks back. He doesn't need to read instructions or type answers. He speaks his story, the wizard listens, and a playable game comes out the other side. During play, cards speak themselves aloud. The whole thing can happen hands-off from Shelly — London in the other room inventing a dragon game is a normal Tuesday.

The app calls him the **Story Keeper**. He creates. Lincoln playtests and refines. Shelly and Nathan play. The game goes in the portfolio. The learning is invisible.

**One-liner:** London tells a story out loud, the app turns it into a board game, the family plays it together.

---

## How It Fits

### In the App
- **Kid nav:** Today, Knowledge Mine, **Game Workshop**, My Stuff, Dad Lab
- New route: `/workshop` (London's creative space)
- Created games appear in My Stuff as portfolio artifacts
- Completed games log hours **split by challenge card types** — reading cards count toward Language Arts, math cards toward Math, creation time toward Creative Arts
- Finished games surface on Shelly's Today page: **"London made a new game!"** as a family activity card

### In the Learning Ethos
| Principle | How This Feature Honors It |
|-----------|---------------------------|
| Portfolio over grades | Games are artifacts, not scored assignments |
| No shame rule | Every game London makes is a real game — no "try again" |
| Formation first | Stories can carry virtue/theme connections naturally |
| Lincoln teaches London | Lincoln as Playtester — reads rules, asks questions, suggests fixes |
| Engagement > completion | The design process IS the learning, not the finished product |
| Diamonds, not scores | "You created a 12-card adventure!" not "Good job on your project" |
| Evaluate before plan | Workshop adapts to London's reading/math level from skill snapshot |

### The Lincoln Connection
Lincoln's role as **Playtester** is structured, not accidental:
- He reads London's game rules aloud (reading practice)
- He explains what's confusing (speech practice — Feynman technique)
- He suggests rule changes (critical thinking, collaboration)
- He plays first, reports bugs (sequencing, logic)
- London decides what to change (creative ownership stays with London)

This creates a natural "London creates, Lincoln refines" loop that gives both boys meaningful roles without either feeling like they're doing schoolwork.

---

## Phase 1: Guided Story Game Wizard

### Interaction Model: Voice-First

London **talks** through the entire wizard. Every step has:
- A spoken prompt from the app (TTS or pre-recorded) that asks London a question
- Visual options he can tap OR he can answer by voice (Web Speech API)
- Voice confirmation: the app reads back what it understood ("So your story is about dragons?")
- A big, obvious microphone button as the primary input — tap/select as a secondary option

This means **Shelly doesn't need to be in the room.** The wizard is a conversation between London and the app. He can sit on the couch with a tablet and talk his way through creating a game. Shelly might hear "AND THEN THE DRAGON FALLS IN THE LAVA!" from the other room and know it's working.

**Voice tech:** Web Speech API for speech-to-text input. Browser TTS (SpeechSynthesis API) for reading prompts and cards aloud. Both are browser-native, no additional services needed. If speech recognition isn't available (browser support), falls back gracefully to tap/type.

### The Flow

London opens Game Workshop and sees his created games (if any) plus a big, inviting "Create a New Game" button. The wizard walks him through **5 story steps** that become game components. Each step is spoken aloud to him:

#### Step 1: "What's Your Story About?"
- App says: "Hey Story Keeper! What's your new game about? Pick one or tell me your own idea!"
- Visual picker: 6-8 illustrated theme tiles (Dragons, Space, Ocean, Jungle, Castle, Robots, Animals, "My Own Idea")
- London can tap a tile OR say "It's about pirates!" — voice input parsed to theme
- App confirms: "A pirate adventure! Cool, let's keep going."
- **Learning connection:** Narrative framing, genre awareness

#### Step 2: "Who's in Your Story?"
- App says: "Who's in your pirate story? Tell me their names!"
- London speaks character names — app captures and displays them as tokens
- Each character gets a simple trait picker (tap): "fast," "strong," "clever," "kind"
- Option to draw a character and snap a photo (becomes token art)
- **Learning connection:** Character development, description, creativity

#### Step 3: "What Are They Trying to Do?"
- App says: "What does [character name] need to do? Are they finding treasure? Rescuing someone? Racing? Or something else?"
- 4-5 goal templates with illustrations, or London says his own
- App confirms: "Got it — Captain Finn needs to find the lost treasure!"
- **Learning connection:** Story structure (beginning → problem → resolution)

#### Step 4: "What Tricky Things Happen?"
- App says: "Every good game has tricky parts! What kinds of challenges should players face?"
- London picks challenge types from illustrated cards OR describes his own: "There should be a sea monster that asks you a question!"
- Template challenges scaled to his level:
  - **Reading challenges:** "Read the magic word to move forward" (words pulled from his skill snapshot / Love Every phonics level)
  - **Math challenges:** "Count the gold coins!" / "What's 3 + 2?" (scaled to his level)
  - **Story challenges:** "Tell everyone what happens next!" / "Make a funny sound effect!"
  - **Action challenges:** "Do 5 jumping jacks!" / "Spin around 3 times!"
- **Difficulty calibration (DECIDED):** Most cards generated at London's current skill level. 1-2 stretch cards per game marked as "Boss Challenge" or "Dragon's Riddle" — harder, but framed as special, not frustrating. If London asks for "really hard" the flavor matches his request but the actual difficulty only stretches slightly.
- London can also dictate custom challenge ideas: "If you land here you have to talk like a pirate!" — AI formats into a card
- **Learning connection:** This is where phonics, math, and storytelling practice live — but London experiences it as "making the tricky parts"

#### Step 5: "How Does Your Game Look?"
- App says: "Almost done! What shape should your game board be?"
- Board style picker: Winding path (like Candyland), Grid (like checkers/simple), Circle (round and round)
- Number of spaces: Short (15), Medium (25), Long (35) — shown visually, not as numbers
- AI generates the board with theme art, challenge card placement, and special spaces
- App reads the preview back: "Your game has 25 spaces, 12 challenge cards, and 3 shortcuts. Want to change anything?"
- London can say "Make it longer" / "Add more tricky parts" / "More dragons!" — voice adjustments
- **Learning connection:** Spatial reasoning, counting, planning

### What the AI Does Behind the Scenes

After London completes the wizard, the `chat` Cloud Function (new `taskType: 'workshop'`) assembles:

1. **A game board** — SVG/canvas path with numbered spaces, themed art, challenge card spots, start/finish
2. **Challenge cards** — 8-16 cards mixing reading, math, story, and action based on London's choices + his skill level
3. **Special spaces** — "Go forward 2!" / "Oh no, go back 1!" / "Draw a challenge card!" / story-themed events
4. **Rules sheet** — Simple, illustrated, 3-5 rules max. Written at London's reading level.
5. **Game metadata** — title, player count, estimated play time

The prompt includes:
- London's skill snapshot (reading level, math level) for challenge card calibration
- His wizard answers (theme, characters, goal, challenges, board style)
- Charter preamble (values, tone)
- Game design constraints (age-appropriate complexity, max rules, accessibility for Lincoln/Shelly)

### AI Prompt Approach

```
taskType: 'workshop'
Model: Sonnet (same as plan generation)
System prompt includes:
  - Charter preamble
  - London's skill snapshot (reading + math levels)
  - Love Every phonics alignment (if available in workbook configs)
  - Game constraints:
    - Max 5 rules
    - All card text readable by TTS (clear, short sentences)
    - Challenge cards: majority at skill level, 1-2 stretch "boss" cards
    - Board: clear path, no ambiguity
    - Tone: adventurous, encouraging, London is the creator
  - Voice context: all text will be spoken aloud, write for the ear not the eye
Output schema:
  - gameBoard: { style, spaces[], specialSpaces[], challengeSpots[] }
  - challengeCards: [{ type, content, difficulty, spokenText }]
  - rules: [{ ruleNumber, text, spokenText }]
  - metadata: { title, playerCount, estimatedMinutes, theme }
```

Note: Every text field has a parallel `spokenText` field optimized for TTS — shorter, more conversational, avoids abbreviations or symbols that TTS mangles.

---

## Phase 1: Digital Play Experience

### Game Screen
- Top: Game title + London's theme art
- Center: Board view — path of spaces with player tokens
- Bottom: Action area (roll dice, draw card, current player indicator)
- Sidebar/overlay: Challenge card display when drawn

### Play Flow
1. London invites players (select family members — Mom, Dad, Lincoln, London)
2. Turn order shown at top
3. Active player taps "Roll" → animated dice → token moves
4. If token lands on challenge space → card appears AND is **read aloud by the app:**
   - **Reading card:** App says the word/sentence first, then shows it. Player repeats it aloud. London as Story Keeper confirms ("Yeah, that's right!" or "Try again!"). Correct → bonus move or reward. This way even London can handle reading cards — he hears it, then sees it, then says it.
   - **Math card:** App reads the problem aloud ("What's three plus two?"). Player answers verbally or taps from 3 choices. Correct → bonus.
   - **Story card:** App reads the prompt ("Tell everyone what the dragon does next!"). No right/wrong — London decides if it's good enough (he's the Story Keeper).
   - **Action card:** App reads the action ("Do five jumping jacks!"). Everyone laughs. Move forward.
5. First to finish wins — but emphasis is on the journey ("Look at all the challenges you survived!")
6. Game over screen celebrates London as creator: "London's [Game Title] — Played by the Barnes Family!"

### Voice During Play
- **All card text is spoken aloud** via browser TTS (SpeechSynthesis API). Cards display text simultaneously for players who want to read along, but listening is the primary experience.
- **Rules are read aloud** at game start: "London's rules! Rule one: Roll the dice and move that many spaces..."
- **Board events spoken:** "Oh no! The sea monster pushed you back two spaces!" / "You found a shortcut! Jump ahead!"
- This makes the game accessible for London (who doesn't read fluently), Shelly (who may be low-energy), and the whole family (eyes on each other, not the screen).
- **Future (Phase 2-3):** London records his own voice for select cards during creation — "YOU FELL IN THE LAVA!" in his best dragon voice. Way more magical than TTS.

### Key UX Decisions
- **No AI during play** — the game is fully generated before play starts. No API calls mid-game. Fast, offline-friendly. TTS is browser-native, no network needed.
- **Voice is the primary channel** — cards speak, rules speak, board events speak. The screen is supplementary. This means the family can look at each other, not the device.
- **London is the Story Keeper during play** — he resolves disputes, decides if story answers are "good enough," confirms reading attempts. This is intentional: he's practicing authority, communication, and fairness.
- **No elimination** — everyone finishes. First to arrive gets "Story Keeper's Champion" title, but everyone completes the path.
- **Honor system** — no AI grading during play. Family trust. London as Story Keeper is the judge. This matches the "portfolio over grades" ethos.
- **Short games** — target 10-20 minutes. London is 6. Attention spans are real.
- **Honor system for reading/action cards** — no AI grading. Family trust. This matches the "portfolio over grades" ethos.
- **Short games** — target 10-20 minutes. London is 6. Attention spans are real.

---

## Data Model

### New Firestore Collection
`families/{familyId}/storyGames/{gameId}`

```typescript
interface StoryGame {
  id: string;
  childId: string; // London's child ID
  createdAt: Timestamp;
  updatedAt: Timestamp;
  status: 'draft' | 'ready' | 'played';
  
  // Wizard inputs (London's creative choices — mostly captured via voice)
  storyInputs: {
    theme: string; // 'dragons' | 'space' | 'ocean' | etc. | custom text (transcribed)
    characters: Array<{
      name: string; // spoken name, transcribed
      trait: string;
      customArt?: string; // Storage URL if London drew the character
    }>;
    goal: string; // 'find_treasure' | 'rescue' | etc. | custom text (transcribed)
    challenges: Array<{
      type: 'reading' | 'math' | 'story' | 'action' | 'custom';
      idea?: string; // London's custom challenge idea (transcribed from voice)
    }>;
    boardStyle: 'winding' | 'grid' | 'circle';
    boardLength: 'short' | 'medium' | 'long';
    voiceTranscripts?: string[]; // raw voice transcriptions for portfolio/debugging
  };

  // AI-generated game (output of workshop prompt)
  generatedGame: {
    title: string;
    board: {
      spaces: Array<{
        index: number;
        type: 'normal' | 'challenge' | 'bonus' | 'setback' | 'special';
        label?: string;
        challengeCardId?: string;
      }>;
      totalSpaces: number;
    };
    challengeCards: Array<{
      id: string;
      type: 'reading' | 'math' | 'story' | 'action';
      content: string;
      spokenText: string; // TTS-optimized version of content
      difficulty?: 'easy' | 'medium' | 'stretch'; // stretch = boss challenge
      answer?: string; // for reading/math cards
      options?: string[]; // for multiple choice
    }>;
    rules: Array<{
      number: number;
      text: string;
      spokenText: string; // TTS-optimized version
    }>;
    metadata: {
      playerCount: { min: number; max: number };
      estimatedMinutes: number;
      theme: string;
    };
  };

  // Play sessions
  playSessions: Array<{
    playedAt: Timestamp;
    players: string[]; // child IDs or 'parent-shelly' / 'parent-nathan'
    winner?: string;
    durationMinutes?: number;
    // No scores — just who played and how long
  }>;
}
```

### Integration with Existing Collections

- **`artifacts`** — completed games (status: 'played') create an artifact entry with type `'story-game'`, linking to the game doc. Shows in My Stuff and Portfolio.
- **`hours`** — game creation time logs under Creative Arts. Play sessions split by challenge card composition: if a game has 6 reading cards, 4 math cards, and 4 story/action cards, a 20-minute play session logs ~8.5 min Language Arts, ~5.7 min Math, ~5.7 min Creative Arts (proportional). Calculated from `challengeCards` array at game-over.
- **`aiUsage`** — workshop prompt calls tracked here as usual.

### Cloud Function Changes

Extend the existing `chat` function:
- New `taskType: 'workshop'`
- New prompt builder: `buildWorkshopPrompt(childContext, storyInputs)`
- Output parsed with structured schema (similar to `<finding>` extraction pattern used in evaluation)
- No new Cloud Function needed — reuses existing `chat` function pattern

---

## Phase Roadmap

### Phase 1 — Voice-First Story Game Wizard + Digital Play (This Build)
- Voice-driven 5-step wizard (Web Speech API input, SpeechSynthesis output)
- Visual tap/select as fallback for every voice step
- AI generates board game from spoken story inputs
- Digital board game playable in-app (2-4 players, pass-and-play)
- All challenge cards and rules read aloud via TTS during play
- Games saved to portfolio
- Hours logged on play (split by card types)
- Surfaces on Shelly's Today page when a new game is ready
- Kid nav: Game Workshop route

### Phase 2 — Lincoln as Playtester + London Voice Recording
- Dedicated "Playtest Mode" — Lincoln plays solo, flags confusing rules
- Lincoln's feedback captured (text or voice) and shown to London
- London can revise the game based on feedback
- Revision history visible ("Version 1 → Version 2, Lincoln helped fix the dragon rule")
- **London records his own voice** for select cards during creation — replaces TTS with his voice during play

### Phase 3 — Print & Draw
- Generate printable board PDF + cut-out challenge cards
- London draws custom art → snap photo → becomes board background or card art
- DALL-E integration for theme illustrations (already have `generateImage` function)
- Printable rules sheet

### Phase 4 — More Game Types
- Card games (draw, match, collect sets)
- Choose-your-adventure stories (branching narrative, no board)
- Quiz show format (London writes questions, family buzzes in)

### Phase 5 — Open Creator
- Less wizard, more freeform — London types/dictates a game idea, AI structures it
- Chat helper for when he gets stuck ("I don't know what happens next" → AI suggests 3 options)
- Custom rule creation
- Remix existing games ("Make my dragon game but in space this time")

### Future Connections
- **Week Focus integration** — "This week's virtue is courage. Want to make a game about bravery?"
- **Together Time block** — London's games become a structured paired activity with Lincoln
- **Avatar integration** — creating games could earn crafting materials or unlock "Story Keeper" armor
- **Evaluation tie-in** — challenge card performance (which reading words London chose, which math levels) feeds back into skill snapshot over time

---

## Design Principles for This Feature

1. **London is the creator, not the student.** The wizard helps him make something. It never corrects him or says his idea isn't good enough. Every game he makes is a real game.

2. **Stories first, mechanics second.** The wizard asks story questions. The game rules emerge from the story. London never has to think about "game design" — he just tells his story.

3. **Voice is the primary channel.** London talks, the app listens. The app talks, London listens. Reading and typing are secondary. This is how a 6-year-old naturally communicates.

4. **Hands-off from Shelly.** London can create a game independently. The wizard is a conversation, not a form. Shelly's involvement is playing the game, not helping build it.

5. **Family play is the payoff.** The goal isn't a polished game. The goal is the family sitting together playing something London made. The game quality bar is "fun enough for 15 minutes," not "publishable."

6. **Learning is invisible.** Reading practice is "the card reads a word and you say it back." Math practice is "count your spaces." Communication practice is "explain the rules to Mom." London never sees these as learning objectives.

7. **Keep it short.** Wizard: 5-10 minutes. Games: 10-20 minutes. London is 6. Respect his attention span and energy.

8. **Honor system.** No AI grading during play. Family trust. London as Story Keeper is the judge. This builds his judgment and leadership.

9. **Celebrate the making.** "London created The Dragon Race! 14 challenge cards, 25 spaces, played by 4 Barnes family members." The artifact is the achievement.

---

## Resolved Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Voice input in Phase 1? | **Yes — voice is primary input and output** | London doesn't read fluently and is already verbal. This is a voice-first experience, not a visual-first one with voice added. |
| Shelly's role in creation? | **Hands-off — London works independently** | He already makes games with his figures. The wizard is a conversation with the app, not a form that needs adult help. |
| Challenge card difficulty? | **Mix — most at skill level, 1-2 stretch "boss" cards** | Respects his actual level while honoring his creative ambitions. Stretch cards framed as special (dragon's riddle, boss battle), not as "hard." |
| Compliance hours? | **Split by challenge card types** | Reading cards → Language Arts, math cards → Math, creation time + story/action cards → Creative Arts. Proportional to card mix in each game. |
| Today page surfacing? | **Yes — "London made a new game!" card** | Games are a family activity. Making them visible encourages play and celebrates London's work. |

## Remaining Open Items

- **TTS voice selection.** Browser SpeechSynthesis has multiple voices — should we pick a specific one for the "Story Keeper narrator" feel, or let it use the default? Some voices work better for kids. Test during implementation.
- **Voice recognition accuracy for a 6-year-old.** Web Speech API may struggle with London's pronunciation. Need a fallback UX: "I didn't catch that — want to try again or tap to type?" Test early.
- **Board game art generation.** Phase 1 boards are SVG/procedural. When does DALL-E get involved for richer theme art? Phase 3 currently, but could be useful earlier if boards feel too plain.
- **Maximum games before cleanup.** Should old games archive automatically? Or does London's gallery just grow? Probably not an issue for months.

---

## Implementation Notes for Claude Code

### New Files Needed
- `src/pages/workshop/` — GameWorkshop route, wizard steps, play view
- `src/components/workshop/` — Board renderer, card display, dice, token
- `functions/src/prompts/buildWorkshopPrompt.ts` — workshop prompt builder
- Add `taskType: 'workshop'` to `chat` Cloud Function handler

### Patterns to Follow
- Wizard flow: similar to Plan My Week guided setup
- AI generation: same `chat` function pattern with new taskType
- Board rendering: SVG or Canvas (SVG probably simpler for Phase 1)
- Data model: follows `labSessions` pattern (creative artifact with child ownership)
- Kid view: follows `KidDadLabView` pattern (London sees his space, creates, plays)

### Dependencies
- No new packages expected — MUI, existing Firebase, existing Claude API setup
- **Web Speech API** (SpeechRecognition) for voice input — browser-native, no package needed. Check browser support: Chrome/Edge good, Safari partial, Firefox limited. Add feature detection + fallback.
- **SpeechSynthesis API** for TTS playback — browser-native. Test voice quality on target devices (tablet/phone). May want to set specific voice by name for consistency.
- Board game SVG rendering is new UI territory — may want a simple path-drawing utility
- Dice animation: CSS animation or lightweight library

---

*Last updated: March 21, 2026*
