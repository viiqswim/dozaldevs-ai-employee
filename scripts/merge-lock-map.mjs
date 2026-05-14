import { readFileSync, writeFileSync } from 'fs';

const hub = JSON.parse(
  readFileSync(
    '/Users/victordozal/repos/real-estate/vlre-hub/apps/api/src/data/properties.json',
    'utf8',
  ),
);
const enrichment = JSON.parse(
  readFileSync(
    '/Users/victordozal/repos/dozal-devs/ai-employee/docs/guides/2026-05-13-2150-property-lock-passcode-map.json',
    'utf8',
  ),
);

// Build a lookup: sifelyLockId (number) → enrichment data
const lockLookup = new Map();
// Handle both old format (properties grouped by code with locks[]) and new format (listings with locks[])
const enrichProps = enrichment.properties || enrichment.listings || {};
for (const [code, prop] of Object.entries(enrichProps)) {
  const locks = prop.locks || [];
  for (const lock of locks) {
    const id = lock.lockId || lock.sifelyLockId;
    if (id) lockLookup.set(id, { ...lock, lockId: id, sourceProperty: code });
  }
}
for (const lock of enrichment.unmatchedLocks || enrichment.unassignedLocks || []) {
  const id = lock.lockId || lock.sifelyLockId;
  if (id) lockLookup.set(id, { ...lock, lockId: id, sourceProperty: null });
}

// ============================================================
// INTERVIEW-CONFIRMED CORRECTIONS
// ============================================================

// 1. Lock replacements (confirmed by owner)
const lockReplacements = new Map([
  [5280922, 25762100], // 219-PAU front door: old → "219-pau Front door (new)"
  [8500612, 31136280], // 407-GEV loft door: old → "407-Gev-Loft-official"
]);

// 2. New listings to add (not in vlre-hub properties.json)
const additionalListings = [
  {
    name: '7213-NUT-4',
    hostfullyId: '14f5b23d-8614-4595-a20c-2c783dc408bb',
    address: '7213 Nutria Run, Austin, TX, 78744',
    type: 'room',
    locks: [
      { sifelyLockId: 3391760, sifelyLockName: '7213-NUT-FRONT-DOOR' },
      { sifelyLockId: 6138964, sifelyLockName: '7213-NUT-4-ROOM-DOOR' },
    ],
  },
  {
    name: '7213-NUT-5',
    hostfullyId: '1d3baecb-dce2-495f-a242-2536ab55bf2e',
    address: '7213 Nutria Run, Austin, TX, 78744',
    type: 'room',
    locks: [
      { sifelyLockId: 3391760, sifelyLockName: '7213-NUT-FRONT-DOOR' },
      { sifelyLockId: 13044074, sifelyLockName: '7213-NUT-5-ROOM-DOOR' },
    ],
  },
  {
    name: '7213-NUT-HOME',
    hostfullyId: '17b4dca8-24a1-4a7d-ae1e-faaa1dd41257',
    address: '7213 Nutria Run, Austin, TX, 78744',
    type: 'home',
    locks: [
      { sifelyLockId: 3391760, sifelyLockName: '7213-NUT-FRONT-DOOR' },
      { sifelyLockId: 13328394, sifelyLockName: '7213-NUT-1-ROOM-DOOR' },
      { sifelyLockId: 3385978, sifelyLockName: '7213-NUT-2-ROOM-DOOR' },
      { sifelyLockId: 3385868, sifelyLockName: '7213-NUT-3-ROOM-DOOR' },
      { sifelyLockId: 6138964, sifelyLockName: '7213-NUT-4-ROOM-DOOR' },
      { sifelyLockId: 13044074, sifelyLockName: '7213-NUT-5-ROOM-DOOR' },
      { sifelyLockId: 5440142, sifelyLockName: '7213-NUT-PATIO-DOOR' },
    ],
  },
  {
    name: '5306A-KIN-HOME',
    hostfullyId: 'dbcfdc5c-b09d-4fa6-999d-fe902aa192a9',
    address: '5306 Kin, San Antonio, TX',
    type: 'home',
    locks: [{ sifelyLockId: 24572924, sifelyLockName: '5306A-KIN-HOME-FRONT-DOOR' }],
  },
  {
    name: '5306-KIN-BUNDLE',
    hostfullyId: 'c960c8d2-9a51-49d8-bb48-355a7bfbe7e2',
    address: '5306 Kin, San Antonio, TX',
    type: 'bundle',
    locks: [
      { sifelyLockId: 24572818, sifelyLockName: '5306-KIN-PATIO-DOOR' },
      { sifelyLockId: 24572672, sifelyLockName: '5306-KIN-FRONT-DOOR' },
    ],
    note: 'Test property used for code-rotation testing',
  },
];

