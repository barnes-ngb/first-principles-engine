import { useCallback, useState } from 'react'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { doc, getDocs, query, setDoc, updateDoc, where, serverTimestamp } from 'firebase/firestore'

import ScanButton from '../../components/ScanButton'
import ScanResultsPanel from '../../components/ScanResultsPanel'
import { useFamilyId } from '../../core/auth/useAuth'
import { workbookConfigsCollection, workbookConfigDocId, normalizeCurriculumKey } from '../../core/firebase/firestore'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useCertificateProgress } from '../../core/hooks/useCertificateProgress'
import { useScan } from '../../core/hooks/useScan'
import type { CertificateScanResult, CurriculumDetected } from '../../core/types'
import { SubjectBucket } from '../../core/types/enums'
import type { SubjectBucket as SubjectBucketType } from '../../core/types/enums'
import { isCertificateScan } from '../../core/types/planning'

export default function CertificateScanSection() {
  const familyId = useFamilyId()
  const { activeChildId, activeChild } = useActiveChild()
  const { scan, scanResult, scanning, error: scanError, clearScan } = useScan()
  const {
    buildPreview,
    applyUpdate,
    preview,
    applying,
    applied,
    error: updateError,
    clearState: clearCertState,
  } = useCertificateProgress()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingResult, setPendingResult] = useState<CertificateScanResult | null>(null)
  const [snack, setSnack] = useState<string | null>(null)

  const handleCapture = useCallback(
    async (file: File) => {
      if (!familyId || !activeChildId) return
      await scan(file, familyId, activeChildId)
    },
    [familyId, activeChildId, scan],
  )

  const handleApplyCertificate = useCallback(
    async (result: CertificateScanResult) => {
      if (!familyId || !activeChildId) return
      setPendingResult(result)
      await buildPreview(familyId, activeChildId, result)
      setConfirmOpen(true)
    },
    [familyId, activeChildId, buildPreview],
  )

  const handleConfirmApply = useCallback(async () => {
    if (!familyId || !activeChildId || !pendingResult) return
    await applyUpdate(familyId, activeChildId, pendingResult)
    setConfirmOpen(false)
  }, [familyId, activeChildId, pendingResult, applyUpdate])

  const handleDismiss = useCallback(() => {
    setConfirmOpen(false)
    setPendingResult(null)
    clearCertState()
  }, [clearCertState])

  const handleScanAnother = useCallback(() => {
    clearScan()
    clearCertState()
    setPendingResult(null)
    setConfirmOpen(false)
  }, [clearScan, clearCertState])

  const handleUpdatePosition = useCallback(
    async (curriculum: CurriculumDetected) => {
      if (!familyId || !activeChildId || !curriculum.lessonNumber) return

      try {
        const name = curriculum.name || `${curriculum.provider ?? 'unknown'} curriculum`
        const colRef = workbookConfigsCollection(familyId)

        // Match by normalized curriculum key to find existing config
        const normalizedKey = normalizeCurriculumKey(name)
        const allSnap = await getDocs(query(colRef, where('childId', '==', activeChildId)))
        const matchingDoc = allSnap.docs.find(d => normalizeCurriculumKey(d.data().name) === normalizedKey)

        if (matchingDoc) {
          const existing = matchingDoc.data()
          if (curriculum.lessonNumber > (existing.currentPosition ?? 0)) {
            await updateDoc(matchingDoc.ref, {
              currentPosition: curriculum.lessonNumber,
              updatedAt: serverTimestamp(),
            })
          }
        } else {
          const docId = workbookConfigDocId(activeChildId, name)
          const docRef = doc(colRef, docId)
          const subjectBucket = inferSubjectFromCurriculum(curriculum)
          await setDoc(docRef, {
            childId: activeChildId,
            name,
            subjectBucket,
            totalUnits: curriculum.provider === 'gatb' ? 120 : 0,
            currentPosition: curriculum.lessonNumber,
            unitLabel: 'lesson',
            targetFinishDate: '',
            schoolDaysPerWeek: 4,
            curriculum: {
              provider: curriculum.provider ?? 'other',
              level: curriculum.levelDesignation ?? '',
            },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        }

        setSnack(`Position updated to Lesson ${curriculum.lessonNumber}!`)
      } catch (err) {
        console.error('[CertificateScanSection] Failed to update position', err)
        setSnack('Failed to update position')
      }
    },
    [familyId, activeChildId],
  )

  const childName = activeChild?.name ?? ''

  return (
    <Box sx={{ mt: 2 }}>
      {/* Scan trigger */}
      {!scanResult && !scanning && (
        <ScanButton onCapture={handleCapture} variant="button" />
      )}

      {/* Loading state */}
      {scanning && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Analyzing image...
          </Typography>
        </Stack>
      )}

      {/* Scan error */}
      {scanError && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {scanError}
        </Alert>
      )}

      {/* Results display */}
      {scanResult?.results && (
        <ScanResultsPanel
          results={scanResult.results}
          imageUrl={scanResult.imageUrl}
          onApplyCertificate={
            isCertificateScan(scanResult.results) ? handleApplyCertificate : undefined
          }
          onUpdatePosition={handleUpdatePosition}
          onScanAnother={handleScanAnother}
          childName={childName}
        />
      )}

      {/* Applied success */}
      {applied && (
        <Alert
          severity="success"
          icon={<CheckCircleIcon />}
          sx={{ mt: 1 }}
          action={
            <Button size="small" color="inherit" onClick={handleScanAnother}>
              Scan Another
            </Button>
          }
        >
          Progress updated for {childName}!
        </Alert>
      )}

      {/* Update error */}
      {updateError && (
        <Alert severity="error" sx={{ mt: 1 }}>
          Failed to update progress: {updateError}
        </Alert>
      )}

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onClose={handleDismiss} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm Progress Update</DialogTitle>
        <DialogContent>
          {preview && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Typography variant="body2">
                <strong>Curriculum:</strong> {preview.workbookName}
              </Typography>
              <Typography variant="body2">
                <strong>Milestone:</strong> {preview.updates.lastMilestone}
              </Typography>
              {preview.updates.level && (
                <Typography variant="body2">
                  <strong>Level:</strong> {preview.updates.level}
                </Typography>
              )}
              {preview.updates.currentPosition !== null && (
                <Typography variant="body2">
                  <strong>Position:</strong>{' '}
                  {preview.existingConfig
                    ? `${preview.existingConfig.currentPosition} → ${preview.updates.currentPosition}`
                    : preview.updates.currentPosition}
                </Typography>
              )}
              {preview.updates.masteredSkills.length > 0 && (
                <Typography variant="body2">
                  <strong>Skills to mark mastered:</strong>{' '}
                  {preview.updates.masteredSkills.join(', ')}
                </Typography>
              )}
              {!preview.existingConfig && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  No existing workbook config found for this curriculum. A new one will be created.
                </Alert>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDismiss} disabled={applying}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleConfirmApply}
            disabled={applying}
            startIcon={applying ? <CircularProgress size={16} /> : undefined}
          >
            {applying ? 'Updating...' : 'Confirm Update'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Position update snackbar */}
      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        message={snack}
      />
    </Box>
  )
}

function inferSubjectFromCurriculum(curriculum: CurriculumDetected): SubjectBucketType {
  const lower = (curriculum.name ?? '').toLowerCase()
  if (curriculum.provider === 'reading-eggs' || lower.includes('reading')) return SubjectBucket.Reading
  if (lower.includes('language arts')) return SubjectBucket.LanguageArts
  if (lower.includes('math')) return SubjectBucket.Math
  if (lower.includes('science')) return SubjectBucket.Science
  return SubjectBucket.Other
}
