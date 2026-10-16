import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Static wiring — and ONLY the parts a behavioural test cannot see.
 *
 * An earlier version of this file tried to prove the whole contract by reading
 * source: an AST scan for forbidden identifiers, an import-graph walk, and a
 * whole-repo census of `scans` consumers. Two of those claims were wrong in
 * kind, not degree:
 *
 *  - **"it imports no Firestore, so it cannot write"** is not a proof. The call
 *    it makes is a Cloud Function, and the server wrote `activityConfigs` for
 *    every child before the handler was even chosen (see
 *    `functions/src/ai/chatProspectiveBypass.test.ts`, which executes the real
 *    dispatcher). A client-side import graph says nothing about that.
 *  - the repo-wide census was brittle (it matched any file containing the
 *    string `/scans`) and it asserted a property of other people's modules.
 *
 * What is left here is the narrow, useful half: that the page really does
 * render the entry off the day rather than off the plan, that the capability
 * gate is in both places, that the selection token is threaded end to end, and
 * that the old write-capable door is no longer wired. The behaviour itself is
 * covered by `beforeWorkPageCheckFlow.test.tsx` and
 * `useBeforeWorkPageCheck.test.tsx`.
 */

const root = process.cwd()
const read = (relPath: string) => readFileSync(join(root, relPath), 'utf8')

const TODAY_PAGE = 'src/features/today/TodayPage.tsx'
const todaySource = read(TODAY_PAGE)
const todayAst = ts.createSourceFile(TODAY_PAGE, todaySource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

/** The JSX element with this tag name, and the conditions it renders under. */
function jsxWithGuards(tagName: string): { text: string; guards: string[] } {
  let found: { text: string; guards: string[] } | null = null
  function visit(node: ts.Node, guards: string[]) {
    let nextGuards = guards
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      nextGuards = [...guards, node.left.getText(todayAst)]
    }
    if (ts.isConditionalExpression(node)) {
      nextGuards = [...guards, node.condition.getText(todayAst)]
    }
    const tag = ts.isJsxSelfClosingElement(node)
      ? node.tagName.getText(todayAst)
      : ts.isJsxElement(node)
        ? node.openingElement.tagName.getText(todayAst)
        : null
    if (tag === tagName && !found) found = { text: node.getText(todayAst), guards: nextGuards }
    ts.forEachChild(node, (child) => visit(child, nextGuards))
  }
  visit(todayAst, [])
  if (!found) throw new Error(`Actual <${tagName}> not rendered by ${TODAY_PAGE}`)
  return found
}

