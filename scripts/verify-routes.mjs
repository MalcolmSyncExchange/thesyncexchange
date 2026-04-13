#!/usr/bin/env node

import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const useExistingServer = process.env.ROUTE_VERIFY_USE_EXISTING === "true";
const verifyPort = Number(process.env.ROUTE_VERIFY_PORT || 3100);
const baseUrl = process.env.ROUTE_VERIFY_BASE_URL || `http://127.0.0.1:${verifyPort}`;
const routeChecks = [
  { path: "/", expectedStatuses: [200], bodyIncludes: ["Music licensing built for speed, trust, and clean execution.", "Get Started"] },
  { path: "/login", expectedStatuses: [200], bodyIncludes: ["Welcome back", "Log in"] },
  { path: "/signup", expectedStatuses: [200], bodyIncludes: ["Create your Sync Exchange account", "Get started"] },
  { path: "/signup/artist", expectedStatuses: [200], bodyIncludes: ["Create your artist account", "Sign up as an artist"] },
  { path: "/signup/buyer", expectedStatuses: [200], bodyIncludes: ["Create your buyer account", "Sign up as a buyer"] },
  { path: "/test-checkout", expectedStatuses: [200], bodyIncludes: ["Buy License ($25)", "Stripe test checkout"] },
  { path: "/onboarding", expectedStatuses: [307], locationIncludes: "/login?redirectTo=%2Fonboarding" }
];

const maxAttempts = Number(process.env.ROUTE_VERIFY_ATTEMPTS || 12);
const retryDelayMs = Number(process.env.ROUTE_VERIFY_DELAY_MS || 1200);
const requestTimeoutMs = Number(process.env.ROUTE_VERIFY_TIMEOUT_MS || 8000);
const serverBootTimeoutMs = Number(process.env.ROUTE_VERIFY_SERVER_BOOT_TIMEOUT_MS || 45000);

async function main() {
  const managedServer = useExistingServer ? null : await startManagedDevServer();

  try {
    await waitForServer();

    let hasFailure = false;

    for (const route of routeChecks) {
      const result = await verifyRoute(route);
      const prefix = result.ok ? "PASS" : "FAIL";
      console.log(`${prefix} ${route.path} -> ${result.status ?? "no response"}${result.location ? ` (${result.location})` : ""}`);

      if (!result.ok && result.detail) {
        console.log(`  ${result.detail}`);
      }

      hasFailure ||= !result.ok;
    }

    if (hasFailure) {
      process.exitCode = 1;
      return;
    }

    console.log(`Verified ${routeChecks.length} critical routes against ${baseUrl}`);
  } finally {
    if (managedServer) {
      await stopManagedDevServer(managedServer);
    }
  }
}

async function waitForServer() {
  const deadline = Date.now() + maxAttempts * retryDelayMs;
  let lastError = "unknown";

  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/login`);
      if (response.ok) {
        return;
      }
      lastError = `login returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(retryDelayMs);
  }

  throw new Error(`Dev server at ${baseUrl} did not become ready in time: ${lastError}`);
}

async function verifyRoute(route) {
  let lastFailure = "no response";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}${route.path}`, { redirect: "manual" });
      const status = response.status;
      const location = response.headers.get("location") || "";
      const body = route.expectedStatuses.includes(200) ? await response.text() : "";

      const statusOk = route.expectedStatuses.includes(status);
      const locationOk = route.locationIncludes ? location.includes(route.locationIncludes) : true;
      const bodyOk = route.bodyIncludes ? route.bodyIncludes.every((token) => body.includes(token)) : true;

      if (statusOk && locationOk && bodyOk) {
        return { ok: true, status, location };
      }

      lastFailure = [
        !statusOk ? `expected status ${route.expectedStatuses.join(" or ")}, got ${status}` : null,
        !locationOk ? `expected location containing ${route.locationIncludes}, got ${location || "none"}` : null,
        !bodyOk ? `expected body tokens missing on attempt ${attempt}` : null
      ]
        .filter(Boolean)
        .join("; ");
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    await delay(retryDelayMs);
  }

  return { ok: false, detail: lastFailure };
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        ...(init.headers || {})
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function startManagedDevServer() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCommand, ["run", "dev", "--", "--port", String(verifyPort)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let recentLogs = "";
  const collectLogs = (chunk) => {
    const text = chunk.toString();
    recentLogs += text;
    if (recentLogs.length > 4000) {
      recentLogs = recentLogs.slice(-4000);
    }
  };

  child.stdout.on("data", collectLogs);
  child.stderr.on("data", collectLogs);

  const bootDeadline = Date.now() + serverBootTimeoutMs;
  while (Date.now() < bootDeadline) {
    if (child.exitCode != null) {
      throw new Error(`Managed dev server exited early with code ${child.exitCode}.\n${recentLogs.trim()}`);
    }

    try {
      const response = await fetchWithTimeout(`${baseUrl}/login`);
      if (response.ok) {
        return { child };
      }
    } catch {
      // keep waiting
    }

    await delay(800);
  }

  child.kill("SIGTERM");
  throw new Error(`Managed dev server did not become ready in time.\n${recentLogs.trim()}`);
}

async function stopManagedDevServer(server) {
  if (!server.child || server.child.exitCode != null) {
    return;
  }

  server.child.kill("SIGTERM");
  await delay(500);
  if (server.child.exitCode == null) {
    server.child.kill("SIGKILL");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
