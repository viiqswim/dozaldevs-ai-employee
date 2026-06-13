import { describe, it, expect } from 'vitest';

import { ALL_TOOL_DESCRIPTORS } from '../../src/lib/tool-registry.js';
import { PLATFORM_ENV_WHITELIST } from '../../src/repositories/tenant-env-loader.js';

const TENANT_SECRET_VARS = new Set([
  'SLACK_BOT_TOKEN',
  'HOSTFULLY_API_KEY',
  'SIFELY_CLIENT_ID',
  'SIFELY_USERNAME',
  'SIFELY_PASSWORD',
]);

const TASK_SCOPED_VARS = new Set(['TASK_ID', 'TENANT_ID']);

const GATEWAY_ONLY_VARS = new Set(['GITHUB_APP_ID', 'GITHUB_PRIVATE_KEY']);

const EXEMPT_VARS = new Set([...TENANT_SECRET_VARS, ...TASK_SCOPED_VARS, ...GATEWAY_ONLY_VARS]);

describe('env enforcement', () => {
  it('every platform env var in tool descriptors is in PLATFORM_ENV_WHITELIST', () => {
    const whitelist = new Set<string>(PLATFORM_ENV_WHITELIST);
    const violations: string[] = [];

    for (const descriptor of ALL_TOOL_DESCRIPTORS) {
      for (const envVar of descriptor.envVars) {
        if (EXEMPT_VARS.has(envVar)) continue;
        if (!whitelist.has(envVar)) {
          violations.push(`${descriptor.id}: ${envVar} not in PLATFORM_ENV_WHITELIST`);
        }
      }
    }

    expect(
      violations,
      `Platform vars referenced by tools but missing from PLATFORM_ENV_WHITELIST. ` +
        `Either add the var to PLATFORM_ENV_WHITELIST (and .env.example + .env), or add it ` +
        `to one of the exemption sets in this test if it is a tenant secret / task-scoped / ` +
        `gateway-only var:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('exemption sets never overlap the platform whitelist', () => {
    const whitelist = new Set<string>(PLATFORM_ENV_WHITELIST);
    const leaks = [...EXEMPT_VARS].filter((v) => whitelist.has(v));
    expect(
      leaks,
      `These vars are exempted as tenant-secret / task-scoped / gateway-only but also appear ` +
        `in PLATFORM_ENV_WHITELIST. A tenant secret or gateway-only credential in the platform ` +
        `whitelist would be broadcast into every worker container — a tenant-isolation bug:\n${leaks.join('\n')}`,
    ).toEqual([]);
  });

  it('every exempted var is actually referenced by a tool descriptor', () => {
    const referenced = new Set<string>(ALL_TOOL_DESCRIPTORS.flatMap((d) => d.envVars));
    const stale = [...EXEMPT_VARS].filter((v) => !referenced.has(v));
    expect(
      stale,
      `These vars are exempted but no tool descriptor references them — remove the stale ` +
        `exemption to keep the enumeration honest:\n${stale.join('\n')}`,
    ).toEqual([]);
  });
});
