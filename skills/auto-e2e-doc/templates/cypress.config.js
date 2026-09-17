const { defineConfig } = require("cypress");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Base URL from env or fallback
const DEFAULT_BASE_URL = process.env.CYPRESS_BASE_URL || "http://localhost:3000";

/** SCR-201/SCR-201.cy.js -> "SCR-201" */
function scrOf(specPath) {
  const m = String(specPath || "").match(/(SCR-\d+)/);
  return m ? m[1] : "UNKNOWN";
}

// เก็บผลการรันของ spec ปัจจุบันไว้ใน memory ของ node แล้วเขียนเป็น result.json ตอนจบ spec
let result = null;
let lastShot = null;

function currentCase() {
  return result && result.cases[result.cases.length - 1];
}

module.exports = defineConfig({
  e2e: {
    baseUrl: DEFAULT_BASE_URL,
    specPattern: "SCR-*/**/*.cy.js",
    supportFile: "support/e2e.js",
    fixturesFolder: false,
    screenshotsFolder: ".tmp/screenshots",
    downloadsFolder: ".tmp/downloads",
    // Electron จับภาพที่พื้นที่ CSS 1280x720 แล้วค่อย normalize เป็น PNG 1440x810
    // ทำให้ viewport ตอนเล่นตรงกับพื้นที่ที่ภาพจับจริง ไม่เกิดขอบขวาถูกตัด
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 15000,
    requestTimeout: 30000,
    responseTimeout: 60000,
    video: false,
    screenshotOnRunFailure: true,
    trashAssetsBeforeRuns: true,
    // เอกสารต้องสะท้อนการรันจริงครั้งเดียว ไม่ retry ให้ผลดูเขียวเกินจริง
    retries: { runMode: 0, openMode: 0 },
    setupNodeEvents(on, config) {
      on("before:spec", spec => {
        const scr = scrOf(spec.relative);
        const metaFile = path.join(config.projectRoot, scr, "scr.json");
        const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
        result = {
          scr,
          ...meta,
          runAt: new Date().toISOString(),
          baseUrl: config.baseUrl,
          userId: config.env.userId,
          cases: []
        };
        fs.rmSync(path.join(config.projectRoot, scr, "output"), { recursive: true, force: true });
      });

      on("task", {
        "tc:start"({ id, title, objective }) {
          result.cases.push({ id, title, objective, state: "pending", steps: [] });
          return null;
        },
        "tc:step"({ action, expected }) {
          const tc = currentCase();
          tc.steps.push({ no: tc.steps.length + 1, action, expected, screenshot: null });
          return null;
        },
        "tc:attach"() {
          const tc = currentCase();
          const step = tc && tc.steps[tc.steps.length - 1];
          if (step && lastShot) step.screenshot = lastShot;
          lastShot = null;
          return null;
        },
        // ผลลัพธ์จริงที่ตรวจได้ (เช่น จำนวนแถว, ค่าที่ API ส่งกลับ) แนบกับ step ล่าสุด
        "tc:note"(text) {
          const tc = currentCase();
          const step = tc && tc.steps[tc.steps.length - 1];
          if (step) (step.actual = step.actual || []).push(text);
          return null;
        },
        "tc:end"({ state, error }) {
          const tc = currentCase();
          if (tc) {
            tc.state = state;
            if (error) tc.error = error;
          }
          return null;
        },
        log(message) {
          console.log(message);
          return null;
        }
      });

      // ย้ายรูปเข้าโฟลเดอร์ของ SCR นั้น ๆ: SCR-xxx/output/screenshots/<ชื่อ>.png
      on("after:screenshot", details => {
        // details.specName เป็นแค่ชื่อไฟล์ (ไม่มีโฟลเดอร์ SCR) จึงใช้ SCR จาก before:spec
        const scr = result ? result.scr : scrOf(details.specName);
        const dir = path.join(config.projectRoot, scr, "output", "screenshots");
        fs.mkdirSync(dir, { recursive: true });
        const name = path.basename(details.path);
        const target = path.join(dir, name);
        fs.renameSync(details.path, target);
        // Normalize successful captures to the requested width without cropping any edge.
        if (!details.testFailure) {
          execFileSync("/usr/bin/sips", ["--resampleWidth", "1440", target], { stdio: "ignore" });
        }
        const rel = path.relative(path.join(config.projectRoot, scr, "output"), target);
        if (details.testFailure) {
          // รูปตอนเทสพัง แนบไว้กับ step สุดท้ายของเคสนั้น
          const tc = currentCase();
          if (tc) tc.failureScreenshot = rel;
        } else {
          lastShot = rel;
        }
        return { path: target };
      });

      on("after:spec", () => {
        if (!result) return;
        const out = path.join(config.projectRoot, result.scr, "output");
        fs.mkdirSync(out, { recursive: true });
        fs.writeFileSync(path.join(out, "result.json"), JSON.stringify(result, null, 2));
      });

      return config;
    }
  },
  env: {
    // กำหนดค่าเหล่านี้ได้ใน cypress.env.json หรือ environments.json
    signInRoute: process.env.CYPRESS_signInRoute || "/login"
  }
});
