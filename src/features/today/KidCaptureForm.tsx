import { useCallback, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { addDoc, doc, updateDoc } from 'firebase/firestore'

import { artifactsCollection } from '../../core/firebase/firestore'
import { generateFilename, uploadArtifactFile } from '../../core/firebase/upload'
import type { Artifact } from '../../core/types'
import {
  EngineStage,
  EvidenceType,
  SubjectBucket,
} from '../../core/types/enums'

interface KidCaptureFormProps {
  type: 'photo' | 'note'
  familyId: string
  childId: string
  today: string
  onSave: () => void
  onCancel: () => void
}

export default function KidCaptureForm({
  type,
  familyId,
  childId,
  today,
  onSave,
  onCancel,
}: KidCaptureFormProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  /**
   * UX-359 — a save that did not land says so, on the boys' own capture form,
   * and says WHICH of the two failures it was (Codex round 1, P2).
   *
   * `null` is no failure. `'nothing'` is the `addDoc` itself failing, where no
   * document exists and *"that did not save"* is simply true. `'no-picture'` is
   * the upload or the `uri` write failing **after** the document was created:
   * saying nothing saved there would be false, and telling him to tap Save again
   * would create a **second** artifact and orphan the first without a picture.
   */
  const [saveFailure, setSaveFailure] = useState<'nothing' | 'no-picture' | null>(null)

  /**
   * The document this form already created, if a previous attempt got that far.
   *
   * A retry REUSES it rather than adding another — the same rule
   * `useUnifiedCapture` follows for a batch's extra pages, and the reason the
   * partial-failure message can honestly say the record exists.
   */
  const createdArtifactIdRef = useRef<string | null>(null)

  /**
   * The photo this form has already UPLOADED, if a previous attempt got that far
   * (Codex round 3, P2).
   *
   * The upload and the `uri` write are two steps. When the upload succeeded and
   * only the write failed, a retry that re-uploads generates a fresh timestamped
   * filename and leaves the first object in Storage permanently unreferenced —
   * a file nobody can see and nothing points at, added every time he taps Save.
   * Keeping the URL makes the retry what it should be: the one step that failed.
   */
  const uploadedUriRef = useRef<string | null>(null)

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    setSaveFailure(null)

    // The record half. Skipped entirely on a retry that already got this far,
    // so tapping Save again can never leave two artifacts for one photo.
    let artifactId = createdArtifactIdRef.current
    if (!artifactId) {
      try {
        const artifact: Omit<Artifact, 'id'> = {
          childId,
          dayLogId: today,
          title: title || (type === 'photo' ? `Photo ${today}` : `Note ${today}`),
          type: type === 'photo' ? EvidenceType.Photo : EvidenceType.Note,
          createdAt: new Date().toISOString(),
          content: type === 'note' ? content : undefined,
          tags: {
            engineStage: EngineStage.Build,
            domain: '',
            subjectBucket: SubjectBucket.Other,
            location: 'Home',
          },
        }
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        artifactId = docRef.id
        createdArtifactIdRef.current = docRef.id
      } catch (err) {
        // Nothing exists. "That did not save" is simply true — the form stayed
        // open with his work in it and NOTHING was said before UX-359.
        console.error('Failed to save artifact:', err)
        setSaveFailure('nothing')
        setSaving(false)
        return
      }
    }

    // The picture half. A failure here leaves a real record with no picture on
    // it, which is a different sentence and a different retry.
    if (type === 'photo' && file) {
      try {
        let downloadUrl = uploadedUriRef.current
        if (!downloadUrl) {
          const filename = generateFilename(file.name.split('.').pop() || 'jpg')
          const uploaded = await uploadArtifactFile(
            familyId,
            artifactId,
            file,
            filename,
          )
          downloadUrl = uploaded.downloadUrl
          uploadedUriRef.current = downloadUrl
        }
        await updateDoc(doc(artifactsCollection(familyId), artifactId), {
          uri: downloadUrl,
        })
      } catch (err) {
        console.error('Failed to attach the photo to the artifact:', err)
        setSaveFailure('no-picture')
        setSaving(false)
        return
      }
    }

    createdArtifactIdRef.current = null
    uploadedUriRef.current = null
    setSaving(false)
    onSave()
  }, [saving, childId, today, title, type, content, file, familyId, onSave])

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: 'action.hover',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Stack spacing={2}>
        <Typography variant="body1" fontWeight={600}>
          {type === 'photo' ? '📷 Add a Photo' : '📝 Write a Note'}
        </Typography>

        <TextField
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          size="small"
          fullWidth
          placeholder={type === 'photo' ? 'What did you make?' : 'What happened?'}
        />

        {type === 'photo' && (
          <Button
            variant="outlined"
            component="label"
            size="large"
            sx={{ minHeight: 48 }}
          >
            {file ? file.name : 'Choose Photo'}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Button>
        )}

        {type === 'note' && (
          <TextField
            label="What happened?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            multiline
            rows={3}
            fullWidth
            size="small"
          />
        )}

        {saveFailure && (
          // UX-359 — kid copy, on the shared readability bar. Two sentences,
          // because a half-save is not a no-save: the work is still in the form
          // either way, and neither claims anything was lost. Tapping Save again
          // reuses the record that already exists, so a retry adds nothing.
          <Typography variant="body2" color="error.main">
            {saveFailure === 'nothing'
              ? 'That did not save. Try again.'
              : 'Saved, but no picture yet. Try again.'}
          </Typography>
        )}

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={onCancel} size="small" sx={{ minHeight: 48 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || (type === 'photo' && !file) || (type === 'note' && !content.trim())}
            size="small"
            sx={{ minHeight: 48 }}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Stack>
      </Stack>
    </Box>
  )
}
