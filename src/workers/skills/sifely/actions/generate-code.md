# generate-code

**Description**: Generates a memorable 4–6 digit lock code using mirror (ABBA) or rhythm (ABAB) patterns, excluding weak or previously used codes.

**Invocation**: `tsx /tools/sifely/generate-code.ts [flags]`

**Environment variables**: None

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--length` | optional | Constrain output to a specific code length (4, 5, or 6) |
| `--exclude-codes` | optional | Comma-separated list of codes to exclude (for rotation) |
