import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import AddIcon from '@mui/icons-material/Add'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import CheckIcon from '@mui/icons-material/Check'
import ChecklistIcon from '@mui/icons-material/Checklist'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PrintIcon from '@mui/icons-material/Print'
import SchoolIcon from '@mui/icons-material/School'
import Accordion from '@mui/material/Accordion'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'

import AudioRecorder from '../../components/AudioRecorder'
import ChildSelector from '../../components/ChildSelector'
import ContextBar from '../../components/ContextBar'
import HelpStrip from '../../components/HelpStrip'
import Page from '../../components/Page'
import PhotoCapture from '../../components/PhotoCapture'
import SaveIndicator from '../../components/SaveIndicator'
import SectionCard from '../../components/SectionCard'
import { formatDateYmd, parseDateYmd } from '../../core/utils/format'
import { useFamilyId } from '../../core/auth/useAuth'
import { useActiveChild } from '../../core/hooks/useActiveChild'
import { useAI, TaskType } from '../../core/ai/useAI'
import {
  artifactsCollection,
  skillSnapshotsCollection,
} from '../../core/firebase/firestore'
import {
  generateFilename,
  uploadArtifactFile,
} from '../../core/firebase/upload'
import { useProfile } from '../../core/profile/useProfile'
import type { Artifact, ChecklistItem as ChecklistItemType, DayLog, DraftDayPlan, DraftPlanItem, LadderCardDefinition, SkillSnapshot } from '../../core/types'
import { getLaddersForChild } from '../ladders/laddersCatalog'
import TeachHelperDialog from '../planner/TeachHelperDialog'
import {
  DayBlockType,
  EnergyLevel,
  EnergyLevelLabel,
  EngineStage,
  EvidenceType,
  LearningLocation,
  PlanType,
  PlanTypeLabel,
  SubjectBucket,
  UserProfile,
} from '../../core/types/enums'
import { getWeekRange } from '../../core/utils/time'
import { blockMeta } from './blockMeta'
import { getTemplateForChild } from './dailyPlanTemplates'
import { autoFillBlockMinutes } from './daylog.model'
import HelperPanel from './HelperPanel'
import KidTodayView from './KidTodayView'
import LadderQuickLog from './LadderQuickLog'
import RoutineSection from './RoutineSection'
import { buildMaterialsPrompt, openPrintWindow } from '../planner-chat/generateMaterials'
import { useDailyPlan } from './useDailyPlan'
import { useDayLog } from './useDayLog'
import WorkshopGameCards from './WorkshopGameCards'
import { calculateXp } from './xp'

const subjectBucketColor: Record<string, string> = {
  Reading: '#3b82f6',
  LanguageArts: '#8b5cf6',
  Math: '#10b981',
  Science: '#06b6d4',
  History: '#f59e0b',
  Art: '#ec4899',
  Music: '#a855f7',
  PE: '#f97316',
  Other: '#6b7280',
}

/** Infer a subject bucket from the item label when subjectBucket is not set. */
function inferSubjectBucket(label: string): string | undefined {
  const lower = label.toLowerCase()
  if (/\bread|reading eggs|phonics|book\b/.test(lower)) return 'Reading'
  if (/\bmath|addition|subtraction|multiply|division|arithmetic\b/.test(lower)) return 'Math'
  if (/\blanguage|grammar|writing|spelling|handwriting\b/.test(lower)) return 'LanguageArts'
  if (/\bscience|experiment|nature|biology\b/.test(lower)) return 'Science'
  if (/\bhistory|social studies|geography\b/.test(lower)) return 'History'
  if (/\bart|draw|paint|craft\b/.test(lower)) return 'Art'
  if (/\bmusic|piano|sing\b/.test(lower)) return 'Music'
  if (/\bpe|exercise|movement|run\b/.test(lower)) return 'PE'
  return undefined
}

