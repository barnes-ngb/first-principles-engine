import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * **Rules before the app, and a gate that cannot be left out of the run**
 * (FIX-265).
 *
 * `firestore.rules` now carries an admission contract that the current client
 * satisfies and a pre-FEAT-242 tab does not. Two things about the release have to
 * stay true, and neither is visible in any other test:
 *
 *  1. **Ordering and dependency.** The rules deploy runs BEFORE the app hosting
 *     deploy, with a propagation barrier between them, and a failed rules deploy
 *     stops the app deploy. Reordering those steps produces no test failure
 *     anywhere else in this repo and no error at deploy time — it produces a
 *     window in which a bundle is live under rules that do not admit what it
 *     sends.
 *  2. **The gate is wired.** The emulator suite is excluded from `npm test` by
 *     design, so the ONLY thing that runs it is `npm run test:rules` from a CI
 *     job. An exclusion with no job behind it is worse than no exclusion: the
 *     rules would be covered by a suite nothing executes.
 *
 * ── What this file is not ───────────────────────────────────────────────────
 *
 * It is a SHAPE check. It reads workflow and config text and asserts structure;
 * it does not evaluate a single rule, and it must never be mistaken for the
 * thing that proves the rules work. That is `src/test/rules/**`, which needs a
 * real emulator. The last describe here asserts the rules file still has the
 * shape those suites were written against — a tripwire for a silent relaxation,
 * not a substitute for enforcement.
 */

const ROOT = resolve(__dirname, '../..')
const read = (relPath: string) => readFileSync(resolve(ROOT, relPath), 'utf-8')

const deployYml = read('.github/workflows/deploy.yml')
const ciYml = read('.github/workflows/ci.yml')
const viteConfig = read('vite.config.ts')
const emulatorConfig = read('vitest.emulator.config.ts')
/**
 * The rules with their prose removed.
 *
 * Load-bearing: the file's own comments quote the match expression this change
 * retired, so an assertion that the expression is gone has to read the CODE.
 */
const rules = read('firestore.rules')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
const packageJson = JSON.parse(read('package.json')) as {
  scripts: Record<string, string>
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}
const firebaseEmulatorJson = JSON.parse(read('firebase.emulator.json')) as {
  firestore?: { rules?: string }
  emulators?: Record<string, unknown>
}

type Step = { name: string; body: string }

/** Comments are prose, not configuration — and this file asserts on the latter. */
const stripYamlComments = (yml: string) =>
  yml
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')

/**
 * The workflow's step blocks, in file order.
 *
 * A step runs from its own list marker to the next one, so the body carries the
 * step's keys (`run`, `uses`, `if`, `continue-on-error`) and nothing from its
 * neighbours.
 */
function steps(yml: string): Step[] {
  const lines = stripYamlComments(yml).split(/\r?\n/)
  const starts = lines.reduce<number[]>((acc, line, i) => {
    if (/^ {6}- /.test(line)) acc.push(i)
    return acc
  }, [])
  return starts.map((start, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1] : lines.length
    const body = lines.slice(start, end).join('\n')
    return { name: /^\s*- name: (.+)$/m.exec(body)?.[1]?.trim() ?? '', body }
  })
}

/** Where each named step is, and a readable failure when one is missing. */
function orderOf(all: Step[], names: string[]): number[] {
  return names.map((name) => {
    const at = all.findIndex((step) => step.name === name)
    expect(at, `no step named "${name}"`).toBeGreaterThanOrEqual(0)
    return at
  })
}

const isAscending = (positions: number[]) =>
  positions.every((at, i) => i === 0 || at > positions[i - 1])

const deploySteps = steps(deployYml)
const stepNamed = (name: string) => deploySteps.find((step) => step.name === name)

describe('the deploy publishes rules before the app', () => {
  it('runs rules, then the barrier, then shop, then app — in that order', () => {
    // Shop-before-app is FEAT-86's own rule and is preserved exactly; the two
    // new constraints are that both come after the rules and after the wait.
    const positions = orderOf(deploySteps, [
      'Run Firestore rules suite (emulator)',
      'Deploy Firestore rules + indexes',
      'Deploy Storage rules',
      'Wait for Firestore rules propagation',
      'Deploy Hosting (shop)',
      'Deploy Hosting (app)',
    ])
    expect(isAscending(positions), `step order was ${positions.join(' → ')}`).toBe(true)
  })

  it('can fail — a reversed order is rejected', () => {
    // The positive control. An ordering assertion that cannot say no is a
    // comment, and this is the cheapest honest way to show this one can.
    expect(isAscending([5, 4, 3])).toBe(false)
    expect(isAscending([1, 1])).toBe(false)
  })

  it('waits at least ten minutes for propagation', () => {
    const wait = stepNamed('Wait for Firestore rules propagation')
    const seconds = Number(/RULES_PROPAGATION_SECONDS: '(\d+)'/.exec(wait?.body ?? '')?.[1])
    expect(seconds).toBeGreaterThanOrEqual(600)
    // The sleep must actually read the variable the number is declared in,
    // otherwise tuning it would change a label and nothing else.
    expect(wait?.body).toContain('sleep "${RULES_PROPAGATION_SECONDS}"')
  })

  it('lets a failed rules deploy stop the app deploy', () => {
    // Default GitHub Actions behaviour stops the job at the first failed step,
    // so the dependency is the ABSENCE of an escape hatch on these four.
    for (const name of [
      'Run Firestore rules suite (emulator)',
      'Deploy Firestore rules + indexes',
      'Wait for Firestore rules propagation',
      'Deploy Hosting (app)',
    ]) {
      const step = stepNamed(name)
      expect(step?.body, `${name} must not continue on error`).not.toContain(
        'continue-on-error',
      )
      expect(step?.body, `${name} must not be conditional`).not.toMatch(/^\s*if:/m)
    }
  })

  it('still deploys the rules themselves, not only the indexes', () => {
    expect(stepNamed('Deploy Firestore rules + indexes')?.body).toContain('--only firestore')
  })
})

