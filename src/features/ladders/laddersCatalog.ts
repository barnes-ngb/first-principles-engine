import type { LadderCardDefinition } from '../../core/types/domain'
import { LINCOLN_LADDERS } from './lincolnLadders'
import { LONDON_LADDERS } from './londonLadders'

/**
 * Maps a child name (case-insensitive) to their ladder card set.
 * Returns undefined if no ladders are defined for that child.
 */
export function getLaddersForChild(childName: string): LadderCardDefinition[] | undefined {
  switch (childName.toLowerCase()) {
    case 'lincoln':
      return LINCOLN_LADDERS
    case 'london':
      return LONDON_LADDERS
    default:
      return undefined
  }
}
