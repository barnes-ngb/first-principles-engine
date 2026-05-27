# Voice Input Module — Design

**Status:** Design proposal, not yet built
**Author:** Design chat (Claude + Nathan), May 2026
**Driving need:** Lincoln's speech challenges make Web Speech API STT unreliable — pauses cause truncation, mistranscriptions are hard to correct.
**Builds on:** existing `useAudioRecorder` (`src/core/hooks/`), OpenAI SDK (already in `functions/`), `aiUsage` cost-tracking collection pattern.
**Out of scope:** the word-chip correction UX (separate Phase 2 if simple fix isn't enough), waveform visualization, multi-language support, offline fallback to local speech recognition.

---

## 1. What this is

A reusable voice-input module that **records audio in the browser and transcribes it via OpenAI Whisper on the server**, designed as a drop-in replacement for Web Speech API STT wherever the app needs voice input. Three layers:

1. **`useAudioRecording`** — small enhancement of the existing `useAudioRecorder` hook (raised duration cap, configurable per-call).
2. **`useTranscription`** — new hook that takes an audio Blob and returns a transcript via a new Firebase Function endpoint.
3. **`<VoiceInput>`** — drop-in React component combining the two, with configurable mode (toggle vs hold-to-talk), max duration, transcript preview, and a "Did I hear you right?" confirmation pattern.

A new Firebase Function `transcribeAudio` does the OpenAI Whisper call, costs ~$0.006 per minute of audio, and logs to the existing `aiUsage` collection.

Per-child config decides whether a profile uses the enhanced (Whisper-backed) module or falls back to the existing Web Speech path. Lincoln gets enhanced on by default; other profiles default off and opt in via Settings.

**The module also captures the raw data needed for future trouble-word tracking** (§12) — per-segment confidence scores from Whisper plus any kid edits to the transcript. Phase 1 stores this data but does not surface it; later phases use it to highlight words a child struggles with and feed them into practice.

---

## 2. Why this exists

**The Lincoln problem:** Web Speech API has aggressive endpoint detection (≈1-2s silence = end of utterance). Lincoln's natural cadence includes longer pauses for word-finding and breath. Result: STT truncates mid-sentence, the partial transcript is wrong, and editing it back to correctness is hard for a 10-year-old with speech and fine-motor challenges.

**Why Whisper specifically:** Whisper transcribes whole audio segments post-hoc rather than incrementally with endpoint detection. Pauses don't truncate. It's also more tolerant of atypical articulation than typical incremental STT. Trade-off: round-trip latency (~1-3 seconds after recording stops) instead of real-time interim transcripts. For Lincoln this trade-off is worth it; accuracy beats responsiveness.

**Why reusable:** the same problem will show up everywhere voice is taken — Story Guide questions, Workshop voice notes, Today's UnifiedCaptureCard, Quest fluency practice, the Generate Chat. Each currently rolls its own combination of `useAudioRecorder` + Web Speech API. A single module that any of these can drop in keeps the accessibility wins consistent and centralizes future improvements.

**Why not just replace Web Speech everywhere:** Whisper costs money per use; Web Speech is free. Short transcriptions ("yes", "no", "next") don't benefit much from Whisper's accuracy gains. The per-profile flag means cost is spent where it matters.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Component layer (drop-in UI)                                   │
│                                                                 │
│   <VoiceInput                                                   │
│     onTranscript={(text) => ...}                                │
│     mode="toggle" | "hold-to-talk"                              │
│     maxDurationSec={60}                                         │
│     placeholder="Tell me about your story"                      │
│     profile={childProfile}        ← decides Whisper vs Web Speech│
│     showConfirmation={true}       ← "Did I hear you right?"     │
│   />                                                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Hook layer (composable)                                        │
│                                                                 │
│   useAudioRecording(opts) — wraps useAudioRecorder w/ config    │
│     ↓ returns: { start, stop, blob, isRecording, error }        │
│                                                                 │
│   useTranscription() — wraps transcribeAudio callable           │
│     ↓ returns: { transcribe, isTranscribing, error }            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Server layer (Firebase Function)                               │
│                                                                 │
│   transcribeAudio (httpsCallable)                               │
│     input: { audioBase64, mimeType, familyId, durationMs }      │
│     ↓ OpenAI Whisper-1 API                                      │
│     ← returns: { transcript, durationSec, language, segments }  │
│                                                                 │
│   Logs to families/{familyId}/aiUsage on success                │
│   Rate-limited and auth-gated like generateImage                │
└─────────────────────────────────────────────────────────────────┘
```

### 3.1 Why this shape

**Component AND hooks both exposed.** Most callers want the drop-in `<VoiceInput>`. Some — like the Generate Chat dialog, which has its own composer layout — want to use the hooks directly and render their own UI. Both surfaces are first-class.

**Server-side Whisper, not client-side Whisper.cpp or browser ML.** Client-side ML would be larger bundle and slower on Lincoln's device. Server-side keeps the bundle thin, leverages OpenAI's reliability, and lets us swap to gpt-4o-transcribe later without client changes.

**Per-profile gate, not global toggle.** Lincoln needs it; London probably doesn't; Shelly definitely doesn't. A profile flag (`profile.voiceInputEnhanced: boolean`) is checked by `<VoiceInput>` and routes transparently to Whisper or Web Speech. The component's API doesn't change either way; callers don't need to know which engine ran.

---

## 4. Public API

### 4.1 `<VoiceInput>` component

```tsx
interface VoiceInputProps {
  /** Required. Called with the final transcript when the kid confirms. */
  onTranscript: (text: string) => void

  /** Optional. Called when the kid cancels (e.g. closes the recording). */
  onCancel?: () => void

  /** Optional. Called continuously during Web Speech path with interim text. */
  onInterim?: (text: string) => void

  /** Mode of capture. Default: 'toggle' (tap to start, tap to stop). */
  mode?: 'toggle' | 'hold-to-talk'

  /** Maximum recording duration in seconds. Default: 60. Capped at 120. */
  maxDurationSec?: number

  /** Profile of the user speaking. Determines engine selection. Required. */
  profile: ChildProfile

  /** Placeholder text when idle. */
  placeholder?: string

  /** Show "Did I hear you right?" confirmation banner before onTranscript fires. Default: true. */
  showConfirmation?: boolean

  /** Visual size variant. Default: 'medium'. */
  size?: 'small' | 'medium' | 'large'

  /** Disabled state (e.g. while parent component is processing). */
  disabled?: boolean
}
```

States the component renders:
- **Idle** — mic icon button + placeholder text. Tappable.
- **Recording** — pulsing mic, elapsed time counter, big "Stop" button. (For hold-to-talk: shown while pressed.)
- **Transcribing** — spinner + "Got it, let me hear what you said…" (Whisper path only; Web Speech finalizes synchronously).
- **Confirmation** — transcript displayed in editable text field + "Sounds right!" and "Try again" buttons + speaker icon to play TTS read-back. (Only when `showConfirmation` is true.)
- **Error** — friendly error message + retry button.

### 4.2 `useTranscription()` hook (for custom UIs)

```ts
interface UseTranscription {
  /** Transcribe an audio blob via Whisper. Returns null on failure. */
  transcribe: (blob: Blob, opts?: { profile?: ChildProfile }) => Promise<TranscriptResult | null>

  isTranscribing: boolean
  error: string | null
  lastTranscript: TranscriptResult | null
}

interface TranscriptResult {
  text: string
  durationSec: number
  language?: string   // e.g. 'en'; Whisper auto-detects
  // segments[].avg_logprob can later drive confidence highlighting; not in MVP UI
  segments?: Array<{ start: number; end: number; text: string; avg_logprob: number }>
}
```

The hook handles auth, retries on transient failures (one retry on network errors), and logs cost via the server.

### 4.3 `useAudioRecording(opts)` hook (extension of existing)

Lightly enhances the existing `useAudioRecorder` rather than replacing it:

```ts
interface UseAudioRecordingOpts {
  maxDurationMs?: number   // overrides the existing 10s default
  mimeTypePreference?: string[]
}
```

Existing callers (FluencyPractice, PlaytestView, VoiceRecordingStep, AdventurePlaytestView, UnifiedCaptureCard) keep working — they pass no opts and get the existing 10s cap behavior. `<VoiceInput>` passes `maxDurationMs: 60_000` (or whatever the prop says).

### 4.4 Server: `transcribeAudio` Firebase Function

```ts
// Request shape
interface TranscribeAudioRequest {
  audioBase64: string
  mimeType: string                // 'audio/webm', 'audio/mp4', etc.
  familyId: string
  childId?: string                // for aiUsage attribution
  durationMs: number              // client-measured; server-validated against actual
  language?: string               // optional hint; Whisper auto-detects otherwise
}

interface TranscribeAudioResponse {
  text: string
  durationSec: number
  language: string
  segments?: Array<{ start: number; end: number; text: string; avg_logprob: number }>
}
```

Behavior:
- Auth-gated identically to `generateImage` (reuses `authGuard`).
- Rate-limited per user: 30 transcriptions / hour (Whisper is cheap, but kids leaving mic on is a known risk).
- Audio size capped at 7MB raw (base64 inflates to ~9.3MB, under Firebase callable's 10MB request limit).
- Cost calculation: $0.006 × `durationSec / 60`, written to `families/{familyId}/aiUsage` with `taskType: 'transcribeAudio'`.
- **Also writes a parallel `transcriptionEvents` document** at `families/{familyId}/children/{childId}/transcriptionEvents/{eventId}` containing the full transcript text, segments with `avg_logprob`, language, duration, source surface (e.g. `'generate-chat'`), and the eventual `finalText` (set by the client when the kid confirms or edits in the confirmation banner). This is the substrate for §12's trouble-word tracking.
- On Whisper API failure: returns a structured error the client can show; doesn't log cost.

---

## 5. Per-profile configuration

### 5.1 ChildProfile field

Add to `ChildProfile`:

```ts
interface ChildProfile {
  // ... existing fields
  voiceInputEnhanced?: boolean       // defaults to false for new profiles
}
```

Backwards-compatible additive field. Existing profiles continue with the Web Speech path.

### 5.2 Default values

| Profile | Default |
|---|---|
| Lincoln | `true` (enhanced) |
| London | `false` (Web Speech) — fast and free; revisit if she has issues |
| Shelly | `false` (Web Speech) |
| New profiles | `false` |

Migration: a one-time script (or manual Firestore edit) sets Lincoln's flag to `true` when this lands.

### 5.3 Settings UI

Add to the Profile Settings page (find via grep, likely `src/features/settings/`): a toggle labeled **"Enhanced speech recognition (uses AI for better accuracy)"** with a description: *"Recommended for kids with speech challenges. Slightly slower but much more accurate. Uses small AI credits per use."*

Toggle persists to `profile.voiceInputEnhanced`. No app reload needed — `<VoiceInput>` reads the flag at render time.

### 5.4 Component behavior

`<VoiceInput>` checks `profile.voiceInputEnhanced` at render:
- `true` → routes through `useAudioRecording` + `useTranscription` (Whisper path)
- `false` → routes through existing `useSpeechRecognition` (Web Speech path)

The component's `onTranscript` callback fires the same way in both cases. Callers don't know which engine ran.

---

## 6. Cost & rate limits

### 6.1 Cost

Whisper-1: $0.006 per minute of audio.

Lincoln's expected use: ~10 transcriptions/day, average ~15s each = 2.5 minutes/day = **$0.015/day, $0.45/month**. Even if usage triples, under $1.50/month. Acceptable.

Family total cost ceiling (with all kids on enhanced): unlikely to exceed $5/month at reasonable use.

### 6.2 Rate limit

Per user (firebase auth uid): 30 transcriptions per rolling hour. This is well above expected use and prevents pathological cases (mic-stuck-on, kid holding the button accidentally, attack attempts).

### 6.3 Audio size cap

10 MB per request. WebM/Opus at typical bitrates: ~64 kbps = 8KB/sec. 60s = ~480KB. Cap is roughly 20× the expected size — generous.

### 6.4 Duration cap

Hard cap: 120 seconds per recording. Component's `maxDurationSec` prop is checked against this and clamped if exceeded.

---

## 7. Phased build

### Phase 1 — The module + Lincoln integration (PR 1)

**Server:**
- New `functions/src/ai/tasks/transcribeAudio.ts` — Whisper-backed Firebase callable, auth-gated, rate-limited, cost-logged.
- Tests covering: success path, auth rejection, rate-limit trigger, audio-too-large rejection, Whisper API error handling.

**Client:**
- `useAudioRecording(opts)` — small extension of existing hook to accept configurable duration cap and mime preference. Backward compatible.
- `useTranscription()` — new hook wrapping the callable.
- `<VoiceInput>` — drop-in component.
- Profile schema extended with `voiceInputEnhanced?: boolean`.
- Settings UI toggle for the flag.
- Migration: Lincoln's profile flag set to `true` (one-off Firestore write or migration script).

**Integration:**
- `BookGenerateChat`'s composer migrated to use `<VoiceInput>`. The mic button area in the composer is replaced; everything else stays.

**Tests:**
- `useAudioRecording` — start/stop, max-duration enforcement, blob return.
- `useTranscription` — mocked callable, transcript handling, retry on transient failure.
- `<VoiceInput>` — engine selection based on profile flag, confirmation flow, error display.

**Manual verification on Lincoln's profile:**
- Speak with natural pauses; transcript captures full utterance.
- Long utterances (30+ seconds) work without truncation.
- Confirmation banner shows transcript; tap "Sounds right!" sends to Generate Chat; tap "Try again" restarts.
- Speak unclear utterance; verify transcript accuracy is meaningfully better than what Web Speech would have produced.
- Check `aiUsage` collection logs the call with correct duration and cost.

### Phase 2 — Migration of other surfaces (separate PRs)

The five existing surfaces using `useAudioRecorder` directly:

| Surface | Current behavior | Migrate to `<VoiceInput>`? |
|---|---|---|
| `FluencyPractice.tsx` | Records audio for sight-word reading practice | Maybe — different use case (audio file stored, not transcribed inline). Could still benefit from transcription for tracking. Lower priority. |
| `PlaytestView.tsx` | Workshop voice notes | Yes — these are short narrative captures that transcription helps. |
| `VoiceRecordingStep.tsx` | Workshop voice recordings during game design | Yes for similar reasons. |
| `AdventurePlaytestView.tsx` | Workshop adventure playtest notes | Yes. |
| `UnifiedCaptureCard.tsx` | Today's voice capture | Yes — voice notes that benefit from transcription for searchability. |

Plus the `StoryGuidePage.tsx` wizard's voice input — currently using its own primitive Web Speech setup, not `useSpeechRecognition`. Worth migrating to `<VoiceInput>` for consistency.

Each migration is small (a few lines per file) and can land in its own PR. None of them block Phase 1.

### Phase 3 — Confidence-aware correction UX (deferred)

If the simple "Try again" flow in `<VoiceInput>` isn't enough for Lincoln, Phase 3 could add the word-chip editing UX I described earlier (tap a word to remove or re-record just that word). Whisper's per-segment confidence scores (`avg_logprob`) would drive visual highlighting of low-confidence words.

Deferred until we have data on whether Phase 1 alone is sufficient. Likely it is — Whisper's accuracy on Lincoln's speech is the bigger lever than any UI improvement.

---

## 8. Open decisions

1. **Whisper-1 vs gpt-4o-transcribe vs gpt-4o-mini-transcribe?** Whisper-1 ($0.006/min) is the proven baseline. gpt-4o-mini-transcribe is $0.003/min and may be slightly more accurate. gpt-4o-transcribe is $0.006/min with the strongest accuracy. Recommendation: start with **Whisper-1** because it's the established baseline; revisit after deploy.

2. **Confirmation banner default — always on, or off for short transcripts?** The "Did I hear you right?" confirmation is friction for confident transcripts. Recommendation: **always on for kids' profiles** (the assistance is the point); off for adult profiles. Configurable via prop.

3. **Settings toggle wording.** I drafted *"Enhanced speech recognition (uses AI for better accuracy)"* — could also be *"Use AI to better understand my child's speech"* or *"Premium voice input"*. Need a clear, non-stigmatizing label. Worth Shelly's eye.

4. **Profile flag location** — on `ChildProfile` (cleanest) vs in a separate settings doc (more isolated)? Recommendation: **on ChildProfile** — it's a small additive field, queried at every voice surface, having it on the profile avoids extra reads.

5. **Should Whisper transcripts be cached?** Same audio sent twice → return cached transcript? Could save cost but kids don't typically re-transcribe the same audio. Recommendation: **no caching in Phase 1**; revisit if abuse patterns emerge.

6. **Fallback when Whisper fails.** If the callable errors (network, OpenAI down, rate limit hit), what should happen? Options: (a) error message + retry button, (b) silent fallback to Web Speech, (c) error message + manual text input. Recommendation: **(a) with a "Type instead" link** that toggles to manual text input. Kids shouldn't be blocked from completing their turn just because Whisper is down.

7. **Audio retention.** Currently `useAudioRecorder` keeps the blob URL until cleared. For Whisper transcription, we want the blob discarded after transcription completes (privacy + memory). Recommendation: **clear blob after successful transcribe()**, retain only the transcript text.

---

## 9. What this isn't

- Not a replacement for `useSpeechRecognition` — that hook stays, the new module wraps both engines and chooses based on profile.
- Not a long-form recording tool (those existing surfaces stay on `useAudioRecorder` directly).
- Not a TTS system — that's `useTTS`, separate concern, untouched.
- Not multi-language — Whisper auto-detects but UI is English-only.
- Not real-time streaming transcription — Whisper transcribes post-hoc on complete audio. Real-time would need a different architecture.

---

## 10. Documentation expectations

When this lands:

- `docs/DOCUMENT_INDEX.md` — add a row for this design doc.
- `docs/MASTER_OUTLINE.md` — Phase 1 changelog entry when the PR merges.
- `docs/SYSTEM_PROMPTS.md` — add the new `transcribeAudio` task (server-side context).
- A new `docs/VOICE_INPUT_USAGE.md` — short developer guide showing how to drop `<VoiceInput>` into a new surface, plus the per-profile flag semantics. This is critical for the reusability promise; without it, future contributors will roll their own Web Speech calls instead.
- Inline JSDoc on `<VoiceInput>`, `useTranscription`, `useAudioRecording` with usage examples in the comment header.

---

## 11. Why phase the implementation this way

Phase 1 ships everything needed to verify the module works AND to verify it solves Lincoln's actual problem. If Whisper-on-Lincoln's-speech turns out to be insufficient (low likelihood but possible), Phase 2 migrations would be wasted work.

Phase 2 migrations are small and identical in shape; landing them one at a time keeps each PR reviewable and minimizes blast radius.

Phase 3 is conditional. The "Lincoln can't correct mistranscriptions" problem might largely evaporate once mistranscriptions become rare. Building word-chip editing UX speculatively is the kind of premature optimization the design doc lets us avoid.

---

## 12. Future capability — trouble-word tracking

A per-child map of words that voice input consistently has trouble with. Captured as a byproduct of the voice module's normal operation, surfaced later in three places:

1. **Shelly's view** — a Speech Progress panel showing the words Lincoln has had the most trouble with recently. Helps her see patterns (e.g. "polysyllabic 'L' words"), prioritize practice, talk to his SLP with data.
2. **Sight-word practice prioritization** — when a trouble word also appears in the sight-word list, bump it up the practice queue.
3. **AI resolution of ambiguous transcripts** — when Whisper returns a low-confidence segment AND that word appears in the trouble-word list, the AI can fill it in or ask "Did you mean [trouble word]?" instead of leaving the kid to correct it.

### 12.1 Signals captured in Phase 1 (no UX yet)

Each `transcriptionEvents` document (written by the server in §4.4) carries:

- **`transcriptText`** — what Whisper returned.
- **`segments[].avg_logprob`** — Whisper's per-segment confidence. Low values (< ~-0.5) suggest uncertainty about a word or phrase.
- **`finalText`** — what the kid (or Shelly) accepted in the confirmation banner. If `finalText !== transcriptText`, the diff tells us which words were wrong.
- **`replacesEventId`** *(optional, future)* — if this transcription replaced a previous one (kid tapped "Try again"), the prior event's ID. Lets us pair attempts and see what changed.
- **`sourceSurface`** — which UI generated the audio (e.g. `'generate-chat'`, `'today-capture'`). Useful for cross-surface analytics.

Phase 1 writes all of these but no other code reads them. The future trouble-word feature is purely an aggregation + UI layer on top.

### 12.2 What's not in Phase 1

- No aggregation logic (the "trouble word" computation itself).
- No Shelly UI for the speech progress panel.
- No AI resolution of low-confidence transcripts.
- No integration with sight-word practice.

All of that is a separate future PR, with its own design doc when the time comes. The point of capturing the data now is so we have months of real data to build against when we do.

### 12.3 Privacy

`transcriptionEvents` are stored per-family per-child. Same access rules as the rest of the child's data — only the family can read, only system-side aggregation processes can run over it. The audio itself is NOT stored; only the transcript and metadata. Audio blobs are discarded by the client after `transcribe()` completes (§8 decision 7).
