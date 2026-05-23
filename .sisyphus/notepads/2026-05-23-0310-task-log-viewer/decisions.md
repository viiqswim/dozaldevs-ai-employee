# Decisions — task-log-viewer

## [2026-05-23] Plan Start

### D1: SSE over polling

Use SSE (Server-Sent Events) for real-time streaming — not polling. Gives a true `tail -f` experience.

### D2: fetch + ReadableStream over EventSource

`EventSource` doesn't support custom headers. Use `fetch` with `ReadableStream` and manually parse SSE lines to pass `X-Admin-Key`.

### D3: Execution log only, not delivery log

Delivery log (`employee-delivery-*`) is tiny and less useful for debugging. Only expose execution log.

### D4: Local Docker mode only

No Fly.io log support. Clean scope boundary. Log files only exist locally.

### D5: max-h-96 for log viewer

Terminal box max height: `max-h-96` (384px) with `overflow-auto` scroll.

### D6: Active task polling strategy

For active tasks: read existing content first, then poll file every 1s for new lines using file position tracking.

### D7: No new clipboard utility

Use native `navigator.clipboard.writeText()` — no new utility needed.
