import { addDoc } from 'firebase/firestore'
import { hoursCollection, artifactsCollection, storyGamesCollection } from '../../core/firebase/firestore'
import { doc, updateDoc, arrayUnion } from 'firebase/firestore'
import type { ChallengeCard, GeneratedGame } from '../../core/types'
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
