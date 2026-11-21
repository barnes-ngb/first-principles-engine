/**
 * Local raw-copy preflight for the Lantern Cove starter (FEAT-247, slice 4).
 *
 * Usage (a directory of the five files exactly as the editor handed them back):
 *
 *   npx tsx scripts/lanternCovePreflight.ts <returnedDir> [starterDir]
 *
 * `starterDir` defaults to the staged starter in the repo. The script reads every
 * file as RAW text, changes nothing, writes nothing and calls no network. For each
 * of the five files it prints the byte length, a SHA-256, and the app's own verdict
 * (`identical` / `equivalent` / `different` / `unreadable` / `missing`) with the
 * first differing line, so the exact differences a stock import → capture round
 * trip produces can be inspected instead of inferred. The pristine verdict is
 * exact: only the measured differences (one trailing LF on `pxt.json`, the x/y of
 * the three starter blocks) are `equivalent`, and any other file in the directory
 * is reported as a difference. It then prints whether the credit signature (code,
 * map and wall layer) of the returned copy equals the starter's — which is the
 * property that stops an unchanged round trip earning hours — and exits non-zero
 * when the returned copy is not the starter. The Blocks' well-formedness is the
 * app's `DOMParser` check, which needs a DOM and is not run here.
 *
 * The returned directory is untrusted data: it is only ever read, by path, as text.
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  compareLanternCoveToStarter,
  lanternCoveCreditSignature,
} from '../src/features/build-studio/lanternCoveFidelity'

const FILES = ['pxt.json', 'main.blocks', 'main.ts', 'tilemap.g.jres', 'tilemap.g.ts'] as const

/** The staged starter keeps generated TypeScript behind a `.txt` suffix. */
const STAGED_NAME: Record<string, string> = {
  'main.ts': 'main.ts.txt',
  'tilemap.g.ts': 'tilemap.g.ts.txt',
}

function readSet(dir: string, staged: boolean): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of FILES) {
    const candidates = staged && STAGED_NAME[name] ? [STAGED_NAME[name], name] : [name]
    for (const candidate of candidates) {
      const path = join(dir, candidate)
      if (existsSync(path)) {
        // Raw text, no newline or whitespace repair: what the editor sent is the evidence.
        out[name] = readFileSync(path, 'utf8')
        break
      }
    }
  }
  return out
}

/**
 * Every regular file directly inside the returned directory, as raw text, so a file
 * the prepared starter does not have is reported rather than silently skipped.
 * (Editor scratch — `.simstate.json`, `_`-private names — is ignored by the
 * comparison itself, not here.)
 */
function readReturned(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isFile()) out[name] = readFileSync(path, 'utf8')
  }
  return out
}

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)

function main(): number {
  const [returnedDir, starterDirArg] = process.argv.slice(2)
  if (!returnedDir) {
    console.error('usage: tsx scripts/lanternCovePreflight.ts <returnedDir> [starterDir]')
    return 2
  }
  const starterDir = starterDirArg ?? join('src', 'features', 'build-studio', 'starters', 'lantern-cove')
  const returned = readReturned(returnedDir)
  const starter = readSet(starterDir, true)

  const report = compareLanternCoveToStarter(returned, starter)
  for (const file of report.files) {
    const r = returned[file.file]
    const s = starter[file.file]
    console.log(
      `${file.status.padEnd(10)} ${file.file.padEnd(16)} returned ${r === undefined ? '-' : `${Buffer.byteLength(r)}B ${sha(r)}`}  starter ${s === undefined ? '-' : `${Buffer.byteLength(s)}B ${sha(s)}`}`,
    )
    if (file.status !== 'identical') console.log(`           ${file.detail}`)
  }

  const a = lanternCoveCreditSignature(returned)
  const b = lanternCoveCreditSignature(starter)
  console.log(
    `credit signature: returned ${a === null ? 'unreadable' : sha(a)}  starter ${b === null ? 'unreadable' : sha(b)}  ${a !== null && a === b ? 'EQUAL (an unchanged round trip earns nothing)' : 'DIFFERENT'}`,
  )
  console.log(report.matches ? 'RESULT: returned copy matches the starter' : 'RESULT: returned copy is NOT the starter')
  return report.matches ? 0 : 1
}

process.exitCode = main()
