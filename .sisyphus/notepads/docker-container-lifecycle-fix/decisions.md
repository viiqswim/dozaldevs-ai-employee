# Decisions — docker-container-lifecycle-fix

## Session started: 2026-05-06T13:36:47Z

## D1: Pre-cleanup location

Decision: `docker rm -f` inside `runLocalDockerContainer()` (not at call sites)
Rationale: Single change covers all 3 spawn sites; keeps call sites clean

## D2: Two-step shutdown

Decision: `docker stop` THEN `docker rm -f` (not just `docker rm -f`)
Rationale: `docker stop` sends SIGTERM first → SIGTERM handler in harness patches task to Failed → graceful exit

## D3: Delivery retry — same name + inter-attempt cleanup

Decision: Keep same container name, add stopLocalDockerContainer() before each retry attempt (attempt > 0)
Rationale: Simpler than unique names; matches existing naming convention

## D4: Helper function name

Decision: `stopLocalDockerContainer(name: string): void`
Rationale: Mirrors `runLocalDockerContainer` naming convention; employee-agnostic
