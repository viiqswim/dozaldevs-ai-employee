# Decisions — guest-messaging-card-fix

## 2026-05-08 Init
- Title flag: --title on post-message.ts; fallback = "Task Review — {date}"
- Summarizer passes --title "Daily Summary" explicitly
- Guest-messaging error path (STEP 6) passes --title "Guest Message Error"
- Cron: comment out registration (NOT delete file)
- Delivery instructions: DO NOT modify (no --task-id → no approval blocks → no title needed)
