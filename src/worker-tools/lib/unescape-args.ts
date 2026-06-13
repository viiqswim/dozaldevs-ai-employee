// Converts shell-escaped sequences to real characters.
// LLMs generate commands like --body "Hello\nWorld" where the shell passes literal \+n
// to process.argv — not a real newline. Call this on every free-text arg at parse time.
export function unescapeShellArg(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r');
}
