import { describe, it, expect } from 'vitest';
import {
  generateMemorableCode,
  generateMemorableCodeWithMeta,
  isWeakCode,
  isValidCode,
  describeCode,
  type CodeLength,
} from '../../src/worker-tools/locks/generate-code.js';

describe('generate-code', () => {
  describe('generateMemorableCode', () => {
    it('generates a 4–6 digit numeric string by default', () => {
      for (let i = 0; i < 50; i++) {
        const code = generateMemorableCode();
        expect(code).toMatch(/^\d{4,6}$/);
      }
    });

    it('respects explicit length: 4', () => {
      for (let i = 0; i < 20; i++) {
        expect(generateMemorableCode({ length: 4 })).toMatch(/^\d{4}$/);
      }
    });

    it('respects explicit length: 5', () => {
      for (let i = 0; i < 20; i++) {
        expect(generateMemorableCode({ length: 5 })).toMatch(/^\d{5}$/);
      }
    });

    it('respects explicit length: 6', () => {
      for (let i = 0; i < 20; i++) {
        expect(generateMemorableCode({ length: 6 })).toMatch(/^\d{6}$/);
      }
    });

    it('never generates a weak code in 200 runs', () => {
      for (let i = 0; i < 200; i++) {
        const code = generateMemorableCode();
        expect(isWeakCode(code), `expected "${code}" not to be weak`).toBe(false);
      }
    });

    it('skips a single excluded code (rotation guarantee)', () => {
      const excluded = generateMemorableCode({ length: 4 });
      for (let i = 0; i < 50; i++) {
        const next = generateMemorableCode({ length: 4, excludeCodes: [excluded] });
        expect(next).not.toBe(excluded);
      }
    });

    it('skips multiple excluded codes simultaneously', () => {
      const excluded: string[] = [];
      for (let i = 0; i < 10; i++) {
        excluded.push(generateMemorableCode({ length: 4 }));
      }
      const excludeSet = new Set(excluded);
      for (let i = 0; i < 50; i++) {
        const code = generateMemorableCode({ length: 4, excludeCodes: excluded });
        expect(excludeSet.has(code)).toBe(false);
      }
    });

    it('throws when maxAttempts is 0', () => {
      expect(() => generateMemorableCode({ maxAttempts: 0 })).toThrow(
        /failed to generate a valid memorable code after 0 attempts/i,
      );
    });

    it('throws on invalid length value passed at runtime', () => {
      expect(() => generateMemorableCode({ length: 3 as unknown as CodeLength })).toThrow();
    });
  });

  describe('generateMemorableCodeWithMeta', () => {
    it('returns code, pattern, and length fields', () => {
      const result = generateMemorableCodeWithMeta({ length: 4 });
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('pattern');
      expect(result).toHaveProperty('length');
      expect(result.code).toMatch(/^\d{4}$/);
      expect(['mirror', 'rhythm']).toContain(result.pattern);
      expect(result.length).toBe(4);
    });

    it('code.length always matches reported length field', () => {
      for (let i = 0; i < 30; i++) {
        const result = generateMemorableCodeWithMeta();
        expect(result.code.length).toBe(result.length);
      }
    });

    it('code structure is consistent with reported pattern family (all lengths)', () => {
      for (let i = 0; i < 100; i++) {
        const { code, pattern, length } = generateMemorableCodeWithMeta();
        const c = code.split('');

        if (pattern === 'mirror') {
          if (length === 4) {
            expect(c[0]).toBe(c[3]); // ABBA
            expect(c[1]).toBe(c[2]);
          } else if (length === 5) {
            expect(c[0]).toBe(c[4]); // ABCBA
            expect(c[1]).toBe(c[3]);
          } else {
            expect(c[0]).toBe(c[5]); // ABCCBA
            expect(c[1]).toBe(c[4]);
            expect(c[2]).toBe(c[3]);
          }
        } else {
          if (length === 4) {
            expect(c[0]).toBe(c[2]); // ABAB
            expect(c[1]).toBe(c[3]);
          } else if (length === 5) {
            expect(c[0]).toBe(c[2]); // ABABA
            expect(c[2]).toBe(c[4]);
            expect(c[1]).toBe(c[3]);
          } else {
            const isABABAB = c[0] === c[2] && c[2] === c[4] && c[1] === c[3] && c[3] === c[5];
            const isABCABC = c[0] === c[3] && c[1] === c[4] && c[2] === c[5];
            expect(isABABAB || isABCABC).toBe(true); // ABABAB or ABCABC
          }
        }
      }
    });
  });

  describe('Mirror patterns (Option B)', () => {
    it('mirror-4 (ABBA): every generated 4-digit code is ABBA or ABAB', () => {
      for (let i = 0; i < 100; i++) {
        const code = generateMemorableCode({ length: 4 });
        const [a, b, c, d] = code.split('');
        const isABBA = a === d && b === c;
        const isABAB = a === c && b === d;
        expect(isABBA || isABAB, `"${code}" matches neither ABBA nor ABAB`).toBe(true);
      }
    });

    it('mirror-4 (ABBA): finds an ABBA code in 100 tries with distinct halves', () => {
      let found = false;
      for (let i = 0; i < 100; i++) {
        const code = generateMemorableCode({ length: 4 });
        if (code[0] === code[3] && code[1] === code[2]) {
          expect(code[0]).not.toBe(code[1]);
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('mirror-5 (ABCBA): all 5-digit codes satisfy code[0] === code[4] (both patterns share this)', () => {
      for (let i = 0; i < 50; i++) {
        const code = generateMemorableCode({ length: 5 });
        expect(code[0]).toBe(code[4]);
      }
    });

    it('mirror-5 (ABCBA): finds an ABCBA code with first===last and second===fourth', () => {
      let found = false;
      for (let i = 0; i < 100; i++) {
        const code = generateMemorableCode({ length: 5 });
        if (code[0] === code[4] && code[1] === code[3]) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('mirror-6 (ABCCBA): finds an ABCCBA code in 100 tries', () => {
      let found = false;
      for (let i = 0; i < 100; i++) {
        const code = generateMemorableCode({ length: 6 });
        if (code[0] === code[5] && code[1] === code[4] && code[2] === code[3]) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('known mirror codes are all valid and non-weak', () => {
      const mirrors = ['1221', '3443', '12321', '23432', '123321', '245542'];
      for (const code of mirrors) {
        expect(isValidCode(code, code.length), `"${code}" should be valid`).toBe(true);
        expect(isWeakCode(code), `"${code}" should not be weak`).toBe(false);
      }
    });
  });

  describe('Rhythm patterns (Option C)', () => {
    it('rhythm-4 (ABAB): finds an ABAB code in 100 tries with distinct digits', () => {
      let found = false;
      for (let i = 0; i < 100; i++) {
        const code = generateMemorableCode({ length: 4 });
        if (code[0] === code[2] && code[1] === code[3]) {
          expect(code[0]).not.toBe(code[1]);
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('rhythm-5 (ABABA): finds an ABABA code in 100 tries', () => {
      let found = false;
      for (let i = 0; i < 100; i++) {
        const code = generateMemorableCode({ length: 5 });
        if (code[0] === code[2] && code[2] === code[4] && code[1] === code[3]) {
          expect(code[0]).not.toBe(code[1]);
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('rhythm-6 (ABABAB): finds an ABABAB code in 200 tries', () => {
      let found = false;
      for (let i = 0; i < 200; i++) {
        const code = generateMemorableCode({ length: 6 });
        const isABABAB =
          code[0] === code[2] && code[2] === code[4] && code[1] === code[3] && code[3] === code[5];
        if (isABABAB) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('rhythm-6 (ABCABC): finds an ABCABC code (three distinct digits) in 200 tries', () => {
      let found = false;
      for (let i = 0; i < 200; i++) {
        const code = generateMemorableCode({ length: 6 });
        const isABCABC =
          code[0] === code[3] &&
          code[1] === code[4] &&
          code[2] === code[5] &&
          code[0] !== code[1] &&
          code[1] !== code[2] &&
          code[0] !== code[2];
        if (isABCABC) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('known rhythm codes are all valid and non-weak', () => {
      const rhythms = ['1212', '2323', '12121', '23232', '121212', '232323', '123123'];
      for (const code of rhythms) {
        expect(isValidCode(code, code.length), `"${code}" should be valid`).toBe(true);
        expect(isWeakCode(code), `"${code}" should not be weak`).toBe(false);
      }
    });
  });

  describe('isWeakCode', () => {
    it('rejects all-same-digit codes for all supported lengths', () => {
      expect(isWeakCode('1111')).toBe(true);
      expect(isWeakCode('2222')).toBe(true);
      expect(isWeakCode('0000')).toBe(true);
      expect(isWeakCode('11111')).toBe(true);
      expect(isWeakCode('222222')).toBe(true);
      expect(isWeakCode('999999')).toBe(true);
    });

    it('rejects ascending sequential codes', () => {
      expect(isWeakCode('1234')).toBe(true);
      expect(isWeakCode('2345')).toBe(true);
      expect(isWeakCode('12345')).toBe(true);
      expect(isWeakCode('123456')).toBe(true);
      expect(isWeakCode('234567')).toBe(true);
    });

    it('rejects descending sequential codes', () => {
      expect(isWeakCode('4321')).toBe(true);
      expect(isWeakCode('5432')).toBe(true);
      expect(isWeakCode('54321')).toBe(true);
      expect(isWeakCode('654321')).toBe(true);
      expect(isWeakCode('876543')).toBe(true);
    });

    it('rejects static blacklist entries', () => {
      expect(isWeakCode('0123')).toBe(true);
      expect(isWeakCode('3210')).toBe(true);
      expect(isWeakCode('012345')).toBe(true);
      expect(isWeakCode('543210')).toBe(true);
      expect(isWeakCode('9876')).toBe(true);
      expect(isWeakCode('98765')).toBe(true);
    });

    it('does NOT reject intentional mirror or rhythm pattern codes', () => {
      expect(isWeakCode('1221')).toBe(false);
      expect(isWeakCode('3443')).toBe(false);
      expect(isWeakCode('12321')).toBe(false);
      expect(isWeakCode('123321')).toBe(false);
      expect(isWeakCode('1212')).toBe(false);
      expect(isWeakCode('12121')).toBe(false);
      expect(isWeakCode('121212')).toBe(false);
      expect(isWeakCode('123123')).toBe(false);
    });
  });

  describe('isValidCode', () => {
    it('accepts numeric strings of the expected length', () => {
      expect(isValidCode('1234', 4)).toBe(true);
      expect(isValidCode('12345', 5)).toBe(true);
      expect(isValidCode('123456', 6)).toBe(true);
    });

    it('uses 6 as default length when second argument is omitted', () => {
      expect(isValidCode('123456')).toBe(true);
      expect(isValidCode('12345')).toBe(false);
    });

    it('rejects strings containing non-digit characters', () => {
      expect(isValidCode('12a4', 4)).toBe(false);
      expect(isValidCode('1234-', 5)).toBe(false);
      expect(isValidCode(' 1234', 5)).toBe(false);
    });

    it('rejects strings of wrong length', () => {
      expect(isValidCode('12345', 6)).toBe(false);
      expect(isValidCode('1234567', 6)).toBe(false);
      expect(isValidCode('', 6)).toBe(false);
    });
  });

  describe('describeCode', () => {
    it('describes mirror-4 ABBA codes with "reversed"', () => {
      expect(describeCode('1221')).toContain('reversed');
      expect(describeCode('3443')).toContain('reversed');
    });

    it('describes rhythm-4 ABAB codes with "repeating"', () => {
      expect(describeCode('1212')).toContain('repeating');
      expect(describeCode('2323')).toContain('repeating');
    });

    it('describes mirror-5 ABCBA codes with "back down"', () => {
      expect(describeCode('12321')).toContain('back down');
      expect(describeCode('23432')).toContain('back down');
    });

    it('describes rhythm-5 ABABA codes with "alternating"', () => {
      expect(describeCode('12121')).toContain('alternating');
      expect(describeCode('23232')).toContain('alternating');
    });

    it('describes mirror-6 ABCCBA codes with "backwards"', () => {
      expect(describeCode('123321')).toContain('backwards');
    });

    it('describes rhythm-6 ABABAB codes with "three times"', () => {
      expect(describeCode('121212')).toContain('three times');
      expect(describeCode('232323')).toContain('three times');
    });

    it('describes rhythm-6 ABCABC codes with "twice"', () => {
      expect(describeCode('123123')).toContain('twice');
      expect(describeCode('234234')).toContain('twice');
    });

    it('falls back to "Your code is <code>" for unrecognized patterns', () => {
      const desc = describeCode('11234');
      expect(desc).toContain('11234');
    });
  });
});
