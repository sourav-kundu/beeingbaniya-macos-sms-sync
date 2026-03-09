# beeingbaniya-macos-sms-sync

Automatically sync bank transaction SMS from your Mac's Messages app to [BeeingBaniya](https://www.beeingbaniya.com).

## How it works

This tool reads SMS messages from the macOS Messages database (`chat.db`), filters for bank transaction keywords (amt, inr, rs, sent, spent), and sends matching messages to BeeingBaniya's webhook endpoint.

It runs as a background daemon via macOS LaunchAgent, polling for new messages every 60 seconds. On first launch (or restart), it catches up on the last 365 days of unsent messages.

## Prerequisites

- **macOS** (reads from iMessage/Messages database)
- **Node.js 18+** (`node --version` to check)
- **iMessage forwarding** enabled (Settings > Messages > Text Message Forwarding on your iPhone)
- **Full Disk Access** for Terminal (System Settings > Privacy & Security > Full Disk Access)

## Installation

```bash
npm install -g beeingbaniya-macos-sms-sync
```

## Setup

1. **Get your webhook token** from https://www.beeingbaniya.com/settings/sms-integration

2. **Configure the tool:**
   ```bash
   beeingbaniya-sync setup
   ```
   Paste your webhook token when prompted.

3. **Grant Full Disk Access** to Terminal:
   - Open **System Settings** > **Privacy & Security** > **Full Disk Access**
   - Add **Terminal** (or your terminal app: iTerm, Warp, etc.)

4. **Start the daemon:**
   ```bash
   beeingbaniya-sync start
   ```

That's it! The daemon will:
- Run an initial catch-up sync of the last 365 days
- Poll every 60 seconds for new messages
- Auto-start on login via macOS LaunchAgent

## Commands

| Command | Description |
|---------|-------------|
| `beeingbaniya-sync setup` | Configure your webhook token |
| `beeingbaniya-sync start` | Install LaunchAgent and start daemon |
| `beeingbaniya-sync stop` | Stop daemon and remove LaunchAgent |
| `beeingbaniya-sync status` | Check if daemon is running |
| `beeingbaniya-sync sync` | Run a one-time sync (no daemon) |
| `beeingbaniya-sync logs` | View recent sync logs |

## Data

All data is stored in `~/.beeingbaniya/`:
- `config.json` — Your webhook token
- `state.json` — Hashes of already-sent messages (prevents duplicates)
- `sync.log` — Activity log

## Uninstall

```bash
beeingbaniya-sync stop
npm uninstall -g beeingbaniya-macos-sms-sync
rm -rf ~/.beeingbaniya
```
