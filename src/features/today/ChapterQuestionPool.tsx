import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { addDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'

import SectionCard from '../../components/SectionCard'
import {
  artifactsCollection,
  chapterResponsesCollection,
} from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import { useAudioRecorder } from '../../core/hooks/useAudioRecorder'
import type {
  BookProgress,
  ChapterBook,
  ChapterQuestionPoolItem,
} from '../../core/types'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import { todayKey } from '../../core/utils/dateKey'

const questionTypeEmoji: Record<string, string> = {
  comprehension: '\u{1F50D}',
  application: '\u{1F30E}',
  connection: '\u{1F517}',
  opinion: '\u{1F4AD}',
  prediction: '\u{1F52E}',
}

interface ChapterQuestionPoolProps {
  book: ChapterBook | null
  bookProgress: BookProgress | null
  bookProgressLoading: boolean
  familyId: string
  childId: string
  weekFocus?: { theme?: string; virtue?: string; scriptureRef?: string } | null
  onChapterAnswered: (
    chapter: number,
    update: Partial<ChapterQuestionPoolItem>,
  ) => Promise<void>
}

export default function ChapterQuestionPool({
  book,
  bookProgress,
  bookProgressLoading,
  familyId,
  childId,
  weekFocus,
  onChapterAnswered,
}: ChapterQuestionPoolProps) {
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(
    new Set(),
  )
  const [recordingChapter, setRecordingChapter] = useState<number | null>(null)
  const [chapterBlobs, setChapterBlobs] = useState<Record<number, Blob>>({})
  const [chapterNotes, setChapterNotes] = useState<Record<number, string>>({})
  const [savingChapter, setSavingChapter] = useState<number | null>(null)

  const recorder = useAudioRecorder()

  // No book selected — render nothing
  if (!book) return null

  // Book selected but no progress doc yet (pool generation in flight)
  if (bookProgressLoading || !bookProgress) {
    return (
      <SectionCard title={`\u{1F4D6} ${book.title}`}>
        <Stack spacing={1} alignItems="center" sx={{ py: 2 }}>
          <CircularProgress size={24} />
          <Typography variant="body2" color="text.secondary">
            Preparing chapter questions...
          </Typography>
        </Stack>
      </SectionCard>
    )
  }

  const pool = bookProgress.questionPool
  const unanswered = pool.filter((item) => !item.answered)
  const answered = pool.filter((item) => item.answered)

  // All chapters answered — celebration state
  if (unanswered.length === 0) {
    return (
      <SectionCard title={`\u{1F4D6} ${book.title}`}>
        <Stack spacing={2} alignItems="center" sx={{ py: 2 }}>
          <Typography variant="h6">{'\u{1F389}'} You finished {book.title}!</Typography>
          <Typography variant="body2" color="text.secondary">
            All {pool.length} chapters discussed.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            href="/planner"
          >
            Pick another book
          </Button>
        </Stack>
      </SectionCard>
    )
  }

  // Auto-select lowest unanswered if nothing selected
  const effectiveSelected =
    selectedChapters.size > 0
      ? selectedChapters
      : new Set([unanswered[0].chapter])

  const toggleChapter = (chapter: number) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev)
      if (next.has(chapter)) {
        next.delete(chapter)
      } else {
        next.add(chapter)
      }
      return next
    })
  }

  const selectedItems = pool.filter(
    (item) => !item.answered && effectiveSelected.has(item.chapter),
  )

  const handleStartRecording = async (chapter: number) => {
    if (recorder.isRecording) {
      await recorder.stopRecording()
    }
    recorder.clearRecording()
    setRecordingChapter(chapter)
    await recorder.startRecording()
  }

  const handleStopRecording = async (chapter: number) => {
    const blob = await recorder.stopRecording()
    if (blob) {
      setChapterBlobs((prev) => ({ ...prev, [chapter]: blob }))
    }
    setRecordingChapter(null)
  }

  const handleSaveResponse = async (item: ChapterQuestionPoolItem) => {
    setSavingChapter(item.chapter)
    try {
      let audioUrl: string | undefined
      const blob = chapterBlobs[item.chapter]

      // Upload audio if recorded
      if (blob) {
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
        const storageRef = ref(
          storage,
          `families/${familyId}/chapterResponses/${childId}/${bookProgress.bookId}/ch${item.chapter}_${Date.now()}.${ext}`,
        )
        await uploadBytes(storageRef, blob)
        audioUrl = await getDownloadURL(storageRef)
      }

      // Create artifact
      const artifactRef = await addDoc(artifactsCollection(familyId), {
        childId,
        type: EvidenceType.Audio,
        tags: {
          engineStage: EngineStage.Reflect,
          subjectBucket: SubjectBucket.Reading,
          domain: 'reading',
          location: 'home',
        },
        title: `${book.title} \u2014 Ch ${item.chapter}${item.chapterTitle ? `: ${item.chapterTitle}` : ''}`,
        content: `Q: ${item.question}`,
        ...(audioUrl ? { mediaUrl: audioUrl } : {}),
        createdAt: new Date().toISOString(),
      })

      // Create ChapterResponse doc
      const today = todayKey()
      await addDoc(chapterResponsesCollection(familyId), {
        childId,
        date: today,
        bookTitle: book.title,
        chapter: `Ch ${item.chapter}${item.chapterTitle ? `: ${item.chapterTitle}` : ''}`,
        questionType: item.questionType,
        question: item.question,
        audioUrl: audioUrl ?? null,
        weekTheme: weekFocus?.theme ?? '',
        virtue: weekFocus?.virtue ?? '',
        scripture: weekFocus?.scriptureRef ?? '',
        createdAt: new Date().toISOString(),
      })

      // Update bookProgress pool entry
      const note = chapterNotes[item.chapter]
      await onChapterAnswered(item.chapter, {
        answered: true,
        answeredDate: today,
        audioUrl,
        responseNote: note || undefined,
        artifactId: artifactRef.id,
      })

      // Clear local state for this chapter
      setChapterBlobs((prev) => {
        const next = { ...prev }
        delete next[item.chapter]
        return next
      })
      setChapterNotes((prev) => {
        const next = { ...prev }
        delete next[item.chapter]
        return next
      })
      setSelectedChapters((prev) => {
        const next = new Set(prev)
        next.delete(item.chapter)
        return next
      })
    } catch (err) {
      console.error('Chapter response save failed:', err)
    }
    setSavingChapter(null)
  }

  return (
    <SectionCard title={`\u{1F4D6} ${book.title}`}>
      <Stack spacing={2}>
        {/* Progress chip */}
        <Chip
          label={`${answered.length}/${pool.length} chapters`}
          size="small"
          color={answered.length > 0 ? 'primary' : 'default'}
          variant="outlined"
          sx={{ alignSelf: 'flex-start' }}
        />

        {/* Chapter picker — horizontal scrollable chips */}
        <Box
          sx={{
            display: 'flex',
            gap: 0.75,
            overflowX: 'auto',
            pb: 0.5,
            '&::-webkit-scrollbar': { height: 4 },
          }}
        >
          {unanswered.map((item) => (
            <Chip
              key={item.chapter}
              label={
                item.chapterTitle
                  ? `Ch ${item.chapter}: ${item.chapterTitle}`
                  : `Ch ${item.chapter}`
              }
              size="small"
              color={effectiveSelected.has(item.chapter) ? 'primary' : 'default'}
              variant={
                effectiveSelected.has(item.chapter) ? 'filled' : 'outlined'
              }
              onClick={() => toggleChapter(item.chapter)}
              sx={{ flexShrink: 0 }}
            />
          ))}
        </Box>

        {/* Stacked question cards for selected chapters */}
        {selectedItems.map((item) => {
          const emoji = questionTypeEmoji[item.questionType] ?? '\u2753'
          const hasBlob = !!chapterBlobs[item.chapter]
          const isRecordingThis = recordingChapter === item.chapter
          const isSavingThis = savingChapter === item.chapter

          return (
            <Box
              key={item.chapter}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Stack spacing={1.5}>
                <Typography variant="subtitle2" color="text.secondary">
                  Ch {item.chapter}
                  {item.chapterTitle ? `: ${item.chapterTitle}` : ''} {emoji}
                </Typography>

                <Typography
                  variant="body1"
                  sx={{ fontStyle: 'italic', fontSize: '1.05rem' }}
                >
                  {item.question}
                </Typography>

                {/* Record button */}
                <Button
                  variant="outlined"
                  onClick={
                    isRecordingThis
                      ? () => handleStopRecording(item.chapter)
                      : () => handleStartRecording(item.chapter)
                  }
                  color={isRecordingThis ? 'error' : 'primary'}
                  disabled={
                    (recorder.isRecording && !isRecordingThis) || isSavingThis
                  }
                >
                  {isRecordingThis
                    ? '\u23F9 Stop Recording'
                    : '\u{1F3A4} Record Your Answer'}
                </Button>

                {/* Preview + save */}
                {(hasBlob || recorder.recordingUrl) && recordingChapter !== item.chapter && hasBlob && (
                  <Stack spacing={1}>
                    <audio
                      src={URL.createObjectURL(chapterBlobs[item.chapter])}
                      controls
                      style={{ width: '100%' }}
                    />
                    <TextField
                      label="Note (optional)"
                      placeholder="What did you notice about the response?"
                      size="small"
                      multiline
                      rows={2}
                      value={chapterNotes[item.chapter] ?? ''}
                      onChange={(e) =>
                        setChapterNotes((prev) => ({
                          ...prev,
                          [item.chapter]: e.target.value,
                        }))
                      }
                      disabled={isSavingThis}
                    />
                    <Button
                      variant="contained"
                      color="success"
                      onClick={() => handleSaveResponse(item)}
                      disabled={isSavingThis}
                    >
                      {isSavingThis
                        ? 'Saving...'
                        : '\u{1F48E} Save Response'}
                    </Button>
                  </Stack>
                )}
              </Stack>
            </Box>
          )
        })}
      </Stack>
    </SectionCard>
  )
}
