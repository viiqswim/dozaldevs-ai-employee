# Inngest Architecture Validation Report
**Date**: 2026-03-25  
**Status**: READ-ONLY ANALYSIS (Prometheus Planning Phase)

---

## EXECUTIVE SUMMARY

Inngest is **well-suited** for your architecture with important caveats around long-running tasks (20-90 min) and external compute orchestration. The platform excels at durable execution and concurrency control but has specific limitations for your use case.

**Key Finding**: Inngest's step-level timeout of **2 hours max** supports your 20-90 minute engineering tasks, but orchestrating external Fly.io compute requires careful pattern design using `step.waitForEvent()`.

---

## 1. CONCURRENCY CONTROL CAPABILITIES

### ✅ Per-Key Concurrency Limits (FULLY SUPPORTED)

Inngest provides **exactly what you need** for multi-tenant concurrency:

**Primitive**: `concurrency` with `key` expression

```typescript
inngest.createFunction(
  {
    id: "engineering-task",
    concurrency: [
      {
        key: "event.data.projectId",  // Per-project limit
        limit: 3,                       // Max 3 concurrent tasks per project
        scope: "fn"                     // Function-level scope
      }
    ],
    triggers: { event: "task/engineering.requested" }
  },
  async ({ event, step }) => { /* ... */ }
);
```

**Evidence**: https://www.inngest.com/docs/guides/concurrency#concurrency-keys-multi-tenant-concurrency

### Key Characteristics:

- **Scope Options**: `fn` (function-level), `env` (environment-level), `account` (global)
- **Multiple Limits**: Can combine up to **2 concurrency constraints** per function
- **Virtual Queues**: Each unique key value gets its own queue (FIFO ordering within queue)
- **Step-Level Enforcement**: Limits active step execution, NOT function runs in progress
  - A function sleeping/waiting doesn't consume concurrency capacity
  - You can have 100s of function runs in progress with concurrency limit of 3

### Limitation:
- **Max concurrency limit** depends on your billing plan (check dashboard)
- **Concurrency + Batching Incompatibility**: If you use `concurrency.key`, it's **ignored when batching is enabled**

---

## 2. STEP-LEVEL CHECKPOINTING & DURABLE EXECUTION

### ✅ What Survives a Crash

**Memoization Model**: Each step result is persisted independently

**Survives**:
- ✅ Step output data (up to 4MB per step)
- ✅ Function run state (up to 32MB total across all steps)
- ✅ Step execution history (which steps completed)
- ✅ Retry count and error logs

**Does NOT Survive** (re-executed on retry):
- ❌ In-memory variables between steps
- ❌ Non-deterministic logic (API calls, DB queries) — must be in `step.run()`
- ❌ Side effects outside steps

**Evidence**: https://www.inngest.com/docs/learn/how-functions-are-executed

### Execution Model:

1. **Initial Run**: Execute step 1, return result to Inngest
2. **Retry/Resume**: Re-execute function from start, but SDK injects previous step results (memoization)
3. **Each step is a separate HTTP request** to Inngest

### Critical for Your Architecture:
- If a Fly.io machine crashes mid-task, Inngest will retry the entire function
- You must wrap external compute dispatch in `step.run()` to ensure idempotency
- Use `step.waitForEvent()` to wait for Fly.io task completion (see section 7)

---

## 3. EVENT BATCHING & THROTTLING CAPABILITIES

### ✅ Batching (Event-Level)

**Configuration**:
```typescript
inngest.createFunction(
  {
    id: "batch-processor",
    batchEvents: {
      maxSize: 100,           // Max events per batch
      timeout: "5s",          // Wait up to 5s for batch to fill
      key: "event.data.userId", // Optional: batch per user
      if: "event.data.priority == 'high'" // Optional: conditional batching
    },
    triggers: { event: "data/import.requested" }
  },
  async ({ events, step }) => {
    // events is an array
  }
);
```

**Limits**:
- Max batch size: **100 events** (configurable per plan)
- Hard limit: **10 MiB** batch size (regardless of timeout/maxSize)
- Timeout range: **1s to 60s**

**Evidence**: https://www.inngest.com/docs/guides/batching

### ✅ Throttling (Function Run Rate)

**Configuration**:
```typescript
inngest.createFunction(
  {
    id: "api-caller",
    throttle: {
      limit: 10,           // 10 runs per period
      period: "1m",        // Per minute
      burst: 2,            // Allow 2 extra in burst
      key: "event.data.apiKey" // Optional: per-key throttling
    },
    triggers: { event: "api/call.requested" }
  },
  async ({ event, step }) => { /* ... */ }
);
```

