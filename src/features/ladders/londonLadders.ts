import type { LadderCardDefinition } from '../../core/types/domain'

const GLOBAL_RULE = 'Level up on 3 ✔ in a row with same or less support.'

// ── Sensory + Movement ─────────────────────────────────────────

export const sensoryMovement: LadderCardDefinition = {
  ladderKey: 'london_sensory',
  title: 'Sensory + Movement',
  intent: 'Build body awareness, fine-motor play, and sensory exploration.',
  workItems: [
    'Explore a sensory bin (5 min)',
    'Scoop + pour practice',
    'Pincer grasp activities',
    'Obstacle course / balance',
    'Follow a 2-step movement game',
  ],
  metricLabel: 'One activity completed',
  globalRuleText: GLOBAL_RULE,
  rungs: [
    {
      rungId: 'R0',
      name: 'Free exploration',
      evidenceText: 'Engages with a sensory bin or tactile material for 3+ min.',
      supportsText: 'Materials placed in front, adult models play.',
    },
    {
      rungId: 'R1',
      name: 'Scoop + pour',
      evidenceText: 'Scoops and pours with a cup or spoon with minimal spilling.',
      supportsText: 'Hand-over-hand guidance, large containers.',
    },
    {
      rungId: 'R2',
      name: 'Pincer grasp',
      evidenceText: 'Picks up small objects (pom-poms, beads) using thumb and finger.',
      supportsText: 'Tweezers, larger objects to start.',
    },
    {
      rungId: 'R3',
      name: 'Balance + obstacle',
      evidenceText: 'Completes a simple 3-station obstacle course (step over, crawl under, balance).',
      supportsText: 'Adult spotting, visual markers on floor.',
    },
    {
      rungId: 'R4',
      name: 'Movement game',
      evidenceText: 'Follows a 2-step movement instruction ("jump then spin").',
      supportsText: 'Verbal model + demonstration.',
    },
  ],
}

// ── Language + Listening ────────────────────────────────────────

export const languageListening: LadderCardDefinition = {
  ladderKey: 'london_language',
  title: 'Language + Listening',
  intent: 'Build vocabulary, listening skills, and early communication.',
  workItems: [
    'Point to named objects',
    'Follow a 1-step direction',
    'Name familiar items',
    'Use 2-word phrases',
    'Answer simple questions',
  ],
  metricLabel: 'One output produced',
  globalRuleText: GLOBAL_RULE,
  rungs: [
    {
      rungId: 'R0',
      name: 'Point to named',
      evidenceText: 'Points to 5+ named objects or pictures ("Where is the dog?").',
      supportsText: 'Choices of 2, verbal + gesture cue.',
    },
    {
      rungId: 'R1',
      name: '1-step direction',
      evidenceText: 'Follows a simple 1-step direction ("Give me the ball").',
      supportsText: 'Gesture + verbal cue, object nearby.',
    },
    {
      rungId: 'R2',
      name: 'Name items',
      evidenceText: 'Names 10+ familiar objects or pictures on sight.',
      supportsText: 'First-sound cue, model the word.',
    },
    {
      rungId: 'R3',
      name: '2-word phrases',
      evidenceText: 'Combines 2 words together ("more milk", "big truck").',
      supportsText: 'Expansion modeling ("You want MORE MILK").',
    },
    {
      rungId: 'R4',
      name: 'Answer questions',
      evidenceText: 'Answers simple what/where questions about familiar things.',
      supportsText: 'Choice of 2 answers if stuck.',
    },
  ],
}

// ── Art + Creative Play ─────────────────────────────────────────

export const artCreative: LadderCardDefinition = {
  ladderKey: 'london_art',
  title: 'Art + Creative Play',
  intent: 'Explore art materials and imaginative play at a toddler level.',
  workItems: [
    'Free scribble with crayon',
    'Finger painting',
    'Stamp + press activities',
    'Simple collage (sticker art)',
    'Pretend-play scene',
  ],
  metricLabel: 'One creation made',
  globalRuleText: GLOBAL_RULE,
  rungs: [
    {
      rungId: 'R0',
      name: 'Free scribble',
      evidenceText: 'Holds a crayon and makes marks on paper for 2+ min.',
      supportsText: 'Large crayons, tape paper to table.',
    },
    {
      rungId: 'R1',
      name: 'Finger painting',
      evidenceText: 'Uses fingers to spread paint on paper, exploring texture.',
      supportsText: 'Smock, large paper, adult models.',
    },
    {
      rungId: 'R2',
      name: 'Stamp + press',
      evidenceText: 'Uses stamps or sponges to make repeated prints on paper.',
      supportsText: 'Pre-inked stamps, hand-over-hand.',
    },
    {
      rungId: 'R3',
      name: 'Sticker collage',
      evidenceText: 'Peels and places 5+ stickers on a page to make a picture.',
      supportsText: 'Easy-peel stickers, adult starts the peel.',
    },
    {
      rungId: 'R4',
      name: 'Pretend play',
      evidenceText: 'Engages in a pretend-play scene (tea party, cooking) for 5+ min.',
      supportsText: 'Props set up, adult joins to model.',
    },
  ],
}

// ── All London Ladders ──────────────────────────────────────────

export const LONDON_LADDERS: LadderCardDefinition[] = [
  sensoryMovement,
  languageListening,
  artCreative,
]
