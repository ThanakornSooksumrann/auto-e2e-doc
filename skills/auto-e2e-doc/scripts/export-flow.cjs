#!/usr/bin/env node
"use strict";

/**
 * Convert a safe Cypress result.json or a portable flow JSON file into
 * concise DOCX, XLSX, CSV, PDF, and/or JSON evidence.
 *
 * Examples:
 *   node export-flow.cjs --scr SCR-201 --project-root /path/to/project --formats docx,xlsx
 *   node export-flow.cjs --input flow.json --mode flow --formats docx,csv,json --out-dir ./output
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  AlignmentType,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  TextRun
} = require("docx");
const ExcelJS = require("exceljs");
const JSZip = require("jszip");

const FONT = "Sarabun";
const IMAGE_WIDTH = 680;
const FORMATS = new Set(["docx", "xlsx", "csv", "pdf", "json", "html"]);

function text(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\u0000/g, "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function safeFileStem(value, fallback = "flow") {
  const cleaned = text(value)
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function cliError(message) {
  const error = new Error(message);
  error.isCliError = true;
  return error;
}

function usage() {
  return [
    "ใช้:",
    "  node export-flow.cjs --scr SCR-201 --project-root /path/to/project --formats docx,xlsx,csv,pdf,json,html",
    "  node export-flow.cjs --input flow.json --mode flow --formats docx,csv,json,html --out-dir ./output",
    "  node export-flow.cjs --from-brd BRD.docx --scr SCR-201 --formats docx,csv",
    "  node export-flow.cjs --from-redmine 1234 --formats docx,xlsx",
    "  node export-flow.cjs --from-jira PROJ-123 --formats docx,xlsx",
    "",
    "ตัวเลือก:",
    "  --scr <SCR-xxx>          อ่าน <project-root>/<SCR>/output/result.json",
    "  --input <file.json>      อ่าน Cypress result.json หรือ flow JSON",
    "  --from-brd <file.docx>   อ่าน BRD แปลงเป็น flow แล้ว export ในคำสั่งเดียว",
    "  --from-redmine <id>      ดึงจาก Redmine issue แล้ว export ในคำสั่งเดียว",
    "  --from-jira <id>         ดึงจาก Jira issue แล้ว export ในคำสั่งเดียว",
    "  --mode <test|flow>       ระบุชนิดของหลักฐานใน output",
    "  --formats <list>         docx,xlsx,csv,pdf,json,html (default: docx)",
    "  --out-dir <directory>    โฟลเดอร์ผลลัพธ์",
    "  --project-root <path>    project root สำหรับ --scr (default: current directory)"
  ].join("\n");
}

function parseFormats(value) {
  const formats = text(value)
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  if (!formats.length) throw cliError("--formats ต้องมีอย่างน้อยหนึ่ง format");
  const invalid = formats.filter(format => !FORMATS.has(format));
  if (invalid.length) throw cliError(`ไม่รองรับ format: ${invalid.join(", ")}`);
  return [...new Set(formats)];
}

function parseCli(argv) {
  const options = {
    formats: ["docx"],
    fromBrd: null,
    fromRedmine: null,
    fromJira: null,
    input: null,
    mode: null,
    outDir: null,
    projectRoot: process.cwd(),
    scr: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (["--input", "--scr", "--mode", "--formats", "--format", "--out-dir", "--project-root", "--from-brd", "--from-redmine", "--from-jira"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw cliError(`ต้องระบุค่าหลัง ${arg}`);
      index += 1;
      if (arg === "--input") options.input = value;
      if (arg === "--scr") options.scr = value;
      if (arg === "--mode") options.mode = text(value).toLowerCase();
      if (arg === "--formats" || arg === "--format") options.formats = parseFormats(value);
      if (arg === "--out-dir") options.outDir = value;
      if (arg === "--project-root") options.projectRoot = value;
      if (arg === "--from-brd") options.fromBrd = value;
      if (arg === "--from-redmine") options.fromRedmine = value;
      if (arg === "--from-jira") options.fromJira = value;
      continue;
    }
    throw cliError(`ไม่รู้จักตัวเลือก ${arg}`);
  }

  if (options.mode && !["test", "flow"].includes(options.mode)) {
    throw cliError("--mode ใช้ได้เฉพาะ test หรือ flow");
  }

  // --from-brd, --from-redmine, และ --from-jira เป็น shortcut ที่ไม่ต้องระบุ --input / --scr
  if (options.fromBrd || options.fromRedmine || options.fromJira) {
    if (!options.outDir) options.outDir = path.resolve("output");
    else options.outDir = path.resolve(options.outDir);
    options.projectRoot = path.resolve(options.projectRoot);
    return options;
  }

  if (options.input && options.scr) throw cliError("เลือก --input หรือ --scr อย่างใดอย่างหนึ่ง");
  if (!options.input && !options.scr) throw cliError("ต้องระบุ --input, --scr, --from-brd, --from-redmine หรือ --from-jira");

  options.projectRoot = path.resolve(options.projectRoot);
  if (options.scr) {
    options.input = path.join(options.projectRoot, options.scr, "output", "result.json");
  } else {
    options.input = path.resolve(options.input);
  }

  if (options.outDir) {
    options.outDir = path.resolve(options.outDir);
  } else if (options.scr) {
    options.outDir = path.dirname(options.input);
  } else if (path.basename(options.input).toLowerCase() === "result.json") {
    options.outDir = path.dirname(options.input);
  } else {
    options.outDir = path.join(path.dirname(options.input), "output");
  }
  return options;
}

function readJson(input) {
  if (!fs.existsSync(input)) throw cliError(`ไม่พบไฟล์ input: ${input}`);
  try {
    return JSON.parse(fs.readFileSync(input, "utf8"));
  } catch (error) {
    throw cliError(`อ่าน JSON ไม่ได้: ${path.basename(input)}`);
  }
}

function screenshotValue(step) {
  if (!step || typeof step !== "object") return "";
  if (typeof step.screenshot === "string") return step.screenshot;
  if (step.screenshot && typeof step.screenshot.path === "string") return step.screenshot.path;
  if (typeof step.image === "string") return step.image;
  if (typeof step.capture === "string") return step.capture;
  return "";
}

function resolveScreenshot(reference, inputDir, projectRoot) {
  const supplied = text(reference);
  if (!supplied || supplied.startsWith("data:")) return { file: null, reference: "" };

  const candidates = path.isAbsolute(supplied)
    ? [supplied]
    : [path.resolve(inputDir, supplied), path.resolve(projectRoot, supplied)];
  const file = candidates.find(candidate => {
    try {
      return fs.statSync(candidate).isFile();
    } catch (_) {
      return false;
    }
  });
  return {
    file: file || null,
    reference: path.isAbsolute(supplied) ? path.basename(supplied) : supplied
  };
}

function stepAction(step, index) {
  if (typeof step === "string") return text(step);
  if (!step || typeof step !== "object") return "";
  return text(step.action || step.step || step.name || step.title || step.description);
}

function normalizeStep(rawStep, index, inputDir, projectRoot) {
  const object = typeof rawStep === "string" ? { action: rawStep } : rawStep || {};
  const action = stepAction(object, index);
  if (!action) return null;
  const image = resolveScreenshot(screenshotValue(object), inputDir, projectRoot);
  return {
    no: index,
    action,
    observation: text(object.observation || object.expected || object.result),
    screenshot: image.reference,
    screenshotFile: image.file
  };
}

function caseSteps(rawCase) {
  if (!rawCase || typeof rawCase !== "object") return [];
  if (Array.isArray(rawCase.steps)) return rawCase.steps;
  if (Array.isArray(rawCase.flow)) return rawCase.flow;
  if (Array.isArray(rawCase.actions)) return rawCase.actions;
  return [];
}

function normalizeCase(rawCase, index, inputDir, projectRoot) {
  const object = rawCase || {};
  const steps = caseSteps(object)
    .map((step, stepIndex) => normalizeStep(step, stepIndex + 1, inputDir, projectRoot))
    .filter(Boolean);
  return {
    id: text(object.id || object.caseId || object.code || `FLOW-${String(index).padStart(2, "0")}`),
    title: text(object.title || object.name || object.description || `Flow ${index}`),
    objective: text(object.objective),
    steps
  };
}

function inferMode(raw, requestedMode) {
  if (requestedMode) return requestedMode;
  if (text(raw && raw.mode).toLowerCase() === "test") return "test";
  if (text(raw && raw.mode).toLowerCase() === "flow") return "flow";
  return raw && (raw.runAt || raw.cypress || raw.testRun) ? "test" : "flow";
}

function normalizeFlow(raw, options = {}) {
  const inputDir = path.dirname(options.inputPath || options.input || process.cwd());
  const projectRoot = options.projectRoot || process.cwd();
  const rawCases = list(raw && raw.cases);
  const fallbackSteps = rawCases.length
    ? []
    : list(raw && (raw.steps || raw.flow || raw.actions));
  const cases = (rawCases.length ? rawCases : [{
    id: raw && raw.caseId,
    title: raw && (raw.caseTitle || raw.title),
    objective: raw && raw.objective,
    steps: fallbackSteps
  }])
    .map((item, index) => normalizeCase(item, index + 1, inputDir, projectRoot))
    .filter(item => item.steps.length);

  if (!cases.length) throw cliError("ไม่พบ action ใน input JSON");
  const id = text(raw && (raw.scr || raw.id || raw.code || raw.reference)) || "FLOW";
  const name = text(raw && (raw.name || raw.title || raw.description)) || id;
  return {
    schema: "kl-scr-flow/v1",
    id,
    name,
    mode: inferMode(raw, options.mode),
    source: text(raw && raw.source) || (inferMode(raw, options.mode) === "test" ? "Cypress result" : "Flow input"),
    metadata: {
      brd: text(raw && raw.brd),
      fr: text(raw && raw.fr),
      actor: text(raw && raw.actor),
      menu: text(raw && raw.menu)
    },
    cases
  };
}

function publicFlow(flow) {
  return {
    schema: flow.schema,
    id: flow.id,
    name: flow.name,
    mode: flow.mode,
    source: flow.source,
    metadata: Object.fromEntries(Object.entries(flow.metadata).filter(([, value]) => value)),
    cases: flow.cases.map(testCase => ({
      id: testCase.id,
      title: testCase.title,
      objective: testCase.objective || undefined,
      steps: testCase.steps.map(step => ({
        no: step.no,
        action: step.action,
        observation: step.observation || undefined,
        screenshot: step.screenshot || undefined
      }))
    }))
  };
}

async function markThaiRunsAsComplexScript(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) return buffer;
  const xml = await documentFile.async("string");
  const patched = xml.replace(/<w:r>[\s\S]*?<\/w:r>/g, run => {
    if (!/[ก-๛]/.test(run) || /<w:cs\b/.test(run)) return run;
    if (/<w:rPr>[\s\S]*?<\/w:rPr>/.test(run)) {
      return run.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/, "<w:rPr>$1<w:cs/></w:rPr>");
    }
    return run.replace("<w:r>", "<w:r><w:rPr><w:cs/></w:rPr>");
  });
  zip.file("word/document.xml", patched);
  return zip.generateAsync({ type: "nodebuffer" });
}

function wordRun(value, options = {}) {
  return new TextRun({
    text: text(value),
    bold: Boolean(options.bold),
    color: "000000",
    font: { ascii: FONT, cs: FONT, eastAsia: FONT, hAnsi: FONT, hint: "cs" },
    language: { value: "th-TH", eastAsia: "th-TH", bidirectional: "th-TH" },
    size: options.size || 22
  });
}

function wordParagraph(value, options = {}) {
  return new Paragraph({
    alignment: options.alignment || AlignmentType.LEFT,
    keepNext: Boolean(options.keepNext),
    spacing: {
      before: options.before || 40,
      after: options.after === undefined ? 140 : options.after,
      line: options.line || 360
    },
    children: [wordRun(value, options)]
  });
}

function pngSize(buffer) {
  const isPng = buffer.length >= 24
    && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!isPng) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function screenshotParagraph(file) {
  if (!file || path.extname(file).toLowerCase() !== ".png") return null;
  try {
    const data = fs.readFileSync(file);
    const dimensions = pngSize(data);
    if (!dimensions || !dimensions.width || !dimensions.height) return null;
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new ImageRun({
          type: "png",
          data,
          transformation: {
            width: IMAGE_WIDTH,
            height: Math.round((IMAGE_WIDTH * dimensions.height) / dimensions.width)
          }
        })
      ]
    });
  } catch (_) {
    return null;
  }
}

async function writeDocx(flow, target) {
  const body = [
    wordParagraph(`${flow.id} ${flow.name}`.trim(), {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 32,
      after: 80
    }),
    wordParagraph(flow.mode === "test" ? "Flow การใช้งานจริง" : "Flow การใช้งาน", {
      alignment: AlignmentType.CENTER,
      size: 24,
      after: 300
    })
  ];

  let flowNo = 0;
  flow.cases.forEach((testCase, caseIndex) => {
    body.push(wordParagraph(testCase.title || testCase.id || `Flow ${caseIndex + 1}`, {
      before: 120,
      after: 70,
      bold: true,
      keepNext: true,
      size: 26
    }));
    testCase.steps.forEach(step => {
      flowNo += 1;
      const image = screenshotParagraph(step.screenshotFile);
      body.push(wordParagraph(`${flowNo}. ${step.action}`, {
        after: 90,
        keepNext: Boolean(image),
        size: 22
      }));
      if (image) body.push(image);
    });
  });

  const document = new Document({
    creator: "kl-scr-flow",
    title: `${flow.id} ${flow.name}`.trim(),
    styles: { default: { document: { run: { font: FONT, size: 28 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 900, bottom: 900, left: 900, right: 900 }
        }
      },
      children: body
    }]
  });
  const buffer = await Packer.toBuffer(document);
  fs.writeFileSync(target, await markThaiRunsAsComplexScript(buffer));
}

function formatMode(mode) {
  return mode === "test" ? "ทดสอบจริง" : "อธิบาย flow";
}

async function writeXlsx(flow, target) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "kl-scr-flow";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Flow", {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  sheet.properties.defaultRowHeight = 23;
  sheet.mergeCells("A1:F1");
  sheet.getCell("A1").value = `${flow.id} ${flow.name}`.trim();
  sheet.getCell("A1").font = { name: FONT, size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF007E7A" } };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "center" };
  sheet.getRow(1).height = 30;

  sheet.mergeCells("A2:F2");
  sheet.getCell("A2").value = `โหมด: ${formatMode(flow.mode)}`;
  sheet.getCell("A2").font = { name: FONT, size: 11, bold: true, color: { argb: "FF0B4F4C" } };
  sheet.getCell("A2").alignment = { horizontal: "left", vertical: "center" };

  sheet.mergeCells("A3:F3");
  sheet.getCell("A3").value = "เอกสารนี้เป็นลำดับการใช้งานแบบย่อ";
  sheet.getCell("A3").font = { name: FONT, size: 11, color: { argb: "FF404040" } };
  sheet.getCell("A3").alignment = { horizontal: "left", vertical: "center" };

  const headerRow = sheet.getRow(5);
  headerRow.values = ["ลำดับ", "รหัสกรณี", "ชื่อกรณี", "การดำเนินการ", "ผลที่สังเกต", "ภาพประกอบ"];
  headerRow.height = 26;
  headerRow.eachCell(cell => {
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF008F8A" } };
    cell.alignment = { horizontal: "center", vertical: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFB7D9D7" } },
      left: { style: "thin", color: { argb: "FFB7D9D7" } },
      bottom: { style: "thin", color: { argb: "FFB7D9D7" } },
      right: { style: "thin", color: { argb: "FFB7D9D7" } }
    };
  });

  let flowNo = 0;
  let rowIndex = 6;
  flow.cases.forEach(testCase => {
    testCase.steps.forEach(step => {
      flowNo += 1;
      const row = sheet.addRow([
        flowNo,
        testCase.id,
        testCase.title,
        step.action,
        step.observation,
        "" // เว้นว่างไว้สำหรับรูปภาพ
      ]);
      row.eachCell(cell => {
        cell.font = { name: FONT, size: 11, color: { argb: "FF000000" } };
        cell.alignment = { vertical: "top", wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FFDDECEA" } },
          left: { style: "thin", color: { argb: "FFDDECEA" } },
          bottom: { style: "thin", color: { argb: "FFDDECEA" } },
          right: { style: "thin", color: { argb: "FFDDECEA" } }
        };
      });
      
      let finalRowHeight = 34; // ค่าเริ่มต้น

      // ฝังรูปภาพลงในเซลล์ (ถ้ารูปภาพมีจริง)
      if (step.screenshotFile && fs.existsSync(step.screenshotFile)) {
        try {
          const imgData = fs.readFileSync(step.screenshotFile);
          const dimensions = pngSize(imgData);
          if (dimensions) {
            const ext = step.screenshotFile.split('.').pop().toLowerCase() === 'png' ? 'png' : 'jpeg';
            const imageId = workbook.addImage({
              buffer: imgData,
              extension: ext,
            });
            
            // คำนวณขนาดภาพ (ให้มีความกว้างสุดไม่เกิน 400px ใน Excel)
            const MAX_IMG_WIDTH = 400;
            let imgWidth = dimensions.width;
            let imgHeight = dimensions.height;
            if (imgWidth > MAX_IMG_WIDTH) {
              const ratio = MAX_IMG_WIDTH / imgWidth;
              imgWidth = MAX_IMG_WIDTH;
              imgHeight = imgHeight * ratio;
            }

            // คำนวณความสูงแถวให้พอดีกับภาพ (pixel -> points โดยคูณประมาณ 0.75 + ช่องว่างนิดหน่อย)
            const heightInPoints = Math.round(imgHeight * 0.75) + 20;
            finalRowHeight = Math.max(34, heightInPoints);

            sheet.addImage(imageId, {
              tl: { col: 5, row: rowIndex - 1 }, // คอลัมน์ F (0-indexed คือ 5)
              ext: { width: Math.round(imgWidth), height: Math.round(imgHeight) }
            });
          }
        } catch (e) {
          row.getCell(6).value = step.screenshot || step.screenshotFile;
        }
      } else {
        row.getCell(6).value = step.screenshot || "";
      }

      row.height = finalRowHeight;
      rowIndex += 1;
    });
  });
  sheet.columns = [
    { width: 9 },
    { width: 16 },
    { width: 26 },
    { width: 52 },
    { width: 35 },
    { width: 65 } // ขยายคอลัมน์รูปให้กว้างขึ้น
  ];
  sheet.autoFilter = { from: "A5", to: `F${Math.max(5, sheet.rowCount)}` };
  await workbook.xlsx.writeFile(target);
}

function csvCell(value) {
  const escaped = text(value).replace(/"/g, '""');
  return `"${escaped}"`;
}

function writeCsv(flow, target) {
  const rows = [["ลำดับ", "รหัสกรณี", "ชื่อกรณี", "การดำเนินการ", "ผลที่สังเกต", "ภาพประกอบ"]];
  let flowNo = 0;
  flow.cases.forEach(testCase => {
    testCase.steps.forEach(step => {
      flowNo += 1;
      rows.push([flowNo, testCase.id, testCase.title, step.action, step.observation, step.screenshot]);
    });
  });
  fs.writeFileSync(target, `\uFEFF${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`, "utf8");
}

function writeJson(flow, target) {
  fs.writeFileSync(target, `${JSON.stringify(publicFlow(flow), null, 2)}\n`, "utf8");
}

function writeHtml(flow, target) {
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${flow.id} ${flow.name}</title>
  <style>
    body { font-family: '${FONT}', Tahoma, sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6; }
    h1 { text-align: center; color: #007E7A; font-size: 2em; margin-bottom: 5px; }
    .mode { text-align: center; font-weight: bold; margin-bottom: 40px; color: #555; }
    .case { margin-top: 40px; padding: 20px; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    h2 { color: #008F8A; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; }
    .step { margin-bottom: 30px; padding: 15px; background: #fdfdfd; border-radius: 8px; border-left: 4px solid #007E7A; }
    .step-header { font-weight: bold; margin-bottom: 10px; font-size: 1.2em; color: #222; }
    .observation { color: #555; margin-bottom: 15px; font-style: italic; background: #eef8f8; padding: 10px; border-radius: 4px; display: inline-block; }
    .img-container { text-align: center; margin-top: 15px; }
    img { max-width: 100%; height: auto; display: inline-block; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
  </style></head><body>
  <h1>${flow.id} ${flow.name}</h1>
  <div class="mode">โหมด: ${formatMode(flow.mode)}</div>`;

  let flowNo = 0;
  flow.cases.forEach((testCase) => {
    html += `<div class="case"><h2>${testCase.title || testCase.id}</h2>`;
    testCase.steps.forEach(step => {
      flowNo += 1;
      html += `<div class="step"><div class="step-header">${flowNo}. ${step.action}</div>`;
      if (step.observation) html += `<div class="observation">ผล: ${step.observation}</div>`;
      if (step.screenshotFile && fs.existsSync(step.screenshotFile)) {
        try {
           const base64 = fs.readFileSync(step.screenshotFile, 'base64');
           html += `<div class="img-container"><img src="data:image/png;base64,${base64}" alt="Screenshot for step ${flowNo}"></div>`;
        } catch(e){}
      } else if (step.screenshot) {
        html += `<div class="img-container"><span style="color:#999">[ภาพ: ${step.screenshot}]</span></div>`;
      }
      html += `</div>`;
    });
    html += `</div>`;
  });
  html += `</body></html>`;
  fs.writeFileSync(target, html, "utf8");
}

function sofficeEnvironment() {
  const env = { ...process.env };
  if (process.platform !== "darwin" || env.FONTCONFIG_FILE) return env;
  const candidates = [
    "/opt/homebrew/etc/fonts/fonts.conf",
    "/usr/local/etc/fonts/fonts.conf",
    "/etc/fonts/fonts.conf"
  ];
  const config = candidates.find(candidate => fs.existsSync(candidate));
  if (config) {
    env.FONTCONFIG_FILE = config;
    env.FONTCONFIG_PATH = path.dirname(config);
  }
  return env;
}

function convertPdf(docxSource, target) {
  const outputDir = path.dirname(target);
  const expected = path.join(outputDir, `${path.parse(docxSource).name}.pdf`);
  const candidates = [process.env.SOFFICE_PATH, "soffice", "libreoffice"].filter(Boolean);
  const attempts = [];
  for (const command of candidates) {
    const result = spawnSync(command, ["--headless", "--convert-to", "pdf", "--outdir", outputDir, docxSource], {
      encoding: "utf8",
      env: sofficeEnvironment(),
      windowsHide: true
    });
    if (!result.error && result.status === 0 && fs.existsSync(expected)) {
      if (expected !== target) fs.renameSync(expected, target);
      return;
    }
    attempts.push(result.error ? `${command}: unavailable` : `${command}: exit ${result.status}`);
  }
  throw cliError(`สร้าง PDF ไม่ได้ — ติดตั้ง LibreOffice/soffice หรือกำหนด SOFFICE_PATH (${attempts.join("; ")})`);
}

async function exportFlow(options) {
  const raw = readJson(options.input);
  const flow = normalizeFlow(raw, options);
  fs.mkdirSync(options.outDir, { recursive: true });
  const stem = safeFileStem(flow.id);
  const target = format => path.join(options.outDir, `${stem}.${format}`);
  const outputs = [];
  const wants = format => options.formats.includes(format);
  const needDocxSource = wants("docx") || wants("pdf");
  const tempDocx = needDocxSource && !wants("docx")
    ? path.join(options.outDir, `.${stem}-${process.pid}-${Date.now()}.docx`)
    : null;
  const docxSource = wants("docx") ? target("docx") : tempDocx;

  try {
    if (needDocxSource) {
      await writeDocx(flow, docxSource);
      if (wants("docx")) outputs.push(target("docx"));
    }
    if (wants("xlsx")) {
      await writeXlsx(flow, target("xlsx"));
      outputs.push(target("xlsx"));
    }
    if (wants("csv")) {
      writeCsv(flow, target("csv"));
      outputs.push(target("csv"));
    }
    if (wants("json")) {
      writeJson(flow, target("json"));
      outputs.push(target("json"));
    }
    if (wants("html")) {
      writeHtml(flow, target("html"));
      outputs.push(target("html"));
    }
    if (wants("pdf")) {
      convertPdf(docxSource, target("pdf"));
      outputs.push(target("pdf"));
    }
  } finally {
    if (tempDocx && fs.existsSync(tempDocx)) fs.unlinkSync(tempDocx);
  }
  return { flow, outputs };
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  // Shortcut: --from-brd -> import BRD -> สร้าง flow JSON ชั่วคราว -> export
  if (options.fromBrd) {
    const { importBrd } = require("./import-brd.cjs");
    const scrId = options.scr || path.basename(options.fromBrd, ".docx").replace(/\s+/g, "-");
    const flow = await importBrd({ input: options.fromBrd, scrId, frOnly: false });
    const tmpInput = path.join(options.outDir, `.brd-import-${process.pid}.json`);
    fs.mkdirSync(options.outDir, { recursive: true });
    fs.writeFileSync(tmpInput, JSON.stringify(flow, null, 2));
    try {
      options.input = tmpInput;
      if (!options.mode) options.mode = "flow";
      const result = await exportFlow(options);
      result.outputs.forEach(file => process.stdout.write(`สร้าง ${file}\n`));
    } finally {
      if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
    }
    return;
  }

  // Shortcut: --from-redmine -> fetch Redmine -> สร้าง flow JSON ชั่วคราว -> export
  if (options.fromRedmine) {
    const { fetchRedmine } = require("./fetch-redmine.cjs");
    const flow = await fetchRedmine({
      issueId: options.fromRedmine,
      scr: options.scr || null,
      downloadBrd: false,
      out: null
    });
    const tmpInput = path.join(options.outDir, `.redmine-import-${process.pid}.json`);
    fs.mkdirSync(options.outDir, { recursive: true });
    fs.writeFileSync(tmpInput, JSON.stringify(flow, null, 2));
    try {
      options.input = tmpInput;
      if (!options.mode) options.mode = "flow";
      const result = await exportFlow(options);
      result.outputs.forEach(file => process.stdout.write(`สร้าง ${file}\n`));
    } finally {
      if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
    }
    return;
  }

  // Shortcut: --from-jira -> fetch Jira -> สร้าง flow JSON ชั่วคราว -> export
  if (options.fromJira) {
    const { fetchJira } = require("./fetch-jira.cjs");
    const flow = await fetchJira({
      issueId: options.fromJira,
      downloadBrd: false,
      out: null
    });
    const tmpInput = path.join(options.outDir, `.jira-import-${process.pid}.json`);
    fs.mkdirSync(options.outDir, { recursive: true });
    fs.writeFileSync(tmpInput, JSON.stringify(flow, null, 2));
    try {
      options.input = tmpInput;
      if (!options.mode) options.mode = "flow";
      const result = await exportFlow(options);
      result.outputs.forEach(file => process.stdout.write(`สร้าง ${file}\n`));
    } finally {
      if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
    }
    return;
  }

  const result = await exportFlow(options);
  result.outputs.forEach(file => process.stdout.write(`สร้าง ${file}\n`));
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  exportFlow,
  normalizeFlow,
  parseCli,
  publicFlow,
  usage
};
