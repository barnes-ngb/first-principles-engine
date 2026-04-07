import { useCallback, useRef, useState } from 'react'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import { addDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'

import SectionCard from '../../components/SectionCard'
import { artifactsCollection } from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import type { Child, DayLog } from '../../core/types'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { addDiamondEvent } from '../../core/xp/addDiamondEvent'
import { DIAMOND_EVENTS } from '../../core/types'

interface KidTeachBackProps {
  child: Child
  familyId: string
  today: string
  dayLog: DayLog
  persistDayLogImmediate: (updated: DayLog) => void
}

export default function KidTeachBack({
  child,
  familyId,
  today,
  dayLog,
  persistDayLogImmediate,
}: KidTeachBackProps) {
  const [showTeachBack, setShowTeachBack] = useState(false)
  const [teachSubject, setTeachSubject] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach((t) => t.stop())
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
    } catch (err) {
      console.error('Mic access failed:', err)
    }
  }, [])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }, [])

  const handleSaveTeachBack = useCallback(async () => {
    if (!teachSubject || !child.id || !familyId) return
    setSaving(true)
    try {
      let mediaUrl: string | undefined
      if (audioBlob) {
        const filename = `teachback_${Date.now()}.webm`
        const storageRef = ref(storage, `families/${familyId}/artifacts/${filename}`)
        await uploadBytes(storageRef, audioBlob)
        mediaUrl = await getDownloadURL(storageRef)
      }

      await addDoc(artifactsCollection(familyId), {
        childId: child.id,
        title: `Teach-back: ${teachSubject}`,
        type: EvidenceType.Audio,
        dayLogId: today,
        tags: {
          engineStage: EngineStage.Explain,
          subjectBucket: (teachSubject as SubjectBucket) ?? SubjectBucket.Other,
          domain: 'speech',
          location: 'home',
        },
        ...(mediaUrl ? { mediaUrl } : {}),
        notes: `Lincoln taught London about ${teachSubject}`,
        createdAt: new Date().toISOString(),
      })

      // Award 15 XP for teach-back
      void addXpEvent(
        familyId,
        child.id,
        'MANUAL_AWARD',
        15,
        `teachback_${today}-xp`,
        { reason: `Teach-back: ${teachSubject}` },
      ).catch((err) => console.error('[XP] Teach-back award failed:', err))

      // Award 5 diamonds for teach-back
      void addDiamondEvent({
        familyId,
        childId: child.id,
        amount: 5,
        type: DIAMOND_EVENTS.TEACH_BACK,
        reason: `Teach-back: ${teachSubject}`,
        dedupKey: `teachback_${today}-diamond`,
      }).catch((err) => console.error('[Diamond] Teach-back award failed:', err))

      persistDayLogImmediate({ ...dayLog, teachBackDone: true })
      setShowTeachBack(false)
    } catch (err) {
      console.error('Teach-back save failed:', err)
    }
    setSaving(false)
  }, [teachSubject, child.id, familyId, audioBlob, today, dayLog, persistDayLogImmediate])

  return (
    <SectionCard title="⛏️ I Taught London Something!">
      <Stack spacing={2} alignItems="center" sx={{ py: 1 }}>
        <Typography variant="body1" sx={{ textAlign: 'center' }}>
          Did you explain something to London today? Tap to mine a knowledge diamond!
        </Typography>

        {!showTeachBack ? (
          <Button
            variant="contained"
            color="success"
            size="large"
            onClick={() => setShowTeachBack(true)}
            sx={{ fontSize: '1.1rem', py: 1.5, px: 4 }}
          >
            💎 I Taught London!
          </Button>
        ) : (
          <Stack spacing={2} sx={{ width: '100%' }}>
            {/* Subject picker — single tap chips */}
            <Typography variant="subtitle2">What was it about?</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {['Reading', 'Math', 'Science', 'Other'].map((subject) => (
                <Chip
                  key={subject}
                  label={subject}
                  onClick={() => setTeachSubject(subject)}
                  color={teachSubject === subject ? 'primary' : 'default'}
                  variant={teachSubject === subject ? 'filled' : 'outlined'}
                  sx={{ fontSize: '1rem', py: 2.5, px: 1 }}
                />
              ))}
            </Stack>

            {/* Audio capture — Lincoln's primary input */}
            <Button
              variant="outlined"
              startIcon={isRecording ? <StopIcon /> : <MicIcon />}
              onClick={isRecording ? stopRecording : startRecording}
              color={isRecording ? 'error' : 'primary'}
              size="large"
            >
              {isRecording ? 'Stop Recording' : '🎤 Say What You Taught'}
            </Button>
            {audioUrl && (
              <Stack direction="row" spacing={1} alignItems="center">
                <audio src={audioUrl} controls style={{ flex: 1 }} />
                <Chip label="✓ Recorded" color="success" size="small" />
              </Stack>
            )}

            {/* Save button */}
            <Button
              variant="contained"
              color="success"
              disabled={!teachSubject || saving}
              onClick={handleSaveTeachBack}
              size="large"
            >
              {saving ? 'Saving...' : '💎 Mine This Diamond!'}
            </Button>
          </Stack>
        )}
      </Stack>
    </SectionCard>
  )
}
