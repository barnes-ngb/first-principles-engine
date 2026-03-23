import { addDoc } from 'firebase/firestore'
import { hoursCollection, artifactsCollection, storyGamesCollection } from '../../core/firebase/firestore'
import { doc, updateDoc, arrayUnion } from 'firebase/firestore'
import type { AdventureTree, ChallengeCard, GeneratedGame } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'
import { WorkshopStatus } from '../../core/types/workshop'

// ── Map challenge card types to SubjectBucket ─────────────────────

const CARD_TYPE_TO_BUCKET: Record<string, SubjectBucket> = {
  reading: SubjectBucket.Reading,
  math: SubjectBucket.Math,
  story: SubjectBucket.LanguageArts,
  action: SubjectBucket.Other,
}

function getSubjectBucket(card: ChallengeCard): SubjectBucket {
  // Prefer the AI-tagged subjectBucket if valid
  const bucket = card.subjectBucket as SubjectBucket
  if (Object.values(SubjectBucket).includes(bucket)) return bucket
  // Fall back to card type mapping
  return CARD_TYPE_TO_BUCKET[card.type] ?? SubjectBucket.Other
}

// ── Log hours split by challenge card types ───────────────────────

export async function logWorkshopHours(
  familyId: string,
  childId: string,
  game: GeneratedGame,
  durationMinutes: number,
  cardsEncountered: string[],
): Promise<void> {
  // Count cards by subject bucket
  const bucketCounts: Record<string, number> = {}
  let totalCards = 0

  for (const cardId of cardsEncountered) {
    const card = game.challengeCards.find((c) => c.id === cardId)
    if (!card) continue
    const bucket = getSubjectBucket(card)
    bucketCounts[bucket] = (bucketCounts[bucket] ?? 0) + 1
    totalCards++
  }

  if (totalCards === 0) {
    // No cards encountered — log all time as Art (creative play)
    await addDoc(hoursCollection(familyId), {
      childId,
      date: new Date().toISOString().slice(0, 10),
      minutes: durationMinutes,
      subjectBucket: SubjectBucket.Art,
      notes: `Played "${game.title}" (Story Game Workshop)`,
    })
    return
  }

  // Split minutes proportionally by bucket
  const today = new Date().toISOString().slice(0, 10)
  const promises = Object.entries(bucketCounts).map(([bucket, count]) => {
    const minutes = Math.round((count / totalCards) * durationMinutes)
    if (minutes <= 0) return Promise.resolve()
    return addDoc(hoursCollection(familyId), {
      childId,
      date: today,
      minutes,
      subjectBucket: bucket as SubjectBucket,
      notes: `Played "${game.title}" — ${count} ${bucket.toLowerCase()} challenges`,
    })
  })

  await Promise.all(promises)
}

// ── Log hours for Lincoln's playtest session ──────────────────────

export async function logPlaytestHours(
  familyId: string,
  childId: string,
  game: GeneratedGame,
  durationMinutes: number,
  hasAudioFeedback: boolean,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const promises: Promise<unknown>[] = []

  // Count cards by type for proportional split (reading aloud = language arts)
  const bucketCounts: Record<string, number> = {}
  let totalCards = 0
  for (const card of game.challengeCards) {
    const bucket = getSubjectBucket(card)
    bucketCounts[bucket] = (bucketCounts[bucket] ?? 0) + 1
    totalCards++
  }

  if (totalCards === 0) {
    promises.push(
      addDoc(hoursCollection(familyId), {
        childId,
        date: today,
        minutes: durationMinutes,
        subjectBucket: SubjectBucket.LanguageArts,
        notes: `Playtested "${game.title}" (Story Game Workshop)`,
      }),
    )
  } else {
    // Allocate time proportionally — reading cards aloud counts as Language Arts
    // The primary learning activity is reading + giving feedback
    const readingMinutes = Math.round(durationMinutes * 0.6) // 60% reading cards
    const feedbackMinutes = durationMinutes - readingMinutes // 40% giving feedback

    // Reading cards — split by card type
    for (const [bucket, count] of Object.entries(bucketCounts)) {
      const minutes = Math.round((count / totalCards) * readingMinutes)
      if (minutes <= 0) continue
      promises.push(
        addDoc(hoursCollection(familyId), {
          childId,
          date: today,
          minutes,
          subjectBucket: bucket as SubjectBucket,
          notes: `Playtested "${game.title}" — read ${count} ${bucket.toLowerCase()} cards aloud`,
        }),
      )
    }

    // Feedback time = Language Arts (writing/speaking feedback)
    if (feedbackMinutes > 0) {
      promises.push(
        addDoc(hoursCollection(familyId), {
          childId,
          date: today,
          minutes: feedbackMinutes,
          subjectBucket: SubjectBucket.LanguageArts,
          notes: `Playtested "${game.title}" — feedback & critical thinking`,
        }),
      )
    }
  }

  // Additional speech/communication time if audio feedback was recorded
  if (hasAudioFeedback) {
    const speechMinutes = Math.max(Math.round(durationMinutes * 0.1), 1)
    promises.push(
      addDoc(hoursCollection(familyId), {
        childId,
        date: today,
        minutes: speechMinutes,
        subjectBucket: SubjectBucket.LanguageArts,
        notes: `Playtested "${game.title}" — verbal feedback (speech practice)`,
      }),
    )
  }

  await Promise.all(promises)
}

