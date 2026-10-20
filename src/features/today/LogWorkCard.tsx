/**
 * *Log work* — the parent's ONE form for anything extra (FIX-267).
 *
 * ── What was wrong ─────────────────────────────────────────────────────────
 *
 * The parent half of `UnifiedCaptureCard` was four surfaces pretending to be
 * one card, and a parent could not predict what any of them would save:
 *
 *   • **The typed note was dropped.** `handlePhotoCapture` and
 *     `handleAudioCapture` built their own artifact and never read `noteText`,
 *     so a note typed beside a photo was lost — and the Note tab UNMOUNTED the
 *     field when the parent moved to the photo tab, so the loss was invisible.
 *   • **A photo could be taken in two places.** A modal at the top of the card
 *     ("Add photos of today's work") held a second `PhotoCapture`. It inherited
 *     the form's child, category and minutes and showed NONE of them, so the
 *     parent chose photos with no sight of what they would be filed under.
 *   • **Audio committed itself.** Choosing a file wrote the artifact and
 *     uploaded it on selection — no preview, no confirmation, no way back.
 *   • **A save had no second half.** Every pathway was `addDoc` → upload →
 *     `addDoc`, with no memory: a failure in the middle gave an error and one
 *     route forward (tap Save again), which wrote the record a second time.
 *
 * ── What this is ───────────────────────────────────────────────────────────
 *
 * One draft, four optional parts (activity · time · note · one attachment),
 * **one explicit *Save work*** and a summary above it that states exactly what
 * will be written and whether time is recorded. Staging is staging: a photo or
 * a recording chosen here reaches Firestore only when that button is tapped.
 *
 * **There is ONE tray, and it is this card's.** The shared media components are
 * mounted in their opt-in direct-staging mode (`onStageFiles`, `stageDirect`),
 * so a selected photo or a finished take is handed straight over and nothing is
 * held inside them. Two trays meant a photo could be visible on screen and
 * absent from the draft: the main Save wrote without it, and a child switch
 * left it sitting in the child component for the next child to attach. The
 * components are also KEYED on the scope, so a change remounts them and no
 * selection, recording or in-flight compression can cross it — and their late
 * callbacks carry the visit they were made in, so one that lands afterwards is
 * refused rather than re-bound.
 *
 * Three rails are inherited rather than reinvented:
 *
 *   • `captureDraftOwnership` (FIX-263) decides whether a finished save may
 *     clear the form and what its receipt says — so an old completion still
 *     cannot clear a newer draft or claim a save for the wrong child or day;
 *   • the FIX-262 latch is one ref for the whole card, claimed before the first
 *     `await`, so a double tap is one write;
 *   • `logWorkSave` owns the writes, the document identity and the resume, so
 *     a partial save can be finished rather than repeated.
 *
 * **Child switch (`UX-329` registry): RESET for the attachment, BIND for the
 * unfinished save.** A staged photo is dropped when the child or day changes,
 * with the loss made visible, because carrying it would file one boy's work
 * under his brother. An unfinished save is already addressed to the child and
 * day it was submitted for, so it stays on screen as a bound card naming both
 * and retries into that identity whatever the page now shows.
 *
 * **No draft survives a reload.** Nothing here is persisted, and no copy on
 * this card says otherwise.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
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
import CloseIcon from '@mui/icons-material/Close'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Link as RouterLink } from 'react-router-dom'

import AudioRecorder from '../../components/AudioRecorder'
import PhotoCapture from '../../components/PhotoCapture'
import SectionCard from '../../components/SectionCard'
import type { Artifact, ChecklistItem, Child } from '../../core/types'
import { EvidenceType, SubjectBucket, SubjectBucketLabel } from '../../core/types/enums'
import { todayKey } from '../../core/utils/dateKey'
import {
  captureErrorText,
  captureSuccessText,
  classifyDraftClaim,
  type CaptureDraftClaim,
  type CaptureDraftVerdict,
} from './captureDraftOwnership'
import { captureCategoryLabel } from './captureCategoryLabels'
import { LOG_WORK_ANCHOR_ID } from './logWorkJump'
import {
  DEFAULT_LOG_WORK_BUCKET,
  LOG_WORK_TITLE,
  MEDIA_CLEARED_ON_SCOPE_CHANGE,
  describeEvidence,
  logWorkBlockedReason,
  logWorkDayLabel,
  logWorkReceiptBase,
  logWorkSaveable,
  logWorkSummary,
  mediaReplaceQuestion,
  presetOverwriteQuestion,
  presetOverwrites,
  selectedDayNotice,
  stopPendingQuestion,
  type LogWorkDraft,
  type LogWorkMediaKind,
  type PresetField,
} from './logWorkDraft'
import {
  NO_LOG_WORK_PROGRESS,
  describeLogWorkPartial,
  executeLogWorkSave,
  logWorkFilenames,
  logWorkPartialBase,
  logWorkRetryReceipt,
  newLogWorkIds,
  type LogWorkOutcome,
  type LogWorkPartialReport,
  type LogWorkProgress,
  type LogWorkSubmission,
} from './logWorkSave'
import {
  isFamilyCapturePresetId,
  resolveCapturePresetGroups,
  type CapturePreset,
} from './quickLogChips'
import { useChatActivityConfigs } from '../shelly-chat/useChatActivityConfigs'
import TodayEvidenceList from './TodayEvidenceList'
import { EvidenceAudience, evidenceCopy } from './todayEvidence'

const MAX_DURATION_MINUTES = 240

/** A photo held in the form. The URL is this component's to revoke. */
interface StagedPhoto {
  file: File
  url: string
}

