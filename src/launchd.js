const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const PLIST_NAME = "com.beeingbaniya.sync";
const PLIST_FILE = path.join(
  os.homedir(),
  "Library",
  "LaunchAgents",
  `${PLIST_NAME}.plist`
);

function getNodePath() {
  try {
    return execSync("which node", { encoding: "utf-8" }).trim();
  } catch {
    return "/usr/local/bin/node";
  }
}

function getCliPath() {
  // Find the installed global path of the CLI
  try {
    const npmGlobalBin = execSync("npm root -g", { encoding: "utf-8" }).trim();
    const cliPath = path.join(npmGlobalBin, "beeingbaniya-sync", "src", "cli.js");
    if (fs.existsSync(cliPath)) return cliPath;
  } catch {}

  // Fallback: use the current file's location
  return path.resolve(__dirname, "cli.js");
}

function generatePlist() {
  const nodePath = getNodePath();
  const cliPath = getCliPath();
  const logDir = path.join(os.homedir(), ".beeingbaniya");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${cliPath}</string>
        <string>daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${logDir}/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${logDir}/stderr.log</string>
    <key>ThrottleInterval</key>
    <integer>30</integer>
</dict>
</plist>`;
}

function install() {
  const launchAgentsDir = path.join(os.homedir(), "Library", "LaunchAgents");
  if (!fs.existsSync(launchAgentsDir)) {
    fs.mkdirSync(launchAgentsDir, { recursive: true });
  }

  const plist = generatePlist();
  fs.writeFileSync(PLIST_FILE, plist);

  try {
    execSync(`launchctl load "${PLIST_FILE}"`, { stdio: "inherit" });
    console.log("LaunchAgent installed and loaded.");
    console.log("beeingbaniya-sync will now run in the background and start on login.");
  } catch (err) {
    console.error("Failed to load LaunchAgent:", err.message);
    console.log(`Plist written to: ${PLIST_FILE}`);
    console.log(`Try manually: launchctl load "${PLIST_FILE}"`);
  }
}

function uninstall() {
  if (!fs.existsSync(PLIST_FILE)) {
    console.log("LaunchAgent not installed.");
    return;
  }

  try {
    execSync(`launchctl unload "${PLIST_FILE}"`, { stdio: "inherit" });
  } catch {
    // might not be loaded
  }

  fs.unlinkSync(PLIST_FILE);
  console.log("LaunchAgent uninstalled. beeingbaniya-sync will no longer auto-start.");
}

function isInstalled() {
  return fs.existsSync(PLIST_FILE);
}

module.exports = { install, uninstall, isInstalled, PLIST_FILE };
