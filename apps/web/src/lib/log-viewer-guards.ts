// Small pure predicates behind the log popup's async guards. The modal stamps
// every list/detail request with the current viewer identity plus a generation
// counter; any response carrying an older stamp is discarded instead of
// filling the cache or starting a read action.
export type ViewerStamp = {
  generation: number;
  userId: string;
};

export function isStaleStamp(current: ViewerStamp, incoming: ViewerStamp): boolean {
  return incoming.userId !== current.userId || incoming.generation !== current.generation;
}

export function resolveTabForRole(canViewSite: boolean, tab: "mine" | "site"): "mine" | "site" {
  return canViewSite ? tab : "mine";
}
