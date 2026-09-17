#!/usr/bin/env node
"use strict";

/**
 * ดึงข้อมูล issue/SCR จาก Jira API แล้วสร้าง flow JSON
 * ใช้ built-in fetch ของ Node 18+ ไม่ต้อง dependency เพิ่ม
 *
 * Authentication รองรับ 2 แบบ:
 * 1. Basic Auth (Jira Cloud): ต้องใช้ Email และ API Token
 * 2. Bearer Token (Jira Server/DC): ใช้ Personal Access Token
 *
 * Examples:
 *   JIRA_TOKEN=xxx JIRA_EMAIL=user@test.com node fetch-jira.cjs --url https://xxx.atlassian.net --issue PROJ-123 --out flow.json
 *   JIRA_TOKEN=xxx node fetch-jira.cjs --issue PROJ-123 --download-brd --out flow.json
 */

const fs = require("fs");
const path = require("path");

const SKILL_DIR = path.resolve(__dirname, "..");
const CONFIG_NAMES = ["jira.json", "jira.config.json"];

/* ------------------------------------------------------------------ */
/*  CLI                                                                */
/* ------------------------------------------------------------------ */

function usage() {
  return [
    "ใช้:",
    "  node fetch-jira.cjs --url <jira-url> --issue <id> [--out flow.json]",
    "  node fetch-jira.cjs --issue PROJ-123 --download-brd [--out flow.json]",
    "",
    "ตัวเลือก:",
    "  --url <url>              Jira base URL (หรือใช้ JIRA_URL env var)",
    "  --email <email>          Jira Email สำหรับ Basic Auth (หรือใช้ JIRA_EMAIL)",
    "  --token <token>          API Token หรือ Personal Access Token (หรือใช้ JIRA_TOKEN)",
    "  --issue <id>             Jira issue key (เช่น PROJ-123)",
    "  --download-brd           ดาวน์โหลด BRD attachment (.docx) แล้วรัน import-brd",
    "  --field-map <mapping>    custom field mapping เช่น scr=customfield_10010",
    "  --config <file>          ไฟล์ config JSON",
    "  --out <file>             ไฟล์ output (ถ้าไม่ระบุจะพิมพ์ไปที่ stdout)",
    "  --help                   แสดงวิธีใช้"
  ].join("\n");
}

function parseCli(argv) {
  const options = {
    url: null,
    email: null,
    token: null,
    issueId: null,
    downloadBrd: false,
    fieldMap: null,
    configFile: null,
    out: null
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--download-brd") { options.downloadBrd = true; continue; }
    const flags = ["--url", "--email", "--token", "--issue", "--field-map", "--config", "--out"];
    if (flags.includes(arg)) {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`ต้องระบุค่าหลัง ${arg}`);
      i += 1;
      if (arg === "--url") options.url = value;
      if (arg === "--email") options.email = value;
      if (arg === "--token") options.token = value;
      if (arg === "--issue") options.issueId = value;
      if (arg === "--field-map") options.fieldMap = value;
      if (arg === "--config") options.configFile = value;
      if (arg === "--out") options.out = value;
      continue;
    }
    throw new Error(`ไม่รู้จักตัวเลือก ${arg}`);
  }
  if (!options.issueId) throw new Error("ต้องระบุ --issue <id>");
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
  const candidates = [
    ...CONFIG_NAMES.map(name => path.join(process.cwd(), name)),
    ...CONFIG_NAMES.map(name => path.join(SKILL_DIR, name)),
    path.join(SKILL_DIR, "templates", "jira.example.json")
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
    url: options.url || process.env.JIRA_URL || config.url || "",
    email: options.email || process.env.JIRA_EMAIL || config.email || "",
    token: options.token || process.env.JIRA_TOKEN || "",
    fieldMap: { ...(config.fieldMap || {}), ...parseFieldMap(options.fieldMap) }
  };
}

/* ------------------------------------------------------------------ */
/*  Jira API                                                           */
/* ------------------------------------------------------------------ */

function getAuthHeader(config) {
  if (config.email && config.token) {
    return "Basic " + Buffer.from(config.email + ":" + config.token).toString("base64");
  }
  return "Bearer " + config.token;
}

