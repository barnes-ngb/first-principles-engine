import { describe, it, expect } from 'vitest'

import { routes } from '../../app/router'
import { parseAIResponse } from './chatPlanner.logic'
import { PROGRESS_TABS, progressPath } from '../../features/progress/progressNav'
import {
  PLANNER_BOUNDARY_FALLBACK,
  PLANNER_BOUNDARY_JOBS,
  plannerBoundaryJobById,
  plannerBoundaryRoutePath,
  plannerBoundaryRoutes,
  parsePlannerBoundary,
} from '../../../functions/src/shared/plannerBoundary'

/**
 * A link to a screen that does not exist is worse than the sentence it replaced
 * (UX-269). This is the cheap half of the map's value: the destinations the
 * planner chat can send a parent to are checked against the app's own route
 * table, not against a hand-written list of paths.
 */

interface RouteNode {
  path?: string
  children?: RouteNode[]
}

function collectPaths(nodes: readonly RouteNode[]): Set<string> {
  const found = new Set<string>()
  const walk = (list: readonly RouteNode[]) => {
    for (const node of list) {
      if (typeof node.path === 'string') found.add(node.path)
      if (node.children) walk(node.children)
    }
  }
  walk(nodes)
  return found
}

describe('every planner-chat boundary destination is a real route', () => {
  const declared = collectPaths(routes as readonly RouteNode[])

  it('reads a non-trivial route table (guards the walker itself)', () => {
    expect(declared.has('/today')).toBe(true)
    expect(declared.size).toBeGreaterThan(10)
  })

  for (const route of plannerBoundaryRoutes()) {
    it(`${route} appears in the app's route table`, () => {
      expect(declared.has(plannerBoundaryRoutePath(route))).toBe(true)
    })
  }

  it('includes the fallback destination, not only the named jobs', () => {
    expect(plannerBoundaryRoutes()).toContain(PLANNER_BOUNDARY_FALLBACK.route)
  })

  it('covers every job in the table', () => {
    for (const job of PLANNER_BOUNDARY_JOBS) {
      expect(declared.has(plannerBoundaryRoutePath(job.route))).toBe(true)
    }
  })

  it('lands on the Curriculum TAB, spelled by the app that resolves it', () => {
    // The shared table cannot import from `src/` (that directory's rule 1), so
    // its `?tab=curriculum` is a literal. This pins it to `PROGRESS_TABS` — the
    // one place that slug is defined — so a renamed tab fails here rather than
    // silently landing a refusal on Foundations.
    expect(plannerBoundaryJobById('curriculum-manage')?.route).toBe(
      progressPath(PROGRESS_TABS.Curriculum),
    )
  })
})

/**
 * A plan and a refusal can arrive in the SAME reply (Codex round 3, P2).
 *
 * `parseAIResponse` extracts the object between the braces and ignores whatever
 * follows, so `{...plan...}\n[[BOUNDARY:records]]` parses as a perfectly good
 * plan. Reading the boundary only when the plan FAILED to parse dropped the
 * declined ask without a trace — which is exactly the silence this feature
 * exists to replace. The two reads are independent, and this pins that.
 */
describe('a plan and a declined ask in one reply', () => {
  const planJson = JSON.stringify({
    days: [{ day: 'Monday', items: [{ title: 'Math', subjectBucket: 'Math', estimatedMinutes: 30 }] }],
    skipSuggestions: [],
    minimumWin: 'one page',
  })

  it('yields BOTH a usable plan and a destination', () => {
    const message = `${planJson}\n\n[[BOUNDARY:records]]`
    expect(parseAIResponse({ message } as never, [])?.days).toHaveLength(1)
    expect(parsePlannerBoundary(message).destination?.id).toBe('records')
  })

  it('still yields a plan and no destination when nothing was declined', () => {
    expect(parseAIResponse({ message: planJson } as never, [])?.days).toHaveLength(1)
    expect(parsePlannerBoundary(planJson).destination).toBeNull()
  })
})