// ── Create artifact for completed game ────────────────────────────

export async function createGameArtifact(
  familyId: string,
  childId: string,
  game: GeneratedGame,
): Promise<string> {
  const artifactDoc = await addDoc(artifactsCollection(familyId), {
    childId,
    title: game.title,
    type: 'Note' as const,
    content: `${game.title} — A board game created in Story Game Workshop! ${game.board.totalSpaces} spaces, ${game.challengeCards.length} challenge cards. Theme: ${game.metadata.theme}.`,
    createdAt: new Date().toISOString(),
    tags: {
      engineStage: 'Build' as const,
      domain: 'creative',
      subjectBucket: SubjectBucket.Art,
      location: 'Home' as const,
    },
  })
  return artifactDoc.id
}

// ── Log hours for adventure play sessions ─────────────────────────

export async function logAdventureHours(
  familyId: string,
  childId: string,
  adventure: AdventureTree,
  durationMinutes: number,
  challengeResults: Array<{ nodeId: string; passed: boolean }>,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const promises: Promise<unknown>[] = []

  // Count challenge types for proportional split
  const bucketCounts: Record<string, number> = {}
  let totalChallenges = 0

  for (const result of challengeResults) {
    const node = adventure.nodes[result.nodeId]
    if (!node?.challenge) continue
    const bucket = CARD_TYPE_TO_BUCKET[node.challenge.type] ?? SubjectBucket.Other
    bucketCounts[bucket] = (bucketCounts[bucket] ?? 0) + 1
    totalChallenges++
  }

  // Narrative time (non-challenge) counts as Language Arts (reading/listening comprehension)
  const challengeMinutes = totalChallenges > 0
    ? Math.round(durationMinutes * 0.4) // 40% on challenges
    : 0
  const narrativeMinutes = durationMinutes - challengeMinutes

  // Log narrative time as Language Arts
  if (narrativeMinutes > 0) {
    promises.push(
      addDoc(hoursCollection(familyId), {
        childId,
        date: today,
        minutes: narrativeMinutes,
        subjectBucket: SubjectBucket.LanguageArts,
        notes: `Adventure story — reading/listening comprehension`,
      }),
    )
  }

  // Split challenge time by type
  if (totalChallenges > 0) {
    for (const [bucket, count] of Object.entries(bucketCounts)) {
      const minutes = Math.round((count / totalChallenges) * challengeMinutes)
      if (minutes <= 0) continue
      promises.push(
        addDoc(hoursCollection(familyId), {
          childId,
          date: today,
          minutes,
          subjectBucket: bucket as SubjectBucket,
          notes: `Adventure challenge — ${count} ${bucket.toLowerCase()} challenges`,
        }),
      )
    }
  }

  await Promise.all(promises)
}

// ── Log hours for adventure playtest session ─────────────────────

