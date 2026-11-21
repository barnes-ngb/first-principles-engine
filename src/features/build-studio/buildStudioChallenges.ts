/**
 * The authored Apple Dash Build Challenges (LOCAL-VISION-007, slice 2).
 *
 * ── What this is ───────────────────────────────────────────────────────────
 *
 * Twelve written invitations, in a fixed order, for the one editable game. Pure
 * data and small selectors: no network, no model, no generated prose, no clock.
 * The child sees ONE at a time, optionally, and can skip or swap it without
 * touching MakeCode.
 *
 * ── Stable identity ────────────────────────────────────────────────────────
 *
 * `id` never changes and is what a saved attempt names. `revision` is bumped
 * when the wording or the prediction options change meaning, so a stored
 * attempt is never read against text it was not about.
 *
 * ── One defensible subject each ────────────────────────────────────────────
 *
 * `subject` is a plain label for what the challenge is about. It is NOT a
 * skill claim: nothing here is linked to a learner model, an evaluation, a
 * snapshot or a mastery node, and a child answering a challenge is not an
 * assessment. The authored table also lists possible Foundations nodes; they
 * are deliberately not encoded, because nothing may consume them yet.
 *
 * ── The hint never teaches the answer ──────────────────────────────────────
 *
 * Each `hint` says WHERE to look and asks a QUESTION. It does not name the
 * number to type or the result to expect. Written to be read aloud: short
 * sentences, no parentheses.
 *
 * ── Nothing is scored ──────────────────────────────────────────────────────
 *
 * No streak, no level, no completion, no reward. Skipping is free.
 */

import {
  normalizeChallengeAttempt,
  type BuildStudioChallengeSubject,
} from '../../core/types/buildStudio'
import { SubjectBucket } from '../../core/types/enums'
import { BUILD_STUDIO_PROJECT_ID } from './buildStudioStarter'
import { LANTERN_COVE_PROJECT_ID } from './lanternCoveStarter'

export interface BuildChallengeOption {
  /** Stable, lowercase-with-dashes. Stored on a saved attempt. */
  id: string
  /** Short, child-readable. */
  label: string
}

export interface BuildChallenge {
  /** Stable for ever. */
  id: string
  /** Bumped when the text or the prediction options change meaning. */
  revision: number
  /** 1-based position in the authored order. */
  order: number
  /** What the child sees, as the heading. */
  goal: string
  /** The question under it. */
  question: string
  /** Why it is worth a try, in his terms. */
  why: string
  /** One plain label for what this is about. Not a skill claim. */
  subject: string
  /**
   * The canonical authored subject, frozen onto a saved attempt. One of the
   * five allowed `SubjectBucket` values. Not a skill claim and not hours.
   */
  subjectBucket: BuildStudioChallengeSubject
  /** Where to look, as a question. Never the answer. */
  hint: string
  /** The prediction asked BEFORE Play. */
  prediction: { prompt: string; options: readonly BuildChallengeOption[] }
  /** For a grown-up: the idea inside and what to notice. */
  parentIdea: string
  /** For a grown-up: one thing to ask afterwards. */
  followUp: string
}

const opt = (id: string, label: string): BuildChallengeOption => ({ id, label })

