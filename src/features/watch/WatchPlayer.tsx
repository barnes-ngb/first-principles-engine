import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { ErrorState, LoadingState } from '../../components/states'
import type { WatchVideo } from '../../core/types'
import type { YTPlayer } from './youtubeIframeApi'
import { useYouTubeIframeApi } from './youtubeIframeApi'
import { isEndedState, mapPlayerError, type WatchErrorMessage } from './watchPlayerState'

/**
 * Locked player params (design §4). Chrome-stripped and safety-first — no
 * autoplay, no cross-channel suggestions, no keyboard-less trap.
 */
const PLAYER_VARS = {
  autoplay: 0, // nothing plays until the kid presses play (T2)
  rel: 0, // limit related videos to the same channel (no cross-channel rabbit hole)
  modestbranding: 1, // strip YouTube branding
  iv_load_policy: 3, // no video annotations
  playsinline: 1, // play inline on iOS, never fullscreen-hijack
  disablekb: 0, // keyboard controls remain (accessibility)
  // fs=0 (design §4 showed fs=1). Fullscreen puts the iframe in the browser's
  // top layer, ABOVE our sibling end-stop overlay — so YouTube's end screen
  // would stay tappable at video end, defeating the C1 end-stop. C1 (the heart
  // of the ask) wins: no fullscreen button, and without allowfullscreen the
  // iframe's Fullscreen API is blocked too.
  fs: 0,
} as const

const NOCOOKIE_HOST = 'https://www.youtube-nocookie.com'

interface WatchPlayerProps {
  video: WatchVideo
  /** Return to wherever the child came from — the ONLY forward action. */
  onDone: () => void
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
export default function WatchPlayer({ video, onDone }: WatchPlayerProps) {
  const { status, yt, error } = useYouTubeIframeApi()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const [done, setDone] = useState(false)
  const [playError, setPlayError] = useState<WatchErrorMessage | null>(null)

  useEffect(() => {
    if (status !== 'ready' || !yt || !containerRef.current) return

    // (Per-video `done`/`playError` reset comes from the `key`-driven remount in
    // WatchPlayerDialog — no state reset in this effect, so no cascading render.)

    // Mount into a FRESH attached child, not the ref'd container directly: the
    // Player API *replaces* the node it's given with the iframe, so passing the
    // ref would leave `containerRef.current` detached after `destroy()`. Under
    // StrictMode's dev setup→cleanup→setup replay the second setup would then
    // mount into detached DOM (a blank player). A per-setup host keeps the
    // container stable and always attached.
    const container = containerRef.current
    const host = document.createElement('div')
    host.style.width = '100%'
    host.style.height = '100%'
    container.appendChild(host)

    const player = new yt.Player(host, {
      host: NOCOOKIE_HOST,
      videoId: video.youtubeId,
      width: '100%',
      height: '100%',
      playerVars: { ...PLAYER_VARS },
      events: {
        onStateChange: (event) => {
          if (!isEndedState(event.data)) return
          // ── THE END-STOP ──────────────────────────────────────────────
          // Stop the player and load NOTHING. The app takes control back.
          try {
            event.target.stopVideo()
          } catch {
            // A destroyed player can throw; the overlay still covers it.
          }
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
    // Re-create only when the API becomes ready or the video changes.
  }, [status, yt, video.youtubeId])

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
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          bgcolor: 'black',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        {/* The Player API replaces this node with the nocookie iframe. */}
        <Box
          ref={containerRef}
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />

        {/* End-stop overlay: OPAQUE + covers the whole player so the (already
            stopped) YouTube end screen can never be tapped. */}
        {done && !playError && (
          <Stack
            spacing={2}
            alignItems="center"
            justifyContent="center"
            sx={{ position: 'absolute', inset: 0, bgcolor: 'background.paper', p: 3 }}
          >
            <Typography variant="h5" component="p" textAlign="center">
              All done! 🌱
            </Typography>
            <Button variant="contained" size="large" onClick={onDone}>
              Done
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
            sx={{ position: 'absolute', inset: 0, bgcolor: 'background.paper', p: 3 }}
          >
            <Typography variant="body1" textAlign="center">
              {playError.kid}
            </Typography>
            <Typography variant="caption" color="text.secondary" textAlign="center">
              {playError.detail}
            </Typography>
            <Button variant="contained" onClick={onDone}>
              Go back
            </Button>
          </Stack>
        )}
      </Box>

      {/* Honest scope: this is practice; it does NOT count hours yet (D3). */}
      <Typography variant="caption" color="text.secondary">
        Practice watching — this doesn&apos;t count hours yet. Planned watching counts your time —
        that&apos;s coming next.
      </Typography>
    </Stack>
  )
}