/** A recording or audio file held in the form, not yet uploaded. */
interface StagedAudio {
  blob: Blob
  url: string
  label: string
}

/**
 * Which media instance a callback came from — the scope it was mounted for and
 * that mount's own generation.
 */
interface MediaToken {
  visit: number
  generation: number
}

/**
 * An unfinished save, bound to what was submitted.
 *
 * It carries the ORIGINAL ownership claim, not a fresh one: when the retry
 * finishes, the question *"may this clear the form?"* is the same question the
 * first attempt asked, so a draft nobody has touched since is cleared and a
 * draft that has moved on is left alone. Without it a successful retry left the
 * submitted words in the form with Save live, and the next tap filed them
 * again under new ids.
 */
interface PendingSave {
  submission: LogWorkSubmission
  progress: LogWorkProgress
  report: LogWorkPartialReport
  claim: CaptureDraftClaim
}

export interface LogWorkCardProps {
  familyId: string
  selectedChildId: string
  today: string
  weekPlanId: string | undefined
  selectableChildren: Child[]
  todayArtifacts: Artifact[]
  setTodayArtifacts: Dispatch<SetStateAction<Artifact[]>>
  todayChecklist?: ChecklistItem[]
  artifactsFailed?: boolean
  artifactsLoading?: boolean
  familyTimeZone?: string
  onSnackMessage: (msg: { text: string; severity: 'success' | 'error' }) => void
  /** The child the shell is on, for the name in the form and the receipt. */
  activeChild?: Child
}

