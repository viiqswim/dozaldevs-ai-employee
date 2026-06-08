import { getArg } from '../lib/get-arg.js';

/**
 * Generates memorable 4–6 digit lock codes using mirror (ABBA) and rhythm (ABAB) patterns.
 *
 * Option B — Mirror: ABBA (4), ABCBA (5), ABCCBA (6)
 * Option C — Rhythm: ABAB (4), ABABA (5), ABABAB/ABCABC (6)
 *
 * Ported from vlre-hub/apps/api/src/code-rotation/utils/code-generator.util.ts
 */

/** Supported code lengths: 4, 5, or 6 digits. */
export type CodeLength = 4 | 5 | 6;

/** Pattern family: mirror (ABBA/ABCBA/ABCCBA) or rhythm (ABAB/ABABA/ABABAB). */
export type CodePatternFamily = 'mirror' | 'rhythm';

/**
 * Options for generating a memorable lock code.
 *
 * length       - Desired code length (4, 5, or 6 digits). If omitted, randomly chosen.
 * excludeCodes - Array of codes to skip during generation (for rotation).
 * maxAttempts  - Maximum generation attempts before throwing error (default: 100).
 */
export interface GenerateCodeOptions {
  length?: CodeLength;
  excludeCodes?: string[];
  maxAttempts?: number;
}

const STATIC_WEAK_CODES = new Set([
  '0123',
  '1234',
  '2345',
  '3456',
  '4567',
  '5678',
  '6789',
  '01234',
  '12345',
  '23456',
  '34567',
  '45678',
  '56789',
  '012345',
  '123456',
  '234567',
  '345678',
  '456789',
  '567890',
  '3210',
  '4321',
  '5432',
  '6543',
  '7654',
  '8765',
  '9876',
  '43210',
  '54321',
  '65432',
  '76543',
  '87654',
  '98765',
  '543210',
  '654321',
  '765432',
  '876543',
  '987654',
]);

/**
 * Returns `true` if the code is too obvious to issue.
 *
 * Rejects all-same digits and strict sequential runs (ascending or descending).
 * Intentional Option B/C codes (e.g. 1221, 1212, 121212) are NOT rejected.
 *
 * @param code - Numeric string to evaluate
 * @returns `true` if the code should never be issued
 */
export function isWeakCode(code: string): boolean {
  if (STATIC_WEAK_CODES.has(code)) return true;
  if (/^(\d)\1+$/.test(code)) return true;
  if (isStrictSequence(code, 1)) return true;
  if (isStrictSequence(code, -1)) return true;
  return false;
}

function isStrictSequence(code: string, step: 1 | -1): boolean {
  for (let i = 1; i < code.length; i++) {
    const prev = parseInt(code[i - 1] ?? '0', 10);
    const curr = parseInt(code[i] ?? '0', 10);
    const expected = (((prev + step) % 10) + 10) % 10;
    if (curr !== expected) return false;
  }
  return true;
}

/**
 * Returns `true` if the code is a valid numeric string of exactly `length` digits.
 *
 * @param code   - The code to validate
 * @param length - Expected digit count (default 6)
 * @returns `true` if valid
 */
export function isValidCode(code: string, length: number = 6): boolean {
  return !!code && code.length === length && /^\d+$/.test(code);
}

function randomDigit(): number {
  return Math.floor(Math.random() * 10);
}

function generateMirror4(): string {
  let a: number, b: number;
  do {
    a = randomDigit();
    b = randomDigit();
  } while (a === b);
  return `${String(a)}${String(b)}${String(b)}${String(a)}`;
}

function generateMirror5(): string {
  let a: number, b: number, c: number;
  do {
    a = randomDigit();
    b = randomDigit();
    c = randomDigit();
  } while (a === b && b === c);
  return `${String(a)}${String(b)}${String(c)}${String(b)}${String(a)}`;
}

