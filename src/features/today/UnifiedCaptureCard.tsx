import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import SectionCard from '../../components/SectionCard'
import { addDoc, doc, updateDoc } from 'firebase/firestore'

import AudioRecorder from '../../components/AudioRecorder'
import PhotoCapture from '../../components/PhotoCapture'
import { kidPalette } from '../../app/tokens'
import {
  artifactsCollection,
  hoursCollection,
} from '../../core/firebase/firestore'
import {
  generateFilename,
  uploadArtifactFile,
} from '../../core/firebase/upload'
import type { Artifact, ChecklistItem, Child } from '../../core/types'
import {
  EngineStage,
  EvidenceType,
  LearningLocation,
  SubjectBucket,
} from '../../core/types/enums'
// UX-184: the quick-log presets — the family's own and the eight built-ins —
// have one definition, shared with Kid Today's "⭐ I Did More!" row.
import {
  isFamilyCapturePresetId,
  resolveCapturePresetGroups,
  type CapturePreset,
} from './quickLogChips'
// A plain read of the family's configs, for the same reason `KidExtraLogger`
// takes it: a KID opening Today must not seed or migrate anything, which
// `useActivityConfigs` would.
import { useChatActivityConfigs } from '../shelly-chat/useChatActivityConfigs'
// A finished save may clear only the draft it was started from — the rule, and
// the wording of the receipt when it may not (G1/G2).
import {
  captureErrorText,
  captureSuccessText,
  captureUnsavedText,
  classifyDraftClaim,
  type CaptureDraftClaim,
  type CaptureDraftVerdict,
} from './captureDraftOwnership'
import LogWorkCard from './LogWorkCard'

const MAX_DURATION_MINUTES = 240
const DURATION_STEP = 5

type MediaTab = 'photo' | 'audio'

type Variant = 'parent' | 'kid'

interface KidThemeTokens {
  accent: string
  saveColor: 'primary' | 'success' | 'secondary'
  fontFamily?: string
  chipSelectedBg: string
}

function getKidTheme(childName: string | undefined): KidThemeTokens {
  const isLincoln = (childName ?? '').toLowerCase() === 'lincoln'
  if (isLincoln) {
    return {
      accent: kidPalette.xpGreen,
      saveColor: 'success',
      fontFamily: '"Press Start 2P", monospace',
      chipSelectedBg: kidPalette.xpGreen,
    }
  }
  // London / default story palette
  return {
    accent: '#9DC183',
    saveColor: 'primary',
    fontFamily: '"Fredoka", "Comic Sans MS", sans-serif',
    chipSelectedBg: '#9DC183',
  }
}

interface UnifiedCaptureCardProps {
  familyId: string
  selectedChildId: string
  today: string
  weekPlanId: string | undefined
  selectableChildren: Child[]
  todayArtifacts: Artifact[]
  setTodayArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>
  /**
   * The live day's checklist, so the parent evidence list can say WHICH ROW
   * each piece of evidence belongs to (UX-431). Parent only.
   */
  todayChecklist?: ChecklistItem[]
  /** The artifact read dropped. Never rendered as an empty day (UX-431). */
  artifactsFailed?: boolean
  /** A pending read must not claim the displayed scope is an empty day. */
  artifactsLoading?: boolean
  /** The family's own `FamilySettings.timeZone` for the evidence clock. */
  familyTimeZone?: string
  onSnackMessage: (msg: { text: string; severity: 'success' | 'error' }) => void
  /** 'parent' (default) — the *Log work* form. 'kid' — the chip-first card. */
  variant?: Variant
  /** Required when variant='kid' for per-child theming. */
  activeChild?: Child
}