export const BUILD_CHALLENGES: readonly BuildChallenge[] = [
  {
    id: 'faster-hero',
    revision: 1,
    order: 1,
    goal: 'Make the hero faster.',
    question: 'Can you cross the screen in less time?',
    why: 'Feel the difference right away.',
    subject: 'speed and motion',
    subjectBucket: SubjectBucket.PracticalArts,
    hint: 'Look in the on start blocks, at the block that moves your hero with the buttons. What do you think its number is for?',
    prediction: {
      prompt: 'After your change, will the hero cross the screen faster, slower, or the same?',
      options: [opt('faster', 'Faster'), opt('slower', 'Slower'), opt('same', 'The same')],
    },
    parentIdea:
      'One setting changes motion. Notice whether they predicted the direction, then moved the same distance to compare.',
    followUp: 'Which way did you think it would go, and what did you see when you crossed?',
  },
  {
    id: 'one-more-heart',
    revision: 1,
    order: 2,
    goal: 'Give the hero one more heart.',
    question: 'How many will you see before you play?',
    why: 'Get one more chance.',
    subject: 'counting what is on screen',
    subjectBucket: SubjectBucket.Math,
    hint: 'Look in the on start blocks for the block with the heart word. Count the hearts at the top before you play. How many do you see?',
    prediction: {
      prompt: 'How many hearts will you see at the top, compared with now?',
      options: [opt('same', 'The same'), opt('one-more', 'One more'), opt('two-more', 'Two more')],
    },
    parentIdea:
      'Counting visible items. Notice whether they counted the hearts or reasoned about one extra.',
    followUp: 'How did you know how many hearts there would be?',
  },
  {
    id: 'faster-falling-rock',
    revision: 1,
    order: 3,
    goal: 'Choose the faster falling rock.',
    question: 'Try two different numbers.',
    why: 'Make an easy and a tricky version.',
    subject: 'comparing two numbers',
    subjectBucket: SubjectBucket.Math,
    hint: 'Look in the rock loop for the number that sets how fast a rock moves down. Which of your two numbers is larger?',
    prediction: {
      prompt: 'Which number will make the rock fall faster?',
      options: [
        opt('bigger-number', 'The bigger number'),
        opt('smaller-number', 'The smaller number'),
        opt('neither', 'Neither one'),
      ],
    },
    parentIdea:
      'Comparing numbers, and telling that apart from a felt difference. Ask which number is larger.',
    followUp: 'Which number was larger, and which rock felt faster?',
  },
  {
    id: 'ten-with-two-apples',
    revision: 1,
    order: 4,
    goal: 'Make ten points with two apples.',
    question: 'Decide what each apple will be worth.',
    why: 'Make the score jump in big steps.',
    subject: 'making ten',
    subjectBucket: SubjectBucket.Math,
    hint: 'Look for the change score by block inside the apple catch. What is each apple worth now, and what could two of them add up to?',
    prediction: {
      prompt: 'How many points will two apples give you?',
      options: [
        opt('less-than-ten', 'Less than ten'),
        opt('exactly-ten', 'Exactly ten'),
        opt('more-than-ten', 'More than ten'),
      ],
    },
    parentIdea: 'Making ten and doubles. Ask how the two scores make ten.',
    followUp: 'How do your two apple scores make ten?',
  },
  {
    id: 'fifty-points-in-a-round',
    revision: 1,
    order: 5,
    goal: 'Make 50 points possible in one round.',
    question: 'How many apples would you need at your score setting?',
    why: 'Design a high-score hunt.',
    subject: 'skip counting and what is possible',
    subjectBucket: SubjectBucket.Math,
    hint: 'Look at the points for one apple and at how long a round lasts. How many apples would it take to reach fifty?',
    prediction: {
      prompt: 'Can 50 points fit in one round the way your game is set now?',
      options: [
        opt('fits', 'Yes, it fits'),
        opt('needs-time', 'No, it needs more time'),
        opt('needs-points', 'No, apples need to be worth more'),
      ],
    },
    parentIdea:
      'Skip counting and feasibility. Notice whether they count in score steps or only make the clock longer.',
    followUp: 'How did you work out how many apples you need?',
  },
  {
    id: 'fair-last-chance',
    revision: 1,
    order: 6,
    goal: 'Give the player a fair last chance.',
    question: 'From 8 points, how many more must the last apple give to reach 10?',
    why: 'Make the last catch matter.',
    subject: 'one-step story problem',
    subjectBucket: SubjectBucket.Math,
    hint: 'Look at the change score by block in the apple catch. What is the gap between 8 and 10?',
    prediction: {
      prompt: 'How many more points does the last apple need to give?',
      options: [opt('one-more-point', '1 more'), opt('two-more-points', '2 more'), opt('three-more-points', '3 more')],
    },
    parentIdea: 'Solving one step in a story. Ask what amount was missing.',
    followUp: 'What amount was missing, and how did you find it?',
  },
  {
    id: 'round-for-brother',
    revision: 1,
    order: 7,
    goal: 'Make a round your brother can enjoy.',
    question: 'Let him try two speeds.',
    why: 'Make a game for a real player.',
    subject: 'designing for another player',
    subjectBucket: SubjectBucket.SocialStudies,
    hint: 'Pick one number to change, like how fast the rocks fall. What will you ask your player after each try?',
    prediction: {
      prompt: 'Which speed do you think will feel fair to your player?',
      options: [opt('slower', 'The slower one'), opt('faster', 'The faster one'), opt('in-between', 'One in between')],
    },
    parentIdea:
      'Designing for somebody else. Notice whether they ask what felt fair and act on the answer.',
    followUp: 'What did your player say, and what did you change because of it?',
  },
  {
    id: 'rocks-too-hard',
    revision: 1,
    order: 8,
    goal: 'Find the point where rocks get too hard.',
    question: 'Try a slower, a faster, and an in-between rock.',
    why: 'Make a real difficulty challenge.',
    subject: 'difficulty and a threshold',
    subjectBucket: SubjectBucket.Science,
    hint: 'Look in the rock loop for the fall speed. Can you change only that one number each time?',
    prediction: {
      prompt: 'Which rock speed will be the first one that feels too hard?',
      options: [opt('slow-one', 'The slow one'), opt('in-between-one', 'The in-between one'), opt('fast-one', 'The fast one')],
    },
    parentIdea:
      'Speed, reaction time and a threshold. Notice whether they keep every other setting steady.',
    followUp: 'Which speed was too hard, and what stayed the same each time?',
  },
  {
    id: 'rare-golden-apple',
    revision: 1,
    order: 9,
    goal: 'Make a golden apple that is rare and worth more.',
    question: 'Choose its chance and its reward.',
    why: 'Make one catch a surprise.',
    subject: 'chance and payoff',
    subjectBucket: SubjectBucket.Math,
    hint: 'Think about how often the golden apple should show up and how many points it should give. How will you make it rare?',
    prediction: {
      prompt: 'Over ten rounds, how often will your golden apple show up?',
      options: [opt('every-time', 'Every round'), opt('sometimes', 'Some rounds'), opt('almost-never', 'Almost never')],
    },
    parentIdea:
      'Chance against payoff. Notice whether they separate a rare result from a guaranteed one.',
    followUp: 'How often did the golden apple come, and was that rare enough?',
  },
  {
    id: 'which-speed-worked-better',
    revision: 1,
    order: 10,
    goal: 'Show which speed worked better.',
    question: 'Put the catches from the two versions in a tiny table and show which column is higher.',
    why: 'Prove which version wins your test.',
    subject: 'reading data',
    subjectBucket: SubjectBucket.Math,
    hint: 'Play each version once and write down how many apples you caught. Which column is higher?',
    prediction: {
      prompt: 'Which speed do you think will catch more apples?',
      options: [opt('slower', 'The slower one'), opt('faster', 'The faster one'), opt('same', 'About the same')],
    },
    parentIdea: 'Interpreting data rather than guessing from one run.',
    followUp: 'What does your table show, and how can you tell?',
  },
  {
    id: 'last-second-rescue',
    revision: 1,
    order: 11,
    goal: 'Add a last-second rescue.',
    question: 'Make an item that helps a player who is about to lose.',
    why: 'Give a losing round a comeback.',
    subject: 'conditions and edge cases',
    subjectBucket: SubjectBucket.PracticalArts,
    hint: 'Think about when the rescue should help, and when it should not. How will your game tell the difference?',
    prediction: {
      prompt: 'When will your rescue item help?',
      options: [opt('always', 'Every time'), opt('only-when-losing', 'Only when losing'), opt('never', 'It will not help')],
    },
    parentIdea:
      'Conditional thinking and edge cases. Notice whether the rescue also behaves when it should not trigger.',
    followUp: 'What happens when the rescue should not help?',
  },
  {
    id: 'name-and-teach',
    revision: 1,
    order: 12,
    goal: 'Give your game a name and teach someone to play.',
    question: 'Write up to three rules and let a new player try them.',
    why: 'See a player use your instructions.',
    subject: 'writing for a reader',
    subjectBucket: SubjectBucket.LanguageArts,
    hint: 'Write your rules in plain words, then watch your player read them. Where did they get stuck?',
    prediction: {
      prompt: 'Will a new player understand your rules the first time?',
      options: [opt('yes', 'Yes'), opt('almost', 'Almost'), opt('not-yet', 'Not yet')],
    },
    parentIdea:
      'Clear words for a real reader. Notice whether they revise a rule when the player misreads it.',
    followUp: 'Which rule did your player misread, and what did you change?',
  },
]

