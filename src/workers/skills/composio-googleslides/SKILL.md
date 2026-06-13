---
name: composio-googleslides
description: 'Use when working with Googleslides via the Composio integration — reading, writing, or managing Googleslides content. Requires Googleslides to be connected in the platform settings. Full action parameter schemas are in the bundled actions/ files.'
---

# Composio — Googleslides

Full parameter schemas for each action are in `actions/<SLUG>.md`.

## Available Actions

| Action | Description |
|--------|-------------|
| GOOGLESLIDES_CREATE_PRESENTATION | Tool to create a blank Google Slides presentation. Use when you need to initialize a new presentation with a specific title, locale, or page size. |
| GOOGLESLIDES_CREATE_SLIDES_MARKDOWN | Creates a new Google Slides presentation from Markdown text. Automatically splits content into slides using '---' separators and applies appropriate templates based on content structure. |
| GOOGLESLIDES_GET_PAGE_THUMBNAIL2 | Tool to generate a thumbnail of the latest version of a specified page. Use when you need a preview image URL for a slide page. This request counts as an expensive read request for quota purposes. |
| GOOGLESLIDES_PRESENTATIONS_BATCH_UPDATE | Update Google Slides presentations using markdown content or raw API text. Supports professional themes, auto-formatting, and multiple slide types (title, bullet, table, quote, image, two-column). |
| GOOGLESLIDES_PRESENTATIONS_COPY_FROM_TEMPLATE | Tool to create a new Google Slides presentation by duplicating an existing template deck via Drive file copy. Use when you need to preserve themes, masters, and layouts exactly as they appear in the template. After copying, use GOOGLESLIDES_PRESENTATIONS_BATCH_UPDATE to replace placeholder text or images. |
| GOOGLESLIDES_PRESENTATIONS_GET | Tool to retrieve the latest version of a presentation. Use after obtaining the presentation ID. |
| GOOGLESLIDES_PRESENTATIONS_PAGES_GET | Tool to get the latest version of a specific page in a presentation. Use when you need to inspect slide, layout, master, or notes page details. |
| GOOGLESLIDES_PRESENTATIONS_PAGES_GET_THUMBNAIL | DEPRECATED: Use GOOGLESLIDES_GET_PAGE_THUMBNAIL2 instead. Tool to generate and return a thumbnail image URL for a specific page. Use when you need a quick preview of a slide page after loading it. |
