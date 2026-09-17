#!/usr/bin/env node
"use strict";

/**
 * อ่านไฟล์ BRD (.docx) แล้วแปลงเป็น flow JSON ตาม schema kl-scr-flow/v1
 *
 * ใช้ jszip (dependency ที่มีอยู่แล้ว) อ่าน .docx zip แล้วแยก word/document.xml
 * จากนั้นใช้ heuristic ดึงข้อความที่เป็น flow steps
 *
 * Examples:
 *   node import-brd.cjs --input BRD.docx --scr-id SCR-201 --out flow.json
 *   node import-brd.cjs --input BRD.docx --scr-id SCR-201   # stdout
 */

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

/* ------------------------------------------------------------------ */
/*  CLI                                                                */
/* ------------------------------------------------------------------ */

function usage() {
  return [
    "ใช้:",
    "  node import-brd.cjs --input BRD.docx --scr-id SCR-201 [--out flow.json]",
    "",
    "ตัวเลือก:",
    "  --input <file>        ไฟล์ BRD (.docx)",
    "  --scr-id <SCR-xxx>    SCR ID สำหรับ flow output",
    "  --out <file>          ไฟล์ output (ถ้าไม่ระบุจะพิมพ์ไปที่ stdout)",
    "  --fr-only             ดึงเฉพาะหัวข้อ FR ไม่ดึง step ย่อย",
    "  --help                แสดงวิธีใช้"
  ].join("\n");
}

function parseCli(argv) {
  const options = { input: null, scrId: null, out: null, frOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--fr-only") { options.frOnly = true; continue; }
    if (["--input", "--scr-id", "--out"].includes(arg)) {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`ต้องระบุค่าหลัง ${arg}`);
      i += 1;
      if (arg === "--input") options.input = value;
      if (arg === "--scr-id") options.scrId = value;
      if (arg === "--out") options.out = value;
      continue;
    }
    throw new Error(`ไม่รู้จักตัวเลือก ${arg}`);
  }
  if (!options.input) throw new Error("ต้องระบุ --input <file.docx>");
  if (!options.scrId) throw new Error("ต้องระบุ --scr-id <SCR-xxx>");
  return options;
}

/* ------------------------------------------------------------------ */
/*  DOCX text extraction                                               */
/* ------------------------------------------------------------------ */

/**
 * อ่าน .docx แล้วคืน array ของ paragraph text
 * ใช้ jszip แยก word/document.xml แล้ว parse XML ด้วย regex
 * (ไม่ต้อง dependency xml parser เพิ่ม)
 */
async function extractParagraphs(docxPath) {
  const buffer = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("ไม่พบ word/document.xml ในไฟล์ .docx");
  const xml = await docFile.async("string");

  // แยก paragraph (<w:p>...</w:p>) แล้วดึงข้อความจาก <w:t> ภายใน
  const paragraphs = [];
  const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;

  let pMatch;
  while ((pMatch = pRegex.exec(xml)) !== null) {
    const pContent = pMatch[1];
    let text = "";
    let tMatch;
    // reset regex
    tRegex.lastIndex = 0;
    while ((tMatch = tRegex.exec(pContent)) !== null) {
      text += tMatch[1];
    }
    text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
    if (text) paragraphs.push(text);
  }

  return paragraphs;
}

/* ------------------------------------------------------------------ */
/*  Heuristic flow extraction                                          */
/* ------------------------------------------------------------------ */

// Pattern ที่ใช้ตรวจหาหัวข้อ FR
const FR_PATTERN = /^(FR[-\s]?\d+[\.\d]*)\s*[:\-–—]?\s*(.*)/i;

// Pattern ที่ใช้ตรวจหาลำดับขั้นตอน (numbered list)
const NUMBERED_STEP = /^(\d+)\s*[.)]\s*(.*)/;

// คำสำคัญที่บ่งบอกว่าเป็น action step (ภาษาไทย)
const ACTION_KEYWORDS = [
  "กด", "คลิก", "เลือก", "กรอก", "พิมพ์", "ระบุ", "เปิด", "ปิด",
  "ค้นหา", "บันทึก", "ยืนยัน", "อนุมัติ", "ลบ", "แก้ไข", "เพิ่ม",
  "ส่ง", "ตรวจสอบ", "แสดง", "ดาวน์โหลด", "อัปโหลด", "นำเข้า", "ส่งออก",
  "เข้าเมนู", "เข้าสู่ระบบ", "ออกจากระบบ", "เปลี่ยน", "แนบ"
];

// คำสำคัญ (ภาษาอังกฤษ)
const ACTION_KEYWORDS_EN = [
  "click", "select", "enter", "type", "input", "open", "close",
  "search", "save", "confirm", "approve", "delete", "edit", "add",
  "submit", "verify", "display", "download", "upload", "import", "export",
  "navigate", "login", "logout", "change", "attach"
];

function isActionLike(text) {
  const lower = text.toLowerCase();
  return ACTION_KEYWORDS.some(kw => text.includes(kw))
    || ACTION_KEYWORDS_EN.some(kw => lower.includes(kw));
}

// ตรวจว่าเป็นหัวข้อ (สั้น, ไม่ใช่ action, อาจมี bold marker)
function isHeadingLike(text) {
  if (text.length > 120) return false;
  if (FR_PATTERN.test(text)) return true;
  // หัวข้อสั้นที่ไม่มี action keyword
  if (text.length < 60 && !isActionLike(text)) return true;
  return false;
}