/**
 * The five authored Lantern Cove challenges (FEAT-247, slice 4).
 *
 * A separate catalog on purpose: a challenge belongs to ONE game's source, so a
 * lookup always names the project and a Lantern Cove id can never resolve to
 * Apple Dash wording or the other way round. The same rules as above apply — a
 * stable `id`, a `revision` bumped when the meaning changes, one plain `subject`
 * that is not a skill claim, a hint that says WHERE to look and asks a question,
 * and nothing scored. The only runtime tag a saved attempt carries is the
 * authored `subjectBucket`; nothing subjective is derived from play.
 *
 * Challenges 2 and 3 are worked from the starter's own scoring (one point per
 * treasure). Their wording says so, so a child who has already changed the points
 * is told to start fresh rather than being asked about numbers that moved.
 */
export const LANTERN_COVE_CHALLENGES: readonly BuildChallenge[] = [
  {
    id: 'move-your-starting-spot',
    revision: 1,
    order: 1,
    goal: 'Move your starting spot.',
    question: 'Change only how far across the hero starts. Keep the down number.',
    why: 'See your change the moment you start.',
    subject: 'where things are on a grid',
    subjectBucket: SubjectBucket.PracticalArts,
    hint: 'Look in the on start blocks for the block that puts the hero on a tile. Which number is across, and which is down?',
    prediction: {
      prompt: 'After your change, will the hero start left of where it did, right of it, or in the same spot?',
      options: [opt('left', 'Left'), opt('right', 'Right'), opt('same', 'The same spot')],
    },
    parentIdea:
      'Position on a grid. Notice whether they changed one number and kept the other, then restarted to compare.',
    followUp: 'Which number did you change, and where did the hero start this time?',
  },
  {
    id: 'two-points-per-treasure',
    revision: 1,
    order: 2,
    goal: 'Give each treasure two points.',
    question: 'Start from the starter, where each treasure is one point. If you changed the points already, start fresh first.',
    why: 'Make every find count for more.',
    subject: 'counting by twos',
    subjectBucket: SubjectBucket.Math,
    hint: 'Look in the treasure pickup for the block that changes the score. What is each treasure worth now?',
    prediction: {
      prompt: 'After you pick up three treasures, what will your score be?',
      options: [opt('three-points', '3 points'), opt('six-points', '6 points'), opt('nine-points', '9 points')],
    },
    parentIdea:
      'Skip counting by twos. Notice whether they check the total after each pickup, not only at the end.',
    followUp: 'What was your score after the first, second and third treasure?',
  },
  {
    id: 'raise-the-camp-flag-sooner',
    revision: 1,
    order: 3,
    goal: 'Raise the camp flag sooner.',
    question: 'Keep each find at one point and set the flag goal to three. If you changed the points already, start fresh first.',
    why: 'Make the win come earlier.',
    subject: 'a goal number and counting up to it',
    subjectBucket: SubjectBucket.Math,
    hint: 'Look for the block that checks the score before the flag goes up. Which number does it compare with?',
    prediction: {
      prompt: 'On which treasure pickup will the camp flag go up?',
      options: [
        opt('second-pickup', 'The second one'),
        opt('third-pickup', 'The third one'),
        opt('fourth-pickup', 'The fourth one'),
      ],
    },
    parentIdea:
      'Counting up to a goal. Notice whether they check the flag before the predicted pickup and on it.',
    followUp: 'What did the flag do before your predicted pickup, and what did it do on it?',
  },
  {
    id: 'move-a-treasure',
    revision: 1,
    order: 4,
    goal: 'Move a treasure.',
    question: 'Move the treasure nearest camp one column over, onto ground you can walk to.',
    why: 'Change how far you have to go.',
    subject: 'counting steps on a map',
    subjectBucket: SubjectBucket.Math,
    hint: 'Look in the on start blocks for the treasure blocks. Which one is nearest camp, and which number is its column?',
    prediction: {
      prompt: 'Counting tile steps from camp, will the moved treasure be fewer steps, more steps, or the same?',
      options: [opt('fewer-steps', 'Fewer steps'), opt('more-steps', 'More steps'), opt('same', 'The same')],
    },
    parentIdea:
      'Distance as a count of tiles. Notice whether they count steps along the ground rather than guessing by eye.',
    followUp: 'How many steps from camp was it before, and how many now?',
  },
  {
    id: 'open-a-shortcut',
    revision: 1,
    order: 5,
    goal: 'Open a shortcut.',
    question: 'Do your map editing last. Paint floor on the ridge and clear its wall mark.',
    why: 'Make a new way through the cove.',
    subject: 'a path and what blocks it',
    subjectBucket: SubjectBucket.PracticalArts,
    hint: 'Open the map editor after your blocks are done. Find the ridge tile. Which tool paints floor, and which one clears the wall mark?',
    prediction: {
      prompt: 'When you walk the direct way, will the hero go through the ridge, go around it, or are you unsure?',
      options: [opt('through', 'Through'), opt('around', 'Around'), opt('unsure', 'Not sure')],
    },
    parentIdea:
      'A tile has a look and a wall setting. Notice whether they test the direct route and a rock next to it.',
    followUp: 'What happened on the direct way, and what happened at the rock next to it?',
  },
]