function generateMirror6(): string {
  let a: number, b: number, c: number;
  do {
    a = randomDigit();
    b = randomDigit();
    c = randomDigit();
  } while (a === b && b === c);
  return `${String(a)}${String(b)}${String(c)}${String(c)}${String(b)}${String(a)}`;
}

function generateRhythm4(): string {
  let a: number, b: number;
  do {
    a = randomDigit();
    b = randomDigit();
  } while (a === b);
  return `${String(a)}${String(b)}${String(a)}${String(b)}`;
}

function generateRhythm5(): string {
  let a: number, b: number;
  do {
    a = randomDigit();
    b = randomDigit();
  } while (a === b);
  return `${String(a)}${String(b)}${String(a)}${String(b)}${String(a)}`;
}

function generateRhythm6(): string {
  if (Math.random() < 0.5) {
    let a: number, b: number;
    do {
      a = randomDigit();
      b = randomDigit();
    } while (a === b);
    return `${String(a)}${String(b)}${String(a)}${String(b)}${String(a)}${String(b)}`;
  } else {
    let a: number, b: number, c: number;
    do {
      a = randomDigit();
      b = randomDigit();
      c = randomDigit();
    } while (a === b || b === c || a === c);
    return `${String(a)}${String(b)}${String(c)}${String(a)}${String(b)}${String(c)}`;
  }
}

const GENERATORS: Record<CodeLength, Record<CodePatternFamily, () => string>> = {
  4: { mirror: generateMirror4, rhythm: generateRhythm4 },
  5: { mirror: generateMirror5, rhythm: generateRhythm5 },
  6: { mirror: generateMirror6, rhythm: generateRhythm6 },
};

const AVAILABLE_LENGTHS: CodeLength[] = [4, 5, 6];
const AVAILABLE_FAMILIES: CodePatternFamily[] = ['mirror', 'rhythm'];

/**
 * Generates a memorable lock code using Option B (mirror) or Option C (rhythm) patterns.
 *
 * Length is randomly chosen from 4, 5, or 6 unless `options.length` is specified.
 * Pattern family (mirror or rhythm) is randomly chosen on each call.
 * Codes in `options.excludeCodes` are skipped, guaranteeing rotation between bookings.
 * Weak codes (all-same digits, strict sequential sequences) are never returned.
 *
 * @param options - Generation options
 * @returns A memorable numeric code string (4–6 digits)
 * @throws Error if no valid code could be generated within `maxAttempts`
 */
export function generateMemorableCode(options: GenerateCodeOptions = {}): string {
  return generateMemorableCodeWithMeta(options).code;
}

/**
 * Generates a memorable lock code and returns the code along with its pattern metadata.
 * Used by the CLI to produce the full JSON output including pattern and length fields.
 *
 * @param options - Generation options
 * @returns Object with code string, pattern family used, and length chosen
 * @throws Error if no valid code could be generated within `maxAttempts`
 */
export function generateMemorableCodeWithMeta(options: GenerateCodeOptions = {}): {
  code: string;
  pattern: CodePatternFamily;
  length: CodeLength;
} {
  const { length, excludeCodes = [], maxAttempts = 100 } = options;
  const excludeSet = new Set(excludeCodes);

  for (let i = 0; i < maxAttempts; i++) {
    const chosenLength: CodeLength =
      length ??
      (AVAILABLE_LENGTHS[Math.floor(Math.random() * AVAILABLE_LENGTHS.length)] as CodeLength);

    const family: CodePatternFamily = AVAILABLE_FAMILIES[
      Math.floor(Math.random() * AVAILABLE_FAMILIES.length)
    ] as CodePatternFamily;

    const code = GENERATORS[chosenLength][family]();

    if (isValidCode(code, chosenLength) && !isWeakCode(code) && !excludeSet.has(code)) {
      return { code, pattern: family, length: chosenLength };
    }
  }

  throw new Error(
    `Failed to generate a valid memorable code after ${String(maxAttempts)} attempts`,
  );
}

