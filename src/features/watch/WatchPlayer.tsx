import { useEffect, useRef, useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'

import { ErrorState, LoadingState } from '../../components/states'
import type { WatchVideo } from '../../core/types'
import type { YTPlayer } from './youtubeIframeApi'
import { useYouTubeIframeApi } from './youtubeIframeApi'
import { isEndedState, isForeignVideo, mapPlayerError, type WatchErrorMessage } from './watchPlayerState'
import {
  buildWatchEmbedUrl,
  currentOrigin,
  WATCH_IFRAME_ALLOW,
  WATCH_IFRAME_SANDBOX,
} from './watchEmbedUrl'
import {
  currentFullscreenElement,
  exitFullscreenIfActive,
  fullscreenSupported,
  requestFrameFullscreen,
} from './playerFullscreen'

/** Read the id of the video actually loaded, or `null` when it can't be read. */
function readLoadedVideoId(player: YTPlayer): string | null {
  try {
    return player.getVideoData?.()?.video_id ?? null
  } catch {
    // A destroyed or older player can throw — unknown, never treated as drift.
    return null
  }
}

interface WatchPlayerProps {
  video: WatchVideo
  /** Return to wherever the child came from — used for close and the error "Go back". */
  onDone: () => void
  /**
   * Completion action fired from the end-of-video panel only (never the error
   * path). When provided, the panel's button becomes the "complete" affordance
   * — the planned Today flow uses it to credit hours + leave an artifact (slice
   * 3). Omitted (the library practice case) → the panel just closes via `onDone`,
   * so unplanned watching writes nothing.
   */
  onComplete?: () => void
  /** Label for the end-of-video panel button (default "Done"). */
  doneLabel?: string
  /** Optional extra content rendered inside the completion panel (e.g. a "what we saw" note). */
  completionExtra?: ReactNode
}

/**
 * The child-safe Watch Vehicle player (slice 2). Deliberately bare: the video,
 * the parent-authored title (D4), and a single Done action. No search, related
 * videos, comments, channel links, or "up next".
 *
 * The heart of the vehicle is the **end-stop**: on `ENDED` the app calls
 * `stopVideo()`, drops an opaque overlay over the player so YouTube's end screen
 * can never become tappable, and shows a calm completion panel. It NEVER calls
 * `loadVideoById` — nothing unplanned ever loads (T2/C1).
 *
 * Writes nothing (no hours, artifact, concept state, or XP) — this slice is
 * practice/preview only (D3). Planned watching counts time in slice 3.
 */
export default function WatchPlayer({
  video,
  onDone,
  onComplete,
  doneLabel = 'Done',
  completionExtra,
}: WatchPlayerProps) {
  const { status, yt, error } = useYouTubeIframeApi()
  const containerRef = useRef<HTMLDivElement | null>(null)
  // The player FRAME wraps both the iframe host and the overlays. App-owned
  // fullscreen goes on THIS element so the completion overlay renders above the
  // video in fullscreen (YouTube's own fullscreen stays off — see PLAYER_VARS).
  const frameRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const [done, setDone] = useState(false)
  const [drifted, setDrifted] = useState(false)
  const [playError, setPlayError] = useState<WatchErrorMessage | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const canFullscreen = fullscreenSupported()

  // Keep local fullscreen state in sync with the browser (e.g. the child presses
  // Esc, or we exit programmatically on ENDED/Done). setState lives in the event
  // callback, not the effect body — no cascading render.
  useEffect(() => {
    const onChange = () => setIsFullscreen(currentFullscreenElement() === frameRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    const el = frameRef.current
    if (!el) return
    if (currentFullscreenElement() === el) exitFullscreenIfActive()
    else requestFrameFullscreen(el)
  }

  // The single forward action: leave fullscreen first so we never strand the
  // browser in fullscreen after the dialog closes, then hand control back.
  const handleDone = () => {
    exitFullscreenIfActive()
    onDone()
  }

  // End-of-video panel action. Prefers `onComplete` (the planned Today flow —
  // credit hours + artifact); falls back to `onDone` (library practice = close,
  // no writes). Never reached from the error path, so an errored video never
  // "completes".
  const handleComplete = () => {
    exitFullscreenIfActive()
    ;(onComplete ?? onDone)()
  }

  useEffect(() => {
    if (status !== 'ready' || !yt || !containerRef.current) return

    // (Per-video `done`/`playError` reset comes from the `key`-driven remount in
    // WatchPlayerDialog — no state reset in this effect, so no cascading render.)

    // Mount into a FRESH attached child, not the ref'd container directly: the
    // Player API tears down the node it drives on `destroy()`, so passing the
    // ref would leave `containerRef.current` detached. Under StrictMode's dev
    // setup→cleanup→setup replay the second setup would then mount into detached
    // DOM (a blank player). A per-setup host keeps the container stable and
    // always attached.
    //
    // FEAT-130: that host is now the **iframe itself**, built here rather than by
    // the Player API, because the API offers no way to set `sandbox` on an iframe
    // it creates — and `sandbox` is what removes the click-out to YouTube. We
    // hand the finished element to `yt.Player`, which attaches to it (the src
    // carries `enablejsapi=1`) instead of creating its own. Building it
    // imperatively rather than in JSX also keeps React out of the node's
    // lifecycle, so `destroy()` removing it can never race React's own cleanup.
    const container = containerRef.current
    const host = document.createElement('iframe')
    host.src = buildWatchEmbedUrl(video.youtubeId, currentOrigin())
    host.title = video.title
    host.setAttribute('sandbox', WATCH_IFRAME_SANDBOX)
    host.setAttribute('allow', WATCH_IFRAME_ALLOW)
    // No `allowfullscreen`: YouTube fullscreen would put the frame in the
    // browser's top layer, ABOVE our end-stop overlay, leaving the end screen
    // tappable. App-owned fullscreen on the wrapper covers the frame instead.
    host.setAttribute('frameborder', '0')
    host.style.width = '100%'
    host.style.height = '100%'
    host.style.border = '0'
    container.appendChild(host)

    const player = new yt.Player(host, {
      events: {
        onStateChange: (event) => {
          // ── THE DRIFT GUARD ───────────────────────────────────────────
          // Checked BEFORE the end-stop: if a suggestion tap swapped the video,
          // an ENDED here belongs to the wrong one and must not read "All done!".
          if (isForeignVideo(readLoadedVideoId(event.target), video.youtubeId)) {
            try {
              event.target.stopVideo()
            } catch {
              // A destroyed player can throw; the overlay still covers it.
            }
            exitFullscreenIfActive()
            setDrifted(true)
            return
          }

          if (!isEndedState(event.data)) return
          // ── THE END-STOP ──────────────────────────────────────────────
          // Stop the player and load NOTHING. The app takes control back.
          try {
            event.target.stopVideo()
          } catch {
            // A destroyed player can throw; the overlay still covers it.
          }
          // Leave app-owned fullscreen alongside the stop. (Even if we didn't,
          // the completion overlay lives inside the fullscreen frame, so it
          // still covers the video — belt and suspenders for the end-stop.)
          exitFullscreenIfActive()
          setDone(true)
        },
        onError: (event) => {
          setPlayError(mapPlayerError(event.data))
        },
      },
    })
    playerRef.current = player

    return () => {
      try {
        player.destroy()
      } catch {
        // Best-effort teardown.
      }
      // Remove the per-setup host (the API replaced it with the iframe, which
      // destroy() removes; this clears any residual node so the next setup
      // starts clean).
      host.remove()
      playerRef.current = null
    }
    // Re-create only when the API becomes ready or the video changes. (`title`
    // is the iframe's accessible name, so it belongs here too — in practice the
    // dialog already remounts per video, so this never re-fires mid-watch.)
  }, [status, yt, video.youtubeId, video.title])

  if (status === 'loading') {
    return <LoadingState label="Getting the video ready…" />
  }

  if (status === 'error') {
    // Named error, never a blank screen (the script-load failure path).
    return (
      <Stack spacing={1}>
        <ErrorState
          message="The video player couldn't load — tell a grown-up and try again."
          error={error ? new Error(error) : null}
          onRetry={onDone}
        />
      </Stack>
    )
  }

  return (
    <Stack spacing={1.5}>
      {/* Parent-authored kid-facing title (D4), never the raw YouTube title. */}
      <Typography variant="h6">{video.title}</Typography>
      {video.why && (
        <Typography variant="body2" color="text.secondary">
          {video.why}
        </Typography>
      )}

      <Box
        ref={frameRef}
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          bgcolor: 'black',
          borderRadius: 1,
          overflow: 'hidden',
          // When fullscreen, fill the screen and keep the video centered.
          '&:fullscreen': { borderRadius: 0 },
          '&:fullscreen .watch-video-host': {
            aspectRatio: '16 / 9',
            maxHeight: '100%',
            maxWidth: '100%',
          },
        }}
      >
        {/* The Player API replaces this node with the nocookie iframe. */}
        <Box
          ref={containerRef}
          className="watch-video-host"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />

        {/* App-owned fullscreen toggle. Lives INSIDE the frame so it stays
            usable in fullscreen (only the frame subtree is visible then).
            Hidden once done/errored — the overlay owns the frame. */}
        {canFullscreen && !done && !drifted && !playError && (
          <Button
            size="small"
            variant="contained"
            color="inherit"
            startIcon={isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            onClick={toggleFullscreen}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 2,
              bgcolor: 'rgba(0, 0, 0, 0.55)',
              color: 'common.white',
              '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.75)' },
            }}
          >
            {isFullscreen ? 'Make it small' : 'Make it big'}
          </Button>
        )}

        {/* End-stop overlay: OPAQUE + covers the whole player so the (already
            stopped) YouTube end screen can never be tapped. Because it lives
            inside the frame, it renders above the video in fullscreen too. */}
        {/* Drift overlay: a suggestion tap swapped the video inside the frame.
            Same opaque cover as the end-stop, no blame, one way forward. */}
        {drifted && !playError && (
          <Stack
            spacing={2}
            alignItems="center"
            justifyContent="center"
            sx={{ position: 'absolute', inset: 0, bgcolor: 'background.paper', p: 3, zIndex: 4 }}
          >
            <Typography variant="body1" textAlign="center">
              That&apos;s a different video — let&apos;s stick with the one we planned.
            </Typography>
            <Button variant="contained" onClick={handleDone}>
              Go back
            </Button>
          </Stack>
        )}

        {done && !drifted && !playError && (
          <Stack
            spacing={2}
            alignItems="center"
            data-testid="watch-completion-panel"
            sx={{
              position: 'absolute',
              inset: 0,
              bgcolor: 'background.paper',
              p: 3,
              zIndex: 3,
              // FEAT-132: the panel SCROLLS rather than clipping. The frame is a
              // fixed 16:9 box, so with `completionExtra` present (the planned-
              // Today "what we saw" note) the panel's content is taller than the
              // frame — on a real phone that clipped the heading off the top and
              // the action button off the bottom, leaving no way to finish.
              //
              // Scrolling, rather than moving the overlay out of the frame or
              // letting the frame grow: the end-stop's guarantee is that it is
              // opaque, covers the WHOLE frame, and sits above the video —
              // including in app-owned fullscreen, which only paints this frame's
              // subtree. Anything outside the frame would render *below*
              // YouTube's surface there. `inset: 0` + `overflow: auto` keeps the
              // cover total and makes the content reachable.
              overflowY: 'auto',
              // Content taller than the frame must start at the top: a plain
              // `center` would push the heading above the scroll origin, where it
              // can't be scrolled back into view — the exact clip we're fixing.
              // `safe center` degrades to flex-start on overflow; shorter content
              // still centers.
              justifyContent: 'safe center',
              // Flex children shrink by default; in a scrolling column that
              // squashes the heading and button instead of scrolling them.
              '& > *': { flexShrink: 0 },
            }}
          >
            <Typography variant="h5" component="p" textAlign="center">
              All done! 🌱
            </Typography>
            {completionExtra}
            <Button variant="contained" size="large" onClick={handleComplete}>
              {doneLabel}
            </Button>
          </Stack>
        )}

        {/* Unavailable / playback-error overlay: friendly kid message + a
            parent-visible detail (no silent failure). Also covers the player. */}
        {playError && (
          <Stack
            spacing={1.5}
            alignItems="center"
            justifyContent="center"
            sx={{ position: 'absolute', inset: 0, bgcolor: 'background.paper', p: 3, zIndex: 3 }}
          >
            <Typography variant="body1" textAlign="center">
              {playError.kid}
            </Typography>
            <Typography variant="caption" color="text.secondary" textAlign="center">
              {playError.detail}
            </Typography>
            <Button variant="contained" onClick={handleDone}>
              Go back
            </Button>
          </Stack>
        )}
      </Box>

      {/* Honest scope. The library practice case (no onComplete) counts nothing;
          the planned Today case (onComplete supplied) credits time on "Mark it
          done" — never show the "doesn't count" copy there (it would say the
          opposite of what the button does).

          FEAT-186: the kid caption lost fourteen words of bookkeeping ("to
          count your time and save what you saw"). What the tap records is a
          parent's concern; what the kid needs is when to tap. The practice-case
          copy is parent-facing (the library is a `RequireParent` route) and is
          left as it was. */}
      {onComplete ? (
        <Typography variant="caption" color="text.secondary">
          At the end, tap “Mark it done”.
        </Typography>
      ) : (
        <Typography variant="caption" color="text.secondary">
          Practice watching — this doesn&apos;t count hours. Planned watching (from your day) counts
          your time.
        </Typography>
      )}
    </Stack>
  )
}
