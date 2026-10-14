export type LogViewerRole = "ADMIN" | "USER";
export type LogViewerIdentity = { id: string; role: LogViewerRole };
export type ResolvedLogViewer = { role: LogViewerRole; userId: string };

export async function resolveLogViewer(
  session: { userId: string } | null,
  loadUser: (id: string) => Promise<LogViewerIdentity | null>
): Promise<ResolvedLogViewer | null> {
  if (!session?.userId) return null;
  const user = await loadUser(session.userId);
  if (!user) return null;
  return { userId: user.id, role: user.role === "ADMIN" ? "ADMIN" : "USER" };
}
