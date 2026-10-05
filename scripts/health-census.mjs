// Read-only, revision-pinned health survey. No working-tree or network reads.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const lineCount = text => text === '' ? 0 : text.split('\n').length - Number(text.endsWith('\n'))
export function currentDocs(index) {
  return [...new Set([...index.matchAll(/^\|\s*`([^`]+\.md)`\s*\|\s*\*\*CURRENT\*\*/gm)].map(m => m[1]))].sort()
}
export function asOfDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw new Error('Use a valid --as-of=YYYY-MM-DD date')
  return Date.parse(value + 'T00:00:00Z')
}
export function survey(root, revision, date) {
  const git = args => execFileSync('git', ['-c', `safe.directory=${root}`, '-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (git(['rev-parse', '--is-shallow-repository']).trim() !== 'false') throw new Error('Full Git history required; no counts produced from shallow history')
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Use a full commit SHA for --rev')
  const asOf = asOfDate(date)
  const commit = git(['rev-parse', '--verify', revision + '^{commit}']).trim()
  const names = git(['ls-tree', '-r', '--name-only', '-z', commit]).split('\0').filter(Boolean)
  const source = names.filter(n => /^(src|functions\/src)\/.+\.tsx?$/.test(n))
  // Batch blobs avoid one subprocess per source file and preserve Git LF bytes on Windows.
  const batch = execFileSync('git', ['-c', `safe.directory=${root}`, '-C', root, 'cat-file', '--batch'], {
    input: source.map(n => `${commit}:${n}\n`).join(''), maxBuffer: 64 * 1024 * 1024,
  })
  let offset = 0
  const rows = source.map(name => {
    const end = batch.indexOf(10, offset)
    const header = batch.subarray(offset, end).toString('utf8').split(' ')
    if (header[1] !== 'blob') throw new Error('Missing source blob')
    const size = Number(header[2]); offset = end + 1
    const text = batch.subarray(offset, offset + size).toString('utf8'); offset += size + 1
    return { name, lines: lineCount(text), test: /\.(test|spec)\.tsx?$/.test(name) }
  })
  const docs = currentDocs(git(['show', `${commit}:docs/DOCUMENT_INDEX.md`])).map(name => {
    const file = `docs/${name}`
    if (!names.includes(file)) return { name, missing: true }
    const stamp = Number(git(['log', '-1', '--format=%ct', commit, '--', file]).trim()) * 1000
    return { name, ageDays: Math.floor((asOf - stamp) / 86400000) }
  })
  return {
    revision: commit, asOf: date,
    method: 'Tracked .ts/.tsx under src and functions/src; Git blob LF lines; .test/.spec test filenames. CURRENT Markdown rows deduplicated by path; age from last reachable commit timestamp, UTC midnight; age is not proof of staleness.',
    typeScriptLines: rows.reduce((sum, row) => sum + row.lines, 0),
    commits: Number(git(['rev-list', '--count', commit]).trim()),
    testFiles: rows.filter(row => row.test).length,
    currentDocs: docs.length, olderThan30Days: docs.filter(d => d.ageDays > 30).length,
    docs, largestFiles: [...rows].sort((a, b) => b.lines - a.lines || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).slice(0, 15),
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')))
  if (!args.rev || !args['as-of']) throw new Error('Usage: node scripts/health-census.mjs --rev=<full SHA> --as-of=YYYY-MM-DD')
  console.log(JSON.stringify(survey(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), args.rev, args['as-of']), null, 2))
}
