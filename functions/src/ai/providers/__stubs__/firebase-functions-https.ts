export const onCall = () => () => {}
export class HttpsError extends Error {
  constructor(code: string, message: string) {
    super(message)
  }
}