// 3. Locks to add to existing listings
const additionalLocksPerListing = {
  // 407-GEV: add back door to HOME and BUNDLE
  '407-GEV-HOME': [{ sifelyLockId: 12756118, sifelyLockName: '407-GEV-BACK-DOOR' }],
  '407-GEV-BUNDLE': [{ sifelyLockId: 12756118, sifelyLockName: '407-GEV-BACK-DOOR' }],
  // Patio locks: HOME + all rooms
  // 7213-NUT patio (NUT-HOME is an additionalListing — only add to the vlre-hub room listings)
  '7213-NUT-1': [{ sifelyLockId: 5440142, sifelyLockName: '7213-NUT-PATIO-DOOR' }],
  '7213-NUT-2': [{ sifelyLockId: 5440142, sifelyLockName: '7213-NUT-PATIO-DOOR' }],
  '7213-NUT-3': [{ sifelyLockId: 5440142, sifelyLockName: '7213-NUT-PATIO-DOOR' }],
  // NUT-4 and NUT-5 get patio added via additionalListings locks array below
  // 3420-HOV patio
  '3420-HOV-HOME': [{ sifelyLockId: 5556588, sifelyLockName: '3420-HOV-PATIO-DOOR' }],
  '3420-HOV-1': [{ sifelyLockId: 5556588, sifelyLockName: '3420-HOV-PATIO-DOOR' }],
  '3420-HOV-2': [{ sifelyLockId: 5556588, sifelyLockName: '3420-HOV-PATIO-DOOR' }],
  '3420-HOV-3': [{ sifelyLockId: 5556588, sifelyLockName: '3420-HOV-PATIO-DOOR' }],
};

// Add patio to NUT-4 and NUT-5
additionalListings
  .find((l) => l.name === '7213-NUT-4')
  .locks.push({ sifelyLockId: 5440142, sifelyLockName: '7213-NUT-PATIO-DOOR' });
additionalListings
  .find((l) => l.name === '7213-NUT-5')
  .locks.push({ sifelyLockId: 5440142, sifelyLockName: '7213-NUT-PATIO-DOOR' });

// 4. 1602-BLU note
const apiNotes = {
  '1602-BLU-HOME':
    'Locks exist on same Sifely account (admin@vlrealestate.co) but only visible via pro-server.sifely.com/v3, not app-smart-server.sifely.com. Our sifely-client.ts uses the latter endpoint.',
};

// ============================================================
// MERGE LOGIC
// ============================================================

const assignedLockIds = new Set();

function getLockRole(name) {
  if (/FRONT-DOOR/i.test(name)) return 'FRONT_DOOR';
  if (/BACK-DOOR/i.test(name)) return 'BACK_DOOR';
  if (/PATIO/i.test(name)) return 'PATIO_DOOR';
  if (/ROOM/i.test(name)) return 'ROOM_DOOR';
  return 'COMMON_AREA';
}

