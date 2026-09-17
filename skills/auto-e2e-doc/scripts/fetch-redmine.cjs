#!/usr/bin/env node
"use strict";

/**
 * ดึงข้อมูล issue/SCR จาก Redmine API แล้วสร้าง flow JSON
 * ใช้ built-in fetch ของ Node 18+ ไม่ต้อง dependency เพิ่ม
 *
 * Authentication ผ่าน X-Redmine-API-Key header
 * Token อ่านจาก REDMINE_TOKEN env var หรือ --token flag
 *
 * Examples:
 *   REDMINE_TOKEN=xxx node fetch-redmine.cjs --url https://redmine.example.com --issue 1234 --out flow.json
 *   REDMINE_TOKEN=xxx node fetch-redmine.cjs --scr SCR-201 --out flow.json
 *   REDMINE_TOKEN=xxx node fetch-redmine.cjs --issue 1234 --download-brd --out flow.json
 */

const fs = require("fs");
const path = require("path");

const SKILL_DIR = path.resolve(__dirname, "..");
const CONFIG_NAMES = ["redmine.json", "redmine.config.json"];

/* ------------------------------------------------------------------ */
/*  CLI                                                                */
/* ------------------------------------------------------------------ */

function usage() {
  return [
    "ใช้:",
    "  node fetch-redmine.cjs --url <redmine-url> --issue <id> [--out flow.json]",
    "  node fetch-redmine.cjs --scr SCR-201 [--out flow.json]",
    "  node fetch-redmine.cjs --issue <id> --download-brd [--out flow.json]",
    "",
    "ตัวเลือก:",
    "  --url <url>              Redmine base URL (หรือใช้ REDMINE_URL env var)",
    "  --token <token>          API key / Personal Access Token (หรือใช้ REDMINE_TOKEN env var)",
    "  --issue <id>             Redmine issue ID",
    "  --scr <SCR-xxx>          ค้นหา issue จาก SCR custom field",
    "  --project <id>           Redmine project identifier (สำหรับค้นหา --scr)",
    "  --tracker <name>         Tracker name filter (default: จาก config หรือไม่กรอง)",
    "  --download-brd           ดาวน์โหลด BRD attachment (.docx) แล้วรัน import-brd",
    "  --field-map <mapping>    custom field mapping เช่น scr=cf_10,brd=cf_11",
    "  --config <file>          ไฟล์ config JSON (default: redmine.json ในโฟลเดอร์ปัจจุบันหรือ skill)",
    "  --out <file>             ไฟล์ output (ถ้าไม่ระบุจะพิมพ์ไปที่ stdout)",
    "  --help                   แสดงวิธีใช้"
  ].join("\n");
}

function parseCli(argv) {
  const options = {
    url: null,
    token: null,
    issueId: null,
    scr: null,
    project: null,
    tracker: null,
    downloadBrd: false,
    fieldMap: null,
    configFile: null,
    out: null
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--download-brd") { options.downloadBrd = true; continue; }
    const flags = ["--url", "--token", "--issue", "--scr", "--project", "--tracker", "--field-map", "--config", "--out"];
    if (flags.includes(arg)) {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`ต้องระบุค่าหลัง ${arg}`);
      i += 1;
      if (arg === "--url") options.url = value;
      if (arg === "--token") options.token = value;
      if (arg === "--issue") options.issueId = value;
      if (arg === "--scr") options.scr = value;
      if (arg === "--project") options.project = value;
      if (arg === "--tracker") options.tracker = value;
      if (arg === "--field-map") options.fieldMap = value;
      if (arg === "--config") options.configFile = value;
      if (arg === "--out") options.out = value;
      continue;
    }
    throw new Error(`ไม่รู้จักตัวเลือก ${arg}`);
  }
  if (!options.issueId && !options.scr) throw new Error("ต้องระบุ --issue <id> หรือ --scr <SCR-xxx>");
  return options;
}

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

function findConfig(configFile) {
  if (configFile) {
    const resolved = path.resolve(configFile);
    if (!fs.existsSync(resolved)) throw new Error(`ไม่พบ config: ${resolved}`);
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
  }
  // ค้นหา redmine.json ในโฟลเดอร์ปัจจุบัน หรือ skill templates
  const candidates = [
    ...CONFIG_NAMES.map(name => path.join(process.cwd(), name)),
    ...CONFIG_NAMES.map(name => path.join(SKILL_DIR, name)),
    path.join(SKILL_DIR, "templates", "redmine.json")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        return JSON.parse(fs.readFileSync(candidate, "utf8"));
      } catch (_) { /* skip invalid */ }
    }
  }
  return {};
}

