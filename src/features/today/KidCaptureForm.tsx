import { useCallback, useState } from 'react'
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

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
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

      if (type === 'photo' && file) {
        const filename = generateFilename(file.name.split('.').pop() || 'jpg')
        const { downloadUrl } = await uploadArtifactFile(
          familyId,
          docRef.id,
          file,
          filename,
        )
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), {
          uri: downloadUrl,
        })
      }

      onSave()
    } catch (err) {
      console.error('Failed to save artifact:', err)
    } finally {
      setSaving(false)
    }
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
