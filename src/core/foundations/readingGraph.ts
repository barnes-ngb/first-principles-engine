/**
 * Reading concept graph — v1, transcribed verbatim from the OWNER-CURATED
 * `docs/foundations/READING_GRAPH_V0.md` (2026-07-03). 31 nodes across 8 strands.
 *
 * Do not reinterpret band boundaries or edges — this is a transcription (D3).
 * Any content change is a graph re-curation (a new doc + version bump), never an
 * inline edit here.
 */

import type { ConceptGraph } from './types'

export const READING_GRAPH_VERSION = 1

export const readingGraph: ConceptGraph = {
  version: READING_GRAPH_VERSION,
  domain: 'reading',
  nodes: [
    // ── Strand 1 — Print & Phonemic Awareness (pre-reading) ──────────
    {
      id: 'reading.print.concepts',
      domain: 'reading',
      band: 'K',
      kidName: 'How books work',
      parentDescription:
        'Knows print runs left→right and top→bottom, and where a story begins',
      underlies: ['reading.phonics.letterSounds'],
    },
    {
      id: 'reading.phonemic.hearSounds',
      domain: 'reading',
      band: 'K',
      kidName: 'Hear the sounds in words',
      parentDescription:
        'Claps syllables, hears rhymes, and catches the first sound in a word',
      underlies: ['reading.phonics.letterSounds', 'reading.phonics.cvc'],
    },

    // ── Strand 2 — Phonics & Decoding (the granular spine) ───────────
    {
      id: 'reading.phonics.letterSounds',
      domain: 'reading',
      band: 'K',
      kidName: 'Know letter sounds',
      parentDescription: 'Says the sound each letter makes',
      underlies: ['reading.phonics.cvc', 'reading.phonics.sightWords'],
    },
    {
      id: 'reading.phonics.cvc',
      domain: 'reading',
      band: '1',
      kidName: 'Sound out short words',
      parentDescription: 'Reads simple 3-letter words like cat, run, sit',
      underlies: [
        'reading.phonics.blends',
        'reading.phonics.digraphs',
        'reading.encoding.spellCvc',
      ],
    },
    {
      id: 'reading.phonics.blends',
      domain: 'reading',
      band: '1',
      kidName: 'Blend two sounds together',
      parentDescription: 'Reads words with blends like stop, frog, jump',
      underlies: ['reading.phonics.longVowels'],
    },
    {
      id: 'reading.phonics.digraphs',
      domain: 'reading',
      band: '1',
      kidName: 'Two letters, one sound',
      parentDescription: 'Reads sh/ch/th/wh words like ship, that, when',
      underlies: ['reading.phonics.longVowels'],
    },
    {
      id: 'reading.phonics.longVowels',
      domain: 'reading',
      band: '2',
      kidName: 'Read long-vowel words',
      parentDescription: 'Reads silent-e and long-vowel words like cake, bike',
      underlies: ['reading.phonics.vowelTeams', 'reading.phonics.rControlled'],
    },
    {
      id: 'reading.phonics.vowelTeams',
      domain: 'reading',
      band: '2',
      kidName: 'Read vowel teams',
      parentDescription: 'Reads ai/ea/oa/ee words like rain, boat, tree',
      underlies: ['reading.decoding.multisyllable'],
    },
    {
      id: 'reading.phonics.rControlled',
      domain: 'reading',
      band: '3',
      kidName: 'Read bossy-r words',
      parentDescription: 'Reads ar/or/er/ir/ur words like car, bird, corn',
      underlies: ['reading.decoding.multisyllable'],
    },
    {
      id: 'reading.phonics.diphthongs',
      domain: 'reading',
      band: '3',
      kidName: 'Tricky vowel sounds',
      parentDescription:
        'Reads oi/oy/ou/ow words and -le endings like coin, cloud, little',
      underlies: ['reading.decoding.multisyllable'],
    },
    {
      id: 'reading.decoding.multisyllable',
      domain: 'reading',
      band: '3',
      kidName: 'Break big words apart',
      parentDescription: 'Reads longer words by chunking them into syllables',
      underlies: ['reading.fluency.expression', 'reading.vocabulary.wordParts'],
    },

    // ── Strand 3 — Sight Words ───────────────────────────────────────
    {
      id: 'reading.phonics.sightWords',
      domain: 'reading',
      band: 'K-1',
      kidName: 'Read sight words',
      parentDescription:
        "Instantly reads the common words that don't sound out (Dolch pre-primer/primer)",
      underlies: ['reading.fluency.accuracy'],
    },

    // ── Strand 4 — Fluency ───────────────────────────────────────────
    {
      id: 'reading.fluency.accuracy',
      domain: 'reading',
      band: '1',
      kidName: 'Read the words right',
      parentDescription: 'Reads a simple sentence without guessing',
      underlies: ['reading.fluency.pace', 'reading.comprehension.explicit'],
    },
    {
      id: 'reading.fluency.pace',
      domain: 'reading',
      band: '2',
      kidName: 'Read smoothly',
      parentDescription: 'Reads a page at a comfortable, steady pace',
      underlies: ['reading.fluency.expression'],
    },
    {
      id: 'reading.fluency.expression',
      domain: 'reading',
      band: '3',
      kidName: 'Read with expression',
      parentDescription: 'Reads aloud with feeling, minding the punctuation',
      underlies: ['reading.independent.choice'],
    },

    // ── Strand 5 — Vocabulary ────────────────────────────────────────
    {
      id: 'reading.vocabulary.everyday',
      domain: 'reading',
      band: '2',
      kidName: 'Know lots of words',
      parentDescription: 'Understands the everyday words in what they read',
      underlies: [
        'reading.comprehension.explicit',
        'reading.vocabulary.contextClues',
      ],
    },
    {
      id: 'reading.vocabulary.wordParts',
      domain: 'reading',
      band: '4',
      kidName: 'Use word parts',
      parentDescription: 'Uses prefixes, suffixes, and roots to unlock words',
      underlies: ['reading.vocabulary.contextClues'],
    },
    {
      id: 'reading.vocabulary.contextClues',
      domain: 'reading',
      band: '4',
      kidName: 'Guess words from context',
      parentDescription: 'Works out a new word from the sentence around it',
      underlies: ['reading.independent.choice'],
    },

    // ── Strand 6 — Comprehension ─────────────────────────────────────
    {
      id: 'reading.comprehension.listen',
      domain: 'reading',
      band: 'K-1',
      kidName: 'Understand a story I hear',
      parentDescription:
        'Answers questions about and retells a story read aloud to them',
      underlies: ['reading.comprehension.explicit'],
    },
    {
      id: 'reading.comprehension.explicit',
      domain: 'reading',
      band: '3',
      kidName: 'Find the answer in the text',
      parentDescription: 'Answers questions the text states directly',
      underlies: [
        'reading.comprehension.inference',
        'reading.comprehension.mainIdea',
        'reading.comprehension.sequence',
      ],
    },
    {
      id: 'reading.comprehension.sequence',
      domain: 'reading',
      band: '3',
      kidName: 'Tell it in order',
      parentDescription: 'Retells beginning, middle, and end in order',
      underlies: ['reading.comprehension.mainIdea'],
    },
    {
      id: 'reading.comprehension.character',
      domain: 'reading',
      band: '3',
      kidName: 'Know the characters',
      parentDescription: "Describes who's in the story and what they want",
      underlies: ['reading.comprehension.inference'],
    },
    {
      id: 'reading.comprehension.mainIdea',
      domain: 'reading',
      band: '3',
      kidName: 'Say what it’s mostly about',
      parentDescription: 'Names the main idea and a key detail',
      underlies: ['reading.comprehension.analysis'],
    },
    {
      id: 'reading.comprehension.inference',
      domain: 'reading',
      band: '4',
      kidName: 'Read between the lines',
      parentDescription: "Figures out what the text hints but doesn't say",
      underlies: ['reading.comprehension.analysis'],
    },
    {
      id: 'reading.comprehension.causeEffect',
      domain: 'reading',
      band: '4',
      kidName: 'Know why things happen',
      parentDescription: 'Explains what caused what in a story or text',
      underlies: ['reading.comprehension.analysis'],
    },
    {
      id: 'reading.comprehension.compareTheme',
      domain: 'reading',
      band: '5',
      kidName: 'Compare and find the theme',
      parentDescription: 'Compares two texts and names the lesson or theme',
      underlies: ['reading.comprehension.analysis'],
    },
    {
      id: 'reading.comprehension.analysis',
      domain: 'reading',
      band: '5',
      kidName: 'Dig into a text',
      parentDescription: 'Explains how the parts of a text work together',
      underlies: ['reading.critical.evaluate'],
    },
    {
      id: 'reading.critical.evaluate',
      domain: 'reading',
      band: '5',
      kidName: 'Think hard about what I read',
      parentDescription: 'Weighs whether a text is convincing or true',
      underlies: [],
    },

    // ── Strand 7 — Independent Reading ───────────────────────────────
    {
      id: 'reading.independent.choice',
      domain: 'reading',
      band: '4',
      kidName: 'Read on my own',
      parentDescription: 'Chooses and reads a just-right book independently',
      underlies: ['reading.critical.evaluate'],
    },

    // ── Strand 8 — Encoding (spelling — the inverse of decoding) ──────
    {
      id: 'reading.encoding.spellCvc',
      domain: 'reading',
      band: '1',
      kidName: 'Spell short words',
      parentDescription:
        'Spells simple sound-it-out words (aloud, tiles, or scribed)',
      underlies: ['reading.encoding.spellPatterns'],
    },
    {
      id: 'reading.encoding.spellPatterns',
      domain: 'reading',
      band: '2',
      kidName: 'Spell pattern words',
      parentDescription: 'Spells blend, digraph, and long-vowel words',
      underlies: [],
    },
  ],
}
