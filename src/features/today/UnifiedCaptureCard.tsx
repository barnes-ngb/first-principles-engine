import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto'
import RemoveIcon from '@mui/icons-material/Remove'
import { addDoc, doc, updateDoc } from 'firebase/firestore'
import { Link as RouterLink } from 'react-router-dom'

import AudioRecorder from '../../components/AudioRecorder'
import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
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
  SubjectBucketLabel,
} from '../../core/types/enums'
// UX-184: the quick-log presets — the family's own and the eight built-ins —
// have one definition, shared with Kid Today's "⭐ I Did More!" row. See the
// note below, where they used to live.
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
// the wording of the receipt when it may not (G1/G2). See the file header.
import {
  captureErrorText,
  captureSuccessText,
  captureUnsavedText,
  classifyDraftClaim,
  type CaptureDraftClaim,
  type CaptureDraftVerdict,
} from './captureDraftOwnership'
// FIX-266: the parent picker's word for a bucket. Display only — the option
// values are still the stored `SubjectBucket` members.
import { captureCategoryLabel } from './captureCategoryLabels'
import TodayEvidenceList from './TodayEvidenceList'
import { EvidenceAudience, evidenceCopy } from './todayEvidence'

const MAX_DURATION_MINUTES = 240
const DURATION_STEP = 5

// ── UX-184: the quick-log chips come from the family here too ───────────────
//
// This panel's eight presets were written into this file while FEAT-199 made
// Kid Today's OTHER quick-log row (`KidExtraLogger`, further down the same page)
// family-defined. The owner flagged two activities, opened his son's Today page,
// read the first quick-log panel he came to — this one — and reported the new
// activities missing. They were; this surface was the one FEAT-199 did not
// touch.
//
// The eight built-ins moved verbatim into `quickLogChips.ts`, which now owns the
// answer for both surfaces. Nothing about what a chip WRITES changed: a preset
// still pre-fills the name, the subject and a suggested duration the person can
// edit, and the subject on a family chip is the config's own `subjectBucket` —
// never guessed from its name.

type MediaTab = 'note' | 'photo' | 'audio'

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
   * The live day's checklist, so the evidence list below can say WHICH ROW each
   * piece of evidence belongs to (UX-431). Optional and absent-able: a day with
   * no document yet has none, and the list says *(not attached to a row)*
   * rather than asserting anything about a list it was not handed.
   */
  todayChecklist?: ChecklistItem[]
  /**
   * The artifact read dropped. A failed read is never rendered as an empty day
   * (UX-431) — the house rule, stated in four places on the weekly review.
   */
  artifactsFailed?: boolean
  /** A pending read must not claim the displayed scope is an empty day. */
  artifactsLoading?: boolean
  /**
   * The family's own `FamilySettings.timeZone` (Codex round 1, P2) — the clock
   * the evidence list reads each stamp in. Absent or unparseable falls back to
   * the app's default inside `resolveFamilyTimeZone`.
   */
  familyTimeZone?: string
  onSnackMessage: (msg: { text: string; severity: 'success' | 'error' }) => void
  /** 'parent' (default) — full form. 'kid' — chip-required, +/- duration, audio-only note. */
  variant?: Variant
  /** Required when variant='kid' for per-child theming. */
  activeChild?: Child
}

