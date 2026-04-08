#!/usr/bin/env node

const { spawn } = require("child_process");
const { execSync } = require("child_process");
const path = require("path");
const npmCmd = "npm";
const BACKEND_PORT = Number(process.env.PORT || 5000);
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT || 8080);

console.log("🚀 Starting CiviQ Development Environment...\n");

const childProcesses = [];

function getPidsOnPortWindows(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();

    const pids = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/).pop())
      .filter((pid) => /^\d+$/.test(pid));

    return [...new Set(pids)];
  } catch {
    return [];
  }
}

function freePort(port, label) {
  if (process.platform !== "win32") return;

  const pids = getPidsOnPortWindows(port);
  if (!pids.length) return;

  console.log(`🧹 Releasing port ${port} for ${label}...`);
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /PID ${pid}`, {
        stdio: ["ignore", "ignore", "ignore"],
      });
    } catch {
      // Ignore kill failures and let process startup report final error if port remains blocked.
    }
  }
}

function startProcess(label, command, args, cwd) {
  console.log(`${label}`);
  const proc = spawn(command, args, {
    cwd,
    stdio: "inherit",
    shell: true,
  });

  proc.on("error", (err) => {
    console.error(`❌ Failed to start ${label}:`, err.message);
  });

  proc.on("close", (code) => {
    if (code !== 0) {
      console.log(`⚠️  ${label} exited with code ${code}`);
    }
  });

  childProcesses.push(proc);
  return proc;
}

// Start backend API server
freePort(BACKEND_PORT, "backend");
startProcess(
  "📡 Starting backend server...",
  npmCmd,
  ["start"],
  path.join(__dirname, "backend"),
);

// Start automation scheduler
startProcess(
  "⏰ Starting automation scheduler...",
  npmCmd,
  ["run", "start:automation"],
  path.join(__dirname, "backend"),
);

// Wait a bit then start frontend
setTimeout(() => {
  freePort(FRONTEND_PORT, "frontend");
  startProcess(
    "\n🌐 Starting frontend server...",
    npmCmd,
    ["run", "dev", "--", "--host", "0.0.0.0", "--port", String(FRONTEND_PORT)],
    path.join(__dirname, "frontend"),
  );

  console.log("\n✅ All services started!");
  console.log(
    `📱 Frontend target: http://localhost:${FRONTEND_PORT} (check Vite output for actual port)`,
  );
  console.log(`🔧 Backend: http://localhost:${BACKEND_PORT}`);
  console.log("⏰ Automation: reminder scheduler active");
  console.log("\n💡 Test login with: test@example.com / password123");
  console.log("🛑 Press Ctrl+C to stop all services\n");
}, 3000);

// Handle process termination
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down services...");
  for (const proc of childProcesses) {
    if (!proc.killed) proc.kill();
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down services...");
  for (const proc of childProcesses) {
    if (!proc.killed) proc.kill();
  }
  process.exit(0);
});
