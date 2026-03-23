# Story Game Workshop — Feature Design Doc

**Version:** March 22, 2026
**Status:** Built and deployed — all current phases complete
**Owner:** Nathan (build), London (creative lead)
**Tier 2 project doc** — include when working on Story Game Workshop

---

## Vision

London already makes games. He invents rules with his figures, assigns roles, narrates what happens next. He doesn't need to learn game design — he needs a tool that captures what's already in his head and turns it into something the whole family can play.

The app calls him the **Story Keeper**. He creates. Lincoln playtests and refines. Shelly and Nathan play. The game goes in the portfolio. The learning is invisible.

**One-liner:** London tells a story, the app turns it into a game, the family plays it together.

---

## How It Fits

### In the App
- **Kid nav:** Today, Knowledge Mine, **Game Workshop**, My Stuff, Dad Lab
- Route: `/workshop` (London's creative space)
- Created games visible to all family members across devices
- Completed games log hours **split by challenge card types** — reading → Language Arts, math → Math, creation time + story/action → Creative Arts
- Finished games surface on Shelly's Today page: **"London made a new game!"** as a family activity card
- In-progress games surface as **"Continue [Title]?"** cards

### In the Learning Ethos
| Principle | How This Feature Honors It |
|-----------|---------------------------|
| Portfolio over grades | Games are artifacts, not scored assignments |
| No shame rule | Every game London makes is a real game — no "try again" |
| Formation first | Stories can carry virtue/theme connections naturally |
| Lincoln teaches London | Lincoln as Playtester — reads cards, gives feedback, suggests fixes |
| Engagement > completion | The design process IS the learning, not the finished product |
| Diamonds, not scores | "You created a 12-card adventure!" not "Good job on your project" |
| Evaluate before plan | Workshop adapts to London's reading/math level from skill snapshot |
| Voice-first for London | He talks, the app listens; he listens, the app talks |
| London creates, Lincoln refines | Story Keeper / Playtester roles give both boys meaningful work |

### The Lincoln Connection
Lincoln's role as **Playtester** is built and structured:
- Dedicated Playtest mode — Lincoln sees ALL cards/nodes, gives per-item feedback
- Five reaction types: 👍 Makes sense, 🤔 Confusing, 😬 Too hard, 😴 Too easy, 🔄 Change this
- Text or voice feedback per flagged item
- London reviews feedback, decides what to fix (creative ownership stays with London)
- AI-assisted card fixes available
- Version tracking: "Version 2 — Lincoln helped fix the dragon rule"

---

## What's Built and Working

### Three Game Types

#### 🎲 Board Games
- Wizard Steps: Game Type → Theme → Players → Goal → Challenges → Board Style
- CSS Grid board with snaking path, player tokens, challenge/bonus/setback/shortcut spaces
- DALL-E generated board background with overlay for readability
- Challenge cards: Reading, Math, Story, Action types
- Difficulty calibration: majority at London's skill level, 1-2 stretch "boss" cards
- 15/25/35 space boards (Short/Medium/Long)

#### 📖 Choose-Your-Adventure Stories
- Wizard Steps: Game Type → Theme → Players → Story Setup → Choice Points → Length
- AI generates branching story tree (nodes with 2-3 choices each)
- No dead ends — retry endings loop back to previous choice
- Embedded challenge cards at some nodes
- Scene illustrations via DALL-E at key narrative nodes
- Short (5 choices, ~5 min), Medium (8 choices, ~10 min), Long (12 choices, ~15 min)

#### 🃏 Card Games (three mechanics)
- **Matching (Memory):** Flip cards, find pairs. 6-12 pairs per game.
- **Collecting (Go Fish):** Draw cards, ask players, collect complete sets. 4-6 sets of 3-4 cards.
- **Battle (War+):** Play cards, compare power values, winner takes. Special abilities and power bonuses.
- 20-30% of cards have embedded learning elements (reading/math)
- Wizard Steps: Game Type → Theme → Players → Mechanic → Card Design → Style

### Guided Wizard (Shared Infrastructure)

**Game Type Selection** — first step for all games:
- Three illustrated cards: 🎲 Board Game, 📖 Adventure Story, 🃏 Card Game
- Read-aloud tiles: tap once to hear description, tap again to select
- TTS prompts throughout

**Theme Step** (shared by all types):
- Visual picker: Dragons, Space, Ocean, Jungle, Castle, Robots, Animals, My Own Idea
- Read-aloud tiles with TTS on every option
- Custom theme via keyboard dictation (native device mic, not custom Web Speech API)

**Player Selection** (shared by all types):
- Family member cards: Lincoln and London with Minecraft avatars from `avatarProfiles`
- Mom/Dad with DALL-E generated themed tokens
- London auto-selected (Story Keeper, always plays)
- Minimum 2, maximum 4 players
- Read-aloud tile pattern on all player cards

**Type-specific steps** follow per game type.

**Draft auto-save:** Wizard progress saves after each step. If London exits mid-creation, his draft appears in Game Workshop with "Continue Creating" at the last incomplete step. Drafts visible only to the creator.

### DALL-E Art Generation

Art generates in parallel with game data during a loading screen ("Painting your world...", "Drawing the challenges..."):

| Art piece | Where it shows | Notes |
|-----------|---------------|-------|
| Board background | Behind board game grid | 35% white overlay for readability |
| Title screen | Game preview, My Games gallery thumbnail | Hero image with gradient text overlay |
| Challenge card art (4 types) | Card reveal dialog header | Reading, Math, Story, Action each have themed art |
| Parent tokens | Board/card game player tokens | Generated for Mom/Dad (kids use Minecraft avatars) |
| Scene illustrations | Adventure story key nodes | 3-5 per adventure |
| Card back design | Card game card backs | One design per game |
| Card face art | Card game individual cards | Cost-capped at 15 images per game |

Uses `Promise.allSettled` — if any DALL-E call fails, game is fully playable with CSS/emoji fallbacks. "Regenerate Art" retry button in gallery for failed generations. Title screen waits for game data (needs real title); all other art runs in parallel.

### Play Experience (All Game Types)

**Animations:**
- Dice roll: spin animation ~1 second before landing with bounce
- Token movement: space-by-space with bounce per space (~200-300ms each)
- Challenge card: 3D flip reveal with card art fade-in
- Boss challenges: screen shake, dramatic slower flip, glow border
- Bonus spaces: speed-trail zip forward
- Setback spaces: wobble slide back
- Shortcuts: sparkle teleport with particle effect
- Turn transition: next player token pulses, TTS announces "[Name]'s turn!"
- Game over: confetti burst, winner crown animation, warm applause for all finishers
- Matching game: card flip animations, sparkle on match
- Battle game: simultaneous card reveal flip
- Adventure: page-turn/fade transitions between story nodes

**Sound effects** (Web Audio API / `<audio>` elements):
- Dice roll/land, token move, card flip, success chime, bonus whoosh, setback slide whistle, shortcut sparkle, game over fanfare, match found, battle round
- Mute toggle (top-right corner) — silences effects but not TTS
- Graceful degradation if audio unavailable

**TTS throughout** (SpeechSynthesis API):
- All challenge cards and rules read aloud
- Board events narrated
- Adventure story nodes read aloud
- Card game announcements
- Choice labels in adventures read-aloud on tap

### London Voice Recording

Optional step after game creation — London records his voice for any card, narrative node, or special space:
- MediaRecorder API (WebM/Opus format)
- Stored in Firebase Storage: `families/{familyId}/storyGames/{gameId}/audio/{cardId}.webm`
- During play: London's recording plays INSTEAD of TTS on recorded items
- "Recorded by London 🎤" label on recorded cards
- 🎤 badge in My Games gallery on games with recordings
- Re-record available from game edit view
- Reusable `useAudioRecorder` hook created

### Lincoln Playtester

- "Playtest" button visible to Lincoln (and parents) on London's games
- London does NOT see Playtest on his own games (sees Play + Edit)
- Playtest mode: Lincoln goes through ALL cards/nodes
- Per-item feedback: 👍🤔😬😴🔄 reactions with optional text/audio comment
- Playtest summary with breakdown by reaction type
- "Send to London" notifies London (badge on game card + Today page)
- London's review view: flagged items with Lincoln's feedback
- "Fix It" → edit card or "Ask AI to fix" (AI generates revised card)
- "Keep It" → London's creative decision stands
- Version counter + revision history preserved
- "Ask Lincoln to test again" after revisions
- Hours logged for Lincoln's playtest sessions

### Saving and Cross-Device

- **Family-wide visibility:** All family members see all games; drafts creator-only
- **In-progress save:** `activeSession` field tracks positions, turn, used cards — updated after every turn
- **Resume/restart:** "Pick up where you left off?" dialog with Continue / Start Over
- **Today page cards:** "London made a new game!" (unplayed) and "Continue [Title]?" (in-progress)
- **Portfolio artifacts:** Completed games saved with play history, voice recordings, art

---

## Data Model

### Firestore Collection
`families/{familyId}/storyGames/{gameId}`

```typescript
interface StoryGame {
  id: string;
  childId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  status: 'draft' | 'ready' | 'played';
  gameType: 'board' | 'adventure' | 'cards';
  currentWizardStep?: number;
  version?: number;

  storyInputs: {
    theme: string;
    players: Array<{
      id: string;
      name: string;
      avatarUrl?: string;
      isCreator: boolean;
    }>;
    goal?: string;
    challenges?: Array<{ type: string; idea?: string }>;
    boardStyle?: 'winding' | 'grid' | 'circle';
    boardLength?: 'short' | 'medium' | 'long';
    storySetup?: string;
    choiceSeeds?: string[];
    adventureLength?: 'short' | 'medium' | 'long';
    mechanic?: 'matching' | 'collecting' | 'battle';
    cardDesignInputs?: any;
    voiceTranscripts?: string[];
  };

  generatedGame: {
    title: string;
    board?: { spaces: Array<{...}>; totalSpaces: number };
    challengeCards?: Array<{
      id: string; type: string; content: string;
      spokenText: string; difficulty?: string;
      answer?: string; options?: string[];
    }>;
    rules?: Array<{ number: number; text: string; spokenText: string }>;
    metadata?: { playerCount: {...}; estimatedMinutes: number; theme: string };
    adventureTree?: {
      nodes: { [nodeId: string]: AdventureNode };
      rootNodeId: string;
      totalNodes: number; totalEndings: number; challengeCount: number;
    };
    cardGame?: {
      mechanic: string;
      cards: Array<{...}>;
      rules: Array<{...}>;
      metadata: {...};
    };
  };

  generatedArt?: {
    boardBackground?: string;
    titleScreen?: string;
    cardArt?: { reading?: string; math?: string; story?: string; action?: string };
    parentTokens?: { [parentId: string]: string };
    sceneArt?: { [nodeId: string]: string };
    cardBack?: string;
    cardFaces?: { [cardId: string]: string };
  };

  voiceRecordings?: {
    [cardOrNodeId: string]: {
      url: string; recordedBy: string;
      durationMs: number; recordedAt: Timestamp;
    };
  };

  activeSession?: {
    players: Array<{ id: string; name: string; avatarUrl?: string; position: number }>;
    currentTurnIndex: number;
    usedCardIds: string[];
    status: 'playing' | 'finished';
    startedAt: Timestamp; updatedAt: Timestamp;
  };

  playSessions: Array<{
    playedAt: Timestamp; players: string[];
    winner?: string; durationMinutes?: number;
    pathTaken?: string[];
  }>;

  playtestSessions?: Array<{
    id: string; testerId: string; testerName: string;
    completedAt: Timestamp;
    feedback: Array<{
      cardId: string;
      reaction: 'good' | 'confusing' | 'too-hard' | 'too-easy' | 'change';
      comment?: string; audioUrl?: string; timestamp: Timestamp;
    }>;
    summary: { totalCards: number; good: number; confusing: number; tooHard: number; tooEasy: number; change: number };
    status: 'in-progress' | 'complete' | 'reviewed';
  }>;

  revisionHistory?: Array<{
    version: number; revisedAt: Timestamp;
    changes: Array<{ cardId: string; oldContent: string; newContent: string; reason: string }>;
    playtestId: string;
  }>;
}
```

### Integration with Existing Collections
- **`artifacts`** — completed games create entries with type `'story-game'`
- **`hours`** — creation → Creative Arts; play split proportionally by challenge card types
- **`aiUsage`** — all `chat` (workshop) and `generateImage` calls tracked
- **`avatarProfiles`** — Lincoln/London Minecraft avatars used as player tokens

### Cloud Function
- Existing `chat` function with `taskType: 'workshop'`
- Handles: board game generation, adventure tree generation, card game generation, card fix suggestions
- Existing `generateImage` function handles all DALL-E art

---

## Reusable Hooks and Components

Built for the workshop, available app-wide:

| Hook / Component | What it does | Reuse potential |
|-----------------|-------------|----------------|
| `useTTS` | TTS queue with cancel, word boundary | Knowledge Mine, any read-aloud |
| `useSpeechRecognition` | Web Speech API wrapper | Knowledge Mine Phase 2 voice input |
| `useAudioRecorder` | MediaRecorder start/stop/playback | Dad Lab audio, Knowledge Mine voice |
| `useGameSounds` | Sound effects with mute toggle | Any gamified feature |
| `VoiceInput` | Mic button + text field | Available (workshop uses keyboard dictation instead) |

---

## What's Not Built Yet

### Next Priorities
- **Print & Draw** — printable board PDF, cut-out cards, London's hand-drawn art integration
- **Open Creator** — freeform game creation with AI chat helper, game remix
- **Quiz show game type** — London writes questions, family buzzes in

### Future Connections
- **Week Focus integration** — virtue → game theme suggestions
- **Together Time block** — London's games as paired family activities
- **Avatar integration** — game creation → crafting materials, "Story Keeper" armor
- **Evaluation tie-in** — challenge card performance → skill snapshot feedback
- **Multi-device play** — Firestore real-time sync across tablets (currently pass-and-play)

---

## Design Principles

1. **London is the creator, not the student.** Every game he makes is a real game.
2. **Stories first, mechanics second.** The wizard asks story questions. Games emerge from narrative.
3. **Voice is the primary channel.** TTS prompts, read-aloud tiles, keyboard dictation. Reading/typing are fallbacks.
4. **Hands-off from Shelly.** London creates independently. Shelly's role is playing, not helping build.
5. **Players ARE the family.** Game tokens are real people with real avatars, not fictional characters.
6. **Family play is the payoff.** Quality bar is "fun enough for 15 minutes," not "publishable."
7. **Learning is invisible.** Challenge cards are "tricky parts," not "schoolwork."
8. **Keep it short.** Wizard: 5-10 min. Games: 10-20 min. London is 6.
9. **Honor system.** No AI grading during play. London as Story Keeper is the judge.
10. **Celebrate the making.** The artifact is the achievement.
11. **Lincoln refines, London decides.** Playtester feedback is input, not authority.

---

## Resolved Decisions

| Question | Decision |
|----------|----------|
| Voice input method | Keyboard dictation (native device mic) |
| Challenge difficulty | Mix — most at skill level, 1-2 stretch "boss" cards |
| Hours categorization | Split by challenge card types proportionally |
| Today page | Yes — "new game" and "continue game" cards |
| Character vs player tokens | Players ARE the family — avatars for kids, DALL-E for parents |
| Art generation timing | During wizard completion, parallel with game generation |
| Cross-device visibility | All family games visible; drafts creator-only |
| Multi-device play | Deferred — pass-and-play for now |

## Remaining Open Items

- **TTS voice selection.** Test which SpeechSynthesis voice works best on target devices.
- **Multi-device play architecture.** Firestore listeners, turn locking, disconnect recovery.
- **Maximum games before cleanup.** Gallery grows for now.
- **Sound effect source.** Web Audio API / bundled files. Evaluate Tone.js if richer sounds needed.

---

*Last updated: March 22, 2026*
