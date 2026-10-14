export function getLogPollInterval(visible: boolean, modalOpen: boolean): 10000 | 30000 | null {
  if (!visible) return null;
  if (modalOpen) return 10000;
  return 30000;
}

export function shouldApplyLogResponse(
  current: { requestId: number; userId: string },
  incoming: { requestId: number; userId: string }
): boolean {
  if (incoming.userId !== current.userId) return false;
  return incoming.requestId >= current.requestId;
}