const CHALLENGE_CATALOGS: ReadonlyMap<string, readonly BuildChallenge[]> = new Map([
  [BUILD_STUDIO_PROJECT_ID, BUILD_CHALLENGES],
  [LANTERN_COVE_PROJECT_ID, LANTERN_COVE_CHALLENGES],
])

/**
 * The authored challenges of ONE game, or `[]` for a project that has none.
 * Every lookup below goes through this, so a challenge id is only ever read
 * against the project it was written for.
 */
export function challengesForProject(projectId: string): readonly BuildChallenge[] {
  return CHALLENGE_CATALOGS.get(projectId) ?? []
}

/** A challenge by id, in THIS project's catalog only. */
export function challengeFor(projectId: string, id: string): BuildChallenge | null {
  return challengesForProject(projectId).find((challenge) => challenge.id === id) ?? null
}

/** The first invitation of a project, or `null` when it has none. */
export function defaultChallengeFor(projectId: string): BuildChallenge | null {
  return challengesForProject(projectId)[0] ?? null
}

/**
 * The challenge after this one in the same project, wrapping at the end. Used by
 * *Try a different one*: a swap never needs the source, so it cannot touch MakeCode.
 */
export function nextChallengeFor(projectId: string, currentId: string): BuildChallenge | null {
  const catalog = challengesForProject(projectId)
  if (catalog.length === 0) return null
  const index = catalog.findIndex((challenge) => challenge.id === currentId)
  return catalog[(index + 1) % catalog.length] ?? catalog[0]
}

