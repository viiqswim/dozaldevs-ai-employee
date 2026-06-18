# Cleaning Schedule v16 — Description Used for converse-create

## Description (verbatim)

I need an AI employee that runs every morning to create a cleaning schedule for my team. It checks which properties have guests checking out that day using Hostfully, then assigns each checkout to the right cleaner based on their ZIP zone from our Notion staff directory. The schedule is posted in Spanish to our Slack channel.

Key rules:

- Diana is exclusively assigned to 271 Gina Dr (ZIP 78640) — she handles ALL units there, every day, 25 min per checked-out habitación
- Yessica covers ZIP 78744 Mon-Sat, max 240 min on Saturdays. When she is over capacity, Berenice takes the overflow
- Zenaida covers ZIPs 78203 and 78109
- Any property in a ZIP not covered by any cleaner gets marked "SIN ASIGNAR"
- On Saturdays, assign properties by address group (keep all units of same address together). When groups are equal total time, prefer the group with more individual units for Yessica

Cleaning times per property (hardcoded — do NOT use get-property.ts or multiply by 30 min):

- 271 Gina Dr (78640): each habitación = 25 min
- 7213 Nutria Run (78744): Hab1=25, Hab2=25, Hab3=25, Hab4=25, Hab5=40 min
- 4403 Hayride Ln (78744): Unidad A=90, Unidad B=90, Unidad S=90 min
- 3420 Hovenweep Ave (78744): Casa=100 min
- 219 Paul St (78203): Casa=90 min
- 407 S Gevers St (78203): Loft=60 min
- 3401/3412/3420 Hovenweep Ave (78744): Casa=100 min each
- 6002 Palm Circle (78741): Casa=180 min (SIN ASIGNAR — ZIP not covered)
- 5306 King Charles Dr (78724): 90 min (SIN ASIGNAR — ZIP not covered)
- 3505 Banton Rd (78722): each habitación = 25 min (SIN ASIGNAR — ZIP not covered)

Trash collection calendar (hardcoded):

- 78744 properties: Monday collection — put out bins Friday+Saturday+Sunday; day after collection: confirm pickup
- 78640 properties: Monday collection — same as 78744
- 78203/78109 properties: Tuesday collection — put out bins Monday; day after: confirm pickup
- Berenice handles trash reminders for 78744 on Saturdays when she is working
- Zenaida handles trash reminders for 78203/78109

The employee is triggered manually with a target_date input (YYYY-MM-DD format). Output must be in Spanish.

## Result

- converse-create turns: 1 (direct proposal, no clarifying questions)
- Archetype ID: 77e77c86-3bce-49a0-84e3-ccf7dac37b33
- role_name: cleaning-schedule-v16
