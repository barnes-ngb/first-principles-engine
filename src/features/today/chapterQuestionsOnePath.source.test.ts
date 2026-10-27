import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * UX-464 — every door onto `TaskType.ChapterQuestions` goes through the ONE
 * batching path, `chapterQuestionBatches.ts`. Three doors each held a copy of a
 * one-call-for-the-whole-book loop with a bare `JSON.parse`; a fourth copy
 * would bring the truncation back silently, so this scans `src/` for it.
 */
const SRC = join(__dirname, '..', '..')
const HELPER = 'features/today/chapterQuestionBatches.ts'

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

export function chapterQuestionCallers(files: Array<{ path: string; text: string }>): string[] {
  return files.filter((f) => f.text.includes('TaskType.ChapterQuestions')).map((f) => f.path)
}

describe('one batching path for chapter questions (UX-464)', () => {
  const files = sources(SRC).map((p) => ({ path: relative(SRC, p).split('\\').join('/'), text: readFileSync(p, 'utf8') }))

  it('only the shared helper calls the task', () => {
    expect(chapterQuestionCallers(files)).toEqual([HELPER])
  })

  it('positive control: a page calling the task directly is caught', () => {
    const planted = [...files, { path: 'features/x/Planted.tsx', text: 'taskType: TaskType.ChapterQuestions,' }]
    expect(chapterQuestionCallers(planted)).toEqual([HELPER, 'features/x/Planted.tsx'])
  })

  it('the three doors use the helper', () => {
    for (const door of [
      'features/today/TodayPage.tsx',
      'features/planner-chat/PlannerChatPage.tsx',
      'features/settings/DevAdminTab.tsx',
    ]) {
      expect(files.find((f) => f.path === door)?.text).toContain('generateChapterQuestionsInBatches(')
    }
  })

  it('the helper never parses a reply with a bare JSON.parse', () => {
    const helper = files.find((f) => f.path === HELPER)!.text
    const code = helper.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(code).not.toContain('JSON.parse')
    expect(code).toContain('sanitizeAndParseJson')
  })
})
