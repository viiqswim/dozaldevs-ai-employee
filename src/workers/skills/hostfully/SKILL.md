---
name: hostfully
description: 'Use when working with Hostfully API — message retrieval, sending, property/reservation lookups, webhook handling, and door codes'
---

# Hostfully Shell Tools

Shell tools for the hostfully service.
Full CLI contract for each tool is in `actions/<tool-id>.md`.

## Available Tools

| Tool | Description |
|------|-------------|
| get-messages | Retrieve inbox messages for a Hostfully lead/thread |
| send-message | Send a reply message to a Hostfully guest thread |
| get-properties | List all Hostfully properties for the agency |
| get-property | Get details for a single Hostfully property by UID |
| get-reservations | List reservations for a Hostfully property |
| get-reviews | List guest reviews for a Hostfully property |
| get-door-code | Retrieve the door code custom data field for a Hostfully property |
| update-door-code | Update the door code custom data field for a Hostfully property |
| get-checkouts | List upcoming checkouts for Hostfully properties |
| register-webhook | Register a webhook endpoint with Hostfully for a specific event type |
| validate-env | Validate that all required Hostfully environment variables are set |
