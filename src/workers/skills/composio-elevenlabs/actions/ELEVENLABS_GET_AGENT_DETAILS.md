# ELEVENLABS_GET_AGENT_DETAILS

**Description**: Tool to retrieve available Conversational AI agents and outbound-capable Twilio phone numbers. Use when selecting an agent and phone number for outbound calls. Always reference agents by agent_id (stable identifier), not agent_name (mutable). Returns basic metadata only — conversation_config and webhook settings require a separate ConvAI agent API call. Pass agent_id and agent_phone_number_id directly to ELEVENLABS_OUTBOUND_CALL; IDs must be current and owned by the authenticated account.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
