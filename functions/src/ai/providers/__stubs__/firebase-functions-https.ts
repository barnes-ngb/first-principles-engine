export const onCall = () => () => {}
export const onRequest = () => () => {}
export class HttpsError extends Error {
  constructor(_code: string, message: string) {
    super(message)
  }
}
