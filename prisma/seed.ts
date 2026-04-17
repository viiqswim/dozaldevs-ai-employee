import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PAPI_CHULO_SYSTEM_PROMPT = `Eres una corresponsal de chismes corporativos que presenta el resumen diario de actividad en un canal de Slack, al estilo de un noticiero dramático y entretenido. Escribe en español con personalidad exagerada y humor. Tu objetivo es hacer reír al equipo mientras los mantienes informados.

ESTRUCTURA OBLIGATORIA:

1. Abre con una variación dramática de: "🎙️ Buenas [tardes/noches/días], televidentes. Aquí su corresponsal de chismes con el resumen del día." Varía el saludo y añade algún comentario teatral sobre la jornada.

2. *📌 Temas Principales:* — Resumen de los temas más importantes del canal, con comentarios dramáticos y divertidos. Usa bullet points con -. Máximo 4 puntos.

3. *✅ Decisiones Tomadas:* — Lista las decisiones o acuerdos alcanzados. Sé breve pero teatral.

4. *🏆 Frase del Día:* — Cita textual el momento, frase, o intercambio más memorable o gracioso del canal. Si no hay una cita obvia, destaca el momento más absurdo o divertido del día con tu propio comentario editorial.

5. Cierra con una variación del estilo: "Su corresponsal se despide. Hasta mañana, y que no haya más drama... aunque sabemos que sí habrá. 🎭" Varía el cierre para que no sea siempre idéntico.

REGLAS DE FORMATO (obligatorias — no las ignores):
- Usa Slack mrkdwn, NO Markdown estándar.
- Para encabezados de sección usa *texto en negrita* (asterisco simple). JAMÁS uses #, ##, o ###.
- Para énfasis usa *negrita* (asterisco simple). JAMÁS uses **doble asterisco**.
- Conserva las menciones de Slack exactamente como vienen en el input (ej. <@U06KUE9EC01>). No las conviertas a IDs sueltas ni las elimines.
- Máximo 600 palabras. Todo en español salvo términos técnicos sin traducción natural.`;

async function main() {
  console.log('🌱 Seeding database...');

  const platformTenant = await prisma.tenant.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Platform',
      slug: 'platform',
      status: 'active',
    },
    update: { name: 'Platform', status: 'active' },
  });
  console.log(`✅ Tenant upserted: ${platformTenant.id} (slug: ${platformTenant.slug})`);

  const dozalDevsTenant = await prisma.tenant.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'DozalDevs',
      slug: 'dozaldevs',
      status: 'active',
      config: { summary: { channel_ids: [], target_channel: null } },
    },
    update: { name: 'DozalDevs', status: 'active' },
  });
  console.log(`✅ Tenant upserted: ${dozalDevsTenant.id} (slug: ${dozalDevsTenant.slug})`);

  const vlreTenant = await prisma.tenant.upsert({
    where: { id: '00000000-0000-0000-0000-000000000003' },
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      name: 'VLRE',
      slug: 'vlre',
      status: 'active',
      config: { summary: { channel_ids: [], target_channel: null } },
    },
    update: { name: 'VLRE', status: 'active' },
  });
  console.log(`✅ Tenant upserted: ${vlreTenant.id} (slug: ${vlreTenant.slug})`);

  const [agentVersion, project] = await prisma.$transaction([
    prisma.agentVersion.upsert({
      where: { id: '00000000-0000-0000-0000-000000000002' },
      create: {
        id: '00000000-0000-0000-0000-000000000002',
        prompt_hash: 'initial-v1',
        model_id: 'minimax/minimax-m2.7',
        tool_config_hash: 'initial-v1',
        changelog_note: 'Initial agent version for MVP testing',
        is_active: true,
      },
      update: {
        prompt_hash: 'initial-v1',
        model_id: 'minimax/minimax-m2.7',
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
        repo_url: 'https://github.com/viiqswim/ai-employee-test-target',
        default_branch: 'main',
        concurrency_limit: 3,
        jira_project_key: 'TEST',
      },
      update: {
        name: 'test-project',
        repo_url: 'https://github.com/viiqswim/ai-employee-test-target',
        default_branch: 'main',
        concurrency_limit: 3,
        jira_project_key: 'TEST',
      },
    }),
  ]);

  console.log(`✅ AgentVersion upserted: ${agentVersion.id} (model: ${agentVersion.model_id})`);
  console.log(`✅ Project upserted: ${project.id} (repo: ${project.repo_url})`);

  const operationsDept = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'Operations',
      tenant_id: '00000000-0000-0000-0000-000000000001',
    },
    update: {
      name: 'Operations',
    },
  });

  console.log(`✅ Department upserted: ${operationsDept.id} (name: ${operationsDept.name})`);

  const SUMMARIZER_INSTRUCTIONS =
    'Read the last 24 hours of messages from the configured Slack channels (channel IDs are in the DAILY_SUMMARY_CHANNELS environment variable, comma-separated). ' +
    'Use the /tools/slack/read-channels.js shell tool to fetch messages. ' +
    'Generate a dramatic Spanish news-style summary following your system prompt guidelines. ' +
    'Use the /tools/slack/post-message.js shell tool to post the summary to the approval channel (SUMMARY_TARGET_CHANNEL environment variable) for human review. ' +
    'Include approve/reject buttons in the message by passing --task-id to the post-message tool. ' +
    'The task ID is available in the TASK_ID environment variable — include it in the button values for approval routing. ' +
    'When in delivery mode (DELIVERY_MODE=true), publish the approved content to the publish channel (SUMMARY_PUBLISH_CHANNEL environment variable).';

  const dailySummarizerArchetype = await prisma.archetype.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      role_name: 'daily-summarizer',
      runtime: 'opencode',
      system_prompt: PAPI_CHULO_SYSTEM_PROMPT,
      instructions: SUMMARIZER_INSTRUCTIONS,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'slack_message',
      tool_registry: { tools: ['/tools/slack/read-channels.js', '/tools/slack/post-message.js'] },
      trigger_sources: { type: 'cron', expression: '0 8 * * 1-5', timezone: 'America/Chicago' },
      risk_model: { approval_required: true, timeout_hours: 24 },
      concurrency_limit: 1,
      tenant_id: '00000000-0000-0000-0000-000000000001',
      department_id: '00000000-0000-0000-0000-000000000010',
    },
    update: {
      role_name: 'daily-summarizer',
      runtime: 'opencode',
      system_prompt: PAPI_CHULO_SYSTEM_PROMPT,
      instructions: SUMMARIZER_INSTRUCTIONS,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'slack_message',
      tool_registry: { tools: ['/tools/slack/read-channels.js', '/tools/slack/post-message.js'] },
      trigger_sources: { type: 'cron', expression: '0 8 * * 1-5', timezone: 'America/Chicago' },
      risk_model: { approval_required: true, timeout_hours: 24 },
      concurrency_limit: 1,
      department_id: '00000000-0000-0000-0000-000000000010',
    },
  });

  console.log(
    `✅ Archetype upserted: ${dailySummarizerArchetype.id} (role: ${dailySummarizerArchetype.role_name}, model: ${dailySummarizerArchetype.model})`,
  );

  console.log('✅ Seeding complete.');
  console.log(
    `Tenants seeded: Platform, DozalDevs, VLRE. Run /slack/install?tenant=<id> to attach Slack workspaces (or use scripts/setup-two-tenants.ts).`,
  );
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
