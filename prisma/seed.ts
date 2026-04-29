import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { GUEST_MESSAGING_SYSTEM_PROMPT } from './prompts/guest-messaging.js';

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLATFORM_AGENTS_MD = fs.readFileSync(
  path.join(__dirname, '../src/workers/config/agents.md'),
  'utf8',
);

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
        default_agents_md: PLATFORM_AGENTS_MD,
        guest_messaging: {
          poll_interval_minutes: 30,
          alert_threshold_minutes: 30,
          quiet_hours: {
            start: 1,
            end: 8,
            timezone: 'America/Chicago',
          },
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
        default_agents_md: PLATFORM_AGENTS_MD,
        guest_messaging: {
          poll_interval_minutes: 30,
          alert_threshold_minutes: 30,
          quiet_hours: {
            start: 1,
            end: 8,
            timezone: 'America/Chicago',
          },
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
    'Read the last 24 hours of messages from the configured Slack source channels. ' +
    'Run: tsx /tools/slack/read-channels.ts --channels "$SOURCE_CHANNELS" ' +
    'Generate a dramatic Spanish news-style summary following your system prompt guidelines. ' +
    'If no messages are found, use "Sin actividad en #project-lighthouse en las últimas 24 horas. Su corresponsal descansa... por ahora. 🎭" as the summary. ' +
    'CRITICAL — You MUST write the summary content to a file: write the full summary text to /tmp/summary.txt ' +
    '(example: write the text content directly to /tmp/summary.txt using shell file write). ' +
    'Post the summary with approve/reject buttons to the notification channel for review. ' +
    'CRITICAL — Capture the output: run the post-message tool and redirect stdout to /tmp/approval-message.json: ' +
    'NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text "<your summary>" --task-id <TASK_ID from end of prompt> > /tmp/approval-message.json ' +
    'Both /tmp/summary.txt and /tmp/approval-message.json MUST exist when you finish — the system reads them.';

  const VLRE_SUMMARIZER_INSTRUCTIONS =
    'Read the last 24 hours of messages from the configured Slack source channels. ' +
    'Run: tsx /tools/slack/read-channels.ts --channels "$SOURCE_CHANNELS" ' +
    'Generate a dramatic Spanish news-style summary following your system prompt guidelines. ' +
    'If no messages are found, use "Sin actividad en los canales de VLRE en las últimas 24 horas. Su corresponsal descansa... por ahora. 🎭" as the summary. ' +
    'CRITICAL — You MUST write the summary content to a file: write the full summary text to /tmp/summary.txt ' +
    '(example: write the text content directly to /tmp/summary.txt using shell file write). ' +
    'Post the summary with approve/reject buttons to the notification channel for review. ' +
    'CRITICAL — Capture the output: run the post-message tool and redirect stdout to /tmp/approval-message.json: ' +
    'NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text "<your summary>" --task-id <TASK_ID from end of prompt> > /tmp/approval-message.json ' +
    'Both /tmp/summary.txt and /tmp/approval-message.json MUST exist when you finish — the system reads them.';

  const VLRE_GUEST_MESSAGING_INSTRUCTIONS =
    'NOTE: Process ONE message per task. The trigger layer handles batching.\n\n' +
    'Run the following steps to process guest messages:\n\n' +
    'STEP 1: Fetch unresponded guest messages.\n' +
    'Run: tsx /tools/hostfully/get-messages.ts --unresponded-only\n' +
    'Output is a JSON array of message threads. ' +
    'If the output is an empty array or contains no messages, write "NO_ACTION_NEEDED: No unresponded guest messages found." to /tmp/summary.txt and stop.\n\n' +
    'STEP 2: For each unresponded message thread, gather context.\n' +
    'Use the property_id from the message output.\n' +
    'Run: tsx /tools/hostfully/get-reservations.ts --property-id "<property-id>" --status confirmed\n' +
    'Run: tsx /tools/hostfully/get-property.ts --property-id "<property-id>"\n' +
    'Knowledge Base search: tsx /tools/knowledge_base/search.ts --entity-type property --entity-id "<property-id>"\n\n' +
    'STEP 3: Classify the message and draft a response.\n' +
    'Read ALL messages in the thread from the messages array returned in Step 1 output (chronological order, up to 30 messages). ' +
    'Pass the full conversation history to the LLM as context, clearly framed as "previous messages in this conversation". ' +
    'Using the full conversation history, reservation details, property information, and any KB results, classify the message and draft a response following the JSON format in your system prompt. ' +
    'When drafting the response, acknowledge prior context where relevant (e.g., "As I mentioned..." or "Following up on..."). ' +
    'Output the JSON classification.\n\n' +
    'STEP 4: Route based on classification.\n' +
    'If classification is NO_ACTION_NEEDED: write the classification JSON to /tmp/summary.txt. Then post an informational message (no approve/reject buttons): NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text "ℹ️ No action needed — <guest name> at <property name>: <summary from classification JSON>" --task-id $TASK_ID > /tmp/approval-message.json\n' +
    'If classification is NEEDS_APPROVAL: continue to Step 5.\n\n' +
    'STEP 5: Write output files and post for approval.\n' +
    'Write the full enriched classification JSON to /tmp/summary.txt. The JSON MUST include ALL of these fields:\n' +
    '- classification, confidence, reasoning, draftResponse, summary, category, conversationSummary, urgency (original 8 fields)\n' +
    '- guestName, propertyName, checkIn, checkOut, bookingChannel, originalMessage, leadUid, threadUid, messageUid (new guest context fields)\n\n' +
    'Extract these values from the reservation and message data gathered in Steps 1-2.\n\n' +
    'Post the rich approval card for PM review:\n' +
    'NODE_NO_WARNINGS=1 tsx /tools/slack/post-guest-approval.ts \\\n' +
    '  --channel "$NOTIFICATION_CHANNEL" \\\n' +
    '  --task-id "$TASK_ID" \\\n' +
    '  --guest-name "<guestName>" \\\n' +
    '  --property-name "<propertyName>" \\\n' +
    '  --check-in "<checkIn>" \\\n' +
    '  --check-out "<checkOut>" \\\n' +
    '  --booking-channel "<bookingChannel>" \\\n' +
    '  --original-message "<originalMessage>" \\\n' +
    '  --draft-response "<draftResponse>" \\\n' +
    '  --confidence <confidence> \\\n' +
    '  --category "<category>" \\\n' +
    '  --lead-uid "<leadUid>" \\\n' +
    '  --thread-uid "<threadUid>" \\\n' +
    '  --message-uid "<messageUid>" \\\n' +
    '  > /tmp/approval-message.json\n\n' +
    "IMPORTANT — Conversation ref for superseding detection: After writing /tmp/approval-message.json, append the conversationRef field to it so the platform can detect when a newer message supersedes this one. Run: node -e \"const f='/tmp/approval-message.json'; const d=JSON.parse(require('fs').readFileSync(f,'utf8')); d.conversationRef='<threadUid from classification result>'; require('fs').writeFileSync(f,JSON.stringify(d))\"\n" +
    'The --conversation-ref flag (Hostfully threadUid) enables the platform to supersede this approval card if the guest sends a follow-up message before the PM acts.\n\n' +
    'CRITICAL: Both /tmp/summary.txt and /tmp/approval-message.json MUST exist when you finish.\n\n' +
    'STEP 6: Error handling.\n' +
    'If any Hostfully tool exits with a non-zero code, do NOT silently ignore it. ' +
    'Write the error to /tmp/summary.txt. ' +
    'Post an error notification: NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text "Error processing guest message: <error details>" --task-id <TASK_ID from end of prompt> > /tmp/approval-message.json\n' +
    'If the error looks like a tool bug, report it: tsx /tools/platform/report-issue.ts --task-id "<TASK_ID from end of prompt>" --tool-name "<failing-tool>" --description "<error details>"';

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
      system_prompt: PAPI_CHULO_SYSTEM_PROMPT,
      instructions: DOZALDEVS_SUMMARIZER_INSTRUCTIONS,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'slack_message',
      tool_registry: { tools: ['/tools/slack/read-channels.js', '/tools/slack/post-message.js'] },
      trigger_sources: { type: 'cron', expression: '0 8 * * 1-5', timezone: 'America/Chicago' },
      risk_model: { approval_required: true, timeout_hours: 24 },
      notification_channel: null,
      concurrency_limit: 1,
      agents_md: PLATFORM_AGENTS_MD,
      delivery_instructions:
        'Read the approved summary from the deliverable content. Post it to the publish channel as a clean published message without buttons: NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$PUBLISH_CHANNEL" --text "<approved summary content>". Do not include approve/reject buttons.',
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
      notification_channel: null,
      concurrency_limit: 1,
      agents_md: PLATFORM_AGENTS_MD,
      delivery_instructions:
        'Read the approved summary from the deliverable content. Post it to the publish channel as a clean published message without buttons: NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$PUBLISH_CHANNEL" --text "<approved summary content>". Do not include approve/reject buttons.',
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
      notification_channel: null,
      concurrency_limit: 1,
      agents_md: PLATFORM_AGENTS_MD,
      delivery_instructions:
        'Read the approved summary from the deliverable content. Post it to the publish channel as a clean published message without buttons: NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$PUBLISH_CHANNEL" --text "<approved summary content>". Do not include approve/reject buttons.',
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
      notification_channel: null,
      concurrency_limit: 1,
      agents_md: PLATFORM_AGENTS_MD,
      delivery_instructions:
        'Read the approved summary from the deliverable content. Post it to the publish channel as a clean published message without buttons: NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$PUBLISH_CHANNEL" --text "<approved summary content>". Do not include approve/reject buttons.',
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
      system_prompt: GUEST_MESSAGING_SYSTEM_PROMPT,
      instructions: VLRE_GUEST_MESSAGING_INSTRUCTIONS,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'slack_message',
      tool_registry: {
        tools: [
          '/tools/hostfully/get-property.ts',
          '/tools/hostfully/get-reservations.ts',
          '/tools/hostfully/get-messages.ts',
          '/tools/hostfully/send-message.ts',
          '/tools/slack/post-message.ts',
          '/tools/slack/read-channels.ts',
          '/tools/platform/report-issue.ts',
          '/tools/knowledge_base/search.ts',
        ],
      },
      trigger_sources: { type: 'cron_and_webhook', cron_expression: '*/5 * * * *' },
      risk_model: { approval_required: true, timeout_hours: 24 },
      notification_channel: null,
      concurrency_limit: 5, // webhook-triggered: multiple concurrent guests
      agents_md: PLATFORM_AGENTS_MD,
      delivery_instructions:
        'Read the approved response from the deliverable content. The deliverable content is a JSON object with a draftResponse field. Send the approved response to the guest via Hostfully: tsx /tools/hostfully/send-message.ts --lead-id "<leadUid field from the JSON>" --thread-id "<threadUid field from the JSON, if present>" --message "<draftResponse field from the JSON>". Confirm delivery was successful.',
      tenant_id: '00000000-0000-0000-0000-000000000003', // VLRE
      department_id: '00000000-0000-0000-0000-000000000021', // VLRE department
    },
    update: {
      role_name: 'guest-messaging',
      runtime: 'opencode',
      system_prompt: GUEST_MESSAGING_SYSTEM_PROMPT,
      instructions: VLRE_GUEST_MESSAGING_INSTRUCTIONS,
      model: 'minimax/minimax-m2.7',
      deliverable_type: 'slack_message',
      tool_registry: {
        tools: [
          '/tools/hostfully/get-property.ts',
          '/tools/hostfully/get-reservations.ts',
          '/tools/hostfully/get-messages.ts',
          '/tools/hostfully/send-message.ts',
          '/tools/slack/post-message.ts',
          '/tools/slack/read-channels.ts',
          '/tools/platform/report-issue.ts',
          '/tools/knowledge_base/search.ts',
        ],
      },
      trigger_sources: { type: 'cron_and_webhook', cron_expression: '*/5 * * * *' },
      risk_model: { approval_required: true, timeout_hours: 24 },
      notification_channel: null,
      concurrency_limit: 5,
      agents_md: PLATFORM_AGENTS_MD,
      delivery_instructions:
        'Read the approved response from the deliverable content. The deliverable content is a JSON object with a draftResponse field. Send the approved response to the guest via Hostfully: tsx /tools/hostfully/send-message.ts --lead-id "<leadUid field from the JSON>" --thread-id "<threadUid field from the JSON, if present>" --message "<draftResponse field from the JSON>". Confirm delivery was successful.',
      department_id: '00000000-0000-0000-0000-000000000021',
      // NO tenant_id — immutable
    },
  });

  console.log(
    `✅ Archetype upserted: ${vlreGuestMessaging.id} (role: ${vlreGuestMessaging.role_name}, model: ${vlreGuestMessaging.model})`,
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
