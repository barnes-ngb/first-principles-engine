import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

// ── Firebase + app-service mocks ────────────────────────────────
// The page is a thin shell; useShellyChatFlows fires Firestore listeners on
// mount. Stub them so the smoke test exercises composition + render only.
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async () => ({ id: 'new-thread' })),
  doc: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [] })),
  increment: vi.fn(() => 1),
  limit: vi.fn(() => ({})),
  onSnapshot: (_q: unknown, onNext: (snap: { docs: [] }) => void) => {
    onNext({ docs: [] })
    return () => {}
  },
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  updateDoc: vi.fn(async () => {}),
  where: vi.fn(() => ({})),
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn(async () => {}) })),
}))

vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(async () => 'https://example.com/x.jpg'),
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn(async () => {}),
}))

vi.mock('../../core/firebase/firestore', () => ({
  daysCollection: vi.fn(() => ({})),
  db: {},
  shellyChatMessagesCollection: vi.fn(() => ({})),
  shellyChatThreadsCollection: vi.fn(() => ({})),
}))

vi.mock('../../core/firebase/storage', () => ({ storage: {} }))

vi.mock('../../core/utils/compressImage', () => ({
  compressIfNeeded: vi.fn(async (f: unknown) => f),
}))

vi.mock('../../core/auth/useAuth', () => ({ useFamilyId: () => 'fam-1' }))

// Stable references — the real useActiveChild memoizes these; returning fresh
// arrays/objects each render would retrigger effects and loop.
const STABLE_CHILDREN: never[] = []
vi.mock('../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({ activeChildId: '', children: STABLE_CHILDREN }),
}))

vi.mock('../../core/ai/useAI', () => ({
  TaskType: { ShellyChat: 'shellyChat' },
  useAI: () => ({
    chat: vi.fn(async () => ({ message: 'hi' })),
    generateImage: vi.fn(async () => ({ url: '' })),
    lastErrorRef: { current: null },
  }),
}))

import ShellyChatPage from './ShellyChatPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <ShellyChatPage />
    </MemoryRouter>,
  )
}

describe('ShellyChatPage (shell smoke test)', () => {
  it('renders the general empty state with greeting and starter prompts', () => {
    renderPage()
    // Default context is "general" when there is no active child.
    expect(screen.getByText(/Hi Shelly/)).toBeInTheDocument()
    expect(screen.getByText('Weekly planning help')).toBeInTheDocument()
  })

  it('renders the context tabs and the composer controls', () => {
    renderPage()
    expect(screen.getByRole('tab', { name: 'Lincoln' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'London' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'General' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Ask Shelly's AI...")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
  })

  it('disables Send while the input is empty', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })
})
