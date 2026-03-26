import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Wrap both upserts in a transaction for atomicity
  const [agentVersion, project] = await prisma.$transaction([
    prisma.agentVersion.upsert({
      where: { id: '00000000-0000-0000-0000-000000000002' },
      create: {
        id: '00000000-0000-0000-0000-000000000002',
        prompt_hash: 'initial-v1',
        model_id: 'anthropic/claude-sonnet-4',
        tool_config_hash: 'initial-v1',
        changelog_note: 'Initial agent version for MVP testing',
        is_active: true,
      },
      update: {
        prompt_hash: 'initial-v1',
        model_id: 'anthropic/claude-sonnet-4',
        tool_config_hash: 'initial-v1',
        changelog_note: 'Initial agent version for MVP testing',
        is_active: true,
      },
    }),
    prisma.project.upsert({
      where: { id: '00000000-0000-0000-0000-000000000003' },
      create: {
        id: '00000000-0000-0000-0000-000000000003',
        name: 'test-project',
        repo_url: 'https://github.com/your-org/your-test-repo',
        default_branch: 'main',
        concurrency_limit: 3,
      },
      update: {
        name: 'test-project',
        repo_url: 'https://github.com/your-org/your-test-repo',
        default_branch: 'main',
        concurrency_limit: 3,
      },
    }),
  ]);

  console.log(`✅ AgentVersion upserted: ${agentVersion.id} (model: ${agentVersion.model_id})`);
  console.log(`✅ Project upserted: ${project.id} (repo: ${project.repo_url})`);

  console.log('✅ Seeding complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
