/**
 * Renders nothing. Runs `useBuildStudioAutoCredit` for one confirmed family and
 * child while it is mounted — the child's Build Studio page, or the parent's
 * Records card. See the hook for the lifecycle and for what this client workflow
 * does and does not promise: pending credit is processed only while one of those
 * views is open.
 *
 * Mount it keyed by family and child so a switch is a remount.
 */

import {
  useBuildStudioAutoCredit,
  type UseBuildStudioAutoCreditArgs,
} from './useBuildStudioAutoCredit'

export default function BuildStudioAutoCredit(props: UseBuildStudioAutoCreditArgs) {
  useBuildStudioAutoCredit(props)
  return null
}
