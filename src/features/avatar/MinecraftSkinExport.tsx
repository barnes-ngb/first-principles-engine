import { useCallback, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import Typography from '@mui/material/Typography'
import LockIcon from '@mui/icons-material/Lock'
import type { AvatarProfile } from '../../core/types'
import { generateMinecraftSkin, downloadMinecraftSkin } from './voxel/minecraftSkin'

interface MinecraftSkinExportProps {
  profile: AvatarProfile
  childName: string
  tierName: string
  isLincoln: boolean
}

export default function MinecraftSkinExport({
  profile,
  childName,
  tierName,
  isLincoln,
}: MinecraftSkinExportProps) {
  const [open, setOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const isLocked = tierName === 'WOOD'
  const accentColor = isLincoln ? '#7EFC20' : '#E8A0BF'
  const titleFont = isLincoln ? '"Press Start 2P", monospace' : '"Fredoka", cursive'

  const handleOpen = useCallback(() => {
    if (isLocked) return
    const canvas = generateMinecraftSkin(profile)
    setPreviewUrl(canvas.toDataURL('image/png'))
    setOpen(true)
  }, [isLocked, profile])

  const handleDownload = useCallback(() => {
    downloadMinecraftSkin(profile, childName)
  }, [profile, childName])

  const handleClose = useCallback(() => {
    setOpen(false)
    setPreviewUrl(null)
  }, [])

  return (
    <>
      {/* Export Button */}
      <Box
        component="button"
        onClick={handleOpen}
        disabled={isLocked}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          width: '100%',
          py: 1.5,
          px: 2,
          borderRadius: isLincoln ? '6px' : '14px',
          border: `1.5px solid ${isLocked
            ? 'rgba(128,128,128,0.2)'
            : isLincoln ? 'rgba(126,252,32,0.25)' : 'rgba(232,160,191,0.25)'}`,
          background: isLocked
            ? 'rgba(128,128,128,0.05)'
            : isLincoln
              ? 'linear-gradient(135deg, rgba(126,252,32,0.08) 0%, rgba(0,200,83,0.05) 100%)'
              : 'linear-gradient(135deg, rgba(232,160,191,0.08) 0%, rgba(232,160,191,0.04) 100%)',
          color: isLocked ? 'rgba(128,128,128,0.5)' : accentColor,
          fontFamily: titleFont,
          fontSize: isLincoln ? '9px' : '14px',
          fontWeight: 700,
          cursor: isLocked ? 'default' : 'pointer',
          opacity: isLocked ? 0.5 : 1,
          transition: 'all 0.2s ease',
          '&:hover': isLocked ? {} : {
            transform: 'translateY(-1px)',
            borderColor: accentColor,
            boxShadow: `0 4px 16px ${accentColor}22`,
          },
          '&:active': isLocked ? {} : { transform: 'scale(0.97)' },
        }}
      >
        {isLocked ? (
          <LockIcon sx={{ fontSize: 16 }} />
        ) : (
          <span style={{ fontSize: 18 }}>🎮</span>
        )}
        {isLocked ? 'Minecraft Skin (Stone+)' : 'Export Minecraft Skin'}
      </Box>

      {/* Preview Dialog */}
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: isLincoln ? '#0d1117' : '#faf5ef',
            borderRadius: isLincoln ? '8px' : '20px',
            border: `1px solid ${isLincoln ? 'rgba(126,252,32,0.15)' : 'rgba(232,160,191,0.2)'}`,
          },
        }}
      >
        <DialogContent sx={{ p: 2.5, textAlign: 'center' }}>
          {/* Close button */}
          <Box
            component="button"
            onClick={handleClose}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'none',
              border: 'none',
              color: isLincoln ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)',
              fontSize: 22,
              cursor: 'pointer',
              zIndex: 1,
              '&:hover': { color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' },
            }}
          >
            ✕
          </Box>

          {/* Title */}
          <Typography
            sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '11px' : '17px',
              fontWeight: 700,
              color: accentColor,
              mb: 2,
            }}
          >
            🎮 Minecraft Skin
          </Typography>

          {/* Skin preview — scaled up with pixelated rendering */}
          {previewUrl && (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mb: 2 }}>
              <Box>
                <Box
                  component="img"
                  src={previewUrl}
                  alt="Minecraft skin preview"
                  sx={{
                    width: 256,
                    height: 256,
                    imageRendering: 'pixelated',
                    borderRadius: isLincoln ? '4px' : '12px',
                    border: `2px solid ${isLincoln ? 'rgba(126,252,32,0.15)' : 'rgba(232,160,191,0.15)'}`,
                    background: isLincoln
                      ? 'repeating-conic-gradient(rgba(255,255,255,0.03) 0% 25%, transparent 0% 50%) 0 0 / 32px 32px'
                      : 'repeating-conic-gradient(rgba(0,0,0,0.03) 0% 25%, transparent 0% 50%) 0 0 / 32px 32px',
                  }}
                />
                <Typography
                  sx={{
                    fontFamily: titleFont,
                    fontSize: isLincoln ? '7px' : '11px',
                    color: isLincoln ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)',
                    mt: 0.5,
                  }}
                >
                  64×64 skin layout
                </Typography>
              </Box>
            </Box>
          )}

          {/* Tier + equipped info */}
          <Typography
            sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '8px' : '12px',
              color: isLincoln ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
              mb: 2,
            }}
          >
            {tierName} Tier • {profile.equippedPieces?.length ?? 0} armor pieces
          </Typography>

          {/* Download button */}
          <Button
            onClick={handleDownload}
            variant="contained"
            fullWidth
            sx={{
              fontFamily: titleFont,
              fontSize: isLincoln ? '9px' : '14px',
              fontWeight: 700,
              py: 1.5,
              borderRadius: isLincoln ? '6px' : '14px',
              bgcolor: accentColor,
              color: isLincoln ? '#0d1117' : '#ffffff',
              textTransform: 'none',
              boxShadow: `0 2px 10px ${accentColor}33`,
              '&:hover': { bgcolor: accentColor, opacity: 0.9 },
              mb: 1.5,
            }}
          >
            ⬇ Download Skin
          </Button>

          {/* Instructions */}
          <Box
            sx={{
              p: 1.5,
              borderRadius: isLincoln ? '4px' : '10px',
              background: isLincoln ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              border: `1px solid ${isLincoln ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
            }}
          >
            <Typography
              sx={{
                fontFamily: titleFont,
                fontSize: isLincoln ? '7px' : '11px',
                color: isLincoln ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                lineHeight: 1.6,
                textAlign: 'left',
              }}
            >
              <strong style={{ color: isLincoln ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' }}>
                How to use:
              </strong>
              <br />
              1. Open Minecraft → Settings → Skin
              <br />
              2. Choose New Skin → Browse
              <br />
              3. Select the downloaded .png file
              <br />
              4. Pick "Classic" (4px arms)
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  )
}
