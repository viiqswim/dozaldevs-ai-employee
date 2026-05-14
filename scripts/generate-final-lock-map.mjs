import { readFileSync, writeFileSync } from 'fs';

const src = JSON.parse(
  readFileSync(
    '/Users/victordozal/repos/dozal-devs/ai-employee/docs/guides/2026-05-13-2150-property-lock-passcode-map.json',
    'utf8',
  ),
);

// Build normalized lockDetails — one entry per unique lockId
const lockDetails = {};

for (const listing of Object.values(src.listings)) {
  for (const lock of listing.locks) {
    const id = lock.sifelyLockId;
    if (!lockDetails[id] && lock.sifelyDataAvailable) {
      lockDetails[id] = {
        alias: lock.sifelyAlias,
        battery: lock.battery,
        hasGateway: lock.hasGateway,
        lockMac: lock.lockMac,
        passcodes: lock.passcodes ?? [],
      };
    }
  }
}

// Build clean listings — lock IDs + roles only
const listings = {};
for (const [name, listing] of Object.entries(src.listings)) {
  const entry = {
    hostfullyId: listing.hostfullyId,
    address: listing.address,
    type: listing.type,
    locks: listing.locks.map((lock) => {
      const out = {
        lockId: lock.sifelyLockId,
        name: lock.assignedName,
        role: lock.lockRole,
      };
      if (lock.replacedOldLockId) out.replacedOldLockId = lock.replacedOldLockId;
      if (!lock.sifelyDataAvailable) out.sifelyDataMissing = true;
      return out;
    }),
  };
  if (listing.note) entry.note = listing.note;
  listings[name] = entry;
}

// Build unassigned locks with full detail — filter out ghost entries (replaced locks
// that no longer exist on Sifely and have no live data)
const unassignedLocks = src.unassignedLocks
  .filter((lock) => lock.battery !== null)
  .map((lock) => ({
    lockId: lock.lockId,
    alias: lock.lockAlias,
    category: lock.category,
    inferredProperty: lock.inferredProperty,
    battery: lock.battery,
    hasGateway: lock.hasGateway,
    lockMac: lock.lockMac,
    passcodes: lock.passcodes ?? [],
  }));

// Summary
const uniqueLockIds = new Set(
  Object.values(listings).flatMap((l) => l.locks.map((lk) => lk.lockId)),
);

const output = {
  generatedAt: new Date().toISOString(),
  summary: {
    totalListings: Object.keys(listings).length,
    totalAssignedLocks: uniqueLockIds.size,
    totalUnassignedLocks: unassignedLocks.length,
    lockDetailsAvailable: Object.keys(lockDetails).length,
  },
  listings,
  lockDetails,
  unassignedLocks,
};

const outPath =
  '/Users/victordozal/repos/dozal-devs/ai-employee/docs/guides/2026-05-13-2150-vlre-lock-map-final.json';
writeFileSync(outPath, JSON.stringify(output, null, 2));

console.log('Written to', outPath);
console.log('Listings:', Object.keys(listings).length);
console.log('Unique lock IDs assigned:', uniqueLockIds.size);
console.log('lockDetails entries:', Object.keys(lockDetails).length);
console.log('Unassigned locks:', unassignedLocks.length);
