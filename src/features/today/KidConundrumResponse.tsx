import { useCallback, useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import StopIcon from '@mui/icons-material/Stop'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import { addDoc, updateDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'

import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
import { artifactsCollection } from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import { generateFilename, uploadArtifactFile } from '../../core/firebase/upload'
import { useTTS } from '../../core/hooks/useTTS'
import type { Child } from '../../core/types'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'
import { addXpEvent } from '../../core/xp/addXpEvent'
import { addDiamondEvent } from '../../core/xp/addDiamondEvent'
import { DIAMOND_EVENTS } from '../../core/types'

interface KidConundrumResponseProps {
  conundrum: {
    title: string
    scenario?: string
    question: string
    quickPicks?: string[]
    lincolnPrompt: string
    londonPrompt: string
    londonDrawingPrompt?: string
  }
  isLincoln: boolean
  child: Child
  familyId: string
}

export default function KidConundrumResponse({
  conundrum,
  isLincoln,
  child,
  familyId,
}: KidConundrumResponseProps) {
  // TTS for reading the conundrum aloud
  const { speak, cancel, isSpeaking, isSupported: ttsSupported } = useTTS({ rate: 0.85 })

  // Lincoln audio recording state
  const [isRecordingConundrum, setIsRecordingConundrum] = useState(false)
  const [conundrumAudioUrl, setConundrumAudioUrl] = useState<string | null>(null)
  const [conundrumAudioBlob, setConundrumAudioBlob] = useState<Blob | null>(null)
  const [savingConundrum, setSavingConundrum] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [conundrumSaved, setConundrumSaved] = useState(false)
  const conundrumRecorderRef = useRef<MediaRecorder | null>(null)

  // Quick pick selection
  const [selectedPick, setSelectedPick] = useState<string | null>(null)

  // London photo capture state
  const [showConundrumPhoto, setShowConundrumPhoto] = useState(false)
  const [conundrumPhotoSaved, setConundrumPhotoSaved] = useState(false)

  // Auto-read the conundrum when it first appears (kid view)
  const hasAutoRead = useRef(false)
  useEffect(() => {
    if (conundrum?.scenario && ttsSupported && !hasAutoRead.current) {
      hasAutoRead.current = true
      const timer = setTimeout(() => {
        speak(conundrum.scenario!)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [conundrum?.scenario, ttsSupported, speak])

  const startConundrumRecording = useCallback(async () => {
    setSaveError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        setConundrumAudioBlob(blob)
        setConundrumAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
      }
      recorder.start()
      conundrumRecorderRef.current = recorder
      setIsRecordingConundrum(true)
    } catch (err) {
      console.error('Mic access failed:', err)
    }
  }, [])

  const stopConundrumRecording = useCallback(() => {
    conundrumRecorderRef.current?.stop()
    setIsRecordingConundrum(false)
  }, [])

  const handleSaveConundrumResponse = useCallback(async () => {
    setSavingConundrum(true)
    try {
      let mediaUrl: string | undefined
      if (conundrumAudioBlob) {
        const filename = `conundrum_response_${Date.now()}.webm`
        const storageRef = ref(storage, `families/${familyId}/artifacts/${filename}`)
        await uploadBytes(storageRef, conundrumAudioBlob)
        mediaUrl = await getDownloadURL(storageRef)
      }

      const content = selectedPick
        ? `Q: ${conundrum.question}\nChoice: ${selectedPick}`
        : `Q: ${conundrum.question}`

      await addDoc(artifactsCollection(familyId), {
        childId: child.id,
        type: EvidenceType.Audio,
        tags: {
          engineStage: EngineStage.Wonder,
          subjectBucket: SubjectBucket.Other,
          domain: 'conundrum',
          location: 'home',
        },
        title: `Conundrum: ${conundrum.title}`,
        content,
        ...(mediaUrl ? { mediaUrl } : {}),
        createdAt: new Date().toISOString(),
      })

      // Award 5 XP for conundrum response
      const conundrumDate = new Date().toISOString().slice(0, 10)
      void addXpEvent(
        familyId, child.id, 'MANUAL_AWARD', 5, `conundrum_${conundrumDate}-xp`,
        { reason: `Conundrum: ${conundrum.title}` },
      ).catch((err) => console.error('[XP] Conundrum award failed:', err))

      // Award 5 diamonds for conundrum response
      void addDiamondEvent({
        familyId,
        childId: child.id,
        amount: 5,
        type: DIAMOND_EVENTS.CONUNDRUM_RESPONSE,
        reason: `Conundrum: ${conundrum.title}`,
        dedupKey: `conundrum_${conundrumDate}-diamond`,
      }).catch((err) => console.error('[Diamond] Conundrum award failed:', err))

      setConundrumSaved(true)
    } catch (err) {
      console.error('Conundrum response save failed:', err)
      setSaveError("Hmm, that didn't save. Check your connection and try again.")
    }
    setSavingConundrum(false)
  }, [conundrumAudioBlob, familyId, child.id, conundrum, selectedPick])

  const handleConundrumPhoto = useCallback(async (file: File) => {
    try {
      const filename = generateFilename('jpg')
      const docRef = await addDoc(artifactsCollection(familyId), {
        childId: child.id,
        type: EvidenceType.Photo,
        tags: {
          engineStage: EngineStage.Wonder,
          subjectBucket: SubjectBucket.Other,
          domain: 'conundrum',
          location: 'home',
        },
        title: `Conundrum Drawing: ${conundrum.title}`,
        content: conundrum.londonDrawingPrompt ?? conundrum.question,
        createdAt: new Date().toISOString(),
      })
      const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, file, filename)
      await updateDoc(docRef, { mediaUrl: downloadUrl })

      // Award 5 XP for conundrum drawing
      const conundrumDate = new Date().toISOString().slice(0, 10)
      void addXpEvent(
        familyId, child.id, 'MANUAL_AWARD', 5, `conundrum_${conundrumDate}-xp`,
        { reason: `Conundrum drawing: ${conundrum.title}` },
      ).catch((err) => console.error('[XP] Conundrum drawing award failed:', err))

      // Award 5 diamonds for conundrum drawing
      void addDiamondEvent({
        familyId,
        childId: child.id,
        amount: 5,
        type: DIAMOND_EVENTS.CONUNDRUM_DRAWING,
        reason: `Conundrum drawing: ${conundrum.title}`,
        dedupKey: `conundrum_${conundrumDate}-drawing-diamond`,
      }).catch((err) => console.error('[Diamond] Conundrum drawing award failed:', err))

      setConundrumPhotoSaved(true)
      setShowConundrumPhoto(false)
    } catch (err) {
      console.error('Conundrum photo save failed:', err)
      setSaveError("Hmm, that didn't save. Check your connection and try again.")
    }
  }, [familyId, child.id, conundrum])

  // Lincoln: audio + quick picks response
  if (isLincoln) {
    if (conundrumSaved) {
      return (
        <SectionCard title={`\u{1F5FA}\u{FE0F} ${conundrum.title}`}>
          <Typography variant="body2" color="success.main">
            Responded {'\u2713'}
          </Typography>
        </SectionCard>
      )
    }

    return (
      <SectionCard title={`\u{1F5FA}\u{FE0F} ${conundrum.title}`}>
        <Stack spacing={2} sx={{ py: 1 }}>
          {saveError && (
            <Alert
              severity="error"
              onClose={() => setSaveError(null)}
            >
              {saveError}
            </Alert>
          )}
          {/* Scenario text */}
          {conundrum.scenario && (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>
              {conundrum.scenario}
            </Typography>
          )}

          {/* Listen / Stop button */}
          {ttsSupported && conundrum.scenario && (
            <Button
              startIcon={isSpeaking ? <StopIcon /> : <VolumeUpIcon />}
              onClick={() => isSpeaking ? cancel() : speak(conundrum.scenario!)}
              variant="outlined"
              size="small"
              color={isSpeaking ? 'error' : 'primary'}
              sx={{ alignSelf: 'flex-start' }}
            >
              {isSpeaking ? 'Stop' : 'Listen to the story'}
            </Button>
          )}

          {/* Main question */}
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {conundrum.question}
          </Typography>

          {/* Quick pick chips */}
          {conundrum.quickPicks && conundrum.quickPicks.length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {conundrum.quickPicks.map((pick) => (
                <Chip
                  key={pick}
                  label={pick}
                  onClick={() => setSelectedPick(selectedPick === pick ? null : pick)}
                  color={selectedPick === pick ? 'primary' : 'default'}
                  variant={selectedPick === pick ? 'filled' : 'outlined'}
                  sx={{ fontSize: '0.9rem', py: 2.5 }}
                />
              ))}
            </Stack>
          )}

          {/* Lincoln's deeper prompt */}
          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
            {conundrum.lincolnPrompt}
          </Typography>

          {/* Audio record button */}
          <Button
            variant="outlined"
            onClick={isRecordingConundrum ? stopConundrumRecording : startConundrumRecording}
            color={isRecordingConundrum ? 'error' : 'primary'}
            size="large"
          >
            {isRecordingConundrum ? '\u23F9 Stop Recording' : '\u{1F3A4} Tell me what you think'}
          </Button>
          {conundrumAudioUrl && (
            <Stack spacing={1}>
              <audio src={conundrumAudioUrl} controls style={{ width: '100%' }} />
              <Button
                variant="contained"
                color="success"
                onClick={handleSaveConundrumResponse}
                disabled={savingConundrum}
                size="large"
              >
                {savingConundrum ? 'Saving...' : '\u{1F48E} Save My Answer'}
              </Button>
            </Stack>
          )}

          {/* Allow saving just a quick pick without audio */}
          {selectedPick && !conundrumAudioUrl && (
            <Button
              variant="contained"
              color="success"
              onClick={handleSaveConundrumResponse}
              disabled={savingConundrum}
              size="small"
            >
              {savingConundrum ? 'Saving...' : `\u{1F48E} Save: "${selectedPick}"`}
            </Button>
          )}
        </Stack>
      </SectionCard>
    )
  }

  // London: drawing photo + listen button
  if (conundrumPhotoSaved) {
    return (
      <SectionCard title={`\u{1F3A8} Drawing Quest`}>
        <Typography variant="body2" color="success.main">
          Drawing saved {'\u2713'}
        </Typography>
      </SectionCard>
    )
  }

  return (
    <SectionCard title={`\u{1F3A8} ${conundrum.title}`}>
      <Stack spacing={2} sx={{ py: 1 }}>
        {saveError && (
          <Alert
            severity="error"
            onClose={() => setSaveError(null)}
          >
            {saveError}
          </Alert>
        )}
        {/* Scenario text for London too */}
        {conundrum.scenario && (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>
            {conundrum.scenario}
          </Typography>
        )}

        {/* Listen button */}
        {ttsSupported && conundrum.scenario && (
          <Button
            startIcon={isSpeaking ? <StopIcon /> : <VolumeUpIcon />}
            onClick={() => isSpeaking ? cancel() : speak(conundrum.scenario!)}
            variant="outlined"
            size="small"
            color={isSpeaking ? 'error' : 'primary'}
            sx={{ alignSelf: 'flex-start' }}
          >
            {isSpeaking ? 'Stop' : 'Listen to the story'}
          </Button>
        )}

        {/* Question */}
        <Typography variant="body1" sx={{ fontWeight: 600 }}>
          {conundrum.question}
        </Typography>

        {/* Quick pick chips for London too */}
        {conundrum.quickPicks && conundrum.quickPicks.length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {conundrum.quickPicks.map((pick) => (
              <Chip
                key={pick}
                label={pick}
                onClick={() => setSelectedPick(selectedPick === pick ? null : pick)}
                color={selectedPick === pick ? 'primary' : 'default'}
                variant={selectedPick === pick ? 'filled' : 'outlined'}
                sx={{ fontSize: '0.9rem', py: 2.5 }}
              />
            ))}
          </Stack>
        )}

        {/* London prompt */}
        <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
          {conundrum.londonPrompt}
        </Typography>

        {/* Drawing prompt and capture */}
        {conundrum.londonDrawingPrompt && (
          <>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              {conundrum.londonDrawingPrompt}
            </Typography>
            {showConundrumPhoto ? (
              <PhotoCapture onCapture={handleConundrumPhoto} />
            ) : (
              <Button
                variant="contained"
                size="large"
                onClick={() => setShowConundrumPhoto(true)}
              >
                {'\u{1F4F8}'} Take a Photo of Your Drawing
              </Button>
            )}
          </>
        )}
      </Stack>
    </SectionCard>
  )
}
