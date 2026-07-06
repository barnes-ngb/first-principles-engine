/**
 * Server-side foundations concept-graph SUMMARY (FEAT-57, Learner Model Phase 3a).
 *
 * A compact, read-only mirror of the client foundations spine
 * (`src/core/foundations/{readingGraph,mathGraph}.ts`) so the Cloud Functions —
 * which cannot import the client TS module — can name concepts in plain words when
 * they synthesize (`learnerSynthesis`) and format the `learnerModel` context slice.
 *
 * DELIBERATE DUPLICATION (same pattern as `sanitizeJson.ts`). This file is
 * MACHINE-GENERATED from the client graphs by `scripts/genFoundationsSummary.ts` —
 * do not hand-edit. If the client graph changes, re-run the generator and commit
 * the result; `foundationsGraphSummary.test.ts` pins internal consistency.
 * // TODO: consolidate — share one graph source across client + functions.
 *
 * Graph version at generation: reading@1+math@1
 */

export interface FoundationSummaryNode {
  id: string;
  domain: "reading" | "math";
  band: string;
  kidName: string;
  parentDescription: string;
  underlies: string[];
}

export const FOUNDATIONS_GRAPH_VERSION = "reading@1+math@1";

export const FOUNDATION_SUMMARY_NODES: FoundationSummaryNode[] = [
  { id: "reading.print.concepts", domain: "reading", band: "K", kidName: "How books work", parentDescription: "Knows print runs left→right and top→bottom, and where a story begins", underlies: ["reading.phonics.letterSounds"] },
  { id: "reading.phonemic.hearSounds", domain: "reading", band: "K", kidName: "Hear the sounds in words", parentDescription: "Claps syllables, hears rhymes, and catches the first sound in a word", underlies: ["reading.phonics.letterSounds","reading.phonics.cvc"] },
  { id: "reading.phonics.letterSounds", domain: "reading", band: "K", kidName: "Know letter sounds", parentDescription: "Says the sound each letter makes", underlies: ["reading.phonics.cvc","reading.phonics.sightWords"] },
  { id: "reading.phonics.cvc", domain: "reading", band: "1", kidName: "Sound out short words", parentDescription: "Reads simple 3-letter words like cat, run, sit", underlies: ["reading.phonics.blends","reading.phonics.digraphs","reading.encoding.spellCvc"] },
  { id: "reading.phonics.blends", domain: "reading", band: "1", kidName: "Blend two sounds together", parentDescription: "Reads words with blends like stop, frog, jump", underlies: ["reading.phonics.longVowels"] },
  { id: "reading.phonics.digraphs", domain: "reading", band: "1", kidName: "Two letters, one sound", parentDescription: "Reads sh/ch/th/wh words like ship, that, when", underlies: ["reading.phonics.longVowels"] },
  { id: "reading.phonics.longVowels", domain: "reading", band: "2", kidName: "Read long-vowel words", parentDescription: "Reads silent-e and long-vowel words like cake, bike", underlies: ["reading.phonics.vowelTeams","reading.phonics.rControlled"] },
  { id: "reading.phonics.vowelTeams", domain: "reading", band: "2", kidName: "Read vowel teams", parentDescription: "Reads ai/ea/oa/ee words like rain, boat, tree", underlies: ["reading.decoding.multisyllable"] },
  { id: "reading.phonics.rControlled", domain: "reading", band: "3", kidName: "Read bossy-r words", parentDescription: "Reads ar/or/er/ir/ur words like car, bird, corn", underlies: ["reading.decoding.multisyllable"] },
  { id: "reading.phonics.diphthongs", domain: "reading", band: "3", kidName: "Tricky vowel sounds", parentDescription: "Reads oi/oy/ou/ow words and -le endings like coin, cloud, little", underlies: ["reading.decoding.multisyllable"] },
  { id: "reading.decoding.multisyllable", domain: "reading", band: "3", kidName: "Break big words apart", parentDescription: "Reads longer words by chunking them into syllables", underlies: ["reading.fluency.expression","reading.vocabulary.wordParts"] },
  { id: "reading.phonics.sightWords", domain: "reading", band: "K-1", kidName: "Read sight words", parentDescription: "Instantly reads the common words that don't sound out (Dolch pre-primer/primer)", underlies: ["reading.fluency.accuracy"] },
  { id: "reading.fluency.accuracy", domain: "reading", band: "1", kidName: "Read the words right", parentDescription: "Reads a simple sentence without guessing", underlies: ["reading.fluency.pace","reading.comprehension.explicit"] },
  { id: "reading.fluency.pace", domain: "reading", band: "2", kidName: "Read smoothly", parentDescription: "Reads a page at a comfortable, steady pace", underlies: ["reading.fluency.expression"] },
  { id: "reading.fluency.expression", domain: "reading", band: "3", kidName: "Read with expression", parentDescription: "Reads aloud with feeling, minding the punctuation", underlies: ["reading.independent.choice"] },
  { id: "reading.vocabulary.everyday", domain: "reading", band: "2", kidName: "Know lots of words", parentDescription: "Understands the everyday words in what they read", underlies: ["reading.comprehension.explicit","reading.vocabulary.contextClues"] },
  { id: "reading.vocabulary.wordParts", domain: "reading", band: "4", kidName: "Use word parts", parentDescription: "Uses prefixes, suffixes, and roots to unlock words", underlies: ["reading.vocabulary.contextClues"] },
  { id: "reading.vocabulary.contextClues", domain: "reading", band: "4", kidName: "Guess words from context", parentDescription: "Works out a new word from the sentence around it", underlies: ["reading.independent.choice"] },
  { id: "reading.comprehension.listen", domain: "reading", band: "K-1", kidName: "Understand a story I hear", parentDescription: "Answers questions about and retells a story read aloud to them", underlies: ["reading.comprehension.explicit"] },
  { id: "reading.comprehension.explicit", domain: "reading", band: "3", kidName: "Find the answer in the text", parentDescription: "Answers questions the text states directly", underlies: ["reading.comprehension.inference","reading.comprehension.mainIdea","reading.comprehension.sequence"] },
  { id: "reading.comprehension.sequence", domain: "reading", band: "3", kidName: "Tell it in order", parentDescription: "Retells beginning, middle, and end in order", underlies: ["reading.comprehension.mainIdea"] },
  { id: "reading.comprehension.character", domain: "reading", band: "3", kidName: "Know the characters", parentDescription: "Describes who's in the story and what they want", underlies: ["reading.comprehension.inference"] },
  { id: "reading.comprehension.mainIdea", domain: "reading", band: "3", kidName: "Say what it’s mostly about", parentDescription: "Names the main idea and a key detail", underlies: ["reading.comprehension.analysis"] },
  { id: "reading.comprehension.inference", domain: "reading", band: "4", kidName: "Read between the lines", parentDescription: "Figures out what the text hints but doesn't say", underlies: ["reading.comprehension.analysis"] },
  { id: "reading.comprehension.causeEffect", domain: "reading", band: "4", kidName: "Know why things happen", parentDescription: "Explains what caused what in a story or text", underlies: ["reading.comprehension.analysis"] },
  { id: "reading.comprehension.compareTheme", domain: "reading", band: "5", kidName: "Compare and find the theme", parentDescription: "Compares two texts and names the lesson or theme", underlies: ["reading.comprehension.analysis"] },
  { id: "reading.comprehension.analysis", domain: "reading", band: "5", kidName: "Dig into a text", parentDescription: "Explains how the parts of a text work together", underlies: ["reading.critical.evaluate"] },
  { id: "reading.critical.evaluate", domain: "reading", band: "5", kidName: "Think hard about what I read", parentDescription: "Weighs whether a text is convincing or true", underlies: [] },
  { id: "reading.independent.choice", domain: "reading", band: "4", kidName: "Read on my own", parentDescription: "Chooses and reads a just-right book independently", underlies: ["reading.critical.evaluate"] },
  { id: "reading.encoding.spellCvc", domain: "reading", band: "1", kidName: "Spell short words", parentDescription: "Spells simple sound-it-out words (aloud, tiles, or scribed)", underlies: ["reading.encoding.spellPatterns"] },
  { id: "reading.encoding.spellPatterns", domain: "reading", band: "2", kidName: "Spell pattern words", parentDescription: "Spells blend, digraph, and long-vowel words", underlies: [] },
  { id: "math.number.counting", domain: "math", band: "K", kidName: "Count things", parentDescription: "Counts objects and says numbers in order past 20", underlies: ["math.number.placeValue","math.operations.addWithin20","math.geometry.shapes"] },
  { id: "math.number.digitRecognition", domain: "math", band: "K", kidName: "Know the numbers", parentDescription: "Recognizes and writes number symbols", underlies: ["math.number.comparison","math.number.placeValue"] },
  { id: "math.number.comparison", domain: "math", band: "K", kidName: "Compare numbers", parentDescription: "Says which is more, less, or equal", underlies: ["math.number.placeValue","math.data.graphs"] },
  { id: "math.number.skipCount", domain: "math", band: "1", kidName: "Skip count", parentDescription: "Counts by 2s, 5s, and 10s", underlies: ["math.operations.arrays","math.operations.multiTables"] },
  { id: "math.operations.addWithin20", domain: "math", band: "1", kidName: "Add small numbers", parentDescription: "Adds within 20 using doubles and making 10", underlies: ["math.operations.subWithin20","math.operations.twoDigit"] },
  { id: "math.operations.subWithin20", domain: "math", band: "1", kidName: "Take away small numbers", parentDescription: "Subtracts within 20", underlies: ["math.operations.twoDigit"] },
  { id: "math.operations.factFamilies", domain: "math", band: "1", kidName: "Know fact families", parentDescription: "Sees how +/− facts connect (3+4=7, 7−4=3), fills missing addends", underlies: ["math.operations.twoDigit"] },
  { id: "math.number.placeValue", domain: "math", band: "2", kidName: "Tens and ones", parentDescription: "Knows what each digit is worth (hundreds, tens, ones)", underlies: ["math.operations.twoDigit","math.operations.multiDigit","math.decimals"] },
  { id: "math.operations.twoDigit", domain: "math", band: "2", kidName: "Add & subtract bigger numbers", parentDescription: "Adds and subtracts two-digit numbers", underlies: ["math.operations.regrouping","math.operations.multiDigit"] },
  { id: "math.operations.regrouping", domain: "math", band: "3", kidName: "Carry and borrow", parentDescription: "Regroups (carries and borrows), including across zeros", underlies: ["math.operations.multiDigit"] },
  { id: "math.operations.multiDigit", domain: "math", band: "3", kidName: "Multi-digit math", parentDescription: "Works with three-digit and larger numbers", underlies: ["math.problemSolving"] },
  { id: "math.operations.arrays", domain: "math", band: "3", kidName: "Rows and groups", parentDescription: "Sees multiplication as rows, groups, and repeated addition", underlies: ["math.operations.multFacts"] },
  { id: "math.operations.multFacts", domain: "math", band: "3", kidName: "Times tables", parentDescription: "Knows multiplication facts", underlies: ["math.operations.multiTables","math.operations.division","math.fractions.concepts"] },
  { id: "math.operations.multiTables", domain: "math", band: "4", kidName: "Fast times tables", parentDescription: "Recalls tables through 12×12 fluently", underlies: ["math.operations.division"] },
  { id: "math.operations.division", domain: "math", band: "3", kidName: "Share equally", parentDescription: "Divides using known facts and arrays", underlies: ["math.fractions.operations"] },
  { id: "math.fractions.concepts", domain: "math", band: "4", kidName: "Understand fractions", parentDescription: "Recognizes and names simple fractions (½, ¼, ⅓)", underlies: ["math.fractions.compare","math.fractions.operations","math.decimals"] },
  { id: "math.fractions.compare", domain: "math", band: "4", kidName: "Compare fractions", parentDescription: "Compares simple fractions", underlies: ["math.fractions.operations"] },
  { id: "math.fractions.operations", domain: "math", band: "5", kidName: "Add & subtract fractions", parentDescription: "Adds and subtracts simple fractions", underlies: ["math.problemSolving"] },
  { id: "math.decimals", domain: "math", band: "5", kidName: "Decimals & percents", parentDescription: "Works with decimals and percents", underlies: ["math.problemSolving"] },
  { id: "math.measurement.length", domain: "math", band: "2", kidName: "Measure things", parentDescription: "Measures length with rulers and units", underlies: ["math.geometry.area"] },
  { id: "math.measurement.time", domain: "math", band: "2", kidName: "Tell time", parentDescription: "Tells time on a clock", underlies: ["math.measurement.money"] },
  { id: "math.measurement.money", domain: "math", band: "3", kidName: "Count money", parentDescription: "Counts coins and bills, makes change", underlies: ["math.problemSolving"] },
  { id: "math.geometry.shapes", domain: "math", band: "K", kidName: "Know shapes", parentDescription: "Names 2D and 3D shapes and their parts", underlies: ["math.geometry.area"] },
  { id: "math.geometry.area", domain: "math", band: "4", kidName: "Area & perimeter", parentDescription: "Finds the area and perimeter of shapes", underlies: ["math.problemSolving"] },
  { id: "math.data.graphs", domain: "math", band: "2", kidName: "Read charts", parentDescription: "Reads and makes simple graphs and tables", underlies: ["math.data.interpret"] },
  { id: "math.data.interpret", domain: "math", band: "4", kidName: "Understand data", parentDescription: "Answers questions from a graph or table", underlies: ["math.problemSolving"] },
  { id: "math.algebra.patterns", domain: "math", band: "4", kidName: "Find the pattern", parentDescription: "Extends number and shape patterns, finds the rule", underlies: ["math.problemSolving"] },
  { id: "math.problemSolving.oneStep", domain: "math", band: "1-2", kidName: "Solve story problems", parentDescription: "Solves a one-step story problem — read to them or read themselves; heard-aloud counts fully", underlies: ["math.problemSolving"] },
  { id: "math.problemSolving", domain: "math", band: "5", kidName: "Solve word problems", parentDescription: "Chooses the right steps for multi-step problems", underlies: [] },
];

/** Flat id → node lookup across both domains. */
export const FOUNDATION_SUMMARY_MAP: Record<string, FoundationSummaryNode> =
  Object.fromEntries(FOUNDATION_SUMMARY_NODES.map((n) => [n.id, n]));

/** The concept nodes for one domain, in spine order. */
export function summaryNodesForDomain(
  domain: "reading" | "math",
): FoundationSummaryNode[] {
  return FOUNDATION_SUMMARY_NODES.filter((n) => n.domain === domain);
}
