import { useCallback, useEffect, useMemo, useState } from 'react'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CloseIcon from '@mui/icons-material/Close'
import PrintIcon from '@mui/icons-material/Print'
import SchoolIcon from '@mui/icons-material/School'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { addDoc, doc, getDoc, getDocs, query, where } from 'firebase/firestore'

import { useAI, TaskType } from '../../core/ai/useAI'
import { useGenerateActivity } from '../../core/ai/useAI'
import { lessonCardsCollection, skillSnapshotsCollection } from '../../core/firebase/firestore'
import type { ChecklistItem, LadderCardDefinition, LessonCard, SkillSnapshot } from '../../core/types'
import { fixUnicodeEscapes } from '../../core/utils/format'
import { openPrintWindow } from '../planner-chat/generateMaterials'

interface TeachHelperDialogProps {
  open: boolean
  onClose: () => void
  familyId: string
  childId: string
  childName: string
  item: ChecklistItem | null
  ladders: LadderCardDefinition[]
}

/**
 * "Help me teach this" dialog — provides a micro-lesson script
 * based on the plan item, skill snapshot, and ladder rung.
 * When a saved lesson card exists for this item, shows it instead
 * of the generic template.
 */
export default function TeachHelperDialog({
  open,
  onClose,
  familyId,
  childId,
  childName,
  item,
  ladders,
}: TeachHelperDialogProps) {
  const [snapshot, setSnapshot] = useState<SkillSnapshot | null>(null)
  const [lessonCard, setLessonCard] = useState<LessonCard | null>(null)
  const [loadedForKey, setLoadedForKey] = useState<string | null>(null)
  const { generate, loading: generating, error: generateError } = useGenerateActivity()
  const { chat: aiChat } = useAI()
  const [localError, setLocalError] = useState<string | null>(null)
  const [printingWorksheet, setPrintingWorksheet] = useState(false)

  // Derive a stable key for the current lesson card request
  const lessonCardKey = open && childId && item
    ? `${childId}:${item.id ?? ''}:${item.lessonCardId ?? ''}`
    : null

  // Derive loading state: we need to load when we have a key but haven't loaded for it yet
  const loadingCard = lessonCardKey !== null && loadedForKey !== lessonCardKey

  // Derive effective lesson card — null when dialog is closed or still loading
  const activeLessonCard = lessonCardKey !== null && !loadingCard ? lessonCard : null

  // Load skill snapshot
  useEffect(() => {
    if (!open || !childId) return
    const ref = doc(skillSnapshotsCollection(familyId), childId)
    void getDoc(ref).then((snap) => {
      if (snap.exists()) {
        setSnapshot({ ...snap.data(), id: snap.id })
      }
    })
  }, [open, familyId, childId])

  // Load matching lesson card
  useEffect(() => {
    if (!lessonCardKey || !childId || !item) return

    let cancelled = false

    // Strategy 0: direct lookup by lessonCardId (auto-generated on plan apply)
    if (item.lessonCardId) {
      const ref = doc(lessonCardsCollection(familyId), item.lessonCardId)
      getDoc(ref)
        .then((snap) => {
          if (cancelled) return
          if (snap.exists()) {
            setLessonCard({ ...(snap.data() as LessonCard), id: snap.id })
          } else {
            setLessonCard(null)
          }
          setLoadedForKey(lessonCardKey)
        })
      return () => { cancelled = true }
    }

    // Fallback: query-based matching
    const q = query(
      lessonCardsCollection(familyId),
      where('childId', '==', childId),
    )
    getDocs(q)
      .then((snap) => {
        if (cancelled) return
        const cards = snap.docs.map((d) => ({
          ...(d.data() as LessonCard),
          id: d.id,
        }))
        // Strategy 1: exact planItemId match
        const match =
          cards.find((c) => c.planItemId && item.id && c.planItemId === item.id) ||
          // Strategy 2: title keyword match as fallback
          cards.find((c) => {
            const keyword = c.title.toLowerCase().split(' ')[0]
            return keyword.length > 2 && item.label.toLowerCase().includes(keyword)
          })
        setLessonCard(match ?? null)
        setLoadedForKey(lessonCardKey)
      })

    return () => { cancelled = true }
  }, [lessonCardKey, familyId, childId, item])

  const ladderInfo = useMemo(() => {
    if (!item?.ladderRef) return null
    const ladder = ladders.find((l) => l.ladderKey === item.ladderRef!.ladderId)
    const rung = ladder?.rungs.find((r) => r.rungId === item.ladderRef!.rungId)
    return { ladder, rung }
  }, [item, ladders])

  const handleGenerateForItem = useCallback(async () => {
    if (!item || !childId) return
    setLocalError(null)

    try {
      const minutesFromLabel = (label: string): number => {
        const match = label.match(/\((\d+)m\)/)
        return match ? parseInt(match[1]) : 10
      }
      const minutes = item.estimatedMinutes ?? item.plannedMinutes ?? minutesFromLabel(item.label)

      console.log('TeachHelper: generating for', item.label, {
        familyId, childId,
        activityType: item.subjectBucket ?? 'general',
        skillTag: item.skillTags?.[0] ?? 'general',
        estimatedMinutes: minutes,
      })

      const result = await generate({
        familyId,
        childId,
        activityType: item.subjectBucket ?? 'general',
        skillTag: item.skillTags?.[0] ?? 'general',
        estimatedMinutes: minutes,
      })

      console.log('TeachHelper: generate result', result)

      if (!result?.activity) {
        setLocalError('AI returned empty response')
        return
      }

      const card: Omit<LessonCard, 'id'> = {
        childId,
        planItemId: item.id,
        title: result.activity.title,
        durationMinutes: minutes,
        objective: result.activity.objective,
        materials: result.activity.materials ?? [],
        steps: result.activity.steps ?? [],
        supports: [],
        evidenceChecks: result.activity.successCriteria ?? [],
        skillTags: item.skillTags ?? [],
        ladderRef: item.ladderRef,
        createdAt: new Date().toISOString(),
      }

      console.log('TeachHelper: saving lesson card', card)

      // Strip undefined values before saving (Firestore rejects them)
      const cleanCard = JSON.parse(JSON.stringify(card))
      const docRef = await addDoc(lessonCardsCollection(familyId), cleanCard)

      console.log('TeachHelper: saved as', docRef.id)
      setLessonCard({ ...card, id: docRef.id })
      setLoadedForKey(lessonCardKey)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('TeachHelper: generate failed:', msg, err)
      setLocalError(msg)
    }
  }, [item, childId, familyId, generate, lessonCardKey])

  const handlePrintWorksheet = useCallback(async () => {
    if (!item || !childId) return
    setPrintingWorksheet(true)

    try {
      const lessonContext = activeLessonCard
        ? `Lesson card: ${activeLessonCard.title}\nObjective: ${activeLessonCard.objective}\nSteps: ${activeLessonCard.steps.join('; ')}`
        : ''

      const prompt = `Generate a single Minecraft-themed printable worksheet for this activity:

Activity: ${item.label}
Child: ${childName} (age 10)
Subject: ${item.subjectBucket ?? 'Other'}
Duration: ${item.estimatedMinutes ?? item.plannedMinutes ?? 15} minutes
${item.skipGuidance ? `Skip guidance: ${item.skipGuidance}` : ''}
${lessonContext}
${snapshot?.prioritySkills?.length ? `Skill focus: ${snapshot.prioritySkills.map((s) => `${s.label} (${s.level})`).join(', ')}` : ''}

RULES:
1. Return ONLY valid HTML starting with <html>. No markdown, no backticks.
2. MINECRAFT THEMED — use Minecraft items, mobs, biomes in problems and scenarios.
3. Include REAL CONTENT: actual problems, actual words, actual questions.
4. ${item.subjectBucket === 'Math' ? 'Generate 6-8 math problems with work space. Include 2 guided examples at top.' : ''}
${item.subjectBucket === 'Reading' || item.subjectBucket === 'LanguageArts' ? 'Generate a word list (8-10 words), sound boxes, and 3-4 sentences using target words.' : ''}
5. Use this CSS for print-ready formatting:

<html><head><style>
  @page { margin: 0.5in; }
  body { font-family: Arial, sans-serif; max-width: 7.5in; margin: 0 auto; }
  .header { text-align: center; border-bottom: 3px solid #4a7c3f; padding-bottom: 12px; margin-bottom: 20px; background: linear-gradient(to right, #e8f5e9, #fff, #e8f5e9); padding: 12px; border-radius: 8px; }
  .header h1 { font-size: 22pt; margin: 0; color: #2e7d32; }
  .minecraft-box { border: 3px solid #4a7c3f; border-radius: 8px; padding: 16px; margin: 12px 0; background: #f9fbe7; }
  .problem { margin: 16px 0; padding: 12px; border: 1px solid #c8e6c9; border-radius: 6px; }
  .work-space { height: 80px; border: 1px dashed #aaa; margin: 8px 0; border-radius: 4px; }
  .word-box { display: inline-block; border: 2px solid #4a7c3f; padding: 10px 20px; margin: 6px; font-size: 20pt; min-width: 100px; text-align: center; border-radius: 4px; font-weight: bold; }
  .sound-box { display: inline-block; width: 50px; height: 50px; border: 2px solid #333; margin: 3px; text-align: center; line-height: 50px; font-size: 22pt; }
  .line { border-bottom: 1px solid #999; height: 35px; margin: 8px 0; }
  .example { background: #e8f5e9; padding: 12px; border-radius: 6px; border-left: 4px solid #4caf50; }
  .drawing-box { width: 100%; height: 200px; border: 2px dashed #aaa; border-radius: 8px; margin: 12px 0; }
</style></head><body>`

      const response = await aiChat({
        familyId,
        childId,
        taskType: TaskType.Chat,
        messages: [{ role: 'user', content: prompt }],
      })

      if (response?.message) {
        openPrintWindow(response.message, `${childName} - ${item.label}`)
      }
    } catch (err) {
      console.error('Worksheet generation failed:', err)
    } finally {
      setPrintingWorksheet(false)
    }
  }, [item, childId, childName, familyId, activeLessonCard, snapshot, aiChat])

  const supports = snapshot?.supports ?? []
  const stopRules = snapshot?.stopRules ?? []

  if (!item) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SchoolIcon color="primary" />
        Help Me Teach This
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {/* What we're teaching */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Plan Item
            </Typography>
            <Typography variant="h6">{item.label}</Typography>
            {item.skillTags && item.skillTags.length > 0 && (
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                {item.skillTags.map((tag) => (
                  <Chip key={tag} label={tag} size="small" variant="outlined" />
                ))}
              </Stack>
            )}
          </Box>

          {/* Ladder context */}
          {ladderInfo?.ladder && (
            <>
              <Divider />
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Ladder
                </Typography>
                <Typography>
                  {ladderInfo.ladder.title} — {ladderInfo.rung?.name ?? 'Unknown rung'}
                </Typography>
                {ladderInfo.rung && (
                  <Typography variant="body2" color="text.secondary">
                    Evidence: {fixUnicodeEscapes(ladderInfo.rung.evidenceText)}
                  </Typography>
                )}
              </Box>
            </>
          )}

          <Divider />

          {/* Lesson content: saved card or generic template */}
          {loadingCard ? (
            <Typography variant="body2" color="text.secondary">
              Loading lesson card…
            </Typography>
          ) : activeLessonCard ? (
            /* ── SPECIFIC lesson card from planning ── */
            <>
              <Box>
                <Typography variant="h6">{fixUnicodeEscapes(activeLessonCard.title)}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {fixUnicodeEscapes(activeLessonCard.objective)}
                </Typography>
              </Box>

              {activeLessonCard.materials.length > 0 && (
                <Box>
                  <Typography variant="subtitle2">Materials</Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {activeLessonCard.materials.map((m, i) => (
                      <Chip key={i} label={fixUnicodeEscapes(m)} size="small" variant="outlined" />
                    ))}
                  </Stack>
                </Box>
              )}

              <Box>
                <Typography variant="subtitle2" color="primary">Steps</Typography>
                <Stack spacing={1}>
                  {activeLessonCard.steps.map((step, i) => (
                    <Typography key={i} variant="body2">
                      {i + 1}. {fixUnicodeEscapes(step)}
                    </Typography>
                  ))}
                </Stack>
              </Box>

              {activeLessonCard.evidenceChecks.length > 0 && (
                <Box>
                  <Typography variant="subtitle2">Success Criteria</Typography>
                  <Stack spacing={0.5}>
                    {activeLessonCard.evidenceChecks.map((check, i) => (
                      <Typography key={i} variant="body2">• {fixUnicodeEscapes(check)}</Typography>
                    ))}
                  </Stack>
                </Box>
              )}
            </>
          ) : (
            /* ── GENERIC fallback template ── */
            <>
              <Box>
                <Typography variant="subtitle2" color="primary" gutterBottom>
                  Micro-Lesson (5–10 min)
                </Typography>
                <Stack spacing={1}>
                  <Typography variant="body2">
                    <strong>1. Warm up (1 min):</strong> Start with something {childName} already
                    knows. Pick 2 easy examples to build confidence.
                  </Typography>
                  <Typography variant="body2">
                    <strong>2. Teach (2–3 min):</strong> Introduce the concept from the plan item.
                    Model it once, then do one together.
                  </Typography>
                  <Typography variant="body2">
                    <strong>3. Practice (3–5 min):</strong> Let {childName} try 3–5 examples.
                    Watch for frustration cues.
                  </Typography>
                  <Typography variant="body2">
                    <strong>4. Check (1 min):</strong> Ask {childName} to explain what they did.
                    {ladderInfo?.rung && ` Look for: ${fixUnicodeEscapes(ladderInfo.rung.evidenceText)}`}
                  </Typography>
                </Stack>
              </Box>

              {/* Generate button */}
              <Button
                variant="outlined"
                size="small"
                startIcon={<AutoAwesomeIcon />}
                onClick={handleGenerateForItem}
                disabled={generating}
              >
                {generating ? 'Generating…' : 'Generate Specific Lesson'}
              </Button>

              {(generateError || localError) && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {localError || generateError?.message || 'Failed to generate lesson card'}
                </Alert>
              )}
            </>
          )}

          {/* Print Worksheet */}
          <Divider />
          <Button
            variant="outlined"
            size="small"
            startIcon={printingWorksheet ? <CircularProgress size={16} /> : <PrintIcon />}
            onClick={handlePrintWorksheet}
            disabled={printingWorksheet}
            fullWidth
          >
            {printingWorksheet ? 'Creating worksheet...' : 'Print Minecraft Worksheet'}
          </Button>

          {/* Supports */}
          {supports.length > 0 && (
            <>
              <Divider />
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Supports for {childName}
                </Typography>
                <Stack spacing={0.5}>
                  {supports.map((s, i) => (
                    <Typography key={i} variant="body2">
                      • <strong>{fixUnicodeEscapes(s.label)}:</strong> {fixUnicodeEscapes(s.description)}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            </>
          )}

          {/* Stop rules */}
          {stopRules.length > 0 && (
            <>
              <Divider />
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  When to Stop / Switch
                </Typography>
                <Stack spacing={0.5}>
                  {stopRules.map((rule, i) => (
                    <Alert key={i} severity="info" variant="outlined" sx={{ py: 0 }}>
                      <Typography variant="body2">
                        <strong>If:</strong> {fixUnicodeEscapes(rule.trigger)}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Then:</strong> {fixUnicodeEscapes(rule.action)}
                      </Typography>
                    </Alert>
                  ))}
                </Stack>
              </Box>
            </>
          )}

          {/* Common mistakes */}
          <Divider />
          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Common Mistakes &amp; What to Say
            </Typography>
            <Stack spacing={0.5}>
              <Typography variant="body2">
                • <strong>If stuck:</strong> &quot;Let&apos;s look at this together. What do you see first?&quot;
              </Typography>
              <Typography variant="body2">
                • <strong>If frustrated:</strong> &quot;It&apos;s okay to find this hard. Let&apos;s try an easier one and come back.&quot;
              </Typography>
              <Typography variant="body2">
                • <strong>If rushing:</strong> &quot;Slow down — show me how you got that answer.&quot;
              </Typography>
              <Typography variant="body2">
                • <strong>If correct:</strong> &quot;You did it! Can you explain how?&quot;
              </Typography>
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