/**
 * Today's capture entry point, routed by audience.
 *
 * ── Why this is a two-line component (FIX-267) ─────────────────────────────
 *
 * One component served both audiences through `variant`, and the two had
 * diverged until almost every branch in it read `isKid`: the parent needed a
 * child picker, a category, a note, a staged attachment and ONE deliberate
 * save; the kid needs a chip, a big +/- stepper and a tap that logs minutes
 * immediately. When the parent half was rebuilt as `LogWorkCard` — staging
 * media instead of committing it, and carrying an unfinished save so a retry
 * cannot write twice — keeping the two in one file would have meant two save
 * models, two media models and one set of refs shared between them.
 *
 * So the parent half moved out and **the kid half did not move at all**: the
 * card below is the same code, with the parent-only branches removed. Its
 * writes, its receipts, its latch and its theming are unchanged, which is what
 * *keep the kids' behaviour unchanged* has to mean to be checkable.
 *
 * This default export stays the name both Today surfaces already import.
 */
export default function UnifiedCaptureCard(props: UnifiedCaptureCardProps) {
  if (props.variant === 'kid') return <KidCaptureCard {...props} />
  return (
    <LogWorkCard
      familyId={props.familyId}
      selectedChildId={props.selectedChildId}
      today={props.today}
      weekPlanId={props.weekPlanId}
      selectableChildren={props.selectableChildren}
      todayArtifacts={props.todayArtifacts}
      setTodayArtifacts={props.setTodayArtifacts}
      todayChecklist={props.todayChecklist}
      artifactsFailed={props.artifactsFailed}
      artifactsLoading={props.artifactsLoading}
      familyTimeZone={props.familyTimeZone}
      onSnackMessage={props.onSnackMessage}
      activeChild={props.activeChild}
    />
  )
}

/**
 * Kid Today's capture card — chip-required, +/- minutes, immediate save.
 *
 * Unchanged from the shared card it was extracted from: a chip fills the
 * activity, its subject and a suggested duration; *Save my time* writes one
 * `hours` row and no artifact (UX-74, which is why it is not called *Save*);
 * a photo or a recording commits on capture, as a child expects from a camera.
 * The FIX-262 latch and the FIX-263 draft-ownership rule both came with it.
 */