**Characteristics**:
- Uses **Generic Cell Rate Algorithm (GCRA)**
- Limits **function run starts**, not step execution
- FIFO ordering (first enqueued = first to start)
- Period range: **1s to 7d**

**Evidence**: https://www.inngest.com/docs/guides/throttling

### ⚠️ Batching + Concurrency Incompatibility:
- **Concurrency keys are IGNORED when batching is enabled**
- If you need per-key concurrency with batching, process events individually instead

---

## 4. LONG-RUNNING TASKS (20-90 MINUTES)

### ✅ Supported with Caveats

**Step Timeout Limit**: **2 hours maximum** per step

```typescript
inngest.createFunction(
  {
    id: "long-engineering-task",
    timeouts: {
      finish: "90m" // Max execution time after starting
    },
    triggers: { event: "task/engineering.requested" }
  },
  async ({ event, step }) => {
    const result = await step.run("execute-task", async () => {
      // This step can run up to 2 hours
      return await executeEngineeringTask(event.data);
    });
  }
);
```

**Evidence**: https://www.inngest.com/docs/usage-limits/inngest

### Key Considerations:

1. **Sleep Duration**: Up to **1 year** (free plan: 7 days)
   - `step.sleep()` and `step.sleepUntil()` don't count against timeout
   - Useful for scheduling retries or delays

2. **Checkpointing Optimization** (NEW in v4):
   - Enabled by default in TypeScript SDK v4
   - Executes steps eagerly on your server instead of round-tripping to Inngest
   - **Reduces inter-step latency from ~120ms to <5ms**
   - Ideal for AI workflows with many steps

3. **Serverless Platform Limits**:
   - Vercel: 10s (hobby) / 300s (pro) / 900s (pro+)
   - Lambda: 15 minutes max
   - **Solution**: Use checkpointing + persistent connection (Inngest Connect) for servers

**Evidence**: https://www.inngest.com/docs/setup/checkpointing

---

## 5. FUNCTION TIMEOUT LIMITS

### Hard Limits by Hosting Provider

| Provider | Max Duration | Inngest Support |
|----------|-------------|-----------------|
| Vercel (Hobby) | 10s | ❌ Too short |
| Vercel (Pro) | 300s (5m) | ⚠️ Limited |
| Vercel (Pro+) | 900s (15m) | ⚠️ Limited |
| AWS Lambda | 900s (15m) | ⚠️ Limited |
| Fly.io | Configurable | ✅ Supports 2h |
| Always-on servers | Unlimited | ✅ Supports 2h |

### Inngest's Solution:

**Checkpointing + Connect** (for servers like Fly.io):
- Establishes persistent outbound connection
- Steps execute on your server, not via HTTP round-trips
- Supports full 2-hour step timeout
- Inter-step latency: <5ms (vs ~120ms standard)

**Evidence**: https://www.inngest.com/blog/eliminating-latency-ai-workflows

---

## 6. FAILURE & RETRY POLICY

### Default Retry Behavior

```typescript
inngest.createFunction(
  {
    id: "task-with-retries",
    retries: 4,  // Default: 4 retries (0-20 configurable)
    triggers: { event: "task/requested" }
  },
  async ({ event, step, attempt }) => {
    // attempt: 0 (first), 1 (first retry), etc.
  }
);
```

**Retry Strategy**:
- **Exponential backoff** (default)
- **Per-step retry isolation**: Failed step retries independently
- **Memoization**: Previous successful steps are NOT re-executed

### Error Handling

```typescript
inngest.createFunction(
  {
    id: "task-with-error-handling",
    retries: 3,
    onFailure: async ({ event, error, attempt }) => {
      // Called after all retries exhausted
      await notifySlack(`Task failed: ${error.message}`);
    },
    triggers: { event: "task/requested" }
  },
  async ({ event, step }) => {
    try {
      await step.run("critical-step", async () => {
        return await criticalOperation();
      });
    } catch (error) {
      // Handle step failure
      await step.run("rollback", async () => {
        await rollbackChanges();
      });
      throw error; // Propagate to trigger onFailure
    }
  }
);
```

**Evidence**: https://www.inngest.com/docs/guides/error-handling

### System Events for Monitoring

```typescript
inngest.createFunction(
  {
    id: "monitor-failures",
    triggers: { event: "inngest/function.failed" }
  },
  async ({ event, step }) => {
    // event.data.function_id, error, attempt count, etc.
  }
);
```