function classifyLock(alias) {
  const a = alias.toLowerCase();
  if (a.includes('pantry')) return 'pantry';
  if (a.includes('closet')) return 'closet';
  if (a.includes('garage')) return 'garage';
  if (a.includes('patio')) return 'patio';
  if (a.includes('storage')) return 'storage';
  if (a.includes('laundry')) return 'laundry';
  if (a.includes('room')) return 'room';
  if (a.includes('front door') || a.includes('frontdoor') || a.includes('front-door'))
    return 'front-door';
  if (a.includes('back door') || a.includes('backdoor') || a.includes('back-door'))
    return 'back-door';
  if (a.includes('loft')) return 'loft';
  if (a.includes('personal')) return 'personal';
  return 'unknown';
}

function inferProperty(alias) {
  const a = alias.toLowerCase();
  const m = a.match(/^(\d{3,4})[- ]?([a-z]{3})/);
  if (m) return `${m[1]}-${m[2]}`;
  if (a.includes('nutria')) return '7213-nut';
  if (a.includes('hovenweep')) return '3420-hov';
  return null;
}

function buildLockEntry(lock) {
  let id = Number(lock.sifelyLockId);

  // Apply replacements
  if (lockReplacements.has(id)) {
    const newId = lockReplacements.get(id);
    const sifely = lockLookup.get(newId);
    assignedLockIds.add(newId);
    return {
      sifelyLockId: newId,
      assignedName: lock.sifelyLockName,
      lockRole: getLockRole(lock.sifelyLockName),
      sifelyAlias: sifely ? sifely.lockAlias || sifely.sifelyAlias : null,
      battery: sifely ? sifely.battery : null,
      hasGateway: sifely ? sifely.hasGateway : null,
      lockMac: sifely ? sifely.lockMac : null,
      passcodes: sifely ? sifely.passcodes || [] : [],
      sifelyDataAvailable: !!sifely,
      replacedOldLockId: id,
    };
  }

  const sifely = lockLookup.get(id);
  assignedLockIds.add(id);
  return {
    sifelyLockId: id,
    assignedName: lock.sifelyLockName,
    lockRole: getLockRole(lock.sifelyLockName),
    sifelyAlias: sifely ? sifely.lockAlias || sifely.sifelyAlias : null,
    battery: sifely ? sifely.battery : null,
    hasGateway: sifely ? sifely.hasGateway : null,
    lockMac: sifely ? sifely.lockMac : null,
    passcodes: sifely ? sifely.passcodes || [] : [],
    sifelyDataAvailable: !!sifely,
  };
}

// Build listings from vlre-hub
const listings = {};
for (const prop of hub.properties) {
  const entry = {
    hostfullyId: prop.hostfullyId,
    address: prop.address,
    type: prop.type,
    locks: [],
  };

  for (const lock of prop.locks) {
    entry.locks.push(buildLockEntry(lock));
  }

  // Add any additional locks from interview
  const extras = additionalLocksPerListing[prop.name];
  if (extras) {
    for (const lock of extras) {
      entry.locks.push(buildLockEntry(lock));
    }
  }

  // Add API note if applicable
  if (apiNotes[prop.name]) {
    entry.note = apiNotes[prop.name];
  }

  listings[prop.name] = entry;
}

// Add new listings from interview
for (const prop of additionalListings) {
  const entry = {
    hostfullyId: prop.hostfullyId,
    address: prop.address,
    type: prop.type,
    locks: [],
  };
  if (prop.note) entry.note = prop.note;

  for (const lock of prop.locks) {
    entry.locks.push(buildLockEntry(lock));
  }

  listings[prop.name] = entry;
}

// Build unassigned locks (everything not assigned to any listing)
const unassignedLocks = [];
for (const [id, lock] of lockLookup.entries()) {
  if (!assignedLockIds.has(id)) {
    unassignedLocks.push({
      lockId: id,
      lockAlias: lock.lockAlias || lock.sifelyAlias || `unknown-${id}`,
      inferredProperty: inferProperty(lock.lockAlias || lock.sifelyAlias || ''),
      category: classifyLock(lock.lockAlias || lock.sifelyAlias || ''),
      battery: lock.battery,
      hasGateway: lock.hasGateway,
      lockMac: lock.lockMac,
      passcodes: lock.passcodes || [],
    });
  }
}

