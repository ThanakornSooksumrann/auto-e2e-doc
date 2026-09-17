#!/usr/bin/env node

/**
 * Copy the canonical skill into a user or project skill directory, then install
 * only the runtime dependencies needed by the exporter. This file itself has
 * no external dependencies so a recipient can run it immediately after unzip.
 */

import { cp, lstat, mkdir, rename, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const SKILL_NAME = "auto-e2e-doc";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(SCRIPT_DIR, "..");
const VALID_TARGETS = new Set(["codex", "claude", "cursor", "gemini", "all"]);
const VALID_SCOPES = new Set(["user", "project"]);

function help() {
  return [
    "ใช้:",
    "  node install-skill.mjs --target codex|claude|cursor|gemini|all --scope user|project [--project /path/to/project]",
    "",
    "ตัวเลือก:",
    "  --target <name>       default: all",
    "  --scope <name>        default: user",
    "  --project <path>      project target when --scope project (default: current directory)",
    "  --skip-deps           copy skill only; do not run npm install in destination",
    "  --force               replace an existing destination"
  ].join("\n");
}

function parse(argv) {
  const options = {
    force: false,
    project: process.cwd(),
    scope: "user",
    skipDeps: false,
    target: "all"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--skip-deps") {
      options.skipDeps = true;
      continue;
    }
    if (["--target", "--scope", "--project"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`ต้องระบุค่าหลัง ${arg}`);
      index += 1;
      if (arg === "--target") options.target = value.toLowerCase();
      if (arg === "--scope") options.scope = value.toLowerCase();
      if (arg === "--project") options.project = value;
      continue;
    }
    throw new Error(`ไม่รู้จักตัวเลือก ${arg}`);
  }
  if (!VALID_TARGETS.has(options.target)) throw new Error("--target ใช้ได้: codex, claude, cursor, gemini, all");
  if (!VALID_SCOPES.has(options.scope)) throw new Error("--scope ใช้ได้: user, project");
  options.project = path.resolve(options.project);
  return options;
}

function targetBase(target, scope, project) {
  const root = scope === "user" ? os.homedir() : project;
  if (target === "codex") return path.join(root, ".agents", "skills");
  if (target === "gemini") return scope === "user" ? path.join(root, ".gemini", "config", "skills") : path.join(root, ".agents", "skills");
  if (target === "claude") return path.join(root, ".claude", "skills");
  if (target === "cursor") return path.join(root, ".cursor", "rules"); // Cursor usually uses .cursor/rules but we can use .cursor/skills or similar, let's keep it .cursor/skills for consistency if that's what was there before
  throw new Error(`target ไม่ถูกต้อง: ${target}`);
}

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch (_) {
    return false;
  }
}

function destinationFor(target, options) {
  let base = targetBase(target, options.scope, options.project);
  if (target === "cursor") base = path.join(options.scope === "user" ? os.homedir() : options.project, ".cursor", "skills"); // preserve previous behavior
  const destination = path.join(base, SKILL_NAME);
  if (path.basename(destination) !== SKILL_NAME) throw new Error("ตำแหน่งติดตั้งไม่ปลอดภัย");
  return destination;
}

function installDependencies(destination) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: destination,
    stdio: "inherit",
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    throw new Error("ติดตั้ง runtime dependency ไม่สำเร็จ; ลองรัน npm install ในโฟลเดอร์ skill อีกครั้ง");
  }
}

function commandFor(target) {
  if (target === "codex" || target === "gemini") return `$auto-e2e-doc หรือ /skills`;
  return "/auto-e2e-doc";
}

async function copyOne(target, options) {
  const destination = destinationFor(target, options);
  const destinationExists = await exists(destination);
  if (destinationExists && !options.force) {
    throw new Error(`มี skill อยู่แล้วที่ ${destination}; ใช้ --force เมื่อต้องการแทนที่`);
  }
  const parent = path.dirname(destination);
  const staging = path.join(parent, `.${SKILL_NAME}-staging-${process.pid}-${Date.now()}`);
  await mkdir(parent, { recursive: true });
  if (destinationExists) await rm(destination, { recursive: true, force: true });
  try {
    await cp(SKILL_ROOT, staging, {
      recursive: true,
      filter: source => !["node_modules", ".DS_Store"].includes(path.basename(source))
    });
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  if (!options.skipDeps) installDependencies(destination);
  return destination;
}

async function main() {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${help()}\n`);
    return;
  }
  const targets = options.target === "all" ? ["codex", "claude", "cursor", "gemini"] : [options.target];
  const destinations = targets.map(target => ({ target, destination: destinationFor(target, options) }));

  for (const item of destinations) {
    if (await exists(item.destination) && !options.force) {
      throw new Error(`มี skill อยู่แล้วที่ ${item.destination}; ใช้ --force เมื่อต้องการแทนที่`);
    }
  }
  for (const item of destinations) {
    const destination = await copyOne(item.target, options);
    process.stdout.write(`ติดตั้ง ${item.target}: ${destination}\n`);
    process.stdout.write(`เรียกใช้: ${commandFor(item.target)}\n`);
  }
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