function parseFieldMap(mapString) {
  if (!mapString) return {};
  const map = {};
  for (const pair of mapString.split(",")) {
    const [key, value] = pair.split("=").map(s => s.trim());
    if (key && value) map[key] = value;
  }
  return map;
}

function mergeConfig(options) {
  const config = findConfig(options.configFile);
  return {
    url: options.url || process.env.REDMINE_URL || config.url || "",
    token: options.token || process.env.REDMINE_TOKEN || "",
    project: options.project || config.projectId || config.project || "",
    tracker: options.tracker || config.trackerName || config.tracker || "",
    fieldMap: { ...(config.fieldMap || {}), ...parseFieldMap(options.fieldMap) }
  };
}

/* ------------------------------------------------------------------ */
/*  Redmine API                                                        */
/* ------------------------------------------------------------------ */

async function redmineGet(baseUrl, token, apiPath) {
  const url = `${baseUrl.replace(/\/+$/, "")}${apiPath}`;
  const response = await fetch(url, {
    headers: {
      "X-Redmine-API-Key": token,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Redmine API ${response.status}: ${apiPath}\n${body.slice(0, 200)}`);
  }
  return response.json();
}

async function getIssue(baseUrl, token, issueId) {
  const data = await redmineGet(baseUrl, token, `/issues/${issueId}.json?include=attachments,journals`);
  return data.issue;
}

async function searchIssue(baseUrl, token, scrId, project, tracker, fieldMap) {
  // ค้นจาก custom field หรือ subject
  const params = new URLSearchParams();
  params.set("limit", "5");
  if (project) params.set("project_id", project);
  if (tracker) params.set("tracker_id", tracker);

  // ลองค้นจาก subject ก่อน
  params.set("subject", `~${scrId}`);
  let data = await redmineGet(baseUrl, token, `/issues.json?${params.toString()}`);

  if (data.issues && data.issues.length > 0) return data.issues[0];

  // ลองค้นจาก custom field ถ้ามี field map
  const scrField = fieldMap.scr || fieldMap.scrId;
  if (scrField) {
    params.delete("subject");
    params.set(`${scrField}`, scrId);
    data = await redmineGet(baseUrl, token, `/issues.json?${params.toString()}`);
    if (data.issues && data.issues.length > 0) return data.issues[0];
  }

  throw new Error(`ไม่พบ issue ที่ตรงกับ ${scrId} ใน Redmine`);
}

function getCustomField(issue, fieldIdOrName) {
  if (!issue.custom_fields) return "";
  const field = issue.custom_fields.find(f =>
    f.id === Number(fieldIdOrName)
    || f.name === fieldIdOrName
    || `cf_${f.id}` === fieldIdOrName
  );
  return field ? String(field.value || "") : "";
}

/* ------------------------------------------------------------------ */
/*  BRD attachment download                                            */
/* ------------------------------------------------------------------ */

async function downloadBrdAttachment(issue, baseUrl, token, outDir) {
  if (!issue.attachments || !issue.attachments.length) {
    process.stderr.write("ไม่พบ attachment ใน issue\n");
    return null;
  }
  // หา .docx attachment (ชื่อที่มี BRD หรือ .docx)
  const docxAttachments = issue.attachments.filter(a =>
    a.filename && a.filename.toLowerCase().endsWith(".docx")
  );
  const brdAttachment = docxAttachments.find(a =>
    a.filename.toLowerCase().includes("brd")
  ) || docxAttachments[0];

  if (!brdAttachment) {
    process.stderr.write("ไม่พบ .docx attachment ใน issue\n");
    return null;
  }

  process.stderr.write(`ดาวน์โหลด: ${brdAttachment.filename}\n`);
  const response = await fetch(brdAttachment.content_url, {
    headers: { "X-Redmine-API-Key": token }
  });
  if (!response.ok) throw new Error(`ดาวน์โหลด attachment ไม่ได้: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const target = path.join(outDir, brdAttachment.filename);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(target, buffer);
  process.stderr.write(`บันทึก: ${target}\n`);
  return target;
}

/* ------------------------------------------------------------------ */
/*  Flow building                                                      */
/* ------------------------------------------------------------------ */

function issueToFlow(issue, fieldMap) {
  const scrId = getCustomField(issue, fieldMap.scr || "scr") || `REDMINE-${issue.id}`;
  const flow = {
    id: scrId,
    name: issue.subject || scrId,
    mode: "flow",
    source: `Redmine issue #${issue.id}`,
    brd: getCustomField(issue, fieldMap.brd || "brd") || "",
    fr: getCustomField(issue, fieldMap.fr || "fr") || "",
    actor: getCustomField(issue, fieldMap.actor || "actor")
      || (issue.assigned_to ? issue.assigned_to.name : ""),
    menu: getCustomField(issue, fieldMap.menu || "menu") || "",
    metadata: {
      redmineId: issue.id,
      tracker: issue.tracker ? issue.tracker.name : "",
      status: issue.status ? issue.status.name : "",
      priority: issue.priority ? issue.priority.name : "",
      project: issue.project ? issue.project.name : "",
      createdOn: issue.created_on || "",
      updatedOn: issue.updated_on || ""
    },
    cases: []
  };

  // ถ้า description มี content ลองแปลงเป็น steps
  if (issue.description) {
    const steps = parseDescription(issue.description);
    if (steps.length) {
      flow.cases.push({
        id: "FLOW-01",
        title: issue.subject || "ขั้นตอนการใช้งาน",
        objective: "",
        steps
      });
    }
  }

  return flow;
}

/**
 * ลองแปลง Redmine description (textile/markdown) เป็น flow steps
 */
function parseDescription(desc) {
  const lines = desc.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const steps = [];

  for (const line of lines) {
    // Textile: # step, * step, - step
    // Markdown: 1. step, - step, * step
    const match = line.match(/^(?:#|\*|-|\d+[.)]\s*)\s*(.+)/);
    if (match && match[1].length > 3) {
      steps.push({
        action: match[1].replace(/\*\*/g, "").replace(/_/g, "").trim(),
        observation: ""
      });
      continue;
    }
    // บรรทัดธรรมดาที่มี action keyword
    const ACTION_KEYWORDS = ["กด", "คลิก", "เลือก", "กรอก", "ค้นหา", "บันทึก", "เพิ่ม", "ลบ", "แก้ไข", "เปิด"];
    if (ACTION_KEYWORDS.some(kw => line.includes(kw)) && line.length > 5 && line.length < 200) {
      steps.push({
        action: line.replace(/\*\*/g, "").replace(/_/g, "").trim(),
        observation: ""
      });
    }
  }

  return steps;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function fetchRedmine(options) {
  const config = mergeConfig(options);
  if (!config.url) throw new Error("ต้องระบุ Redmine URL ด้วย --url หรือ REDMINE_URL env var หรือใน redmine.json");
  if (!config.token) throw new Error("ต้องระบุ token ด้วย --token หรือ REDMINE_TOKEN env var");

  let issue;
  if (options.issueId) {
    issue = await getIssue(config.url, config.token, options.issueId);
  } else {
    // ค้นจาก SCR
    const searchResult = await searchIssue(
      config.url, config.token, options.scr,
      config.project, config.tracker, config.fieldMap
    );
    // ดึง issue เต็มพร้อม attachments
    issue = await getIssue(config.url, config.token, searchResult.id);
  }

  process.stderr.write(`พบ issue #${issue.id}: ${issue.subject}\n`);

  let flow = issueToFlow(issue, config.fieldMap);

  // ดาวน์โหลด BRD attachment แล้ว import ถ้าต้องการ
  if (options.downloadBrd) {
    const outDir = options.out ? path.dirname(path.resolve(options.out)) : process.cwd();
    const brdPath = await downloadBrdAttachment(issue, config.url, config.token, outDir);
    if (brdPath) {
      try {
        const { importBrd } = require("./import-brd.cjs");
        const brdFlow = await importBrd({
          input: brdPath,
          scrId: flow.id,
          frOnly: false
        });
        // รวม cases จาก BRD เข้ากับ flow
        if (brdFlow.cases && brdFlow.cases.length) {
          flow.cases = brdFlow.cases;
          flow.brd = brdFlow.brd || flow.brd;
          flow.source = `Redmine issue #${issue.id} + BRD: ${path.basename(brdPath)}`;
        }
      } catch (e) {
        process.stderr.write(`import BRD ไม่สำเร็จ: ${e.message}\n`);
        process.stderr.write("ใช้ข้อมูลจาก issue description แทน\n");
      }
    }
  }

  return flow;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const flow = await fetchRedmine(options);
  const json = JSON.stringify(flow, null, 2) + "\n";

  if (options.out) {
    const outPath = path.resolve(options.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, json, "utf8");
    process.stderr.write(`สร้าง ${outPath}\n`);
    process.stderr.write(`พบ ${flow.cases.length} cases, ${flow.cases.reduce((n, c) => n + (c.steps ? c.steps.length : 0), 0)} steps\n`);
  } else {
    process.stdout.write(json);
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

module.exports = { fetchRedmine };
