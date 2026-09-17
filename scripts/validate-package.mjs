#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  "package.json",
  "README.md",
  "skills/kl-scr-flow/SKILL.md",
  "skills/kl-scr-flow/package.json",
  "skills/kl-scr-flow/agents/openai.yaml",
  "skills/kl-scr-flow/scripts/export-flow.cjs",
  "skills/kl-scr-flow/scripts/install-skill.mjs",
  "skills/kl-scr-flow/references/modes-and-formats.md",
  "skills/kl-scr-flow/references/platform-install.md",
  "skills/kl-scr-flow/references/flow-data.md",
  "skills/kl-scr-flow/templates/flow.example.json"
];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

for (const relative of required) {
  if (!existsSync(path.join(ROOT, relative))) fail(`ขาดไฟล์: ${relative}`);
}

if (!process.exitCode) {
  for (const relative of [".codex-plugin/plugin.json", ".claude-plugin/plugin.json", "package.json", "skills/kl-scr-flow/package.json"]) {
    try {
      JSON.parse(readFileSync(path.join(ROOT, relative), "utf8"));
    } catch (_) {
      fail(`JSON ไม่ถูกต้อง: ${relative}`);
    }
  }
}

if (!process.exitCode) {
  const codex = JSON.parse(readFileSync(path.join(ROOT, ".codex-plugin/plugin.json"), "utf8"));
  const claude = JSON.parse(readFileSync(path.join(ROOT, ".claude-plugin/plugin.json"), "utf8"));
  if (codex.name !== "kl-scr-flow" || claude.name !== "kl-scr-flow") {
    fail("plugin manifests ต้องใช้ชื่อ kl-scr-flow");
  }
  if (existsSync(path.join(ROOT, "cypress.env.json"))) {
    fail("ห้ามบรรจุ cypress.env.json ในชุดแจกจ่าย");
  }
  const skill = readFileSync(path.join(ROOT, "skills/kl-scr-flow/SKILL.md"), "utf8");
  if (!skill.startsWith("---\nname: kl-scr-flow\n")) {
    fail("SKILL.md ต้องมี frontmatter ของ kl-scr-flow");
  }
}

if (!process.exitCode) process.stdout.write("ตรวจสอบ kl-scr-flow ผ่าน\n");
