import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import BeforeWorkPageCheckCard from './BeforeWorkPageCheckCard'
import BeforeWorkPageCheckDialog from './BeforeWorkPageCheckDialog'
import {
  BEFORE_WORK_DISCLOSURE,
  BeforeWorkCheckStatus,
  BeforeWorkSuitability,
  inconclusiveBeforeWorkSummary,
  summarizeBeforeWorkCheck,
  type BeforeWorkCheckSummary,
} from './beforeWorkPageCheck'
import type { WorksheetScanResult } from '../../core/types'

/**
 * What a parent can see and tap. The point of several of these cases is the
 * ABSENCE of a control: the old door's answer carried *Add to plan*, *Skip this
 * lesson*, *Update position* and *Accept skip*, and each of those wrote a record
 * from a page the child had not done.
 */

const answer = (over: Partial<WorksheetScanResult> = {}): BeforeWorkCheckSummary =>
  summarizeBeforeWorkCheck({
    pageType: 'worksheet',
    subject: 'math',
    specificTopic: 'adding tens',
    skillsTargeted: [],
    estimatedDifficulty: 'appropriate',
    recommendation: 'do',
    recommendationReason: 'Sits beside the work he is on.',
    estimatedMinutes: 15,
    teacherNotes: 'Six problems at a time.',
    ...over,
  })

type DialogProps = Parameters<typeof BeforeWorkPageCheckDialog>[0]

function renderDialog(over: Partial<DialogProps> = {}) {
  const props: DialogProps = {
    open: true,
    childName: 'Lincoln',
    status: BeforeWorkCheckStatus.Idle,
    summary: null,
    photoPreviewUrl: null,
    itemLabel: null,
    cancelled: false,
    selectionToken: 'fam|lincoln|2026-10-16|parent|0',
    onPick: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
    onClose: vi.fn(),
    ...over,
  }
  render(<BeforeWorkPageCheckDialog {...props} />)
  return props
}

/** Every action a prospective answer may NOT offer. */
const FORBIDDEN_ACTIONS = [
  /add to plan/i,
  /add page/i,
  /^skip$/i,
  /skip this/i,
  /accept skip/i,
  /update position/i,
  /skip to next/i,
  /mark (complete|done)/i,
  /record/i,
  /mastered/i,
  /save/i,
]

function actionLabels(): string[] {
  return screen.getAllByRole('button').map((button) => button.textContent ?? '')
}