describe('Today renders the check, off the day and not off the plan', () => {
  it('renders the entry card and the sheet', () => {
    expect(jsxWithGuards('BeforeWorkPageCheckCard')).toBeTruthy()
    expect(jsxWithGuards('BeforeWorkPageCheckDialog')).toBeTruthy()
  })

  it('the entry depends on no plan, no workbook and no skip guidance', () => {
    const text = jsxWithGuards('BeforeWorkPageCheckCard').guards.join(' && ')
    expect(text).toContain('selectedChild')
    for (const planCondition of ['checklist', 'skipGuidance', 'PlanType.Life', 'workbook', 'configs']) {
      expect(text).not.toContain(planCondition)
    }
  })

  it('the capability gate is on the entry AND in the controller call', () => {
    expect(jsxWithGuards('BeforeWorkPageCheckCard').text).toContain('canCheck={pageCheckCanCheck}')
    expect(todaySource).toMatch(/const pageCheckCanCheck = canEditLiveDay && !isKidProfile/)
    expect(todaySource).toMatch(/useBeforeWorkPageCheck\(\{[\s\S]*canCheck: pageCheckCanCheck/)
  })

  it('the sheet is opened under a SCOPE, not a boolean — and not the selection token', () => {
    // A boolean survives a child switch. The selection token would close the
    // sheet on every retry, since a retry retires the picker session.
    expect(todaySource).toContain('const pageCheckOpen = pageCheckOpenToken === pageCheck.scopeToken')
    expect(todaySource).toContain('setPageCheckOpenToken(pageCheck.scopeToken)')
    expect(todaySource).not.toContain('pageCheckOpenToken === pageCheck.selectionToken')
  })

  it('opening retires the previous picker session', () => {
    expect(todaySource).toContain('pageCheck.beginPickerSession()')
  })

  it('and closing goes through the controller, which retires it too', () => {
    expect(todaySource).toMatch(/setPageCheckOpenToken\(null\)[\s\S]{0,120}pageCheck\.close\(\)/)
  })

  it('the sheet is handed the selection token for its inputs', () => {
    expect(jsxWithGuards('BeforeWorkPageCheckDialog').text).toContain(
      'selectionToken={pageCheck.selectionToken}',
    )
  })

  it('and the picked file is handed back to the controller WITH that session', () => {
    expect(todaySource).toMatch(/\(file: File, token: string\)/)
    expect(todaySource).toContain('pageCheck.start(file, pageCheckContext ?? undefined, token)')
  })

  it('the planned row door is passed the safe handler, and the old pair is gone', () => {
    expect(todaySource).toContain('onBeforeWorkPageCheck={handleBeforeWorkPageCheck}')
    expect(todaySource).not.toContain('onPreCompletionScan={')
    expect(todaySource).not.toContain('onPreparePreCompletionScan={')
    expect(todaySource).not.toContain('handlePreCompletionScan')
    expect(todaySource).not.toContain('handlePreparePreCompletionScan')
    // The writes that door made are no longer reachable from this page at all.
    expect(todaySource).not.toContain('updateSkillMapFromFindings')
    expect(todaySource).not.toContain('prepareDayChecklistIdentitiesGuarded')
  })

  it('and the checklist row hands over the ROW, with no camera and no row identity', () => {
    const checklist = read('src/features/today/TodayChecklist.tsx')
    expect(checklist).toContain('onBeforeWorkPageCheck(item, index)')
    expect(checklist).not.toContain('onPreparePreCompletionScan?.()')
    expect(checklist).not.toContain('hasPersistentChecklistId')
  })
})

describe('the legacy retrospective record is untouched', () => {
  it('the retrospective writer still writes a purpose-less scan document', () => {
    const useScan = read('src/core/hooks/useScan.ts')
    expect(useScan).toContain('addDoc(scansCollection(familyId)')
    // No intent field was added to the legacy record, so an absent purpose still
    // means exactly what it meant before this run.
    expect(useScan).not.toContain('checkPurpose')
    expect(useScan).not.toMatch(/purpose:/)
  })

  it("and the scan-context loader's reading of `skip` is left exactly as it was", () => {
    // It reads pending scans and equates `skip` with mastery. Staying out of its
    // way — by persisting no prospective document — is the whole persistence
    // decision; rewriting it is not this run's business.
    const slices = read('functions/src/ai/contextSlices.ts')
    expect(slices).toContain("'skip' = child has mastered this content, advance past it")
    expect(slices).toContain('.limit(10)')
  })

  it('the client asks for its own task and sends no intent flag', () => {
    const runner = read('src/core/hooks/useProspectivePageCheck.ts')
    expect(runner).toContain('taskType: PAGE_CHECK_TASK')
    expect(runner).toContain('TaskType.PageCheck')
    // The payload is not an intent channel any more: no fallback to `scan`.
    // Matched on code shape, not prose — both files DISCUSS the old design.
    expect(runner).not.toMatch(/checkPurpose:\s/)
    expect(runner).not.toMatch(/taskType:\s*TaskType\.Scan/)
  })

  it('and the legacy scan handler has no prospective branch left', () => {
    const scan = read('functions/src/ai/tasks/scan.ts')
    expect(scan).not.toMatch(/parsed\.checkPurpose/)
    expect(scan).not.toMatch(/checkPurpose\?:/)
    expect(scan).toContain('export const handleScan')
    // The prospective prompt builder lives beside the retrospective one (so the
    // two can be read against each other) but is called only by the other task.
    expect(scan).toContain('buildProspectiveCheckPrompt')
    expect(read('functions/src/ai/tasks/pageCheck.ts')).toContain('buildProspectiveCheckPrompt')
  })

  it('the client modules of this door import no Firestore or Storage directly', () => {
    // NECESSARY, NOT SUFFICIENT — and deliberately not described as a proof of
    // "no writes". It only says this door does not grow a client-side write by
    // accident; what the server does with the request is asserted by executing
    // the real dispatcher in `functions/src/ai/chatProspectiveBypass.test.ts`.
    for (const file of [
      'src/features/today/beforeWorkPageCheck.ts',
      'src/features/today/useBeforeWorkPageCheck.ts',
      'src/features/today/BeforeWorkPageCheckCard.tsx',
      'src/features/today/BeforeWorkPageCheckDialog.tsx',
      'src/core/hooks/useProspectivePageCheck.ts',
    ]) {
      const source = read(file)
      expect(source, file).not.toMatch(/from ['"]firebase\/(firestore|storage)['"]/)
      expect(source, file).not.toMatch(/from ['"].*firebase\/firestore['"]/)
    }
  })
})
