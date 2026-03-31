import { useCallback, useRef, useState } from 'react'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { addDoc, updateDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'

import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
import { artifactsCollection } from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import { generateFilename, uploadArtifactFile } from '../../core/firebase/upload'
import type { Child } from '../../core/types'
import { EngineStage, EvidenceType, SubjectBucket } from '../../core/types/enums'

interface KidConundrumResponseProps {
  conundrum: {
    title: string
    question: string
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
  // Lincoln audio recording state
  const [isRecordingConundrum, setIsRecordingConundrum] = useState(false)
  const [conundrumAudioUrl, setConundrumAudioUrl] = useState<string | null>(null)
  const [conundrumAudioBlob, setConundrumAudioBlob] = useState<Blob | null>(null)
  const [savingConundrum, setSavingConundrum] = useState(false)
  const [conundrumSaved, setConundrumSaved] = useState(false)
  const conundrumRecorderRef = useRef<MediaRecorder | null>(null)

  // London photo capture state
  const [showConundrumPhoto, setShowConundrumPhoto] = useState(false)
  const [conundrumPhotoSaved, setConundrumPhotoSaved] = useState(false)

  const startConundrumRecording = useCallback(async () => {
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
        content: `Q: ${conundrum.question}`,
        ...(mediaUrl ? { mediaUrl } : {}),
        createdAt: new Date().toISOString(),
      })
      setConundrumSaved(true)
    } catch (err) {
      console.error('Conundrum response save failed:', err)
    }
    setSavingConundrum(false)
  }, [conundrumAudioBlob, familyId, child.id, conundrum])

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
      setConundrumPhotoSaved(true)
      setShowConundrumPhoto(false)
    } catch (err) {
      console.error('Conundrum photo save failed:', err)
    }
  }, [familyId, child.id, conundrum])

  // Lincoln: audio response
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
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {conundrum.question}
          </Typography>
          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
            {conundrum.lincolnPrompt}
          </Typography>
          <Button
            variant="outlined"
            onClick={isRecordingConundrum ? stopConundrumRecording : startConundrumRecording}
            color={isRecordingConundrum ? 'error' : 'primary'}
            size="large"
          >
            {isRecordingConundrum ? '\u23F9 Stop Recording' : '\u{1F3A4} What Do You Think?'}
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
        </Stack>
      </SectionCard>
    )
  }

  // London: drawing photo
  if (!conundrum.londonDrawingPrompt) return null

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
    <SectionCard title={`\u{1F3A8} Drawing Quest`}>
      <Stack spacing={2} sx={{ py: 1 }}>
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
      </Stack>
    </SectionCard>
  )
}