describe('the entry', () => {
  it('names the child from the header context and offers one tap', () => {
    const onOpen = vi.fn()
    render(<BeforeWorkPageCheckCard childName="Lincoln" canCheck onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /check this page for lincoln/i }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('promises only what is true: no learning or progress records change', () => {
    render(<BeforeWorkPageCheckCard childName="Lincoln" canCheck onOpen={vi.fn()} />)
    expect(screen.getByText(/no learning or progress records change/i)).toBeTruthy()
    expect(screen.queryByText(/nothing is recorded|nothing was recorded/i)).toBeNull()
  })

  it('is not there at all for a profile without parent capability', () => {
    render(<BeforeWorkPageCheckCard childName="Lincoln" canCheck={false} onOpen={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /check this page/i })).toBeNull()
  })

  it('offers no second child selector — the header already said who', () => {
    render(<BeforeWorkPageCheckCard childName="Lincoln" canCheck onOpen={vi.fn()} />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })
})

describe('before the photo is taken', () => {
  it('discloses, in three lines, where the photo goes and what is kept', () => {
    renderDialog()
    for (const line of BEFORE_WORK_DISCLOSURE) {
      expect(screen.getByText(line)).toBeTruthy()
    }
    expect(screen.getByText(/logged like any other AI call/i)).toBeTruthy()
  })

  it('and the disclosure is above the two buttons, not after them', () => {
    renderDialog()
    const list = screen.getByLabelText('What happens to the photo')
    const camera = screen.getByRole('button', { name: /take a photo/i })
    expect(list.compareDocumentPosition(camera) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('hands the picked file back WITH the identity the picker was opened under', () => {
    const props = renderDialog({ selectionToken: 'fam|lincoln|2026-10-16|parent|3' })
    fireEvent.click(screen.getByRole('button', { name: /upload a photo/i }))
    const input = screen.getByLabelText('Upload a photo of the page') as HTMLInputElement
    const file = new File(['x'], 'page.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(props.onPick).toHaveBeenCalledWith(file, 'fam|lincoln|2026-10-16|parent|3')
  })

  it('retires the input element when the identity changes', () => {
    const { rerender } = render(
      <BeforeWorkPageCheckDialog
        open
        childName="Lincoln"
        status={BeforeWorkCheckStatus.Idle}
        summary={null}
        photoPreviewUrl={null}
        itemLabel={null}
        cancelled={false}
        selectionToken="fam|lincoln|2026-10-16|parent|0"
        onPick={vi.fn()}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const before = screen.getByLabelText('Upload a photo of the page')
    rerender(
      <BeforeWorkPageCheckDialog
        open
        childName="London"
        status={BeforeWorkCheckStatus.Idle}
        summary={null}
        photoPreviewUrl={null}
        itemLabel={null}
        cancelled={false}
        selectionToken="fam|london|2026-10-16|parent|1"
        onPick={vi.fn()}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    // A new element, so the old one — which a native picker may still be
    // sitting on top of — is detached and its change event reaches nothing.
    expect(screen.getByLabelText('Upload a photo of the page')).not.toBe(before)
  })

  it('says what a cancel did, once one has been taken', () => {
    renderDialog({ cancelled: true })
    expect(screen.getByText(/can’t be called back/i)).toBeTruthy()
    expect(screen.getByText(/still shows in the AI usage log/i)).toBeTruthy()
  })
})

describe('while it runs', () => {
  it('offers Stop, and Stop claims nothing it cannot do', () => {
    const props = renderDialog({ status: BeforeWorkCheckStatus.Running })
    expect(screen.getByRole('status')).toHaveTextContent(/looking at the page/i)
    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }))
    expect(props.onCancel).toHaveBeenCalledOnce()
    expect(screen.getByText(/can’t be called back/i)).toBeTruthy()
  })
})

describe('the answer', () => {
  it('shows the photo, the subject and topic, the verdict, the reason and the adaptation', () => {
    renderDialog({
      status: BeforeWorkCheckStatus.Answered,
      summary: answer(),
      photoPreviewUrl: 'blob:preview',
    })
    expect(screen.getByAltText(/page you asked about/i)).toBeTruthy()
    expect(screen.getByText('math — adding tens')).toBeTruthy()
    expect(screen.getByText('Looks about right for today')).toBeTruthy()
    expect(screen.getByText('Sits beside the work he is on.')).toBeTruthy()
    expect(screen.getByText('Six problems at a time.')).toBeTruthy()
  })

  it('always says it is a guess, not a measure of the child, and that no record moves', () => {
    renderDialog({ status: BeforeWorkCheckStatus.Answered, summary: answer() })
    expect(screen.getByText(/guess from one photo/i)).toBeTruthy()
    expect(screen.getByText(/not a measure of what he knows/i)).toBeTruthy()
    expect(screen.getByText(/No learning or progress records change/i)).toBeTruthy()
  })

  it("shows the model's own 'what I couldn't tell' when it gave one", () => {
    renderDialog({
      status: BeforeWorkCheckStatus.Answered,
      summary: { ...answer(), limits: 'The bottom of the page is cut off.' },
    })
    expect(screen.getByText(/couldn’t tell from this photo: The bottom of the page is cut off\./i)).toBeTruthy()
  })

  it('offers ONLY close and retry', () => {
    const props = renderDialog({ status: BeforeWorkCheckStatus.Answered, summary: answer() })
    for (const forbidden of FORBIDDEN_ACTIONS) {
      expect(actionLabels().filter((label) => forbidden.test(label))).toEqual([])
    }
    fireEvent.click(screen.getByRole('button', { name: /check another page/i }))
    expect(props.onRetry).toHaveBeenCalledOnce()
    // The footer's Close and the header's icon have DISTINCT accessible names,
    // so neither a screen reader nor this query is ambiguous.
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }))
    expect(props.onClose).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: /close the page check/i })).toBeTruthy()
  })

  it('an inconclusive answer says so, and still offers only those two', () => {
    renderDialog({
      status: BeforeWorkCheckStatus.Answered,
      summary: inconclusiveBeforeWorkSummary(
        'The answer came back in a form the app couldn’t read. No learning or progress records change — try that page again.',
      ),
    })
    expect(screen.getByText("Can't tell from this photo")).toBeTruthy()
    // Twice, deliberately: once in the failure sentence and once in the
    // uncertainty line that sits under EVERY answer. `getAllByText`, because
    // asserting a single match here was asserting the wrong thing.
    expect(screen.getAllByText(/no learning or progress records change/i).length).toBeGreaterThanOrEqual(2)
    for (const forbidden of FORBIDDEN_ACTIONS) {
      expect(actionLabels().filter((label) => forbidden.test(label))).toEqual([])
    }
  })

  it('a page that looks easy says so, and never that he has mastered it', () => {
    renderDialog({
      status: BeforeWorkCheckStatus.Answered,
      summary: answer({ recommendation: 'skip', estimatedDifficulty: 'easy' }),
    })
    expect(screen.getByText('Looks easy for today')).toBeTruthy()
    expect(screen.queryByText(/master/i)).toBeNull()
    expect(screen.queryByText(/advance/i)).toBeNull()
  })

  it('names the row it was opened from, when it was opened from one', () => {
    renderDialog({
      status: BeforeWorkCheckStatus.Answered,
      summary: answer(),
      itemLabel: 'GATB Math',
    })
    expect(screen.getByText(/opened from: GATB Math/i)).toBeTruthy()
  })

  it('and the stretch case is advice about today, not a verdict', () => {
    renderDialog({
      status: BeforeWorkCheckStatus.Answered,
      summary: answer({ estimatedDifficulty: 'too-hard' }),
    })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Looks like a stretch today')).toBeTruthy()
    expect(answer({ estimatedDifficulty: 'too-hard' }).suitability).toBe(
      BeforeWorkSuitability.Stretch,
    )
  })
})
