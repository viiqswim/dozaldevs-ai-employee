#!/usr/bin/env node
/**
 * run-vitest.mjs — Signal-safe Vitest launcher (orphan-proof).
 *
 * vitest.config.ts uses `pool: 'forks'`, so each test worker is a forked child
 * process. When a run is terminated abnormally (SIGKILL, a closed tmux pane, a
 * killed `| tee` pipeline, a dead parent shell), the parent vitest process dies but
 * its forked workers re-parent to init (ppid=1) and run full-tilt forever, each
 * pinning a CPU core — abandoned runs stack up and exhaust the machine. This wrapper
 * runs vitest in its own process group and signals the WHOLE group on exit, so every
 * forked worker is always reaped with it. Run via plain `node` (not tsx) so that an
 * orphaned wrapper re-parents directly to init and the parent-death watchdog fires.
 *
 * Usage: node scripts/run-vitest.mjs [...vitest args]   (wired into package.json test*)
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const C = { red: '\x1b[31m', yellow: '\x1b[33m', reset: '\x1b[0m' };

const require = createRequire(import.meta.url);
let vitestCli;
try {
  vitestCli = require.resolve('vitest/vitest.mjs');
} catch {
  vitestCli = require.resolve('vitest/dist/cli.js');
}

const vitestArgs = process.argv.slice(2);

// `detached: true` gives the child its own process group (pgid === child pid);
// signalling the negative pid reaches the vitest parent AND every forked worker.
const child = spawn(process.execPath, [vitestCli, ...vitestArgs], {
  stdio: 'inherit',
  detached: true,
});

const SIGNAL_NUMBERS = { SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGKILL: 9, SIGTERM: 15 };

// Idempotent: signals the whole group; ESRCH (group already gone) is ignored.
function signalGroup(signal) {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    /* group already gone */
  }
}

const FORWARDED = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT'];
for (const sig of FORWARDED) {
  process.on(sig, () => {
    process.stderr.write(
      `${C.yellow}\n[run-vitest] ${sig} received — tearing down vitest process group…${C.reset}\n`,
    );
    signalGroup(sig);
  });
}

// Last-resort backstop: SIGKILL any group member still alive when we exit. This
// also catches vitest's fork pool leaving straggler workers after a clean exit —
// without it they re-parent to init and become runaway orphans.
process.on('exit', () => signalGroup('SIGKILL'));

process.on('uncaughtException', (err) => {
  process.stderr.write(
    `${C.red}[run-vitest] uncaught exception — killing vitest group${C.reset}\n${String(err)}\n`,
  );
  signalGroup('SIGKILL');
  process.exit(1);
});

child.on('exit', (code, signal) => {
  signalGroup('SIGTERM');
  process.exitCode = signal ? 128 + (SIGNAL_NUMBERS[signal] ?? 15) : (code ?? 0);
});

child.on('error', (err) => {
  process.stderr.write(`${C.red}[run-vitest] failed to launch vitest: ${String(err)}${C.reset}\n`);
  process.exit(1);
});

// Parent-death watchdog: SIGKILL can't be caught, so if the launching shell/tmux
// pane/pnpm dies we are silently re-parented to init (ppid=1). Poll for that and
// self-terminate, taking the whole vitest group down — otherwise a run nobody is
// watching keeps every fork worker pinning a CPU core indefinitely.
const launchPpid = process.ppid;
setInterval(() => {
  if (process.ppid !== launchPpid || process.ppid === 1) {
    process.stderr.write(
      `${C.yellow}\n[run-vitest] launching parent died — tearing down vitest process group…${C.reset}\n`,
    );
    signalGroup('SIGKILL');
    process.exit(1);
  }
}, 1000).unref();