// Replaced locks (for reference — old IDs no longer on Sifely)
const replacedLocks = [
  {
    listing: '219-PAU-HOME',
    oldLockId: 5280922,
    oldLockName: '219-PAU-HOME-FRONT-DOOR',
    newLockId: 25762100,
    newLockAlias: '219-pau Front door (new)',
    status: 'confirmed-replaced',
  },
  {
    listing: '407-GEV-BUNDLE / 407-GEV-LOFT',
    oldLockId: 8500612,
    oldLockName: '407-GEV-LOFT-FRONT-DOOR',
    newLockId: 31136280,
    newLockAlias: '407-Gev-Loft-official',
    status: 'confirmed-replaced',
  },
  {
    listing: '1602-BLU-HOME',
    oldLockId: 16559198,
    oldLockName: '1602-BLU-FRONT-DOOR',
    newLockId: null,
    newLockAlias: null,
    status: 'exists-on-different-api-endpoint',
    note: 'Visible via pro-server.sifely.com/v3 but not app-smart-server.sifely.com',
  },
  {
    listing: '1602-BLU-HOME',
    oldLockId: 16559224,
    oldLockName: '1602-BLU-BACK-DOOR',
    newLockId: null,
    newLockAlias: null,
    status: 'exists-on-different-api-endpoint',
    note: 'Visible via pro-server.sifely.com/v3 but not app-smart-server.sifely.com',
  },
];

// Summary
const uniqueAssigned = new Set();
for (const listing of Object.values(listings)) {
  for (const lock of listing.locks) {
    if (lock.sifelyDataAvailable) uniqueAssigned.add(lock.sifelyLockId);
  }
}

const output = {
  generatedAt: new Date().toISOString(),
  dataSources: {
    structure: 'vlre-hub/apps/api/src/data/properties.json + interview corrections',
    enrichment: 'Sifely API query (2026-05-14) via app-smart-server.sifely.com',
  },
  interviewCorrections: [
    'Replaced 219-PAU front door: 5280922 → 25762100',
    'Replaced 407-GEV loft door: 8500612 → 31136280',
    'Added 407-GEV back door (12756118) to HOME + BUNDLE',
    'Added listings: 7213-NUT-4, 7213-NUT-5 (rooms not in vlre-hub)',
    'Added listings: 5306A-KIN-HOME, 5306-KIN-BUNDLE (property not in vlre-hub)',
    'Added 7213-NUT rooms 4+5 to 7213-NUT-HOME',
    'Added patio locks to HOME + all rooms for 7213-NUT and 3420-HOV',
    '1602-BLU locks confirmed on same account but different API endpoint (pro-server)',
    'Orphaned locks (3) confirmed as spare/test',
    'Utility locks (non-patio) intentionally excluded from listings',
  ],
  summary: {
    totalListings: Object.keys(listings).length,
    totalSifelyLocksQueried: lockLookup.size,
    uniqueLocksAssignedWithData: uniqueAssigned.size,
    unassignedLocks: unassignedLocks.length,
    replacedLocks: replacedLocks.length,
  },
  listings,
  unassignedLocks,
  replacedLocks,
};

const outPath =
  '/Users/victordozal/repos/dozal-devs/ai-employee/docs/guides/2026-05-13-2150-property-lock-passcode-map.json';
writeFileSync(outPath, JSON.stringify(output, null, 2));

console.log('Written to', outPath);
console.log('Listings:', Object.keys(listings).length);
console.log('Unique locks assigned (with Sifely data):', uniqueAssigned.size);
console.log('Unassigned locks:', unassignedLocks.length);
console.log('Replaced locks:', replacedLocks.length);
console.log('\nNew listings added:', additionalListings.map((l) => l.name).join(', '));
console.log('Listings with extra locks:', Object.keys(additionalLocksPerListing).join(', '));
