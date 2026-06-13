# ELEVENLABS_TEXT_TO_SPEECH

**Description**: Converts text to speech using a specified ElevenLabs voice and model, returning a downloadable audio file (use ELEVENLABS_TEXT_TO_SPEECH_STREAM for streaming instead). Audio URL is nested at `data.file.s3url` in the response. Keep `voice_id`, `model_id`, and `output_format` consistent across all chunks to avoid audible artifacts when concatenating. Some voice/model/format combinations require specific subscription tiers; test with a short sample before full runs. HTTP 429 on burst batches; respect `Retry-After` headers.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
