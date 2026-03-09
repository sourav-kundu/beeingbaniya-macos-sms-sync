const { execSync } = require("child_process");
const {
  loadConfig,
  loadState,
  saveState,
  messageHash,
  isMessageSent,
  markMessageSent,
  log,
} = require("./state");

const DAYS_TO_LOOK_BACK = 365;
const POLL_INTERVAL_MS = 60 * 1000; // 1 minute
const SEND_DELAY_MS = 200; // delay between webhook calls
const KEYWORD_REGEX =
  /(?:^|[^a-zA-Z])(amt|inr|rs\.?|sent|spent)(?:[^a-zA-Z]|$)/i;

// ── Read messages from macOS chat.db ────────────────────────────────────────

function readMessages(daysBack) {
  const query = `
    SELECT
      text,
      hex(attributedBody) as hexBody,
      (date / 1000000000) + 978307200 AS unixSeconds
    FROM message
    WHERE is_from_me = 0
    AND date >= (strftime('%s', 'now', '-${daysBack} days') - 978307200) * 1000000000
    ORDER BY date ASC;
  `;

  try {
    const output = execSync(
      `sqlite3 -json ~/Library/Messages/chat.db "${query}"`,
      { encoding: "utf-8", maxBuffer: 1024 * 1024 * 50 }
    );
    if (output.trim()) return JSON.parse(output);
    return [];
  } catch (err) {
    log(`ERROR reading chat.db: ${err.message}`);
    return [];
  }
}

// ── Extract readable text from a message row ────────────────────────────────

function extractText(m) {
  let bodyText = m.text;

  if (!bodyText && m.hexBody) {
    const buffer = Buffer.from(m.hexBody, "hex");
    let rawStr = buffer.toString("utf8").replace(/\x00/g, "");
    bodyText = rawStr.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ");

    const cleanMatch = bodyText.match(
      /NSString\s*[^a-zA-Z0-9]*(.*?)(?:NSDictionary|__kIMMessage|bplist00|NSValue|NSKeyedArchiver)/
    );
    if (cleanMatch && cleanMatch[1]) {
      bodyText = cleanMatch[1].trim();
    }
  }

  return bodyText;
}

// ── Send a single message to the webhook ────────────────────────────────────

async function sendToWebhook(config, text, receivedAt) {
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.webhookToken}`,
    },
    body: JSON.stringify({ text, received_at: receivedAt }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

// ── Single sync cycle ───────────────────────────────────────────────────────

async function syncOnce(daysBack) {
  const config = loadConfig();
  if (!config || !config.webhookToken) {
    log("ERROR: No config found. Run 'beeingbaniya-sync setup' first.");
    return { sent: 0, skipped: 0, errors: 0 };
  }

  const messages = readMessages(daysBack);
  const state = loadState();
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  let consecutiveErrors = 0;

  for (const m of messages) {
    const bodyText = extractText(m);
    if (!bodyText || !KEYWORD_REGEX.test(bodyText)) continue;

    const hash = messageHash(bodyText, m.unixSeconds);
    if (isMessageSent(state, hash)) {
      skipped++;
      continue;
    }

    const isoDate = new Date(m.unixSeconds * 1000).toISOString();

    try {
      await sendToWebhook(config, bodyText, isoDate);
      markMessageSent(state, hash);
      sent++;
      consecutiveErrors = 0;

      // Save state after each successful send (crash-safe)
      saveState(state);
    } catch (err) {
      errors++;
      consecutiveErrors++;
      log(`ERROR sending message: ${err.message}`);

      if (consecutiveErrors >= 5) {
        log("HALT: 5 consecutive errors, stopping this cycle.");
        break;
      }
    }

    // Small delay between sends
    if (sent > 0) {
      await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
    }
  }

  if (sent > 0 || errors > 0) {
    log(`Sync complete: ${sent} sent, ${skipped} skipped, ${errors} errors`);
  }

  return { sent, skipped, errors };
}

// ── Daemon loop ─────────────────────────────────────────────────────────────

async function startDaemon() {
  const config = loadConfig();
  if (!config || !config.webhookToken) {
    console.error(
      "No config found. Run 'beeingbaniya-sync setup' first."
    );
    process.exit(1);
  }

  log("Daemon starting. Running initial catch-up sync (last 365 days)...");
  console.log("Running initial catch-up sync (last 365 days)...");

  const initial = await syncOnce(DAYS_TO_LOOK_BACK);
  console.log(
    `Catch-up complete: ${initial.sent} sent, ${initial.skipped} already synced, ${initial.errors} errors`
  );
  log(
    `Catch-up complete: ${initial.sent} sent, ${initial.skipped} already synced, ${initial.errors} errors`
  );

  console.log(`Now polling every ${POLL_INTERVAL_MS / 1000}s for new messages...`);
  log("Entering poll loop (every 60s)...");

  // For ongoing polls, only look back 7 days (sufficient to catch anything new)
  setInterval(async () => {
    try {
      await syncOnce(7);
    } catch (err) {
      log(`ERROR in poll cycle: ${err.message}`);
    }
  }, POLL_INTERVAL_MS);
}

module.exports = { syncOnce, startDaemon, DAYS_TO_LOOK_BACK };
