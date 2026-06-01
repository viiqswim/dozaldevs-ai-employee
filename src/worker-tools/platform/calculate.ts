#!/usr/bin/env tsx
/**
 * calculate.ts — Safe arithmetic expression evaluator
 *
 * Usage: tsx /tools/platform/calculate.ts --expression "25+25+25+90+90+25"
 * Output: { "result": 280 }
 *
 * Supports: + - * / ( ) decimal numbers and spaces only.
 * Rejects: any characters outside that set (no eval injection).
 *
 * No external API calls. No mock mode needed (pure computation).
 */

function parseArgs(argv: string[]): { expression: string | null; help: boolean } {
  const args = argv.slice(2);
  let expression: string | null = null;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--expression' && args[i + 1] !== undefined) {
      expression = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      help = true;
    }
  }

  return { expression, help };
}

async function main(): Promise<void> {
  const { expression, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx /tools/platform/calculate.ts --expression "<arithmetic>"\n\n' +
        'Safely evaluates an arithmetic expression and returns the result as JSON.\n\n' +
        'Options:\n' +
        '  --expression  Arithmetic expression (supports +, -, *, /, (, ), decimal numbers)\n' +
        '  --help        Show this help\n\n' +
        'Output:\n' +
        '  { "result": <number> }\n\n' +
        'Examples:\n' +
        '  calculate.ts --expression "25+25+25+90+90+25"\n' +
        '  → { "result": 280 }\n\n' +
        '  calculate.ts --expression "90*2 + 25*4"\n' +
        '  → { "result": 280 }\n',
    );
    process.exit(0);
  }

  if (!expression) {
    process.stderr.write('Error: --expression is required\n');
    process.stderr.write('Run with --help for usage.\n');
    process.exit(1);
  }

  // Safety check: only allow digits, spaces, and basic arithmetic operators
  const safe = /^[\d\s\+\-\*\/\.\(\)]+$/.test(expression.trim());
  if (!safe) {
    process.stderr.write(
      'Error: expression contains invalid characters. Only digits, spaces, +, -, *, /, (, ) are allowed.\n',
    );
    process.exit(1);
  }

  let result: number;
  try {
    // eslint-disable-next-line no-new-func
    result = Function(`"use strict"; return (${expression.trim()})`)() as number;
  } catch {
    process.stderr.write('Error: could not evaluate expression\n');
    process.exit(1);
  }

  if (typeof result !== 'number' || !Number.isFinite(result)) {
    process.stderr.write('Error: expression did not produce a finite number\n');
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({ result }) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
