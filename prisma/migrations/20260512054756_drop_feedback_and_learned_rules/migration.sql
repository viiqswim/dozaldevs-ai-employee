/*
  Warnings:

  - You are about to drop the `feedback` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `learned_rules` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "feedback" DROP CONSTRAINT "feedback_agent_version_id_fkey";

-- DropForeignKey
ALTER TABLE "feedback" DROP CONSTRAINT "feedback_task_id_fkey";

-- DropForeignKey
ALTER TABLE "feedback" DROP CONSTRAINT "feedback_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "learned_rules" DROP CONSTRAINT "learned_rules_tenant_id_fkey";

-- DropTable
DROP TABLE "feedback";

-- DropTable
DROP TABLE "learned_rules";