---

## 7. ORCHESTRATING EXTERNAL COMPUTE (FLY.IO DISPATCH)

### ✅ Supported Pattern: `step.waitForEvent()`

This is the **recommended approach** for your architecture:

```typescript
inngest.createFunction(
  {
    id: "dispatch-engineering-task",
    concurrency: {
      key: "event.data.projectId",
      limit: 3
    },
    triggers: { event: "task/engineering.requested" }
  },
  async ({ event, step }) => {
    // Step 1: Dispatch to Fly.io
    const machineId = await step.run("dispatch-to-fly", async () => {
      const response = await fetch("https://api.machines.dev/...", {
        method: "POST",
        body: JSON.stringify({
          image: "my-app:latest",
          env: { TASK_ID: event.data.taskId }
        })
      });
      return response.json().id;
    });

    // Step 2: Wait for completion (up to 90 minutes)
    const result = await step.waitForEvent("wait-for-completion", {
      event: "task/engineering.completed",
      timeout: "90m",
      if: `async.data.taskId == "${event.data.taskId}"`
    });

    if (!result) {
      // Timeout: task didn't complete in 90 minutes
      throw new Error("Task timeout");
    }

    // Step 3: Process result
    await step.run("process-result", async () => {
      return await saveResult(result.data);
    });
  }
);
```

