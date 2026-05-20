import { useCallback, useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { addDoc } from 'firebase/firestore'

import { bookThemesCollection } from '../../core/firebase/firestore'
import type { BookThemeConfig } from '../../core/types'

interface CreateThemeDialogProps {
  open: boolean
  onClose: () => void
  familyId: string
  childId?: string
  onCreated: (themeId: string) => void
}

export default function CreateThemeDialog({
  open,
  onClose,
  familyId,
  childId,
  onCreated,
}: CreateThemeDialogProps) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🎨')
  const [worldDescription, setWorldDescription] = useState('')
  const [imageStyle, setImageStyle] = useState('')
  const [storyTone, setStoryTone] = useState('')
  const [saving, setSaving] = useState(false)

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !familyId) return
    setSaving(true)
    try {
      const theme: Omit<BookThemeConfig, 'id'> & { id?: string } = {
        name: name.trim(),
        emoji: emoji || '🎨',
        isPreset: false,
        childId,
        imageStylePrefix: imageStyle.trim()
          || `A children's book illustration in the style of "${name.trim()}".`,
        coverStyle: 'storybook',
        storyTone: storyTone.trim()
          || `fun and engaging, inspired by ${name.trim()}`,
        storyWorldDescription: worldDescription.trim()
          || `a world inspired by the theme "${name.trim()}"`,
        storyVocabularyLevel: 'age-appropriate vocabulary',
      }
      const docRef = await addDoc(bookThemesCollection(familyId), theme as BookThemeConfig)
      onCreated(docRef.id)
      // Reset form
      setName('')
      setEmoji('🎨')
      setWorldDescription('')
      setImageStyle('')
      setStoryTone('')
      onClose()
    } catch (err) {
      console.error('Failed to create theme:', err)
    } finally {
      setSaving(false)
    }
  }, [name, emoji, worldDescription, imageStyle, storyTone, familyId, childId, onCreated, onClose])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create a New Theme</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Theme Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              placeholder="Space Pirates"
            />
            <TextField
              label="Emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              sx={{ width: 80 }}
              inputProps={{ maxLength: 4 }}
            />
          </Stack>

          <TextField
            label="What kind of world is this?"
            value={worldDescription}
            onChange={(e) => setWorldDescription(e.target.value)}
            multiline
            minRows={2}
            maxRows={4}
            placeholder="A galaxy of floating islands where pirates sail star-ships between planets"
          />

          <TextField
            label="What style should pictures be?"
            value={imageStyle}
            onChange={(e) => setImageStyle(e.target.value)}
            multiline
            minRows={2}
            maxRows={3}
            placeholder="Colorful cartoon with sparkles and neon lights"
          />

          <TextField
            label="What tone should stories have?"
            value={storyTone}
            onChange={(e) => setStoryTone(e.target.value)}
            multiline
            minRows={2}
            maxRows={3}
            placeholder="Funny and silly with pirate slang and treasure hunting"
          />

          <Typography variant="caption" color="text.secondary">
            The AI will use your descriptions to shape stories and illustrations for books with this theme.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => { void handleCreate() }}
          disabled={!name.trim() || saving}
        >
          {saving ? 'Creating...' : 'Create Theme'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
