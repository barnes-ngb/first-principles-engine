import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import MicIcon from '@mui/icons-material/Mic'
import { doc, getDoc } from 'firebase/firestore'

import { artifactsCollection } from '../core/firebase/firestore'
import type { Artifact } from '../core/types/domain'
import { EvidenceType } from '../core/types/enums'

interface ArtifactGalleryProps {
  familyId: string
  artifactIds: string[]
  /** Optional label shown above the gallery */
  label?: string
  /** Size of thumbnails (default 80) */
  thumbnailSize?: number
}

export default function ArtifactGallery({
  familyId,
  artifactIds,
  label,
  thumbnailSize = 80,
}: ArtifactGalleryProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loading, setLoading] = useState(artifactIds.length > 0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!artifactIds.length) return
    let cancelled = false

    const loadArtifacts = async () => {
      const loaded: Artifact[] = []
      for (const id of artifactIds) {
        try {
          const snap = await getDoc(doc(artifactsCollection(familyId), id))
          if (snap.exists()) {
            loaded.push({ ...snap.data(), id: snap.id })
          }
        } catch (err) {
          console.warn(`Failed to load artifact ${id}:`, err)
        }
      }
      if (!cancelled) {
        setArtifacts(loaded)
        setLoading(false)
      }
    }

    void loadArtifacts()
    return () => { cancelled = true }
  }, [familyId, artifactIds])

  if (!artifactIds.length) return null
  if (loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="caption" color="text.secondary">
          Loading {artifactIds.length} item{artifactIds.length !== 1 ? 's' : ''}...
        </Typography>
      </Stack>
    )
  }

  const photos = artifacts.filter(a => a.type === EvidenceType.Photo && a.uri)
  const audio = artifacts.filter(a => a.type === EvidenceType.Audio && a.uri)

  if (photos.length === 0 && audio.length === 0) return null

  return (
    <>
      {label && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          {label}
        </Typography>
      )}

      {/* Photo thumbnails */}
      {photos.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
          {photos.map(a => (
            <Box
              key={a.id}
              component="img"
              src={a.uri}
              alt={a.title}
              onClick={() => setPreviewUrl(a.uri!)}
              sx={{
                width: thumbnailSize,
                height: thumbnailSize,
                borderRadius: 1,
                objectFit: 'cover',
                cursor: 'pointer',
                border: '2px solid',
                borderColor: 'divider',
                transition: 'border-color 0.2s',
                '&:hover': { borderColor: 'primary.main' },
              }}
            />
          ))}
        </Stack>
      )}

      {/* Audio players */}
      {audio.length > 0 && (
        <Stack spacing={0.5}>
          {audio.map(a => (
            <Stack
              key={a.id}
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ p: 0.75, borderRadius: 1, bgcolor: 'action.hover' }}
            >
              <MicIcon fontSize="small" color="action" />
              <audio controls src={a.uri} style={{ height: 32, flex: 1, maxWidth: 250 }} />
              <Typography variant="caption" color="text.secondary">
                {a.title?.replace(/^Dad Lab (photo|recording) - /, '') || 'Recording'}
              </Typography>
            </Stack>
          ))}
        </Stack>
      )}

      {/* Full-size photo preview dialog */}
      <Dialog
        open={!!previewUrl}
        onClose={() => setPreviewUrl(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogContent sx={{ p: 0, position: 'relative' }}>
          <IconButton
            onClick={() => setPreviewUrl(null)}
            sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,0.5)', color: 'white' }}
          >
            <CloseIcon />
          </IconButton>
          {previewUrl && (
            <Box
              component="img"
              src={previewUrl}
              sx={{ width: '100%', display: 'block' }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
