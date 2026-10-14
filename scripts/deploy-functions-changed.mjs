#!/usr/bin/env node
/**
 * Does this `deploy` push need the Cloud Functions deploy? (FIX-261 / UX-460)
 *
 * `.github/workflows/deploy.yml` used to answer with
 * `git merge-base HEAD HEAD~1` — which is always `HEAD~1` — so it compared the
 * push's LAST commit only. A push carrying several commits whose last one did
 * not touch `functions/` skipped the functions deploy even when earlier commits
 * in the same push did (the 2026-10-05 push skipped eight `functions/` files
 * that way, and FIX-260's PR had to tell the owner to run the workflow by hand).
 *
 * The right range is the PUSH: from the commit `deploy` pointed at before the
 * push (`github.event.before`) to the one it points at now. Where that range
 * cannot be read — the branch was just created (`before` is all zeros), the
 * push was a force-push that rewrote `before` out of history, or `before` is
 * missing — the answer is **deploy**. Deploying functions that did not change
 * costs a few minutes; skipping functions that did leaves the family on old
 * server code with nothing on any screen saying so. A manual run always
 * deploys, as before.
 *
 * Usage (from the workflow):
 *   node scripts/deploy-functions-changed.mjs <eventName> <before> <after>
 * Prints `changed=true|false` and appends it to `$GITHUB_OUTPUT` when set.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Paths whose change means the functions deploy (and its indexes) must run. */
export const FUNCTIONS_DEPLOY_PATHS = ['functions/', 'firestore.indexes.json']

const ZERO_SHA = /^0+$/

/**
 * @param {{ eventName: string, before?: string, after?: string, cwd?: string }} input
 * @returns {{ changed: boolean, reason: string }}
 */
export function functionsChanged({ eventName, before, after, cwd }) {
  if (eventName === 'workflow_dispatch') return { changed: true, reason: 'manual run' }
  const head = after || 'HEAD'
  if (!before || ZERO_SHA.test(before)) {
    return { changed: true, reason: 'no previous deploy commit (new branch)' }
  }
  const git = (args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
  try {
    git(['cat-file', '-e', `${before}^{commit}`])
    // `before` must be an ancestor of the new head, or the push rewrote history
    // and a two-dot diff would describe the wrong change.
    git(['merge-base', '--is-ancestor', before, head])
  } catch {
    return { changed: true, reason: 'previous deploy commit unreadable (force-push?)' }
  }
  try {
    git(['diff', '--quiet', before, head, '--', ...FUNCTIONS_DEPLOY_PATHS])
    return { changed: false, reason: `no functions change in ${before.slice(0, 7)}..${head.slice(0, 7)}` }
  } catch (err) {
    // `git diff --quiet` exits 1 for "differences found"; anything else is an
    // error we cannot read — and an unreadable answer deploys.
    const status = /** @type {{ status?: number }} */ (err).status
    return {
      changed: true,
      reason: status === 1 ? `functions changed in ${before.slice(0, 7)}..${head.slice(0, 7)}` : 'diff failed',
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [eventName = '', before = '', after = ''] = process.argv.slice(2)
  const { changed, reason } = functionsChanged({ eventName, before, after })
  console.log(`changed=${changed} (${reason})`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`)
}
