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

**🏗️ Cypress Base Config**
Remind the user that `auto-e2e-doc` provides a highly optimized Cypress configuration (1280x720 viewport, normalized capture size, Kendo UI modal handlers, etc.). This can be installed automatically by running `node scripts/setup.js` and answering 'y' to the Cypress Base Config prompt.

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

## 🎯 STRICT RULE: WRITING CYPRESS TESTS (Mode: test)

When the user asks you to write a test (e.g., "สร้างเทสหน้า SCR-xxx"), you MUST ALWAYS physically write the code to disk and execute it. **DO NOT JUST OUTPUT CODE BLOCKS IN CHAT.**

### 1. Project Layout & File Creation
You MUST create a dedicated folder for the SCR and write the file into it using `write_to_file`:
```text
SCR-xxx/
  SCR-xxx.cy.js            # You MUST write the test here!
```

### 2. Golden Example & Style
- You MUST read `<skill-root>/examples/golden-flow.cy.js` using `view_file` to see exactly how a perfect test is structured before generating your first test.
- Keep the test readable as instructions for a person: use Thai user-facing actions such as “กด เพิ่มข้อมูล” and “กด บันทึก” in your `cy.step` text. Do not put selector jargon in the step text.
- Use one representative value for a dropdown or lookup (do not test every option if they just need a flow document).

### 3. Required Custom Commands
You MUST structure every test case with these commands for the document generator to work:
- `cy.tc(id, title, objective)`: Call at the start of every `it()` block.
- `cy.step(action, expected)`: Call before interacting with the UI. The action text will appear in the document.
- `cy.capture(name)`: Call after the UI is stable to take a screenshot for the current step.
- `cy.note(text)`: (Optional) Call to record an actual observation (e.g. "Found 5 items").

### 4. Capture Invariants (CRITICAL)
- The test viewport is `1280x720` CSS pixels.
- Successful screenshots are normalized to `1440x810` pixels by the Cypress hook using `sips`.
- **IMPORTANT**: Use `cy.screenshot(..., { capture: "viewport", scale: false })` if you call it directly, though `cy.capture(name)` in `commands.js` handles this.
- Before capture, hide document scrollbars, scroll to the top, and let animations finish.
- Place visible windows/modals using fixed viewport coordinates so they are centered in the viewport.
- Restore all temporary styles after each capture.

### 5. Evidence & Data Safety
- Read login values only from the local, ignored `cypress.env.json`.
- Do not run `UPDATE`, `INSERT`, or `DELETE` against the database to prepare test data.
- Do not create or modify data unless explicitly authorized. Assert API responses on saves; do not rely purely on UI rendering.

### 6. RUN THE TEST!
After creating `SCR-xxx.cy.js`, you MUST use your `run_command` tool to execute it immediately. **THIS IS HOW IMAGES ARE GENERATED!**
```bash
npx cypress run --spec "SCR-xxx/**/*.cy.js"
```
If an environment is specified:
```bash
npx cypress run --env envName=sit --spec "SCR-xxx/**/*.cy.js"
```

### 7. Export the Document
After Cypress succeeds, you MUST export the document:
```bash
node <skill-root>/scripts/export-flow.cjs --scr SCR-xxx --project-root <project-root> --mode test --formats docx,xlsx
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

- **Gemini / Codex**: `$auto-e2e-doc` หรือ `/skills`
- **Claude / Cursor**: `/auto-e2e-doc`
