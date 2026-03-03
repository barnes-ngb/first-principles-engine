export const defineSecret = (name: string) => ({
  value: () => `stub-${name}`,
})
