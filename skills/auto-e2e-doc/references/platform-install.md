# Install and invoke on each tool

Run the following from the unpacked `kl-scr-flow` folder. Node.js 18+ is required.

```bash
npm install
```

## One command installer

Install a standalone skill into the current user's profile:

```bash
npm run install:skill -- --target all --scope user
```

Install only into a project folder:

```bash
npm run install:skill -- --target codex --scope project --project /path/to/project
npm run install:skill -- --target claude --scope project --project /path/to/project
npm run install:skill -- --target cursor --scope project --project /path/to/project
```

The installer copies the portable skill and installs only its DOCX/XLSX runtime dependencies with npm's lifecycle scripts disabled. If a destination already has the same skill, use `--force` only when intentionally replacing it.

## Thai font for PDF rendering

The DOCX names `Sarabun` for Thai editable text. Install a Thai-capable font before generating PDF. On macOS, the exporter automatically uses Homebrew fontconfig when `/opt/homebrew/etc/fonts/fonts.conf` or `/usr/local/etc/fonts/fonts.conf` exists. If a different fontconfig setup is required, set `FONTCONFIG_FILE` and `FONTCONFIG_PATH` before running the exporter.

## Codex

The installer places the standalone skill under `.agents/skills/kl-scr-flow`. Restart or reload Codex if it does not appear immediately, then use `/skills` to select **KL SCR Flow** or invoke `$kl-scr-flow` where skill mentions are enabled.

For native plugin use, open the unpacked package with Codex's local plugin workflow; its manifest is `.codex-plugin/plugin.json` and the canonical skill is in `skills/kl-scr-flow`.

## Claude Code

The standalone installer uses `.claude/skills/kl-scr-flow`, which invokes as:

```text
/kl-scr-flow
```

The same folder is also a Claude Code plugin package. A temporary local-plugin run can use:

```bash
claude --plugin-dir /path/to/kl-scr-flow
```

Its native plugin command is:

```text
/kl-scr-flow:kl-scr-flow
```

## Cursor

The standalone installer uses `.cursor/skills/kl-scr-flow`. Reload the workspace if necessary, then invoke:

```text
/kl-scr-flow
```

Cursor also recognizes `.agents/skills`, `.claude/skills`, and `.codex/skills`, but `.cursor/skills` is used by the installer so the destination is explicit.

## Commands after installation

Ask for both a mode and formats, for example:

```text
/kl-scr-flow test SCR-201 docx,xlsx
/kl-scr-flow test --env sit SCR-201 docx
/kl-scr-flow flow SCR-201 docx,csv,json
/kl-scr-flow flow --input flow.json pdf
/kl-scr-flow flow --from-brd BRD.docx SCR-301 docx,csv
/kl-scr-flow flow --from-redmine 1234 docx,xlsx
```

## Additional CLI commands

Import BRD directly:

```bash
npm run import:brd -- --input BRD.docx --scr-id SCR-301 --out flow.json
```

Fetch from Redmine:

```bash
REDMINE_TOKEN=xxx npm run fetch:redmine -- --url https://redmine.example.com --issue 1234 --out flow.json
REDMINE_TOKEN=xxx npm run fetch:redmine -- --scr SCR-201 --out flow.json
```

Select environment for test runs:

```bash
npm run scr -- --env sit SCR-201
npm run scr -- --env uat SCR-201 SCR-202
```

