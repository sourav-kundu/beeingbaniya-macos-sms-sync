#!/usr/bin/env node

const readline = require("readline");
const {
  loadConfig,
  saveConfig,
  readPid,
  writePid,
  clearPid,
  isProcessRunning,
  STATE_DIR,
  LOG_FILE,
} = require("./state");
const { syncOnce, startDaemon, DAYS_TO_LOOK_BACK } = require("./sync");
const { install, uninstall, isInstalled, PLIST_FILE } = require("./launchd");

const ENDPOINT = "https://www.beeingbaniya.com/api/webhooks/sms";

// ── Helpers ─────────────────────────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function printHelp() {
  console.log(`
beeingbaniya-sync — Sync bank SMS from macOS Messages to BeeingBaniya

COMMANDS:
  setup          Configure your webhook token (one-time setup)
  start          Start the background sync daemon via launchd
  stop           Stop the background sync daemon
  status         Check if the daemon is running
  sync           Run a one-time sync (last 365 days)
  uninstall      Remove the auto-start LaunchAgent
  logs           Show recent sync logs
  help           Show this help message

SETUP:
  1. Run 'beeingbaniya-sync setup' and paste your webhook token
  2. Grant Full Disk Access to Terminal (System Settings > Privacy)
  3. Run 'beeingbaniya-sync start' to begin syncing

Data stored in: ~/.beeingbaniya/
`);
}

// ── Commands ────────────────────────────────────────────────────────────────

async function cmdSetup() {
  console.log("\n  BeeingBaniya Sync — Setup\n");
  console.log("  You can find your webhook token at:");
  console.log("  https://www.beeingbaniya.com/settings/sms-integration\n");

  const token = await ask("  Paste your webhook token (the UUID after 'Bearer '): ");

  if (!token || token.length < 10) {
    console.error("  Invalid token. Please try again.");
    process.exit(1);
  }

  // Strip "Bearer " prefix if user accidentally pastes the whole header
  const cleanToken = token.replace(/^Bearer\s+/i, "").trim();

  const config = { webhookToken: cleanToken, endpoint: ENDPOINT };
  saveConfig(config);

  console.log("\n  Config saved to ~/.beeingbaniya/config.json");
  console.log("  Next step: run 'beeingbaniya-sync start' to begin syncing.\n");
}

async function cmdStart() {
  const config = loadConfig();
  if (!config || !config.webhookToken) {
    console.error("No config found. Run 'beeingbaniya-sync setup' first.");
    process.exit(1);
  }

  // Check if already running
  const existingPid = readPid();
  if (existingPid && isProcessRunning(existingPid)) {
    console.log(`Daemon already running (PID ${existingPid}).`);
    console.log("Use 'beeingbaniya-sync stop' first if you want to restart.");
    return;
  }

  // Install LaunchAgent and let launchd manage the process
  install();
  console.log("\nSync daemon started via launchd.");
  console.log("It will run in the background and auto-start on login.");
  console.log(`Logs: ${LOG_FILE}`);
}

async function cmdStop() {
  if (isInstalled()) {
    uninstall();
  }

  const pid = readPid();
  if (pid && isProcessRunning(pid)) {
    try {
      process.kill(pid, "SIGTERM");
      console.log(`Stopped daemon (PID ${pid}).`);
    } catch {
      console.log("Could not stop process.");
    }
  }
  clearPid();
  console.log("Daemon stopped.");
}

function cmdStatus() {
  const config = loadConfig();
  const pid = readPid();
  const launchdInstalled = isInstalled();

  console.log("\n  BeeingBaniya Sync — Status\n");
  console.log(`  Config:     ${config ? "configured" : "not configured (run setup)"}`);
  console.log(`  LaunchAgent: ${launchdInstalled ? "installed" : "not installed"}`);

  if (pid && isProcessRunning(pid)) {
    console.log(`  Daemon:     running (PID ${pid})`);
  } else {
    console.log("  Daemon:     not running");
    if (pid) clearPid();
  }

  console.log(`  Data dir:   ${STATE_DIR}`);
  console.log(`  Logs:       ${LOG_FILE}`);
  console.log();
}

async function cmdSync() {
  const config = loadConfig();
  if (!config || !config.webhookToken) {
    console.error("No config found. Run 'beeingbaniya-sync setup' first.");
    process.exit(1);
  }

  console.log(`Syncing last ${DAYS_TO_LOOK_BACK} days...`);
  const result = await syncOnce(DAYS_TO_LOOK_BACK);
  console.log(
    `Done: ${result.sent} sent, ${result.skipped} already synced, ${result.errors} errors`
  );
}

async function cmdDaemon() {
  // This is the entry point that launchd calls — runs the actual daemon loop
  writePid();

  process.on("SIGTERM", () => {
    clearPid();
    process.exit(0);
  });
  process.on("SIGINT", () => {
    clearPid();
    process.exit(0);
  });

  await startDaemon();
}

function cmdLogs() {
  const fs = require("fs");
  if (!fs.existsSync(LOG_FILE)) {
    console.log("No logs yet.");
    return;
  }
  const lines = fs.readFileSync(LOG_FILE, "utf-8").split("\n");
  const last50 = lines.slice(-51, -1);
  console.log(last50.join("\n"));
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const command = process.argv[2] || "help";

  switch (command) {
    case "setup":
      await cmdSetup();
      break;
    case "start":
      await cmdStart();
      break;
    case "stop":
      await cmdStop();
      break;
    case "status":
      cmdStatus();
      break;
    case "sync":
      await cmdSync();
      break;
    case "daemon":
      await cmdDaemon();
      break;
    case "logs":
      cmdLogs();
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