**How it works**:
1. Inngest dispatches task to Fly.io machine
2. Function pauses at `step.waitForEvent()` (doesn't consume concurrency)
3. Fly.io machine executes task and sends completion event
4. Inngest resumes function with event data
5. If timeout expires, function continues with `null` result

**Evidence**: https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event

### ⚠️ Critical Considerations:

1. **Event Ordering**: `step.waitForEvent()` only listens for events **after** the step executes
   - Race condition: If Fly.io completes before function reaches `waitForEvent()`, event is missed
   - **Solution**: Have Fly.io send completion event with retry logic, or use polling

2. **Idempotency**: Dispatch step must be idempotent
   - If dispatch fails and retries, you might spawn duplicate machines
   - **Solution**: Use event deduplication ID or check for existing machine

3. **Concurrency Behavior**: `step.waitForEvent()` releases concurrency capacity
   - Function run stays in progress but doesn't block other tasks
   - Allows 100s of waiting tasks with concurrency limit of 3

4. **No Built-in Polling**: Inngest doesn't poll external systems
   - Fly.io **must** send event back to Inngest
   - If Fly.io crashes, function waits until timeout

### Alternative: `step.invoke()` (for Inngest functions only)

```typescript
// Only works if Fly.io task is also an Inngest function
const result = await step.invoke("invoke-fly-task", {
  function: flyTaskFunction,
  data: { taskId: event.data.taskId }
});
```

---

## 8. KNOWN LIMITATIONS & ANTI-PATTERNS

### Hard Limits

| Limit | Value | Impact |
|-------|-------|--------|
| Max steps per function | 1,000 | Avoid loops with `step` per item |
| Max step output | 4MB | Large data must be stored externally |
| Max function state | 32MB | Total across all steps |
| Max event payload | 256KB (free) / 3MB (paid) | Compress large payloads |
| Max events per request | 5,000 | Batch fan-out carefully |
| Max batch size | 10 MiB | Hard limit regardless of config |
| Max concurrency constraints | 2 per function | Can't combine 3+ limits |
| Step timeout | 2 hours | Longer tasks need external compute |

### Anti-Patterns to Avoid

1. **❌ Loop with `step` per item**
   ```typescript
   // BAD: Creates 1,000 steps for 1,000 items
   for (const item of items) {
     await step.run(`process-${item.id}`, async () => {
       return await processItem(item);
     });
   }
   
   // GOOD: Process loop inside single step
   await step.run("process-all", async () => {
     return await Promise.all(items.map(processItem));
   });
   ```

2. **❌ Batching + Concurrency Keys**
   - Concurrency keys are ignored when batching enabled
   - Use individual event processing if you need per-key concurrency

3. **❌ Non-deterministic logic outside steps**
   ```typescript
   // BAD: Random value changes on retry
   const random = Math.random();
   await step.run("use-random", async () => {
     return await api.call(random);
   });
   
   // GOOD: Randomness inside step
   await step.run("use-random", async () => {
     const random = Math.random();
     return await api.call(random);
   });
   ```

4. **❌ Relying on `step.waitForEvent()` without retry logic in external system**
   - If external system crashes before sending event, function waits until timeout
   - **Solution**: Implement exponential backoff + retry in Fly.io task

5. **❌ Assuming step execution order across functions**
   - Different functions compete for capacity randomly
   - Only guaranteed FIFO within same function

---

## 9. ARCHITECTURE VALIDATION CHECKLIST

### ✅ Your Architecture Can Support:

- [x] Per-project concurrency limits (max 3 tasks/project)
- [x] 20-90 minute engineering tasks (within 2-hour step limit)
- [x] Dispatching to Fly.io machines
- [x] Waiting for external task completion
- [x] Automatic retries on failure
- [x] Multi-tenant isolation
- [x] Event-driven orchestration

### ⚠️ Requires Careful Implementation:

- [ ] **Race condition handling**: Ensure Fly.io completion event arrives after `step.waitForEvent()` starts listening
- [ ] **Idempotent dispatch**: Retry-safe machine spawning
- [ ] **Timeout handling**: Plan for 90-minute timeout expiry
- [ ] **Error propagation**: Fly.io failures must send events back to Inngest
- [ ] **Concurrency + batching**: Don't mix if you need per-key limits

### ❌ Not Recommended:

- Batching + per-key concurrency (use individual processing)
- Tasks longer than 2 hours (break into sub-tasks)
- Polling external systems (use event-driven pattern)
- Storing large payloads in Inngest (use external storage + references)

---

## 10. RECOMMENDED ARCHITECTURE PATTERN

```typescript
// 1. Dispatch function (orchestrator)
inngest.createFunction(
  {
    id: "dispatch-engineering-task",
    concurrency: {
      key: "event.data.projectId",
      limit: 3
    },
    retries: 2,
    triggers: { event: "task/engineering.requested" }
  },
  async ({ event, step }) => {
    // Idempotent dispatch with deduplication
    const machineId = await step.run("dispatch-to-fly", async () => {
      const dedupeId = `task-${event.data.taskId}`;
      const existing = await checkExistingMachine(dedupeId);
      if (existing) return existing.id;
      
      return await spawnFlyMachine({
        taskId: event.data.taskId,
        projectId: event.data.projectId,
        dedupeId
      });
    });

    // Wait for completion (releases concurrency)
    const result = await step.waitForEvent("wait-completion", {
      event: "task/engineering.completed",
      timeout: "90m",
      if: `async.data.taskId == "${event.data.taskId}"`
    });

    if (!result) {
      throw new Error("Task timeout after 90 minutes");
    }

    // Process result
    await step.run("save-result", async () => {
      return await db.results.insert({
        taskId: event.data.taskId,
        output: result.data.output,
        status: "completed"
      });
    });
  }
);

// 2. Completion handler (receives event from Fly.io)
inngest.createFunction(
  {
    id: "handle-task-completion",
    triggers: { event: "task/engineering.completed" }
  },
  async ({ event, step }) => {
    // Inngest automatically resumes waiting function
    // No additional logic needed here
  }
);

// 3. Failure handler (monitors system events)
inngest.createFunction(
  {
    id: "handle-task-failures",
    triggers: { event: "inngest/function.failed" }
  },
  async ({ event, step }) => {
    if (event.data.function_id === "dispatch-engineering-task") {
      await step.run("notify-failure", async () => {
        await notifySlack({
          taskId: event.data.function_run.data.taskId,
          error: event.data.error.message,
          attempts: event.data.attempt
        });
      });
    }
  }
);
```

---

## 11. PRICING & TIER CONSIDERATIONS

**Concurrency Limits by Plan** (check current pricing):
- Free: Limited concurrency
- Pro: Higher limits
- Enterprise: Custom limits

**Recommendation**: Contact Inngest sales if you need:
- Concurrency limits >100 per key
- Custom event payload sizes
- SLA guarantees

---

## CONCLUSION

**Inngest is suitable for your architecture** with these key points:

1. ✅ **Concurrency control**: Per-project limits work perfectly
2. ✅ **Long-running tasks**: 2-hour limit supports 20-90 min tasks
3. ✅ **External compute**: `step.waitForEvent()` pattern is reliable
4. ⚠️ **Implementation complexity**: Requires careful handling of race conditions and idempotency
5. ⚠️ **Monitoring**: Implement failure handlers and system event listeners

**Next Steps**:
- Implement idempotent dispatch with deduplication
- Add retry logic in Fly.io tasks
- Set up failure monitoring via system events
- Test race conditions in staging environment
- Consider Inngest Connect for <5ms inter-step latency

