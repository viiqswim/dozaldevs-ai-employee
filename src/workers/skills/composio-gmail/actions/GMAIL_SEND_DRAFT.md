# GMAIL_SEND_DRAFT

**Description**: Sends an existing draft email AS-IS to recipients already defined within the draft. IMPORTANT: This action does NOT accept recipient parameters (to, cc, bcc). The Gmail API's drafts/send endpoint sends drafts to whatever recipients are already set in the draft's To, Cc, and Bcc headers - it cannot add or override recipients. If the draft has no recipients, you must either: 1. Create a new draft with recipients using GMAIL_CREATE_EMAIL_DRAFT, then send it 2. Use GMAIL_SEND_EMAIL to send a new email directly with recipients. Send is immediate and irreversible — confirm recipients and content before calling. No scheduling support; trigger at the desired UTC time externally. Gmail enforces ~25 MB message size limit and daily send caps (~500 recipients/day personal, ~2,000/day Workspace).

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
