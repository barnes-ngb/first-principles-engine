/**
 * Math concept graph — v1, transcribed verbatim from the OWNER-CURATED
 * `docs/foundations/MATH_GRAPH_V0.md` (2026-07-03). 29 nodes across 9 strands.
 *
 * Do not reinterpret band boundaries or edges — this is a transcription (D3).
 * Strands 8 (Data & Graphs) and 9 (Patterns/Algebra/Problem Solving) are
 * evidence-only: no working-level ladder seeds them (the bootstrap seeder starts
 * them `not-yet`). `math.operations.regrouping` (repo L7) and
 * `math.operations.multiTables` (repo L8) sit in ordinary flow but seed **by node
 * id / ladder level, not by band** — see the seeder.
 */

import type { ConceptGraph } from './types'

export const MATH_GRAPH_VERSION = 1

export const mathGraph: ConceptGraph = {
  version: MATH_GRAPH_VERSION,
  domain: 'math',
  nodes: [
    // ── Strand 1 — Number Sense & Counting ───────────────────────────
    {
      id: 'math.number.counting',
      domain: 'math',
      band: 'K',
      kidName: 'Count things',
      parentDescription: 'Counts objects and says numbers in order past 20',
      underlies: [
        'math.number.placeValue',
        'math.operations.addWithin20',
        'math.geometry.shapes',
      ],
    },
    {
      id: 'math.number.digitRecognition',
      domain: 'math',
      band: 'K',
      kidName: 'Know the numbers',
      parentDescription: 'Recognizes and writes number symbols',
      underlies: ['math.number.comparison', 'math.number.placeValue'],
    },
    {
      id: 'math.number.comparison',
      domain: 'math',
      band: 'K',
      kidName: 'Compare numbers',
      parentDescription: 'Says which is more, less, or equal',
      underlies: ['math.number.placeValue', 'math.data.graphs'],
    },
    {
      id: 'math.number.skipCount',
      domain: 'math',
      band: '1',
      kidName: 'Skip count',
      parentDescription: 'Counts by 2s, 5s, and 10s',
      underlies: ['math.operations.arrays', 'math.operations.multiTables'],
    },

    // ── Strand 2 — Addition & Subtraction (within 20) ────────────────
    {
      id: 'math.operations.addWithin20',
      domain: 'math',
      band: '1',
      kidName: 'Add small numbers',
      parentDescription: 'Adds within 20 using doubles and making 10',
      underlies: ['math.operations.subWithin20', 'math.operations.twoDigit'],
    },
    {
      id: 'math.operations.subWithin20',
      domain: 'math',
      band: '1',
      kidName: 'Take away small numbers',
      parentDescription: 'Subtracts within 20',
      underlies: ['math.operations.twoDigit'],
    },
    {
      id: 'math.operations.factFamilies',
      domain: 'math',
      band: '1',
      kidName: 'Know fact families',
      parentDescription:
        'Sees how +/− facts connect (3+4=7, 7−4=3), fills missing addends',
      underlies: ['math.operations.twoDigit'],
    },

    // ── Strand 3 — Place Value & Multi-digit ─────────────────────────
    {
      id: 'math.number.placeValue',
      domain: 'math',
      band: '2',
      kidName: 'Tens and ones',
      parentDescription: 'Knows what each digit is worth (hundreds, tens, ones)',
      underlies: [
        'math.operations.twoDigit',
        'math.operations.multiDigit',
        'math.decimals',
      ],
    },
    {
      id: 'math.operations.twoDigit',
      domain: 'math',
      band: '2',
      kidName: 'Add & subtract bigger numbers',
      parentDescription: 'Adds and subtracts two-digit numbers',
      underlies: ['math.operations.regrouping', 'math.operations.multiDigit'],
    },
    {
      id: 'math.operations.regrouping',
      domain: 'math',
      band: '3',
      kidName: 'Carry and borrow',
      parentDescription: 'Regroups (carries and borrows), including across zeros',
      underlies: ['math.operations.multiDigit'],
    },
    {
      id: 'math.operations.multiDigit',
      domain: 'math',
      band: '3',
      kidName: 'Multi-digit math',
      parentDescription: 'Works with three-digit and larger numbers',
      underlies: ['math.problemSolving'],
    },

    // ── Strand 4 — Multiplication & Division ─────────────────────────
    {
      id: 'math.operations.arrays',
      domain: 'math',
      band: '3',
      kidName: 'Rows and groups',
      parentDescription:
        'Sees multiplication as rows, groups, and repeated addition',
      underlies: ['math.operations.multFacts'],
    },
    {
      id: 'math.operations.multFacts',
      domain: 'math',
      band: '3',
      kidName: 'Times tables',
      parentDescription: 'Knows multiplication facts',
      underlies: [
        'math.operations.multiTables',
        'math.operations.division',
        'math.fractions.concepts',
      ],
    },
    {
      id: 'math.operations.multiTables',
      domain: 'math',
      band: '4',
      kidName: 'Fast times tables',
      parentDescription: 'Recalls tables through 12×12 fluently',
      underlies: ['math.operations.division'],
    },
    {
      id: 'math.operations.division',
      domain: 'math',
      band: '3',
      kidName: 'Share equally',
      parentDescription: 'Divides using known facts and arrays',
      underlies: ['math.fractions.operations'],
    },

    // ── Strand 5 — Fractions & Decimals ──────────────────────────────
    {
      id: 'math.fractions.concepts',
      domain: 'math',
      band: '4',
      kidName: 'Understand fractions',
      parentDescription: 'Recognizes and names simple fractions (½, ¼, ⅓)',
      underlies: [
        'math.fractions.compare',
        'math.fractions.operations',
        'math.decimals',
      ],
    },
    {
      id: 'math.fractions.compare',
      domain: 'math',
      band: '4',
      kidName: 'Compare fractions',
      parentDescription: 'Compares simple fractions',
      underlies: ['math.fractions.operations'],
    },
    {
      id: 'math.fractions.operations',
      domain: 'math',
      band: '5',
      kidName: 'Add & subtract fractions',
      parentDescription: 'Adds and subtracts simple fractions',
      underlies: ['math.problemSolving'],
    },
    {
      id: 'math.decimals',
      domain: 'math',
      band: '5',
      kidName: 'Decimals & percents',
      parentDescription: 'Works with decimals and percents',
      underlies: ['math.problemSolving'],
    },

    // ── Strand 6 — Measurement, Money & Time ─────────────────────────
    {
      id: 'math.measurement.length',
      domain: 'math',
      band: '2',
      kidName: 'Measure things',
      parentDescription: 'Measures length with rulers and units',
      underlies: ['math.geometry.area'],
    },
    {
      id: 'math.measurement.time',
      domain: 'math',
      band: '2',
      kidName: 'Tell time',
      parentDescription: 'Tells time on a clock',
      underlies: ['math.measurement.money'],
    },
    {
      id: 'math.measurement.money',
      domain: 'math',
      band: '3',
      kidName: 'Count money',
      parentDescription: 'Counts coins and bills, makes change',
      underlies: ['math.problemSolving'],
    },

    // ── Strand 7 — Geometry & Shapes ─────────────────────────────────
    {
      id: 'math.geometry.shapes',
      domain: 'math',
      band: 'K',
      kidName: 'Know shapes',
      parentDescription: 'Names 2D and 3D shapes and their parts',
      underlies: ['math.geometry.area'],
    },
    {
      id: 'math.geometry.area',
      domain: 'math',
      band: '4',
      kidName: 'Area & perimeter',
      parentDescription: 'Finds the area and perimeter of shapes',
      underlies: ['math.problemSolving'],
    },

    // ── Strand 8 — Data & Graphs (evidence-only) ─────────────────────
    {
      id: 'math.data.graphs',
      domain: 'math',
      band: '2',
      kidName: 'Read charts',
      parentDescription: 'Reads and makes simple graphs and tables',
      underlies: ['math.data.interpret'],
    },
    {
      id: 'math.data.interpret',
      domain: 'math',
      band: '4',
      kidName: 'Understand data',
      parentDescription: 'Answers questions from a graph or table',
      underlies: ['math.problemSolving'],
    },

    // ── Strand 9 — Patterns, Algebra & Problem Solving (evidence-only) ─
    {
      id: 'math.algebra.patterns',
      domain: 'math',
      band: '4',
      kidName: 'Find the pattern',
      parentDescription: 'Extends number and shape patterns, finds the rule',
      underlies: ['math.problemSolving'],
    },
    {
      id: 'math.problemSolving.oneStep',
      domain: 'math',
      band: '1-2',
      kidName: 'Solve story problems',
      parentDescription:
        'Solves a one-step story problem — read to them or read themselves; heard-aloud counts fully',
      underlies: ['math.problemSolving'],
    },
    {
      id: 'math.problemSolving',
      domain: 'math',
      band: '5',
      kidName: 'Solve word problems',
      parentDescription: 'Chooses the right steps for multi-step problems',
      underlies: [],
    },
  ],
}
