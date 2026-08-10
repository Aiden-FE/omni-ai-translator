import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const script = path.resolve(process.cwd(), 'scripts/check-store-credentials.sh');
const tempDirs: string[] = [];

const credentialNames = [
  'CHROME_CLIENT_ID',
  'CHROME_CLIENT_SECRET',
  'CHROME_REFRESH_TOKEN',
  'CHROME_ITEM_ID',
  'CHROME_PUBLISHER_ID',
  'AMO_API_KEY',
  'AMO_API_SECRET',
  'EDGE_PRODUCT_ID',
  'EDGE_CLIENT_ID',
  'EDGE_CLIENT_SECRET',
  'EDGE_TENANT_ID',
] as const;

function runCheck(store: string, credentials: Record<string, string> = {}) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'store-credentials-'));
  tempDirs.push(tempDir);
  const outputPath = path.join(tempDir, 'github-output');
  const emptyCredentials = Object.fromEntries(
    credentialNames.map((name) => [name, '']),
  );

  const result = spawnSync('bash', [script, store], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      GITHUB_OUTPUT: outputPath,
      ...emptyCredentials,
      ...credentials,
    },
  });

  return {
    status: result.status,
    log: `${result.stdout}${result.stderr}`,
    output: existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '',
  };
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('check-store-credentials', () => {
  it('skips a store when its entire credential set is absent', () => {
    const result = runCheck('firefox');

    expect(result.status).toBe(0);
    expect(result.output).toContain('configured=false');
    expect(result.log).toContain('skipping Firefox Add-ons publish');
  });

  it('fails when a store credential set is only partially configured', () => {
    const result = runCheck('firefox', {
      AMO_API_KEY: 'configured-key',
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('configured=false');
    expect(result.log).toContain('AMO_API_SECRET');
  });

  it('enables publishing when every store credential is configured', () => {
    const secret = 'must-not-appear-in-logs';
    const result = runCheck('edge', {
      EDGE_PRODUCT_ID: secret,
      EDGE_CLIENT_ID: secret,
      EDGE_CLIENT_SECRET: secret,
      EDGE_TENANT_ID: secret,
    });

    expect(result.status).toBe(0);
    expect(result.output).toContain('configured=true');
    expect(result.log).not.toContain(secret);
  });

  it('rejects an unknown store name', () => {
    const result = runCheck('safari');

    expect(result.status).toBe(2);
    expect(result.log).toContain('Unsupported store: safari');
  });
});
