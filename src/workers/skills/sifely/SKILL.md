---
name: sifely
description: 'Use when managing Sifely smart lock passcodes — list locks, create/delete/update passcodes, rotate codes, or diagnose guest access issues'
---

# Sifely Shell Tools

Shell tools for the sifely service.
Full CLI contract for each tool is in `actions/<tool-id>.md`.

## Available Tools

| Tool | Description |
|------|-------------|
| list-locks | List all Sifely smart locks accessible to the authenticated account |
| create-passcode | Create a new permanent passcode on a Sifely smart lock |
| delete-passcode | Delete a passcode from a Sifely smart lock by passcode ID |
| list-passcodes | List all passcodes on a Sifely smart lock |
| update-passcode | Update the code value of an existing Sifely passcode |
| list-access-records | List recent access records (unlock/lock events) for a Sifely lock |
| diagnose-access | Cross-references Hostfully door codes against Sifely smart lock passcodes and recent access records to diagnose guest lock access issues. |
| generate-code | Generates a memorable 4–6 digit lock code using mirror (ABBA) or rhythm (ABAB) patterns, excluding weak or previously used codes. |
| rotate-property-code | Rotates the lock code for a single Hostfully property and all its associated Sifely locks, updating both Sifely passcodes and the Hostfully door code field. |
