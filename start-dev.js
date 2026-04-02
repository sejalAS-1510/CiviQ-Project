#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");
const npmCmd = "npm";

console.log("🚀 Starting CiviQ Development Environment...\n");

const childProcesses = [];

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
  startProcess(
    "\n🌐 Starting frontend server...",
    npmCmd,
    ["run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"],
    path.join(__dirname, "frontend"),
  );

  console.log("\n✅ All services started!");
  console.log("📱 Frontend: http://localhost:5173");
  console.log("🔧 Backend: http://localhost:5000");
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
