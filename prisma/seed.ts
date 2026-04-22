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

  const dozalDevsTenant = await prisma.tenant.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'DozalDevs',
      slug: 'dozaldevs',
      status: 'active',
      config: {
        summary: {
          channel_ids: ['C092BJ04HUG'],
          target_channel: 'C0AUBMXKVNU',
          publish_channel: 'C092BJ04HUG',
        },
      },
    },
    update: {
      name: 'DozalDevs',
      status: 'active',
      config: {
        summary: {
          channel_ids: ['C092BJ04HUG'],
          target_channel: 'C0AUBMXKVNU',
          publish_channel: 'C092BJ04HUG',
        },
      },
    },
  });
  console.log(`✅ Tenant upserted: ${dozalDevsTenant.id} (slug: ${dozalDevsTenant.slug})`);

  const vlreTenant = await prisma.tenant.upsert({
    where: { id: '00000000-0000-0000-0000-000000000003' },
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      name: 'VLRE',
      slug: 'vlre',
      status: 'active',
      config: {
        summary: {
          channel_ids: ['C0AMGJQN05S', 'C0ANH9J91NC', 'C0960S2Q8RL'],
          target_channel: 'C0960S2Q8RL',
          publish_channel: 'C0960S2Q8RL',
        },
      },
    },
    update: {
      name: 'VLRE',
      status: 'active',
      config: {
        summary: {
          channel_ids: ['C0AMGJQN05S', 'C0ANH9J91NC', 'C0960S2Q8RL'],
          target_channel: 'C0960S2Q8RL',
          publish_channel: 'C0960S2Q8RL',
        },
      },
    },
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
        tenant_id: '00000000-0000-0000-0000-000000000002',
      },
      update: {
        name: 'test-project',
        repo_url: 'https://github.com/viiqswim/ai-employee-test-target',
        default_branch: 'main',
        concurrency_limit: 3,
        jira_project_key: 'TEST',
        tenant_id: '00000000-0000-0000-0000-000000000002',
      },
    }),
  ]);

  console.log(`✅ AgentVersion upserted: ${agentVersion.id} (model: ${agentVersion.model_id})`);
  console.log(`✅ Project upserted: ${project.id} (repo: ${project.repo_url})`);

  const dozalDevsDept = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000020' },
    create: {
      id: '00000000-0000-0000-0000-000000000020',
      name: 'Operations',
      tenant_id: '00000000-0000-0000-0000-000000000002',
    },
    update: {
      name: 'Operations',
    },
  });

  console.log(`✅ Department upserted: ${dozalDevsDept.id} (name: ${dozalDevsDept.name})`);

  const vlreDept = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000021' },
    create: {
      id: '00000000-0000-0000-0000-000000000021',
      name: 'Operations',
      tenant_id: '00000000-0000-0000-0000-000000000003',
    },
    update: {
      name: 'Operations',
    },
  });

  console.log(`✅ Department upserted: ${vlreDept.id} (name: ${vlreDept.name})`);

  const DOZALDEVS_SUMMARIZER_INSTRUCTIONS =
    'Read the last 24 hours of messages from the project-lighthouse Slack channel (channel ID: C092BJ04HUG). ' +
    'Run: node /tools/slack/read-channels.js --channels "C092BJ04HUG" ' +
    'Generate a dramatic Spanish news-style summary following your system prompt guidelines. ' +
    'If no messages are found, use "Sin actividad en #project-lighthouse en las últimas 24 horas. Su corresponsal descansa... por ahora. 🎭" as the summary. ' +
    'CRITICAL — You MUST write the summary content to a file: write the full summary text to /tmp/summary.txt ' +
    '(example: write the text content directly to /tmp/summary.txt using shell file write). ' +
    'Post the summary with approve/reject buttons to the victor-tests channel (C0AUBMXKVNU) for review. ' +
    'CRITICAL — Capture the output: run the post-message tool and redirect stdout to /tmp/approval-message.json: ' +
    'NODE_NO_WARNINGS=1 node /tools/slack/post-message.js --channel "C0AUBMXKVNU" --text "<your summary>" --task-id <TASK_ID from end of prompt> > /tmp/approval-message.json ' +
    'Both /tmp/summary.txt and /tmp/approval-message.json MUST exist when you finish — the system reads them. ' +
    'When the DELIVERY_MODE environment variable equals "true", the summary was already approved — ' +
    'post the approved summary to project-lighthouse (C092BJ04HUG) as a final clean published message without buttons: ' +
    'node /tools/slack/post-message.js --channel "C092BJ04HUG" --text "<approved summary>"';

  const VLRE_SUMMARIZER_INSTRUCTIONS =
    'Read the last 24 hours of messages from the VLRE Slack channels (channel IDs: C0AMGJQN05S, C0ANH9J91NC, C0960S2Q8RL). ' +
    'Run: node /tools/slack/read-channels.js --channels "C0AMGJQN05S,C0ANH9J91NC,C0960S2Q8RL" ' +
    'Generate a dramatic Spanish news-style summary following your system prompt guidelines. ' +
    'If no messages are found, use "Sin actividad en los canales de VLRE en las últimas 24 horas. Su corresponsal descansa... por ahora. 🎭" as the summary. ' +
    'CRITICAL — You MUST write the summary content to a file: write the full summary text to /tmp/summary.txt ' +
    '(example: write the text content directly to /tmp/summary.txt using shell file write). ' +
    'Post the summary with approve/reject buttons to the VLRE review channel (C0960S2Q8RL) for review. ' +
    'CRITICAL — Capture the output: run the post-message tool and redirect stdout to /tmp/approval-message.json: ' +
    'NODE_NO_WARNINGS=1 node /tools/slack/post-message.js --channel "C0960S2Q8RL" --text "<your summary>" --task-id <TASK_ID from end of prompt> > /tmp/approval-message.json ' +
    'Both /tmp/summary.txt and /tmp/approval-message.json MUST exist when you finish — the system reads them. ' +
    'When the DELIVERY_MODE environment variable equals "true", the summary was already approved — ' +
    'post the approved summary to the VLRE publish channel (C0960S2Q8RL) as a final clean published message without buttons: ' +
    'node /tools/slack/post-message.js --channel "C0960S2Q8RL" --text "<approved summary>"';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dozalDevsSummarizerArchetype = await (prisma.archetype as any).upsert({
    where: { id: '00000000-0000-0000-0000-000000000012' },
    create: {
      id: '00000000-0000-0000-0000-000000000012',
      role_name: 'daily-summarizer',
      runtime: 'opencode',
      system_prompt: PAPI_CHULO_SYSTEM_PROMPT,
      instructions: DOZALDEVS_SUMMARIZER_INSTRUCTIONS,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'slack_message',
      tool_registry: { tools: ['/tools/slack/read-channels.js', '/tools/slack/post-message.js'] },
      trigger_sources: { type: 'cron', expression: '0 8 * * 1-5', timezone: 'America/Chicago' },
      risk_model: { approval_required: true, timeout_hours: 24 },
      concurrency_limit: 1,
      tenant_id: '00000000-0000-0000-0000-000000000002',
      department_id: '00000000-0000-0000-0000-000000000020',
    },
    update: {
      role_name: 'daily-summarizer',
      runtime: 'opencode',
      system_prompt: PAPI_CHULO_SYSTEM_PROMPT,
      instructions: DOZALDEVS_SUMMARIZER_INSTRUCTIONS,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'slack_message',
      tool_registry: { tools: ['/tools/slack/read-channels.js', '/tools/slack/post-message.js'] },
      trigger_sources: { type: 'cron', expression: '0 8 * * 1-5', timezone: 'America/Chicago' },
      risk_model: { approval_required: true, timeout_hours: 24 },
      concurrency_limit: 1,
      department_id: '00000000-0000-0000-0000-000000000020',
    },
  });

  console.log(
    `✅ Archetype upserted: ${dozalDevsSummarizerArchetype.id} (role: ${dozalDevsSummarizerArchetype.role_name}, model: ${dozalDevsSummarizerArchetype.model})`,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vlreSummarizerArchetype = await (prisma.archetype as any).upsert({
    where: { id: '00000000-0000-0000-0000-000000000013' },
    create: {
      id: '00000000-0000-0000-0000-000000000013',
      role_name: 'daily-summarizer',
      runtime: 'opencode',
      system_prompt: PAPI_CHULO_SYSTEM_PROMPT,
      instructions: VLRE_SUMMARIZER_INSTRUCTIONS,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'slack_message',
      tool_registry: { tools: ['/tools/slack/read-channels.js', '/tools/slack/post-message.js'] },
      trigger_sources: { type: 'cron', expression: '0 8 * * 1-5', timezone: 'America/Chicago' },
      risk_model: { approval_required: true, timeout_hours: 24 },
      concurrency_limit: 1,
      tenant_id: '00000000-0000-0000-0000-000000000003',
      department_id: '00000000-0000-0000-0000-000000000021',
    },
    update: {
      role_name: 'daily-summarizer',
      runtime: 'opencode',
      system_prompt: PAPI_CHULO_SYSTEM_PROMPT,
      instructions: VLRE_SUMMARIZER_INSTRUCTIONS,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'slack_message',
      tool_registry: { tools: ['/tools/slack/read-channels.js', '/tools/slack/post-message.js'] },
      trigger_sources: { type: 'cron', expression: '0 8 * * 1-5', timezone: 'America/Chicago' },
      risk_model: { approval_required: true, timeout_hours: 24 },
      concurrency_limit: 1,
      department_id: '00000000-0000-0000-0000-000000000021',
    },
  });

  console.log(
    `✅ Archetype upserted: ${vlreSummarizerArchetype.id} (role: ${vlreSummarizerArchetype.role_name}, model: ${vlreSummarizerArchetype.model})`,
  );

  console.log('✅ Seeding complete.');
  console.log(
    `Tenants seeded: DozalDevs, VLRE — both have daily-summarizer archetypes. Run /slack/install?tenant=<id> to attach Slack workspaces (or use scripts/setup-two-tenants.ts).`,
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