export async function logAdventurePlaytestHours(
  familyId: string,
  childId: string,
  adventure: AdventureTree,
  durationMinutes: number,
  hasAudioFeedback: boolean,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const promises: Promise<unknown>[] = []

  // Count challenge types for proportional split
  const bucketCounts: Record<string, number> = {}
  let totalChallenges = 0

  for (const node of Object.values(adventure.nodes)) {
    if (!node.challenge) continue
    const bucket = CARD_TYPE_TO_BUCKET[node.challenge.type] ?? SubjectBucket.Other
    bucketCounts[bucket] = (bucketCounts[bucket] ?? 0) + 1
    totalChallenges++
  }

  // 60% reading/reviewing nodes, 40% giving feedback
  const readingMinutes = Math.round(durationMinutes * 0.6)
  const feedbackMinutes = durationMinutes - readingMinutes

  if (totalChallenges === 0) {
    // All time is Language Arts (reading/comprehension of adventure text)
    if (readingMinutes > 0) {
      promises.push(
        addDoc(hoursCollection(familyId), {
          childId,
          date: today,
          minutes: readingMinutes,
          subjectBucket: SubjectBucket.LanguageArts,
          notes: `Playtested adventure — read ${Object.keys(adventure.nodes).length} scenes aloud`,
        }),
      )
    }
  } else {
    // Split reading time by challenge types
    for (const [bucket, count] of Object.entries(bucketCounts)) {
      const minutes = Math.round((count / totalChallenges) * readingMinutes)
      if (minutes <= 0) continue
      promises.push(
        addDoc(hoursCollection(familyId), {
          childId,
          date: today,
          minutes,
          subjectBucket: bucket as SubjectBucket,
          notes: `Playtested adventure — read ${count} ${bucket.toLowerCase()} challenges`,
        }),
      )
    }

    // Narrative nodes without challenges → Language Arts
    const narrativeNodes = Object.values(adventure.nodes).filter((n) => !n.challenge).length
    if (narrativeNodes > 0) {
      const narrativeMinutes = Math.round(
        (narrativeNodes / Object.keys(adventure.nodes).length) * readingMinutes,
      )
      if (narrativeMinutes > 0) {
        promises.push(
          addDoc(hoursCollection(familyId), {
            childId,
            date: today,
            minutes: narrativeMinutes,
            subjectBucket: SubjectBucket.LanguageArts,
            notes: `Playtested adventure — read ${narrativeNodes} narrative scenes`,
          }),
        )
      }
    }
  }

  // Feedback time = Language Arts
  if (feedbackMinutes > 0) {
    promises.push(
      addDoc(hoursCollection(familyId), {
        childId,
        date: today,
        minutes: feedbackMinutes,
        subjectBucket: SubjectBucket.LanguageArts,
        notes: `Playtested adventure — feedback & critical thinking`,
      }),
    )
  }

  // Extra speech time for audio feedback
  if (hasAudioFeedback) {
    const speechMinutes = Math.max(Math.round(durationMinutes * 0.1), 1)
    promises.push(
      addDoc(hoursCollection(familyId), {
        childId,
        date: today,
        minutes: speechMinutes,
        subjectBucket: SubjectBucket.LanguageArts,
        notes: `Playtested adventure — verbal feedback (speech practice)`,
      }),
    )
  }

  await Promise.all(promises)
}

// ── Create artifact for completed adventure ───────────────────────

export async function createAdventureArtifact(
  familyId: string,
  childId: string,
  adventure: AdventureTree,
  theme: string,
  pathTaken: string[],
): Promise<string> {
  const endNode = adventure.nodes[pathTaken[pathTaken.length - 1]]
  const endingDesc = endNode?.isEnding
    ? endNode.endingType === 'victory'
      ? 'reached a victorious ending'
      : 'completed the story'
    : 'explored the adventure'

  const artifactDoc = await addDoc(artifactsCollection(familyId), {
    childId,
    title: `${theme} Adventure`,
    type: 'Note' as const,
    content: `${theme} Adventure — A choose-your-adventure story! ${adventure.totalNodes} scenes, ${adventure.totalEndings} endings. The family visited ${pathTaken.length} scenes and ${endingDesc}.`,
    createdAt: new Date().toISOString(),
    tags: {
      engineStage: 'Build' as const,
      domain: 'creative',
      subjectBucket: SubjectBucket.LanguageArts,
      location: 'Home' as const,
    },
  })
  return artifactDoc.id
}

// ── Record adventure play session ─────────────────────────────────

export async function recordAdventurePlaySession(
  familyId: string,
  gameId: string,
  players: string[],
  durationMinutes: number,
  pathTaken: string[],
  choicesMade: Array<{ nodeId: string; choiceId: string }>,
  challengeResults: Array<{ nodeId: string; passed: boolean }>,
): Promise<void> {
  const gameRef = doc(storyGamesCollection(familyId), gameId)
  await updateDoc(gameRef, {
    status: WorkshopStatus.Played,
    updatedAt: new Date().toISOString(),
    playSessions: arrayUnion({
      playedAt: new Date().toISOString(),
      players,
      durationMinutes,
      pathTaken,
      choicesMade,
      challengeResults,
    }),
  })
}

// ── Record play session on the game document ──────────────────────

export async function recordPlaySession(
  familyId: string,
  gameId: string,
  players: string[],
  winner: string | undefined,
  durationMinutes: number,
  cardsEncountered: string[],
): Promise<void> {
  const gameRef = doc(storyGamesCollection(familyId), gameId)
  await updateDoc(gameRef, {
    status: WorkshopStatus.Played,
    updatedAt: new Date().toISOString(),
    playSessions: arrayUnion({
      playedAt: new Date().toISOString(),
      players,
      winner,
      durationMinutes,
      cardsEncountered,
    }),
  })
}
