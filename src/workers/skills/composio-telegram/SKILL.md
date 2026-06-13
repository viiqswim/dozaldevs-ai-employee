---
name: composio-telegram
description: 'Use when working with Telegram via the Composio integration — reading, writing, or managing Telegram content. Requires Telegram to be connected in the platform settings. Full action parameter schemas are in the bundled actions/ files.'
---

# Composio — Telegram

Full parameter schemas for each action are in `actions/<SLUG>.md`.

## Available Actions

| Action | Description |
|--------|-------------|
| TELEGRAM_ANSWER_CALLBACK_QUERY | Use this method to send answers to callback queries sent from inline keyboards. The answer will be displayed to the user as a notification at the top of the chat screen or as an alert. |
| TELEGRAM_CREATE_CHAT_INVITE_LINK | Generate a new primary invite link for a chat; any previously generated primary link is revoked. The bot must be an administrator in the chat for this to work and must have the appropriate administrator rights. |
| TELEGRAM_DELETE_MESSAGE | Delete a message, including service messages. Limitations: cannot delete messages older than 48 hours in groups, forwarded messages, or content in protected chats (returns 400 'message can’t be deleted'). Bot must have delete/manage rights in the target chat; works reliably only on bot-authored messages in groups. Verify permissions via TELEGRAM_GET_CHAT or TELEGRAM_GET_CHAT_ADMINISTRATORS before calling. On flood control, Telegram returns HTTP 429 with a retry_after field; honor that backoff value. |
| TELEGRAM_EDIT_MESSAGE | Edit text messages sent by the bot. Only bot-authored messages can be edited; editing messages from other users will fail. In groups, the bot must have edit permissions. |
| TELEGRAM_FORWARD_MESSAGE | Forward messages of any kind. Service messages can't be forwarded. |
| TELEGRAM_GET_CHAT | Get up to date information about the chat (current name of the user for one-on-one conversations, current username of a user, group or channel, etc.). The bot must be a member of or have access to the target chat; calls fail if the bot was never added, was removed, or is blocked. |
| TELEGRAM_GET_CHAT_ADMINISTRATORS | Get a list of administrators in a chat. On success, returns an Array of ChatMember objects containing information about all chat administrators except other bots. Only meaningful for supergroups and channels; private chats yield no useful data. The bot must be a member of the chat; if the bot has admin rights, its own entry will appear in the result, useful for verifying its permissions before moderation actions. |
| TELEGRAM_GET_CHAT_HISTORY | Get chat history messages via the getUpdates polling method, filtered by chat_id. Returns only updates from the specified chat. Bot can only retrieve messages sent after it joined the chat; missing older messages is expected. Requires no active webhook — a webhook causes HTTP 409 conflict; delete it before using this tool. Empty result arrays (ok=true) indicate no accessible messages, not a failure. Returned message dates are Unix timestamps in UTC seconds. |
| TELEGRAM_GET_CHAT_MEMBER | Get a chat member's status/role (including the bot itself) to preflight permissions and troubleshoot 403/empty-history issues. Use before sending messages to verify bot membership and permissions. |
| TELEGRAM_GET_CHAT_MEMBERS_COUNT | Get the number of members in a chat. The bot must be an administrator in the chat for this to work. Insufficient admin permissions surface as authorization errors, not as a zero or empty count. |
| TELEGRAM_GET_ME | Get basic information about the bot using the Bot API getMe method. Returns fields like id, username, first_name, and capabilities. If the response returns ok=false, the bot token is invalid or revoked and must be replaced before any other API calls. Bot name, bio, and profile description are read-only via the Bot API; modify them via BotFather. |
| TELEGRAM_GET_UPDATES | Use this method to receive incoming updates using long polling. An Array of Update objects is returned. IMPORTANT: This method will not work if an outgoing webhook is set up. Webhooks and getUpdates are mutually exclusive — call deleteWebhook first to switch modes (409 Conflict otherwise). Notes: - Only one method (webhook or polling) can be active at a time - Updates available for up to 24 hours if unclaimed - Recalculate offset after each response to avoid duplicates - Empty result array (ok=true) is valid, meaning no new updates - On HTTP 429, honor the retry_after value; keep polling to ~1 request/second - Only chats with updates since the bot joined or last offset appear in results - Update objects vary by type; always check update.message and update.message.text exist before accessing |
| TELEGRAM_SEND_DOCUMENT | Send general files (documents) to a Telegram chat using the Bot API. Prefer over TELEGRAM_SEND_PHOTO when original file format or image resolution must be preserved. Rapid sends trigger flood control (HTTP 429 with `retry_after` seconds); limit to ~1 message/second per chat and wait the specified `retry_after` duration before retrying. |
| TELEGRAM_SEND_LOCATION | Send point on the map location to a Telegram chat using the Bot API. |
| TELEGRAM_SEND_MESSAGE | Send a text message to a Telegram chat using the Bot API. Bots must be members of target groups/channels with post rights. Rate limit: ~1 msg/sec per chat, ~30 msg/sec globally; exceeding returns 429 with retry_after seconds that must be honored. |
| TELEGRAM_SEND_PHOTO | Send photos to a Telegram chat using the Bot API. Telegram compresses and re-encodes images; use TELEGRAM_SEND_DOCUMENT to preserve original resolution/format. Each call produces a separate post; no media-group/album support. Returns HTTP 429 with `retry_after` seconds when sending too rapidly. |
| TELEGRAM_SEND_POLL | Send a native poll to a Telegram chat using the Bot API. |
| TELEGRAM_SET_MY_COMMANDS | Use this method to change the list of the bot's commands. See https://core.telegram.org/bots#commands for more details about bot commands. |
