import { test } from 'vitest'
import assert from 'node:assert/strict'
import { lineCount, currentDocs, asOfDate, survey } from './health-census.mjs'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

test('line counts handle empty, trailing and nontrailing newline', () => {
  assert.equal(lineCount(''), 0)
  assert.equal(lineCount('one\n'), 1)
  assert.equal(lineCount('one\ntwo'), 2)
})
test('CURRENT rows allow date suffixes, dedupe paths and exclude history/prose', () => {
  assert.deepEqual(currentDocs('| `a.md` | **CURRENT** (2026-09-28) |\n| `a.md` | **CURRENT** |\n| `b.md` | **HISTORICAL** |\n prose CURRENT c.md\n| `x.ts` | **CURRENT** |'), ['a.md'])
})
test('as-of dates reject calendar normalization and require explicit UTC day', () => {
  assert.equal(asOfDate('2026-09-28'), Date.UTC(2026, 8, 28))
  assert.throws(() => asOfDate('2026-02-30'))
  assert.throws(() => asOfDate('yesterday'))
})
test('survey pins Git blobs and history, ignores dirty/untracked files, reports missing docs', () => {
  const root = mkdtempSync(join(tmpdir(), 'health census '))
  const git = args => execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'test@example.invalid', GIT_AUTHOR_DATE: '2026-08-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-08-01T00:00:00Z' },
  }).trim()
  try {
    git(['init', '--quiet']); git(['config', 'core.autocrlf', 'false'])
    mkdirSync(join(root, 'src')); mkdirSync(join(root, 'docs'))
    writeFileSync(join(root, 'src', 'café.ts'), '// café\n')
    writeFileSync(join(root, 'src', 'case.test.ts'), '// test\n// second')
    writeFileSync(join(root, 'docs', 'a.md'), 'Reference')
    writeFileSync(join(root, 'docs', 'DOCUMENT_INDEX.md'), '| `a.md` | **CURRENT** |\n| `missing.md` | **CURRENT** |\n')
    git(['add', '.']); git(['commit', '--quiet', '-m', 'fixture'])
    const rev = git(['rev-parse', 'HEAD'])
    const before = survey(root, rev, '2026-09-28')
    assert.equal(before.typeScriptLines, 3)
    assert.equal(before.testFiles, 1)
    assert.equal(before.commits, 1)
    assert.equal(before.olderThan30Days, 1)
    assert.deepEqual(before.docs.find(d => d.name === 'missing.md'), { name: 'missing.md', missing: true })
    writeFileSync(join(root, 'src', 'café.ts'), 'changed\n'.repeat(50))
    writeFileSync(join(root, 'src', 'untracked.ts'), 'ignored')
    assert.deepEqual(survey(root, rev, '2026-09-28'), before)
    git(['add', '.']); git(['commit', '--quiet', '-m', 'later changes'])
    assert.deepEqual(survey(root, rev, '2026-09-28'), before)
    assert.throws(() => survey(root, '--all', '2026-09-28'))
    writeFileSync(join(root, '.git', 'shallow'), git(['rev-parse', 'HEAD']) + '\n')
    assert.throws(() => survey(root, rev, '2026-09-28'), /Full Git history required/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
