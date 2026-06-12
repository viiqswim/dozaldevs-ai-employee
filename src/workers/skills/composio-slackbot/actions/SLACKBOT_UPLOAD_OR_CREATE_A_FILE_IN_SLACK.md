# SLACKBOT_UPLOAD_OR_CREATE_A_FILE_IN_SLACK

**Description**: Upload files, images, screenshots, documents, or any media to Slack channels or threads. Supports all file types including images (PNG, JPG, JPEG, GIF), documents (PDF, DOCX, TXT), code files, and more. Can share files publicly in channels or as thread replies with optional comments. Large files may fail with `upload_too_large`; use SLACK_ADD_A_REMOTE_FILE_FROM_A_SERVICE for large uploads. If the API returns `ok=false` with `method_deprecated`, fall back to SLACK_ADD_A_REMOTE_FILE_FROM_A_SERVICE or SLACK_SEND_MESSAGE with a URL.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
