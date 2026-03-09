const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STATE_DIR = path.join(require("os").homedir(), ".beeingbaniya");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const CONFIG_FILE = path.join(STATE_DIR, "config.json");
const LOG_FILE = path.join(STATE_DIR, "sync.log");
const PID_FILE = path.join(STATE_DIR, "daemon.pid");

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

// ── Config ──────────────────────────────────────────────────────────────────

function loadConfig() {
  ensureDir();
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function saveConfig(config) {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ── Sent-messages state ─────────────────────────────────────────────────────

function loadState() {
  ensureDir();
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

function messageHash(text, unixSeconds) {
  return crypto
    .createHash("sha256")
    .update(`${text}||${unixSeconds}`)
    .digest("hex")
    .slice(0, 16);
}

function isMessageSent(state, hash) {
  return hash in state;
}

function markMessageSent(state, hash) {
  state[hash] = Date.now();
}

// ── Logging ─────────────────────────────────────────────────────────────────

function log(message) {
  ensureDir();
  const ts = new Date().toISOString();
  const line = `[${ts}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

// ── PID ─────────────────────────────────────────────────────────────────────

function writePid() {
  ensureDir();
  fs.writeFileSync(PID_FILE, String(process.pid));
}

function readPid() {
  if (!fs.existsSync(PID_FILE)) return null;
  try {
    return parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
  } catch {
    return null;
  }
}

function clearPid() {
  if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  STATE_DIR,
  STATE_FILE,
  CONFIG_FILE,
  LOG_FILE,
  PID_FILE,
  loadConfig,
  saveConfig,
  loadState,
  saveState,
  messageHash,
  isMessageSent,
  markMessageSent,
  log,
  writePid,
  readPid,
  clearPid,
  isProcessRunning,
};
