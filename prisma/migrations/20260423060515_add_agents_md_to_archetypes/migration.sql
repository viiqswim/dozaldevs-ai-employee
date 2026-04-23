-- AlterTable
ALTER TABLE "archetypes" ADD COLUMN     "agents_md" TEXT;

-- AlterTable
ALTER TABLE "system_events" ALTER COLUMN "id" DROP DEFAULT;
