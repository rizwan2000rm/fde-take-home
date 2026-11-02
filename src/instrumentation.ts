export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { initializeServerTelemetry } = await import("./lib/server-telemetry-init");
    initializeServerTelemetry();
  } catch {
    // Invalid telemetry configuration must not stop the application starting.
    console.warn("Backend telemetry could not start; shopping remains available.");
  }
}
