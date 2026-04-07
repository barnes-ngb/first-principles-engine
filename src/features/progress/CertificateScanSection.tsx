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
import ScanButton from '../../components/ScanButton'
import ScanResultsPanel from '../../components/ScanResultsPanel'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useCertificateProgress } from '../../core/hooks/useCertificateProgress'
import { updateSkillMapFromFindings } from '../../core/curriculum/updateSkillMapFromFindings'
import { useScan } from '../../core/hooks/useScan'
import { useScanToActivityConfig } from '../../core/hooks/useScanToActivityConfig'
import type { CertificateScanResult, CurriculumDetected } from '../../core/types'
import { isCertificateScan, isWorksheetScan } from '../../core/types/planning'

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
  const { syncScanToConfig } = useScanToActivityConfig()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingResult, setPendingResult] = useState<CertificateScanResult | null>(null)
  const [snack, setSnack] = useState<string | null>(null)
  const [configAction, setConfigAction] = useState<string | null>(null)

  const handleCapture = useCallback(
    async (file: File) => {
      if (!familyId || !activeChildId) return
      const record = await scan(file, familyId, activeChildId)

      // Auto-sync worksheet scans to activity configs
      if (record?.results && isWorksheetScan(record.results)) {
        try {
          const result = await syncScanToConfig(activeChildId, record.results)
          if (result.action === 'created') {
            setConfigAction(`New workbook added: ${result.configName}`)
          } else if (result.action === 'updated' && result.position) {
            setConfigAction(`Updated ${result.configName} to lesson ${result.position}`)
          }
        } catch (err) {
          console.error('[CertificateScanSection] Failed to sync config:', err)
        }

        // Feed scan skills into the Learning Map (non-blocking)
        const skills = record.results.skillsTargeted
        if (skills.length > 0) {
          try {
            const findings = skills.map((s) => ({
              skill: s.skill,
              status: (s.alignsWithSnapshot === 'ahead' ? 'mastered' : 'emerging') as 'mastered' | 'emerging',
              evidence: `Workbook scan: ${s.skill} (${s.level})`,
              testedAt: new Date().toISOString(),
            }))
            await updateSkillMapFromFindings(familyId, activeChildId, findings)
          } catch (err) {
            console.warn('[CertificateScanSection] Failed to update skill map (non-blocking):', err)
          }
        }
      }
    },
    [familyId, activeChildId, scan, syncScanToConfig],
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
        // Build a minimal WorksheetScanResult to reuse the syncScanToConfig pipeline
        const result = await syncScanToConfig(activeChildId, {
          pageType: 'worksheet',
          subject: curriculum.name || 'unknown',
          specificTopic: '',
          skillsTargeted: [],
          estimatedDifficulty: 'appropriate',
          recommendation: 'do',
          recommendationReason: '',
          estimatedMinutes: 30,
          teacherNotes: '',
          curriculumDetected: curriculum,
        })

        if (result.action === 'created') {
          setSnack(`New workbook "${result.configName}" created at Lesson ${curriculum.lessonNumber}!`)
        } else if (result.action === 'updated') {
          setSnack(`Position updated to Lesson ${curriculum.lessonNumber}!`)
        }
      } catch (err) {
        console.error('[CertificateScanSection] Failed to update position', err)
        setSnack('Failed to update position')
      }
    },
    [familyId, activeChildId, syncScanToConfig],
  )

  const handleSkipToNext = useCallback(
    async (nextLesson: number) => {
      if (!familyId || !activeChildId || !scanResult?.results) return
      const results = scanResult.results
      if (results.pageType === 'certificate') return

      const curriculum = results.curriculumDetected
      if (!curriculum) return

      try {
        await syncScanToConfig(activeChildId, {
          ...results,
          curriculumDetected: { ...curriculum, lessonNumber: nextLesson },
        })
        setSnack(`Skipping ahead — next lesson: ${nextLesson}`)
      } catch (err) {
        console.error('[CertificateScanSection] Failed to skip to next', err)
        setSnack('Failed to update position')
      }
    },
    [familyId, activeChildId, scanResult, syncScanToConfig],
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
          onSkipToNext={handleSkipToNext}
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
                  No existing activity config found for this curriculum. A new one will be created.
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

      {/* Config sync notification */}
      {configAction && (
        <Alert severity="success" sx={{ mt: 1 }} onClose={() => setConfigAction(null)}>
          {configAction}. It will appear in future plans.
        </Alert>
      )}

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