/** The default Apple Dash invitation. */
export const DEFAULT_BUILD_CHALLENGE: BuildChallenge = BUILD_CHALLENGES[0]

/**
 * Apple Dash only, by name. Kept for the released callers and tests; anything
 * that can be handed another game's id uses {@link challengeFor}.
 */
export function challengeById(id: string): BuildChallenge | null {
  return challengeFor(BUILD_STUDIO_PROJECT_ID, id)
}

/** Apple Dash only, by name — see {@link nextChallengeFor} for any other game. */
export function nextChallenge(currentId: string): BuildChallenge {
  return nextChallengeFor(BUILD_STUDIO_PROJECT_ID, currentId) ?? DEFAULT_BUILD_CHALLENGE
}

/** What the card reads aloud: the goal, the question, nothing more. */
export function challengeSpeech(challenge: BuildChallenge): string {
  return `${challenge.goal} ${challenge.question}`
}

/**
 * The compact line a PARENT sees on an exact version row, or `null`.
 *
 * `null` for every older row (no record), for a record that does not validate,
 * for one whose scope is not this row's own child, project and version, and for
 * a challenge this build does not know. The follow-up is shown only when the
 * stored revision is the authored one, because a question written for different
 * wording would not be about what the child was shown.
 *
 * The words say only what was recorded: a guess the child tapped, that Play was
 * pressed (a tap — not which source ran), and what the child said about it.
 */
export function describeAttemptForParent(version: {
  childId: string
  projectId: string
  versionId: string
  challengeAttempt?: unknown
}): { summary: string; followUp: string | null } | null {
  if (version.challengeAttempt === undefined || version.challengeAttempt === null) return null
  const attempt = normalizeChallengeAttempt(version.challengeAttempt)
  if (!attempt) return null
  if (
    attempt.childId !== version.childId ||
    attempt.projectId !== version.projectId ||
    attempt.versionId !== version.versionId
  ) {
    return null
  }
  // The catalog is the attempt's OWN project's (verified equal to the row's above),
  // so an id from another game never borrows that game's wording.
  const challenge = challengeFor(attempt.projectId, attempt.challengeId)
  if (!challenge) return null
  const current = attempt.challengeRevision === challenge.revision

  // A known id at a different revision was shown different words. The current
  // goal is never used to describe it — only what was recorded is stated.
  const parts: string[] = [
    current ? `Challenge: “${challenge.goal}”` : 'An earlier version of a challenge.',
  ]
  if (attempt.prediction) {
    const label = current
      ? challenge.prediction.options.find((o) => o.id === attempt.prediction?.optionId)?.label
      : undefined
    parts.push(label ? `Guess: ${label}.` : 'Made a guess.')
  } else {
    parts.push('No guess.')
  }
  parts.push(attempt.playRequest ? 'Pressed Play.' : 'Had not pressed Play.')
  if (attempt.reportedOutcome) {
    parts.push(`Said: ${OUTCOME_LABELS[attempt.reportedOutcome.result]}.`)
  }
  return {
    summary: parts.join(' '),
    followUp: current ? challenge.followUp : null,
  }
}

export const OUTCOME_LABELS = {
  matched: 'Matched',
  different: 'Different',
  unsure: 'Unsure',
} as const
