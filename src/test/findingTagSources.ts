/**
 * The files the finding-tag registry is derived from — AUDIT-226.
 *
 * Split out of the pure rule (`findingTagBridge.ts`, which touches no I/O) so
 * the guard and `npm run census:finding-tags` read the SAME sources by the same
 * definition. Two readers would be two answers, and the whole point of the
 * registry is that the document and the rule cannot drift.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repo root, resolved from this file rather than from `process.cwd()`. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const TAG_CENSUS_PATH = 'docs/review/FINDING_TAG_BRIDGE_CENSUS_2026-09.md'

/** The Cloud Function prompt source that carries the SKILL TAGS blocks. */
export const CHAT_PROMPT_PATH = 'functions/src/ai/chat.ts'

export function loadChatPromptSource(root: string = REPO_ROOT): string {
  return readFileSync(join(root, CHAT_PROMPT_PATH), 'utf8')
}

export function loadTagCensus(root: string = REPO_ROOT): string {
  return readFileSync(join(root, TAG_CENSUS_PATH), 'utf8')
}