export default function LogWorkCard({
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
  activeChild,
}: LogWorkCardProps) {
  const [childId, setChildId] = useState(selectedChildId)
  const [activityName, setActivityName] = useState('')
  const [subjectBucket, setSubjectBucket] = useState<SubjectBucket>(DEFAULT_LOG_WORK_BUCKET)
  const [durationInput, setDurationInput] = useState('')
  const [noteText, setNoteText] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  /** The three quick-fill fields a parent has typed in by hand. */
  const [editedFields, setEditedFields] = useState<ReadonlySet<PresetField>>(new Set())
  const [quickFillOpen, setQuickFillOpen] = useState(false)

  const [mediaKind, setMediaKind] = useState<LogWorkMediaKind | null>(null)
  const [photos, setPhotos] = useState<StagedPhoto[]>([])
  const [audio, setAudio] = useState<StagedAudio | null>(null)
  const [mediaNotice, setMediaNotice] = useState<string | null>(null)
  const [presetNotice, setPresetNotice] = useState<string | null>(null)
  /**
   * The media surface is still working — compressing a photo, or recording.
   * The draft is incomplete while it is true, so *Save work* waits: saving
   * through it is how a log gets filed without the photo that was arriving.
   */
  const [mediaWorking, setMediaWorking] = useState(false)
  /** A photo the surface could not process. Visible, and never silent. */
  const [mediaError, setMediaError] = useState<string | null>(null)
  /**
   * The media surface's generation. Bumped to remount it — after a save, a
   * discard, a replacement, or a removal that empties the tray.
   *
   * Both a ref and state, for the reason `revision` is: the ref is the current
   * truth a late callback is judged against and moves SYNCHRONOUSLY with the
   * action that cancelled it, while the state exists to re-key the component.
   * A visit alone cannot tell these apart — discarding a draft and choosing
   * Audio instead both happen inside one visit, and a photo still compressing
   * when they happen must not reattach itself afterwards.
   */
  const mediaGenRef = useRef(0)
  const [mediaResetSeq, setMediaResetSeq] = useState(0)
  const bumpMediaGeneration = useCallback(() => {
    mediaGenRef.current += 1
    setMediaResetSeq(mediaGenRef.current)
  }, [])

  /** The two small confirmations this form asks, instead of a second page. */
  const [presetConflict, setPresetConflict] = useState<{
    preset: CapturePreset
    fields: PresetField[]
  } | null>(null)
  const [mediaSwitch, setMediaSwitch] = useState<{
    from: LogWorkMediaKind
    to: LogWorkMediaKind | null
  } | null>(null)

  const [pending, setPending] = useState<PendingSave | null>(null)
  const [stopConfirm, setStopConfirm] = useState(false)

  // Keep the form's child in step with the shell's.
  useEffect(() => {
    setChildId(selectedChildId)
  }, [selectedChildId])

  const activityConfigs = useChatActivityConfigs(familyId, childId)
  const presetGroups = useMemo(
    () => resolveCapturePresetGroups(activityConfigs),
    [activityConfigs],
  )

  // ── The latch: one save at a time, card-wide (FIX-262) ────────────────────
  const savePendingRef = useRef(false)
  const [savePending, setSavePending] = useState(false)
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

  // ── Draft identity: whose draft is this, and has it moved? (FIX-263) ──────
  const scopeKey = `${familyId}\u0000${selectedChildId}\u0000${childId}\u0000${today}`
  const visitRef = useRef({ key: scopeKey, visit: 0 })
  if (visitRef.current.key !== scopeKey) {
    visitRef.current = { key: scopeKey, visit: visitRef.current.visit + 1 }
  }
  const revisionRef = useRef(0)
  const [revision, setRevision] = useState(0)
  const markDraftEdited = useCallback(() => {
    revisionRef.current += 1
    setRevision(revisionRef.current)
  }, [])

  const markFieldEdited = useCallback(
    (field: PresetField) => {
      markDraftEdited()
      setEditedFields((prev) => {
        if (prev.has(field)) return prev
        const next = new Set(prev)
        next.add(field)
        return next
      })
    },
    [markDraftEdited],
  )

  const parsedDuration = useMemo(() => {
    if (durationInput.trim() === '') return 0
    const n = Math.floor(Number(durationInput))
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.min(n, MAX_DURATION_MINUTES)
  }, [durationInput])

  const activeChildName =
    selectableChildren.find((c) => c.id === childId)?.name ?? activeChild?.name ?? 'child'

  const renderedClaim: CaptureDraftClaim = {
    visit: visitRef.current.visit,
    revision,
    childName: activeChildName,
    day: today,
  }
  const verdictFor = useCallback(
    (claim: CaptureDraftClaim): CaptureDraftVerdict =>
      classifyDraftClaim(claim, {
        visit: visitRef.current.visit,
        revision: revisionRef.current,
      }),
    [],
  )

  // ── Staged media: this component owns the object URLs ─────────────────────
  const photosRef = useRef<StagedPhoto[]>([])
  const audioRef = useRef<StagedAudio | null>(null)
  useEffect(() => {
    photosRef.current = photos
  }, [photos])
  useEffect(() => {
    audioRef.current = audio
  }, [audio])
  useEffect(
    () => () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.url))
      if (audioRef.current) URL.revokeObjectURL(audioRef.current.url)
    },
    [],
  )

  const dropAllMedia = useCallback(() => {
    setPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.url))
      return []
    })
    setAudio((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    // Remount the surface with it: a file input keeps its last selection, and a
    // recorder keeps its take, neither of which belongs to the next draft. The
    // generation moves here, so anything the old instance is still doing is
    // already stale before this line returns.
    bumpMediaGeneration()
    setMediaWorking(false)
    setMediaError(null)
  }, [bumpMediaGeneration])

  /**
   * A child or day change drops the attachment rather than moving it.
   *
   * The registry's RESET verdict with the loss made visible: nothing has been
   * written, and a photo carried across a switch would be filed under the wrong
   * boy. The text fields are deliberately NOT cleared here — that is
   * `captureDraftOwnership`'s question, and the answer there is that a parent's
   * typing is hers.
   *
   * The surface is remounted whether or not the tray had anything in it, since
   * the thing that used to cross a switch was a selection the CHILD component
   * held — which this card cannot see. The notice is shown only when something
   * visible was taken away.
   */
  const prevScopeRef = useRef(scopeKey)
  useEffect(() => {
    if (prevScopeRef.current === scopeKey) return
    prevScopeRef.current = scopeKey
    const hadMedia = photosRef.current.length > 0 || audioRef.current !== null
    dropAllMedia()
    setMediaKind(null)
    if (hadMedia) {
      setMediaNotice(MEDIA_CLEARED_ON_SCOPE_CHANGE)
      markDraftEdited()
    }
  }, [scopeKey, dropAllMedia, markDraftEdited])

  /**
   * A family quick fill is CHILD-SCOPED (UX-184, Codex round 1): changing child
   * takes the chip row away, so the three fields it filled go with it rather
   * than writing one child's activity onto the other's hours. Built-ins are
   * valid for every child and survive.
   */
  const prevChildIdRef = useRef(childId)
  useEffect(() => {
    if (prevChildIdRef.current === childId) return
    prevChildIdRef.current = childId
    if (!isFamilyCapturePresetId(selectedPresetId)) return
    setSelectedPresetId(null)
    setActivityName('')
    setSubjectBucket(DEFAULT_LOG_WORK_BUCKET)
    setDurationInput('')
    setEditedFields(new Set())
  }, [childId, selectedPresetId])

  const draft: LogWorkDraft = {
    childName: activeChildName,
    day: today,
    activityName,
    subjectBucket,
    minutes: parsedDuration,
    note: noteText,
    mediaKind,
    photoCount: photos.length,
    hasAudio: Boolean(audio),
  }
  const summary = logWorkSummary(draft)
  const saveable = logWorkSaveable(draft)

  const resetForm = useCallback(() => {
    setSelectedPresetId(null)
    setActivityName('')
    setSubjectBucket(DEFAULT_LOG_WORK_BUCKET)
    setDurationInput('')
    setNoteText('')
    setEditedFields(new Set())
    setMediaKind(null)
    setMediaNotice(null)
    setPresetNotice(null)
    dropAllMedia()
  }, [dropAllMedia])

  /** Takes the files a save has written out of the tray — and only those. */
  const dropSavedMedia = useCallback((submission: LogWorkSubmission) => {
    const saved = new Set(submission.files.map((f) => f.file))
    if (saved.size === 0) return
    setPhotos((prev) => {
      const keep = prev.filter((p) => !saved.has(p.file))
      prev.filter((p) => saved.has(p.file)).forEach((p) => URL.revokeObjectURL(p.url))
      return keep.length === prev.length ? prev : keep
    })
    setAudio((prev) => {
      if (!prev || !saved.has(prev.blob)) return prev
      URL.revokeObjectURL(prev.url)
      return null
    })
  }, [])

  /** One place for the optimistic append, so a row cannot be added twice. */
  const publishArtifact = useCallback(
    (artifact: Artifact | null) => {
      if (!artifact) return
      setTodayArtifacts((prev) =>
        prev.some((a) => a.id === artifact.id)
          ? prev.map((a) => (a.id === artifact.id ? artifact : a))
          : [artifact, ...prev],
      )
    },
    [setTodayArtifacts],
  )

  // ── Quick fill ────────────────────────────────────────────────────────────
  const applyPreset = useCallback(
    (preset: CapturePreset) => {
      markDraftEdited()
      setSelectedPresetId(preset.id)
      setActivityName(preset.label)
      setSubjectBucket(preset.subjectBucket)
      setDurationInput(String(preset.suggestedMinutes))
      // The three fields are the preset's again, so later edits are edits.
      setEditedFields(new Set())
      setPresetNotice(null)
    },
    [markDraftEdited],
  )

  const handlePresetTap = useCallback(
    (preset: CapturePreset) => {
      if (selectedPresetId === preset.id) {
        // De-select. Only what the QUICK FILL put there is taken back; a value
        // the parent typed over it stays, and the form says so.
        markDraftEdited()
        setSelectedPresetId(null)
        if (!editedFields.has('name')) setActivityName('')
        if (!editedFields.has('category')) setSubjectBucket(DEFAULT_LOG_WORK_BUCKET)
        if (!editedFields.has('minutes')) setDurationInput('')
        setPresetNotice(
          editedFields.size > 0
            ? 'Quick fill cleared. What you typed yourself is still here.'
            : null,
        )
        return
      }
      const overwrites = presetOverwrites(editedFields)
      if (overwrites.length > 0) {
        setPresetConflict({ preset, fields: overwrites })
        return
      }
      applyPreset(preset)
    },
    [selectedPresetId, editedFields, applyPreset, markDraftEdited],
  )

  // ── The attachment ────────────────────────────────────────────────────────
  //
  // Every handler below takes the media instance it was created for: the VISIT
  // (family / child / day) and the GENERATION (this surface's own life). A
  // media surface can hand something over after the page has moved or after the
  // draft it belonged to was discarded or replaced — a compression that
  // outlived the change, a `MediaRecorder.onstop` firing on the way out. Such a
  // result is refused, not re-bound: it cannot attach itself to the new draft,
  // and it cannot release the new instance's busy state either.
  const ownsMedia = useCallback(
    (token: MediaToken) =>
      token.visit === visitRef.current.visit && token.generation === mediaGenRef.current,
    [],
  )

  const stagePhotos = useCallback(
    (files: File[], token: MediaToken) => {
      if (files.length === 0) return
      if (!ownsMedia(token)) return
      markDraftEdited()
      setMediaNotice(null)
      setPhotos((prev) => [
        ...prev,
        ...files.map((file) => ({ file, url: URL.createObjectURL(file) })),
      ])
    },
    [ownsMedia, markDraftEdited],
  )

  /** Busy belongs to ONE instance: a stale one may not say the card is free. */
  const reportMediaBusy = useCallback(
    (busy: boolean, token: MediaToken) => {
      if (!ownsMedia(token)) return
      setMediaWorking(busy)
    },
    [ownsMedia],
  )

  const reportMediaError = useCallback(
    (names: string[], token: MediaToken) => {
      if (!ownsMedia(token)) return
      setMediaError(
        names.length === 1
          ? `${names[0]} couldn’t be processed, so it is not attached. Your note and any other photos are still here.`
          : `${names.length} photos couldn’t be processed, so they are not attached. Your note and any other photos are still here.`,
      )
    },
    [ownsMedia],
  )

  const removePhoto = useCallback(
    (index: number) => {
      markDraftEdited()
      setPhotos((prev) => {
        const next = [...prev]
        const [removed] = next.splice(index, 1)
        if (removed) URL.revokeObjectURL(removed.url)
        // Emptied by hand: remount, so the file input does not still hold the
        // photo that was just taken out of the draft.
        if (next.length === 0) bumpMediaGeneration()
        return next
      })
    },
    [markDraftEdited, bumpMediaGeneration],
  )

  const stageAudio = useCallback(
    (blob: Blob, token: MediaToken) => {
      if (!ownsMedia(token)) return
      markDraftEdited()
      setMediaNotice(null)
      setAudio((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return {
          blob,
          url: URL.createObjectURL(blob),
          label: blob instanceof File ? blob.name : 'Recording',
        }
      })
    },
    [ownsMedia, markDraftEdited],
  )

  const removeAudio = useCallback(() => {
    markDraftEdited()
    setAudio((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    // Back to a recorder with nothing in it.
    bumpMediaGeneration()
  }, [markDraftEdited, bumpMediaGeneration])

  /**
   * The media surface's identity: the scope it was mounted for, plus this
   * card's generation counter. Changing the key REMOUNTS the shared component,
   * which is the only way to clear a file input or a take it owns; the same
   * pair travels with every callback it hands out.
   */
  const mediaInstanceKey = `${scopeKey}|${mediaResetSeq}`
  const mediaToken: MediaToken = {
    visit: visitRef.current.visit,
    generation: mediaResetSeq,
  }

  /**
   * One kind of media at a time, and never a silent swap: a staged photo is
   * removed only after the parent says so.
   */
  const requestMediaKind = useCallback(
    (next: LogWorkMediaKind | null) => {
      if (next === mediaKind) return
      const holdsPhotos = mediaKind === 'photo' && photos.length > 0
      const holdsAudio = mediaKind === 'audio' && Boolean(audio)
      if (mediaKind && (holdsPhotos || holdsAudio)) {
        setMediaSwitch({ from: mediaKind, to: next })
        return
      }
      markDraftEdited()
      setMediaNotice(null)
      setMediaKind(next)
    },
    [mediaKind, photos.length, audio, markDraftEdited],
  )

  const confirmMediaSwitch = useCallback(() => {
    if (!mediaSwitch) return
    markDraftEdited()
    dropAllMedia()
    setMediaKind(mediaSwitch.to)
    setMediaNotice(null)
    setMediaSwitch(null)
  }, [mediaSwitch, dropAllMedia, markDraftEdited])

  // ── Saving ────────────────────────────────────────────────────────────────

  /** The frozen snapshot of this tap. Nothing below it reads the form again. */
  const freezeSubmission = useCallback((): LogWorkSubmission => {
    const files: (Blob | File)[] =
      photos.length > 0 ? photos.map((p) => p.file) : audio ? [audio.blob] : []
    const evidenceType =
      files.length > 0
        ? photos.length > 0
          ? EvidenceType.Photo
          : EvidenceType.Audio
        : noteText.trim()
          ? EvidenceType.Note
          : null
    const ids = newLogWorkIds(familyId, {
      evidence: evidenceType !== null,
      hours: parsedDuration > 0,
    })
    return {
      familyId,
      artifactId: ids.artifactId,
      hoursId: ids.hoursId,
      childId,
      childName: activeChildName,
      day: today,
      weekPlanId,
      subjectBucket,
      activityName,
      note: noteText,
      minutes: parsedDuration,
      evidenceType,
      files: logWorkFilenames(files),
      createdAt: new Date().toISOString(),
      // Derived from the same primitives, not from the `draft` object: that
      // object is rebuilt every render, so depending on it made this callback
      // new every render too (the `useCallback` dependency warning).
      evidenceWord: describeEvidence({
        childName: activeChildName,
        day: today,
        activityName,
        subjectBucket,
        minutes: parsedDuration,
        note: noteText,
        mediaKind,
        photoCount: photos.length,
        hasAudio: Boolean(audio),
      }),
    }
  }, [
    photos,
    audio,
    noteText,
    familyId,
    parsedDuration,
    childId,
    activeChildName,
    today,
    weekPlanId,
    subjectBucket,
    activityName,
    mediaKind,
  ])

  const settle = useCallback(
    (
      submission: LogWorkSubmission,
      claim: CaptureDraftClaim,
      outcome: LogWorkOutcome,
    ) => {
      const verdict = verdictFor(claim)
      // Published first, and on both paths: evidence that is known saved is
      // part of the day whether or not the hours row answered, and the day's
      // list may not read "nothing captured yet" over a receipt that says it
      // saved.
      publishArtifact(outcome.artifact)
      if (outcome.status === 'complete') {
        onSnackMessage({
          text: captureSuccessText(
            logWorkReceiptBase({
              evidence: submission.evidenceWord,
              minutes: submission.minutes,
            }),
            verdict,
            claim,
          ),
          severity: 'success',
        })
        setPending(null)
        // What saved is no longer staged — whatever the verdict, because a file
        // left in the tray is both a lie about its state and an invitation to
        // upload it twice. Anything staged SINCE is untouched.
        dropSavedMedia(submission)
        if (verdict === 'owned') resetForm()
        return
      }
      const report = describeLogWorkPartial(submission, outcome)
      // The ORIGINAL claim travels with the pending save, so the retry asks the
      // ownership question this attempt asked rather than a fresh one.
      setPending({ submission, progress: outcome.progress, report, claim })
      onSnackMessage({
        text: captureErrorText(logWorkPartialBase(report), verdict, claim),
        severity: 'error',
      })
      // Nothing is cleared: the draft and the staged files are what a retry
      // needs, and the records that DID land are named on the card below.
    },
    [verdictFor, onSnackMessage, publishArtifact, dropSavedMedia, resetForm],
  )

  const handleSaveWork = useCallback(
    async (claim: CaptureDraftClaim) => {
      // A save cannot start while the draft is incomplete, while one is
      // unfinished, or while a media surface is still working.
      if (!saveable || pending || mediaWorking) return
      if (!beginSave()) return
      try {
        const submission = freezeSubmission()
        const outcome = await executeLogWorkSave(submission, NO_LOG_WORK_PROGRESS)
        settle(submission, claim, outcome)
      } finally {
        endSave()
      }
    },
    [saveable, pending, mediaWorking, beginSave, endSave, freezeSubmission, settle],
  )

  /**
   * Finish the unfinished save — the same documents, the submitted data.
   *
   * It never READS the form: the identity, the fields and the files all come
   * from the frozen submission, so a retry tapped after the page moved to
   * another child still finishes the log it was made for.
   *
   * When it finishes, the form is cleared **only if the submitted draft is
   * still the draft on screen** — the pending save's original claim, judged
   * now. That is the fix for the shape where a successful retry left the saved
   * words in the form with *Save work* live, and the next tap filed them again
   * under new ids.
   */
  const handleRetry = useCallback(async () => {
    if (!pending) return
    if (!beginSave()) return
    const { submission, progress, claim } = pending
    try {
      const outcome = await executeLogWorkSave(submission, progress)
      publishArtifact(outcome.artifact)
      if (outcome.status === 'complete') {
        onSnackMessage({
          text: logWorkRetryReceipt(
            submission,
            logWorkReceiptBase({
              evidence: submission.evidenceWord,
              minutes: submission.minutes,
            }),
          ),
          severity: 'success',
        })
        setPending(null)
        dropSavedMedia(submission)
        if (verdictFor(claim) === 'owned') resetForm()
        return
      }
      const report = describeLogWorkPartial(submission, outcome)
      setPending({ submission, progress: outcome.progress, report, claim })
      onSnackMessage({
        text: logWorkRetryReceipt(submission, logWorkPartialBase(report)),
        severity: 'error',
      })
    } finally {
      endSave()
    }
  }, [
    pending,
    beginSave,
    endSave,
    onSnackMessage,
    publishArtifact,
    dropSavedMedia,
    resetForm,
    verdictFor,
  ])

  /**
   * Stop waiting on the unfinished save — and take the submitted draft with it
   * when that draft is still the one on screen.
   *
   * This is deliberately NOT a bare *Dismiss*. Dismissing the card alone
   * dropped the operation's identity while leaving its words in the form as an
   * apparently unsaved entry, so the obvious next tap filed a SECOND copy under
   * new ids. Nothing stored is deleted or rolled back — what saved is the
   * family's evidence, and *Today's evidence* above shows it.
   *
   * A draft the parent has edited since is hers, so it stays; only the card
   * goes, and the receipt already said which child and day it belonged to. The
   * confirmation says which of the two will happen before it happens.
   */
  const pendingOwnsDraft = pending ? verdictFor(pending.claim) === 'owned' : false

  const handleStopPending = useCallback(() => {
    if (!pending) return
    const owned = verdictFor(pending.claim) === 'owned'
    setStopConfirm(false)
    setPending(null)
    if (owned) resetForm()
  }, [pending, verdictFor, resetForm])

  const dirty =
    saveable ||
    activityName.trim().length > 0 ||
    subjectBucket !== DEFAULT_LOG_WORK_BUCKET ||
    mediaKind !== null

  const blockedReason = pending
    ? 'Finish the unfinished save below, or stop waiting on it, before starting another.'
    : mediaWorking
      ? 'Wait for the photo or recording to finish.'
      : logWorkBlockedReason(draft)

  const dayNotice = selectedDayNotice(today, todayKey())

  return (
    <>
      {/* The jump's destination: a real element that takes focus, so the bar's
          button does something for a keyboard and a screen reader too. */}
      <Box
        id={LOG_WORK_ANCHOR_ID}
        tabIndex={-1}
        sx={{ scrollMarginTop: 12, outline: 'none' }}
      >
        <SectionCard title={LOG_WORK_TITLE}>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              One form for anything extra — a note, some minutes, photos or a
              recording. Nothing is saved until you tap <strong>Save work</strong>.
            </Typography>

            {/* Whose day this is, and which day. Said in words: the one control
                that CHOOSES a child is the chip in the shell (UX-425), and the
                form's own picker below re-points this draft without moving the
                page. */}
            <Typography variant="body2" data-testid="log-work-scope">
              For <strong>{activeChildName}</strong> · {logWorkDayLabel(today)}
            </Typography>
            {dayNotice && (
              <Typography variant="caption" color="text.secondary">
                {dayNotice}
              </Typography>
            )}

            {/* ── 1. What the work was, and how long ── */}
            <TextField
              label="Child"
              select
              value={childId}
              onChange={(event) => {
                markDraftEdited()
                setChildId(event.target.value)
              }}
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

            <TextField
              label="What is this?"
              placeholder="e.g. dentist visit, made a fort"
              value={activityName}
              onChange={(event) => {
                markFieldEdited('name')
                setActivityName(event.target.value)
              }}
            />

            {/* FIX-266: the VALUE is the stored bucket; only the WORD is this
                form's own, so History has a category to pick. */}
            <TextField
              label="Category"
              select
              value={subjectBucket}
              onChange={(event) => {
                markFieldEdited('category')
                setSubjectBucket(event.target.value as SubjectBucket)
              }}
            >
              {Object.values(SubjectBucket).map((bucket) => (
                <MenuItem key={bucket} value={bucket}>
                  {captureCategoryLabel(bucket)}
                </MenuItem>
              ))}
            </TextField>

            <Box>
              <TextField
                label="How long? (optional)"
                type="number"
                value={durationInput}
                onChange={(event) => {
                  const raw = event.target.value
                  if (raw === '') {
                    markFieldEdited('minutes')
                    setDurationInput('')
                    return
                  }
                  const n = Math.floor(Number(raw))
                  // A rejected keystroke changes nothing, so it is not an edit.
                  if (!Number.isFinite(n) || n < 0) return
                  markFieldEdited('minutes')
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

            {/* ── Quick fill: a shortcut, folded away, and never a save ── */}
            <Box>
              <Button
                variant="text"
                size="small"
                onClick={() => setQuickFillOpen((open) => !open)}
                endIcon={quickFillOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                aria-expanded={quickFillOpen}
                sx={{ textTransform: 'none' }}
              >
                Quick fill (optional)
              </Button>
              {quickFillOpen && (
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    These fill the form in for you. They never save anything on
                    their own.
                  </Typography>
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
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        {group.presets.map((preset) => (
                          <Chip
                            key={preset.id}
                            label={
                              preset.emoji
                                ? `${preset.emoji} ${preset.label}`
                                : preset.label
                            }
                            onClick={() => handlePresetTap(preset)}
                            color={selectedPresetId === preset.id ? 'primary' : 'default'}
                            variant={
                              selectedPresetId === preset.id ? 'filled' : 'outlined'
                            }
                            size="small"
                          />
                        ))}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
              {presetNotice && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  role="status"
                  sx={{ display: 'block', mt: 1 }}
                >
                  {presetNotice}
                </Typography>
              )}
            </Box>

            <Divider />

            {/* ── 2. The note — always here, whatever else is attached ── */}
            <TextField
              label="Note (optional)"
              multiline
              minRows={3}
              value={noteText}
              onChange={(event) => {
                markDraftEdited()
                setNoteText(event.target.value)
              }}
              helperText="Saved with the photo or recording, not instead of it."
            />

            {/* ── 3. One attachment, staged until Save work ── */}
            <Box>
              <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                Attach (optional)
              </Typography>
              <ToggleButtonGroup
                value={mediaKind}
                exclusive
                onChange={(_event, value) =>
                  requestMediaKind(value as LogWorkMediaKind | null)
                }
                fullWidth
                size="large"
              >
                <ToggleButton value="photo">📷 Photo</ToggleButton>
                <ToggleButton value="audio">🎤 Audio</ToggleButton>
              </ToggleButtonGroup>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5 }}
              >
                One kind at a time. Photos save together as one entry.
              </Typography>
            </Box>

            {mediaNotice && (
              <Alert severity="info" role="status" onClose={() => setMediaNotice(null)}>
                {mediaNotice}
              </Alert>
            )}

            {/* A photo that could not be processed. It says what happened, what
                is still here, and it does not block the rest of the draft. */}
            {mediaError && (
              <Alert
                severity="warning"
                role="alert"
                data-testid="log-work-media-error"
                onClose={() => setMediaError(null)}
                sx={{ '& .MuiAlert-message': { minWidth: 0, overflowWrap: 'anywhere' } }}
              >
                {mediaError}
              </Alert>
            )}

            {/* Direct staging, and KEYED on the scope: a photo chosen here is
                in the tray below immediately, and a child or day change
                remounts the surface so nothing selected for one child can be
                attached to another. */}
            {mediaKind === 'photo' && (
              <PhotoCapture
                key={`photo-${mediaInstanceKey}`}
                multiple
                onStageFiles={(files) => stagePhotos(files, mediaToken)}
                onStageError={(names) => reportMediaError(names, mediaToken)}
                onBusyChange={(busy) => reportMediaBusy(busy, mediaToken)}
                onDraftChange={markDraftEdited}
                uploading={savePending}
              />
            )}
            {mediaKind === 'audio' && (
              <AudioRecorder
                key={`audio-${mediaInstanceKey}`}
                stageDirect
                onCapture={(blob) => stageAudio(blob, mediaToken)}
                onBusyChange={(busy) => reportMediaBusy(busy, mediaToken)}
                onDraftChange={markDraftEdited}
                uploading={savePending}
                allowUpload
              />
            )}

            {photos.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" role="status">
                  {photos.length === 1
                    ? '1 photo attached — not saved yet.'
                    : `${photos.length} photos attached — not saved yet.`}
                </Typography>
                <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1} sx={{ mt: 1 }}>
                  {photos.map((photo, index) => (
                    <Box key={photo.url} sx={{ position: 'relative' }}>
                      <Box
                        component="img"
                        src={photo.url}
                        alt={`Attached photo ${index + 1}`}
                        sx={{
                          width: 84,
                          height: 84,
                          objectFit: 'cover',
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'divider',
                        }}
                      />
                      <IconButton
                        size="small"
                        aria-label={`Remove attached photo ${index + 1}`}
                        onClick={() => removePhoto(index)}
                        disabled={savePending}
                        sx={{
                          position: 'absolute',
                          top: -8,
                          right: -8,
                          bgcolor: 'background.paper',
                          border: '1px solid',
                          borderColor: 'divider',
                          '&:hover': { bgcolor: 'background.paper' },
                        }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

            {audio && (
              <Box>
                <Typography variant="caption" color="text.secondary" role="status">
                  Recording attached — not saved yet.
                </Typography>
                <Box component="audio" controls src={audio.url} sx={{ width: '100%', mt: 1 }} />
                <Button
                  variant="text"
                  size="small"
                  startIcon={<CloseIcon />}
                  onClick={removeAudio}
                  disabled={savePending}
                >
                  Remove recording
                </Button>
              </Box>
            )}

            <Divider />

            {/* ── 4. What this will save, then the one button ── */}
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'action.hover',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {summary.scopeLine}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {summary.savesLine}
              </Typography>
              <Typography variant="body2">{summary.timeLine}</Typography>
            </Box>

            <Stack spacing={0.5}>
              <Button
                variant="contained"
                size="large"
                onClick={() => void handleSaveWork(renderedClaim)}
                disabled={savePending || blockedReason !== null}
                sx={{ whiteSpace: 'normal' }}
              >
                Save work
              </Button>
              {/* The reason is ON SCREEN, not only in a tooltip nobody can
                  hover on a phone, and it stays readable at large text. */}
              {(savePending || blockedReason) && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  role="status"
                  sx={{ display: 'block', textAlign: 'center', whiteSpace: 'normal' }}
                >
                  {savePending ? 'Saving…' : blockedReason}
                </Typography>
              )}
              {/* Not offered while a save is unfinished: that draft is the one
                  the panel below is bound to, and *Stop and clear* is the
                  control that deals with both together. */}
              <Button
                variant="text"
                size="small"
                onClick={resetForm}
                disabled={savePending || Boolean(pending) || !dirty}
              >
                Discard this draft
              </Button>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', textAlign: 'center' }}
              >
                Discarding writes nothing. Drafts are not kept if you reload.
              </Typography>
            </Stack>

            {/* The unfinished-save panel.
                A standard MUI `Alert`, whose own warning surface and text are a
                readable pair, with the buttons INSIDE the content rather than in
                the `action` slot — that slot is a sibling of the message in a
                non-wrapping row, so at 320px with doubled text it took the width
                and the message collapsed to nothing. `color: inherit` keeps the
                buttons on the Alert's text colour instead of primary blue on
                amber. */}
            {pending && (
              <Alert
                severity="warning"
                role="status"
                data-testid="log-work-unfinished"
                sx={{ '& .MuiAlert-message': { minWidth: 0, width: '100%' } }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                  Unfinished — {pending.submission.childName} ·{' '}
                  {logWorkDayLabel(pending.submission.day)}
                </Typography>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  {pending.report.saved ? `${pending.report.saved} ` : ''}
                  {pending.report.unsaved}
                </Typography>
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                  Retry finishes only what is missing, for that child and day.
                  Kept while this page stays open.
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  flexWrap="wrap"
                  useFlexGap
                  sx={{ mt: 1 }}
                >
                  <Button
                    variant="outlined"
                    color="inherit"
                    size="small"
                    onClick={() => void handleRetry()}
                    disabled={savePending}
                    sx={{ whiteSpace: 'normal', fontWeight: 700 }}
                  >
                    {pending.report.retryLabel}
                  </Button>
                  {/* Asks first, because what it does to the draft depends on
                      whether the draft is still the one that was submitted. */}
                  <Button
                    variant="outlined"
                    color="inherit"
                    size="small"
                    onClick={() => setStopConfirm(true)}
                    disabled={savePending}
                    sx={{ whiteSpace: 'normal' }}
                  >
                    Stop waiting
                  </Button>
                </Stack>
              </Alert>
            )}
          </Stack>
        </SectionCard>
      </Box>

      {/*
        UX-431 — *Today's evidence*: every artifact the day produced, with the
        time it was added and the row it belongs to. Read-only: no write, no
        delete, no edit (removal is `UX-433`, filed, not built).
      */}
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

      {/* The quick fill would overwrite something typed by hand. */}
      <Dialog open={presetConflict !== null} onClose={() => setPresetConflict(null)}>
        <DialogTitle>Replace what you typed?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {presetConflict
              ? presetOverwriteQuestion(presetConflict.preset.label, presetConflict.fields)
              : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPresetConflict(null)}>Keep mine</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (presetConflict) applyPreset(presetConflict.preset)
              setPresetConflict(null)
            }}
          >
            Use the quick fill
          </Button>
        </DialogActions>
      </Dialog>

      {/* Stopping an unfinished save: what it keeps, and what it clears. */}
      <Dialog open={stopConfirm && pending !== null} onClose={() => setStopConfirm(false)}>
        <DialogTitle>Stop waiting on this save?</DialogTitle>
        <DialogContent>
          <DialogContentText>{stopPendingQuestion(pendingOwnsDraft)}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStopConfirm(false)}>Keep waiting</Button>
          <Button variant="contained" onClick={handleStopPending}>
            Stop waiting
          </Button>
        </DialogActions>
      </Dialog>

      {/* One kind of media at a time — asked, never assumed. */}
      <Dialog open={mediaSwitch !== null} onClose={() => setMediaSwitch(null)}>
        <DialogTitle>Remove what you attached?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {mediaSwitch
              ? mediaReplaceQuestion(mediaSwitch.from, photos.length, mediaSwitch.to)
              : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMediaSwitch(null)}>Keep it</Button>
          <Button variant="contained" onClick={confirmMediaSwitch}>
            Remove it
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