describe('the rules suite is gated in CI', () => {
  it('has a CI job that runs it, with a JVM for the emulator', () => {
    expect(ciYml).toContain('test-rules:')
    expect(ciYml).toContain('npm run test:rules')
    expect(ciYml).toContain('actions/setup-java')
  })

  it('runs the suite inside the emulator, against a demo project', () => {
    const script = packageJson.scripts['test:rules']
    expect(script).toBeTruthy()
    expect(script).toContain('emulators:exec')
    expect(script).toContain('--config firebase.emulator.json')
    expect(script).toContain('vitest.emulator.config.ts')
    // A demo- project id is served locally by firebase-tools and cannot resolve
    // to the live project, which is what keeps a test run credential-free.
    expect(script).toMatch(/--project demo-/)
    // No bash-style inline env vars: this has to run on Windows PowerShell too
    // (CLAUDE.md › Cross-platform npm scripts).
    expect(script).not.toMatch(/\b[A-Z_]+=\S+\s+(npx|vitest|firebase)/)
  })

  it('keeps the emulator tooling development-only', () => {
    expect(packageJson.devDependencies['@firebase/rules-unit-testing']).toBeTruthy()
    expect(packageJson.dependencies['@firebase/rules-unit-testing']).toBeUndefined()
  })

  it('points the emulator at the rules file that deploys', () => {
    // The suite must assert the DEPLOYED file. A copy would pass forever.
    expect(firebaseEmulatorJson.firestore?.rules).toBe('firestore.rules')
    expect(Object.keys(firebaseEmulatorJson.emulators ?? {})).toEqual(
      expect.arrayContaining(['firestore', 'auth']),
    )
  })

  it('excludes the emulator suite from the ordinary run and includes it in its own', () => {
    // The pair. Either half alone is a hole: excluded and un-included means the
    // rules are tested nowhere, included in both means `npm test` fails for
    // everyone without an emulator.
    expect(viteConfig).toContain('src/test/rules/**')
    expect(emulatorConfig).toContain("include: ['src/test/rules/**/*.rules.test.ts']")
  })

  it('has suites for the gate to run', () => {
    // An empty directory behind a green gate is the failure this guards: vitest
    // exits non-zero on no files found, but a single surviving file would not,
    // and the controls are the point rather than the count.
    const files = readdirSync(resolve(ROOT, 'src/test/rules')).filter((file) =>
      file.endsWith('.rules.test.ts'),
    )
    expect(files).toEqual(
      expect.arrayContaining([
        'familyBoundary.rules.test.ts',
        'legacyRulesControl.rules.test.ts',
        'nativeProgressObservations.rules.test.ts',
        'realWriter.rules.test.ts',
      ]),
    )
  })
})

describe('the rules file still has the shape those suites were written against', () => {
  it('no longer carries one broad write grant over the whole family subtree', () => {
    // Overlapping grants combine with OR, so this match's survival would
    // re-authorize every write the observation rule refuses — the single most
    // likely way for this change to be silently undone.
    expect(rules).not.toContain('match /families/{familyId}/{document=**}')
    expect(rules).toContain('match /families/{familyId} {')
    expect(rules).toContain('match /families/{familyId}/{collectionId}/{document=**}')
    expect(rules).toContain("collectionId != 'nativeProgressObservations'")
  })

  it('gives observations a dedicated create-only match', () => {
    const block = /match \/families\/\{familyId\}\/nativeProgressObservations\/\{observationId\} \{([\s\S]*?)\n {4}\}/.exec(
      rules,
    )?.[1]
    expect(block, 'no dedicated nativeProgressObservations match').toBeTruthy()
    expect(block).toContain('allow read')
    expect(block).toContain('allow create')
    // Append-only is the absence of these three, which is why they are asserted
    // as absent rather than described in a comment.
    expect(block).not.toMatch(/allow[^\n]*update/)
    expect(block).not.toMatch(/allow[^\n]*delete/)
    expect(block).not.toMatch(/allow[^\n]*write/)
  })

  it('keeps observation descendants behind a mandatory subcollection segment', () => {
    // A recursive wildcard directly under {observationId} matches zero segments
    // too, and would hand the observation document's own writes back.
    expect(rules).toContain(
      'match /families/{familyId}/nativeProgressObservations/{observationId}/{subcollectionId}/{nested=**}',
    )
    expect(rules).not.toMatch(
      /nativeProgressObservations\/\{observationId\}\/\{[A-Za-z]+=\*\*\}/,
    )
  })

  it('checks the marker both before and after the commit', () => {
    // `getAfter` alone accepts a marker that already named the incoming
    // correction. Both calls present is the discriminator's shape.
    expect(rules).toContain('getAfter(markerRef)')
    expect(rules).toContain('exists(markerRef)')
    expect(rules).toContain('get(markerRef)')
    expect(rules).toContain('nativeProgressCorrectionMarkers/$(correctedId)')
    expect(rules).toContain('declaredCorrectedId()')
  })
})
