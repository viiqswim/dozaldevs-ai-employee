-- CreateTable
CREATE TABLE "composio_connections" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "toolkit" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnected_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "composio_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_composio_calls" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "toolkit" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "called_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_composio_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "composio_connections_tenant_id_toolkit_key" ON "composio_connections"("tenant_id", "toolkit");

-- CreateIndex
CREATE INDEX "composio_connections_tenant_id_idx" ON "composio_connections"("tenant_id");

-- CreateIndex
CREATE INDEX "task_composio_calls_task_id_idx" ON "task_composio_calls"("task_id");

-- CreateIndex
CREATE INDEX "task_composio_calls_tenant_id_idx" ON "task_composio_calls"("tenant_id");