/**
 * แปลง paragraphs เป็น cases + steps
 *
 * กลยุทธ์:
 * - เจอ FR pattern -> เริ่ม case ใหม่
 * - เจอ numbered step หรือ action keyword -> เป็น step ใน case ปัจจุบัน
 * - ข้อความสั้นที่ดูเป็นหัวข้อ -> เริ่ม case ใหม่
 */
function extractFlow(paragraphs, options = {}) {
  const cases = [];
  let currentCase = null;
  let brdTitle = "";
  let caseIndex = 0;

  // ลองดึงชื่อ BRD จาก paragraph แรก ๆ
  for (let i = 0; i < Math.min(5, paragraphs.length); i++) {
    if (paragraphs[i].length > 10 && !FR_PATTERN.test(paragraphs[i])) {
      brdTitle = paragraphs[i];
      break;
    }
  }

  for (const para of paragraphs) {
    // ตรวจ FR heading
    const frMatch = para.match(FR_PATTERN);
    if (frMatch) {
      caseIndex += 1;
      currentCase = {
        id: frMatch[1].replace(/\s+/g, "").toUpperCase(),
        title: frMatch[2] || frMatch[1],
        objective: "",
        steps: []
      };
      cases.push(currentCase);
      continue;
    }

    if (options.frOnly) continue;

    // ตรวจ numbered step
    const numMatch = para.match(NUMBERED_STEP);
    if (numMatch && numMatch[2].length > 3) {
      if (!currentCase) {
        caseIndex += 1;
        currentCase = {
          id: `FLOW-${String(caseIndex).padStart(2, "0")}`,
          title: `ขั้นตอนที่ ${caseIndex}`,
          objective: "",
          steps: []
        };
        cases.push(currentCase);
      }
      currentCase.steps.push({
        action: numMatch[2].trim(),
        observation: ""
      });
      continue;
    }

    // ตรวจ action keyword
    if (isActionLike(para) && para.length > 5) {
      if (!currentCase) {
        caseIndex += 1;
        currentCase = {
          id: `FLOW-${String(caseIndex).padStart(2, "0")}`,
          title: `ขั้นตอนที่ ${caseIndex}`,
          objective: "",
          steps: []
        };
        cases.push(currentCase);
      }
      currentCase.steps.push({
        action: para.trim(),
        observation: ""
      });
      continue;
    }

    // ตรวจหัวข้อสั้นที่อาจเป็น case ใหม่
    if (isHeadingLike(para) && para.length > 5 && cases.length > 0) {
      // ถ้า case ปัจจุบันมี step แล้ว เริ่ม case ใหม่
      if (currentCase && currentCase.steps.length > 0) {
        caseIndex += 1;
        currentCase = {
          id: `FLOW-${String(caseIndex).padStart(2, "0")}`,
          title: para,
          objective: "",
          steps: []
        };
        cases.push(currentCase);
      } else if (currentCase && currentCase.steps.length === 0) {
        // ยังไม่มี step ให้ใช้เป็น title ของ case ปัจจุบัน
        currentCase.title = para;
      }
    }
  }

  // กรอง case ที่ไม่มี step ออก (ยกเว้น frOnly mode)
  const filtered = options.frOnly
    ? cases
    : cases.filter(c => c.steps.length > 0);

  return { brdTitle, cases: filtered };
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function importBrd(options) {
  const docxPath = path.resolve(options.input);
  if (!fs.existsSync(docxPath)) throw new Error(`ไม่พบไฟล์ ${docxPath}`);
  const ext = path.extname(docxPath).toLowerCase();
  if (ext !== ".docx") throw new Error(`รองรับเฉพาะ .docx (ได้รับ ${ext})`);

  const paragraphs = await extractParagraphs(docxPath);
  if (!paragraphs.length) throw new Error("ไม่พบข้อความในไฟล์ .docx");

  const result = extractFlow(paragraphs, { frOnly: options.frOnly });

  const flow = {
    id: options.scrId,
    name: result.brdTitle || options.scrId,
    mode: "flow",
    source: `BRD: ${path.basename(docxPath)}`,
    brd: result.brdTitle || path.basename(docxPath, ".docx"),
    cases: result.cases
  };

  if (!flow.cases.length) {
    process.stderr.write("ไม่พบ flow steps ใน BRD; ตรวจสอบว่าไฟล์มี FR heading หรือ numbered steps\n");
    process.stderr.write(`พบ ${paragraphs.length} paragraphs แต่ไม่ตรง pattern ที่รู้จัก\n`);
    // ยังคง output JSON ที่ว่าง เพื่อให้ผู้ใช้แก้ไขต่อได้
  }

  return flow;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const flow = await importBrd(options);
  const json = JSON.stringify(flow, null, 2) + "\n";

  if (options.out) {
    const outPath = path.resolve(options.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, json, "utf8");
    process.stdout.write(`สร้าง ${outPath}\n`);
    process.stdout.write(`พบ ${flow.cases.length} cases, ${flow.cases.reduce((n, c) => n + (c.steps ? c.steps.length : 0), 0)} steps\n`);
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

module.exports = { importBrd, extractParagraphs, extractFlow };