function KidCaptureCard({
  familyId,
  selectedChildId,
  today,
  weekPlanId,
  selectableChildren,
  setTodayArtifacts,
  onSnackMessage,
  activeChild,
}: UnifiedCaptureCardProps) {
  const kidTheme = useMemo(() => getKidTheme(activeChild?.name), [activeChild?.name])

  const [mediaTab, setMediaTab] = useState<MediaTab | null>(null)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [childId, setChildId] = useState(selectedChildId)

  // UX-184: the family's flagged activities lead the panel, ahead of the
  // built-ins. Read-only, keyed to the child being logged for.
  const activityConfigs = useChatActivityConfigs(familyId, childId)
  const presetGroups = useMemo(
    () => resolveCapturePresetGroups(activityConfigs),
    [activityConfigs],
  )
  const [activityName, setActivityName] = useState('')
  const [subjectBucket, setSubjectBucket] = useState<SubjectBucket>(SubjectBucket.Other)
  const [durationInput, setDurationInput] = useState('')

  // Keep childId in sync with active child
  useEffect(() => {
    setChildId(selectedChildId)
  }, [selectedChildId])

  // UX-184 follow-up (Codex round 1, P2): a family preset is CHILD-SCOPED, so
  // changing child clears exactly the three fields it filled. The eight
  // built-ins are valid for every child and survive the switch untouched — and
  // the check is on the id's own shape rather than on the resolved list, which
  // by this point no longer holds the preset being asked about.
  const prevChildIdRef = useRef(childId)
  useEffect(() => {
    if (prevChildIdRef.current === childId) return
    prevChildIdRef.current = childId
    if (!isFamilyCapturePresetId(selectedPresetId)) return
    setSelectedPresetId(null)
    setActivityName('')
    setSubjectBucket(SubjectBucket.Other)
    setDurationInput('')
  }, [childId, selectedPresetId])

  // FIX-262: one tap, one write. The ref is the guard — claimed before the
  // first `await`, because two taps in one batch would both read a state flag
  // as `false`; `savePending` only says so on screen.
  const savePendingRef = useRef(false)
  const [savePending, setSavePending] = useState(false)

  /** Claims the latch. `false` means a save is already in flight — do nothing. */
  const beginSave = useCallback(() => {
    if (savePendingRef.current) return false
    savePendingRef.current = true
    setSavePending(true)
    return true
  }, [])

  const endSave = useCallback(() => {
    savePendingRef.current = false
    setSavePending(false)
  }, [])

  const parsedDuration = useMemo(() => {
    if (durationInput.trim() === '') return 0
    const n = Math.floor(Number(durationInput))
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.min(n, MAX_DURATION_MINUTES)
  }, [durationInput])

  const activeChildName =
    selectableChildren.find((c) => c.id === childId)?.name ?? activeChild?.name ?? 'child'

  // ── Draft ownership (G1/G2) ───────────────────────────────────────────────
  //
  // `visit` is an epoch over the editor's scope, bumped during render so it has
  // already moved by the time any handler created in this render can be used.
  // Day A → day B → day A is visit 2, not visit 0 restored.
  const scopeKey = `${familyId}\u0000${selectedChildId}\u0000${childId}\u0000${today}`
  const visitRef = useRef({ key: scopeKey, visit: 0 })
  if (visitRef.current.key !== scopeKey) {
    visitRef.current = { key: scopeKey, visit: visitRef.current.visit + 1 }
  }

  // `revision` is both a ref and state. The ref is the current truth a
  // completion is judged against; the state exists only to force the re-render
  // that re-binds the claim below, because a media surface can change the draft
  // (a photo staged, a recording discarded) without changing any state here.
  const revisionRef = useRef(0)
  const [revision, setRevision] = useState(0)

  const markDraftEdited = useCallback(() => {
    revisionRef.current += 1
    setRevision(revisionRef.current)
  }, [])

  /**
   * The identity of the draft AS THIS RENDER SHOWS IT, handed to every save
   * handler at the point the handler is created — because the media surfaces
   * hold a callback across an `await` and can be INVOKED after the day or the
   * fields moved.
   */
  const renderedClaim: CaptureDraftClaim = {
    visit: visitRef.current.visit,
    revision,
    childName: activeChildName,
    day: today,
  }

  /** The verdict on a claim, against the editor as it stands right now. */
  const verdictFor = useCallback(
    (claim: CaptureDraftClaim): CaptureDraftVerdict =>
      classifyDraftClaim(claim, {
        visit: visitRef.current.visit,
        revision: revisionRef.current,
      }),
    [],
  )

  const resetForm = useCallback(() => {
    setSelectedPresetId(null)
    setActivityName('')
    setSubjectBucket(SubjectBucket.Other)
    setDurationInput('')
    setMediaTab(null)
  }, [])

  const handlePresetTap = useCallback((preset: CapturePreset) => {
    markDraftEdited()
    if (selectedPresetId === preset.id) {
      // De-select: clear the three pre-filled fields
      setSelectedPresetId(null)
      setActivityName('')
      setSubjectBucket(SubjectBucket.Other)
      setDurationInput('')
      return
    }
    setSelectedPresetId(preset.id)
    setActivityName(preset.label)
    setSubjectBucket(preset.subjectBucket)
    setDurationInput(String(preset.suggestedMinutes))
  }, [selectedPresetId, markDraftEdited])

  const buildArtifactBase = useCallback(
    (title: string, evidenceType: EvidenceType) => ({
      title,
      type: evidenceType,
      createdAt: new Date().toISOString(),
      childId,
      dayLogId: today,
      weekPlanId,
      tags: {
        engineStage: EngineStage.Build,
        domain: '',
        subjectBucket,
        location: LearningLocation.Home,
      },
      notes: '',
    }),
    [childId, today, weekPlanId, subjectBucket],
  )

  const writeHours = useCallback(
    async (minutes: number, notes: string): Promise<boolean> => {
      if (minutes <= 0) return false
      try {
        await addDoc(hoursCollection(familyId), {
          childId,
          date: today,
          minutes,
          subjectBucket,
          location: LearningLocation.Home,
          source: 'unified-capture',
          quickCapture: true,
          notes: notes || activityName || 'Capture',
        })
        return true
      } catch (err) {
        console.error('Failed to log unified-capture hours', err)
        return false
      }
    },
    [familyId, childId, subjectBucket, today, activityName],
  )

  /**
   * The ONE completion for every kid pathway (photo, audio, minutes). It
   * decides both things a finished save does to the form — whether the fields
   * clear and what the receipt says — from the one claim.
   */
  const completeSave = useCallback(
    (
      claim: CaptureDraftClaim,
      { artifactSaved, hoursMinutes, hoursOk }: { artifactSaved: boolean; hoursMinutes: number; hoursOk: boolean },
    ) => {
      const verdict = verdictFor(claim)
      const say = (base: string, severity: 'success' | 'error') =>
        onSnackMessage({ text: captureSuccessText(base, verdict, claim), severity })
      /** Hours refused: an error, and never the wording that claims a save. */
      const unsaved = (base: string) =>
        onSnackMessage({ text: captureUnsavedText(base, verdict, claim), severity: 'error' })

      if (artifactSaved && hoursMinutes > 0) {
        if (hoursOk) say(`Captured + ${hoursMinutes} min logged`, 'success')
        else unsaved("Captured (couldn't log hours — try again from Records)")
      } else if (artifactSaved) {
        say('Captured', 'success')
      } else if (hoursMinutes > 0) {
        if (hoursOk) say(`Logged ${hoursMinutes} min`, 'success')
        else unsaved("Couldn't log hours — try again from Records")
      }

      // Whatever was written is written; only the FORM is conditional, and a
      // draft that moved on keeps every field.
      if (verdict === 'owned') resetForm()
    },
    [onSnackMessage, verdictFor, resetForm],
  )

  /**
   * The same gate for a THROWN save. These paths clear nothing at all, so this
   * only decides what the error is ABOUT: a stale error must say which capture
   * failed rather than appearing to judge the draft in front of the child.
   */
  const failSave = useCallback(
    (claim: CaptureDraftClaim, base: string) => {
      onSnackMessage({ text: captureErrorText(base, verdictFor(claim), claim), severity: 'error' })
    },
    [onSnackMessage, verdictFor],
  )

  const handlePhotoCapture = useCallback(
    async (files: File[], claim: CaptureDraftClaim) => {
      if (files.length === 0) return
      // Nothing was staged above, so no save was attempted and the latch is
      // not claimed — the check stays ahead of it.
      if (!beginSave()) return
      setMediaUploading(true)
      try {
        const title = activityName.trim() || `Photo ${today}`
        const artifact = {
          ...buildArtifactBase(title, EvidenceType.Photo),
          activityName: activityName.trim() || undefined,
        }
        // ONE artifact for the whole batch; upload each file under the same docId.
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const urls: string[] = []
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const ext = file.name.split('.').pop() ?? 'jpg'
          // Index-prefixed so filenames stay distinct even within the same ms.
          const filename = `${i}-${generateFilename(ext)}`
          const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, file, filename)
          urls.push(downloadUrl)
        }
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), {
          uri: urls[0], // cover, back-compat
          mediaUrls: urls,
        })
        setTodayArtifacts((prev) => [
          { ...artifact, id: docRef.id, uri: urls[0], mediaUrls: urls },
          ...prev,
        ])
        const minutes = parsedDuration
        const hoursOk = minutes > 0 ? await writeHours(minutes, title) : false
        completeSave(claim, { artifactSaved: true, hoursMinutes: minutes, hoursOk })
      } catch (err) {
        console.error('Photo upload failed', err)
        failSave(claim, 'Photo upload failed.')
      } finally {
        setMediaUploading(false)
        endSave()
      }
    },
    [
      beginSave,
      endSave,
      activityName,
      today,
      buildArtifactBase,
      familyId,
      setTodayArtifacts,
      parsedDuration,
      writeHours,
      completeSave,
      failSave,
    ],
  )

  const handleAudioCapture = useCallback(
    async (fileOrBlob: File | Blob, claim: CaptureDraftClaim) => {
      if (!beginSave()) return
      setMediaUploading(true)
      try {
        const title = activityName.trim() || `Audio ${today}`
        const artifact = {
          ...buildArtifactBase(title, EvidenceType.Audio),
          activityName: activityName.trim() || undefined,
        }
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        // Uploaded files carry an extension in their name; recorded blobs are webm.
        const ext =
          fileOrBlob instanceof File ? fileOrBlob.name.split('.').pop() || 'webm' : 'webm'
        const filename = generateFilename(ext)
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, fileOrBlob, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), {
          uri: downloadUrl,
          mediaUrls: [downloadUrl],
        })
        setTodayArtifacts((prev) => [
          { ...artifact, id: docRef.id, uri: downloadUrl, mediaUrls: [downloadUrl] },
          ...prev,
        ])
        const minutes = parsedDuration
        const hoursOk = minutes > 0 ? await writeHours(minutes, title) : false
        completeSave(claim, { artifactSaved: true, hoursMinutes: minutes, hoursOk })
      } catch (err) {
        console.error('Audio upload failed', err)
        failSave(claim, 'Audio upload failed.')
      } finally {
        setMediaUploading(false)
        endSave()
      }
    },
    [
      beginSave,
      endSave,
      activityName,
      today,
      buildArtifactBase,
      familyId,
      setTodayArtifacts,
      parsedDuration,
      writeHours,
      completeSave,
      failSave,
    ],
  )

  // The media surfaces disable their own commit buttons while `uploading`, so
  // a save pending on ANY pathway reads as busy there too (FIX-262).
  const mediaBusy = mediaUploading || savePending

  // ── Kid save (always visible) disabled state ──
  const kidSaveDisabled = !selectedPresetId || parsedDuration <= 0
  const kidSaveHelper = !selectedPresetId
    ? 'Tap a chip above to start'
    : parsedDuration <= 0
      ? 'Use + to add some minutes'
      : undefined

  const handleKidSave = useCallback(async (claim: CaptureDraftClaim) => {
    if (kidSaveDisabled) return
    if (!beginSave()) return
    try {
      const minutes = parsedDuration
      const hoursOk = await writeHours(minutes, activityName.trim())
      completeSave(claim, { artifactSaved: false, hoursMinutes: minutes, hoursOk })
    } finally {
      endSave()
    }
  }, [
    kidSaveDisabled,
    beginSave,
    endSave,
    parsedDuration,
    writeHours,
    activityName,
    completeSave,
  ])

  const stepDuration = useCallback((delta: number) => {
    const current = parsedDuration
    const next = Math.max(0, Math.min(MAX_DURATION_MINUTES, current + delta))
    markDraftEdited()
    setDurationInput(next === 0 ? '' : String(next))
  }, [parsedDuration, markDraftEdited])

  // A family chip carries no emoji by design (see `quickLogChips.ts`), so the
  // label is the name alone rather than a leading space where one would go.
  const presetChipLabel = (preset: CapturePreset) =>
    preset.emoji ? `${preset.emoji} ${preset.label}` : preset.label

  const renderChip = (preset: CapturePreset) => {
    const selected = selectedPresetId === preset.id
    return (
      <Chip
        key={preset.id}
        label={presetChipLabel(preset)}
        onClick={() => handlePresetTap(preset)}
        variant={selected ? 'filled' : 'outlined'}
        sx={{
          py: 2.5,
          px: 1,
          height: 'auto',
          fontSize: '1rem',
          fontFamily: kidTheme.fontFamily,
          bgcolor: selected ? kidTheme.chipSelectedBg : undefined,
          borderColor: kidTheme.accent,
          borderWidth: 2,
          color: selected ? '#000' : 'text.primary',
          '& .MuiChip-label': {
            px: 1.25,
            py: 0.5,
            fontSize: '0.95rem',
            whiteSpace: 'normal',
          },
        }}
      />
    )
  }

  return (
    <SectionCard title="Capture">
      <Stack spacing={2}>
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              mb: 1,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Quick logs
          </Typography>
          <Stack spacing={1.5}>
            {presetGroups.map((group) => (
              <Box key={group.label}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: 'block',
                    mb: 0.5,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    fontSize: 12,
                  }}
                >
                  {group.label}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {group.presets.map(renderChip)}
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              mb: 1,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontSize: 12,
            }}
          >
            How long?
          </Typography>
          <Stack direction="row" alignItems="center" spacing={2} justifyContent="center">
            <IconButton
              size="large"
              onClick={() => stepDuration(-DURATION_STEP)}
              disabled={parsedDuration <= 0}
              aria-label="Decrease duration"
              sx={{
                border: '2px solid',
                borderColor: kidTheme.accent,
                width: 56,
                height: 56,
              }}
            >
              <RemoveIcon fontSize="large" />
            </IconButton>
            <Typography
              variant="h3"
              sx={{
                minWidth: 96,
                textAlign: 'center',
                fontFamily: kidTheme.fontFamily,
                fontSize: kidTheme.fontFamily ? '1.5rem' : '2.5rem',
              }}
              aria-label="Duration in minutes"
              data-testid="kid-duration-display"
            >
              {parsedDuration}
            </Typography>
            <IconButton
              size="large"
              onClick={() => stepDuration(DURATION_STEP)}
              disabled={parsedDuration >= MAX_DURATION_MINUTES}
              aria-label="Increase duration"
              sx={{
                border: '2px solid',
                borderColor: kidTheme.accent,
                width: 56,
                height: 56,
              }}
            >
              <AddIcon fontSize="large" />
            </IconButton>
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 1, textAlign: 'center' }}
          >
            minutes
          </Typography>
        </Box>

        <ToggleButtonGroup
          value={mediaTab}
          exclusive
          onChange={(_event, value) => {
            // The tab is part of the draft `resetForm` would restore, and
            // leaving a tab unmounts whatever that surface had staged — so a
            // save already in flight must not clear over it.
            markDraftEdited()
            setMediaTab(value as MediaTab | null)
          }}
          fullWidth
          size="large"
        >
          <ToggleButton value="photo">📷 Photo</ToggleButton>
          <ToggleButton value="audio">🎤 Audio</ToggleButton>
        </ToggleButtonGroup>

        {mediaTab === 'photo' && (
          // Kid mode stays single-photo (one artifact per photo). The claim is
          // this render's, so a shot still compressing when the day or a field
          // moves lands as the capture it was taken for.
          <PhotoCapture
            onCapture={(file) => void handlePhotoCapture([file], renderedClaim)}
            onDraftChange={markDraftEdited}
            uploading={mediaBusy}
          />
        )}
        {mediaTab === 'audio' && (
          <AudioRecorder
            onCapture={(blob) => void handleAudioCapture(blob, renderedClaim)}
            onDraftChange={markDraftEdited}
            uploading={mediaBusy}
            allowUpload={false}
          />
        )}

        <Stack spacing={0.5}>
          <Button
            variant="contained"
            color={kidTheme.saveColor}
            onClick={() => void handleKidSave(renderedClaim)}
            disabled={kidSaveDisabled || savePending}
            size="large"
            fullWidth
            sx={{
              py: 1.75,
              fontSize: '1.1rem',
              fontFamily: kidTheme.fontFamily,
              bgcolor: kidTheme.accent,
              color: '#000',
              '&:hover': { bgcolor: kidTheme.accent, opacity: 0.9 },
              '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
            }}
            title={savePending ? 'Saving…' : kidSaveHelper}
          >
            {/* UX-74: this button saves no capture — `handleKidSave` writes
                hours and passes `artifactSaved: false`. Name it what it does. */}
            Save my time
          </Button>
          {(savePending || kidSaveHelper) && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', textAlign: 'center' }}
            >
              {savePending ? 'Saving…' : kidSaveHelper}
            </Typography>
          )}
        </Stack>
      </Stack>
    </SectionCard>
  )
}
