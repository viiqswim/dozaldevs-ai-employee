import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { encrypt } from '../src/lib/encryption.js';

const prisma = new PrismaClient();

async function seedSecret(tenantId: string, key: string, plaintext: string) {
  const { ciphertext, iv, auth_tag } = encrypt(plaintext);
  await prisma.tenantSecret.upsert({
    where: { tenant_id_key: { tenant_id: tenantId, key } },
    create: { tenant_id: tenantId, key, ciphertext, iv, auth_tag },
    update: { ciphertext, iv, auth_tag },
  });
  console.log(`✅ Secret upserted: ${key} (tenant: ${tenantId})`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLATFORM_AGENTS_MD = fs.readFileSync(
  path.join(__dirname, '../src/workers/config/agents.md'),
  'utf8',
);

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
        notification_channel: 'C0AUBMXKVNU',
        source_channels: ['C092BJ04HUG'],
        summary: {
          channel_ids: ['C092BJ04HUG'],
          target_channel: 'C0AUBMXKVNU',
          publish_channel: 'C092BJ04HUG',
        },
        default_agents_md: PLATFORM_AGENTS_MD,
      },
    },
    update: {
      name: 'DozalDevs',
      status: 'active',
      config: {
        notification_channel: 'C0AUBMXKVNU',
        source_channels: ['C092BJ04HUG'],
        summary: {
          channel_ids: ['C092BJ04HUG'],
          target_channel: 'C0AUBMXKVNU',
          publish_channel: 'C092BJ04HUG',
        },
        default_agents_md: PLATFORM_AGENTS_MD,
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
        notification_channel: 'C0960S2Q8RL',
        source_channels: ['C0AMGJQN05S', 'C0ANH9J91NC', 'C0960S2Q8RL'],
        summary: {
          channel_ids: ['C0AMGJQN05S', 'C0ANH9J91NC', 'C0960S2Q8RL'],
          target_channel: 'C0960S2Q8RL',
          publish_channel: 'C0960S2Q8RL',
        },
        default_agents_md: `VLRE (VL Real Estate) manages short-term vacation rental properties. Communicate casually and warmly — like a knowledgeable friend who happens to manage the property, not a corporate customer service rep. No formalities, no corporate language. Primary guest languages are English and Spanish — always match the guest's language in your reply.`,
        guest_messaging: {
          poll_interval_minutes: 30,
          alert_threshold_minutes: 30,
          quiet_hours: {
            start: 1,
            end: 8,
            timezone: 'America/Chicago',
          },
          hostfully_agency_uid: '942d08d9-82bb-4fd3-9091-ca0c6b50b578',
        },
      },
    },
    update: {
      name: 'VLRE',
      status: 'active',
      config: {
        notification_channel: 'C0960S2Q8RL',
        source_channels: ['C0AMGJQN05S', 'C0ANH9J91NC', 'C0960S2Q8RL'],
        summary: {
          channel_ids: ['C0AMGJQN05S', 'C0ANH9J91NC', 'C0960S2Q8RL'],
          target_channel: 'C0960S2Q8RL',
          publish_channel: 'C0960S2Q8RL',
        },
        default_agents_md: `VLRE (VL Real Estate) manages short-term vacation rental properties. Communicate casually and warmly — like a knowledgeable friend who happens to manage the property, not a corporate customer service rep. No formalities, no corporate language. Primary guest languages are English and Spanish — always match the guest's language in your reply.`,
        guest_messaging: {
          poll_interval_minutes: 30,
          alert_threshold_minutes: 30,
          quiet_hours: {
            start: 1,
            end: 8,
            timezone: 'America/Chicago',
          },
          hostfully_agency_uid: '942d08d9-82bb-4fd3-9091-ca0c6b50b578',
        },
      },
    },
  });
  console.log(`✅ Tenant upserted: ${vlreTenant.id} (slug: ${vlreTenant.slug})`);

  await seedSecret('00000000-0000-0000-0000-000000000003', 'hostfully_api_key', 'Y6EQ7KgSwoOGCokD');
  await seedSecret(
    '00000000-0000-0000-0000-000000000003',
    'hostfully_agency_uid',
    '942d08d9-82bb-4fd3-9091-ca0c6b50b578',
  );
  const vlreSlackBotToken = process.env.VLRE_SLACK_BOT_TOKEN;
  if (!vlreSlackBotToken) {
    console.warn(
      '⚠️  VLRE_SLACK_BOT_TOKEN is not set — skipping slack_bot_token seed. ' +
        'Add it to .env and re-run the seed, or run the OAuth flow at /slack/install?tenant=00000000-0000-0000-0000-000000000003',
    );
  } else {
    await seedSecret('00000000-0000-0000-0000-000000000003', 'slack_bot_token', vlreSlackBotToken);
  }

  await prisma.tenantIntegration.upsert({
    where: {
      tenant_id_provider: { tenant_id: '00000000-0000-0000-0000-000000000003', provider: 'slack' },
    },
    create: {
      id: '00000000-0000-0000-0000-000000000031',
      tenant_id: '00000000-0000-0000-0000-000000000003',
      provider: 'slack',
      external_id: 'T06KFDGLHS6',
      status: 'active',
    },
    update: {
      external_id: 'T06KFDGLHS6',
      status: 'active',
      deleted_at: null,
    },
  });
  console.log('✅ TenantIntegration upserted: VLRE Slack (T06KFDGLHS6)');

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

  const DOZALDEVS_SUMMARIZER_INSTRUCTIONS = `Read messages from the configured source Slack channels for the past 24 hours using tsx /tools/slack/read-channels.ts. Identify key discussions, decisions, and action items. Draft a concise technical digest showing what the team shipped, discussed, and decided.

Post the summary to Slack using:
tsx /tools/slack/post-message.ts --thread-ts "$NOTIFY_MSG_TS" --channel "<channel>" --text "<summary>"

CLASSIFICATION RULES:
- Use NEEDS_APPROVAL if you have a summary ready for human review before posting (default).
- Use NO_ACTION_NEEDED if there were no messages to summarize in the past 24 hours.
- Use confidence 0.9 — you are confident in your summary.

FINAL STEP (MANDATORY):
tsx /tools/platform/submit-output.ts \\
  --summary "<one-sentence description of the digest>" \\
  --classification "NEEDS_APPROVAL" \\
  --draft "<full summary text>" \\
  --confidence 0.9`;

  const VLRE_SUMMARIZER_INSTRUCTIONS = `Read messages from the configured source Slack channels for the past 24 hours using tsx /tools/slack/read-channels.ts. Identify key discussions, decisions, and action items. Draft a dramatic Spanish news-anchor style summary — theatrical, entertaining, but accurate.

Post the summary to Slack using:
tsx /tools/slack/post-message.ts --thread-ts "$NOTIFY_MSG_TS" --channel "<channel>" --text "<summary>"

CLASSIFICATION RULES:
- Use NEEDS_APPROVAL if you have a summary ready for human review before posting (default).
- Use NO_ACTION_NEEDED if there were no messages to summarize in the past 24 hours.
- Use confidence 0.9 — you are confident in your summary.

FINAL STEP (MANDATORY):
tsx /tools/platform/submit-output.ts \\
  --summary "<one-sentence description of the digest>" \\
  --classification "NEEDS_APPROVAL" \\
  --draft "<full summary text>" \\
  --confidence 0.9`;

  const GUEST_MESSAGING_AGENTS_MD = `You are a guest communication specialist for VLRE vacation rentals. Be casual and warm, like a friend who manages the property.

Always match the guest's language (English or Spanish).

TOOLS RELEVANT TO YOUR JOB:
- Read guest messages: tsx /tools/hostfully/get-messages.ts
- Get property details: tsx /tools/hostfully/get-property.ts
- Get reservations: tsx /tools/hostfully/get-reservations.ts
- Lock access and door codes: tsx /tools/sifely/* (list-locks, list-passcodes, check access)
- Knowledge base: tsx /tools/knowledge_base/search.ts — search property-specific information
- Guest approval card: tsx /tools/slack/post-guest-approval.ts — post approval card to Slack
- Output submission: tsx /tools/platform/submit-output.ts — submit task output (required as final step)
Load the tool-usage-reference skill for exact CLI syntax and flags.`;

  const VLRE_GUEST_MESSAGING_INSTRUCTIONS = `A guest sent a new message. Follow this workflow:

1. Read the full conversation thread to understand context and what the guest needs:
   tsx /tools/hostfully/get-messages.ts --thread-uid "$THREAD_UID"

2. Check property details and reservation information:
   tsx /tools/hostfully/get-property.ts --property-uid "$PROPERTY_UID"
   tsx /tools/hostfully/get-reservations.ts --property-uid "$PROPERTY_UID"

3. Search the knowledge base for property-specific information:
   tsx /tools/knowledge_base/search.ts --query "<guest's topic>"

4. If the guest mentions access issues or lock problems, check lock status using Sifely tools.

5. Draft a warm, helpful response that addresses the guest's needs.

CLASSIFICATION RULES:
- Use NEEDS_APPROVAL if you drafted a response that should be sent to the guest.
- Use NO_ACTION_NEEDED if the thread is already resolved, the last message is from the host, or no response is needed.
- Use confidence 0.9+ when the situation is clear, 0.5-0.8 when uncertain.

CRITICAL — APPROVAL CARD POSTING:
When classification is NEEDS_APPROVAL, you MUST call tsx /tools/slack/post-guest-approval.ts to post the approval card to Slack. ALWAYS pass --thread-ts "$NOTIFY_MSG_TS" so the card appears as a thread reply under the task notification. Never omit --thread-ts. Never skip this tool call.

FINAL STEP (MANDATORY):
tsx /tools/platform/submit-output.ts \\
  --summary "<one-sentence description of the guest's message and your action>" \\
  --classification "NEEDS_APPROVAL" \\
  --draft "<your full drafted response to the guest>" \\
  --confidence 0.92 \\
  --reasoning "<why you chose this response>" \\
  --metadata '{"guest_name":"<Guest first name>","property_name":"<Property name from Hostfully>","original_message":"<The exact guest message you are responding to>","thread_uid":"<Hostfully thread UUID from THREAD_UID env var or get-messages.ts output>","check_in":"YYYY-MM-DD","check_out":"YYYY-MM-DD","booking_channel":"AIRBNB or HOSTFULLY","lead_status":"INQUIRY or BOOKED","category":"amenities or access or checkin or checkout or general"}'

IMPORTANT: Always populate the metadata fields above. They are required for the approval workflow to display correctly and for delivery to work. The thread_uid field is critical — without it, the reply cannot be sent. Get it from the THREAD_UID environment variable (echo $THREAD_UID) or from the get-messages.ts output. If a field is unknown, omit it rather than guessing.`;

  const DOZALDEVS_SUMMARIZER_AGENTS_MD =
    'You are a daily Slack channel summarizer for DozalDevs, a software development team.\n\n' +
    'TOOLS RELEVANT TO YOUR JOB:\n' +
    '- Read Slack channels: tsx /tools/slack/read-channels.ts — fetch message history from configured channels\n' +
    '- Post to Slack: tsx /tools/slack/post-message.ts — post the summary (always pass --thread-ts "$NOTIFY_MSG_TS")\n' +
    '- Output submission: tsx /tools/platform/submit-output.ts — submit task output (required as final step)\n' +
    'Load the tool-usage-reference skill for exact CLI syntax and flags.';

  const VLRE_SUMMARIZER_AGENTS_MD =
    'You are Papi Chulo — a daily Slack channel summarizer for VLRE, a short-term rental property management company.\n\n' +
    'TOOLS RELEVANT TO YOUR JOB:\n' +
    '- Read Slack channels: tsx /tools/slack/read-channels.ts — fetch message history from configured channels\n' +
    '- Post to Slack: tsx /tools/slack/post-message.ts — post the summary (always pass --thread-ts "$NOTIFY_MSG_TS")\n' +
    '- Output submission: tsx /tools/platform/submit-output.ts — submit task output (required as final step)\n' +
    'Load the tool-usage-reference skill for exact CLI syntax and flags.';

  const CODE_ROTATION_AGENTS_MD =
    'You are the VLRE code rotation specialist. Your job is to rotate Sifely lock passcodes for all managed properties that have a guest checkout today and update Hostfully with the new codes.\n\n' +
    'TOOLS RELEVANT TO YOUR JOB:\n' +
    '- Sifely lock management: tsx /tools/sifely/* (list-locks, list-passcodes, generate-code, update-passcode, rotate-property-code, diagnose-access)\n' +
    '- Hostfully door codes: tsx /tools/hostfully/get-door-code.ts, tsx /tools/hostfully/update-door-code.ts\n' +
    '- Slack notifications: tsx /tools/slack/post-message.ts — post rotation summary (always pass --thread-ts "$NOTIFY_MSG_TS")\n' +
    '- Output submission: tsx /tools/platform/submit-output.ts — submit task output (required as final step)\n' +
    'Load the tool-usage-reference skill for exact CLI syntax and flags.';

  const VLRE_COMMON_KB_CONTENT = `# VL Real Estate — Common Knowledge Base

> This file is automatically generated from common-situations.xlsx and shared policies.
> It is loaded for every guest message, regardless of property.

## General Policies


- **Check-in Time**: 3:00 PM (15:00) standard — some properties have different times (see property-specific KB)
- **Check-out Time**: 11:00 AM (11:00)
- **Quiet Hours**: 10:00 PM – 8:00 AM
- **Smoking**: Strictly prohibited inside all properties
- **Pets**: Property-specific (see Property-Specific Info below)
- **Maximum Occupancy**: As listed in booking confirmation
- **Parties/Events**: Not permitted without prior written approval
- **Additional Guests**: Must be approved in advance; additional charges may apply

## Common Guest Situations

### Can not find the property
**How to verify**: The guest send you a photo of the property and compare with the photo of the property
**Response**:
Send the correct addres on google maps

### Entrance door is not open
**How to verify**: 1.Confirm they are in the correct address 2. They need to confirm their access code with 🔒 3. Confirm on Sifely the have the correct acces code
**Response**:
Send YouTube video with InstruccionsAll the Guests have this link in their instruccions message and in our check in option on ARIBNB

### Room Door is not open
**How to verify**: 1.Confirm they are in the correct room 2. They need to confirm their access code with #️⃣ 3. Confirm on Sifely the have the correct acces code
**Response**:
Send YouTube video with Instruccions   https://youtu.be/NeiAsgaE8Wk   All the Guests have this link in their instruccions message and in our check in option on ARIBNB

### Refound
**How to verify**: We have strict policy so we ned they cancel 7 days advice to get a refund but we offer if they cancel and someone else books the room we will give them a refund.
**Response**:
Hello
We should be able to do a full refund if you cancel within the next few minutes. We should then be able to get the room rented out to someone else and at that point we can give you a full refund.

Reminders: please make sure that you cancel within the next few minutes, otherwise we will not be able to do any sort of refund.

Let us know if you have any questions or concerns.

### Early Check in
**How to verify**: Let them know  our check in time, but if the room is ready before we will let them know, confirm with  cleanning team   EXCEPCIONES:   EL HUESPED PUEDE OFRECER PAGAR UN EXTRA FEE AL EQUIPO DE LIMPIEZA ($50 DOLARES QUE SERAN PARA EL CLEANING TEAM Y 30 POR CIENTO PARA ANFITRIONES DANDO UN TOTAL DE $80.
**Response**:
Hey there! We're so sorry, but today might not be a good day for early check in since the cleaning team seems to be on a very tight schedule today :(

We'll reach out to them and ask if they can get to it any earlier.
Let us know if you have any other questions!

### Late Check out
**How to verify**: Not possible, but if the next reservation is for separate rooms they can stay in the living room
**Response**:
Hey there! Unfortunately, we can't accommodate late check-out today as we have another guest arriving and our cleaning team needs time to prepare the property.

Our standard check-out time is 11:00 AM. Please make sure to leave the property by that time, leaving the doors locked. If you need to store your luggage briefly, please let us know and we can try to help.

Let us know if you have any other questions!

### Places near
**How to verify**: NEIBORHOODS                                     NUTRIA RUN " Vista Point"   BRECKENBRIGE, SAND DUNES, HOVEWEEP "Colorado Crossings"
**Response**:
Hello there! If you need check anything that's around the property you can look up the property's neighborhood on Google Maps.  Let us know if you have any other questions.  Cheers

### Pets
**How to verify**: POSSIBLE ANSWER: "Hey there, Stephanie! Thanks for reaching out. We truly love pets. With that said, we cannot allow pets in the home because guests with bad allergies expect the home to be completely pet-free."
**Response**:
Hey there! Thanks for reaching out. We truly love pets. With that said, we cannot allow pets or emotional support animals in the home because guests with bad allergies expect the property to be completely pet-free.

The only exception is service animals (not emotional support animals) as required by law. If you have a service animal, please let us know and we can assist you.

### Service Animals
**How to verify**: Guest claims to have a service animal (not emotional support). Note: service animals cannot legally be denied entry.
**Response**:
Thanks for confirming that you'll be bringing a service animal! To make sure we can assist you in the best way possible, could we get answers to the following two questions:

1. Is there a particular disability that requires you to have the service animal?
2. If so, what work or task has the service animal been trained to perform?

Thanks again for your time — looking forward to your response!

### Delivery / Package Questions
**How to verify**: Check if the property has mailbox access.
**Response**:
For deliveries, please use the property address. Mailbox access is available at most properties. If you have a package requiring a mailbox key, let us know and we can assist. Note: some properties do not have a physical mailbox — packages can be left at the entrance in that case.

### Thermostat Instructions
**How to verify**: Check which thermostat brand the property has (see Property Quick Reference).
**Response**: Send the appropriate tutorial video:
- **AMAZON Thermostat**: https://youtube.com/shorts/nVsT95W06vU?si=ZpjwXaDkLNFWUwjT
- **NEST Thermostat**: https://youtube.com/shorts/H72XaWyhWo8?si=2pPTLqxhUZkPRqzA
- **GOOGLE Thermostat**: https://youtube.com/shorts/EwSBpgAR9PM?si=sOIGv4PdivOAmwWu

## Property Quick Reference

| Property | Code | Rooms | Baths | Max Guests | Check-in | Check-out | Neighborhood | Pool | Pets |
|---|---|---|---|---|---|---|---|---|---|
| 7213, Nutria Run | 7213- NUT | 5 | 3.5 | 2 por cuarto | 3:00 PM | 11:00 AM | Vista point | No | No |
| 3412 Sand Dunes Ave, Austin | 3412-SAN | 4 | 2.5 | 2 x cuarto - 8 x casa | 3:00 PM | 11:00 AM | Colorado crossings | Community | No |
| 3420 Hovenweep Ave, Austin | 3420-HOV | 3 | 2 | 2 x cuarto- 6 x casa | 2:00 PM | 10:00 AM | — | Community | No |
| 3401 Breckenridge Dr, Austin | 3401 - BRE | 3 | 2 | 2 x cuarto - 6 x casa | 4:00 PM | 11:00 AM | — | Community | No |
| 271 Gina Dr, Kyle | 271- GIN | 4 | 2.5 | 2 x cuarto | 3:00 PM | 11:00 AM | Waterleaf Kyle | No | No |
| 219 Paul St, San Antonio | 219 - PAU | 3 | 2 | 6 x casa | 3:00 PM | 11:00 AM | SA Downtown | No | No |
| 407 S Gevers St, San Antonio | 407- GEV-H | 3 | 2 | 8 x casa | 3:00 PM | 11:00 AM | — | No | No |
| 407-A S Gevers St, San Antonio | 407- GEV-Loft | 1 | 1 | 4 | 3:00 PM | 11:00 AM | — | No | No |
| 407 S Gevers St, San Antonio | 407- GEV-B | 4 | 3 | 12 | 4:00 PM | 11:00 AM | — | No | No |
| 6002 Palm Cir, Austin | 6002- PAL | 4 | 3 | 8 x casa | 4:00 PM | 11:00 AM | — | No | No |
| 4410- A, Hayride Ln | 4410A- HAY | 2 | 1 | 6 x lado | 4:00 PM | 11:00 AM | N/A | No | No |
| 4410 - B, Hayride Ln | 4410B- HAY | 2 | 1 |  | 3:00 PM | 11:00 AM | N/A | No | No |
| 4403 - A, Hayride Ln | 4403A-HAY | 2 | 1 | 6 x lado | 4:00 PM | 11:00 AM | N/A | No | No |
| 4403 - B, Hayride Ln | 4403B- HAY | 2 | 1 | 6 x lado | 4:00 PM | 11:00 AM | N/A | No | No |
| 4403 - C, Hayride Ln | 4403C-HAY | 2 | 1 | 4 x casa | 4:00 PM | 11:00 AM | N/A | No | No |
| 6930 Heron Flats, Converse | 6930- HER | 4 | 2.5 | 8 x casa | 4:00 PM | 11:00 AM | — | No | No |
| 3505 Banton Rd, Austin | 3505- BAN | 3 | 2.5 | 2 x cuarto | 4:00 PM | 11:00 AM | — | No | No |
| 8039 Chestnut Cedar Dr, Converse | 8039-CHE | 4 | 2.5 | 8 guests | 4:00 PM | 12:00 PM | — | No | No |
| 4405 - A, Hayride Ln | 4405A- HAY | 2 | 1 | 6 x casa | 4:00 PM | 11:00 AM | — | No | No |
| 1602 Bluebird Dr | 1602-BLU-HOME | 3 | 2 | 8 x casa | 4:00 PM | 11:00 AM | Bailey, Colorado | No | No |
| 5306 King charles dr, Austin TX 78724 | 5306A-KIN-HOME | 2 | 1 | 4 x casa | 4:00 PM | 11:00 AM | East Austin Martin Luther King & 183) | No | No |

## Service Directory

### Austin
| Name | Service | Phone | Notes |
|---|---|---|---|
| Hafid | AC | (512)6793893 | — |
| Luis | AC | (512) 354-6497 | — |
| Miguel Vargas | AC | 5126770057 | — |
| Podador de Gina | Podador | (512) 9020227 | — |
| Sedgwick HW | — | (512)3633498 | Katherine Ext 50651 - Scott Ext. 50698 |
| Arnando Mundo - Gold Star Services | General landscape maintenances, fence repair, general power washing, ect. | Cel: (512)8016583 Home: (512)7165656 | Email: mundojose610@gmail.com |
| Luis (Hayride Lane) | Plomero | 5127318980 | — |
| Miguel | Plomero | (737) 400-3962 | — |
| Luis Austin | Plomero | (737) 239-2916 | — |
| Gerardo Lopez (Insolacion) | — | 18326898945 | — |
| Gilberto | Handyman | (512) 299-4385 | — |
| Jose | Handyman | 512 446 9199 | — |
| S&D Plumning | Plumning | 737-799-7020 | — |
| Luis Fernando | Countertop | 5123172354 | — |
| Jose Gomez | Handyman | (512) 815-1264 | — |
| Sergio Franco | Plomero | (737) 230-9109 | — |
| Esteban | Handy man | (817) 889-4384 | — |
| Jaime Lopez | Landscaping | 512 699-4393 | Nutria $50 |
| Vanessa Martínez | Landscaping | (512)8882378 | 4403-hay ambos lados $60 4405A-hay $40 6002-hay $50 |
| Adán | Landscaping | (512) 999-1523 | 271-Gina drive $60 primera vez - $50 cada 2/3 semanas 6002-Pal $50 7213 Nutria run $50 3505 Banton road Lado B $60 primera vez y $55 precio de hacerlo seguido |

### San Antonio
| Name | Service | Phone | Notes |
|---|---|---|---|
| Constructor | Constructor | (210)7013520 | — |
| Jose Ines | Handyman | 2104302387 | — |
| Alexander | AC | (210)6689207 | — |
| Cesar Amador (Papá de Alexander A/C) | Plomero y electricista | (210) 473-7601 | — |
| Pest Control Services | Fumigacion | 210 325-5736 | — |
| Steve Garrison | Trash Collection | 210 915 9511 | — |
| Gabriel Larios | Handyman | 210 896 7195 | — |
| Mario Martinez | Landscaping | 210 693 6736 | — |
| Luis Vidurrai | Handy man (techo) | (210) 810-7245 | — |

## Classification Rules


### AUTO_RESPOND candidates (high confidence required ≥ 0.9):
- WiFi password requests (exact property match in KB)
- Check-in/out time questions
- Parking questions (exact property match in KB)
- General policy questions (smoking, pets for known properties)

### NEEDS_APPROVAL (route to CS team):
- Early check-in / late check-out requests (requires checking availability)
- Maintenance issues (need to dispatch team)
- Pet approval questions
- Pricing / refund questions
- Special requests (extra bedding, cribs, etc.)
- Anything where the answer requires judgment

### ESCALATE immediately (tag manager):
- Lock/key access issues (guest can't enter property)
- Damage reports (by guest or neighbor)
- Safety concerns (gas smell, carbon monoxide, flooding)
- Refund/chargeback threats
- Aggressive or threatening communication
- Legal threats

## Escalation Triggers


The following ALWAYS require immediate escalation regardless of context:
1. "can't get in" / "lock doesn't work" / "locked out" → ACCESS ISSUE
2. "broken" + (window/door/lock) → SECURITY ISSUE
3. "smell gas" / "carbon monoxide" / "CO detector" → EMERGENCY
4. "refund" / "chargeback" / "dispute" → FINANCIAL
5. "flood" / "water leak" / "burst pipe" → EMERGENCY
6. "mold" / "cockroach" / "pest" → HEALTH
7. "police" / "call the cops" / "neighbors called police" → INCIDENT

Note: When in doubt, classify as NEEDS_APPROVAL rather than AUTO_RESPOND.`;

  const VLRE_PROPERTY_3505_BAN_KB_CONTENT = `# 3505-BAN — 3505 Banton Rd, Unit B, Austin, TX

## Property Overview
- **Internal Code**: 3505-BAN-Home
- **Type**: House | **Listing**: Entire Home
- **Bedrooms**: 3 | **Bathrooms**: 2.5
- **Max Guests**: 2
- **Check-in**: 4:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $198 (base)
- **Cancellation Policy**: Strict
- **Address**: 3505 Banton Rd, Unit B, Austin, TX 78722

## WiFi
- **Network**: Advani
- **Password**: pakistan123

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner (upstairs)
- Hangers — Closet room
- Lock on bedroom

### Throughout the Property
- Smart TV — Living room (downstairs)
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — Master room (downstairs)
- Wifi speed (250+ Mbps)
- Wifi speed (500+ Mbps)
- Washer
- Dryer
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room (downstairs)

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $150
- **Security Deposit**: $300
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 1 month in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 3505-BAN-1
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1.5
- **Max Guests**: 2
- **Check-in**: 4:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $44 (base)
- **Cancellation Policy**: Strict
- **Address**: 3505 Banton Rd, Unit B, Austin, TX 78744

## WiFi
- **Network**: Advani
- **Password**: pakistan123

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner (upstairs)
- Hangers — Closet room
- Lock on bedroom

### Throughout the Property
- Smart TV — Living room (downstairs)
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — Master room (downstairs)
- Wifi speed (250+ Mbps)
- Washer
- Dryer
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room (downstairs)

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $29
- **Security Deposit**: $58
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 1 month in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 3505-BAN-2
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1.5
- **Max Guests**: 2
- **Check-in**: 4:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $44 (base)
- **Cancellation Policy**: Strict
- **Address**: 3505 Banton Rd, Unit B, Austin, TX 78744

## WiFi
- **Network**: Advani
- **Password**: pakistan123

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner (upstairs)
- Hangers — Closet room
- Lock on bedroom

### Throughout the Property
- Smart TV — Living room (downstairs)
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — Master room (downstairs)
- Wifi speed (250+ Mbps)
- Washer
- Dryer
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room (downstairs)

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the stove (left side)
- Coffee — Kitchen (next to the stove)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $30
- **Security Deposit**: $70
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 1 month in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 3505-BAN-3
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1.5
- **Max Guests**: 2
- **Check-in**: 4:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $44 (base)
- **Cancellation Policy**: Strict
- **Address**: 3505 Banton Rd, Unit B, Austin, TX 78744

## WiFi
- **Network**: Advani
- **Password**: pakistan123

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner (upstairs)
- Hangers — Closet room
- Lock on bedroom

### Throughout the Property
- Smart TV — Living room (downstairs)
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — Master room (downstairs)
- Wifi speed (250+ Mbps)
- Washer
- Dryer
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room (downstairs)

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $29
- **Security Deposit**: $58
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 1 month in advance`;

  const VLRE_PROPERTY_3412_SAN_KB_CONTENT = `# 3412-SAN — 3401 Breckenridge drive, Austin, TX

## Property Overview
- **Internal Code**: 3412-SAN-HOME
- **Type**: House | **Listing**: Entire Home
- **Bedrooms**: 4 | **Bathrooms**: 2.5
- **Max Guests**: 8
- **Check-in**: 3:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $299 (base)
- **Cancellation Policy**: Strict
- **Address**: 3401 Breckenridge drive, Austin, TX 78744

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner (upstairs)
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room (downstairs)
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — Living room (downstairs)
- Wifi speed (250+ Mbps)
- Washer — left door in the kitchen (Closer to the Stove)
- Dryer
- Indoor pool (seasonal) — Community Pool - Seasonal Availability
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed
- Trash bins — Left side of the house

### Living Room
- TV — Living room (downstairs)

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸No parties

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $135
- **Security Deposit**: $270
- **Extra Guest Fee**: $35/night (over base occupancy of 8)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 12 months in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 3412-SAN-1
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1.5
- **Max Guests**: 2
- **Check-in**: 3:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $44 (base)
- **Cancellation Policy**: Strict
- **Address**: 3420 Sand dunes av, Austin, TX 78744

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner (upstairs)
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room (downstairs)
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — Living room (downstairs)
- Wifi speed (250+ Mbps)
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room (downstairs)

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $29
- **Security Deposit**: $58
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 1 month in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 3412-SAN-2
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1.5
- **Max Guests**: 2
- **Check-in**: 3:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $44 (base)
- **Cancellation Policy**: Strict
- **Address**: 3420 Sand dunes av, Austin, TX 78744

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner (upstairs)
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room (downstairs)
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — Living room (downstairs)
- Wifi speed (250+ Mbps)
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room (downstairs)

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $29
- **Security Deposit**: $58
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 12 months in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 3412-SAN-3
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1.5
- **Max Guests**: 2
- **Check-in**: 3:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $44 (base)
- **Cancellation Policy**: Strict
- **Address**: 3420 Sand dunes av, Austin, TX 78744

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner (upstairs)
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room (downstairs)
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — Living room (downstairs)
- Wifi speed (250+ Mbps)
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room (downstairs)

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $29
- **Security Deposit**: $58
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 12 months in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 3412-SAN-4
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1.5
- **Max Guests**: 2
- **Check-in**: 3:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $44 (base)
- **Cancellation Policy**: Strict
- **Address**: 3420 Sand dunes av, Austin, TX 78744

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner (upstairs)
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room (downstairs)
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — Living room (downstairs)
- Wifi speed (250+ Mbps)
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room (downstairs)

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $29
- **Security Deposit**: $58
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 12 months in advance

## Team Additions

### Las llaves están en el garage, abriendo la puerta del garage
Q: ¿Dónde se guardan las llaves para acceder a la cena y la bandería en 3412-San?
A: Las llaves están en el garage, abriendo la puerta del garage al lado derecho. Son dos llaves físicas (lavanderia y alacena) y las llaves de emergencia están en la lock box. Solamente los miembros del equipo tienen acceso a la alacena y en la lavandería la pueden utilizar los huéspedes que rentan casa completa.

_Added via Slack on 2026-03-23_

### Las llaves están en el garage, abriendo la puerta del garage
Q: ¿Dónde se guardan las llaves para acceder a la cena y la bandería en 3412-San?
A: Las llaves están en el garage, abriendo la puerta del garage al lado derecho. Son dos llaves físicas (lavanderia y alacena) y las llaves de emergencia están en la lock box. Solamente los miembros del equipo tienen acceso a la alacena y en la lavandería la pueden utilizar los huéspedes que rentan casa completa.

_Added via Slack on 2026-03-23_`;

  const VLRE_PROPERTY_3420_HOV_KB_CONTENT = `# 3401-BRE — 3420 Hovenweep ave, Austin, TX

## Property Overview
- **Internal Code**: 3401-BRE-HOME
- **Type**: House | **Listing**: Entire Home
- **Bedrooms**: 3 | **Bathrooms**: 2
- **Max Guests**: 6
- **Check-in**: 2:00 PM | **Check-out**: 10:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $225 (base)
- **Cancellation Policy**: Strict
- **Address**: 3420 Hovenweep ave, Austin, TX 78744

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — Living room
- Wifi speed (250+ Mbps)
- Washer — French door next to the room 1
- Dryer — French door next to the room 2
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed
- Trash bins — Left side of the house

### Living Room
- TV — Living room

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Kitchen
- Coffee — Kitchen cabinet
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸No parties

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $120
- **Security Deposit**: $240
- **Extra Guest Fee**: $35/night (over base occupancy of 6)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 12 months in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 3420-HOV-1
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1
- **Max Guests**: 2
- **Check-in**: 2:00 PM | **Check-out**: 10:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $34 (base)
- **Cancellation Policy**: Strict
- **Address**: 3420 Hovenweep Ave,, Austin, TX 78744

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Dining room corner
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — Living room
- Wifi speed (250+ Mbps)
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Kitchen
- Coffee — Kitchen cabinet
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $29
- **Security Deposit**: $58
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 1 month in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 3420-HOV-2
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1
- **Max Guests**: 2
- **Check-in**: 2:00 PM | **Check-out**: 10:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $34 (base)
- **Cancellation Policy**: Strict
- **Address**: 3420 Hovenweep Ave,, Austin, TX 78744

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — Living room
- Wifi speed (250+ Mbps)
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Has cat
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Kitchen
- Coffee — Kitchen cabinet
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸If the TV control remote gets lost, the replacement will have a $50 cost
- 🔸Common areas are not allowed to sleep
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.
- 🔸Don't change the temperature

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $25
- **Security Deposit**: $50
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 1 month in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 3420-HOV-3
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1
- **Max Guests**: 2
- **Check-in**: 2:00 PM | **Check-out**: 10:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $34 (base)
- **Cancellation Policy**: Strict
- **Address**: 3420 Hovenweep Ave,, Austin, TX 78744

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — Living room
- Wifi speed (250+ Mbps)
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Kitchen
- Coffee — Kitchen cabinet
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.
- 🔸Don't change the temperature

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $25
- **Security Deposit**: $50
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 1 month in advance

## Team Additions

### Las llaves de la alacena, donde se guardan los productos de 
Q: ¿Dónde se guardan las llaves en 3420-Hov?
A: Las llaves de la alacena, donde se guardan los productos de limpieza, están en el garage, abriendo la puerta a mano izquierda, pegado a la pared. Estas llaves son exclusivas para el equipo. Los huéspedes no deberían tener acceso porque tenemos productos de limpieza ahí.

_Added via Slack on 2026-03-23_

### Lo ideal sería preguntar al equipo de limpieza pero deberían
Q: Dónde está o dónde se guardan las escobas en 3420-HOV-HOME?
A: Lo ideal sería preguntar al equipo de limpieza pero deberían estar en el garage (de esa área está limitada para equipos de limpieza)

_Added via Slack on 2026-03-23_`;

  const VLRE_PROPERTY_3401_BRE_KB_CONTENT = `# 3401-BRE — 3401 Breckenridge drive, Austin, TX

## Property Overview
- **Internal Code**: 3401-BRE-HOME
- **Type**: House | **Listing**: Entire Home
- **Bedrooms**: 3 | **Bathrooms**: 2
- **Max Guests**: 6
- **Check-in**: 4:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $109 (base)
- **Cancellation Policy**: Strict
- **Address**: 3401 Breckenridge drive, Austin, TX 78744

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — garage (no access)
- Wifi speed (250+ Mbps)
- Washer — French door next to the room 1
- Dryer — French door next to the room 2
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed
- Trash bins — Left side of the house

### Living Room
- TV — Living room

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸No parties

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $120
- **Security Deposit**: $240
- **Extra Guest Fee**: $35/night (over base occupancy of 6)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 12 months in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 3401-BRE-1
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 2
- **Max Guests**: 2
- **Check-in**: 4:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $49 (base)
- **Cancellation Policy**: Strict
- **Address**: 3401 Breckenridge drive, Austin, TX 78744

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — garage (no access)
- Wifi speed (250+ Mbps)
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Has cat
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $29
- **Security Deposit**: $58
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 1 month in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 3401-BRE-2
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1
- **Max Guests**: 2
- **Check-in**: 4:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $49 (base)
- **Cancellation Policy**: Strict
- **Address**: 3401 Breckenridge drive, Austin, TX 78744

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Ipod Station
- Desk
- Desk chair
- Iron — Livingroom corner
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — garage (no access)
- Wifi speed (250+ Mbps)
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $25
- **Security Deposit**: $50
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 1 month in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 3401-BRE-3
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1
- **Max Guests**: 2
- **Check-in**: 4:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $49 (base)
- **Cancellation Policy**: Strict
- **Address**: 3401 Breckenridge drive, Austin, TX 78744

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — garage (no access)
- Wifi speed (250+ Mbps)
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Has cat
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry is not available
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $25
- **Security Deposit**: $50
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 1 month in advance`;

  const VLRE_PROPERTY_271_GIN_KB_CONTENT = `
---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 271-GIN-1
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1
- **Max Guests**: 2
- **Check-in**: 3:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $60 (base)
- **Cancellation Policy**: Strict
- **Address**: 271 Gina Dr, Kyle, TX 78640

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner (upstairs)
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room (downstairs)
- Air Conditioning — Entire home, themostat (livingroom upstairs)
- Heating — Entire home
- Internet Wifi — Living room (downstairs)
- Wifi speed (250+ Mbps)
- Washer — special fee $5 for 4 hours
- Dryer
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room (downstairs)

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry's fee $5 per time *Subject to availability, please make your request for use 24 hours in advance*
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature
- 🔸For delivery services, a $30 fee will be charged if mailbox is needed
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.
- 🔸No photo shoots

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $30
- **Security Deposit**: $60
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 12 months in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 271-GIN-2
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1
- **Max Guests**: 2
- **Check-in**: 3:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $60 (base)
- **Cancellation Policy**: Strict
- **Address**: 271 Gina Dr, Kyle, TX 78640

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner (upstairs)
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room (downstairs)
- Air Conditioning — Entire home, themostat (livingroom upstairs)
- Heating — Entire home
- Internet Wifi — Living room (downstairs)
- Wifi speed (250+ Mbps)
- Washer — second floor in the living room (next to the stairs
- Dryer — same as washer
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room (downstairs)

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry's fee $5 per time *Subject to availability, please make your request for use 24 hours in advance*
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature
- 🔸For delivery services, a $30 fee will be charged if mailbox is needed
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.
- 🔸No photo shoots

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $30
- **Security Deposit**: $60
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 12 months in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 271-GIN-3
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1
- **Max Guests**: 2
- **Check-in**: 3:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $60 (base)
- **Cancellation Policy**: Strict
- **Address**: 271 Gina Dr, Kyle, TX 78640

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Ipod Station
- Desk
- Desk chair
- Iron — Livingroom corner (upstairs)
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room (downstairs)
- Air Conditioning — Entire home, themostat (livingroom upstairs)
- Heating — Entire home
- Internet Wifi — Living room (downstairs)
- Wifi speed (250+ Mbps)
- Washer — second floor in the living room (next to the stairs
- Dryer — same as washer
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Has cat
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room (downstairs)

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry's fee $5 per time *Subject to availability, please make your request for use 24 hours in advance*
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature
- 🔸For delivery services, a $30 fee will be charged if mailbox is needed
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.
- 🔸No photo shoots

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $30
- **Security Deposit**: $60
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 12 months in advance

---

## Unit TEMPLATE.XLSX
## Property Overview
- **Internal Code**: 271-GIN-4
- **Type**: Room | **Listing**: Private Room
- **Bedrooms**: 1 | **Bathrooms**: 1.5
- **Max Guests**: 2
- **Check-in**: 3:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $60 (base)
- **Cancellation Policy**: Strict
- **Address**: 271 Gina Dr, Kyle, TX 78640

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner (upstairs)
- Hangers — Closet room

### Throughout the Property
- Smart TV — Living room (downstairs)
- Air Conditioning — Entire home, themostat (livingroom upstairs)
- Heating — Entire home
- Internet Wifi — Living room (downstairs)
- Wifi speed (250+ Mbps)
- Washer — second floor in the living room (next to the stairs
- Dryer — same as washer
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — Each room has a smart lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room (downstairs)

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen with labels
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom
- Toiletries

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry's fee $5 per time *Subject to availability, please make your request for use 24 hours in advance*
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸Quiet time between 10 pm to 7 a.m. for everyone's comfort 🙏
- 🔸No parties
- 🔸No children
- 🔸Refrain from taking food and beverages from other guest or/and host
- 🔸Keep bathroom and common areas clean
- 🔸Common areas are not allowed to sleep
- 🔸Don't change the temperature
- 🔸For delivery services, a $30 fee will be charged if mailbox is needed
- 🔸Linen fee: $15. Replacement items cost an additional $15 each time. Once paid, replacements will be left outside your room.
- 🔸No photo shoots

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $30
- **Security Deposit**: $60
- **Extra Guest Fee**: $35/night (over base occupancy of 2)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 12 months in advance

## Team Additions

### De acuerdo con las políticas y reglas de la casa registradas
Q: en 271-GIN-HOME se aceptan niños de 2 años?
A: De acuerdo con las políticas y reglas de la casa registradas específicamente para la propiedad 271-GIN (271 Gina Dr), no se aceptan niños
. Por lo tanto, no está permitido hospedar a un niño de 2 años en esta propiedad.

_Added via Slack on 2026-03-23_`;

  const VLRE_PROPERTY_219_PAU_KB_CONTENT = `# 219-PAU — 219 Paul Street, San Antonio, TX

## Property Overview
- **Internal Code**: 219-PAU-HOME
- **Type**: House | **Listing**: Entire Home
- **Bedrooms**: 3 | **Bathrooms**: 2
- **Max Guests**: 6
- **Check-in**: 3:00 PM | **Check-out**: 11:00 AM
- **Minimum Stay**: 1 night(s) | **Maximum Stay**: 365 nights
- **Nightly Rate**: $140 (base)
- **Cancellation Policy**: Strict
- **Address**: 219 Paul Street, San Antonio, TX 78203

## WiFi
- **Network**: Patitos-2g
- **Password**: VictorOlivia96*

## Access & Check-in
- **Primary Method**: There is a door code
- **Alternative Method**: The keys are hidden in secret spot

## Parking
- **Free Parking (On premises)**
- **Free Parking (On street)**

## Amenities

### Bedroom
- Desk
- Desk chair
- Iron — Livingroom corner
- Hangers — Closet room
- Lock on bedroom

### Throughout the Property
- Smart TV — Living room
- Air Conditioning — Entire home
- Heating — Entire home
- Internet Wifi — Livingroom next firepit
- Wifi speed (250+ Mbps)
- Fenced yard
- Smoke Detector — Each room
- Fire Extinguisher — Over Fridge (kitchen)
- Deadbolt lock — smart lock entrance, rooms privacity lock
- Outdoor lighting
- Essentials
- Ceiling Fan — Room
- First aid kit — Over fridge in the kitchen
- Linens Provided
- Towels Provided
- Deck/Patio
- 24-hour checkin
- House Rules Poster
- Children Not Allowed
- Infant Not Allowed

### Living Room
- TV — Living room

### Kitchen
- Kitchen
- Pots Pans — Cabiet in the kitchen
- Oven
- Microwave Oven
- Water Kettle
- Coffee Maker
- Dishwasher
- Fridge
- Kitchen island
- Dining table
- Stove
- Cooking Basics — Cabinet next to the sink
- Baking sheet
- Blender — Cabinet next to the fridge (left side)
- Coffee — Kitchen (next to the fridge)
- Freezer

### Bathroom
- Hair Dryer — Bathroom
- Shampoo
- Hot Water
- Body soap — Bathroom

## House Rules
- 🔸No shoes in the house (Flip flops or slippers are welcome ☺️)
- 🔸Laundry's fee $20
- 🔸Late checkouts will incur a fee of $50
- 🔸Any smoking odor or smell left inside the property will bring a $100 fee for the extra cleaning needed.
- 🔸No pets (No animals due to allergies)
- 🔸No unregistered guests
- 🔸No parties

## Cancellation Policy
**Strict** — Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.

## Fees
- **Cleaning Fee**: $119
- **Security Deposit**: $238
- **Extra Guest Fee**: $35/night (over base occupancy of 6)

## Booking Details
- **Currency**: US Dollar
- **Payment at Booking**: 50% of total
- **Final Payment**: 45 days before check-in
- **Booking Window**: Up to 12 months in advance`;

  const VLRE_PROPERTY_1602_BLU_KB_CONTENT = `#  — 1602 Bluebird Dr, Bailey, CO

## Property Overview
- **Internal Code**: 
- **Type**: Cabin | **Listing**: Entire Home
- **Bedrooms**: 3 | **Bathrooms**: 2
- **Max Guests**: 0
- **Check-in**:  | **Check-out**: 
- **Minimum Stay**: 0 night(s) | **Maximum Stay**: 0 nights
- **Cancellation Policy**: 
- **Address**: 1602 Bluebird Dr, Bailey, CO 80421

## WiFi

## Access & Check-in

## Parking
Parking details not specified.

## Amenities

### Throughout the Property
- Smart TV
- Heating
- Internet Wifi
- Paid Wifi
- Wifi speed (100+ Mbps)
- Washer
- Dryer
- Fenced yard
- Indoor Fireplace
- Single level home
- Smoke Detector
- Deadbolt lock
- Outdoor lighting
- EV car charger
- Deck/Patio
- Fire pit
- Hammock
- Outdoor seating
- Fireplace guards
- Outlet covers
- Rural
- Mountain
- Allow Pets
- Allow Children

### Kitchen
- Oven
- Microwave Oven
- Coffee Maker
- Fridge
- Stove
- Freezer

### Bathroom
- Ventilation Fan
- Hot Water

## House Rules
No specific house rules provided.

## Fees

## Booking Details`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dozalDevsSummarizerArchetype = await (prisma.archetype as any).upsert({
    where: { id: '00000000-0000-0000-0000-000000000012' },
    create: {
      id: '00000000-0000-0000-0000-000000000012',
      role_name: 'daily-summarizer',
      runtime: 'opencode',
      system_prompt: '',
      instructions: DOZALDEVS_SUMMARIZER_INSTRUCTIONS,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'slack_message',
      tool_registry: { tools: ['/tools/slack/read-channels.js', '/tools/slack/post-message.js'] },
      trigger_sources: { type: 'cron', expression: '0 8 * * 1-5', timezone: 'America/Chicago' },
      risk_model: { approval_required: true, timeout_hours: 24 },
      notification_channel: null,
      concurrency_limit: 1,
      agents_md: DOZALDEVS_SUMMARIZER_AGENTS_MD,
      delivery_instructions:
        'Post the approved summary to the configured Slack publish channel. Write confirmation to /tmp/summary.txt with { "delivered": true }.',
      tenant_id: '00000000-0000-0000-0000-000000000002',
      department_id: '00000000-0000-0000-0000-000000000020',
    },
    update: {
      role_name: 'daily-summarizer',
      runtime: 'opencode',
      system_prompt: '',
      instructions: DOZALDEVS_SUMMARIZER_INSTRUCTIONS,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'slack_message',
      tool_registry: { tools: ['/tools/slack/read-channels.js', '/tools/slack/post-message.js'] },
      trigger_sources: { type: 'cron', expression: '0 8 * * 1-5', timezone: 'America/Chicago' },
      risk_model: { approval_required: true, timeout_hours: 24 },
      notification_channel: null,
      concurrency_limit: 1,
      agents_md: DOZALDEVS_SUMMARIZER_AGENTS_MD,
      delivery_instructions:
        'Post the approved summary to the configured Slack publish channel. Write confirmation to /tmp/summary.txt with { "delivered": true }.',
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
      system_prompt: '',
      instructions: VLRE_SUMMARIZER_INSTRUCTIONS,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'slack_message',
      tool_registry: { tools: ['/tools/slack/read-channels.js', '/tools/slack/post-message.js'] },
      trigger_sources: { type: 'cron', expression: '0 8 * * 1-5', timezone: 'America/Chicago' },
      risk_model: { approval_required: true, timeout_hours: 24 },
      notification_channel: null,
      concurrency_limit: 1,
      agents_md: VLRE_SUMMARIZER_AGENTS_MD,
      delivery_instructions:
        'Post the approved summary to the configured Slack publish channel. Write confirmation to /tmp/summary.txt with { "delivered": true }.',
      tenant_id: '00000000-0000-0000-0000-000000000003',
      department_id: '00000000-0000-0000-0000-000000000021',
    },
    update: {
      role_name: 'daily-summarizer',
      runtime: 'opencode',
      system_prompt: '',
      instructions: VLRE_SUMMARIZER_INSTRUCTIONS,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'slack_message',
      tool_registry: { tools: ['/tools/slack/read-channels.js', '/tools/slack/post-message.js'] },
      trigger_sources: { type: 'cron', expression: '0 8 * * 1-5', timezone: 'America/Chicago' },
      risk_model: { approval_required: true, timeout_hours: 24 },
      notification_channel: null,
      concurrency_limit: 1,
      agents_md: VLRE_SUMMARIZER_AGENTS_MD,
      delivery_instructions:
        'Post the approved summary to the configured Slack publish channel. Write confirmation to /tmp/summary.txt with { "delivered": true }.',
      department_id: '00000000-0000-0000-0000-000000000021',
    },
  });

  console.log(
    `✅ Archetype upserted: ${vlreSummarizerArchetype.id} (role: ${vlreSummarizerArchetype.role_name}, model: ${vlreSummarizerArchetype.model})`,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vlreGuestMessaging = await (prisma.archetype as any).upsert({
    where: { id: '00000000-0000-0000-0000-000000000015' },
    create: {
      id: '00000000-0000-0000-0000-000000000015',
      role_name: 'guest-messaging',
      runtime: 'opencode',
      system_prompt: '',
      instructions: VLRE_GUEST_MESSAGING_INSTRUCTIONS,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'hostfully_message',
      tool_registry: {
        tools: [
          '/tools/hostfully/get-property.ts',
          '/tools/hostfully/get-reservations.ts',
          '/tools/hostfully/get-messages.ts',
          '/tools/hostfully/send-message.ts',
          '/tools/slack/post-message.ts',
          '/tools/slack/post-guest-approval.ts',
          '/tools/slack/read-channels.ts',
          '/tools/platform/report-issue.ts',
          '/tools/knowledge_base/search.ts',
          '/tools/sifely/diagnose-access.ts',
        ],
      },
      trigger_sources: { type: 'cron_and_webhook', cron_expression: '*/5 * * * *' },
      risk_model: { approval_required: true, timeout_hours: 24 },
      notification_channel: 'C0AMGJQN05S',
      concurrency_limit: 5, // webhook-triggered: multiple concurrent guests
      agents_md: GUEST_MESSAGING_AGENTS_MD,
      delivery_instructions: `You are delivering an approved guest reply via Hostfully. The APPROVED CONTENT below is a JSON object from the previous phase.

STEPS:
1. Get the lead_uid and thread_uid. They are available in TWO places — use whichever is non-empty:
   a. Environment variables (PREFERRED): run "echo $LEAD_UID" and "echo $THREAD_UID" in bash
   b. Parse the APPROVED CONTENT JSON and extract "metadata.lead_uid" and "metadata.thread_uid"
2. Get the message to send: parse the APPROVED CONTENT JSON and extract the "draft" field.
3. Send the message using the Hostfully send-message tool:
   tsx /tools/hostfully/send-message.ts --lead-id <lead_uid> --thread-id <thread_uid> --message "<draft text>"
4. If send succeeds, write to /tmp/summary.txt:
   {"delivered": true}
5. If send fails, write to /tmp/summary.txt:
   {"delivered": false, "error": "<reason>"}

CRITICAL: --lead-id is REQUIRED. --thread-id is optional but use it when available. Do NOT search for unresponded messages.`,
      enrichment_adapter: 'hostfully',
      tenant_id: '00000000-0000-0000-0000-000000000003', // VLRE
      department_id: '00000000-0000-0000-0000-000000000021', // VLRE department
    },
    update: {
      role_name: 'guest-messaging',
      runtime: 'opencode',
      system_prompt: '',
      instructions: VLRE_GUEST_MESSAGING_INSTRUCTIONS,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'hostfully_message',
      tool_registry: {
        tools: [
          '/tools/hostfully/get-property.ts',
          '/tools/hostfully/get-reservations.ts',
          '/tools/hostfully/get-messages.ts',
          '/tools/hostfully/send-message.ts',
          '/tools/slack/post-message.ts',
          '/tools/slack/post-guest-approval.ts',
          '/tools/slack/read-channels.ts',
          '/tools/platform/report-issue.ts',
          '/tools/knowledge_base/search.ts',
          '/tools/sifely/diagnose-access.ts',
        ],
      },
      trigger_sources: { type: 'cron_and_webhook', cron_expression: '*/5 * * * *' },
      risk_model: { approval_required: true, timeout_hours: 24 },
      notification_channel: 'C0AMGJQN05S',
      concurrency_limit: 5,
      agents_md: GUEST_MESSAGING_AGENTS_MD,
      delivery_instructions: `You are delivering an approved guest reply via Hostfully. The APPROVED CONTENT below is a JSON object from the previous phase.

STEPS:
1. Get the lead_uid and thread_uid. They are available in TWO places — use whichever is non-empty:
   a. Environment variables (PREFERRED): run "echo $LEAD_UID" and "echo $THREAD_UID" in bash
   b. Parse the APPROVED CONTENT JSON and extract "metadata.lead_uid" and "metadata.thread_uid"
2. Get the message to send: parse the APPROVED CONTENT JSON and extract the "draft" field.
3. Send the message using the Hostfully send-message tool:
   tsx /tools/hostfully/send-message.ts --lead-id <lead_uid> --thread-id <thread_uid> --message "<draft text>"
4. If send succeeds, write to /tmp/summary.txt:
   {"delivered": true}
5. If send fails, write to /tmp/summary.txt:
   {"delivered": false, "error": "<reason>"}

CRITICAL: --lead-id is REQUIRED. --thread-id is optional but use it when available. Do NOT search for unresponded messages.`,
      enrichment_adapter: 'hostfully',
      department_id: '00000000-0000-0000-0000-000000000021',
    },
  });

  console.log(
    `✅ Archetype upserted: ${vlreGuestMessaging.id} (role: ${vlreGuestMessaging.role_name}, model: ${vlreGuestMessaging.model})`,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vlreCodeRotation = await (prisma.archetype as any).upsert({
    where: { id: '00000000-0000-0000-0000-000000000016' },
    create: {
      id: '00000000-0000-0000-0000-000000000016',
      role_name: 'code-rotation',
      runtime: 'opencode',
      system_prompt: '',
      instructions: `Rotate all lock codes for VLRE properties that have a guest checkout today.

1. Get today's date.
2. Fetch all VLRE property IDs from the database.
3. For each property, check Hostfully for a guest checkout today. Skip properties with no checkout.
4. For each qualifying property, generate a new memorable passcode:
   tsx /tools/sifely/generate-code.ts
5. Update the Sifely lock with the new passcode:
   tsx /tools/sifely/rotate-property-code.ts --property-id <uid>
6. Update the Hostfully door code to match:
   tsx /tools/hostfully/update-door-code.ts --property-id <uid> --code <digits>
7. Process properties one at a time — never in parallel (Sifely rate limits require sequential processing).
8. If a single property fails, document the error and continue with the rest.
9. Post rotation summary to Slack:
   tsx /tools/slack/post-message.ts --thread-ts "$NOTIFY_MSG_TS" --channel "$NOTIFICATION_CHANNEL" --text "<summary>"

CLASSIFICATION RULES:
- Use NO_ACTION_NEEDED if no properties had a checkout today.
- Use NEEDS_APPROVAL if rotation completed with failures needing human review.
- Use confidence 0.9.

FINAL STEP (MANDATORY):
tsx /tools/platform/submit-output.ts \\
  --summary "Rotated codes for X properties (Y succeeded, Z failed)" \\
  --classification "NO_ACTION_NEEDED"`,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'lock_code_rotation',
      tool_registry: {
        tools: ['/tools/sifely/rotate-property-code.ts', '/tools/slack/post-message.ts'],
      },
      trigger_sources: { type: 'manual' },
      risk_model: { approval_required: false, timeout_hours: 2 },
      notification_channel: 'C0960S2Q8RL',
      concurrency_limit: 1, // one rotation run at a time — Sifely rate limits
      agents_md: CODE_ROTATION_AGENTS_MD,
      delivery_instructions: null,
      enrichment_adapter: null,
      tenant_id: '00000000-0000-0000-0000-000000000003', // VLRE
      department_id: '00000000-0000-0000-0000-000000000021', // VLRE department
    },
    update: {
      role_name: 'code-rotation',
      runtime: 'opencode',
      system_prompt: '',
      instructions: `Rotate all lock codes for VLRE properties that have a guest checkout today.

1. Get today's date.
2. Fetch all VLRE property IDs from the database.
3. For each property, check Hostfully for a guest checkout today. Skip properties with no checkout.
4. For each qualifying property, generate a new memorable passcode:
   tsx /tools/sifely/generate-code.ts
5. Update the Sifely lock with the new passcode:
   tsx /tools/sifely/rotate-property-code.ts --property-id <uid>
6. Update the Hostfully door code to match:
   tsx /tools/hostfully/update-door-code.ts --property-id <uid> --code <digits>
7. Process properties one at a time — never in parallel (Sifely rate limits require sequential processing).
8. If a single property fails, document the error and continue with the rest.
9. Post rotation summary to Slack:
   tsx /tools/slack/post-message.ts --thread-ts "$NOTIFY_MSG_TS" --channel "$NOTIFICATION_CHANNEL" --text "<summary>"

CLASSIFICATION RULES:
- Use NO_ACTION_NEEDED if no properties had a checkout today.
- Use NEEDS_APPROVAL if rotation completed with failures needing human review.
- Use confidence 0.9.

FINAL STEP (MANDATORY):
tsx /tools/platform/submit-output.ts \\
  --summary "Rotated codes for X properties (Y succeeded, Z failed)" \\
  --classification "NO_ACTION_NEEDED"`,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'lock_code_rotation',
      tool_registry: {
        tools: ['/tools/sifely/rotate-property-code.ts', '/tools/slack/post-message.ts'],
      },
      trigger_sources: { type: 'manual' },
      risk_model: { approval_required: false, timeout_hours: 2 },
      notification_channel: 'C0960S2Q8RL',
      concurrency_limit: 1,
      agents_md: CODE_ROTATION_AGENTS_MD,
      delivery_instructions: null,
      enrichment_adapter: null,
      department_id: '00000000-0000-0000-0000-000000000021',
      tenant_id: '00000000-0000-0000-0000-000000000003', // VLRE — explicitly set on update to fix prior wrong-tenant seed
    },
  });

  console.log(
    `✅ Archetype upserted: ${vlreCodeRotation.id} (role: ${vlreCodeRotation.role_name}, model: ${vlreCodeRotation.model})`,
  );

  // KB seed — common (tenant-wide, VLRE)
  const vlreCommonKb = await prisma.knowledgeBaseEntry.upsert({
    where: { id: '00000000-0000-0000-0000-000000000100' },
    update: { content: VLRE_COMMON_KB_CONTENT },
    create: {
      id: '00000000-0000-0000-0000-000000000100',
      tenant_id: '00000000-0000-0000-0000-000000000003',
      entity_type: null,
      entity_id: null,
      scope: 'common',
      content: VLRE_COMMON_KB_CONTENT,
    },
  });

  console.log(`✅ KnowledgeBaseEntry upserted: ${vlreCommonKb.id} (scope: ${vlreCommonKb.scope})`);

  // KB seed — VLRE property 3505-ban (vlre-3505-ban)
  const vlrePropertyKb = await prisma.knowledgeBaseEntry.upsert({
    where: { id: '00000000-0000-0000-0000-000000000101' },
    update: { content: VLRE_PROPERTY_3505_BAN_KB_CONTENT, entity_id: 'vlre-3505-ban' },
    create: {
      id: '00000000-0000-0000-0000-000000000101',
      tenant_id: '00000000-0000-0000-0000-000000000003',
      entity_type: 'property',
      entity_id: 'vlre-3505-ban',
      scope: 'entity',
      content: VLRE_PROPERTY_3505_BAN_KB_CONTENT,
    },
  });

  console.log(
    `✅ KnowledgeBaseEntry upserted: ${vlrePropertyKb.id} (scope: ${vlrePropertyKb.scope}, entity_id: ${vlrePropertyKb.entity_id})`,
  );

  // KB seed — test property Alpha (multi-property verification)
  const vlrePropertyAlphaKb = await prisma.knowledgeBaseEntry.upsert({
    where: { id: '00000000-0000-0000-0000-000000000102' },
    update: {
      content:
        '# Test Property Alpha\n\nThis is a test property for multi-property verification.\n\n## Check-in\nCheck-in time: 4:00 PM\nSelf check-in with smart lock code.\n\n## WiFi\nNetwork: AlphaGuest\nPassword: alpha2024',
    },
    create: {
      id: '00000000-0000-0000-0000-000000000102',
      tenant_id: '00000000-0000-0000-0000-000000000003',
      entity_type: 'property',
      entity_id: 'test-property-alpha',
      scope: 'entity',
      content:
        '# Test Property Alpha\n\nThis is a test property for multi-property verification.\n\n## Check-in\nCheck-in time: 4:00 PM\nSelf check-in with smart lock code.\n\n## WiFi\nNetwork: AlphaGuest\nPassword: alpha2024',
    },
  });

  console.log(
    `✅ KnowledgeBaseEntry upserted: ${vlrePropertyAlphaKb.id} (scope: ${vlrePropertyAlphaKb.scope}, entity_id: ${vlrePropertyAlphaKb.entity_id})`,
  );

  // KB seed — test property Beta (multi-property verification)
  const vlrePropertyBetaKb = await prisma.knowledgeBaseEntry.upsert({
    where: { id: '00000000-0000-0000-0000-000000000103' },
    update: {
      content:
        '# Test Property Beta\n\nSecond test property for multi-property verification.\n\n## Check-in\nCheck-in time: 3:00 PM\nMeet host at front door.\n\n## WiFi\nNetwork: BetaWifi\nPassword: beta2024',
    },
    create: {
      id: '00000000-0000-0000-0000-000000000103',
      tenant_id: '00000000-0000-0000-0000-000000000003',
      entity_type: 'property',
      entity_id: 'test-property-beta',
      scope: 'entity',
      content:
        '# Test Property Beta\n\nSecond test property for multi-property verification.\n\n## Check-in\nCheck-in time: 3:00 PM\nMeet host at front door.\n\n## WiFi\nNetwork: BetaWifi\nPassword: beta2024',
    },
  });

  console.log(
    `✅ KnowledgeBaseEntry upserted: ${vlrePropertyBetaKb.id} (scope: ${vlrePropertyBetaKb.scope}, entity_id: ${vlrePropertyBetaKb.entity_id})`,
  );

  // KB seed — VLRE property 3412-san (4d23f49c-84e1-4a55-bfd4-3a5dec15e7b9)
  const vlreProperty3412SanKb = await prisma.knowledgeBaseEntry.upsert({
    where: { id: '00000000-0000-0000-0000-000000000104' },
    update: { content: VLRE_PROPERTY_3412_SAN_KB_CONTENT },
    create: {
      id: '00000000-0000-0000-0000-000000000104',
      tenant_id: '00000000-0000-0000-0000-000000000003',
      entity_type: 'property',
      entity_id: '4d23f49c-84e1-4a55-bfd4-3a5dec15e7b9',
      scope: 'entity',
      content: VLRE_PROPERTY_3412_SAN_KB_CONTENT,
    },
  });
  console.log(
    `✅ KnowledgeBaseEntry upserted: ${vlreProperty3412SanKb.id} (scope: ${vlreProperty3412SanKb.scope}, entity_id: ${vlreProperty3412SanKb.entity_id})`,
  );

  // KB seed — VLRE property 3420-hov (2c64f880-90d2-4659-9b02-7b937763e9e1)
  const vlreProperty3420HovKb = await prisma.knowledgeBaseEntry.upsert({
    where: { id: '00000000-0000-0000-0000-000000000105' },
    update: { content: VLRE_PROPERTY_3420_HOV_KB_CONTENT },
    create: {
      id: '00000000-0000-0000-0000-000000000105',
      tenant_id: '00000000-0000-0000-0000-000000000003',
      entity_type: 'property',
      entity_id: '2c64f880-90d2-4659-9b02-7b937763e9e1',
      scope: 'entity',
      content: VLRE_PROPERTY_3420_HOV_KB_CONTENT,
    },
  });
  console.log(
    `✅ KnowledgeBaseEntry upserted: ${vlreProperty3420HovKb.id} (scope: ${vlreProperty3420HovKb.scope}, entity_id: ${vlreProperty3420HovKb.entity_id})`,
  );

  // KB seed — VLRE property 3401-bre (6e6169bf-8418-448b-8fd9-a89135e5e358)
  const vlreProperty3401BreKb = await prisma.knowledgeBaseEntry.upsert({
    where: { id: '00000000-0000-0000-0000-000000000106' },
    update: { content: VLRE_PROPERTY_3401_BRE_KB_CONTENT },
    create: {
      id: '00000000-0000-0000-0000-000000000106',
      tenant_id: '00000000-0000-0000-0000-000000000003',
      entity_type: 'property',
      entity_id: '6e6169bf-8418-448b-8fd9-a89135e5e358',
      scope: 'entity',
      content: VLRE_PROPERTY_3401_BRE_KB_CONTENT,
    },
  });
  console.log(
    `✅ KnowledgeBaseEntry upserted: ${vlreProperty3401BreKb.id} (scope: ${vlreProperty3401BreKb.scope}, entity_id: ${vlreProperty3401BreKb.entity_id})`,
  );

  // KB seed — VLRE property 271-gin (646ca297-5edf-474f-8b14-a0ee2935f2dd)
  const vlreProperty271GinKb = await prisma.knowledgeBaseEntry.upsert({
    where: { id: '00000000-0000-0000-0000-000000000107' },
    update: { content: VLRE_PROPERTY_271_GIN_KB_CONTENT },
    create: {
      id: '00000000-0000-0000-0000-000000000107',
      tenant_id: '00000000-0000-0000-0000-000000000003',
      entity_type: 'property',
      entity_id: '646ca297-5edf-474f-8b14-a0ee2935f2dd',
      scope: 'entity',
      content: VLRE_PROPERTY_271_GIN_KB_CONTENT,
    },
  });
  console.log(
    `✅ KnowledgeBaseEntry upserted: ${vlreProperty271GinKb.id} (scope: ${vlreProperty271GinKb.scope}, entity_id: ${vlreProperty271GinKb.entity_id})`,
  );

  // KB seed — VLRE property 219-pau (3fa27670-f4f6-443b-a412-6078d4f5517e)
  const vlreProperty219PauKb = await prisma.knowledgeBaseEntry.upsert({
    where: { id: '00000000-0000-0000-0000-000000000108' },
    update: { content: VLRE_PROPERTY_219_PAU_KB_CONTENT },
    create: {
      id: '00000000-0000-0000-0000-000000000108',
      tenant_id: '00000000-0000-0000-0000-000000000003',
      entity_type: 'property',
      entity_id: '3fa27670-f4f6-443b-a412-6078d4f5517e',
      scope: 'entity',
      content: VLRE_PROPERTY_219_PAU_KB_CONTENT,
    },
  });
  console.log(
    `✅ KnowledgeBaseEntry upserted: ${vlreProperty219PauKb.id} (scope: ${vlreProperty219PauKb.scope}, entity_id: ${vlreProperty219PauKb.entity_id})`,
  );

  // KB seed — VLRE property 1602-blu (dac5a0e0-3984-4f72-b622-de45a9dd758f)
  const vlreProperty1602BluKb = await prisma.knowledgeBaseEntry.upsert({
    where: { id: '00000000-0000-0000-0000-000000000109' },
    update: { content: VLRE_PROPERTY_1602_BLU_KB_CONTENT },
    create: {
      id: '00000000-0000-0000-0000-000000000109',
      tenant_id: '00000000-0000-0000-0000-000000000003',
      entity_type: 'property',
      entity_id: 'dac5a0e0-3984-4f72-b622-de45a9dd758f',
      scope: 'entity',
      content: VLRE_PROPERTY_1602_BLU_KB_CONTENT,
    },
  });
  console.log(
    `✅ KnowledgeBaseEntry upserted: ${vlreProperty1602BluKb.id} (scope: ${vlreProperty1602BluKb.scope}, entity_id: ${vlreProperty1602BluKb.entity_id})`,
  );

  // =============================================================================
  // VLRE Property-Lock Mappings (Sifely smart locks)
  // Source: vlre-hub/apps/api/src/data/properties.json
  //
  // lock_role derivation from lock name:
  //   "FRONT-DOOR" → FRONT_DOOR
  //   "BACK-DOOR"  → BACK_DOOR
  //   "-ROOM-"     → ROOM_DOOR
  //   else         → COMMON_AREA
  //
  // To store Sifely credentials for VLRE tenant via admin API:
  //   curl -X PUT -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  //     "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/sifely_client_id" \
  //     -d '{"value":"VLRE"}'
  //   curl -X PUT -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  //     "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/sifely_username" \
  //     -d '{"value":"admin@vlrealestate.co"}'
  //   curl -X PUT -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  //     "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/sifely_password" \
  //     -d '{"value":"<md5-hash-of-password>"}'
  // =============================================================================

  const VLRE_TENANT_ID = '00000000-0000-0000-0000-000000000003';

  const propertyLockData = [
    // 219-PAU-HOME (3fa27670-f4f6-443b-a412-6078d4f5517e) — entire home, San Antonio
    {
      id: 'dac3ed5b-a9e3-4c35-b371-991e9c6c77c7',
      property_external_id: '3fa27670-f4f6-443b-a412-6078d4f5517e',
      lock_external_id: '5280922',
      lock_name: '219-PAU-HOME-FRONT-DOOR',
      lock_role: 'FRONT_DOOR',
      property_type: 'home',
      property_name: '219-PAU-HOME',
    },
    {
      id: '0f875a8c-d7f2-4462-b080-59dc9e6cbb5d',
      property_external_id: '3fa27670-f4f6-443b-a412-6078d4f5517e',
      lock_external_id: '5197968',
      lock_name: '219-PAU-HOME-BACK-DOOR',
      lock_role: 'BACK_DOOR',
      property_type: 'home',
      property_name: '219-PAU-HOME',
    },
    // 271-GIN-1 (039bfa35-70d4-4c9b-89a3-4f36fe7f1441) — room, Kyle TX
    {
      id: 'b02773dc-943b-4599-9f9d-dc4ebba70fec',
      property_external_id: '039bfa35-70d4-4c9b-89a3-4f36fe7f1441',
      lock_external_id: '4831824',
      lock_name: '271-GIN-FRONT-DOOR',
      lock_role: 'FRONT_DOOR',
      property_type: 'room',
      property_name: '271-GIN-1',
    },
    {
      id: '454a777a-4a5b-4d3d-963f-d44e5fa0b959',
      property_external_id: '039bfa35-70d4-4c9b-89a3-4f36fe7f1441',
      lock_external_id: '5002738',
      lock_name: '271-GIN-1-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'room',
      property_name: '271-GIN-1',
    },
    // 271-GIN-2 (1348a7a1-f10f-4139-a9b3-a4c3e4ffa888) — room, Kyle TX
    {
      id: '9d20115d-710c-479d-bc00-0bcfe2f11d10',
      property_external_id: '1348a7a1-f10f-4139-a9b3-a4c3e4ffa888',
      lock_external_id: '4831824',
      lock_name: '271-GIN-FRONT-DOOR',
      lock_role: 'FRONT_DOOR',
      property_type: 'room',
      property_name: '271-GIN-2',
    },
    {
      id: 'fa938a64-d7e8-4bcd-aeff-5e176901ebae',
      property_external_id: '1348a7a1-f10f-4139-a9b3-a4c3e4ffa888',
      lock_external_id: '5002706',
      lock_name: '271-GIN-2-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'room',
      property_name: '271-GIN-2',
    },
    // 271-GIN-3 (6b8c44b3-c7b1-49ab-8659-42336e3a3781) — room, Kyle TX
    {
      id: 'bddf589c-bcc4-48f4-b5e0-d14e67ec5792',
      property_external_id: '6b8c44b3-c7b1-49ab-8659-42336e3a3781',
      lock_external_id: '4831824',
      lock_name: '271-GIN-FRONT-DOOR',
      lock_role: 'FRONT_DOOR',
      property_type: 'room',
      property_name: '271-GIN-3',
    },
    {
      id: 'cc2190bb-dcd5-458a-a31f-78e300cee9f1',
      property_external_id: '6b8c44b3-c7b1-49ab-8659-42336e3a3781',
      lock_external_id: '5002746',
      lock_name: '271-GIN-3-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'room',
      property_name: '271-GIN-3',
    },
    // 271-GIN-4 (571db2ba-3ed9-4d1a-b5f4-18c189a412fc) — room, Kyle TX
    {
      id: 'd707ca6b-fca6-4c14-ac27-96167f422c10',
      property_external_id: '571db2ba-3ed9-4d1a-b5f4-18c189a412fc',
      lock_external_id: '4831824',
      lock_name: '271-GIN-FRONT-DOOR',
      lock_role: 'FRONT_DOOR',
      property_type: 'room',
      property_name: '271-GIN-4',
    },
    {
      id: '88925685-9be8-4de8-b718-c0b524868200',
      property_external_id: '571db2ba-3ed9-4d1a-b5f4-18c189a412fc',
      lock_external_id: '5411126',
      lock_name: '271-GIN-4-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'room',
      property_name: '271-GIN-4',
    },
    // 271-GIN-HOME (646ca297-5edf-474f-8b14-a0ee2935f2dd) — entire home, Kyle TX
    {
      id: 'eadef056-c2c1-47c4-9c8e-4b3eede3414c',
      property_external_id: '646ca297-5edf-474f-8b14-a0ee2935f2dd',
      lock_external_id: '4831824',
      lock_name: '271-GIN-FRONT-DOOR',
      lock_role: 'FRONT_DOOR',
      property_type: 'home',
      property_name: '271-GIN-HOME',
    },
    {
      id: 'e210004f-ffc1-4c6e-9d95-c8323d98f755',
      property_external_id: '646ca297-5edf-474f-8b14-a0ee2935f2dd',
      lock_external_id: '5002738',
      lock_name: '271-GIN-1-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '271-GIN-HOME',
    },
    {
      id: '6a56b486-93df-4112-9ed1-9c9e65bd5b8a',
      property_external_id: '646ca297-5edf-474f-8b14-a0ee2935f2dd',
      lock_external_id: '5002706',
      lock_name: '271-GIN-2-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '271-GIN-HOME',
    },
    {
      id: 'd589c538-5818-41e9-90a6-433e92f6411c',
      property_external_id: '646ca297-5edf-474f-8b14-a0ee2935f2dd',
      lock_external_id: '5002746',
      lock_name: '271-GIN-3-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '271-GIN-HOME',
    },
    {
      id: 'aff7c8f5-739d-4cc3-98b0-6c2f5b933f96',
      property_external_id: '646ca297-5edf-474f-8b14-a0ee2935f2dd',
      lock_external_id: '5411126',
      lock_name: '271-GIN-4-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '271-GIN-HOME',
    },
    // 3401-BRE-1 (40b69579-efba-47b5-b566-1c96f0f85ac7) — room, Austin TX
    {
      id: 'bdb602b9-a740-4110-ac2f-ca2cf3c482b0',
      property_external_id: '40b69579-efba-47b5-b566-1c96f0f85ac7',
      lock_external_id: '5447540',
      lock_name: '3401-BRE-FRONT-DOOR',
      lock_role: 'FRONT_DOOR',
      property_type: 'room',
      property_name: '3401-BRE-1',
    },
    {
      id: 'bbcf95a0-81c9-4313-9e7b-24e5665c9d4d',
      property_external_id: '40b69579-efba-47b5-b566-1c96f0f85ac7',
      lock_external_id: '4302846',
      lock_name: '3401-BRE-BACK-DOOR',
      lock_role: 'BACK_DOOR',
      property_type: 'room',
      property_name: '3401-BRE-1',
    },
    {
      id: 'a5d1fa66-6fb8-44db-b5f1-753326251dfb',
      property_external_id: '40b69579-efba-47b5-b566-1c96f0f85ac7',
      lock_external_id: '4318724',
      lock_name: '3401-BRE-1-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'room',
      property_name: '3401-BRE-1',
    },
    // 3401-BRE-2 (cebffff2-81a2-43d0-b45e-29aa82893d1a) — room, Austin TX
    {
      id: '9421b47a-853b-4a26-81c0-dd82662a8056',
      property_external_id: 'cebffff2-81a2-43d0-b45e-29aa82893d1a',
      lock_external_id: '5447540',
      lock_name: '3401-BRE-FRONT-DOOR',
      lock_role: 'FRONT_DOOR',
      property_type: 'room',
      property_name: '3401-BRE-2',
    },
    {
      id: 'fbc3ce38-31d5-4907-a590-b21fafbcb0f5',
      property_external_id: 'cebffff2-81a2-43d0-b45e-29aa82893d1a',
      lock_external_id: '4302846',
      lock_name: '3401-BRE-BACK-DOOR',
      lock_role: 'BACK_DOOR',
      property_type: 'room',
      property_name: '3401-BRE-2',
    },
    {
      id: '0261ea02-34d8-4793-af11-3382492b09e2',
      property_external_id: 'cebffff2-81a2-43d0-b45e-29aa82893d1a',
      lock_external_id: '4318628',
      lock_name: '3401-BRE-2-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'room',
      property_name: '3401-BRE-2',
    },
    // 3401-BRE-3 (223c0601-045d-49a4-8dfe-a66606b6e167) — room, Austin TX
    {
      id: '845a7ce2-f071-4813-87c2-e0057934265a',
      property_external_id: '223c0601-045d-49a4-8dfe-a66606b6e167',
      lock_external_id: '5447540',
      lock_name: '3401-BRE-FRONT-DOOR',
      lock_role: 'FRONT_DOOR',
      property_type: 'room',
      property_name: '3401-BRE-3',
    },
    {
      id: '2881e50a-5b48-44bb-8030-7765b42994f7',
      property_external_id: '223c0601-045d-49a4-8dfe-a66606b6e167',
      lock_external_id: '4302846',
      lock_name: '3401-BRE-BACK-DOOR',
      lock_role: 'BACK_DOOR',
      property_type: 'room',
      property_name: '3401-BRE-3',
    },
    {
      id: 'cbb691bc-3f47-401f-8de2-20b3c0bcb4cf',
      property_external_id: '223c0601-045d-49a4-8dfe-a66606b6e167',
      lock_external_id: '4318552',
      lock_name: '3401-BRE-3-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'room',
      property_name: '3401-BRE-3',
    },
    // 3401-BRE-HOME (6e6169bf-8418-448b-8fd9-a89135e5e358) — entire home, Austin TX
    {
      id: 'efbdce49-e191-4fac-9d17-35bb8a88b333',
      property_external_id: '6e6169bf-8418-448b-8fd9-a89135e5e358',
      lock_external_id: '5447540',
      lock_name: '3401-BRE-FRONT-DOOR',
      lock_role: 'FRONT_DOOR',
      property_type: 'home',
      property_name: '3401-BRE-HOME',
    },
    {
      id: '2b1829fd-2c27-412f-9411-b90895b9660e',
      property_external_id: '6e6169bf-8418-448b-8fd9-a89135e5e358',
      lock_external_id: '4302846',
      lock_name: '3401-BRE-BACK-DOOR',
      lock_role: 'BACK_DOOR',
      property_type: 'home',
      property_name: '3401-BRE-HOME',
    },
    {
      id: 'a9c3ae9d-725f-4604-8ce6-497eae3bed81',
      property_external_id: '6e6169bf-8418-448b-8fd9-a89135e5e358',
      lock_external_id: '4318724',
      lock_name: '3401-BRE-1-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '3401-BRE-HOME',
    },
    {
      id: '95bdc961-aedb-42a6-b143-c6705e55498e',
      property_external_id: '6e6169bf-8418-448b-8fd9-a89135e5e358',
      lock_external_id: '4318628',
      lock_name: '3401-BRE-2-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '3401-BRE-HOME',
    },
    {
      id: '3c3603d7-4d57-40bf-a5c7-6430c398a1a9',
      property_external_id: '6e6169bf-8418-448b-8fd9-a89135e5e358',
      lock_external_id: '4318552',
      lock_name: '3401-BRE-3-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '3401-BRE-HOME',
    },
    // 3412-SAN-HOME (4d23f49c-84e1-4a55-bfd4-3a5dec15e7b9) — entire home, Austin TX
    {
      id: '359909b9-bd15-4d8a-a82a-f06c345e8046',
      property_external_id: '4d23f49c-84e1-4a55-bfd4-3a5dec15e7b9',
      lock_external_id: '5804542',
      lock_name: '3412-SAN-FRONT-DOOR',
      lock_role: 'FRONT_DOOR',
      property_type: 'home',
      property_name: '3412-SAN-HOME',
    },
    {
      id: 'b4d3b994-a9c0-4014-8d17-b4c8f1ee1550',
      property_external_id: '4d23f49c-84e1-4a55-bfd4-3a5dec15e7b9',
      lock_external_id: '3531740',
      lock_name: '3412-SAN-1-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '3412-SAN-HOME',
    },
    {
      id: 'd6f143f1-e2d6-4eb9-82b4-c93a0b514dda',
      property_external_id: '4d23f49c-84e1-4a55-bfd4-3a5dec15e7b9',
      lock_external_id: '3531698',
      lock_name: '3412-SAN-2-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '3412-SAN-HOME',
    },
    {
      id: '2f634bab-0d74-48a8-ae9c-948395c2f9b8',
      property_external_id: '4d23f49c-84e1-4a55-bfd4-3a5dec15e7b9',
      lock_external_id: '3531784',
      lock_name: '3412-SAN-3-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '3412-SAN-HOME',
    },
    {
      id: '31401f99-97b7-48d6-a0b2-a93bf0c80eea',
      property_external_id: '4d23f49c-84e1-4a55-bfd4-3a5dec15e7b9',
      lock_external_id: '3531802',
      lock_name: '3412-SAN-4-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '3412-SAN-HOME',
    },
    // 3420-HOV-HOME (2c64f880-90d2-4659-9b02-7b937763e9e1) — entire home, Austin TX
    {
      id: '2199c459-0e99-4c47-869a-58be2849c717',
      property_external_id: '2c64f880-90d2-4659-9b02-7b937763e9e1',
      lock_external_id: '5324556',
      lock_name: '3420-HOV-FRONT-DOOR',
      lock_role: 'FRONT_DOOR',
      property_type: 'home',
      property_name: '3420-HOV-HOME',
    },
    {
      id: '092d8466-eb30-477d-ad63-fba093069de7',
      property_external_id: '2c64f880-90d2-4659-9b02-7b937763e9e1',
      lock_external_id: '19056016',
      lock_name: '3420-HOV-1-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '3420-HOV-HOME',
    },
    {
      id: '8951d9a6-2a60-4eef-a862-ac9aac023d7b',
      property_external_id: '2c64f880-90d2-4659-9b02-7b937763e9e1',
      lock_external_id: '3629734',
      lock_name: '3420-HOV-2-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '3420-HOV-HOME',
    },
    {
      id: 'd5361fbb-f09e-43f1-a7ef-ded834d7eb52',
      property_external_id: '2c64f880-90d2-4659-9b02-7b937763e9e1',
      lock_external_id: '3564902',
      lock_name: '3420-HOV-3-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '3420-HOV-HOME',
    },
    // 3505-BAN-HOME (ea2a0472-29b1-41ae-b9bd-1145526cf2a7) — entire home, Austin TX
    {
      id: '6a7f25fa-abd6-4c5c-adfc-28143822d250',
      property_external_id: 'ea2a0472-29b1-41ae-b9bd-1145526cf2a7',
      lock_external_id: '16960494',
      lock_name: '3505-BAN-FRONT-DOOR',
      lock_role: 'FRONT_DOOR',
      property_type: 'home',
      property_name: '3505-BAN-HOME',
    },
    {
      id: '5ff2458b-b578-4ec0-b1f6-48ec899bff7e',
      property_external_id: 'ea2a0472-29b1-41ae-b9bd-1145526cf2a7',
      lock_external_id: '12326642',
      lock_name: '3505-BAN-1-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '3505-BAN-HOME',
    },
    {
      id: '3e876f87-fae6-426a-a9f4-4c3d350f98a3',
      property_external_id: 'ea2a0472-29b1-41ae-b9bd-1145526cf2a7',
      lock_external_id: '12326372',
      lock_name: '3505-BAN-2-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '3505-BAN-HOME',
    },
    {
      id: '3ab927cb-0fb2-4be0-b03f-f26009b36b30',
      property_external_id: 'ea2a0472-29b1-41ae-b9bd-1145526cf2a7',
      lock_external_id: '12326446',
      lock_name: '3505-BAN-3-ROOM-DOOR',
      lock_role: 'ROOM_DOOR',
      property_type: 'home',
      property_name: '3505-BAN-HOME',
    },
    // 1602-BLU-HOME (dac5a0e0-3984-4f72-b622-de45a9dd758f) — entire home, Bailey CO
    {
      id: '06e00596-e64e-4fac-979c-1d337277283c',
      property_external_id: 'dac5a0e0-3984-4f72-b622-de45a9dd758f',
      lock_external_id: '16559198',
      lock_name: '1602-BLU-FRONT-DOOR',
      lock_role: 'FRONT_DOOR',
      property_type: 'home',
      property_name: '1602-BLU-HOME',
    },
    {
      id: 'bebfb0ab-8328-43f2-a889-23a9b0b73be6',
      property_external_id: 'dac5a0e0-3984-4f72-b622-de45a9dd758f',
      lock_external_id: '16559224',
      lock_name: '1602-BLU-BACK-DOOR',
      lock_role: 'BACK_DOOR',
      property_type: 'home',
      property_name: '1602-BLU-HOME',
    },
    // c960c8d2-9a51-49d8-bb48-355a7bfbe7e2 — Hostfully test property (AGENTS.md)
    // This property UID is used for E2E testing; mapped to 3401-BRE-HOME locks and 5306-KIN-HOME
    {
      id: '25f17f82-33c3-46ea-96bd-8cc089e62da6',
      property_external_id: 'c960c8d2-9a51-49d8-bb48-355a7bfbe7e2',
      lock_external_id: '5447540',
      lock_name: '3401-BRE-FRONT-DOOR',
      lock_role: 'FRONT_DOOR',
      property_type: 'home',
      property_name: '3401-BRE-HOME',
    },
    {
      id: '7466f2bd-29e5-4728-8227-8eaf0fc5610a',
      property_external_id: 'c960c8d2-9a51-49d8-bb48-355a7bfbe7e2',
      lock_external_id: '4302846',
      lock_name: '3401-BRE-BACK-DOOR',
      lock_role: 'BACK_DOOR',
      property_type: 'home',
      property_name: '3401-BRE-HOME',
    },
    // 5306-KIN-HOME — code-rotation testing lock (AGENTS.md Code-Rotation Testing section)
    {
      id: 'fadca3ce-0af9-4071-9c70-57f13ed7fdc4',
      property_external_id: 'c960c8d2-9a51-49d8-bb48-355a7bfbe7e2',
      lock_external_id: '24572672',
      lock_name: '5306-kin-Home Front (PERSONAL)',
      lock_role: 'FRONT_DOOR',
      property_type: 'home',
      property_name: '5306-KIN-HOME',
    },
  ];

  let propertyLockCount = 0;
  for (const lockData of propertyLockData) {
    await prisma.propertyLock.upsert({
      where: { id: lockData.id },
      create: {
        id: lockData.id,
        tenant_id: VLRE_TENANT_ID,
        property_external_id: lockData.property_external_id,
        lock_external_id: lockData.lock_external_id,
        lock_name: lockData.lock_name,
        lock_provider: 'sifely',
        lock_role: lockData.lock_role,
        property_type: lockData.property_type,
        property_name: lockData.property_name,
        passcode_name: null,
      },
      update: {
        property_external_id: lockData.property_external_id,
        lock_external_id: lockData.lock_external_id,
        lock_name: lockData.lock_name,
        lock_provider: 'sifely',
        lock_role: lockData.lock_role,
        property_type: lockData.property_type,
        property_name: lockData.property_name,
        passcode_name: null,
      },
    });
    propertyLockCount++;
  }

  console.log(`✅ PropertyLock upserted: ${propertyLockCount} records for VLRE tenant`);

  console.log('✅ Seeding complete.');
  console.log(
    `Tenants seeded: DozalDevs, VLRE — daily-summarizer archetypes for both, guest-messaging archetype for VLRE. Run /slack/install?tenant=<id> to attach Slack workspaces (or use scripts/setup-two-tenants.ts).`,
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
