export const onCall = () => () => {}
export class HttpsError extends Error {
  constructor(_code: string, message: string) {
    super(message)
  }
}
