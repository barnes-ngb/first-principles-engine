/**
 * Client error observability (ARCH-11) — privacy-first, Firebase-native.
 *
 * Errors are captured from global handlers + React error boundaries, scrubbed of
 * all PII by `scrubError`, rate-limited / de-duplicated by `errorSink`, and
 * written to the family's own `errorLog` collection. No third-party service.
 */
export { scrubError, redactText, ErrorSource } from './scrubError'
export type {
  RawErrorInput,
  ScrubbedError,
  ScrubOptions,
} from './scrubError'
export { createErrorReporter } from './errorSink'
export type {
  ErrorRecord,
  ReporterContext,
  ReporterDeps,
  ReporterLimits,
} from './errorSink'
export { anonymizeId } from './anonymize'
export { APP_BUILD } from './buildInfo'
export {
  reportError,
  installGlobalErrorHandlers,
  setErrorReporterContext,
} from './reporter'
