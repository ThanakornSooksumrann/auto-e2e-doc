---
name: auto-e2e-doc
description: Universal skill to create E2E documentation and run UI tests. Supports dynamic UI source referencing, generic frameworks, and BRD/Redmine imports.
disable-model-invocation: true
---

# Universal E2E Document Skill (auto-e2e-doc)

Use this skill when the user explicitly asks for `/auto-e2e-doc`, `$auto-e2e-doc`, or wants to generate automated UI testing flow evidence and documentation. This skill produces human-readable documentation without relying on hardcoded frameworks like Kendo UI, making it adaptable to any system.

## First: Initialization and Project Context

Before generating tests or flows, you MUST understand the project's frontend structure to write accurate selectors and tests:

**🔄 Always Check for Updates First**
Run `node <skill-root>/scripts/check-update.cjs` in the background (using your run_command tool). 
- If it outputs `UPDATE_AVAILABLE: x.x.x`, you MUST inform the user at the end of your response that a new version of the skill is available.
- Recommend them to update by running `git pull` (if they cloned) or downloading the new zip, followed by running `node scripts/setup.js`.

1. **Check for configuration**: Read `.e2e-doc-config.json` in the project root if it exists.
2. **Find Frontend Source Code**: If the config specifies `frontendSourcePath` (e.g. `./src/ui`), you MUST search that directory to find the actual code of the screen you are writing a test for. Use tools like `grep_search` to find button labels or page titles in `.vue`, `.js`, `.ts`, or `.tsx` files. By reading the actual UI code, you can use the exact DOM structure, data-test attributes, or component hierarchies instead of guessing.
3. **Environment Setup**: Read `environments.json` and `cypress.env.json` to understand the available test URLs and credentials. The user may have used `npm run setup` to prepare these.

## 🚨 Setup & Helper Detection (Missing Configuration)

**CRITICAL**: If you check the project root and CANNOT find `cypress.env.json`, `environments.json`, or `.e2e-doc-config.json`, it means the user **skipped the setup step**. 
When this happens, you MUST pause your execution and act as a **Setup Helper**:
- Politely inform the user that they need to initialize the project first.
- Instruct them to run `node scripts/setup.js` (or `npm run setup` if configured) in their terminal to use the interactive wizard.
- Alternatively, offer to manually help them create the files right there in the chat by asking them for their Base URL, Credentials, and Frontend source code path.
- **DO NOT** attempt to guess credentials or run Cypress tests if these files are missing, as it will result in errors.

## 📄 Document Upload & Source Guidance (Missing BRD/Source)

If the user asks you to "create a test" or "generate a flow" but **does not specify the source** (like an SCR ID, BRD, Redmine ID, or Jira ID), you must guide them:
- **BRD Upload**: Tell the user they can upload their Business Requirement Document (BRD) as a `.docx` file directly into the chat or workspace. Once uploaded, you can read it and auto-generate the flow using `--from-brd`.
- **Redmine / Jira**: Remind them that if they have configured a Token in the setup, they can simply provide the Issue ID (e.g., `#1234` or `PROJ-123`), and you will automatically fetch the BRD from there.

Identify these choices from the user's request:

1. **Mode** — `test` (run Cypress and capture UI) or `flow` (generate document from JSON/BRD without running).
2. **Source** — SCR ID, JSON flow file, BRD file (.docx), Redmine issue ID, or Jira issue key.
3. **Formats** — one or more of `docx`, `xlsx`, `csv`, `pdf`, `json`, `html`.
4. **Environment** (test mode only) — e.g. `dev`, `sit`, `uat`, or omit for default.

If choices are missing, ask compactly. Do not guess whether a live mutation (save, delete, upload) is allowed.

Examples:
```text
/auto-e2e-doc test SCR-201 docx,xlsx
/auto-e2e-doc test --env sit SCR-201 docx
/auto-e2e-doc flow SCR-201 docx,csv
/auto-e2e-doc flow --from-brd BRD.docx SCR-301 docx,csv
/auto-e2e-doc flow --from-redmine 1234 docx
/auto-e2e-doc flow --from-jira PROJ-123 docx
```

## Mode: test

Use this only when the user wants real UI evidence.

1. **Dynamic Selectors**: You are NOT restricted to specific UI libraries. Look at the actual DOM or the source code you found in the `frontendSourcePath` to write your Cypress commands (e.g. `cy.get('button.primary')` or `cy.contains('Save')`).
2. **Capture Setup**: Preserve the viewport and state before calling `cy.capture()`.
3. **Evidence**: Do not create or modify data unless explicitly authorized. Assert API responses on saves; do not rely purely on UI rendering.
4. Run the test command with the environment flag if provided:

```bash
npm run scr -- SCR-201
npm run scr -- --env sit SCR-201
```

5. Export after success:

```bash
node <skill-root>/scripts/export-flow.cjs --scr SCR-201 --project-root <project-root> --mode test --formats docx,xlsx
```

## Mode: flow (No UI Execution)

Build a JSON flow without running tests, useful for planning or converting BRDs to technical flows.

```bash
node <skill-root>/scripts/export-flow.cjs --input flow.json --mode flow --formats docx,csv,json
```

## Document Generation and Styles

The generated documents are highly customizable:
- Read the `documentStyle` setting from `.e2e-doc-config.json`.
- When writing flow JSON manually, adapt the wording to the specified language (Thai/English) and add any requested metadata.
- **DOCX / PDF**: Elegant document with readable steps and inline screenshots.
- **XLSX**: Editable table with dynamically resized rows so images never overlap text.
- **HTML**: Beautiful, responsive web view with embedded Base64 images.
- **JSON**: Raw safe data.

## Integration Sources (BRD, Redmine & Jira)

You can import flows directly from BRD (.docx) files or Issue Trackers.

**From BRD:**
```bash
node <skill-root>/scripts/export-flow.cjs --from-brd BRD.docx --scr SCR-301 --formats docx
```

**From Redmine:**
```bash
REDMINE_TOKEN=xxx node <skill-root>/scripts/export-flow.cjs --from-redmine 1234 --formats docx
```

**From Jira:**
```bash
JIRA_TOKEN=xxx JIRA_EMAIL=xxx JIRA_URL=xxx node <skill-root>/scripts/export-flow.cjs --from-jira PROJ-123 --formats docx
```

*Note: Tokens and URLs are typically configured during setup and stored in `cypress.env.json` or `.env` and should never be logged or committed.*

## Commands

- **Gemini / Codex**: `$auto-e2e-doc` or `/skills`
- **Claude / Cursor**: `/auto-e2e-doc`
