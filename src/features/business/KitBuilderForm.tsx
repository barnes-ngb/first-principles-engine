import { useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import type { KitArtRef, KitDefender, KitInvader, KitRoster } from '../../core/types/business'
import { KitRosterStatus } from '../../core/types/business'
import { ART_QUOTA_MESSAGE } from './useArtQuota'
import { defenderArtKey, heroDescriptor, HERO_ART_KEY, invaderArtKey } from './kitArt'
import type { NewKitRoster } from './useKitRosters'

/** What the parent's generate handler needs about one character. */
export interface KitArtCharacter {
  name: string
  descriptor: string
}

/**
 * Generate art for one character: build the prompt, call the image function,
 * persist the ref. Returns the new ref, or `null` on failure (the caller shows
 * an honest error and keeps any existing art). Injected by `KitBuilderSection`.
 */
export type GenerateKitArt = (
  characterKey: string,
  character: KitArtCharacter,
) => Promise<KitArtRef | null>

let idCounter = 0
function newId(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`
}

/** Editable draft — the roster fields the form controls (no stamped metadata). */
interface RosterDraft {
  vaultName: string
  heroName: string
  heroLook: string
  heroMove: string
  defenders: KitDefender[]
  invaders: KitInvader[]
  winCondition: string
  status: KitRosterStatus
}

function draftFromRoster(roster?: KitRoster): RosterDraft {
  return {
    vaultName: roster?.vaultName ?? '',
    heroName: roster?.heroName ?? '',
    heroLook: roster?.heroLook ?? '',
    heroMove: roster?.heroMove ?? '',
    defenders: roster?.defenders ? roster.defenders.map((d) => ({ ...d })) : [],
    invaders: roster?.invaders ? roster.invaders.map((i) => ({ ...i })) : [],
    winCondition: roster?.winCondition ?? '',
    status: roster?.status ?? KitRosterStatus.InProgress,
  }
}

/**
 * Per-character art affordance (FEAT-88): a thumbnail once art exists, plus a
 * "Make sticker" / "Regenerate" button. The thumbnail renders for EVERYONE with
 * art; the generate button renders whenever `canGenerate` — which, since FEAT-94,
 * is true for kids too (making art on your own kit is kid effort, not money or
 * public exposure). Loading + honest-error are per-character (FEAT-61): the
 * spinner is scoped to this row, a failure shows an inline message, and existing
 * art is never lost on a failed retry.
 *
 * FEAT-92: the ~56px thumbnail is a button that opens a lightbox `Dialog` with
 * the full-size image + the character's name. Viewing is kid-safe (everyone with
 * art can tap it open); the Regenerate action inside the dialog rides the SAME
 * `canGenerate` gate as the inline button.
 */
function CharacterArtControl({
  characterKey,
  character,
  art,
  canGenerate,
  busy,
  error,
  onGenerate,
}: {
  characterKey: string
  character: KitArtCharacter
  art?: KitArtRef
  canGenerate: boolean
  busy: boolean
  error: string | null
  onGenerate: (characterKey: string, character: KitArtCharacter) => void
}) {
  const hasContent = character.name.trim() !== '' || character.descriptor.trim() !== ''
  const [zoomOpen, setZoomOpen] = useState(false)
  const displayName = character.name.trim() || 'Character'
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1 }}>
      {art?.url && (
        <Box
          component="button"
          type="button"
          onClick={() => setZoomOpen(true)}
          aria-label={`View ${displayName} sticker larger`}
          sx={{
            p: 0,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'action.hover',
            cursor: 'pointer',
            flexShrink: 0,
            lineHeight: 0,
            '&:hover': { borderColor: 'primary.main' },
          }}
        >
          <Box
            component="img"
            src={art.url}
            alt={`${character.name || 'character'} sticker`}
            sx={{ width: 56, height: 56, objectFit: 'contain', display: 'block' }}
          />
        </Box>
      )}
      {canGenerate && (
        <Box sx={{ minWidth: 0 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={busy ? <CircularProgress size={14} /> : <AutoAwesomeIcon fontSize="small" />}
            disabled={busy || !hasContent}
            onClick={() => onGenerate(characterKey, character)}
          >
            {busy ? 'Making…' : art?.url ? 'Regenerate' : 'Make sticker'}
          </Button>
          {error && (
            <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
              {error}
            </Typography>
          )}
        </Box>
      )}

      {/* Lightbox: full-size sticker + name. View is for everyone; Regenerate
          inside is gated on the SAME canGenerate flag as the inline button. */}
      {art?.url && (
        <Dialog open={zoomOpen} onClose={() => setZoomOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{displayName}</DialogTitle>
          <DialogContent>
            <Box
              component="img"
              src={art.url}
              alt={`${character.name || 'character'} sticker`}
              sx={{
                width: '100%',
                maxHeight: '70vh',
                objectFit: 'contain',
                borderRadius: 1,
                bgcolor: 'action.hover',
              }}
            />
            {canGenerate && error && (
              <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
                {error}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            {canGenerate && (
              <Button
                startIcon={
                  busy ? <CircularProgress size={14} /> : <AutoAwesomeIcon fontSize="small" />
                }
                disabled={busy || !hasContent}
                onClick={() => onGenerate(characterKey, character)}
              >
                {busy ? 'Making…' : 'Regenerate'}
              </Button>
            )}
            <Button variant="contained" onClick={() => setZoomOpen(false)}>
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Stack>
  )
}

export interface KitBuilderFormProps {
  /** Operator the roster belongs to (used when creating a new one). */
  childId: string
  /** When present, the form edits this roster; otherwise it creates a new one. */
  roster?: KitRoster
  /** Persist the roster body. Parent stamps source/timestamps via the hook. */
  onSave: (body: NewKitRoster, id?: string) => Promise<void>
  onCancel: () => void
  /**
   * Whether art generation is offered (FEAT-88). Each image is a paid, explicit
   * tap — never auto-generated. Falsy ⇒ no generate buttons render (a brand-new
   * unsaved roster has no persisted target, so the caller passes false until the
   * first save). Since FEAT-94 this is NOT a parent gate — kids generate too;
   * kid generation is metered by the caller via a light daily quota.
   */
  canGenerateArt?: boolean
  /** Generate + persist one character's sticker. Required for the art buttons. */
  onGenerateArt?: GenerateKitArt
  /**
   * The generator has hit today's light daily cap (FEAT-94). When true, the
   * generate buttons are swapped for a friendly, non-shaming nudge (charter: no
   * error styling, no shame) rather than blocked outright with an error. Only
   * ever true for a capped kid profile; a parent is uncapped.
   */
  capReached?: boolean
}

/**
 * Parent-entry form for a Kit Builder roster (FEAT-80 slice 1). A plain MUI
 * form — NOT the voice flow (that's slice 2). It proves the `KitRoster` data
 * model end-to-end and lets a parent type in the kid's existing story cast today.
 *
 * Invariants (design §2/§6):
 *   - Targets (4–6 defenders / 3–4 invaders) are a gentle hint, never a cap —
 *     the form accepts any count, including a kid's 7.
 *   - The kid's words are stored VERBATIM — no trim, no capitalization fix, no
 *     spell-correction on vault/hero/defender/invader text. Only entirely-empty
 *     repeatable rows are dropped (unused add-row artifacts), never content.
 *   - Partial saves are valid — a roster with empty lists persists and is
 *     resumable.
 */
export default function KitBuilderForm({
  childId,
  roster,
  onSave,
  onCancel,
  canGenerateArt = false,
  onGenerateArt,
  capReached = false,
}: KitBuilderFormProps) {
  const [draft, setDraft] = useState<RosterDraft>(() => draftFromRoster(roster))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Art pipeline (FEAT-88). Art lives on the persisted roster; the form mirrors
  // it locally so a freshly-generated thumbnail shows without a remount. Loading
  // + error are keyed by character so each row is independent (FEAT-61).
  const [art, setArt] = useState<Record<string, KitArtRef>>(() => roster?.art ?? {})
  const [generatingKey, setGeneratingKey] = useState<string | null>(null)
  const [artErrors, setArtErrors] = useState<Record<string, string>>({})
  const [confirmBatch, setConfirmBatch] = useState(false)

  // Generation is a paid, persisted-roster affordance offered to parents AND
  // kids (FEAT-94); thumbnails are shown to everyone with art.
  const canGenerate = canGenerateArt && Boolean(onGenerateArt)
  // The generate buttons only render when generation is possible AND today's cap
  // isn't reached; hitting the cap shows a friendly nudge instead (FEAT-94).
  const canGenerateNow = canGenerate && !capReached
  const showControl = (characterKey: string) => canGenerateNow || Boolean(art[characterKey]?.url)

  const set = <K extends keyof RosterDraft>(key: K, value: RosterDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  /** Enumerate the draft's characters (current on-screen values) with content. */
  const draftCharacters = (): Array<{ key: string; name: string; descriptor: string }> => {
    const out: Array<{ key: string; name: string; descriptor: string }> = []
    const hero = heroDescriptor(draft)
    if (draft.heroName.trim() !== '' || hero !== '')
      out.push({ key: HERO_ART_KEY, name: draft.heroName, descriptor: hero })
    for (const d of draft.defenders)
      if (d.name.trim() !== '' || d.power.trim() !== '')
        out.push({ key: defenderArtKey(d.id), name: d.name, descriptor: d.power })
    for (const inv of draft.invaders)
      if (inv.name.trim() !== '' || inv.menace.trim() !== '')
        out.push({ key: invaderArtKey(inv.id), name: inv.name, descriptor: inv.menace })
    return out
  }

  /** Generate one character's sticker. Persist is the parent's job; on success
   * we mirror the ref locally, on failure we show an honest per-row message and
   * keep any existing art. */
  const generateOne = async (characterKey: string, character: KitArtCharacter): Promise<boolean> => {
    if (!onGenerateArt || generatingKey) return false
    setGeneratingKey(characterKey)
    setArtErrors((prev) => {
      if (!(characterKey in prev)) return prev
      const next = { ...prev }
      delete next[characterKey]
      return next
    })
    try {
      const ref = await onGenerateArt(characterKey, character)
      if (!ref) {
        setArtErrors((prev) => ({ ...prev, [characterKey]: "Couldn't make that sticker — try again." }))
        return false
      }
      setArt((prev) => ({ ...prev, [characterKey]: ref }))
      return true
    } catch {
      setArtErrors((prev) => ({ ...prev, [characterKey]: "Couldn't make that sticker — try again." }))
      return false
    } finally {
      setGeneratingKey(null)
    }
  }

  /** Sequentially generate every remaining character (confirmed count first). */
  const generateAllRemaining = async () => {
    setConfirmBatch(false)
    for (const c of draftCharacters()) {
      if (art[c.key]?.url) continue
      // One paid call at a time — sequential so per-row state stays honest.
      const ok = await generateOne(c.key, { name: c.name, descriptor: c.descriptor })
      if (!ok) break // stop the batch on the first failure; nothing already made is lost
    }
  }

  const remainingCount = draftCharacters().filter((c) => !art[c.key]?.url).length

  const addDefender = () =>
    setDraft((prev) => ({
      ...prev,
      defenders: [...prev.defenders, { id: newId('def'), name: '', power: '' }],
    }))
  const updateDefender = (id: string, patch: Partial<KitDefender>) =>
    setDraft((prev) => ({
      ...prev,
      defenders: prev.defenders.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }))
  const removeDefender = (id: string) =>
    setDraft((prev) => ({ ...prev, defenders: prev.defenders.filter((d) => d.id !== id) }))

  const addInvader = () =>
    setDraft((prev) => ({
      ...prev,
      invaders: [...prev.invaders, { id: newId('inv'), name: '', menace: '' }],
    }))
  const updateInvader = (id: string, patch: Partial<KitInvader>) =>
    setDraft((prev) => ({
      ...prev,
      invaders: prev.invaders.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }))
  const removeInvader = (id: string) =>
    setDraft((prev) => ({ ...prev, invaders: prev.invaders.filter((i) => i.id !== id) }))

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      // Drop only ENTIRELY-empty rows (unused add-row artifacts). Never touch
      // the content of a row a kid partially filled — words are verbatim.
      const defenders = draft.defenders.filter((d) => d.name !== '' || d.power !== '')
      const invaders = draft.invaders.filter((i) => i.name !== '' || i.menace !== '')
      const body: NewKitRoster = {
        childId,
        vaultName: draft.vaultName,
        heroName: draft.heroName,
        heroLook: draft.heroLook,
        heroMove: draft.heroMove,
        defenders,
        invaders,
        winCondition: draft.winCondition,
        status: draft.status,
      }
      await onSave(body, roster?.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this kit.')
      setSaving(false)
    }
  }

  const defenderCount = draft.defenders.length
  const invaderCount = draft.invaders.length

  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        Type in a kit roster — the cast and rules a different family plays. Nothing is required; save a
        little now and fill the rest in later.
      </Typography>

      <TextField
        label="Vault name"
        value={draft.vaultName}
        onChange={(e) => set('vaultName', e.target.value)}
        placeholder="The safe place the seeds live"
        fullWidth
      />

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Hero
        </Typography>
        <Stack spacing={1.5}>
          <TextField
            label="Name"
            value={draft.heroName}
            onChange={(e) => set('heroName', e.target.value)}
            fullWidth
          />
          <TextField
            label="Look"
            value={draft.heroLook}
            onChange={(e) => set('heroLook', e.target.value)}
            placeholder="What does the hero look like?"
            fullWidth
          />
          <TextField
            label="Special move"
            value={draft.heroMove}
            onChange={(e) => set('heroMove', e.target.value)}
            fullWidth
          />
          {showControl(HERO_ART_KEY) && (
            <CharacterArtControl
              characterKey={HERO_ART_KEY}
              character={{ name: draft.heroName, descriptor: heroDescriptor(draft) }}
              art={art[HERO_ART_KEY]}
              canGenerate={canGenerateNow}
              busy={generatingKey === HERO_ART_KEY}
              error={artErrors[HERO_ART_KEY] ?? null}
              onGenerate={(k, c) => void generateOne(k, c)}
            />
          )}
        </Stack>
      </Box>

      <Box>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between">
          <Typography variant="subtitle2">Defenders</Typography>
          <Typography variant="caption" color="text.secondary">
            {defenderCount} · aim for 4–6
          </Typography>
        </Stack>
        {defenderCount === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            No defenders yet — add a plant defender and its power.
          </Typography>
        ) : (
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            {draft.defenders.map((d, i) => (
              <Box key={d.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Stack spacing={1} sx={{ flexGrow: 1, minWidth: 0 }}>
                    <TextField
                      label={`Defender ${i + 1} name`}
                      value={d.name}
                      onChange={(e) => updateDefender(d.id, { name: e.target.value })}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="Power"
                      value={d.power}
                      onChange={(e) => updateDefender(d.id, { power: e.target.value })}
                      placeholder="shoots sticky sap"
                      size="small"
                      fullWidth
                    />
                  </Stack>
                  <IconButton
                    aria-label="Remove defender"
                    size="small"
                    color="error"
                    onClick={() => removeDefender(d.id)}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
                {showControl(defenderArtKey(d.id)) && (
                  <CharacterArtControl
                    characterKey={defenderArtKey(d.id)}
                    character={{ name: d.name, descriptor: d.power }}
                    art={art[defenderArtKey(d.id)]}
                    canGenerate={canGenerateNow}
                    busy={generatingKey === defenderArtKey(d.id)}
                    error={artErrors[defenderArtKey(d.id)] ?? null}
                    onGenerate={(k, c) => void generateOne(k, c)}
                  />
                )}
              </Box>
            ))}
          </Stack>
        )}
        <Button startIcon={<AddIcon />} onClick={addDefender} sx={{ mt: 1 }}>
          Add a defender
        </Button>
      </Box>

      <Box>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between">
          <Typography variant="subtitle2">Invaders</Typography>
          <Typography variant="caption" color="text.secondary">
            {invaderCount} · aim for 3–4
          </Typography>
        </Stack>
        {invaderCount === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            No invaders yet — add a bad guy and what makes it scary.
          </Typography>
        ) : (
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            {draft.invaders.map((inv, i) => (
              <Box key={inv.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Stack spacing={1} sx={{ flexGrow: 1, minWidth: 0 }}>
                    <TextField
                      label={`Invader ${i + 1} name`}
                      value={inv.name}
                      onChange={(e) => updateInvader(inv.id, { name: e.target.value })}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="Menace"
                      value={inv.menace}
                      onChange={(e) => updateInvader(inv.id, { menace: e.target.value })}
                      placeholder="steals the seeds"
                      size="small"
                      fullWidth
                    />
                  </Stack>
                  <IconButton
                    aria-label="Remove invader"
                    size="small"
                    color="error"
                    onClick={() => removeInvader(inv.id)}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
                {showControl(invaderArtKey(inv.id)) && (
                  <CharacterArtControl
                    characterKey={invaderArtKey(inv.id)}
                    character={{ name: inv.name, descriptor: inv.menace }}
                    art={art[invaderArtKey(inv.id)]}
                    canGenerate={canGenerateNow}
                    busy={generatingKey === invaderArtKey(inv.id)}
                    error={artErrors[invaderArtKey(inv.id)] ?? null}
                    onGenerate={(k, c) => void generateOne(k, c)}
                  />
                )}
              </Box>
            ))}
          </Stack>
        )}
        <Button startIcon={<AddIcon />} onClick={addInvader} sx={{ mt: 1 }}>
          Add an invader
        </Button>
      </Box>

      <TextField
        label="Win condition"
        value={draft.winCondition}
        onChange={(e) => set('winCondition', e.target.value)}
        placeholder="How does a defender beat an invader?"
        multiline
        minRows={2}
        fullWidth
      />

      <TextField
        select
        label="Status"
        value={draft.status}
        onChange={(e) => set('status', e.target.value as KitRosterStatus)}
        sx={{ maxWidth: 220 }}
      >
        <MenuItem value={KitRosterStatus.InProgress}>In progress</MenuItem>
        <MenuItem value={KitRosterStatus.Complete}>Ready</MenuItem>
      </TextField>

      {canGenerateNow && remainingCount > 0 && (
        <Box>
          <Button
            variant="text"
            startIcon={<AutoAwesomeIcon fontSize="small" />}
            disabled={generatingKey !== null}
            onClick={() => setConfirmBatch(true)}
          >
            Make stickers for the rest ({remainingCount})
          </Button>
          <Typography variant="caption" color="text.secondary" display="block">
            Each sticker is a real image — we'll ask before making them.
          </Typography>
        </Box>
      )}

      {/* Daily cap reached (FEAT-94): a warm nudge, never an error. Only shows to
          someone who could otherwise generate (a capped kid), so a read-only
          viewer sees nothing extra. */}
      {canGenerate && capReached && (
        <Typography variant="body2" color="text.secondary">
          {ART_QUOTA_MESSAGE}
        </Typography>
      )}

      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}

      <Stack direction="row" spacing={1}>
        <Button variant="contained" size="large" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save kit'}
        </Button>
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </Stack>

      {/* Count-confirm before any batch generation — never auto-generate (FEAT-88). */}
      <Dialog open={confirmBatch} onClose={() => setConfirmBatch(false)}>
        <DialogTitle>Make {remainingCount} images?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This makes {remainingCount} sticker {remainingCount === 1 ? 'image' : 'images'} — one for
            each character that doesn't have one yet. Making images costs money, so we only do it when
            you tap Make.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmBatch(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void generateAllRemaining()}>
            Make {remainingCount}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
