import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const instrumentation = await import("./instrumentation-node");
    await instrumentation.register();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const instrumentation = await import("./instrumentation-node");
    await instrumentation.onRequestError(...args);
  }
};
