import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import HeroMissionCard, { type HeroMission } from '../HeroMissionCard'

function makeMission(overrides: Partial<HeroMission> = {}): HeroMission {
  return {
    icon: '⚡',
    title: "Today's Mission",
    text: 'Suit up your armor.',
    cta: 'Suit Up & Begin',
    action: vi.fn(),
    ...overrides,
  }
}

describe('HeroMissionCard', () => {
  it('renders the mission title, body, and CTA label', () => {
    const mission = makeMission()
    render(<HeroMissionCard mission={mission} isLincoln />)

    expect(screen.getByText("Today's Mission")).toBeInTheDocument()
    expect(screen.getByText('Suit up your armor.')).toBeInTheDocument()
    // CTA text gets a trailing arrow appended in the card
    expect(screen.getByRole('button', { name: /Suit Up & Begin/ })).toBeInTheDocument()
  })

  it('calls the mission action when CTA is tapped', () => {
    const action = vi.fn()
    const mission = makeMission({ action })
    render(<HeroMissionCard mission={mission} isLincoln />)

    fireEvent.click(screen.getByRole('button', { name: /Suit Up & Begin/ }))
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('renders different content for the conundrum mission state', () => {
    const mission = makeMission({
      icon: '🤔',
      text: 'The Bridge Repair — the village needs your wisdom.',
      cta: 'Join the Discussion',
    })
    render(<HeroMissionCard mission={mission} isLincoln />)

    expect(screen.getByText(/The Bridge Repair/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Join the Discussion/ })).toBeInTheDocument()
  })

  it('renders the ready-hero mission state with Start Your Day CTA', () => {
    const mission = makeMission({
      icon: '⚔️',
      title: 'Hero Ready',
      text: 'Your armor is on. The village is counting on you.',
      cta: 'Start Your Day',
    })
    render(<HeroMissionCard mission={mission} isLincoln />)

    expect(screen.getByText('Hero Ready')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start Your Day/ })).toBeInTheDocument()
  })

  it('renders for London (isLincoln=false) with the same data contract', () => {
    const mission = makeMission()
    render(<HeroMissionCard mission={mission} isLincoln={false} />)

    expect(screen.getByText("Today's Mission")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Suit Up & Begin/ })).toBeInTheDocument()
  })
})
