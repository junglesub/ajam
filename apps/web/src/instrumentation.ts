import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { createOperationLog } = await import("@timesheet/db/logging");
  createOperationLog("server", "startup").write("info", "initialized", {
    environment: process.env.NODE_ENV, buildVersion: process.env.BUILD_VERSION ?? "unknown", nodeVersion: process.version
  });
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { createOperationLog, safeErrorFields } = await import("@timesheet/db/logging");
  createOperationLog("http", "unhandled_error").write("error", "failed", {
    method: request.method, route: context.routePath, routeType: context.routeType, ...safeErrorFields(error)
  });
};
