import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ImageRetryCard from '../ImageRetryCard'
import {
  BLOCKED_TIPS,
  ImageGenerationFailure,
  imageFailureMessage,
} from '../imageGenerationFailure'

describe('ImageRetryCard — a refusal', () => {
  it('renders the three alternatives as taps, not as prose to retype', async () => {
    const user = userEvent.setup({ delay: null })
    const onUseAlternative = vi.fn()
    render(
      <ImageRetryCard
        failure={ImageGenerationFailure.Blocked}
        audience="parent"
        alternatives={['a red plumber', 'a mustached hero', 'a man in overalls']}
        onUseAlternative={onUseAlternative}
      />,
    )

    for (const text of ['a red plumber', 'a mustached hero', 'a man in overalls']) {
      expect(screen.getByRole('button', { name: text })).toBeInTheDocument()
    }

    await user.click(screen.getByRole('button', { name: 'a mustached hero' }))
    // Tapping one IS the retry — it re-runs the generation with those words.
    expect(onUseAlternative).toHaveBeenCalledTimes(1)
    expect(onUseAlternative).toHaveBeenCalledWith('a mustached hero')
  })

  it('says a tap costs a picture, before it is spent', () => {
    render(
      <ImageRetryCard
        failure={ImageGenerationFailure.Blocked}
        audience="parent"
        alternatives={['a red plumber']}
        onUseAlternative={vi.fn()}
      />,
    )
    expect(screen.getByText(/counts as one/i)).toBeInTheDocument()
  })

  it('falls back to the written tips when the suggester gave nothing', () => {
    render(
      <ImageRetryCard
        failure={ImageGenerationFailure.Blocked}
        audience="parent"
        alternatives={[]}
        onUseAlternative={vi.fn()}
      />,
    )
    // The Book Editor's two, lifted into the module. Advice, not prompts — so
    // shown as text, never as a tap that would paste "Try a different style"
    // into the description box.
    for (const tip of BLOCKED_TIPS.parent) {
      expect(screen.getByText(tip)).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: BLOCKED_TIPS.parent[0] })).toBeNull()
  })

  it('shows the tips rather than untappable alternatives when the host cannot re-run text', () => {
    // A door with no single prompt (Kit Builder, the Workshop batch) passes no
    // `onUseAlternative`. Rendering a suggestion it cannot act on would be the
    // dead end this run closes.
    render(
      <ImageRetryCard
        failure={ImageGenerationFailure.Blocked}
        audience="parent"
        alternatives={['a red plumber']}
      />,
    )
    expect(screen.queryByRole('button', { name: 'a red plumber' })).toBeNull()
    expect(screen.getByText(BLOCKED_TIPS.parent[0])).toBeInTheDocument()
  })
})

describe('ImageRetryCard — everything that is not a refusal', () => {
  it('offers no alternatives for a rate limit — no rewording fixes one', () => {
    render(
      <ImageRetryCard
        failure={ImageGenerationFailure.Busy}
        audience="parent"
        alternatives={['a red plumber', 'a mustached hero', 'a man in overalls']}
        onUseAlternative={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'a red plumber' })).toBeNull()
    expect(screen.queryByText(/try one of these/i)).toBeNull()
    expect(screen.queryByText(BLOCKED_TIPS.parent[0])).toBeNull()
    expect(screen.getByText(imageFailureMessage(ImageGenerationFailure.Busy, 'parent'))).toBeInTheDocument()
  })

  it('offers a plain retry when the host has one', async () => {
    const user = userEvent.setup({ delay: null })
    const onRetry = vi.fn()
    render(
      <ImageRetryCard
        failure={ImageGenerationFailure.NoImage}
        audience="parent"
        onRetry={onRetry}
        retryLabel="Make it fancy"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Make it fancy' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('names a not-configured failure as a grown-up thing, not the child’s doing', () => {
    render(
      <ImageRetryCard failure={ImageGenerationFailure.NotConfigured} audience="parent" />,
    )
    expect(screen.getByText(/grown-up thing to fix/i)).toBeInTheDocument()
  })
})

describe('ImageRetryCard — audience', () => {
  it('a kid reads the kid sentence, gated on capability and never on a name', () => {
    render(<ImageRetryCard failure={ImageGenerationFailure.Blocked} audience="kid" />)
    expect(
      screen.getByText(imageFailureMessage(ImageGenerationFailure.Blocked, 'kid')),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(imageFailureMessage(ImageGenerationFailure.Blocked, 'parent')),
    ).toBeNull()
  })
})

describe('ImageRetryCard — the free exits', () => {
  it('shows them next to the paid retry, and they are the host’s handlers', async () => {
    const user = userEvent.setup({ delay: null })
    const onDraw = vi.fn()
    render(
      <ImageRetryCard
        failure={ImageGenerationFailure.Blocked}
        audience="parent"
        exits={[{ label: 'Add a drawing', onClick: onDraw }]}
      />,
    )
    expect(screen.getByText(/these are free/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add a drawing' }))
    expect(onDraw).toHaveBeenCalledTimes(1)
  })

  it('renders nothing about exits on a surface that has none', () => {
    render(<ImageRetryCard failure={ImageGenerationFailure.Blocked} audience="parent" />)
    expect(screen.queryByText(/these are free/i)).toBeNull()
  })
})
