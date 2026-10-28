function userEventsKey(userId: string) {
  return ['events', userId] as const
}

export const eventQueryKeys = {
  all: userEventsKey,
  range: (userId: string, from: string, to: string) => [...userEventsKey(userId), from, to] as const
}
