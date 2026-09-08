import { describe, it, expect } from 'vitest'

import { routes } from '../../app/router'
import {
  PLANNER_BOUNDARY_FALLBACK,
  PLANNER_BOUNDARY_JOBS,
  plannerBoundaryRoutes,
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
      expect(declared.has(route)).toBe(true)
    })
  }

  it('includes the fallback destination, not only the named jobs', () => {
    expect(plannerBoundaryRoutes()).toContain(PLANNER_BOUNDARY_FALLBACK.route)
  })

  it('covers every job in the table', () => {
    for (const job of PLANNER_BOUNDARY_JOBS) {
      expect(declared.has(job.route)).toBe(true)
    }
  })
})
