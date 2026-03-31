import { useCallback, useRef, useState } from 'react'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { addDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'

import SectionCard from '../../components/SectionCard'
import { artifactsCollection } from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import type { Child, DayLog } from '../../core/types'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'

const questionTypeEmoji: Record<string, string> = {
  comprehension: '\u{1F50D}',  // What happened?
  application: '\u{1F30E}',    // In your life?
  connection: '\u{1F517}',     // Reminds you of?
  opinion: '\u{1F4AD}',        // What do you think?
  prediction: '\u{1F52E}',     // What happens next?
}

interface KidChapterResponseProps {
  dayLog: DayLog
  child: Child
  familyId: string
  persistDayLogImmediate: (updated: DayLog) => void
}

export default function KidChapterResponse({
  dayLog,
  child,
  familyId,
  persistDayLogImmediate,
}: KidChapterResponseProps) {
  const [isRecordingChapter, setIsRecordingChapter] = useState(false)
  const [chapterAudioUrl, setChapterAudioUrl] = useState<string | null>(null)
  const [chapterAudioBlob, setChapterAudioBlob] = useState<Blob | null>(null)
  const [savingChapter, setSavingChapter] = useState(false)
  const chapterRecorderRef = useRef<MediaRecorder | null>(null)

  const startChapterRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        setChapterAudioBlob(blob)
        setChapterAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
      }
      recorder.start()
      chapterRecorderRef.current = recorder
      setIsRecordingChapter(true)
    } catch (err) {
      console.error('Mic access failed:', err)
    }
  }, [])

  const stopChapterRecording = useCallback(() => {
    chapterRecorderRef.current?.stop()
    setIsRecordingChapter(false)
  }, [])

  const handleSaveChapterResponse = useCallback(async () => {
    if (!dayLog?.chapterQuestion || !child.id) return
    setSavingChapter(true)
    try {
      let mediaUrl: string | undefined
      if (chapterAudioBlob) {
        const filename = `chapter_response_${Date.now()}.webm`
        const storageRef = ref(storage, `families/${familyId}/artifacts/${filename}`)
        await uploadBytes(storageRef, chapterAudioBlob)
        mediaUrl = await getDownloadURL(storageRef)
      }

      await addDoc(artifactsCollection(familyId), {
        childId: child.id,
        type: EvidenceType.Audio,
        tags: {
          engineStage: EngineStage.Reflect,
          subjectBucket: SubjectBucket.Reading,
          domain: 'reading',
          location: 'home',
        },
        title: `${dayLog.chapterQuestion.book} — ${dayLog.chapterQuestion.chapter}`,
        content: `Q: ${dayLog.chapterQuestion.question}`,
        ...(mediaUrl ? { mediaUrl } : {}),
        createdAt: new Date().toISOString(),
      })

      persistDayLogImmediate({
        ...dayLog,
        chapterQuestion: { ...dayLog.chapterQuestion, responded: true, responseUrl: mediaUrl },
      })
    } catch (err) {
      console.error('Chapter response save failed:', err)
    }
    setSavingChapter(false)
  }, [dayLog, child.id, familyId, chapterAudioBlob, persistDayLogImmediate])

  if (!dayLog.chapterQuestion) return null

  if (dayLog.chapterQuestion.responded) {
    return (
      <SectionCard title={`\u{1F4D6} ${dayLog.chapterQuestion.book}`}>
        <Stack spacing={1}>
          <Typography variant="subtitle2" color="text.secondary">
            {dayLog.chapterQuestion.chapter} — Responded ✓
          </Typography>
          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
            {dayLog.chapterQuestion.question}
          </Typography>
          {dayLog.chapterQuestion.responseUrl && (
            <audio src={dayLog.chapterQuestion.responseUrl} controls style={{ width: '100%' }} />
          )}
        </Stack>
      </SectionCard>
    )
  }

  return (
    <SectionCard title={`\u{1F4D6} ${dayLog.chapterQuestion.book}`}>
      <Stack spacing={2} sx={{ py: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {dayLog.chapterQuestion.chapter}
        </Typography>
        <Typography variant="body1" sx={{ fontStyle: 'italic', fontSize: '1.1rem' }}>
          {questionTypeEmoji[dayLog.chapterQuestion.questionType] ?? ''} {dayLog.chapterQuestion.question}
        </Typography>

        <Button
          variant="outlined"
          onClick={isRecordingChapter ? stopChapterRecording : startChapterRecording}
          color={isRecordingChapter ? 'error' : 'primary'}
          size="large"
        >
          {isRecordingChapter ? '\u23F9 Stop Recording' : '\u{1F3A4} Record Your Answer'}
        </Button>

        {chapterAudioUrl && (
          <Stack spacing={1}>
            <audio src={chapterAudioUrl} controls style={{ width: '100%' }} />
            <Button
              variant="contained"
              color="success"
              onClick={handleSaveChapterResponse}
              disabled={savingChapter}
              size="large"
            >
              {savingChapter ? 'Saving...' : '\u{1F48E} Save Response'}
            </Button>
          </Stack>
        )}
      </Stack>
    </SectionCard>
  )
}
