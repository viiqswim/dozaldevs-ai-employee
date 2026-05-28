-- AlterTable: rename instructions to execution_instructions, add new template compilation fields
ALTER TABLE "archetypes" RENAME COLUMN "instructions" TO "execution_instructions";

-- AddColumn
ALTER TABLE "archetypes" ADD COLUMN "identity" TEXT;
ALTER TABLE "archetypes" ADD COLUMN "execution_steps" TEXT;
ALTER TABLE "archetypes" ADD COLUMN "delivery_steps" TEXT;
ALTER TABLE "archetypes" ADD COLUMN "temperature" DOUBLE PRECISION DEFAULT 1.0;
