#!/usr/bin/env tsx
/**
 * telegram-notify.ts — Send a Telegram notification from the command line.
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from process.env or .env.
 * Uses the sendTelegramNotification utility (with retry on rate limits).
 *
 * Usage:
 *   tsx scripts/telegram-notify.ts "Your message here"
 */

import { existsSync, readFileSync } from 'node:fs';
import { sendTelegramNotification } from '../src/lib/telegram-client.js';

// ─── .env loader ──────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync('.env')) return env;
  const content = readFileSync('.env', 'utf8');
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) {
      env[match[1]] = match[2].replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    }
  }
  return env;
}

const dotenv = loadEnv();

// Inject into process.env so sendTelegramNotification can read them
process.env.TELEGRAM_BOT_TOKEN ??= dotenv['TELEGRAM_BOT_TOKEN'];
process.env.TELEGRAM_CHAT_ID ??= dotenv['TELEGRAM_CHAT_ID'];

// ─── Main ─────────────────────────────────────────────────────────────────────

const message = process.argv[2];

if (!message) {
  console.error('Usage: tsx scripts/telegram-notify.ts "Your message here"');
  process.exit(1);
}

try {
  await sendTelegramNotification(message);
  console.log('[telegram] Notification sent.');
} catch (err) {
  console.error('[telegram] Failed to send notification:', err);
  process.exit(1);
}
