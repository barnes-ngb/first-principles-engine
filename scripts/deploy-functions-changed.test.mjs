import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { functionsChanged } from './deploy-functions-changed.mjs'

/**
 * FIX-261 / UX-456 — the functions deploy is decided over the whole PUSH, not
 * its last commit. Built against a throwaway repo shaped like the 2026-10-05
 * push: a `functions/` commit followed by a docs-only commit.
 */
let dir
const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
const commit = (file, body, msg) => {
  mkdirSync(join(dir, file, '..'), { recursive: true })
  writeFileSync(join(dir, file), body)
  git('add', '-A')
  git('commit', '-qm', msg)
  return git('rev-parse', 'HEAD')
}
let base, fnCommit, docsHead, docsOnlyBase, docsOnlyHead

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'deploy-range-'))
  git('init', '-q')
  git('config', 'user.email', 't@example.com')
  git('config', 'user.name', 't')
  base = commit('README.md', 'a', 'base')
  fnCommit = commit('functions/src/x.ts', 'x', 'functions change')
  docsHead = commit('docs/a.md', 'b', 'docs after it')
  docsOnlyBase = docsHead
  docsOnlyHead = commit('docs/b.md', 'c', 'docs only push')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const run = (before, after) => functionsChanged({ eventName: 'push', before, after, cwd: dir })

describe('functionsChanged (FIX-261)', () => {
  it('deploys when an EARLIER commit in the push touched functions/ and the last did not', () => {
    expect(run(base, docsHead).changed).toBe(true)
  })

  it('positive control: the retired HEAD~1 rule skips that same push', () => {
    // `git merge-base HEAD HEAD~1` is HEAD~1 — the old workflow's range.
    expect(run(git('rev-parse', `${docsHead}~1`), docsHead).changed).toBe(false)
    expect(git('rev-parse', `${docsHead}~1`)).toBe(fnCommit)
  })

  it('skips a push that touched no functions file', () => {
    expect(run(docsOnlyBase, docsOnlyHead).changed).toBe(false)
  })

  it('counts firestore.indexes.json as a functions-deploy change', () => {
    const before = git('rev-parse', 'HEAD')
    const after = commit('firestore.indexes.json', '{}', 'indexes')
    expect(run(before, after).changed).toBe(true)
  })

  it('deploys when the range cannot be read: new branch, unknown commit, rewritten history', () => {
    expect(run('0000000000000000000000000000000000000000', docsHead).changed).toBe(true)
    expect(run('', docsHead).changed).toBe(true)
    expect(run('1234567890abcdef1234567890abcdef12345678', docsHead).changed).toBe(true)
    // A force-push: `before` exists but is not an ancestor of the new head.
    expect(run(docsOnlyHead, docsHead).changed).toBe(true)
  })

  it('a manual run always deploys', () => {
    expect(functionsChanged({ eventName: 'workflow_dispatch', cwd: dir }).changed).toBe(true)
  })
})

describe('deploy.yml reads the push range through this script (FIX-261)', () => {
  const yml = readFileSync(join(__dirname, '..', '.github', 'workflows', 'deploy.yml'), 'utf8')
  it('calls the script with the push range and no longer uses HEAD~1', () => {
    expect(yml).toContain(
      'node scripts/deploy-functions-changed.mjs "${{ github.event_name }}" "${{ github.event.before }}" "${{ github.sha }}"',
    )
    const code = yml.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')
    expect(code).not.toMatch(/HEAD~1/)
  })
})