/** Get color for a checklist item, using subjectBucket or inferring from label. */
function getItemColor(item: ChecklistItemType): string | undefined {
  const bucket = item.subjectBucket ?? inferSubjectBucket(item.label)
  return bucket ? (subjectBucketColor[bucket] ?? '#6b7280') : undefined
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatTime12h(date: Date): string {
  const h = date.getHours()
  const m = date.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function TodayPage() {
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const today = useMemo(() => {
    if (dateParam && parseDateYmd(dateParam)) return dateParam
    return formatDateYmd(new Date())
  }, [dateParam])
  const familyId = useFamilyId()
  const { profile } = useProfile()
  const isKidProfile =
    profile === UserProfile.Lincoln || profile === UserProfile.London
  const {
    children,
    activeChildId: selectedChildId,
    activeChild,
    setActiveChildId: setSelectedChildId,
    isLoading: isLoadingChildren,
    addChild,
  } = useActiveChild()
  const artifactSectionRef = useRef<HTMLDivElement>(null)

  const [todayArtifacts, setTodayArtifacts] = useState<Artifact[]>([])
  const [linkingArtifactId, setLinkingArtifactId] = useState<string | null>(null)
  const [linkingLadderId, setLinkingLadderId] = useState('')
  const [linkingRungId, setLinkingRungId] = useState('')
  const [mediaUploading, setMediaUploading] = useState(false)
  const [energy, setEnergy] = useState<EnergyLevel>(EnergyLevel.Normal)
  const [planType, setPlanType] = useState<PlanType>(PlanType.Normal)
  const [showAllBlocks, setShowAllBlocks] = useState(false)
  const [teachHelperItem, setTeachHelperItem] = useState<ChecklistItemType | null>(null)
  const [teachHelperOpen, setTeachHelperOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState(false)
  const [printingMaterials, setPrintingMaterials] = useState(false)
  const [todaySnapshot, setTodaySnapshot] = useState<SkillSnapshot | null>(null)
  const [addingItem, setAddingItem] = useState(false)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [newItemMinutes, setNewItemMinutes] = useState(15)
  const [newItemSubject, setNewItemSubject] = useState<SubjectBucket>(SubjectBucket.Other)
  // Per-item capture state
  const [captureItemIndex, setCaptureItemIndex] = useState<number | null>(null)
  const [captureNote, setCaptureNote] = useState('')
  // Grade/review state (Approach A — manual input)
  const [gradeNote, setGradeNote] = useState<{ index: number; text: string } | null>(null)

  const [artifactForm, setArtifactForm] = useState({
    childId: selectedChildId,
    evidenceType: EvidenceType.Note as EvidenceType,
    engineStage: EngineStage.Wonder,
    subjectBucket: SubjectBucket.Reading,
    location: LearningLocation.Home,
    domain: '',
    content: '',
    ladderId: '',
    rungId: '',
  })

  // Keep artifact form childId in sync with active child
  useEffect(() => {
    setArtifactForm((prev) => ({ ...prev, childId: selectedChildId }))
  }, [selectedChildId])

  const selectableChildren = children
  const selectedChild = activeChild

  // Resolve card-based ladders from the catalog for the active child
  const cardLadders: LadderCardDefinition[] = useMemo(
    () => (selectedChild ? getLaddersForChild(selectedChild.name) ?? [] : []),
    [selectedChild],
  )

  // Resolve the active template and routine items for the selected child.
  // Priority: child.routineItems (Firestore) → template.routineItems → undefined (all).
  const activeTemplate = useMemo(
    () => (selectedChild ? getTemplateForChild(selectedChild.name) : undefined),
    [selectedChild],
  )
  const activeRoutineItems = useMemo(
    () => selectedChild?.routineItems ?? activeTemplate?.routineItems,
    [selectedChild?.routineItems, activeTemplate?.routineItems],
  )

  const {
    dayLog,
    saveState,
    lastSavedAt,
    weekPlanId,
    weekFocus,
    snackMessage,
    setSnackMessage,
    persistDayLog,
    persistDayLogImmediate,
  } = useDayLog({
    familyId,
    selectedChildId,
    today,
    selectedChild,
    activeTemplate,
    activeRoutineItems,
  })

  // Load/persist daily plan (energy + planType) to Firestore
  const { dailyPlan, saveDailyPlan } = useDailyPlan({
    familyId,
    childId: selectedChildId,
    date: today,
  })

  // Restore energy + planType from saved dailyPlan on load
  useEffect(() => {
    if (dailyPlan) {
      setEnergy(dailyPlan.energy)
      setPlanType(dailyPlan.planType)
    }
  }, [dailyPlan])

  const { chat: aiChat } = useAI()

  // Load skill snapshot for print materials
  useEffect(() => {
    if (!selectedChildId) return
    const ref = doc(skillSnapshotsCollection(familyId), selectedChildId)
    getDoc(ref).then((snap) => {
      if (snap.exists()) setTodaySnapshot(snap.data() as SkillSnapshot)
    }).catch(() => { /* ignore */ })
  }, [familyId, selectedChildId])

  /** Map energy level to plan type: normal → Normal Day, low/overwhelmed → MVD. */
  const energyToPlanType = (level: EnergyLevel): PlanType =>
    level === EnergyLevel.Normal ? PlanType.Normal : PlanType.Mvd

  const handleEnergyChange = useCallback(
    (newEnergy: EnergyLevel) => {
      setEnergy(newEnergy)
      const newPlanType = energyToPlanType(newEnergy)
      setPlanType(newPlanType)
      void saveDailyPlan(newEnergy, newPlanType)
    },
    [saveDailyPlan],
  )

  // Load artifacts scoped to child + date (reload when child changes)
  useEffect(() => {
    if (!selectedChildId) {
      setTodayArtifacts([])
      return
    }
    let isMounted = true

    const loadArtifacts = async () => {
      try {
        const q = query(
          artifactsCollection(familyId),
          where('dayLogId', '==', today),
          where('childId', '==', selectedChildId),
        )
        const snapshot = await getDocs(q)
        if (!isMounted) return
        const loadedArtifacts = snapshot.docs
          .map((docSnapshot) => docSnapshot.data())
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        setTodayArtifacts(loadedArtifacts)
      } catch (err) {
        console.error('Failed to load artifacts', err)
        if (isMounted) {
          setSnackMessage({ text: 'Could not load artifacts.', severity: 'error' })
        }
      }
    }

    loadArtifacts()

    return () => {
      isMounted = false
    }
  }, [familyId, today, selectedChildId, setSnackMessage])

  const selectedLadder = useMemo(
    () => cardLadders.find((l) => l.ladderKey === artifactForm.ladderId),
    [artifactForm.ladderId, cardLadders],
  )

  const linkingLadder = useMemo(
    () => cardLadders.find((l) => l.ladderKey === linkingLadderId),
    [cardLadders, linkingLadderId],
  )

  // --- Block field handlers ---

  const handleBlockFieldChange = useCallback(
    (index: number, field: keyof DayLog['blocks'][number], value: unknown) => {
      if (!dayLog) return
      const updatedBlocks = dayLog.blocks.map((block, blockIndex) =>
        blockIndex === index ? { ...block, [field]: value } : block,
      )
      const updated = { ...dayLog, blocks: updatedBlocks }
      // Debounce text fields; persist selects/numbers immediately
      if (field === 'notes') {
        persistDayLog(updated)
      } else {
        persistDayLogImmediate(updated)
      }
    },
    [dayLog, persistDayLog, persistDayLogImmediate],
  )

  const handleChecklistToggle = useCallback(
    (blockIndex: number, itemIndex: number) => {
      if (!dayLog) return
      const updatedBlocks = dayLog.blocks.map((block, currentIndex) => {
        if (currentIndex !== blockIndex || !block.checklist) {
          return block
        }
        const updatedChecklist = block.checklist.map((item, checklistIndex) =>
          checklistIndex === itemIndex
            ? { ...item, completed: !item.completed }
            : item,
        )
        const allCompleted = updatedChecklist.every((item) => item.completed)
        // Auto-populate actualMinutes from plannedMinutes when all items are
        // checked, but only if the user hasn't manually set a different value.
        let { actualMinutes } = block
        if (allCompleted && block.plannedMinutes != null) {
          if (actualMinutes == null || actualMinutes === 0) {
            actualMinutes = block.plannedMinutes
          }
        } else if (!allCompleted) {
          // Clear auto-populated value when unchecking — only if it still
          // matches plannedMinutes (meaning the user didn't manually edit it).
          if (actualMinutes != null && actualMinutes === block.plannedMinutes) {
            actualMinutes = undefined
          }
        }
        return { ...block, checklist: updatedChecklist, actualMinutes }
      })
      persistDayLogImmediate({ ...dayLog, blocks: updatedBlocks })
    },
    [dayLog, persistDayLogImmediate],
  )

  // --- Print materials handler ---

  const handlePrintTodayMaterials = useCallback(async () => {
    if (!dayLog?.checklist || !selectedChildId) return
    setPrintingMaterials(true)

    try {
      const parseMinutes = (label: string): number => {
        const match = label.match(/\((\d+)m\)/)
        return match ? parseInt(match[1]) : 15
      }

      const todayPlan: DraftDayPlan = {
        day: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        timeBudgetMinutes: 150,
        items: dayLog.checklist
          .filter((i) => !i.completed)
          .map((i) => ({
            id: i.id ?? '',
            title: i.label.replace(/\s*\(\d+m\)\s*$/, ''),
            subjectBucket: (i.subjectBucket ?? SubjectBucket.Other) as DraftPlanItem['subjectBucket'],
            estimatedMinutes: i.estimatedMinutes ?? i.plannedMinutes ?? parseMinutes(i.label),
            skillTags: i.skillTags ?? [],
            isAppBlock: false,
            accepted: true,
          })),
      }

      const prompt = buildMaterialsPrompt(
        todayPlan,
        activeChild?.name ?? 'Student',
        todaySnapshot,
        weekFocus?.theme,
      )

      const response = await aiChat({
        familyId,
        childId: selectedChildId,
        taskType: TaskType.Chat,
        messages: [{ role: 'user', content: prompt }],
      })

      if (response?.message) {
        openPrintWindow(response.message, `${activeChild?.name ?? 'Student'} - Today`)
      }
    } catch (err) {
      console.error('Material generation failed:', err)
      setSnackMessage({ text: 'Failed to generate materials. Try again.', severity: 'error' })
    } finally {
      setPrintingMaterials(false)
    }
  }, [dayLog, selectedChildId, activeChild, todaySnapshot, weekFocus, aiChat, familyId, setSnackMessage])

  // --- Artifact handlers ---

  const handleArtifactChange = useCallback(
    (
      field: keyof typeof artifactForm,
      value: (typeof artifactForm)[keyof typeof artifactForm],
    ) => {
      setArtifactForm((prev) => ({ ...prev, [field]: value }))
    },
    [],
  )

  const buildArtifactBase = useCallback(
    (title: string, evidenceType: EvidenceType) => {
      const createdAt = new Date().toISOString()
      const ladderRef =
        artifactForm.ladderId && artifactForm.rungId
          ? { ladderId: artifactForm.ladderId, rungId: artifactForm.rungId }
          : undefined
      return {
        title,
        type: evidenceType,
        createdAt,
        childId: artifactForm.childId,
        dayLogId: today,
        weekPlanId,
        tags: {
          engineStage: artifactForm.engineStage,
          domain: artifactForm.domain,
          subjectBucket: artifactForm.subjectBucket,
          location: artifactForm.location,
          ...(ladderRef ? { ladderRef } : {}),
        },
        notes: '',
      }
    },
    [artifactForm, today, weekPlanId],
  )

  const handleArtifactSave = useCallback(async () => {
    const content = artifactForm.content.trim()
    const domain = artifactForm.domain.trim()
    const title =
      content.slice(0, 60) || domain || `Artifact for ${today}`

    const artifact = {
      ...buildArtifactBase(title, EvidenceType.Note),
      content: artifactForm.content,
    }

    try {
      const docRef = await addDoc(artifactsCollection(familyId), artifact)
      setTodayArtifacts((prev) => [{ ...artifact, id: docRef.id }, ...prev])
      setArtifactForm((prev) => ({ ...prev, domain: '', content: '' }))
      setSnackMessage({ text: 'Note saved.', severity: 'success' })
    } catch (err) {
      console.error('Failed to save artifact', err)
      setSnackMessage({ text: 'Failed to save note.', severity: 'error' })
    }
  }, [artifactForm, buildArtifactBase, familyId, today, setSnackMessage])

  const handlePhotoCapture = useCallback(
    async (file: File) => {
      setMediaUploading(true)
      try {
        const domain = artifactForm.domain.trim()
        const title = domain || `Photo ${today}`
        const artifact = buildArtifactBase(title, EvidenceType.Photo)
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const ext = file.name.split('.').pop() ?? 'jpg'
        const filename = generateFilename(ext)
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, file, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })
        setTodayArtifacts((prev) => [
          { ...artifact, id: docRef.id, uri: downloadUrl },
          ...prev,
        ])
        setArtifactForm((prev) => ({ ...prev, domain: '' }))
        setSnackMessage({ text: 'Photo uploaded.', severity: 'success' })
      } catch (err) {
        console.error('Photo upload failed', err)
        setSnackMessage({ text: 'Photo upload failed.', severity: 'error' })
      } finally {
        setMediaUploading(false)
      }
    },
    [artifactForm, buildArtifactBase, familyId, today, setSnackMessage],
  )

  const handleAudioCapture = useCallback(
    async (blob: Blob) => {
      setMediaUploading(true)
      try {
        const domain = artifactForm.domain.trim()
        const title = domain || `Audio ${today}`
        const artifact = buildArtifactBase(title, EvidenceType.Audio)
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const filename = generateFilename('webm')
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, blob, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })
        setTodayArtifacts((prev) => [
          { ...artifact, id: docRef.id, uri: downloadUrl },
          ...prev,
        ])
        setArtifactForm((prev) => ({ ...prev, domain: '' }))
        setSnackMessage({ text: 'Audio uploaded.', severity: 'success' })
      } catch (err) {
        console.error('Audio upload failed', err)
        setSnackMessage({ text: 'Audio upload failed.', severity: 'error' })
      } finally {
        setMediaUploading(false)
      }
    },
    [artifactForm, buildArtifactBase, familyId, today, setSnackMessage],
  )

  const handleStartLinking = useCallback((artifact: Artifact) => {
    setLinkingArtifactId(artifact.id ?? null)
    setLinkingLadderId(artifact.tags.ladderRef?.ladderId ?? '')
    setLinkingRungId(artifact.tags.ladderRef?.rungId ?? '')
  }, [])

  const handleLinkingLadderChange = useCallback((value: string) => {
    setLinkingLadderId(value)
    setLinkingRungId('')
  }, [])

  const handleLinkingRungChange = useCallback(
    async (value: string) => {
      setLinkingRungId(value)
      if (!linkingArtifactId || !linkingLadderId || !value) return
      try {
        await updateDoc(doc(artifactsCollection(familyId), linkingArtifactId), {
          'tags.ladderRef': { ladderId: linkingLadderId, rungId: value },
        })
        setTodayArtifacts((prev) =>
          prev.map((artifact) =>
            artifact.id === linkingArtifactId
              ? {
                  ...artifact,
                  tags: {
                    ...artifact.tags,
                    ladderRef: { ladderId: linkingLadderId, rungId: value },
                  },
                }
              : artifact,
          ),
        )
        setLinkingArtifactId(null)
        setLinkingLadderId('')
        setLinkingRungId('')
      } catch (err) {
        console.error('Failed to link artifact', err)
        setSnackMessage({ text: 'Failed to link artifact.', severity: 'error' })
      }
    },
    [familyId, linkingArtifactId, linkingLadderId, setSnackMessage],
  )

  const getArtifactLinkLabel = useCallback(
    (artifact: Artifact) => {
      const ladderRef = artifact.tags?.ladderRef
      if (!ladderRef) return 'Unlinked'
      const ladder = cardLadders.find((item) => item.ladderKey === ladderRef.ladderId)
      const rung = ladder?.rungs.find((item) => item.rungId === ladderRef.rungId)
      return `${ladder?.title ?? 'Ladder'} \u00b7 ${rung?.name ?? 'Rung'}`
    },
    [cardLadders],
  )

  // --- Per-item capture handler (component-level for dialog access) ---

  const handleItemPhotoCapture = useCallback(
    async (file: File) => {
      if (captureItemIndex === null || !dayLog?.checklist) return
      const item = dayLog.checklist[captureItemIndex]
      try {
        const artifact = {
          childId: selectedChildId,
          title: `${item.label.replace(/\s*\(\d+m\)/, '')} — ${activeChild?.name ?? 'Student'}'s work`,
          type: EvidenceType.Photo,
          dayLogId: today,
          createdAt: new Date().toISOString(),
          tags: {
            engineStage: EngineStage.Build,
            domain: '',
            subjectBucket: item.subjectBucket ?? SubjectBucket.Other,
            location: 'Home',
            planItem: item.label,
            ...(captureNote ? { note: captureNote } : {}),
          },
        }
        const docRef = await addDoc(artifactsCollection(familyId), artifact)
        const ext = file.name.split('.').pop() ?? 'jpg'
        const filename = generateFilename(ext)
        const { downloadUrl } = await uploadArtifactFile(familyId, docRef.id, file, filename)
        await updateDoc(doc(artifactsCollection(familyId), docRef.id), { uri: downloadUrl })

        // Link artifact to checklist item
        const updatedChecklist = dayLog.checklist.map((ci, i) =>
          i === captureItemIndex ? { ...ci, evidenceArtifactId: docRef.id } : ci
        )
        persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
        setTodayArtifacts((prev) => [
          { ...artifact, id: docRef.id, uri: downloadUrl } as Artifact,
          ...prev,
        ])
        setCaptureItemIndex(null)
        setCaptureNote('')
        setSnackMessage({ text: 'Work captured!', severity: 'success' })
      } catch (err) {
        console.error('Item photo capture failed:', err)
        setSnackMessage({ text: 'Photo upload failed. Try again.', severity: 'error' })
      }
    },
    [captureItemIndex, captureNote, dayLog, selectedChildId, activeChild, today, familyId, persistDayLogImmediate, setSnackMessage],
  )

  // --- Loading state ---

  const handleRoutineUpdate = useCallback(
    (updated: DayLog) => {
      const withMinutes = autoFillBlockMinutes(updated, activeRoutineItems)
      const withXp = { ...withMinutes, xpTotal: calculateXp(withMinutes, activeRoutineItems) }
      persistDayLog(withXp)
    },
    [persistDayLog, activeRoutineItems],
  )

  const handleRoutineUpdateImmediate = useCallback(
    (updated: DayLog) => {
      const withMinutes = autoFillBlockMinutes(updated, activeRoutineItems)
      const withXp = { ...withMinutes, xpTotal: calculateXp(withMinutes, activeRoutineItems) }
      persistDayLogImmediate(withXp)
    },
    [persistDayLogImmediate, activeRoutineItems],
  )

  const scrollToArtifacts = useCallback(() => {
    artifactSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Compute Daily Log status label
  const dailyLogStatus = useMemo(() => {
    if (!dayLog) return null
    if (lastSavedAt) {
      try {
        const d = new Date(lastSavedAt)
        return `Saved at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      } catch {
        return 'Saved'
      }
    }
    if (dayLog.updatedAt) {
      try {
        const d = new Date(dayLog.updatedAt)
        return `Saved at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      } catch {
        return 'Saved'
      }
    }
    return 'Not saved yet'
  }, [dayLog, lastSavedAt])

  // Kid profile early return — render dedicated kid view
  if (isKidProfile && dayLog && activeChild) {
    const weekRange = getWeekRange(parseDateYmd(today) ?? new Date())
    return (
      <KidTodayView
        dayLog={dayLog}
        child={activeChild}
        persistDayLogImmediate={persistDayLogImmediate}
        familyId={familyId}
        today={today}
        weekStart={weekRange.start}
        isMvd={planType === PlanType.Mvd}
        weekFocus={weekFocus}
      />
    )
  }

  if (!dayLog) {
    return (
      <Page>
        <ContextBar
          page="today"
          activeChild={activeChild}
          dateKey={today}
        />
        <Typography variant="h4" component="h1">Today</Typography>
        <HelpStrip
          pageKey="today"
          text="This is today's checklist. Saving creates the Daily Log."
        />
        {isKidProfile ? (
          <Typography variant="subtitle1" color="text.secondary">
            {selectedChild?.name ?? 'Loading...'}
          </Typography>
        ) : (
          <ChildSelector
            children={children}
            selectedChildId={selectedChildId}
            onSelect={setSelectedChildId}
            onChildAdded={addChild}
            isLoading={isLoadingChildren}
            emptyMessage="Add a child to start logging."
          />
        )}
        {selectedChildId && (
          <SectionCard title="DayLog">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CircularProgress size={20} />
              <Typography color="text.secondary">Loading today&apos;s log...</Typography>
            </Box>
          </SectionCard>
        )}
      </Page>
    )
  }

  return (
    <Page>
      <ContextBar
        page="today"
        activeChild={activeChild}
        dateKey={today}
        onCaptureArtifact={scrollToArtifacts}
      />
      <Typography variant="h4" component="h1">Today</Typography>
      <HelpStrip
        pageKey="today"
        text="This is today's checklist. Saving creates the Daily Log."
      />
      {isKidProfile ? (
        <Typography variant="subtitle1" color="text.secondary">
          {selectedChild?.name}
        </Typography>
      ) : (
        <ChildSelector
          children={children}
          selectedChildId={selectedChildId}
          onSelect={setSelectedChildId}
          onChildAdded={addChild}
          isLoading={isLoadingChildren}
          emptyMessage="Add a child to start logging."
        />
      )}

      {/* Daily Log status line */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderRadius: 1,
          bgcolor: lastSavedAt ? 'success.50' : 'action.hover',
          border: '1px solid',
          borderColor: lastSavedAt ? 'success.200' : 'divider',
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          Daily Log: {dailyLogStatus}
        </Typography>
        <SaveIndicator state={saveState} />
      </Box>

      <HelperPanel template={activeTemplate} />

      {/* --- Energy selector --- */}
      <SectionCard title={`DayLog (${dayLog.date})`}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography color="text.secondary" variant="body2">
            How&apos;s your energy today?
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <ToggleButtonGroup
              value={energy}
              exclusive
              size="small"
              onChange={(_e, value) => { if (value) handleEnergyChange(value as EnergyLevel) }}
            >
              {Object.values(EnergyLevel).map((level) => (
                <ToggleButton key={level} value={level}>
                  {EnergyLevelLabel[level]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Chip
              size="small"
              label={PlanTypeLabel[planType]}
              color={planType === PlanType.Normal ? 'success' : 'warning'}
              variant="outlined"
            />
            <SaveIndicator state={saveState} />
          </Stack>
        </Stack>
      </SectionCard>

      {/* --- Week Focus --- */}
      {weekFocus && (weekFocus.theme || weekFocus.scriptureRef) && (
        <Box sx={{
          p: 2, borderRadius: 2,
          bgcolor: 'primary.50',
          border: '1px solid',
          borderColor: 'primary.100',
        }}>
          {weekFocus.theme && (
            <Typography variant="subtitle2" color="primary.main">
              Theme: {weekFocus.theme}
            </Typography>
          )}
          {weekFocus.virtue && (
            <Typography variant="body2" color="text.secondary">
              Virtue: {weekFocus.virtue}
            </Typography>
          )}
          {weekFocus.scriptureRef && (
            <Typography variant="body2" sx={{ fontStyle: 'italic', mt: 0.5 }}>
              📖 {weekFocus.scriptureRef}
            </Typography>
          )}
          {weekFocus.heartQuestion && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              ❤️ {weekFocus.heartQuestion}
            </Typography>
          )}
        </Box>
      )}

      {/* --- Workshop Game Cards --- */}
      {familyId && children.length > 0 && (
        <WorkshopGameCards familyId={familyId} children={children} />
      )}

      {/* --- Today's Plan checklist (PRIMARY) --- */}
      {(() => {
        const rawChecklist = dayLog.checklist ?? []
        const hasPlanItems = rawChecklist.length > 0
        const isMvd = planType === PlanType.Mvd
        // When no items are marked mvdEssential, default first 3 as essential
        const essentialCount = rawChecklist.filter(i => i.mvdEssential).length
        const checklist = essentialCount > 0
          ? rawChecklist
          : rawChecklist.map((item, i) => ({ ...item, mvdEssential: i < 3 }))
        const completedCount = checklist.filter((item) => item.completed).length
        const parseMinutesFromLabel = (label: string): number => {
          const match = label.match(/\((\d+)m\)/)
          return match ? parseInt(match[1]) : 0
        }
        const totalPlannedMinutes = checklist.reduce((sum, item) => {
          return sum + (item.plannedMinutes ?? item.estimatedMinutes ?? parseMinutesFromLabel(item.label))
        }, 0)

        const handleReorder = (fromIndex: number, direction: 'up' | 'down') => {
          const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
          if (toIndex < 0 || toIndex >= rawChecklist.length) return
          const updated = [...rawChecklist]
          const temp = updated[fromIndex]
          updated[fromIndex] = updated[toIndex]
          updated[toIndex] = temp
          persistDayLogImmediate({ ...dayLog, checklist: updated })
        }

        const handleDeleteItem = (index: number) => {
          const item = rawChecklist[index]
          const updatedChecklist = rawChecklist.filter((_, i) => i !== index)
          // If planner-sourced, also remove matching block
          let updatedBlocks = dayLog.blocks
          if (item.source === 'planner') {
            updatedBlocks = dayLog.blocks.filter((block) => {
              const matchesLabel = block.checklist?.some((ci) => ci.label === item.label)
              return !matchesLabel
            })
          }
          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist, blocks: updatedBlocks })
        }

        const handleEditLabel = (index: number, newLabel: string) => {
          const updatedChecklist = rawChecklist.map((ci, i) =>
            i === index ? { ...ci, label: newLabel } : ci
          )
          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
        }

        const handleEditMinutes = (index: number, minutes: number) => {
          const item = rawChecklist[index]
          const updatedChecklist = rawChecklist.map((ci, i) =>
            i === index ? { ...ci, plannedMinutes: minutes } : ci
          )
          // Also update the corresponding block's plannedMinutes
          const updatedBlocks = dayLog.blocks.map((block) => {
            const matchesLabel = block.checklist?.some((ci) => ci.label === item.label)
            if (matchesLabel) return { ...block, plannedMinutes: minutes }
            return block
          })
          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist, blocks: updatedBlocks })
        }

        const handleAddItem = () => {
          if (!newItemTitle.trim()) return
          const newItem: ChecklistItemType = {
            label: newItemTitle.trim(),
            completed: false,
            plannedMinutes: newItemMinutes,
            subjectBucket: newItemSubject,
            source: 'manual',
          }
          const updatedChecklist = [...rawChecklist, newItem]
          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
          setNewItemTitle('')
          setNewItemMinutes(15)
          setNewItemSubject(SubjectBucket.Other)
          setAddingItem(false)
        }

        const handleEngagement = (index: number, engagement: ChecklistItemType['engagement']) => {
          const updatedChecklist = rawChecklist.map((ci, i) =>
            i === index ? { ...ci, engagement } : ci
          )
          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
        }

        const handleItemCapture = (index: number) => {
          setCaptureItemIndex(index)
          setCaptureNote('')
        }

        const handleSaveGradeNote = (index: number, text: string) => {
          if (!dayLog?.checklist || !text.trim()) return
          const updatedChecklist = dayLog.checklist.map((ci, i) =>
            i === index ? { ...ci, gradeResult: text.trim() } : ci
          )
          persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist })
          setGradeNote(null)
        }

        return (
          <SectionCard title="Today's Plan" action={
            hasPlanItems ? (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Button
                  size="small"
                  variant="text"
                  startIcon={printingMaterials ? <CircularProgress size={14} /> : <PrintIcon />}
                  onClick={handlePrintTodayMaterials}
                  disabled={printingMaterials}
                  sx={{ minWidth: 0, px: 1 }}
                >
                  {printingMaterials ? 'Generating...' : 'Print'}
                </Button>
                <IconButton size="small" onClick={() => { setEditingPlan(!editingPlan); setAddingItem(false) }}>
                  {editingPlan ? <CheckIcon /> : <EditIcon />}
                </IconButton>
              </Stack>
            ) : undefined
          }>
            {hasPlanItems ? (
              <Stack spacing={1.5}>
                {/* Summary line */}
                <Typography variant="body2" color="text.secondary" sx={{ px: 0.5 }}>
                  {formatMinutes(totalPlannedMinutes)} planned{' \u00B7 '}
                  {completedCount} of {checklist.length} done
                  {(() => {
                    const remainingMinutes = checklist
                      .filter((ci) => !ci.completed)
                      .reduce((sum, ci) => sum + (ci.plannedMinutes ?? ci.estimatedMinutes ?? parseMinutesFromLabel(ci.label)), 0)
                    if (remainingMinutes > 0 && completedCount < checklist.length) {
                      const est = new Date(Date.now() + remainingMinutes * 60_000)
                      return ` \u00B7 Est. finish: ${formatTime12h(est)}`
                    }
                    return ''
                  })()}
                </Typography>

                {/* Checklist items */}
                {checklist.map((item, index) => {
                  const isDimmed = isMvd && item.mvdEssential !== true
                  const dotColor = getItemColor(item)

                  if (editingPlan) {
                    return (
                      <Stack key={index} direction="row" spacing={0.5} alignItems="center">
                        {/* Reorder buttons */}
                        <Stack>
                          <IconButton
                            size="small"
                            disabled={index === 0}
                            onClick={() => handleReorder(index, 'up')}
                            sx={{ p: 0.25 }}
                          >
                            <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                          <IconButton
                            size="small"
                            disabled={index === checklist.length - 1}
                            onClick={() => handleReorder(index, 'down')}
                            sx={{ p: 0.25 }}
                          >
                            <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Stack>
                        {/* Editable title */}
                        <TextField
                          size="small"
                          variant="standard"
                          value={item.label}
                          onChange={(e) => handleEditLabel(index, e.target.value)}
                          sx={{ flex: 1 }}
                          inputProps={{ style: { fontSize: '0.875rem' } }}
                        />
                        {/* Editable minutes */}
                        <TextField
                          size="small"
                          variant="standard"
                          type="number"
                          value={item.plannedMinutes ?? 0}
                          onChange={(e) => handleEditMinutes(index, Math.max(0, parseInt(e.target.value) || 0))}
                          sx={{ width: 48 }}
                          inputProps={{ min: 0, style: { fontSize: '0.875rem', textAlign: 'right' } }}
                        />
                        <Typography variant="caption" color="text.secondary">m</Typography>
                        {/* Delete button */}
                        <IconButton size="small" onClick={() => handleDeleteItem(index)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    )
                  }

                  return (
                    <Box key={index}>
                      <Stack
                        direction="row"
                        spacing={0.5}
                        alignItems="center"
                        sx={{
                          ...(item.completed ? { textDecoration: 'line-through', opacity: 0.6 } : {}),
                          ...(isDimmed && !item.completed ? { opacity: 0.5 } : {}),
                        }}
                      >
                        {dotColor && (
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: dotColor,
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <Checkbox
                          checked={item.completed}
                          onChange={() => {
                            const newCompleted = !item.completed
                            const updatedChecklist = dayLog.checklist!.map((ci, i) =>
                              i === index ? { ...ci, completed: newCompleted } : ci
                            )
                            // Auto-set actualMinutes on corresponding block when checking
                            const minutes = item.estimatedMinutes ?? item.plannedMinutes ?? 0
                            let updatedBlocks = dayLog.blocks
                            if (newCompleted && minutes > 0) {
                              updatedBlocks = dayLog.blocks.map((block) => {
                                const matchesLabel = block.checklist?.some((ci) => ci.label === item.label)
                                const titleClean = item.label.replace(/\s*\(\d+m\)\s*$/, '')
                                const matchesTitle = block.title != null && (
                                  block.title === titleClean ||
                                  titleClean.toLowerCase().includes(block.title.toLowerCase())
                                )
                                if ((matchesLabel || matchesTitle) && (block.actualMinutes == null || block.actualMinutes === 0)) {
                                  return { ...block, actualMinutes: minutes }
                                }
                                return block
                              })
                            } else if (!newCompleted) {
                              // Clear auto-populated actualMinutes when unchecking
                              updatedBlocks = dayLog.blocks.map((block) => {
                                const matchesLabel = block.checklist?.some((ci) => ci.label === item.label)
                                const titleClean = item.label.replace(/\s*\(\d+m\)\s*$/, '')
                                const matchesTitle = block.title != null && (
                                  block.title === titleClean ||
                                  titleClean.toLowerCase().includes(block.title.toLowerCase())
                                )
                                if ((matchesLabel || matchesTitle) && block.actualMinutes === minutes) {
                                  return { ...block, actualMinutes: undefined }
                                }
                                return block
                              })
                            }
                            persistDayLogImmediate({ ...dayLog, checklist: updatedChecklist, blocks: updatedBlocks })
                          }}
                        />
                        <Typography variant="body2" sx={{ flex: 1 }}>
                          {item.label}
                        </Typography>
                        {item.plannedMinutes != null && item.plannedMinutes > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            {item.plannedMinutes}m
                          </Typography>
                        )}
                        {isDimmed && !item.completed && (
                          <Chip label="(stretch)" size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                        )}
                        {!item.completed && (
                          <Tooltip title={item.lessonCardId ? 'View lesson plan' : 'Help me teach this'}>
                            <IconButton
                              size="small"
                              onClick={() => {
                                setTeachHelperItem(item)
                                setTeachHelperOpen(true)
                              }}
                            >
                              <SchoolIcon
                                fontSize="small"
                                color={item.lessonCardId ? 'primary' : 'action'}
                                sx={item.lessonCardId ? undefined : { opacity: 0.5 }}
                              />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                      {/* Engagement feedback: emoji row after completion */}
                      {item.completed && !item.engagement && (
                        <Stack direction="row" spacing={0.5} sx={{ ml: 5, mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, lineHeight: '24px' }}>
                            How&apos;d it go?
                          </Typography>
                          {([
                            { value: 'engaged' as const, emoji: '\u{1F60A}', label: 'Engaged' },
                            { value: 'okay' as const, emoji: '\u{1F610}', label: 'Okay' },
                            { value: 'struggled' as const, emoji: '\u{1F62B}', label: 'Struggled' },
                            { value: 'refused' as const, emoji: '\u{274C}', label: 'Refused' },
                          ]).map(opt => (
                            <IconButton
                              key={opt.value}
                              size="small"
                              onClick={() => handleEngagement(index, opt.value)}
                              title={opt.label}
                              sx={{ fontSize: '1.2rem', p: 0.5 }}
                            >
                              {opt.emoji}
                            </IconButton>
                          ))}
                        </Stack>
                      )}
                      {/* Show saved engagement as a small chip */}
                      {item.engagement && (
                        <Chip
                          size="small"
                          label={{
                            engaged: '\u{1F60A} Engaged',
                            okay: '\u{1F610} Okay',
                            struggled: '\u{1F62B} Struggled',
                            refused: '\u{274C} Refused',
                          }[item.engagement]}
                          sx={{ ml: 5, mt: 0.5, height: 22 }}
                          onDelete={() => handleEngagement(index, undefined)}
                          variant="outlined"
                        />
                      )}

                      {/* Per-item capture — appears after checking off */}
                      {item.completed && (
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 5, mt: 0.5 }}>
                          {/* Capture button */}
                          {!item.evidenceArtifactId && (
                            <IconButton
                              size="small"
                              onClick={() => handleItemCapture(index)}
                              title="Capture work"
                            >
                              <CameraAltIcon fontSize="small" />
                            </IconButton>
                          )}
                          {/* Show if evidence already captured */}
                          {item.evidenceArtifactId && (
                            <Chip size="small" label="Captured" variant="outlined" color="success" sx={{ height: 22 }} />
                          )}
                        </Stack>
                      )}

                      {/* Scan & Review: manual quick-check after capture */}
                      {item.evidenceArtifactId && !item.gradeResult && gradeNote?.index !== index && (
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => setGradeNote({ index, text: '' })}
                          sx={{ ml: 5, mt: 0.5, textTransform: 'none' }}
                        >
                          Quick Review
                        </Button>
                      )}

                      {/* Grade note input (Approach A — manual) */}
                      {gradeNote?.index === index && (
                        <Stack spacing={1} sx={{ ml: 5, mt: 0.5 }}>
                          <Typography variant="body2">Quick check: how did it go?</Typography>
                          <TextField
                            size="small"
                            placeholder="e.g., 5/6 correct, missed regrouping on #4"
                            value={gradeNote.text}
                            onChange={(e) => setGradeNote({ index, text: e.target.value })}
                            multiline
                            rows={2}
                            autoFocus
                          />
                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleSaveGradeNote(index, gradeNote.text)}
                              disabled={!gradeNote.text.trim()}
                            >
                              Save
                            </Button>
                            <Button size="small" onClick={() => setGradeNote(null)}>
                              Cancel
                            </Button>
                          </Stack>
                        </Stack>
                      )}

                      {/* Display saved grade result */}
                      {item.gradeResult && (
                        <Box sx={{ ml: 5, mt: 0.5, p: 1, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                          <Typography variant="caption" color="text.secondary">Review:</Typography>
                          <Typography variant="body2">{item.gradeResult}</Typography>
                        </Box>
                      )}
                    </Box>
                  )
                })}

                {/* Add Item (edit mode only) */}
                {editingPlan && !addingItem && (
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => setAddingItem(true)}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    Add Item
                  </Button>
                )}
                {editingPlan && addingItem && (
                  <Stack spacing={1} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <TextField
                      size="small"
                      label="Title"
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      autoFocus
                    />
                    <Stack direction="row" spacing={1}>
                      <TextField
                        size="small"
                        label="Minutes"
                        type="number"
                        value={newItemMinutes}
                        onChange={(e) => setNewItemMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                        sx={{ width: 100 }}
                        inputProps={{ min: 0 }}
                      />
                      <TextField
                        size="small"
                        label="Subject"
                        select
                        value={newItemSubject}
                        onChange={(e) => setNewItemSubject(e.target.value as SubjectBucket)}
                        sx={{ flex: 1 }}
                      >
                        {Object.values(SubjectBucket).map((sb) => (
                          <MenuItem key={sb} value={sb}>{sb}</MenuItem>
                        ))}
                      </TextField>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="contained" onClick={handleAddItem} disabled={!newItemTitle.trim()}>
                        Add
                      </Button>
                      <Button size="small" onClick={() => setAddingItem(false)}>
                        Cancel
                      </Button>
                    </Stack>
                  </Stack>
                )}
              </Stack>
            ) : (
              <Stack spacing={1} sx={{ py: 1 }}>
                <Typography color="text.secondary">
                  No plan for today yet.{' '}
                  <RouterLink to="/planner" style={{ color: 'inherit' }}>
                    Go to Plan My Week
                  </RouterLink>{' '}
                  to create one, or use the routine below.
                </Typography>
              </Stack>
            )}
          </SectionCard>
        )
      })()}

      {/* --- Per-item capture dialog --- */}
      <Dialog open={captureItemIndex !== null} onClose={() => setCaptureItemIndex(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Capture: {captureItemIndex !== null ? dayLog.checklist?.[captureItemIndex]?.label?.replace(/\s*\(\d+m\)/, '') : ''}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <PhotoCapture onCapture={(file: File) => { void handleItemPhotoCapture(file) }} />
            <TextField
              label="Quick note (optional)"
              placeholder="What went well, what to work on..."
              value={captureNote}
              onChange={(e) => setCaptureNote(e.target.value)}
              size="small"
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
      </Dialog>

      {/* --- Quick Capture --- */}
      <div ref={artifactSectionRef} />
      <SectionCard title="Quick Capture">
        <Stack spacing={2}>
          <ToggleButtonGroup
            value={artifactForm.evidenceType}
            exclusive
            onChange={(_event, value) => {
              if (value) handleArtifactChange('evidenceType', value)
            }}
            fullWidth
            size="large"
          >
            <ToggleButton value={EvidenceType.Note}>Note</ToggleButton>
            <ToggleButton value={EvidenceType.Photo}>Photo</ToggleButton>
            <ToggleButton value={EvidenceType.Audio}>Audio</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            label="Child"
            select
            value={artifactForm.childId}
            onChange={(event) => handleArtifactChange('childId', event.target.value)}
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
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="Engine stage"
              select
              fullWidth
              value={artifactForm.engineStage}
              onChange={(event) =>
                handleArtifactChange('engineStage', event.target.value as EngineStage)
              }
            >
              {Object.values(EngineStage).map((stage) => (
                <MenuItem key={stage} value={stage}>
                  {stage}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Subject bucket"
              select
              fullWidth
              value={artifactForm.subjectBucket}
              onChange={(event) =>
                handleArtifactChange(
                  'subjectBucket',
                  event.target.value as SubjectBucket,
                )
              }
            >
              {Object.values(SubjectBucket).map((bucket) => (
                <MenuItem key={bucket} value={bucket}>
                  {bucket}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Location"
              select
              fullWidth
              value={artifactForm.location}
              onChange={(event) =>
                handleArtifactChange(
                  'location',
                  event.target.value as LearningLocation,
                )
              }
            >
              {Object.values(LearningLocation).map((location) => (
                <MenuItem key={location} value={location}>
                  {location}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Domain"
            value={artifactForm.domain}
            onChange={(event) => handleArtifactChange('domain', event.target.value)}
          />
          <TextField
            label="Ladder"
            select
            value={artifactForm.ladderId}
            onChange={(event) => {
              const ladderId = event.target.value
              setArtifactForm((prev) => ({
                ...prev,
                ladderId,
                rungId: '',
              }))
            }}
          >
            <MenuItem value="">No ladder</MenuItem>
            {cardLadders.map((ladder) => (
              <MenuItem key={ladder.ladderKey} value={ladder.ladderKey}>
                {ladder.title}
              </MenuItem>
            ))}
          </TextField>
          {selectedLadder && selectedLadder.rungs.length > 0 && (
            <TextField
              label="Rung (optional)"
              select
              value={artifactForm.rungId}
              onChange={(event) =>
                handleArtifactChange('rungId', event.target.value)
              }
            >
              <MenuItem value="">Select rung</MenuItem>
              {selectedLadder.rungs.map((rung) => (
                <MenuItem key={rung.rungId} value={rung.rungId}>
                  {rung.rungId}: {rung.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {artifactForm.evidenceType === EvidenceType.Note && (
            <>
              <TextField
                label="Content"
                multiline
                minRows={3}
                value={artifactForm.content}
                onChange={(event) => handleArtifactChange('content', event.target.value)}
              />
              <Button variant="contained" onClick={handleArtifactSave}>
                Save Note
              </Button>
            </>
          )}
          {artifactForm.evidenceType === EvidenceType.Photo && (
            <PhotoCapture onCapture={handlePhotoCapture} uploading={mediaUploading} />
          )}
          {artifactForm.evidenceType === EvidenceType.Audio && (
            <AudioRecorder onCapture={handleAudioCapture} uploading={mediaUploading} />
          )}
        </Stack>
      </SectionCard>
      <SectionCard title="Artifacts">
        <Stack spacing={2}>
          {todayArtifacts.length === 0 ? (
            <Typography color="text.secondary">
              No artifacts logged yet today.
            </Typography>
          ) : (
            <List dense>
              {todayArtifacts.map((artifact) => (
                <ListItem key={artifact.id ?? artifact.title} disableGutters>
                  <Stack spacing={1} sx={{ width: '100%' }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
                        <Typography variant="body2">
                          {artifact.title}
                        </Typography>
                        <Chip size="small" label={artifact.type} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {getArtifactLinkLabel(artifact)}
                      </Typography>
                    </Stack>
                    {artifact.type === EvidenceType.Photo && artifact.uri && (
                      <Box
                        component="img"
                        src={artifact.uri}
                        alt={artifact.title}
                        sx={{
                          width: '100%',
                          maxHeight: 180,
                          objectFit: 'contain',
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'divider',
                        }}
                      />
                    )}
                    {artifact.type === EvidenceType.Audio && artifact.uri && (
                      <Box component="audio" controls src={artifact.uri} sx={{ width: '100%' }} />
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleStartLinking(artifact)}
                      disabled={!artifact.id}
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      Link to rung
                    </Button>
                    {linkingArtifactId === artifact.id && (
                      <Stack spacing={1}>
                        <TextField
                          label="Ladder"
                          select
                          size="small"
                          value={linkingLadderId}
                          onChange={(event) =>
                            handleLinkingLadderChange(event.target.value)
                          }
                        >
                          <MenuItem value="">Select ladder</MenuItem>
                          {cardLadders.map((ladder) => (
                            <MenuItem key={ladder.ladderKey} value={ladder.ladderKey}>
                              {ladder.title}
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          label="Rung"
                          select
                          size="small"
                          disabled={!linkingLadder || linkingLadder.rungs.length === 0}
                          value={linkingRungId}
                          onChange={(event) =>
                            void handleLinkingRungChange(event.target.value)
                          }
                        >
                          <MenuItem value="">Select rung</MenuItem>
                          {linkingLadder?.rungs.map((rung) => (
                            <MenuItem key={rung.rungId} value={rung.rungId}>
                              {rung.rungId}: {rung.name}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Stack>
                    )}
                  </Stack>
                </ListItem>
              ))}
            </List>
          )}
        </Stack>
      </SectionCard>

      {/* --- Detailed Tracking (collapsed legacy sections) --- */}
      <Accordion defaultExpanded={(dayLog.checklist?.length ?? 0) === 0}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle1" color="text.secondary">
            Detailed Tracking (Routine, Ladders, Blocks)
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <RoutineSection
              key={`${selectedChildId}_${today}`}
              dayLog={dayLog}
              onUpdate={handleRoutineUpdate}
              onUpdateImmediate={handleRoutineUpdateImmediate}
              routineItems={activeRoutineItems}
              childName={selectedChild?.name}
            />

            {cardLadders.length > 0 && selectedChildId && (
              <LadderQuickLog
                familyId={familyId}
                childId={selectedChildId}
                ladders={cardLadders}
              />
            )}

            {/* DayLog Blocks */}
            <SectionCard title="Day Blocks">
              <Stack spacing={1}>
                {dayLog.blocks
                .map((block, originalIndex) => ({ block, originalIndex }))
                .filter(({ block }) =>
                  planType === PlanType.Mvd
                    ? block.type === DayBlockType.Reading || block.type === DayBlockType.Math
                    : true,
                )
                .filter((_entry, filteredIndex) =>
                  planType === PlanType.Normal ? showAllBlocks || filteredIndex < 4 : true,
                )
                .map(({ block, originalIndex: index }) => {
                  const meta = blockMeta[block.type]
                  const checklistDone = block.checklist?.filter((i) => i.completed).length ?? 0
                  const checklistTotal = block.checklist?.length ?? 0
                  const hasTime = block.actualMinutes != null || block.plannedMinutes != null
                  return (
                    <Accordion
                      key={`${block.type}-${index}`}
                      disableGutters
                      sx={{
                        '&::before': { display: 'none' },
                        borderLeft: `4px solid ${meta.color}`,
                        borderRadius: 1,
                      }}
                    >
                      <AccordionSummary
                        expandIcon={<ExpandMoreIcon />}
                        sx={{ px: 2, py: 0.5 }}
                      >
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%' }}>
                          <Avatar
                            sx={{
                              bgcolor: `${meta.color}20`,
                              color: meta.color,
                              width: 40,
                              height: 40,
                            }}
                          >
                            {meta.icon}
                          </Avatar>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
                            {meta.label}
                          </Typography>
                          {hasTime && (
                            <Chip
                              icon={<AccessTimeIcon />}
                              size="small"
                              label={
                                block.actualMinutes != null
                                  ? `${block.actualMinutes}m`
                                  : `${block.plannedMinutes ?? 0}m planned`
                              }
                              variant="outlined"
                              sx={{ borderColor: meta.color, color: meta.color }}
                            />
                          )}
                          {checklistTotal > 0 && (
                            <Chip
                              icon={<ChecklistIcon />}
                              size="small"
                              label={`${checklistDone}/${checklistTotal}`}
                              variant="outlined"
                              color={checklistDone === checklistTotal ? 'success' : 'default'}
                            />
                          )}
                        </Stack>
                      </AccordionSummary>
                      <AccordionDetails sx={{ px: 2, pb: 2 }}>
                        <Stack spacing={2}>
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                            <TextField
                              label="Subject bucket"
                              select
                              fullWidth
                              size="small"
                              value={block.subjectBucket ?? ''}
                              onChange={(event) =>
                                handleBlockFieldChange(
                                  index,
                                  'subjectBucket',
                                  event.target.value || undefined,
                                )
                              }
                            >
                              <MenuItem value="">Unassigned</MenuItem>
                              {Object.values(SubjectBucket).map((bucket) => (
                                <MenuItem key={bucket} value={bucket}>
                                  {bucket}
                                </MenuItem>
                              ))}
                            </TextField>
                            <TextField
                              label="Location"
                              select
                              fullWidth
                              size="small"
                              value={block.location ?? ''}
                              onChange={(event) =>
                                handleBlockFieldChange(
                                  index,
                                  'location',
                                  event.target.value || undefined,
                                )
                              }
                            >
                              <MenuItem value="">Unassigned</MenuItem>
                              {Object.values(LearningLocation).map((location) => (
                                <MenuItem key={location} value={location}>
                                  {location}
                                </MenuItem>
                              ))}
                            </TextField>
                          </Stack>
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                            <TextField
                              label="Planned minutes"
                              type="number"
                              size="small"
                              value={block.plannedMinutes ?? ''}
                              onChange={(event) =>
                                handleBlockFieldChange(
                                  index,
                                  'plannedMinutes',
                                  event.target.value === ''
                                    ? undefined
                                    : Number(event.target.value),
                                )
                              }
                            />
                            <TextField
                              label="Actual minutes"
                              type="number"
                              size="small"
                              value={block.actualMinutes ?? ''}
                              onChange={(event) =>
                                handleBlockFieldChange(
                                  index,
                                  'actualMinutes',
                                  event.target.value === ''
                                    ? undefined
                                    : Number(event.target.value),
                                )
                              }
                            />
                          </Stack>
                          <TextField
                            label="Quick note"
                            multiline
                            minRows={2}
                            size="small"
                            value={block.notes ?? ''}
                            onChange={(event) =>
                              handleBlockFieldChange(index, 'notes', event.target.value)
                            }
                          />
                          {block.checklist && block.checklist.length > 0 ? (
                            <Stack spacing={0.5}>
                              {block.checklist.map((item, itemIndex) => (
                                <Stack key={`${item.label}-${itemIndex}`} direction="row" spacing={0.5} alignItems="center">
                                  <FormControlLabel
                                    sx={{ flex: 1 }}
                                    control={
                                      <Checkbox
                                        checked={item.completed}
                                        size="small"
                                        onChange={() =>
                                          handleChecklistToggle(index, itemIndex)
                                        }
                                      />
                                    }
                                    label={
                                      <Typography variant="body2">{item.label}</Typography>
                                    }
                                  />
                                  <Button
                                    size="small"
                                    variant="text"
                                    color={item.lessonCardId ? 'primary' : 'inherit'}
                                    onClick={() => {
                                      setTeachHelperItem(item)
                                      setTeachHelperOpen(true)
                                    }}
                                    sx={{ fontSize: '0.7rem', minWidth: 'auto', px: 0.5, opacity: item.lessonCardId ? 1 : 0.6 }}
                                  >
                                    {item.lessonCardId ? 'Lesson' : 'Help'}
                                  </Button>
                                </Stack>
                              ))}
                            </Stack>
                          ) : (
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={block.actualMinutes != null && block.actualMinutes > 0}
                                  size="small"
                                  onChange={(_e, checked) => {
                                    const planned = block.plannedMinutes ?? 0
                                    handleBlockFieldChange(
                                      index,
                                      'actualMinutes',
                                      checked ? (planned > 0 ? planned : undefined) : undefined,
                                    )
                                  }}
                                />
                              }
                              label={
                                <Typography variant="body2" color="text.secondary">
                                  Mark complete ({block.plannedMinutes ?? 0}m)
                                </Typography>
                              }
                            />
                          )}
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  )
                })}
                {planType === PlanType.Normal && !showAllBlocks && dayLog.blocks.length > 4 && (
                  <Button
                    size="small"
                    onClick={() => setShowAllBlocks(true)}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    Show more ({dayLog.blocks.length - 4} more)
                  </Button>
                )}
                {planType === PlanType.Normal && showAllBlocks && dayLog.blocks.length > 4 && (
                  <Button
                    size="small"
                    onClick={() => setShowAllBlocks(false)}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    Show less
                  </Button>
                )}
              </Stack>
            </SectionCard>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {selectedChildId && (
        <TeachHelperDialog
          open={teachHelperOpen}
          onClose={() => { setTeachHelperOpen(false); setTeachHelperItem(null) }}
          familyId={familyId}
          childId={selectedChildId}
          childName={selectedChild?.name ?? ''}
          item={teachHelperItem}
          ladders={cardLadders}
        />
      )}

      <Snackbar
        open={snackMessage !== null}
        autoHideDuration={snackMessage?.text === 'Saved' ? 1500 : 4000}
        onClose={() => setSnackMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackMessage(null)}
          severity={snackMessage?.severity ?? 'success'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackMessage?.text}
        </Alert>
      </Snackbar>
    </Page>
  )
}
