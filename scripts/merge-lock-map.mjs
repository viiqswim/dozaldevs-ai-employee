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
for (const [code, prop] of Object.entries(enrichment.properties)) {
  for (const lock of prop.locks) {
    lockLookup.set(lock.lockId, { ...lock, sourceProperty: code });
  }
}
for (const lock of enrichment.unmatchedLocks) {
  lockLookup.set(lock.lockId, { ...lock, sourceProperty: null });
}

// Track which Sifely lock IDs get assigned to at least one listing
const assignedLockIds = new Set();

// Determine lock role from name
function getLockRole(name) {
  if (/FRONT-DOOR/i.test(name)) return 'FRONT_DOOR';
  if (/BACK-DOOR/i.test(name)) return 'BACK_DOOR';
  if (/ROOM/i.test(name)) return 'ROOM_DOOR';
  return 'COMMON_AREA';
}

// Classify unassigned lock by alias
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

// Infer property code from alias
function inferProperty(alias) {
  const a = alias.toLowerCase();
  // Match patterns like "7213-NUT-...", "3412-SAN-...", "219-pau ..."
  const m = a.match(/^(\d{3,4})[- ]?([a-z]{3})/);
  if (m) return `${m[1]}-${m[2]}`;
  // Special cases
  if (a.includes('nutria')) return '7213-nut';
  if (a.includes('hovenweep')) return '3420-hov';
  return null;
}

// Build listings
const listings = {};
for (const prop of hub.properties) {
  const entry = {
    hostfullyId: prop.hostfullyId,
    address: prop.address,
    type: prop.type,
    locks: [],
  };

  for (const lock of prop.locks) {
    const id = Number(lock.sifelyLockId);
    const sifely = lockLookup.get(id);
    assignedLockIds.add(id);

    entry.locks.push({
      sifelyLockId: id,
      assignedName: lock.sifelyLockName,
      lockRole: getLockRole(lock.sifelyLockName),
      sifelyAlias: sifely ? sifely.lockAlias : null,
      battery: sifely ? sifely.battery : null,
      hasGateway: sifely ? sifely.hasGateway : null,
      lockMac: sifely ? sifely.lockMac : null,
      passcodes: sifely ? sifely.passcodes : [],
      sifelyDataAvailable: !!sifely,
    });
  }

  listings[prop.name] = entry;
}

// Build unassigned locks
const unassignedLocks = [];
for (const [id, lock] of lockLookup.entries()) {
  if (!assignedLockIds.has(id)) {
    unassignedLocks.push({
      lockId: lock.lockId,
      lockAlias: lock.lockAlias,
      inferredProperty: inferProperty(lock.lockAlias),
      category: classifyLock(lock.lockAlias),
      battery: lock.battery,
      hasGateway: lock.hasGateway,
      lockMac: lock.lockMac,
      passcodes: lock.passcodes,
    });
  }
}

// Build replaced locks
const replacedLocks = [
  {
    listing: '219-PAU-HOME',
    hubLockId: 5280922,
    hubLockName: '219-PAU-HOME-FRONT-DOOR',
    probableReplacementId: 25762100,
    probableReplacementAlias: '219-pau Front door (new)',
    reason: 'Lock alias contains "(new)", original ID not found on Sifely',
  },
  {
    listing: '407-GEV-BUNDLE',
    hubLockId: 8500612,
    hubLockName: '407-GEV-LOFT-FRONT-DOOR',
    probableReplacementId: 31136280,
    probableReplacementAlias: '407-Gev-Loft-official',
    reason: 'Lock alias contains "official", original ID not found on Sifely',
  },
  {
    listing: '1602-BLU-HOME',
    hubLockId: 16559198,
    hubLockName: '1602-BLU-FRONT-DOOR',
    probableReplacementId: null,
    probableReplacementAlias: null,
    reason: 'Lock ID not found on Sifely — possibly on a different Sifely account',
  },
  {
    listing: '1602-BLU-HOME',
    hubLockId: 16559224,
    hubLockName: '1602-BLU-BACK-DOOR',
    probableReplacementId: null,
    probableReplacementAlias: null,
    reason: 'Lock ID not found on Sifely — possibly on a different Sifely account',
  },
];

// Count unique assigned lock IDs that have Sifely data
const assignedWithData = [...assignedLockIds].filter((id) => lockLookup.has(id)).length;
const listingsWithoutFullData = Object.values(listings).filter((l) =>
  l.locks.some((lk) => !lk.sifelyDataAvailable),
).length;

const output = {
  generatedAt: new Date().toISOString(),
  dataSources: {
    structure: 'vlre-hub/apps/api/src/data/properties.json',
    enrichment: 'Sifely API query (2026-05-14)',
  },
  summary: {
    totalListings: Object.keys(listings).length,
    totalSifelyLocks: lockLookup.size,
    locksAssignedToListings: assignedWithData,
    locksNotInAnyListing: unassignedLocks.length,
    listingsWithoutSifelyData: listingsWithoutFullData,
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
console.log('Assigned lock IDs (with Sifely data):', assignedWithData);
console.log('Unassigned locks:', unassignedLocks.length);
console.log('Listings missing Sifely data:', listingsWithoutFullData);
console.log('Replaced locks:', replacedLocks.length);
