# Voice Input — Developer Guide

**Status:** Phase 1 shipped (2026-05-27)
**Design doc:** [`DESIGN_VOICE_INPUT_MODULE.md`](./DESIGN_VOICE_INPUT_MODULE.md)
**Source:** `src/components/VoiceInput/`, `src/core/hooks/useAudioRecording.ts`, `src/core/hooks/useTranscription.ts`, `functions/src/ai/tasks/transcribeAudio.ts`

---

## TL;DR — drop it into a new surface

```tsx
import VoiceInput from '../../components/VoiceInput'
import { useActiveChild } from '../../core/hooks/useActiveChild'

const { activeChild } = useActiveChild()

<VoiceInput
  profile={activeChild}
  sourceSurface="my-feature"          // unique key for trouble-word attribution
  onTranscript={(text) => doStuff(text)}
/>
```

That's it. The component:

1. Routes to **Whisper (server)** when `profile.voiceInputEnhanced === true`,
   otherwise uses **Web Speech (browser)**.
2. Renders a mic button, recording state, transcribing spinner, and an
   editable **"Did I hear you right?"** confirmation banner.
3. On confirm, fires `onTranscript(text, { eventId })`.
4. On error, shows a **Type instead** fallback so the kid is never blocked.

---

## Per-profile flag

Each `Child` has an optional `voiceInputEnhanced?: boolean` field. Default
is `false` (Web Speech). Parents toggle this per-child from **Settings →
General → Voice Input**.

Lincoln defaults to `true` via a one-off migration:

```
npx tsx scripts/setLincolnVoiceInputEnhanced.ts
```

---

## Public API

### `<VoiceInput>`

| Prop              | Type                                       | Default      | Notes |
|-------------------|--------------------------------------------|--------------|-------|
| `onTranscript`    | `(text, meta?) => void`                    | required     | Fires after kid confirms. `meta.eventId` is the `transcriptionEvents` doc id. |
| `onCancel`        | `() => void`                               | undefined    | Fires when the kid cancels mid-recording. |
| `onInterim`       | `(text) => void`                           | undefined    | **Web Speech path only.** Continuous interim transcript. |
| `mode`            | `'toggle' \| 'hold-to-talk'`               | `'toggle'`   | Tap-to-start/tap-to-stop, or press-and-hold. |
| `maxDurationSec`  | `number`                                   | `60`         | Clamped to `120`. |
| `profile`         | `{ id: string; voiceInputEnhanced?: boolean }` | required | Routes engine selection. |
| `sourceSurface`   | `string`                                   | required     | Recorded with each transcription event. |
| `placeholder`     | `string`                                   | undefined    | Idle hint next to the mic. |
| `showConfirmation`| `boolean`                                  | `true`       | When `false`, fires `onTranscript` immediately after Whisper returns. |
| `size`            | `'small' \| 'medium' \| 'large'`           | `'medium'`   | Mic button size. |
| `disabled`        | `boolean`                                  | `false`      | Disable while the parent component is processing. |

### `useTranscription()` (for custom UIs)

If you don't want the default UI, the hook is also exported.

```ts
const { transcribe, isTranscribing, error, lastResult, updateFinalText }
  = useTranscription()

const result = await transcribe(blob, {
  sourceSurface: 'my-feature',
  childId: 'child-1',
  // optional:
  language: 'es',
  replacesEventId: priorEvent?.eventId,
})

if (result) {
  // result.text, result.eventId, result.durationSec, result.language, result.segments
}
```

Call `updateFinalText(eventId, finalText)` after the kid edits the transcript
so the server-side event reflects the corrected wording.

### `useAudioRecording(opts?)` (for custom recording UIs)

A thin enhancement of `useAudioRecorder` with configurable max duration.

```ts
const recorder = useAudioRecording({ maxDurationMs: 60_000 })
// recorder.startRecording(), recorder.stopRecording(), recorder.cancelRecording()
```

Existing call sites that use `useAudioRecorder()` keep the legacy 10s cap
without changes.

---

## Server contract

The `transcribeAudio` Firebase callable:

- Auth-gated identically to `generateImage` (`requireApprovedUser`).
- Rate-limited at **30 transcriptions / hour / uid**.
- Accepts base64 audio up to **7 MB raw** (well under Firebase's 10 MB request cap).
- Allowed mime types: `audio/webm`, `audio/webm;codecs=opus`, `audio/mp4`,
  `audio/wav`, `audio/mpeg`, `audio/m4a`.
- Calls OpenAI Whisper-1, `response_format: 'verbose_json'`.
- Writes two docs on success:
  - `families/{familyId}/aiUsage` — `taskType: 'transcribeAudio'`, with cost
    (`$0.006 × durationSec / 60`).
  - `families/{familyId}/children/{childId}/transcriptionEvents/{eventId}` —
    `transcriptText`, `finalText`, `segments[].avg_logprob`, `mimeType`,
    `sourceSurface`, `replacesEventId`. This is the substrate for the future
    **trouble-word tracking** (design doc §12).
- On failure, NO usage or event docs are written.

---

## Migration recipe — replacing `useSpeechRecognition`

Most existing voice surfaces wire up `useSpeechRecognition` and a manual
mic IconButton. To migrate:

1. Remove `useSpeechRecognition`, the mic IconButton, the interim/transcript
   bookkeeping, and any "Did I hear you right?" banner you built locally.
2. Drop `<VoiceInput profile={activeChild} sourceSurface="..." onTranscript={...} />`
   in the same place.
3. Pick a `sourceSurface` string unique to your screen — it shows up in
   the `transcriptionEvents` collection and lets future analytics segment
   by feature.
4. Verify the parent component still owns the "what to do with the text"
   logic — `<VoiceInput>` deliberately does NOT touch any TextField. If
   the surface still needs a typed input, render your own `<TextField>`
   alongside `<VoiceInput>`. The `BookGenerateChat` composer is the
   canonical example.

Phase 1 migrates **only `BookGenerateChat`**. The other five surfaces
(`FluencyPractice`, `PlaytestView`, `VoiceRecordingStep`,
`AdventurePlaytestView`, `UnifiedCaptureCard`) are Phase 2; each is a
separate PR.

---

## Cost ceiling

Whisper-1 is **$0.006 / minute** of audio. Expected family-wide use is
under $5/month even if every kid opts in. The server logs `cost` on every
successful call to `aiUsage`; `AIUsagePanel` surfaces it.

---

## Testing notes

- **Module tests** live next to the source:
  - `src/components/VoiceInput/__tests__/VoiceInput.test.tsx`
  - `src/core/hooks/useAudioRecording.test.ts`
  - `src/core/hooks/useTranscription.test.ts`
  - `functions/src/ai/tasks/transcribeAudio.test.ts`
- When testing a surface that mounts `<VoiceInput>`, you usually don't
  need to mock it — let it render and assert on the start-recording mic
  button. Mock the underlying hooks only if your surface test would
  otherwise drive the recording state machine.
- The server handler is exported as `transcribeAudioHandler(request, deps)`
  alongside the `onCall` wrapper so unit tests can inject a mock OpenAI
  client without touching the Firebase Functions runtime.
