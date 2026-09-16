import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { chat, state, addDoc } = vi.hoisted(() => ({
  chat: vi.fn(),
  addDoc: vi.fn<(...args: unknown[]) => Promise<{ id: string }>>(async () => ({ id: 'book-synthetic' })),
  state: { progressMap: new Map<string, unknown>() },
}))
vi.mock('../../../core/ai/useAI', () => ({
  useAI: () => ({ chat, loading: false, error: null, imageFailureRef: { current: null } }),
  TaskType: { GenerateStory: 'generateStory' },
}))
vi.mock('../../../core/auth/useAuth', () => ({ useFamilyId: () => 'family-synthetic' }))
vi.mock('../../../core/hooks/useActiveChild', () => ({
  useActiveChild: () => ({ activeChild: { id: 'child-synthetic', name: 'Lincoln' } }),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ state: null }) }))
vi.mock('../../../core/firebase/firestore', () => ({ booksCollection: () => ({ synthetic: true }) }))
vi.mock('firebase/firestore', () => ({
  addDoc, doc: vi.fn(() => ({})), getDoc: vi.fn(async () => ({ exists: () => false })), setDoc: vi.fn(async () => undefined),
}))
vi.mock('../useSightWordProgress', () => ({
  useSightWordProgress: () => ({ progressMap: state.progressMap, getWeakWords: () => [], loading: false }),
}))
vi.mock('../useBookArtQuota', () => ({
  useBookArtQuota: () => ({ atLimit: false, remaining: Infinity, recordGeneration: vi.fn() }),
}))

import CreateSightWordBook from '../CreateSightWordBook'
import { useBookGenerateChat } from '../useBookGenerateChat'
import { useStoryGenerator } from '../useStoryGenerator'
import { CHILD_BOOK_DEFAULTS } from '../sightWordMastery'

const opts = { familyId: 'family-synthetic', childId: 'child-synthetic', childName: 'Lincoln', childAge: 10, initialPageCount: 6, defaultIllustrationStyle: 'minecraft' }
const story = { title: 'A cat', pages: [{ pageNumber: 1, text: 'The cat sat.', sceneDescription: 'a cat' }] }
beforeEach(() => {
  vi.clearAllMocks()
  state.progressMap = new Map()
  chat.mockResolvedValue({ message: JSON.stringify(story) })
})
afterEach(cleanup)
function request() {
  expect(chat).toHaveBeenCalledTimes(1)
  const call = chat.mock.calls[0][0]
  expect(call).toMatchObject({ familyId: opts.familyId, childId: opts.childId, taskType: 'generateStory' })
  return JSON.parse(call.messages[0].content)
}
async function makeFromChat(idea: string, note?: string) {
  const view = renderHook(() => useBookGenerateChat(opts))
  if (note) act(() => { view.result.current.setCustomTheme(note); view.result.current.setLevelStretch(1) })
  await act(async () => { await view.result.current.sendKidMessage(idea) })
  await act(async () => { await view.result.current.confirmStartStory() })
  return view
}
describe('actual sight-word generation request flows', () => {
  it.each([
    ['typed idea', 'A cat meets a robot', 'A cat meets a robot'],
    ['default idea', '', CHILD_BOOK_DEFAULTS.lincoln.defaultTheme],
  ])('CreateSightWordBook preserves %s separately from its practice preset', async (_label, input, expectedIdea) => {
    render(<CreateSightWordBook />)
    fireEvent.change(screen.getByLabelText(/Sight words \(type or paste/), { target: { value: 'the, cat' } })
    if (input) fireEvent.change(screen.getByLabelText('Story idea'), { target: { value: input } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Make the story' })) })
    expect(request()).toMatchObject({ sightWords: ['the', 'cat'], storyIdea: expectedIdea, theme: 'sight_words' })
  })
  it('Generate chat sends the practice preset for the parent requested list and preserves the full idea', async () => {
    const idea = 'A robot story with the words: cat, sat, the'
    await makeFromChat(idea)
    expect(request()).toMatchObject({ storyIdea: idea, words: ['cat', 'sat', 'the'], theme: 'sight_words' })
  })
  it('ordinary Generate stories keep idea/style guidance when words are only background practice', async () => {
    state.progressMap.set('cat', { word: 'cat', masteryLevel: 'practicing', helpRequested: 0 })
    await makeFromChat('A robot finds a hat')
    expect(request()).toMatchObject({ storyIdea: 'A robot finds a hat', words: ['cat'], theme: 'minecraft' })
  })
  it('without practice words, the real classifier still selects the idea/style theme', async () => {
    await makeFromChat('A robot finds a hat')
    expect(request()).toMatchObject({ storyIdea: 'A robot finds a hat', words: [], theme: 'minecraft' })
  })
  it('an empty list at the legacy hook keeps its original theme request', async () => {
    const view = renderHook(() => useStoryGenerator())
    await act(async () => { await view.result.current.generateStory(opts.familyId, opts.childId, [], 'family', 6) })
    expect(request()).toEqual({ sightWords: [], theme: 'family', pageCount: 6 })
  })
  it('the parent feel note and stretch keep their existing request channels', async () => {
    await makeFromChat('A story with the words: cat, sat', '  gentle   and kind ')
    expect(request()).toMatchObject({ customTheme: 'gentle and kind', levelStretch: 1, words: ['cat', 'sat'] })
  })
  it('the stored book theme/style keeps the illustration choice while story words stay recorded', async () => {
    await makeFromChat('A story with the words: cat, sat')
    const doc = addDoc.mock.calls[0]?.[1] as { theme?: string; generationConfig?: { style?: string; words?: string[] } }
    expect(doc).toMatchObject({ theme: 'minecraft', generationConfig: { style: 'minecraft', words: ['cat', 'sat'] } })
  })
})
