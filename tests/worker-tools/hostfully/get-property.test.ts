import { execFile } from 'child_process';
import * as http from 'http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, '../../../dist/worker-tools/hostfully/get-property.js');

function runScript(
  args: string[],
  env: Record<string, string>,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      'node',
      [SCRIPT_PATH, ...args],
      { env: { ...process.env, ...env } },
      (err, stdout, stderr) => {
        resolve({ stdout, stderr, code: err ? ((err.code as number) ?? 1) : 0 });
      },
    );
  });
}

let server: http.Server;
let port: number;
const requestPaths: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '';
    requestPaths.push(url);

    res.setHeader('Content-Type', 'application/json');

    if (url === '/properties/VALID_UID') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          property: {
            uid: 'VALID_UID',
            name: 'Test Property',
            propertyType: 'CABIN',
            address: {
              address: '123 Main St',
              city: 'Denver',
              state: 'CO',
              zipCode: '80201',
              countryCode: 'US',
            },
            bedrooms: 3,
            beds: 4,
            bathrooms: '2',
            availability: { maxGuests: 8, checkInTimeStart: 16, checkOutTime: 11 },
            wifiNetwork: 'TestWifi',
            wifiPassword: 'secret123',
            bookingNotes: null,
            extraNotes: null,
            guideBookUrl: null,
          },
        }),
      );
    } else if (url === '/amenities?propertyUid=VALID_UID') {
      res.writeHead(200);
      res.end(JSON.stringify({ amenities: [{ amenity: 'HAS_WIFI', category: 'INDOOR' }] }));
    } else if (url === '/property-rules?propertyUid=VALID_UID') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          propertyRules: [{ rule: 'IS_FAMILY_FRIENDLY', description: 'Kids welcome' }],
        }),
      );
    } else if (url === '/properties/NO_AMENITIES_UID') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          property: {
            uid: 'NO_AMENITIES_UID',
            name: 'Test Property 2',
            propertyType: 'CABIN',
            address: {
              address: '456 Oak Ave',
              city: 'Boulder',
              state: 'CO',
              zipCode: '80302',
              countryCode: 'US',
            },
            bedrooms: 2,
            beds: 2,
            bathrooms: '1',
            availability: { maxGuests: 4, checkInTimeStart: 15, checkOutTime: 10 },
            wifiNetwork: 'OakWifi',
            wifiPassword: 'oak123',
            bookingNotes: null,
            extraNotes: null,
            guideBookUrl: null,
          },
        }),
      );
    } else if (url === '/amenities?propertyUid=NO_AMENITIES_UID') {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'server error' }));
    } else if (url === '/property-rules?propertyUid=NO_AMENITIES_UID') {
      res.writeHead(200);
      res.end(JSON.stringify({ propertyRules: [] }));
    } else if (url === '/properties/INVALID_UID') {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Property not found' }));
    } else if (url === '/properties/SPARSE_UID') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          property: {
            uid: 'SPARSE_UID',
            name: 'Sparse Property',
            propertyType: 'APARTMENT',
            address: {
              address: '789 Pine Rd',
              city: 'Aspen',
              state: 'CO',
              zipCode: '81611',
              countryCode: 'US',
            },
            bedrooms: 1,
            beds: 1,
            bathrooms: '1',
            availability: { maxGuests: 2, checkInTimeStart: 14, checkOutTime: 12 },
          },
        }),
      );
    } else if (url === '/amenities?propertyUid=SPARSE_UID') {
      res.writeHead(200);
      res.end(JSON.stringify({ amenities: [] }));
    } else if (url === '/property-rules?propertyUid=SPARSE_UID') {
      res.writeHead(200);
      res.end(JSON.stringify({ propertyRules: [] }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe('get-property shell tool', () => {
  it('exits 0 with valid JSON for a valid property ID', async () => {
    requestPaths.length = 0;
    const { stdout, code } = await runScript(['--property-id', 'VALID_UID'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>;
    expect(data.uid).toBe('VALID_UID');
    expect(data.name).toBe('Test Property');
    expect(data.address).toBe('123 Main St, Denver, CO, 80201, US');
    expect(data.amenities).toEqual(['HAS_WIFI']);
    expect(data.houseRules).toEqual([{ rule: 'IS_FAMILY_FRIENDLY', description: 'Kids welcome' }]);
    expect(requestPaths.some((p) => p.includes('/properties/VALID_UID'))).toBe(true);
    expect(requestPaths.some((p) => p.includes('/amenities'))).toBe(true);
    expect(requestPaths.some((p) => p.includes('/property-rules'))).toBe(true);
  });

  it('exits 1 when --property-id is missing', async () => {
    const { stderr, code } = await runScript([], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('--property-id');
  });

  it('exits 1 when HOSTFULLY_API_KEY is missing', async () => {
    const { stderr, code } = await runScript(['--property-id', 'VALID_UID'], {
      HOSTFULLY_API_KEY: '',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('HOSTFULLY_API_KEY');
  });

  it('exits 1 when property ID returns 404', async () => {
    const { stderr, code } = await runScript(['--property-id', 'INVALID_UID'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(1);
    expect(stderr.length).toBeGreaterThan(0);
  });

  it('outputs null for absent optional fields', async () => {
    const { stdout, code } = await runScript(['--property-id', 'SPARSE_UID'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>;
    expect(data.wifiNetwork).toBeNull();
    expect(data.wifiPassword).toBeNull();
  });

  it('exits 0 and prints usage for --help', async () => {
    const { stdout, code } = await runScript(['--help'], {});
    expect(code).toBe(0);
    expect(stdout).toContain('--property-id');
  });

  it('exits 0 with empty amenities when amenities endpoint fails', async () => {
    const { stdout, stderr, code } = await runScript(['--property-id', 'NO_AMENITIES_UID'], {
      HOSTFULLY_API_KEY: 'testkey',
      HOSTFULLY_API_URL: `http://localhost:${port}`,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout) as Record<string, unknown>;
    expect(data.amenities).toEqual([]);
    expect(stderr.length).toBeGreaterThan(0);
  });
});
