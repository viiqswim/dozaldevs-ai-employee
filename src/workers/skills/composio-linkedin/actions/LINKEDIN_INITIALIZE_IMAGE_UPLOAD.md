# LINKEDIN_INITIALIZE_IMAGE_UPLOAD

**Description**: Tool to initialize an image upload to LinkedIn and return a presigned upload URL plus the resulting image URN. Use when you need to prepare an image upload for LinkedIn posts. After calling this tool, upload the image bytes to the returned upload_url via PUT request, then use the image URN in CREATE_LINKED_IN_POST action.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