/**
 * Returns a human-readable description of the code's pattern for guest communication.
 *
 * @param code - A code generated by {@link generateMemorableCode}
 * @returns A verbal cue string (e.g. "12, 21 — first two digits, then reversed")
 */
export function describeCode(code: string): string {
  const len = code.length;

  if (len === 4) {
    if (code[0] === code[3] && code[1] === code[2])
      return `${code[0] ?? ''}${code[1] ?? ''}, ${code[2] ?? ''}${code[3] ?? ''} — first two digits, then reversed`;
    if (code[0] === code[2] && code[1] === code[3])
      return `${code[0] ?? ''}-${code[1] ?? ''}, ${code[2] ?? ''}-${code[3] ?? ''} — two digits repeating`;
  }

  if (len === 5) {
    if (code[0] === code[2] && code[2] === code[4] && code[1] === code[3])
      return `${code[0] ?? ''}-${code[1] ?? ''}, ${code[2] ?? ''}-${code[3] ?? ''}, ${code[4] ?? ''} — two digits alternating`;
    if (code[0] === code[4] && code[1] === code[3])
      return `${code[0] ?? ''}-${code[1] ?? ''}-${code[2] ?? ''}-${code[3] ?? ''}-${code[4] ?? ''} — counts up then back down`;
  }

  if (len === 6) {
    if (code[0] === code[5] && code[1] === code[4] && code[2] === code[3])
      return `${code[0] ?? ''}${code[1] ?? ''}${code[2] ?? ''}, then backwards — first three digits, then reversed`;
    if (code[0] === code[2] && code[2] === code[4] && code[1] === code[3] && code[3] === code[5])
      return `${code[0] ?? ''}-${code[1] ?? ''}, three times — two digits repeating`;
    if (code[0] === code[3] && code[1] === code[4] && code[2] === code[5])
      return `${code[0] ?? ''}${code[1] ?? ''}${code[2] ?? ''}, twice — three digits repeating`;
  }

  return `Your code is ${code}`;
}

function parseArgs(argv: string[]): {
  length?: string;
  excludeCodes: string[];
  help: boolean;
} {
  const args = argv.slice(2);
  return {
    length: getArg(args, '--length'),
    excludeCodes: (getArg(args, '--exclude-codes') ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
    help: args.includes('--help'),
  };
}

async function main(): Promise<void> {
  const { length: rawLength, excludeCodes, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx generate-code.ts [options]\n' +
        'Generates a memorable 4–6 digit lock code using mirror or rhythm patterns.\n\n' +
        'Options:\n' +
        '  --length <4|5|6>          Constrain output to a specific code length (default: random)\n' +
        '  --exclude-codes <codes>   Comma-separated list of codes to exclude (for rotation)\n' +
        '  --help                    Show this help message\n\n' +
        'Output:\n' +
        '  {"code":"1221","pattern":"mirror","length":4,"description":"12, 21 — first two digits, then reversed"}\n\n' +
        'Patterns:\n' +
        '  mirror  — ABBA (4), ABCBA (5), ABCCBA (6)\n' +
        '  rhythm  — ABAB (4), ABABA (5), ABABAB/ABCABC (6)\n',
    );
    process.exit(0);
  }

  let codeLength: CodeLength | undefined;
  if (rawLength !== undefined) {
    const n = parseInt(rawLength, 10);
    if (n !== 4 && n !== 5 && n !== 6) {
      process.stderr.write(`Error: --length must be 4, 5, or 6 (got "${rawLength}")\n`);
      process.exit(1);
    }
    codeLength = n as CodeLength;
  }

  const result = generateMemorableCodeWithMeta({ length: codeLength, excludeCodes });
  const description = describeCode(result.code);

  process.stdout.write(
    JSON.stringify({
      code: result.code,
      pattern: result.pattern,
      length: result.length,
      description,
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
