import { describe, expect, it } from 'vitest'

import kidTodaySource from './KidTodayView.tsx?raw'
import heroSource from '../avatar/MyAvatarPage.tsx?raw'

/**
 * FEAT-184 / UX-150 (audit #5): Kid Today's `⛏️ Start Mining` row must be
 * gated exactly as the Hero Hub tile is. Before this, the row rendered for
 * every kid while `/quest`'s route guard bounced an ungated child back to
 * `/today` — a big green button that silently reloaded the page under him.
 *
 * `KidTodayView` is a 1,100-line shell with a dozen live hooks, so the
 * assertion is on the source: the mining section is wrapped in the same
 * predicate the Hero Hub and the route use, and that predicate is the one
 * snapshot-only gate (capability, never a name).
 */
describe('Kid Today mining row — gated like the Hero Hub tile', () => {
  it('wraps the knowledge-mine section in canAccessKnowledgeMine', () => {
    expect(kidTodaySource).toMatch(/import \{ canAccessKnowledgeMine \} from '\.\.\/quest\/knowledgeMineAccess'/)
    expect(kidTodaySource).toMatch(/const showMiningRow = canAccessKnowledgeMine\(/)
    // The gate sits directly in front of the section, so a held child gets no
    // row at all — not a disabled one and not an explanation.
    expect(kidTodaySource).toMatch(/\{showMiningRow && \(\s*<SectionErrorBoundary section="knowledge-mine">/)
  })

  it('uses the same predicate the Hero Hub tile uses', () => {
    expect(heroSource).toMatch(/const hideKnowledgeMine = !canAccessKnowledgeMine\(/)
  })

  it('keys the row on snapshot data, never on a name', () => {
    const block = kidTodaySource.slice(
      kidTodaySource.indexOf('const showMiningRow'),
      kidTodaySource.indexOf('const showMiningRow') + 200,
    )
    expect(block).not.toMatch(/isLincoln|\.name\b|london|lincoln/i)
  })
})
