#!/usr/bin/env tsx
/**
 * Fly.io Setup Script
 *
 * Creates the Fly.io app "ai-employee-workers" if it doesn't already exist.
 * Idempotent: safe to run multiple times.
 * Run: pnpm fly:setup
 */

import { $ } from 'zx';
import { mkdirSync, writeFileSync } from 'node:fs';

// Disable auto-output by default, we control output
$.verbose = false;

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(msg: string) {
  console.log(msg);
}

function ok(step: string, detail?: string) {
  log(
    `${COLORS.green}✓${COLORS.reset} ${step}${detail ? ` ${COLORS.cyan}(${detail})${COLORS.reset}` : ''}`,
  );
}

function warn(step: string, detail?: string) {
  log(`${COLORS.yellow}⚠${COLORS.reset} ${step}${detail ? ` — ${detail}` : ''}`);
}

function fail(step: string, detail?: string) {
  log(`${COLORS.red}✗${COLORS.reset} ${step}${detail ? ` — ${detail}` : ''}`);
}

function section(name: string) {
  log(`\n${COLORS.bold}${COLORS.cyan}── ${name} ──${COLORS.reset}`);
}

// Create evidence directory
mkdirSync('.sisyphus/evidence', { recursive: true });

log(`\n${COLORS.bold}Fly.io Setup${COLORS.reset}`);
log('Creating Fly.io app if needed...\n');

const FLY_API_TOKEN = process.env.FLY_API_TOKEN;
const FLY_ORG = process.env.FLY_ORG ?? 'personal';
const APP_NAME = 'ai-employee-workers';
const BASE_URL = 'https://api.machines.dev/v1';

// ─── Step 1: Validate FLY_API_TOKEN ───────────────────────────────────────
section('Step 1: Validate FLY_API_TOKEN');

if (!FLY_API_TOKEN) {
  fail('FLY_API_TOKEN is required', 'Set it in .env first');
  process.exit(1);
}

ok('FLY_API_TOKEN found');

// ─── Step 2: Check if app already exists ──────────────────────────────────
section('Step 2: Check if app exists');

let appExists = false;

try {
  const checkResponse = await fetch(`${BASE_URL}/apps/${APP_NAME}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${FLY_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  if (checkResponse.status === 200) {
    appExists = true;
    ok('App already exists', APP_NAME);
  } else if (checkResponse.status === 404) {
    log(`App does not exist, will create...`);
  } else {
    fail('Unexpected response', `Status ${checkResponse.status}`);
    process.exit(1);
  }
} catch (error) {
  fail('Failed to check app', String(error));
  process.exit(1);
}

// ─── Step 3: Create app if needed ─────────────────────────────────────────
section('Step 3: Create app');

if (!appExists) {
  try {
    const createResponse = await fetch(`${BASE_URL}/apps`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FLY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_name: APP_NAME,
        org_slug: FLY_ORG,
      }),
    });

    if (createResponse.status === 201 || createResponse.status === 200) {
      ok('Fly.io app created', APP_NAME);
    } else {
      const errorText = await createResponse.text();
      fail('Fly.io API error', `Status ${createResponse.status}: ${errorText}`);
      process.exit(1);
    }
  } catch (error) {
    fail('Failed to create app', String(error));
    process.exit(1);
  }
} else {
  ok('Skipping creation (already exists)', APP_NAME);
}

// ─── Step 4: Write evidence ───────────────────────────────────────────────
section('Step 4: Write evidence');

try {
  const timestamp = new Date().toISOString();
  const evidence = `[${timestamp}] Fly.io app setup completed: ${APP_NAME}\n`;
  writeFileSync('.sisyphus/evidence/task-1-fly-setup.log', evidence);
  ok('Evidence written', '.sisyphus/evidence/task-1-fly-setup.log');
} catch (error) {
  warn('Failed to write evidence', String(error));
}

log(`\n${COLORS.green}${COLORS.bold}✓ Fly.io setup complete${COLORS.reset}\n`);
