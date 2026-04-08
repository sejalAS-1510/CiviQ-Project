#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const path = require("path");

const npmCmd = "npm";
const frontendRoot = path.join(__dirname, "frontend");
const backendRoot = path.join(__dirname, "backend");

function runSync(command, args, cwd) {
  execSync([command, ...args].join(" "), {
    cwd,
    stdio: "inherit",
    shell: true,
  });
}

function startProcess(label, command, args, cwd) {
  console.log(label);
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

  return proc;
}

console.log("🚀 Starting CiviQ single-URL mode...\n");
console.log("📦 Building frontend...");
runSync(npmCmd, ["run", "build"], frontendRoot);

console.log("\n✅ Frontend build complete.");
console.log("📡 Starting backend on the same port as the UI...");
startProcess("📡 Backend server...", npmCmd, ["start"], backendRoot);

console.log("\n🔧 Open http://localhost:5000 for both UI and API");
console.log(
  "💡 Login, complaint management, and uploads all use the same origin now.",
);
console.log("🛑 Press Ctrl+C to stop the server\n");
