# OUTLOOK_LIST_OUTLOOK_ATTACHMENTS

**Description**: Lists metadata (name, size, contentType, isInline — but not `contentBytes`) for all attachments of a specified Outlook email message. Returns fileAttachment, itemAttachment, and referenceAttachment types; only fileAttachment entries support download via OUTLOOK_DOWNLOAD_OUTLOOK_ATTACHMENT. Results include inline images and signatures — filter by `isInline == false` and check `contentType` to identify real document attachments. Results are nested under `data.response_data.value`.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