async function jiraGet(baseUrl, config, apiPath) {
  const url = `${baseUrl.replace(/\/+$/, "")}${apiPath}`;
  const response = await fetch(url, {
    headers: {
      "Authorization": getAuthHeader(config),
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Jira API ${response.status}: ${apiPath}\n${body.slice(0, 200)}`);
  }
  return response.json();
}

async function getIssue(baseUrl, config, issueId) {
  // ใช้ v2 API เพื่อให้ได้ description เป็น text ง่ายๆ
  return await jiraGet(baseUrl, config, `/rest/api/2/issue/${issueId}`);
}

function getField(issue, fieldIdOrName) {
  if (!issue.fields) return "";
  return issue.fields[fieldIdOrName] || "";
}

/* ------------------------------------------------------------------ */
/*  BRD attachment download                                            */
/* ------------------------------------------------------------------ */

async function downloadBrdAttachment(issue, baseUrl, config, outDir) {
  const attachments = issue.fields.attachment || [];
  if (!attachments.length) {
    process.stderr.write("ไม่พบ attachment ใน issue\n");
    return null;
  }
  const docxAttachments = attachments.filter(a =>
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
  const response = await fetch(brdAttachment.content, {
    headers: { "Authorization": getAuthHeader(config) }
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
  const fields = issue.fields || {};
  const flowId = issue.key;
  const flow = {
    id: flowId,
    name: fields.summary || flowId,
    mode: "flow",
    source: `Jira issue ${flowId}`,
    brd: getField(issue, fieldMap.brd || "customfield_10010") || "",
    fr: getField(issue, fieldMap.fr || "customfield_10011") || "",
    actor: fields.assignee ? fields.assignee.displayName : "",
    menu: "",
    metadata: {
      jiraId: issue.id,
      issueType: fields.issuetype ? fields.issuetype.name : "",
      status: fields.status ? fields.status.name : "",
      project: fields.project ? fields.project.name : "",
      createdOn: fields.created || "",
      updatedOn: fields.updated || ""
    },
    cases: []
  };

  if (fields.description) {
    const steps = parseDescription(fields.description);
    if (steps.length) {
      flow.cases.push({
        id: "FLOW-01",
        title: fields.summary || "ขั้นตอนการใช้งาน",
        objective: "",
        steps
      });
    }
  }

  return flow;
}

function parseDescription(desc) {
  const lines = String(desc).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const steps = [];

  for (const line of lines) {
    const match = line.match(/^(?:#|\*|-|\d+[.)]\s*)\s*(.+)/);
    if (match && match[1].length > 3) {
      steps.push({
        action: match[1].replace(/\*\*/g, "").replace(/_/g, "").trim(),
        observation: ""
      });
      continue;
    }
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

async function fetchJira(options) {
  const config = mergeConfig(options);
  if (!config.url) throw new Error("ต้องระบุ Jira URL ด้วย --url หรือ JIRA_URL env var");
  if (!config.token) throw new Error("ต้องระบุ token ด้วย --token หรือ JIRA_TOKEN env var");

  const issue = await getIssue(config.url, config, options.issueId);
  process.stderr.write(`พบ issue ${issue.key}: ${issue.fields.summary}\n`);

  let flow = issueToFlow(issue, config.fieldMap);

  if (options.downloadBrd) {
    const outDir = options.out ? path.dirname(path.resolve(options.out)) : process.cwd();
    const brdPath = await downloadBrdAttachment(issue, config.url, config, outDir);
    if (brdPath) {
      try {
        const { importBrd } = require("./import-brd.cjs");
        const brdFlow = await importBrd({
          input: brdPath,
          scrId: flow.id,
          frOnly: false
        });
        if (brdFlow.cases && brdFlow.cases.length) {
          flow.cases = brdFlow.cases;
          flow.brd = brdFlow.brd || flow.brd;
          flow.source = `Jira issue ${issue.key} + BRD: ${path.basename(brdPath)}`;
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

  const flow = await fetchJira(options);
  const json = JSON.stringify(flow, null, 2) + "\n";

  if (options.out) {
    const outPath = path.resolve(options.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, json, "utf8");
    process.stderr.write(`สร้าง ${outPath}\n`);
    process.stderr.write(`พบ ${flow.cases.length} cases\n`);
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

module.exports = { fetchJira };
