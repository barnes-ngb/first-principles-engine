import { useState, useCallback, useRef, useEffect } from 'react'
import { addDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import UploadIcon from '@mui/icons-material/Upload'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { stickerLibraryCollection } from '../../core/firebase/firestore'
import { storage } from '../../core/firebase/storage'
import { useAI } from '../../core/ai/useAI'
import CropIcon from '@mui/icons-material/Crop'
import {
  cleanSketchBackground,
  DEFAULT_BORDER_INSET_FRACTION,
  WHOLE_IMAGE_BORDER_INSET_FRACTION,
} from './cleanSketch'
import SketchCropStage from './SketchCropStage'
import StickerCleanupEditor from './StickerCleanupEditor'
import type { CleanupEdits } from './cleanupMask'
import { cropImageToRegion, type CropFraction } from './cropImage'
import { CHECKERBOARD_BG } from './DrawingChoiceDialog'
import { STICKER_TAGS_ORDERED, suggestTagsFromPrompt } from './stickerTagging'
import { useStickerLabel } from './useStickerLabel'
import {
  FANCY_STYLE_OPTIONS,
  DEFAULT_FANCY_STYLE_ID,
  fancyStyleLabel,
  resolveFancyEnhanceParams,
} from './drawingStickerStyles'
import { ART_QUOTA_MESSAGE } from '../business/useArtQuota'
import { recordStickerArtGeneration } from './useStickerArtQuota'
import type { ArtBudgetState, ArtHelpAudience } from './artHelpContent'
import ArtHelpSheet, { ArtHelpButton, GenerateHint } from './ArtHelpSheet'
import ImageRetryCard from './ImageRetryCard'
import {
  classifyImageGenerationFailure,
  imageFailureAlternatives,
  ImageRetryDoor,
  type ImageGenerationFailure,
} from './imageGenerationFailure'
import CustomLookCard from './CustomLookCard'
import { hasCustomPictureNote } from './customPictureNote'
import { drawnAsLine } from './revisedPromptLine'
import { StickerCategory } from '../../core/types/enums'
import type { Sticker, StickerTag } from '../../core/types'
import { STICKER_TAG_LABELS } from '../../core/types'

interface SketchScannerProps {
  open: boolean
  onClose: () => void
  familyId: string
  /** Pre-selects the "For" target on the tagging step. */
  childProfile?: 'lincoln' | 'london'
  /** Used for the default sticker label. */
  childName?: string
  /** Existing host identities, so a selected ID can resolve after capture. */
  ownerContext?: CaptureOwnerContext
  /** Fired after each sticker (raw cleaned or fancy) is saved to the library. */
  onSaved?: () => void
  /**
   * The actor has spent this week's art budget (FEAT-166). "Make it fancy" is the
   * fourth paid door on the Stickers page and the most-tapped one — this flow's
   * whole invitation is "try another style", and every tap is a real
   * `enhanceSketch` call. At the cap the style controls swap for the same warm
   * nudge the other three doors show. Defaults to uncapped, so any other mount
   * of this dialog (and every parent path) is unchanged.
   */
  capReached?: boolean
  /** Count one paid transform against the day's counter (FEAT-166). */
  recordGeneration?: () => Promise<void>
  /**
   * Whose words the help reads in (FEAT-178) — resolved by the host from
   * `useActiveChild().isChildProfile`. Capability, never a name.
   */
  audience?: ArtHelpAudience
  /**
   * The host's live art budget, printed on the help sheet (FEAT-178). Passed in
   * rather than read here: this dialog reads no counter of its own, and the page
   * above it already asks the budget question exactly once.
   */
  artBudget?: ArtBudgetState
}

type Stage = 'capture' | 'crop' | 'cleaning' | 'preview'

/** Default crop box — slightly inset to nudge trimming paper edges, but the
 *  whole image is one tap away ("Use the whole picture"). */
const DEFAULT_CROP: CropFraction = { x: 0.06, y: 0.06, width: 0.88, height: 0.88 }
type PreviewTab = 'original' | 'cleaned' | 'fancy'
type SaveVersion = 'cleaned' | 'fancy'

/**
 * The fancy picture that actually came back, as ONE coherent record
 * (LOCAL-CLAUDE-PILOT-001).
 *
 * The style chips and the note field under a finished picture are a draft of the
 * **next** request: tapping one is free, spends nothing, and must not re-describe
 * — or re-file — the picture already on screen. Before this, the saved `theme`
 * was read off the live `styleId` at save time, so generating in Comic, then
 * tapping Watercolor without generating, then Save Fancy wrote `theme: 'cartoon'`
 * beside the comic image's URL and storage path: a library row that named a look
 * the picture was never drawn in. The "Drawn as:" line had the same shape, since
 * it read the draft note against the completed request's rewrite.
 *
 * So the look, the note that was sent, and what the server said it drew are
 * captured *with* the image they belong to, at the tap, before any await. This is
 * component state and nothing more — no new stored field, no schema change; the
 * document written is the same shape it always was, with the look it was actually
 * drawn in.
 *
 * The saved marker is the other half of that record, and it is NOT carried here:
 * `savedVersions` has one `'fancy'` slot for whichever picture is on screen, so
 * it only stays true while a FANCY save and a generation cannot overlap. That is
 * what the two guards below enforce — see `handleMakeFancy` / `saveSticker`. A
 * *cleaned* save owns a different slot and a different picture, so it is not part
 * of that rule and never blocks a generation.
 */
interface FancyResult {
  url: string
  storagePath: string | null
  /** The look tapped for the generation that produced THIS picture. */
  styleId: string
  /** The note sent with it (`''` when none) — what `revisedNote` is a rewrite of. */
  requestNote: string
  /** The rewriter's version of that note, when it changed the words (FEAT-197). */
  revisedNote?: string
}

/** Upload a file to Firebase Storage and return { url, storagePath }. */
async function uploadToStorage(familyId: string, file: File, subfolder: string) {
  const ts = Date.now()
  const path = `families/${familyId}/${subfolder}/${ts}_${file.name}`
  const storageRef = ref(storage, path)
  const snap = await uploadBytes(storageRef, file)
  const url = await getDownloadURL(snap.ref)
  return { url, storagePath: path }
}

/**
 * Drawing → sticker studio (FEAT-33 slice 2). Standalone — no open book/page.
 * A kid captures or uploads a drawing → it's cleaned to a transparent sticker →
 * optionally a style picker transforms it into a polished version → the raw
 * cleaned sticker and/or the fancy one can be saved to the library (the two
 * product lines per drawing). Tagging is shared with the rest of the sticker
 * UIs via `stickerTagging.ts`.
 */
/** Family changes/close invalidate work; header child changes keep its local For. */
export default function SketchScanner(props: SketchScannerProps) {
  return props.open ? <SketchScannerSession key={props.familyId} {...props} /> : null
}

type StickerProfile = 'lincoln' | 'london'
interface CaptureOwnerContext {
  activeChildId?: string
  /** A locked child profile must not bind the hook's temporary parent fallback. */
  pendingProfile?: StickerProfile
  children: readonly { id: string; name: string; profile?: StickerProfile }[]
}
interface CaptureOwner {
  id?: string
  pendingProfile?: StickerProfile
  name?: string
  profile?: StickerProfile
  resolved: boolean
}

/** Resolve only the captured identity. Once complete, later header changes are inert. */
function resolveCaptureOwner(owner: CaptureOwner, context: CaptureOwnerContext | undefined, name: string | undefined, profile: StickerProfile | undefined): CaptureOwner {
  if (owner.resolved) return owner
  if (context) {
    const id = owner.id ?? (owner.pendingProfile
      ? context.children.find(child => child.profile === owner.pendingProfile)?.id
      : context.activeChildId)
    const child = id ? context.children.find(candidate => candidate.id === id) : undefined
    if (child?.name.trim()) return { ...owner, id, name: child.name, profile: child.profile, resolved: true }
    return id !== owner.id ? { ...owner, id } : owner
  }
  // Compatibility for standalone callers without host IDs. A known profile is
  // still a binding; never fill its missing name from a different profile.
  if (name?.trim() && (!owner.profile || owner.profile === profile)) return { ...owner, name, profile, resolved: true }
  if (!owner.profile && profile) return { ...owner, profile }
  return owner
}

function SketchScannerSession({
  open,
  onClose,
  familyId,
  childProfile,
  childName,
  ownerContext,
  onSaved,
  capReached = false,
  recordGeneration,
  audience = 'parent',
  artBudget = { limit: 0, remaining: Infinity, capped: false },
}: SketchScannerProps) {
  const [showHelp, setShowHelp] = useState(false)
  // Missing capture metadata may arrive late (FEAT-160). Fill it for the bound
  // identity once; later header switches must not relabel this drawing. The
  // label hook keeps an explicit typed label authoritative throughout.
  const [captureOwner, setCaptureOwner] = useState<CaptureOwner | null>(null)
  const { label, setLabel, resetLabel, defaultLabel } = useStickerLabel(captureOwner ? captureOwner.name : childName)

  const [stage, setStage] = useState<Stage>('capture')
  const [previewTab, setPreviewTab] = useState<PreviewTab>('cleaned')

  // Original + cleaned versions
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [originalStoragePath, setOriginalStoragePath] = useState<string | null>(null)
  const [cleanedFile, setCleanedFile] = useState<File | null>(null)
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null)
  const [adjusting, setAdjusting] = useState(false)
  const [cleanupEdits, setCleanupEdits] = useState<CleanupEdits | undefined>(undefined)
  const [cleanupSmallerCopy, setCleanupSmallerCopy] = useState(false)
  const [cleanupInset, setCleanupInset] = useState(WHOLE_IMAGE_BORDER_INSET_FRACTION)

  // Manual crop (between capture and cleaning) — fractions of the captured image.
  const [cropFraction, setCropFraction] = useState<CropFraction>(DEFAULT_CROP)

  // Fancy (theme-transformed) version. `styleId` is the PENDING choice — what the
  // next "Make it fancy" would ask for; `fancyResult` is the picture that came
  // back and the request that made it. They are deliberately separate.
  const [styleId, setStyleId] = useState<string>(DEFAULT_FANCY_STYLE_ID)
  const [fancyResult, setFancyResult] = useState<FancyResult | null>(null)
  const [enhancing, setEnhancing] = useState(false)
  const [enhanceError, setEnhanceError] = useState<string | null>(null)
  /**
   * Why the last "Make it fancy" didn't come back (FEAT-195). This door said
   * "Couldn't use that picture. Please try again." for a refused prompt, a rate
   * limit, a missing API key and a dropped connection alike — four different
   * problems, one useless sentence, nothing to tap. `enhanceError` survives for
   * the one failure that is NOT an image call: the Storage upload underneath it.
   */
  const [fancyFailure, setFancyFailure] = useState<ImageGenerationFailure | null>(null)
  const [fancyAlternatives, setFancyAlternatives] = useState<string[]>([])
  /**
   * The FEAT-197 "+ My own look" note — one subject change riding alongside the
   * picked look ("put her in a space suit"). One-off: it is never saved, and it
   * is cleared with the rest of the dialog's state on reset.
   */
  const [customNote, setCustomNote] = useState('')

  // Shared tagging (applies to whichever version is saved)
  const [tags, setTags] = useState<StickerTag[]>([])
  const [profile, setProfile] = useState<'lincoln' | 'london' | 'both'>(childProfile ?? 'both')
  const [profileEdited, setProfileEdited] = useState(false)
  // Resolve during the props/state transition, before a save handler can see a
  // new name with stale defaults. Explicit label edits live in useStickerLabel;
  // explicit For (including Both) is independently authoritative.
  if (captureOwner && !captureOwner.resolved) {
    const resolved = resolveCaptureOwner(captureOwner, ownerContext, childName, childProfile)
    if (resolved !== captureOwner) {
      setCaptureOwner(resolved)
      if (resolved.resolved && !profileEdited) setProfile(resolved.profile ?? 'both')
    }
  }

  // Save state
  const [savingVersion, setSavingVersion] = useState<SaveVersion | null>(null)
  const [savedVersions, setSavedVersions] = useState<Set<SaveVersion>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  // Group key shared by every version saved from one drawing (the cleaned
  // original + any fancy versions). Minted when a new drawing is captured.
  const sourceDrawingIdRef = useRef<string | null>(null)
  // Capture is retained separately when a crop becomes the working original.
  const capturedFileRef = useRef<File | null>(null)
  const sessionRef = useRef(0)
  const aliveRef = useRef(true)
  /**
   * The two in-flight flags are refs as well as state because a tap has to be
   * refused *synchronously* — `enhancing` / `savingVersion` only reach the DOM on
   * the next render, and two taps inside one tick would both read the old value.
   * They also guard each OTHER (LOCAL-CLAUDE-PILOT-001): a fancy save and a fancy
   * generation may not overlap, because the "Saved ✓" marker names the picture on
   * screen and a generation that lands mid-save would hand the previous picture's
   * marker to a brand-new picture that was never written.
   *
   * The save flag carries WHICH version is in flight rather than a bare boolean,
   * because only the fancy one is party to that rule. A cleaned save writes a
   * different row, holds a different marker, and shares nothing with the picture
   * the generator is about to replace — so blocking a generation on it bought no
   * protection and cost the whole paid door: an `addDoc` resolves on server ack,
   * so a cleaned save started offline stays pending indefinitely and "Make it
   * fancy" never came back (the same never-settles shape the quota callback is
   * deliberately not awaited for). The flag stays a ref, and stays read before
   * any await, so the synchronous refusal is unchanged for the case it is for.
   */
  const saveInFlightRef = useRef<SaveVersion | null>(null)
  const enhanceInFlightRef = useRef(false)
  const { enhanceSketch, imageFailureRef } = useAI()
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])
  useEffect(() => () => { if (originalUrl) URL.revokeObjectURL(originalUrl) }, [originalUrl])
  useEffect(() => () => { if (cleanedUrl) URL.revokeObjectURL(cleanedUrl) }, [cleanedUrl])

  // A note is the only free text this door has (FEAT-197), so it decides both
  // whether the retry card's advice can be about wording and whether a tapped
  // rewording has anywhere to land.
  const retryDoor = hasCustomPictureNote(customNote)
    ? ImageRetryDoor.RedrawNote
    : ImageRetryDoor.Redraw
  const fancyUrl = fancyResult?.url ?? null
  // Both read the COMPLETED request, never the draft: what the picture maker was
  // asked for is a fact about the picture on screen, so editing the note or
  // tapping another look leaves it alone, and so does a redo that never arrived.
  const drawnAs = fancyResult
    ? drawnAsLine(fancyResult.requestNote, fancyResult.revisedNote, audience)
    : null
  const resultLook = fancyResult ? fancyStyleLabel(fancyResult.styleId) : null
  const finalizeCaptureDefaults = useCallback(() => {
    // The first submitted save/paid transform owns the defaults shown at that
    // moment. Later metadata must not silently relabel its result or anchor.
    setCaptureOwner(owner => owner && !owner.resolved ? { ...owner, resolved: true } : owner)
  }, [])

  const reset = useCallback(() => {
    sessionRef.current++
    saveInFlightRef.current = null
    enhanceInFlightRef.current = false
    capturedFileRef.current = null
    setCaptureOwner(null)
    setProfileEdited(false)
    setAdjusting(false)
    setCleanupEdits(undefined)
    setCleanupSmallerCopy(false)
    setStage('capture')
    setPreviewTab('cleaned')
    setOriginalFile(null)
    setOriginalUrl(null)
    setOriginalStoragePath(null)
    setCleanedFile(null)
    setCleanedUrl(null)
    setCropFraction(DEFAULT_CROP)
    setStyleId(DEFAULT_FANCY_STYLE_ID)
    setFancyResult(null)
    setEnhancing(false)
    setEnhanceError(null)
    setFancyFailure(null)
    setFancyAlternatives([])
    // One-off, so it never survives a dialog (FEAT-197).
    setCustomNote('')
    resetLabel()
    setTags([])
    setProfile(childProfile ?? 'both')
    setSavingVersion(null)
    setSavedVersions(new Set())
    setError(null)
    sourceDrawingIdRef.current = null
  }, [resetLabel, childProfile])

  const handleClose = useCallback(() => {
    // A document save cannot be cancelled by dismissing this dialog. Keep its
    // success/error visible, including Escape/backdrop before state re-renders.
    // Either version holds the dialog open — this guard is about the write, not
    // about which picture it is for.
    if (saveInFlightRef.current !== null) return
    reset()
    onClose()
  }, [reset, onClose])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      // Allow re-selecting the same file later.
      e.target.value = ''
      if (!file) return

      sessionRef.current++
      capturedFileRef.current = file
      const owner = resolveCaptureOwner({
        id: ownerContext?.activeChildId,
        pendingProfile: ownerContext?.pendingProfile,
        profile: ownerContext ? undefined : childProfile,
        resolved: false,
      }, ownerContext, childName, childProfile)
      setCaptureOwner(owner)
      setProfile(owner.profile ?? 'both')
      setProfileEdited(false)
      setError(null)
      setOriginalFile(file)
      setOriginalUrl(URL.createObjectURL(file))
      // Mint a fresh group key for this drawing — the cleaned original and any
      // fancy versions saved from it all share it (FEAT-33 slice 3).
      sourceDrawingIdRef.current = crypto.randomUUID()
      // Pick a region first (skippable), then make it transparent.
      setCropFraction(DEFAULT_CROP)
      setStage('crop')
    },
    [childName, childProfile, ownerContext],
  )

  // Transparent cleanup → preview. Shared by both crop paths (cropped + whole).
  // `fromCrop` says whether the parent already trimmed the surround: if they did,
  // the file *is* the chosen region and a small inset is enough; on "use whole
  // image" the outermost pixels are most likely table or carpet, so the
  // background ring is pulled further in (FEAT-159).
  const runClean = useCallback(
    async (file: File, fromCrop: boolean) => {
      const session = sessionRef.current
      setStage('cleaning')
      setError(null)
      try {
        const inset = fromCrop ? DEFAULT_BORDER_INSET_FRACTION : WHOLE_IMAGE_BORDER_INSET_FRACTION
        const cleaned = await cleanSketchBackground(file, {
          borderInsetFraction: inset,
        })
        if (!aliveRef.current || session !== sessionRef.current) return
        setCleanupInset(inset)
        setCleanedFile(cleaned)
        setCleanedUrl(URL.createObjectURL(cleaned))
        // Seed tags from the default label so saving is one tap if they don't edit.
        setTags(suggestTagsFromPrompt(defaultLabel))
        setStage('preview')
        setPreviewTab('cleaned')
      } catch {
        if (!aliveRef.current || session !== sessionRef.current) return
        setError('Couldn’t use that picture. Please try again.')
        setStage('capture')
      }
    },
    [defaultLabel],
  )

  // "Use the whole picture" — keeps today's behavior (clean the full capture).
  const handleUseWholeImage = useCallback(() => {
    if (originalFile) void runClean(originalFile, false)
  }, [originalFile, runClean])

  // "Use it" — crop to the selected box, then clean. The cropped image
  // becomes the working original so the Original tab and "Make it fancy"
  // transform both operate on the chosen region.
  const handleConfirmCrop = useCallback(async () => {
    if (!originalFile) return
    const session = sessionRef.current
    setStage('cleaning')
    try {
      const cropped = await cropImageToRegion(originalFile, cropFraction)
      if (!aliveRef.current || session !== sessionRef.current) return
      setOriginalFile(cropped)
      setOriginalUrl(URL.createObjectURL(cropped))
      // Force a re-upload of the cropped original if a fancy transform is requested.
      setOriginalStoragePath(null)
      await runClean(cropped, true)
    } catch {
      if (!aliveRef.current || session !== sessionRef.current) return
      setError('Couldn’t crop that picture. Please try again.')
      setStage('crop')
    }
  }, [originalFile, cropFraction, runClean])

  // Upload original to storage (lazy — only when the transform is first requested).
  const ensureOriginalUploaded = useCallback(async (): Promise<string | null> => {
    if (originalStoragePath) return originalStoragePath
    if (!originalFile) return null
    const session = sessionRef.current
    try {
      const { storagePath } = await uploadToStorage(familyId, originalFile, 'sketches')
      if (!aliveRef.current || session !== sessionRef.current) return null
      setOriginalStoragePath(storagePath)
      return storagePath
    } catch {
      return null
    }
  }, [originalFile, originalStoragePath, familyId])

  const handleMakeFancy = useCallback(async (noteOverride?: string) => {
    // At the cap the paid call never goes out (FEAT-166) — and neither does the
    // Storage upload behind it: the guard sits ahead of `ensureOriginalUploaded`
    // so a capped tap costs nothing at all. The style controls already show the
    // nudge instead of a button; this holds the rule for real.
    if (enhanceInFlightRef.current || enhancing || capReached) return
    // A submitted FANCY save owns the picture it was submitted for until it
    // settles. Starting a generation underneath it would replace that picture —
    // and clear the fancy saved marker — while the write for the old one is still
    // on its way, so the marker the save then sets would land on a picture nobody
    // wrote. Refused HERE as well as on the buttons, because the retry card's own
    // buttons call this function directly.
    //
    // A pending CLEANED save is not that situation and is not refused: it is
    // saving the cleaned bytes, which no generation touches, and it marks only
    // its own slot when it lands. Blocking on it made the two product lines per
    // drawing one queue — and, since a Firestore write only resolves on server
    // ack, an offline cleaned save closed the paid door for the rest of the
    // session with no way to reopen it.
    if (saveInFlightRef.current === 'fancy' || savingVersion === 'fancy') return
    finalizeCaptureDefaults()
    const session = sessionRef.current
    enhanceInFlightRef.current = true
    setEnhancing(true)
    setEnhanceError(null)
    setFancyFailure(null)
    setFancyAlternatives([])
    setPreviewTab('fancy')

    // A tapped alternative from the retry card IS the new note (FEAT-197 ×
    // FEAT-195) — it replaces what was typed rather than opening a second path,
    // and the generation it starts counts as one like any other.
    const note = noteOverride ?? customNote
    if (noteOverride !== undefined) setCustomNote(noteOverride)
    // The request is fixed HERE, before the first await: whatever is tapped or
    // typed while this one is in flight belongs to the next request, not this
    // picture. Nothing below reads `styleId` or `customNote` again.
    const requestedStyleId = styleId

    try {
      const storagePath = await ensureOriginalUploaded()
      if (!aliveRef.current || session !== sessionRef.current) return
      if (!storagePath) {
        setEnhanceError('Failed to upload drawing. Please try again.')
        return
      }

      const result = await enhanceSketch({
        familyId,
        sketchStoragePath: storagePath,
        ...resolveFancyEnhanceParams(requestedStyleId, note),
      })
      // A completed paid request still belongs to its originating quota callback.
      if (result?.url) recordStickerArtGeneration(recordGeneration)
      if (!aliveRef.current || session !== sessionRef.current) return

      if (result?.url) {
        // The image and the request that produced it replace the previous pair
        // together. A redo that fails leaves this untouched, so the picture on
        // screen keeps its own look, its own note and its own "Drawn as:" line.
        setFancyResult({
          url: result.url,
          storagePath: result.storagePath ?? null,
          styleId: requestedStyleId,
          requestNote: note,
          revisedNote: result.revisedNote,
        })
        // A real image came back: count the paid call (FEAT-166). A redo with
        // another style counts again — each is another real call.
        //
        // Deliberately NOT awaited (Codex P2, PR #1717). The wrapper swallows a
        // rejection, but nothing can bound a promise that never *settles* — and
        // a Firestore write resolves only on server ack, so offline it stays
        // pending indefinitely rather than failing. Awaited, that left
        // `enhancing` true forever (the `finally` never ran): the spinner sat on
        // top of an image the kid had already paid for, and the Save button
        // never came back. Failing open has to mean the art does not wait on the
        // counter at all, not merely that a *thrown* counter is ignored.
        //
        // FEAT-167 moved that discipline into the wrapper itself — it returns
        // `void` now, so the `void` operator here would be meaningless.
        // A fresh transform replaces any previously-saved fancy version.
        setSavedVersions((prev) => {
          if (!prev.has('fancy')) return prev
          const next = new Set(prev)
          next.delete('fancy')
          return next
        })
      } else {
        // `useAI.enhanceSketch` swallows the rejection and returns null, so this
        // — not the catch below — is the branch a refused or rate-limited call
        // actually lands in. The classifier reads the raw rejection off the ref
        // (FEAT-195); nothing is counted, because no picture was made.
        setFancyFailure(classifyImageGenerationFailure(imageFailureRef.current))
        setFancyAlternatives(imageFailureAlternatives(imageFailureRef.current))
      }
    } catch (err) {
      if (aliveRef.current && session === sessionRef.current) setEnhanceError(err instanceof Error ? err.message : 'Transform failed')
    } finally {
      if (aliveRef.current && session === sessionRef.current) { enhanceInFlightRef.current = false; setEnhancing(false) }
    }
  }, [
    enhancing,
    savingVersion,
    capReached,
    ensureOriginalUploaded,
    enhanceSketch,
    familyId,
    styleId,
    customNote,
    recordGeneration,
    imageFailureRef,
    finalizeCaptureDefaults,
  ])

  const saveSticker = useCallback(
    async (version: SaveVersion) => {
      // The fancy row is written from the completed result, never from the
      // pending picker: its URL, its storage path and the look it was drawn in
      // are one record, so they cannot disagree in the library.
      const saved = fancyResult
      const url = version === 'cleaned' ? cleanedUrl : saved?.url ?? null
      // Unchanged: ONE save at a time, whichever version, and never a second
      // write of a version already saved.
      if (saveInFlightRef.current !== null || savingVersion || savedVersions.has(version)) return
      // The other direction of the same rule: while a generation is in flight the
      // picture on screen is already on its way out, so saving it would mark a
      // picture as saved that the very next render replaces. The spinner hides it
      // anyway — the tap is refused rather than racing the result.
      if (version === 'fancy' && (enhanceInFlightRef.current || enhancing)) return
      finalizeCaptureDefaults()
      const session = sessionRef.current
      const sourceDrawingId = sourceDrawingIdRef.current
      // Synchronously, before any await, and naming the version — so a tap on
      // "Make it fancy" in the same tick is refused for a fancy save and allowed
      // for a cleaned one, without waiting for `savingVersion` to render.
      saveInFlightRef.current = version

      setSavingVersion(version)
      setError(null)
      try {
        let saveUrl = url
        let savePath: string
        // Resolved in the same branch that resolves the bytes, so the look can
        // never be read from somewhere the picture wasn't.
        let versionFields: { isOriginal: true } | { theme: string }

        if (version === 'cleaned') {
          if (!cleanedFile) return
          const uploaded = await uploadToStorage(familyId, cleanedFile, 'stickers')
          if (!aliveRef.current || session !== sessionRef.current) return
          saveUrl = uploaded.url
          savePath = uploaded.storagePath
          versionFields = { isOriginal: true }
        } else {
          if (!saved?.url || !saved.storagePath) return
          savePath = saved.storagePath
          versionFields = { theme: saved.styleId }
        }

        if (!saveUrl || !aliveRef.current || session !== sessionRef.current) return

        const newSticker: Omit<Sticker, 'id'> = {
          url: saveUrl,
          storagePath: savePath,
          label: label.trim() || defaultLabel,
          category: StickerCategory.Custom,
          childId: null,
          createdAt: new Date().toISOString(),
          tags: tags.length ? tags : ['object'],
          childProfile: profile,
          // Link this version to its source drawing (FEAT-33 slice 3). The
          // cleaned version is the original group anchor; the fancy version
          // records which theme/style it is.
          ...(sourceDrawingId
            ? { sourceDrawingId }
            : {}),
          ...versionFields,
        }
        await addDoc(stickerLibraryCollection(familyId), newSticker as Sticker)
        if (!aliveRef.current || session !== sessionRef.current) return
        setSavedVersions((prev) => new Set(prev).add(version))
        onSaved?.()
      } catch {
        if (aliveRef.current && session === sessionRef.current) setError('Failed to save sticker. Please try again.')
      } finally {
        if (aliveRef.current && session === sessionRef.current) { saveInFlightRef.current = null; setSavingVersion(null) }
      }
    },
    [
      cleanedUrl,
      // The completed result only — the pending `styleId` is deliberately NOT a
      // dependency of the save, because it is not part of what gets written.
      fancyResult,
      cleanedFile,
      enhancing,
      savingVersion,
      savedVersions,
      familyId,
      label,
      defaultLabel,
      tags,
      profile,
      onSaved,
      finalizeCaptureDefaults,
    ],
  )

  const toggleTag = useCallback((tag: StickerTag) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }, [])

  const showTransparencyBg = previewTab === 'cleaned' || previewTab === 'fancy'
  const anySaved = savedVersions.size > 0

  // The contextual save target for the footer (Original is reference-only).
  const saveTarget: SaveVersion | null =
    previewTab === 'cleaned' ? 'cleaned' : previewTab === 'fancy' ? 'fancy' : null
  const saveTargetReady =
    saveTarget === 'cleaned' ? !!cleanedFile : saveTarget === 'fancy' ? !!fancyUrl : false

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>From a Drawing</DialogTitle>

      <DialogContent>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {/* Capture stage */}
        {stage === 'capture' && (
          <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
            <Button
              variant="outlined"
              size="large"
              startIcon={<CameraAltIcon />}
              onClick={() => cameraInputRef.current?.click()}
              sx={{ py: 2, px: 4, fontSize: '1.1rem', minWidth: 260 }}
            >
              Take Photo of Drawing
            </Button>
            <Button
              variant="text"
              startIcon={<UploadIcon />}
              onClick={() => fileInputRef.current?.click()}
              sx={{ textTransform: 'none' }}
            >
              Upload a picture
            </Button>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Photograph or upload a drawing to turn it into a sticker
            </Typography>
          </Stack>
        )}

        {/* Crop stage — pick the region before the transparent cleanup */}
        {stage === 'crop' && originalUrl && (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 1 }}>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Drag the box to pick what becomes the sticker — or use the whole picture.
            </Typography>
            <SketchCropStage
              imageUrl={originalUrl}
              value={cropFraction}
              onChange={setCropFraction}
            />
          </Stack>
        )}

        {/* Cleaning stage */}
        {stage === 'cleaning' && (
          <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
            <CircularProgress />
            <Typography>Removing the background...</Typography>
          </Stack>
        )}

        {/* Preview stage */}
        {stage === 'preview' && (
          <Stack spacing={2}>
            {/* Tab selector: Original | Cleaned | Fancy */}
            <Tabs
              value={previewTab}
              onChange={(_, v: PreviewTab) => setPreviewTab(v)}
              variant="fullWidth"
              sx={{ minHeight: 36 }}
            >
              <Tab label="Original" value="original" sx={{ minHeight: 36, py: 0.5 }} />
              <Tab
                label={savedVersions.has('cleaned') ? 'Cleaned ✓' : 'Cleaned'}
                value="cleaned"
                sx={{ minHeight: 36, py: 0.5 }}
              />
              <Tab
                label={savedVersions.has('fancy') ? 'Fancy ✓' : 'Fancy'}
                value="fancy"
                icon={<AutoAwesomeIcon sx={{ fontSize: 16 }} />}
                iconPosition="start"
                sx={{ minHeight: 36, py: 0.5 }}
              />
            </Tabs>

            {/* Image preview */}
            <Box
              sx={{
                width: '100%',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                overflow: 'hidden',
                minHeight: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...(showTransparencyBg && { background: CHECKERBOARD_BG }),
              }}
            >
              {previewTab === 'original' && originalUrl && (
                <Box
                  component="img"
                  src={originalUrl}
                  alt="Original drawing"
                  sx={{ width: '100%', display: 'block' }}
                />
              )}

              {previewTab === 'cleaned' && cleanedUrl && (
                <Box
                  component="img"
                  src={cleanedUrl}
                  alt="Cleaned drawing"
                  sx={{ width: '100%', display: 'block' }}
                />
              )}

              {previewTab === 'fancy' && (
                <>
                  {enhancing && (
                    <Stack alignItems="center" spacing={1.5} sx={{ py: 4 }}>
                      <CircularProgress size={32} />
                      <Typography variant="body2" color="text.secondary">
                        Making it fancy...
                      </Typography>
                    </Stack>
                  )}
                  {!enhancing && fancyUrl && (
                    <Box
                      component="img"
                      src={fancyUrl}
                      alt="Fancy version"
                      sx={{ width: '100%', display: 'block' }}
                    />
                  )}
                  {!enhancing && !fancyUrl && (
                    <Stack alignItems="center" spacing={1.5} sx={{ py: 3, px: 2, width: '100%' }}>
                      {/* The "?" sits OUTSIDE the cap branch on purpose
                          (FEAT-178): at the cap the picker and the button are
                          replaced by the nudge, which is exactly the moment a
                          kid most needs to be told what the budget is. */}
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Typography variant="caption" color="text.secondary">
                          Making it fancy
                        </Typography>
                        <ArtHelpButton onClick={() => setShowHelp(true)} />
                      </Stack>
                      {capReached ? (
                        /* Weekly cap reached (FEAT-166): the same warm nudge the
                           other three sticker doors show — no style picker, no
                           button, no error styling, no lock. The cleaned sticker
                           they already made stays saveable. */
                        <Typography variant="body2" color="text.secondary" textAlign="center">
                          {ART_QUOTA_MESSAGE}
                        </Typography>
                      ) : (
                        <>
                          <Typography variant="body2" color="text.secondary" textAlign="center">
                            Pick a style, then make a polished version of the drawing.
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, justifyContent: 'center' }}>
                            {FANCY_STYLE_OPTIONS.map((option) => (
                              <Chip
                                key={option.id}
                                label={`${option.emoji} ${option.label}`}
                                size="small"
                                variant={styleId === option.id ? 'filled' : 'outlined'}
                                color={styleId === option.id ? 'primary' : 'default'}
                                onClick={() => setStyleId(option.id)}
                              />
                            ))}
                          </Box>
                          {/* The second axis (FEAT-197): a look says HOW the
                              drawing is redrawn, this says WHAT changes in it.
                              After the chips and never instead of one. */}
                          <CustomLookCard
                            value={customNote}
                            onChange={setCustomNote}
                            audience={audience}
                            disabled={enhancing}
                          />
                          <Box>
                            <Button
                              variant="contained"
                              startIcon={<AutoAwesomeIcon />}
                              onClick={() => void handleMakeFancy()}
                              // A submitted FANCY save owns its picture until it
                              // settles; the paid door reopens the moment it
                              // does. A cleaned save is a different picture and
                              // a different row, so it leaves this open.
                              disabled={savingVersion === 'fancy'}
                              sx={{ minHeight: 44, textTransform: 'none' }}
                            >
                              Make it fancy
                            </Button>
                            {/* Replaced by ART_QUOTA_MESSAGE at the cap — never
                                shown alongside it (FEAT-178). */}
                            <GenerateHint door="makeItFancy" audience={audience} />
                          </Box>
                        </>
                      )}
                      {enhanceError && (
                        <Typography variant="body2" color="error" textAlign="center">
                          {enhanceError}
                        </Typography>
                      )}
                      {/* One card for every way a picture can fail to arrive
                          (FEAT-195). With no note this door sends no words at
                          all, so the card shows the written tips; with one
                          (FEAT-197) the server's rewordings ARE rewordings of
                          the note, and tapping one replaces it and regenerates. */}
                      {fancyFailure && (
                        <ImageRetryCard
                          failure={fancyFailure}
                          audience={audience}
                          door={retryDoor}
                          alternatives={fancyAlternatives}
                          onUseAlternative={
                            hasCustomPictureNote(customNote)
                              ? (text) => { void handleMakeFancy(text) }
                              : undefined
                          }
                          onRetry={() => { void handleMakeFancy() }}
                          retryLabel="Make it fancy"
                        />
                      )}
                    </Stack>
                  )}
                </>
              )}
            </Box>

            {previewTab === 'cleaned' && originalFile && (
              <Stack spacing={0.5}>
                {savedVersions.has('cleaned') ? (
                  <Typography variant="body2" color="text.secondary">Cleaned sticker saved. Start another drawing to make a new cleanup.</Typography>
                ) : (
                  <Button variant="outlined" onClick={() => setAdjusting(true)} disabled={savingVersion !== null} sx={{ minHeight: 44, alignSelf: 'flex-start' }}>Adjust cleanup</Button>
                )}
                {cleanupSmallerCopy && <Typography variant="caption" color="text.secondary">Cleanup uses the smaller editable copy. Your original picture is unchanged.</Typography>}
              </Stack>
            )}

            {/* Re-style controls once a fancy version exists */}
            {previewTab === 'fancy' && fancyUrl && !enhancing && (
              <Stack spacing={1}>
                {/* Which look THIS picture was drawn in — a fact about
                    the image above, not about the chips below it. Said out loud
                    because the two can now differ: tapping another look changes
                    what the next one would be and nothing about this one. */}
                {resultLook && (
                  <Typography variant="body2" color="text.secondary">
                    This picture: {resultLook}
                  </Typography>
                )}
                {/* What the picture maker was actually asked for, when the
                    copyright rewriter changed the note (FEAT-195 × FEAT-197).
                    Parent audience only, and only when the words moved. It
                    describes the completed request, so editing the note below
                    leaves it alone. */}
                {drawnAs && (
                  <Typography variant="caption" color="text.secondary">
                    {drawnAs}
                  </Typography>
                )}
                {capReached ? (
                  /* "Try another style" is the same paid call as the first one,
                     so the cap closes this door too (FEAT-166). The fancy
                     version already made stays visible and saveable. */
                  <Typography variant="body2" color="text.secondary">
                    {ART_QUOTA_MESSAGE}
                  </Typography>
                ) : (
                  <>
                    {/* The chips below are the NEXT request, and saying so is
                        the honest half of keeping them free: picking one costs
                        nothing and changes nothing on screen until the paid tap
                        under them. */}
                    <Typography variant="caption" color="text.secondary">
                      Pick a look for the next picture — picking is free, and it
                      doesn’t change the one above.
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                      {FANCY_STYLE_OPTIONS.map((option) => (
                        <Chip
                          key={option.id}
                          label={`${option.emoji} ${option.label}`}
                          size="small"
                          variant={styleId === option.id ? 'filled' : 'outlined'}
                          color={styleId === option.id ? 'primary' : 'default'}
                          onClick={() => setStyleId(option.id)}
                        />
                      ))}
                    </Box>
                    {/* Same second axis on the redo (FEAT-197). */}
                    <CustomLookCard
                      value={customNote}
                      onChange={setCustomNote}
                      audience={audience}
                      disabled={enhancing}
                    />
                    <Box>
                      <Button
                        size="small"
                        startIcon={<AutoAwesomeIcon />}
                        onClick={() => void handleMakeFancy()}
                        // Same rule on the redo: a fancy save in flight is holding
                        // this exact picture, and a new one would take its
                        // marker. A pending cleaned save holds nothing here.
                        disabled={savingVersion === 'fancy'}
                        sx={{ textTransform: 'none' }}
                      >
                        Make it with this style
                      </Button>
                      {/* A redo is another paid picture, not a free retry
                          (FEAT-178). */}
                      <GenerateHint door="makeItFancy" audience={audience} />
                    </Box>
                  </>
                )}
                {/* A redo that didn't arrive costs the picture already made
                    nothing. Say that, and say where it stands — a
                    person looking at a failure needs to know whether the thing
                    they can still see is safe, and whether it is already in the
                    library or still waiting for a tap. */}
                {(fancyFailure || enhanceError) && (
                  <Typography variant="body2" color="text.secondary">
                    {savedVersions.has('fancy')
                      ? 'Your picture above hasn’t changed — it is already saved in your sticker library.'
                      : 'Your picture above hasn’t changed — you can still save it.'}
                  </Typography>
                )}
                {enhanceError && (
                  <Typography variant="body2" color="error">
                    {enhanceError}
                  </Typography>
                )}
                {/* The redo fails the same way the first try does (FEAT-195). */}
                {fancyFailure && (
                  <ImageRetryCard
                    failure={fancyFailure}
                    audience={audience}
                    door={retryDoor}
                    alternatives={fancyAlternatives}
                    onUseAlternative={
                      hasCustomPictureNote(customNote)
                        ? (text) => { void handleMakeFancy(text) }
                        : undefined
                    }
                    onRetry={() => { void handleMakeFancy() }}
                    retryLabel="Make it with this style"
                  />
                )}
              </Stack>
            )}

            {/* Shared tagging */}
            <TextField
              label="Sticker label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              fullWidth
              size="small"
            />

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Tags (tap to select):
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {STICKER_TAGS_ORDERED.map((tag) => (
                  <Chip
                    key={tag}
                    label={STICKER_TAG_LABELS[tag]}
                    size="small"
                    variant={tags.includes(tag) ? 'filled' : 'outlined'}
                    onClick={() => toggleTag(tag)}
                  />
                ))}
              </Box>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                For — this drawing keeps your choice even if you switch child above:
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {(['lincoln', 'london', 'both'] as const).map((p) => (
                  <Chip
                    key={p}
                    label={p === 'both' ? 'Both' : p.charAt(0).toUpperCase() + p.slice(1)}
                    size="small"
                    variant={profile === p ? 'filled' : 'outlined'}
                    onClick={() => { setProfile(p); setProfileEdited(true) }}
                  />
                ))}
              </Box>
            </Box>

            {anySaved && (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <CheckCircleIcon color="success" sx={{ fontSize: 18 }} />
                <Typography variant="body2" color="success.main">
                  Saved to your sticker library — you can save the other version too.
                </Typography>
              </Stack>
            )}
          </Stack>
        )}

        {error && (
          <Typography color="error" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {stage === 'capture' && <Button onClick={handleClose}>Cancel</Button>}
        {stage === 'cleaning' && <Button onClick={handleClose}>Cancel</Button>}

        {stage === 'crop' && (
          <>
            <Button onClick={reset}>Retake</Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={handleUseWholeImage} sx={{ textTransform: 'none' }}>
              Use the whole picture
            </Button>
            <Button
              variant="contained"
              startIcon={<CropIcon />}
              onClick={() => void handleConfirmCrop()}
              sx={{ minHeight: 44, textTransform: 'none' }}
            >
              Use it
            </Button>
          </>
        )}

        {stage === 'preview' && (
          <>
            {!anySaved && <Button onClick={handleClose} disabled={savingVersion !== null}>Cancel</Button>}
            <Button onClick={reset} disabled={savingVersion !== null}>
              Retake
            </Button>
            <Box sx={{ flex: 1 }} />
            {anySaved && (
              <Button variant="outlined" onClick={handleClose} disabled={savingVersion !== null}>
                Done
              </Button>
            )}
            {saveTarget && (
              <Button
                variant="contained"
                onClick={() => void saveSticker(saveTarget)}
                disabled={
                  savingVersion !== null ||
                  !saveTargetReady ||
                  !label.trim() ||
                  savedVersions.has(saveTarget) ||
                  // The picture this button would save is behind the spinner and
                  // about to be replaced — the offer comes back when it lands (or
                  // when it fails and the old picture is still the one on screen).
                  (saveTarget === 'fancy' && enhancing)
                }
                sx={{ minHeight: 44 }}
              >
                {savingVersion === saveTarget ? (
                  <CircularProgress size={22} color="inherit" />
                ) : savedVersions.has(saveTarget) ? (
                  'Saved ✓'
                ) : saveTarget === 'fancy' ? (
                  'Save Fancy'
                ) : (
                  'Save Cleaned'
                )}
              </Button>
            )}
          </>
        )}
      </DialogActions>

      {adjusting && originalFile && !savedVersions.has('cleaned') && (
        <StickerCleanupEditor
          file={originalFile}
          borderInsetFraction={cleanupInset}
          initialEdits={cleanupEdits}
          initialSmallerCopy={cleanupSmallerCopy}
          onCancel={() => setAdjusting(false)}
          onApply={(file, edits, smallerCopy) => {
            setCleanedFile(file)
            setCleanedUrl(URL.createObjectURL(file))
            setCleanupEdits(edits)
            setCleanupSmallerCopy(smallerCopy)
            setAdjusting(false)
          }}
        />
      )}

      <ArtHelpSheet
        surface="sketch"
        open={showHelp}
        onClose={() => setShowHelp(false)}
        audience={audience}
        budget={artBudget}
      />
    </Dialog>
  )
}
