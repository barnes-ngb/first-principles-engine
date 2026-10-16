import { describe, expect, it } from 'vitest'

import { TaskType } from '../../core/ai/useAI'
import { PAGE_CHECK_TASK as CLIENT_TASK } from '../../core/hooks/useProspectivePageCheck'
import {
  PAGE_CHECK_TASK as SERVER_TASK,
  isPageCheckTask,
} from '../../../functions/src/ai/prospectiveCheck'

/**
 * The task boundary — the one name that spans the client and the server.
 *
 * The intent used to be a string in the message payload. That design failed two
 * independent checks: the dispatcher's workbook `activityConfigs` backfill runs
 * before any handler and never reads payloads, and — because hosting deploys
 * before functions — a new client meeting the previous dispatcher had its
 * "prospective" request served as an ordinary retrospective scan, silently.
 *
 * So the intent is now the TASK NAME, and the name is the whole contract:
 *
 *  - the client asks for it (`TaskType.PageCheck`);
 *  - the dispatcher excludes it from the backfill (`isPageCheckTask`);
 *  - the registry routes it to the prospective handler (asserted in
 *    `functions/src/ai/tasks/pageCheck.test.ts`);
 *  - an older dispatcher rejects it before writing anything, and the client says
 *    the check is unavailable (asserted in
 *    `functions/src/ai/chatProspectiveBypass.test.ts` and
 *    `src/core/hooks/useProspectivePageCheck.test.tsx`).
 *
 * Nothing in the type system connects those four. If the strings drift, the
 * server silently runs the retrospective path on a prospective request, and no
 * other test in either half would fail — which is what this file is for.
 */

describe('the client and the server agree on the task name, exactly', () => {
  it('all three declarations are the same string', () => {
    expect(TaskType.PageCheck).toBe('pageCheck')
    expect(CLIENT_TASK).toBe(TaskType.PageCheck)
    expect(SERVER_TASK).toBe(TaskType.PageCheck)
  })

  it('and it is NOT the scan task — that is the whole point', () => {
    expect(TaskType.PageCheck).not.toBe(TaskType.Scan)
    expect(isPageCheckTask(TaskType.Scan)).toBe(false)
  })

  it('the dispatcher predicate says yes to exactly one string', () => {
    expect(isPageCheckTask(SERVER_TASK)).toBe(true)
    for (const near of [
      'pagecheck',
      'PageCheck',
      ' pageCheck',
      'pageCheck ',
      'page-check',
      'scan',
      'plan',
      '',
      undefined,
      null,
      42,
      { taskType: 'pageCheck' },
    ]) {
      expect(isPageCheckTask(near)).toBe(false)
    }
  })

  it('and no payload can make it say yes', () => {
    // The old design's forged-flag case, now structurally impossible: the
    // predicate takes a task name and nothing else.
    expect(isPageCheckTask(JSON.stringify({ checkPurpose: 'before-work-page-check' }))).toBe(false)
  })
})
