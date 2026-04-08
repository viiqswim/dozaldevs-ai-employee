import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Testing unique constraint on projects(jira_project_key, tenant_id)...\n');

  const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';

  try {
    // First, try to create a project with a unique jira_project_key
    console.log('✓ Creating first project with jira_project_key="UNIQUE_TEST"...');
    const project1 = await prisma.project.create({
      data: {
        name: 'Unique Test Project 1',
        repo_url: 'https://github.com/test/repo1',
        jira_project_key: 'UNIQUE_TEST',
        tenant_id: SYSTEM_TENANT_ID,
      },
    });
    console.log(`  Created: ${project1.id}\n`);

    // Now try to create a duplicate — should fail with P2002
    console.log(
      '✗ Attempting to create duplicate project with same jira_project_key and tenant_id...',
    );
    try {
      const project2 = await prisma.project.create({
        data: {
          name: 'Unique Test Project 2 (should fail)',
          repo_url: 'https://github.com/test/repo2',
          jira_project_key: 'UNIQUE_TEST',
          tenant_id: SYSTEM_TENANT_ID,
        },
      });
      console.error('  ❌ ERROR: Duplicate was allowed! Constraint not working.');
      process.exit(1);
    } catch (error: any) {
      if (error.code === 'P2002') {
        console.log(`  ✓ Correctly rejected with P2002 (unique constraint violation)`);
        console.log(`    Message: ${error.message}\n`);
      } else {
        console.error(`  ❌ Unexpected error code: ${error.code}`);
        console.error(`    Message: ${error.message}`);
        process.exit(1);
      }
    }

    // Verify that different jira_project_keys are allowed
    console.log('✓ Creating second project with different jira_project_key="DIFFERENT_KEY"...');
    const project3 = await prisma.project.create({
      data: {
        name: 'Unique Test Project 3',
        repo_url: 'https://github.com/test/repo3',
        jira_project_key: 'DIFFERENT_KEY',
        tenant_id: SYSTEM_TENANT_ID,
      },
    });
    console.log(`  Created: ${project3.id}\n`);

    // Verify that same jira_project_key with different tenant is allowed
    const OTHER_TENANT_ID = '00000000-0000-0000-0000-000000000099';
    console.log(`✓ Creating project with same jira_project_key but different tenant_id...`);
    const project4 = await prisma.project.create({
      data: {
        name: 'Unique Test Project 4',
        repo_url: 'https://github.com/test/repo4',
        jira_project_key: 'UNIQUE_TEST',
        tenant_id: OTHER_TENANT_ID,
      },
    });
    console.log(`  Created: ${project4.id}\n`);

    console.log('✅ All constraint tests passed!');

    // Cleanup
    console.log('\nCleaning up test data...');
    await prisma.project.deleteMany({
      where: {
        jira_project_key: { in: ['UNIQUE_TEST', 'DIFFERENT_KEY'] },
      },
    });
    console.log('✓ Cleanup complete.');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
