import type { Instrumentation } from "next";

export async function register() {
  const { createOperationLog } = await import("@timesheet/db/logging");
  try {
    const { initializeOperationalLogging } = await import("./server/operational-logging");
    await initializeOperationalLogging();
  } catch (error) {
    try {
      console.warn(JSON.stringify({ level: "warn", component: "server", operation: "log_bootstrap", result: "unavailable" }));
    } catch {
      // ignore
    }
    void error;
  }
  createOperationLog("server", "startup").write("info", "initialized", {
    environment: process.env.NODE_ENV, buildVersion: process.env.BUILD_VERSION ?? "unknown", nodeVersion: process.version
  });
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { createOperationLog, safeErrorFields } = await import("@timesheet/db/logging");
  createOperationLog("http", "unhandled_error").write("error", "failed", {
    method: request.method, route: context.routePath, routeType: context.routeType, ...safeErrorFields(error)
  });
};
