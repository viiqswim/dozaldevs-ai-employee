# HF-02 Learnings

## 2026-04-22 Init: Pre-delegation context gathered

### Pattern: validate-env.ts structure (copy exactly)

- `parseArgs(argv: string[])` slices `argv.slice(2)`, loops args
- `main(): Promise<void>` — checks help, validates env, does work
- `main().catch(err => { process.stderr.write(...); process.exit(1) })`
- Uses `process.stdout.write(JSON.stringify(...) + '\n')` for output
- Uses `process.stderr.write('Error: ...\n')` then `process.exit(1)` for errors

### Pattern: test structure (validate-env.test.ts)

- `SCRIPT_PATH = path.resolve(__dirname, '../../../dist/worker-tools/hostfully/validate-env.js')`
  → get-property path: `../../../dist/worker-tools/hostfully/get-property.js`
- `runScript(args, env)` wraps execFile — passes `{ env: { ...process.env, ...env } }`
- For get-property, also need to pass `argv` array as execFile args
- Tests use `describe` + `it` + `expect` from vitest

### Dockerfile structure (lines 63-64)

```
63: RUN mkdir -p /tools/hostfully
64: COPY --from=builder /build/dist/worker-tools/hostfully/validate-env.js /tools/hostfully/validate-env.js
```

→ New line goes AFTER line 64:

```
COPY --from=builder /build/dist/worker-tools/hostfully/get-property.js /tools/hostfully/get-property.js
```

### API Response shapes (verified live)

- `GET /properties/{uid}` → `{ property: { uid, name, propertyType, address: { address, city, state, zipCode, countryCode }, bedrooms, beds, bathrooms, availability: { maxGuests, checkInTimeStart, checkOutTime }, wifiNetwork, wifiPassword, bookingNotes, extraNotes, guideBookUrl, ... } }`
- `GET /amenities?propertyUid={uid}` → `{ amenities: [{ uid, amenity: "HAS_BODY_SOAP", category, description, price }], _metadata: { count } }`
- `GET /property-rules?propertyUid={uid}` → `{ propertyRules: [{ uid, rule, propertyUid, description }], _metadata: { count } }`

### Test property

- UID: `dac5a0e0-3984-4f72-b622-de45a9dd758f`
- Name: `1602-BLU-HOME`, Bailey CO, CABIN, 3BR, 8 maxGuests
- checkInTime: 16, checkOutTime: 11
- wifiNetwork: `PrincessLucy`
- 49 amenities, 1 house rule (IS_FAMILY_FRIENDLY)

### VLRE API Key

- `Y6EQ7KgSwoOGCokD` — confirmed valid, tested live during HF-01

### Key constraints

- NO retry logic, NO caching, NO pagination
- NO npm dependencies — pure Node 20 native fetch
- NO extra CLI flags beyond --property-id and --help
- NO exported types or barrel files
- Absent fields → null (not undefined, not omitted)
- Amenities/rules failure → graceful degrade (empty array + stderr warning)
- Property failure → hard exit 1
