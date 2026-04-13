import { useCallback, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import { addDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'

import {
  artifactsCollection,
  chapterResponsesCollection,
} from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import type {
  BookProgress,
  ChapterBook,
  ChapterQuestionPoolItem,
  DayLog,
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

interface KidChapterPoolProps {
  book: ChapterBook
  bookProgress: BookProgress
  familyId: string
  childId: string
  dayLog: DayLog
  weekFocus?: { theme?: string; virtue?: string; scriptureRef?: string } | null
  onChapterAnswered: (
    chapter: number,
    update: Partial<ChapterQuestionPoolItem>,
  ) => Promise<void>
}

export default function KidChapterPool({
  book,
  bookProgress,
  familyId,
  childId,
  dayLog,
  weekFocus,
  onChapterAnswered,
}: KidChapterPoolProps) {
  const [recordingChapter, setRecordingChapter] = useState<number | null>(null)
  const [chapterBlobs, setChapterBlobs] = useState<Record<number, Blob>>({})
  const [chapterAudioUrls, setChapterAudioUrls] = useState<
    Record<number, string>
  >({})
  const [savingChapter, setSavingChapter] = useState<number | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  const mcFont = '"Press Start 2P", monospace'

  // All hooks must be called before early returns
  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    setRecordingChapter(null)
  }, [])

  const handleSaveResponse = useCallback(async (item: ChapterQuestionPoolItem) => {
    const blob = chapterBlobs[item.chapter]
    if (!blob) return

    setSavingChapter(item.chapter)
    try {
      // Upload audio
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
      const timestamp = Date.now()
      const storageRef = ref(
        storage,
        `families/${familyId}/chapterResponses/${childId}/${bookProgress.bookId}/ch${item.chapter}_${timestamp}.${ext}`,
      )
      await uploadBytes(storageRef, blob)
      const audioUrl = await getDownloadURL(storageRef)

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
        mediaUrls: [audioUrl],
        createdAt: new Date().toISOString(),
      })

      // Create ChapterResponse doc
      const today = todayKey()
      await addDoc(chapterResponsesCollection(familyId), {
        childId,
        date: today,
        bookId: bookProgress.bookId,
        bookTitle: book.title,
        chapter: `Ch ${item.chapter}${item.chapterTitle ? `: ${item.chapterTitle}` : ''}`,
        questionType: item.questionType,
        question: item.question,
        audioUrl,
        weekTheme: weekFocus?.theme ?? '',
        virtue: weekFocus?.virtue ?? '',
        scripture: weekFocus?.scriptureRef ?? '',
        createdAt: new Date().toISOString(),
      })

      // Mark answered globally
      await onChapterAnswered(item.chapter, {
        answered: true,
        answeredDate: today,
        audioUrl,
        artifactId: artifactRef.id,
      })

      // Clear local state
      setChapterBlobs((prev) => {
        const next = { ...prev }
        delete next[item.chapter]
        return next
      })
      setChapterAudioUrls((prev) => {
        const next = { ...prev }
        delete next[item.chapter]
        return next
      })
    } catch (err) {
      console.error('Chapter response save failed:', err)
    }
    setSavingChapter(null)
  }, [chapterBlobs, familyId, childId, bookProgress.bookId, book.title, weekFocus, onChapterAnswered])

  // Determine which chapters to show
  const pool = bookProgress.questionPool
  const unanswered = pool.filter((item) => !item.answered)

  // Use Shelly's picks from dayLog, fall back to lowest unanswered
  const todaysChapters = dayLog.todaysSelectedChapters
  const chaptersToShow = useMemo(() => {
    if (todaysChapters && todaysChapters.length > 0) {
      return pool
        .filter(
          (item) => !item.answered && todaysChapters.includes(item.chapter),
        )
        .sort((a, b) => a.chapter - b.chapter)
    } else if (unanswered.length > 0) {
      return [unanswered[0]]
    }
    return []
  }, [pool, todaysChapters, unanswered])

  // Nothing to show
  if (chaptersToShow.length === 0) return null

  const startRecording = async (chapter: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        setChapterBlobs((prev) => ({ ...prev, [chapter]: blob }))
        setChapterAudioUrls((prev) => ({
          ...prev,
          [chapter]: URL.createObjectURL(blob),
        }))
        stream.getTracks().forEach((t) => t.stop())
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecordingChapter(chapter)
    } catch (err) {
      console.error('Mic access failed:', err)
    }
  }

  return (
    <Box
      sx={{
        bgcolor: 'rgba(0,0,0,0.85)',
        border: '2px solid #5BFCEE',
        borderRadius: 2,
        p: 2,
      }}
    >
      <Typography
        sx={{
          fontFamily: mcFont,
          fontSize: '0.55rem',
          color: '#5BFCEE',
          mb: 2,
        }}
      >
        {'\u{1F4D6}'} {book.title}
      </Typography>
      <Stack spacing={2}>
        {chaptersToShow.map((item) => {
          const emoji = questionTypeEmoji[item.questionType] ?? '\u2753'
          const isRecordingThis = recordingChapter === item.chapter
          const hasBlob = !!chapterBlobs[item.chapter]
          const previewUrl = chapterAudioUrls[item.chapter]
          const isSavingThis = savingChapter === item.chapter

          return (
            <Box
              key={item.chapter}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid #FCDB5B',
                bgcolor: 'rgba(0,0,0,0.6)',
              }}
            >
              <Stack spacing={1.5}>
                {/* Chapter title */}
                <Typography
                  sx={{
                    fontFamily: mcFont,
                    fontSize: '0.55rem',
                    color: '#FCDB5B',
                    letterSpacing: 1,
                  }}
                >
                  Ch {item.chapter}
                  {item.chapterTitle ? `: ${item.chapterTitle}` : ''} {emoji}
                </Typography>

                {/* Question */}
                <Typography
                  sx={{
                    fontFamily: mcFont,
                    fontSize: '0.5rem',
                    color: '#FFFFFF',
                    lineHeight: 1.8,
                  }}
                >
                  {item.question}
                </Typography>

                {/* Record button */}
                {!hasBlob && (
                  <Button
                    variant="contained"
                    startIcon={isRecordingThis ? <StopIcon /> : <MicIcon />}
                    onClick={
                      isRecordingThis
                        ? stopRecording
                        : () => startRecording(item.chapter)
                    }
                    disabled={
                      recordingChapter !== null && !isRecordingThis
                    }
                    sx={{
                      fontFamily: mcFont,
                      fontSize: '0.45rem',
                      bgcolor: isRecordingThis ? '#ff4444' : '#5BFCEE',
                      color: isRecordingThis ? '#fff' : '#000',
                      '&:hover': {
                        bgcolor: isRecordingThis ? '#cc0000' : '#4DE0D2',
                      },
                      py: 1.5,
                    }}
                  >
                    {isRecordingThis
                      ? 'Stop Recording'
                      : 'Record Your Answer'}
                  </Button>
                )}

                {/* Preview + save */}
                {hasBlob && previewUrl && (
                  <Stack spacing={1.5}>
                    <audio
                      src={previewUrl}
                      controls
                      style={{ width: '100%' }}
                    />
                    <Stack direction="row" spacing={1}>
                      <Button
                        variant="contained"
                        onClick={() => handleSaveResponse(item)}
                        disabled={isSavingThis}
                        sx={{
                          flex: 1,
                          fontFamily: mcFont,
                          fontSize: '0.5rem',
                          bgcolor: '#4CAF50',
                          color: '#fff',
                          '&:hover': { bgcolor: '#388E3C' },
                          py: 1.5,
                        }}
                      >
                        {isSavingThis
                          ? 'Saving...'
                          : "\u{1F48E} I'm done!"}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setChapterBlobs((prev) => {
                            const next = { ...prev }
                            delete next[item.chapter]
                            return next
                          })
                          setChapterAudioUrls((prev) => {
                            const next = { ...prev }
                            delete next[item.chapter]
                            return next
                          })
                        }}
                        disabled={isSavingThis}
                        sx={{
                          fontFamily: mcFont,
                          fontSize: '0.4rem',
                          borderColor: '#FCDB5B',
                          color: '#FCDB5B',
                        }}
                      >
                        Redo
                      </Button>
                    </Stack>
                  </Stack>
                )}
              </Stack>
            </Box>
          )
        })}
      </Stack>
    </Box>
  )
}
