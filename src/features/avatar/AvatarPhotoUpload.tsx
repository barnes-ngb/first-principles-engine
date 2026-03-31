import { useCallback, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { doc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CameraAltIcon from '@mui/icons-material/CameraAlt'

import { app } from '../../core/firebase/firebase'
import { avatarProfilesCollection } from '../../core/firebase/firestore'
import { safeSetProfile } from './safeProfileWrite'
import type { AvatarProfile, CharacterFeatures } from '../../core/types'

interface AvatarPhotoUploadProps {
  profile: AvatarProfile
  familyId: string
  childId: string
  isLincoln: boolean
  accentColor: string
  textColor: string
}

export default function AvatarPhotoUpload({
  profile,
  familyId,
  childId,
  isLincoln,
  accentColor,
}: AvatarPhotoUploadProps) {
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [photoExtracting, setPhotoExtracting] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  const handlePhotoSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const size = Math.min(img.width, img.height)
        const x = (img.width - size) / 2
        const y = (img.height - size) / 2
        const targetSize = Math.min(size, 1024)
        const canvas = document.createElement('canvas')
        canvas.width = targetSize
        canvas.height = targetSize
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, x, y, size, size, 0, 0, targetSize, targetSize)
        setPhotoPreviewUrl(canvas.toDataURL('image/jpeg', 0.92))
        setPhotoError(null)
      }
      img.src = ev.target?.result as string
    }
    reader.readAsDataURL(file)
  }, [])

  const handlePhotoTransform = useCallback(async () => {
    if (!familyId || !childId || !photoPreviewUrl || !profile) return
    setPhotoExtracting(true)
    setPhotoError(null)

    try {
      const fns = getFunctions(app)
      const extractFn = httpsCallable<
        { familyId: string; childId: string; photoBase64: string; photoMimeType: string },
        { features: CharacterFeatures }
      >(fns, 'extractFeatures')

      const [header, base64] = photoPreviewUrl.split(',')
      const mimeType = header.split(':')[1].split(';')[0]

      const result = await extractFn({
        familyId,
        childId,
        photoBase64: base64,
        photoMimeType: mimeType,
      })

      // Save features to profile
      const profileRef = doc(avatarProfilesCollection(familyId), childId)
      const { getDoc } = await import('firebase/firestore')
      const snap = await getDoc(profileRef)
      const current = snap.exists() ? (snap.data() as AvatarProfile) : profile
      await safeSetProfile(profileRef, {
        ...current,
        characterFeatures: result.data.features,
        photoUrl: photoPreviewUrl,
      } as unknown as Record<string, unknown>)

      setPhotoPreviewUrl(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Feature extraction failed — try a different photo.'
      setPhotoError(msg)
    } finally {
      setPhotoExtracting(false)
    }
  }, [familyId, childId, photoPreviewUrl, profile])

  return (
    <Box
      sx={{
        mt: 2,
        mx: 1,
        p: 2,
        borderRadius: isLincoln ? '8px' : '18px',
        border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.1)' : 'rgba(232,160,191,0.18)'}`,
        background: isLincoln
          ? 'linear-gradient(135deg, rgba(20,22,36,0.95) 0%, rgba(26,30,46,0.95) 100%)'
          : 'linear-gradient(135deg, rgba(255,254,249,0.95) 0%, rgba(250,245,240,0.95) 100%)',
        boxShadow: isLincoln
          ? '0 4px 16px rgba(0,0,0,0.2)'
          : '0 4px 16px rgba(0,0,0,0.04)',
      }}
    >
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handlePhotoSelect}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <CameraAltIcon sx={{ color: accentColor, fontSize: 20 }} />
        <Typography
          sx={{
            fontFamily: titleFont,
            fontSize: isLincoln ? '12px' : '16px',
            fontWeight: 600,
            color: accentColor,
          }}
        >
          Transform YOUR Photo
        </Typography>
      </Box>

      {!photoPreviewUrl ? (
        <Box
          component="button"
          onClick={() => photoInputRef.current?.click()}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            width: '100%',
            px: 2,
            py: 1.5,
            borderRadius: isLincoln ? '6px' : '14px',
            border: `2px dashed ${isLincoln ? 'rgba(126,252,32,0.25)' : 'rgba(232,160,191,0.35)'}`,
            background: isLincoln ? 'rgba(126,252,32,0.04)' : 'rgba(232,160,191,0.04)',
            color: accentColor,
            fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
            fontSize: isLincoln ? '12px' : '16px',
            cursor: 'pointer',
            minHeight: '48px',
            transition: 'all 0.2s ease',
            '&:hover': {
              background: isLincoln ? 'rgba(126,252,32,0.08)' : 'rgba(232,160,191,0.08)',
              borderColor: accentColor,
              transform: 'translateY(-1px)',
            },
            '&:active': { transform: 'scale(0.98)' },
          }}
        >
          <CameraAltIcon sx={{ fontSize: 20 }} />
          {profile.photoUrl ? 'Change Photo' : 'Upload a Photo'}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Box
            component="img"
            src={photoPreviewUrl}
            alt="Preview"
            sx={{
              width: 88,
              height: 88,
              objectFit: 'cover',
              borderRadius: isLincoln ? '6px' : '14px',
              border: `2px solid ${accentColor}55`,
              boxShadow: `0 4px 12px ${isLincoln ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)'}`,
            }}
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
            <Button
              variant="contained"
              size="small"
              onClick={() => void handlePhotoTransform()}
              disabled={photoExtracting}
              sx={{
                bgcolor: accentColor,
                color: isLincoln ? '#000' : '#fff',
                borderRadius: isLincoln ? '4px' : '10px',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '12px' : '14px',
                textTransform: 'none',
                py: 1.5,
                minHeight: '48px',
                '&:hover': { bgcolor: accentColor, opacity: 0.85 },
              }}
            >
              {photoExtracting ? 'Extracting...' : 'Transform!'}
            </Button>
            <Button
              variant="text"
              size="small"
              onClick={() => { setPhotoPreviewUrl(null); setPhotoError(null) }}
              sx={{
                color: isLincoln ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)',
                fontFamily: isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive',
                fontSize: isLincoln ? '12px' : '14px',
                textTransform: 'none',
              }}
            >
              Cancel
            </Button>
          </Box>
        </Box>
      )}

      {photoError && (
        <Alert severity="error" sx={{ mt: 1, fontSize: '0.8rem', borderRadius: isLincoln ? '4px' : '10px' }}>
          {photoError}
        </Alert>
      )}

      {profile.characterFeatures && !photoPreviewUrl && (
        <Typography
          sx={{
            display: 'block',
            mt: 0.75,
            color: isLincoln ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)',
            fontSize: '13px',
            fontFamily: 'monospace',
          }}
        >
          3D character reflects your look
        </Typography>
      )}
    </Box>
  )
}
