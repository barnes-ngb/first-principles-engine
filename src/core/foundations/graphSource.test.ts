import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

import { readingGraph, READING_GRAPH_VERSION } from './readingGraph'
import { mathGraph, MATH_GRAPH_VERSION } from './mathGraph'
import {
  allFoundationNodes,
  foundationGraphs,
  FOUNDATION_NODE_MAP,
  foundationGraphVersion,
  foundationNodesForDomain,
} from './index'
import * as shared from '../../../functions/src/shared/foundations/graph'
import * as sharedReading from '../../../functions/src/shared/foundations/readingGraph'
import * as sharedMath from '../../../functions/src/shared/foundations/mathGraph'

/**
 * Shared graph identity and a conventional duplicate-literal guard (UX-296).
 *
 * The old manually generated server mirror agreed with the client at baseline,
 * but its tests did not compare them. Both projects now compile the shared spine;
 * the server projection suite independently checks its values and ordering.
 *
 * This additional scan catches the retired generator's unquoted
 * `parentDescription: 'text'` shape in .ts/.tsx files under src/ and functions/src/,
 * excluding .test files and the directories listed below. It is a source-format
 * heuristic, not a general detector of duplicate data: quoted property keys,
 * JSON files and dynamically constructed copies are outside its coverage.
 *
 * Restoring the retired mirror makes the scan fail. Replacing a client re-export
 * with an equal copy fails the identity checks. Changing a shared node while
 * restoring a stale server mirror fails the server projection suite, regardless
 * of the mirror's property-key formatting.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..', '..')

/** Paths exempted from the conventional-literal scan. */
const CANONICAL = [
  'functions/src/shared/foundations/readingGraph.ts',
  'functions/src/shared/foundations/mathGraph.ts',
]

/**
 * A curated node's own text — `parentDescription:` followed by a string literal,
 * on the same line or wrapped onto the next one (how both graphs are formatted).
 * `foundationsGraphSummary.ts` reads `n.parentDescription` instead, which is the
 * difference between projecting the spine and copying it.
 */
const NODE_LITERAL = /parentDescription:\s*(['"`]|$)/m

/** Comments stripped: a docstring that QUOTES a node must not read as a copy. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function sourceFilesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'lib', 'dist', '__stubs__'].includes(entry.name)) continue
      sourceFilesUnder(full, out)
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const rel = (abs: string) => relative(REPO, abs).split(sep).join('/')

describe('the foundations spine has one source', () => {
  it('holds the curated node literals at the shared path', () => {
    for (const path of CANONICAL) {
      expect(NODE_LITERAL.test(readFileSync(resolve(REPO, path), 'utf8')), path).toBe(
        true,
      )
    }
  })

  it('finds no conventional node literals outside the shared paths', () => {
    const files = [
      ...sourceFilesUnder(resolve(REPO, 'src')),
      ...sourceFilesUnder(resolve(REPO, 'functions', 'src')),
    ]
    const copies = files
      .map(rel)
      .filter((path) => !CANONICAL.includes(path))
      .filter((path) => NODE_LITERAL.test(code(readFileSync(resolve(REPO, path), 'utf8'))))
    expect(copies).toEqual([])
  })

  it('serves the app the very objects the shared module defines', () => {
    expect(readingGraph).toBe(sharedReading.readingGraph)
    expect(mathGraph).toBe(sharedMath.mathGraph)
    expect(READING_GRAPH_VERSION).toBe(sharedReading.READING_GRAPH_VERSION)
    expect(MATH_GRAPH_VERSION).toBe(sharedMath.MATH_GRAPH_VERSION)
    expect(foundationGraphs).toBe(shared.foundationGraphs)
    expect(allFoundationNodes).toBe(shared.allFoundationNodes)
    expect(FOUNDATION_NODE_MAP).toBe(shared.FOUNDATION_NODE_MAP)
    expect(foundationGraphVersion).toBe(shared.foundationGraphVersion)
    expect(foundationNodesForDomain).toBe(shared.foundationNodesForDomain)
  })

  it('keeps the barrel answering exactly as it did (spine order, tag, lookup)', () => {
    expect(foundationGraphs.map((g) => g.domain)).toEqual(['reading', 'math'])
    expect(allFoundationNodes).toHaveLength(60)
    expect(foundationGraphVersion()).toBe('reading@1+math@1')
    expect(foundationNodesForDomain('reading')).toBe(readingGraph.nodes)
    expect(foundationNodesForDomain('math')).toBe(mathGraph.nodes)
    expect(FOUNDATION_NODE_MAP['reading.phonics.cvc']).toBe(
      readingGraph.nodes.find((n) => n.id === 'reading.phonics.cvc'),
    )
  })
})
