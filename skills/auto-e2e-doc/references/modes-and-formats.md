# Modes and formats

## Mode selection

| Mode | What it does | What it must not claim |
| --- | --- | --- |
| `test` | Runs the project's existing UI test flow, then exports its safe result data and screenshots. | That a flow passed when Cypress did not pass. |
| `flow` | Creates a concise explanation from supplied flow data, a BRD, or existing safe evidence without running the UI. | That it is live test evidence unless supplied screenshots/results are explicitly known to be real. |

For either mode, one representative value is enough for a dropdown or lookup unless the user explicitly asks to exercise every value. Required branches, validation messages, and save behavior still need coverage when they belong to the requested flow.

## Source types

| Source | How to use | Notes |
| --- | --- | --- |
| SCR result | `--scr SCR-201` | Reads `<project>/SCR-201/output/result.json` from a previous Cypress run. |
| Flow JSON | `--input flow.json` | Reads a manually prepared or previously generated flow JSON file. |
| BRD (.docx) | `--from-brd BRD.docx` | Extracts text from a .docx BRD file using heuristics (FR headings, numbered steps, action keywords). Review output before delivery. |
| Redmine issue | `--from-redmine 1234` | Fetches issue data from Redmine API. Requires `REDMINE_TOKEN` env var. Can also download BRD attachments with `--download-brd`. |

## Format selection

| Format | Use it for | Contents |
| --- | --- | --- |
| `docx` | A human-readable handoff document. | Native editable headings/actions and optional screenshot images immediately below the relevant action. |
| `xlsx` | An editable review table. | One `Flow` worksheet with concise step rows and optional screenshot file references. |
| `csv` | Importing the flow into another tool. | UTF-8 flat rows; no embedded image. |
| `pdf` | A fixed-layout copy for review. | PDF converted from the same DOCX source; requires LibreOffice or `soffice`. |
| `json` | Reuse or automation. | Safe normalized flow fields only. |

The output must never contain credential values, cookies, access tokens, connection strings, raw request headers, or raw HTTP response bodies.

## Screenshot behavior

When screenshots exist, the DOCX embeds local PNG evidence. Missing or unsupported image files do not fail a document export; the related action remains as editable text.

For the KL Cypress project, keep the existing image invariant: play at `1280x720`, store normalized PNG evidence at `1440x810`, hide scrollbars during capture, and center visible modal windows in the captured viewport. Do not switch to full-page screenshots just to include more rows; this makes evidence disagree with the played viewport.