export default function UnifiedCaptureCard({
  familyId,
  selectedChildId,
  today,
  weekPlanId,
  selectableChildren,
  todayArtifacts,
  setTodayArtifacts,
  todayChecklist = [],
  artifactsFailed = false,
  artifactsLoading = false,
  familyTimeZone,
  onSnackMessage,
  variant = 'parent',
  activeChild,
}: UnifiedCaptureCardProps) {
  const isKid = variant === 'kid'
  const kidTheme = useMemo(
    () => (isKid ? getKidTheme(activeChild?.name) : null),
    [isKid, activeChild?.name],
  )

  // Kid variant defaults the media row to no tab selected; parent stays on note.
  const [mediaTab, setMediaTab] = useState<MediaTab | null>(isKid ? null : 'note')
  const [mediaUploading, setMediaUploading] = useState(false)
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false)
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [childId, setChildId] = useState(selectedChildId)

  // UX-184: the family's flagged activities lead the panel, ahead of the
  // built-ins. Read-only, keyed to the child being logged for — so a parent
  // switching child in the form below gets that child's chips.
  const activityConfigs = useChatActivityConfigs(familyId, childId)
  const presetGroups = useMemo(
    () => resolveCapturePresetGroups(activityConfigs),
    [activityConfigs],
  )
  const [activityName, setActivityName] = useState('')
  const [subjectBucket, setSubjectBucket] = useState<SubjectBucket>(SubjectBucket.Other)
  const [durationInput, setDurationInput] = useState('')
  const [noteText, setNoteText] = useState('')

  // Keep childId in sync with active child
  useEffect(() => {
    setChildId(selectedChildId)
  }, [selectedChildId])

  // UX-184 follow-up (Codex round 1, P2): a family preset is CHILD-SCOPED — it
  // is offered because a config for this child (or 'both') is flagged — so
  // changing child replaces the chip row while the preset's name, subject and
  // minutes stay in the fields it filled. Saving then writes one child's
  // activity, with its category and duration, onto the OTHER child's hours,
  // with no chip on screen to explain where it came from.
  //
  // Clears exactly the three fields a preset fills, the same set
  // `handlePresetTap`'s de-select branch clears. The eight built-ins are valid
  // for every child, so a built-in selection survives the switch untouched —
  // and the check is on the id's own shape rather than on the resolved list,
  // which by this point no longer holds the preset being asked about.
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
  // as `false`; `savePending` only says so on screen. ONE latch for the whole
  // card: the tabs share the child, category and minutes. In-session only (no
  // cross-session idempotency, no durable retry), released on every exit.
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
  // The two counters `captureDraftOwnership` compares, held in refs so a
  // completion can read the CURRENT values synchronously — the same reason the
  // FIX-262 latch is a ref.
  //
  // `visit` is an epoch over the editor's scope, bumped during render so it has
  // already moved by the time any handler created in this render can be used.
  // Day A → day B → day A is visit 2, not visit 0 restored: the parent went
  // somewhere and came back, so what is on screen is no longer the draft they
  // submitted.
  //
  // The key holds every input that re-points the card: the family, the day, and
  // BOTH children — the shell's `selectedChildId` leads the card's `childId` by
  // a render, the sync below being an effect, so keying on both moves the visit
  // in the render the prop changed in and catches a shell switch to the child
  // the card's own picker already holds.
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

  /**
   * One edit to the draft. Called by every control that changes what WOULD be
   * saved: chips, name, category, minutes, note, the media tab `resetForm`
   * restores, and — through `onDraftChange` — the photos and audio a media
   * surface stages on its own, which this card otherwise cannot see.
   */
  const markDraftEdited = useCallback(() => {
    revisionRef.current += 1
    setRevision(revisionRef.current)
  }, [])

  // ── The photo dialog's own identity ───────────────────────────────────────
  //
  // Counted per OPENING and retired by a cancel or a commit, so the commit
  // callback an opening handed out can only ever close THAT dialog: Escape,
  // reopen, and an old tap used to shut the parent's new one.
  //
  // Deliberately not the draft `revision` — opening a dialog edits nothing, and
  // retiring one must not make a capture in flight look stale. A scope change
  // does not retire it either: the dialog on screen is still the one being
  // submitted, and whether the FORM may clear is the claim's question.
  const dialogOpeningRef = useRef(0)
  const dialogOpening = dialogOpeningRef.current

  const openPhotoDialog = useCallback(() => {
    dialogOpeningRef.current += 1
    setPhotoDialogOpen(true)
  }, [])

  const closePhotoDialog = useCallback(() => {
    dialogOpeningRef.current += 1
    setPhotoDialogOpen(false)
  }, [])

  /**
   * The identity of the draft AS THIS RENDER SHOWS IT, handed to every save
   * handler at the point the handler is created.
   *
   * Bound to the render rather than read fresh when the handler runs, because
   * the media surfaces hold a callback across an `await`: `PhotoCapture`
   * compresses after the tap and `AudioRecorder` resolves a blob later, so a
   * callback can be INVOKED after the day or the fields moved. Reading the refs
   * at invocation would hand that stale payload permission to clear a draft it
   * was never started from.
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
    setNoteText('')
    setMediaTab(isKid ? null : 'note')
  }, [isKid])

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
   * The ONE completion for every pathway (note, time-only, photo, audio, kid).
   * It decides both things a finished save does to the form — whether the
   * fields clear and what the receipt says — from the one claim, so no pathway
   * can clear a draft it does not own or report a save it did not make.
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
      //
      // An OWNED completion resets even when the hours were refused, which is
      // the behaviour this card already had: the clear is the card's existing
      // answer to a finished attempt, and the receipt above sends the parent to
      // Records rather than offering a retry here. Nothing about that changes
      // in this fix — durable recovery for a half-written capture is its own
      // problem. What changes is WHOSE form may be reset.
      if (verdict === 'owned') resetForm()
    },
    [onSnackMessage, verdictFor, resetForm],
  )

  /**
   * The same gate for a THROWN save — a note or an upload that never landed.
   * These paths clear nothing at all (the form is kept for the retry the
   * FIX-262 latch release makes possible), so this only decides what the error
   * is ABOUT: a stale error must say which capture failed rather than appearing
   * to judge the draft in front of the parent.
   */
  const failSave = useCallback(
    (claim: CaptureDraftClaim, base: string) => {
      onSnackMessage({ text: captureErrorText(base, verdictFor(claim), claim), severity: 'error' })
    },
    [onSnackMessage, verdictFor],
  )

  // Every pathway below takes its `claim` from the caller — the render that
  // created the control the person used — rather than reading the refs here.
  const handleNoteSave = useCallback(async (claim: CaptureDraftClaim) => {
    if (!beginSave()) return
    try {
      const content = noteText.trim()
      const minutes = parsedDuration
      const titleSeed = activityName.trim() || content.slice(0, 60) || `Capture ${today}`
      const hoursNotes = activityName.trim()
        ? content
          ? `${activityName.trim()}: ${content}`
          : activityName.trim()
        : content

      let artifactSaved = false
      if (content) {
        try {
          const artifact = {
            ...buildArtifactBase(titleSeed, EvidenceType.Note),
            content: noteText,
            activityName: activityName.trim() || undefined,
          }
          const docRef = await addDoc(artifactsCollection(familyId), artifact)
          setTodayArtifacts((prev) => [{ ...artifact, id: docRef.id }, ...prev])
          artifactSaved = true
        } catch (err) {
          console.error('Failed to save artifact', err)
          failSave(claim, 'Failed to save note.')
          // The early return keeps the form filled for a retry; `finally`
          // releases the latch so that retry is possible at all.
          return
        }
      }

      const hoursOk = minutes > 0 ? await writeHours(minutes, hoursNotes) : false
      completeSave(claim, { artifactSaved, hoursMinutes: minutes, hoursOk })
    } finally {
      endSave()
    }
  }, [
    beginSave,
    endSave,
    noteText,
    parsedDuration,
    activityName,
    today,
    buildArtifactBase,
    familyId,
    setTodayArtifacts,
    writeHours,
    completeSave,
    failSave,
  ])

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

  // ── Parent save (note tab) disabled state ──
  const noteSaveDisabled =
    mediaTab !== 'note' ||
    (!noteText.trim() && parsedDuration <= 0) ||
    (parsedDuration > 0 && (!childId || !subjectBucket))

  const noteSaveTooltip = (() => {
    if (mediaTab !== 'note') return undefined
    if (savePending) return 'Saving…'
    if (!noteText.trim() && parsedDuration <= 0) {
      return 'Add a photo, audio, note, or duration'
    }
    if (parsedDuration > 0 && (!childId || !subjectBucket)) {
      return 'Pick a child and subject first'
    }
    return undefined
  })()

  // The media surfaces disable their own commit buttons while `uploading`, so
  // a save pending on ANY pathway reads as busy there too (FIX-262) — the one
  // latch, said once on screen.
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

  // ── Chip rendering helpers ──
  // A family chip carries no emoji by design (see `quickLogChips.ts`), so the
  // label is the name alone rather than a leading space where one would go.
  const presetChipLabel = (preset: CapturePreset) =>
    preset.emoji ? `${preset.emoji} ${preset.label}` : preset.label

  const renderChip = (preset: CapturePreset) => {
    const selected = selectedPresetId === preset.id
    if (isKid && kidTheme) {
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
      <Chip
        key={preset.id}
        label={presetChipLabel(preset)}
        onClick={() => handlePresetTap(preset)}
        color={selected ? 'primary' : 'default'}
        variant={selected ? 'filled' : 'outlined'}
        size="small"
      />
    )
  }

  return (
    <>
      <SectionCard title="Capture">
        <Stack spacing={2}>
          {/* FIX-266 — what this card is, before its first control: the panel
              leads with a photo button and quick-log chips, and nothing said a
              note or minutes alone is enough. Parent only; the kid card is
              chip-first by design and keeps its own copy. */}
          {!isKid && (
            <Typography variant="body2" color="text.secondary">
              Log anything extra here — a note or some minutes is enough, and
              photos are optional. The quick logs below are shortcuts that fill
              in this form for you.
            </Typography>
          )}
          {!isKid && (
            <Button
              variant="outlined"
              startIcon={<AddAPhotoIcon />}
              fullWidth
              onClick={openPhotoDialog}
            >
              Add photos of today's work
            </Button>
          )}
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
                  <Stack
                    direction="row"
                    spacing={isKid ? 1 : 0.75}
                    flexWrap="wrap"
                    useFlexGap
                  >
                    {group.presets.map(renderChip)}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>

          <Divider />

          {!isKid && (
            <TextField
              label="Child"
              select
              value={childId}
              onChange={(event) => setChildId(event.target.value)}
            >
              <MenuItem value="" disabled>
                Select child
              </MenuItem>
              {selectableChildren.map((child) => (
                <MenuItem key={child.id} value={child.id}>
                  {child.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          {!isKid && (
            <TextField
              label="What is this?"
              placeholder="e.g. dentist visit, made a fort"
              value={activityName}
              onChange={(event) => {
                markDraftEdited()
                setActivityName(event.target.value)
              }}
            />
          )}

          {/* FIX-266: the VALUE is the stored bucket; only the WORD is the
              parent form's own, so History has a category to pick. */}
          {!isKid && (
            <TextField
              label="Category"
              select
              value={subjectBucket}
              onChange={(event) => {
                markDraftEdited()
                setSubjectBucket(event.target.value as SubjectBucket)
              }}
            >
              {Object.values(SubjectBucket).map((bucket) => (
                <MenuItem key={bucket} value={bucket}>
                  {captureCategoryLabel(bucket)}
                </MenuItem>
              ))}
            </TextField>
          )}

          {isKid ? (
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
                    borderColor: kidTheme?.accent ?? 'primary.main',
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
                    fontFamily: kidTheme?.fontFamily,
                    fontSize: kidTheme?.fontFamily ? '1.5rem' : '2.5rem',
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
                    borderColor: kidTheme?.accent ?? 'primary.main',
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
          ) : (
            <Box>
              <TextField
                label="How long? (optional)"
                type="number"
                value={durationInput}
                onChange={(event) => {
                  const raw = event.target.value
                  if (raw === '') {
                    markDraftEdited()
                    setDurationInput('')
                    return
                  }
                  const n = Math.floor(Number(raw))
                  // A rejected keystroke changes nothing, so it is not an edit.
                  if (!Number.isFinite(n) || n < 0) return
                  markDraftEdited()
                  setDurationInput(String(Math.min(n, MAX_DURATION_MINUTES)))
                }}
                inputProps={{
                  min: 0,
                  max: MAX_DURATION_MINUTES,
                  inputMode: 'numeric',
                  'aria-label': 'Duration in minutes',
                }}
                InputProps={{
                  endAdornment: (
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      minutes
                    </Typography>
                  ),
                }}
                fullWidth
              />
              {/* FIX-266 — an empty field promises nothing: every pathway gates
                  the `hours` row on `minutes > 0`, so a draft with no minutes
                  writes none. The positive preview is unchanged and still names
                  the bucket's own shared label. */}
              <Typography
                variant="caption"
                color="text.secondary"
                fontStyle="italic"
                sx={{ display: 'block', mt: 0.5 }}
              >
                {parsedDuration > 0
                  ? `Will log ${parsedDuration} minutes to ${SubjectBucketLabel[subjectBucket]}`
                  : 'Add minutes if you want to log time.'}
              </Typography>
            </Box>
          )}

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
            {!isKid && <ToggleButton value="note">Note</ToggleButton>}
            <ToggleButton value="photo">📷 Photo</ToggleButton>
            <ToggleButton value="audio">🎤 Audio</ToggleButton>
          </ToggleButtonGroup>

          {mediaTab === 'note' && !isKid && (
            <>
              <TextField
                label="Note (optional)"
                multiline
                minRows={3}
                value={noteText}
                onChange={(event) => {
                  markDraftEdited()
                  setNoteText(event.target.value)
                }}
              />
              <Stack spacing={0.5}>
                <Button
                  variant="contained"
                  onClick={() => void handleNoteSave(renderedClaim)}
                  disabled={noteSaveDisabled || savePending}
                  title={noteSaveTooltip}
                >
                  {/* The label stays put while a save is pending — the caption
                      below carries the status, so it is readable without a
                      hover and the button keeps one name. */}
                  Save Capture
                </Button>
                {savePending && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    role="status"
                    sx={{ display: 'block', textAlign: 'center' }}
                  >
                    Saving…
                  </Typography>
                )}
              </Stack>
            </>
          )}
          {mediaTab === 'photo' &&
            (isKid ? (
              // Kid mode stays single-photo (one artifact per photo). The claim
              // is this render's, so a shot still compressing when the day or a
              // field moves lands as the capture it was taken for.
              <PhotoCapture
                onCapture={(file) => void handlePhotoCapture([file], renderedClaim)}
                onDraftChange={markDraftEdited}
                uploading={mediaBusy}
              />
            ) : (
              // Parent mode stages several photos into ONE artifact.
              <PhotoCapture
                multiple
                onCaptureBatch={(files) => void handlePhotoCapture(files, renderedClaim)}
                onDraftChange={markDraftEdited}
                uploading={mediaBusy}
              />
            ))}
          {mediaTab === 'audio' && (
            <AudioRecorder
              onCapture={(blob) => void handleAudioCapture(blob, renderedClaim)}
              onDraftChange={markDraftEdited}
              uploading={mediaBusy}
              allowUpload={!isKid}
            />
          )}

          {isKid && kidTheme && (
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
          )}
        </Stack>
      </SectionCard>

      {/*
        UX-431 — *Today's evidence*: every artifact the day produced, with the
        time it was added and the row it belongs to.

        This section used to be titled *Artifacts* — the data model's word, not
        a parent's — and drew a title, a type chip and media for `Photo` and
        `Audio` only, so a note, a captured video link and a scanned page each
        rendered as a bare line with nothing under it, and nothing anywhere said
        WHEN. Owner, 2026-09-13: *"We should include any artifacts, not just the
        pictures, but the time that they were added, details."*

        It is UPGRADED IN PLACE rather than joined by a second list below it.
        There were already two lists of the same records on this page (this one
        and Kid Today's inventory); adding a third would be the duplication
        `FEAT-237` removed from this very screen one run earlier. Both render
        `TodayEvidenceList` now, so they cannot show different subsets again.

        Read-only: no write, no delete, no edit. Removing a piece of evidence
        from here is filed as `UX-433`, not built.
      */}
      {!isKid && (
        <SectionCard title={evidenceCopy(EvidenceAudience.Parent).title}>
          <Stack spacing={2}>
            <Link
              component={RouterLink}
              to="/records/portfolio"
              variant="body2"
              sx={{ alignSelf: 'flex-start', fontWeight: 600 }}
            >
              View all work in Portfolio →
            </Link>
            {artifactsLoading && !artifactsFailed && todayArtifacts.length === 0 ? (
              <Typography variant="body2" color="text.secondary" role="status">
                Loading evidence…
              </Typography>
            ) : (
              <TodayEvidenceList
                artifacts={todayArtifacts}
                checklist={todayChecklist}
                audience={EvidenceAudience.Parent}
                failed={artifactsFailed}
                timeZone={familyTimeZone}
              />
            )}
          </Stack>
        </SectionCard>
      )}

      {!isKid && (
        <Dialog fullWidth maxWidth="xs" open={photoDialogOpen} onClose={closePhotoDialog}>
          <DialogTitle>Add photos</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Snap or upload several photos of today's work — they save together as one entry.
            </Typography>
            {/* Opening or closing this dialog is not a draft change —
                `resetForm` does not touch it — but the photos staged inside it
                are, and they arrive through the same seam. */}
            <PhotoCapture
              multiple
              uploading={mediaBusy}
              onDraftChange={markDraftEdited}
              onCaptureBatch={(files) => {
                // Only the opening this callback came from may act. A callback
                // kept from a retired opening writes nothing and, above all,
                // closes nothing: the dialog on screen is a different one.
                if (dialogOpeningRef.current !== dialogOpening) return
                // This opening is done with: it has had its one commit.
                dialogOpeningRef.current += 1
                setPhotoDialogOpen(false)
                if (files.length) void handlePhotoCapture(files, renderedClaim)
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
