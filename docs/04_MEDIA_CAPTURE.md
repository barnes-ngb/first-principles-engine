# Phase 4 — Media Capture (Photo/Audio) + Storage
Date: 2026-02-07

## Objective
Enable the evidence that matters most:
- Photo artifacts (builds, worksheets)
- Audio artifacts (narration/teach-back, speech practice)

## In-Scope Deliverables
- [x] Firebase Storage uploads + URL handling
- [x] Capture flows:
  - [x] Capture Photo → upload → create artifact
  - [x] Record Audio → upload → create artifact
- [x] Gallery + artifact detail view improvements

## Implementation Details

### Firebase Storage Upload (`src/core/firebase/upload.ts`)
- `uploadArtifactFile(familyId, artifactId, file, filename)` — uploads a Blob/File to
  `families/{familyId}/artifacts/{artifactId}/{filename}` with up to 3 retries
  (exponential backoff: 1s, 2s, 4s).
- `generateFilename(extension)` — creates a timestamp-based safe filename.
- Returns `{ downloadUrl, storagePath }`.

### PhotoCapture Component (`src/components/PhotoCapture.tsx`)
- Uses `<input type="file" accept="image/*" capture="environment">` for camera access on mobile.
- Shows preview before confirming upload.
- "Use Photo" / "Retake" flow with upload spinner.

### AudioRecorder Component (`src/components/AudioRecorder.tsx`)
- Uses `MediaRecorder` Web API for browser audio recording.
- Records to `audio/webm` format.
- Shows recording state with elapsed timer and pulsing indicator.
- "Use Recording" / "Discard" flow with upload spinner.
- Releases microphone when recording stops.

### TodayPage Integration
- Evidence type toggle: Note | Photo | Audio (ToggleButtonGroup).
- All artifact tag fields (child, stage, subject, location, domain, ladder) shared across types.
- Note: text content + save button (existing flow).
- Photo: PhotoCapture component → upload → artifact created with download URL.
- Audio: AudioRecorder component → upload → artifact created with download URL.
- Artifact list shows photo thumbnails and inline audio players.

### LabModePage Integration
- Same Note | Photo | Audio toggle after selecting an engine stage.
- Quick capture with media uploads, resets to stage selection after save.

### ArtifactCard Enhancements
- Renders photo thumbnail (`<img>`) when `type === Photo && uri` exists.
- Renders audio player (`<audio controls>`) when `type === Audio && uri` exists.
- Shows artifact content text for Notes.

## Acceptance Criteria
- [x] Audio can be recorded and appears in Engine counts the same week.
- [x] Photo uploads are reliable with retries.

## Files Changed
- `src/core/firebase/upload.ts` — NEW: upload utility with retries
- `src/core/firebase/upload.test.ts` — NEW: unit tests for generateFilename
- `src/components/PhotoCapture.tsx` — NEW: photo capture component
- `src/components/AudioRecorder.tsx` — NEW: audio recorder component
- `src/components/ArtifactCard.tsx` — UPDATED: photo/audio display
- `src/features/today/TodayPage.tsx` — UPDATED: evidence type toggle + media capture
- `src/features/week/LabModePage.tsx` — UPDATED: evidence type toggle + media capture
