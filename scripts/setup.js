#!/usr/bin/env node
"use strict";

const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

async function main() {
  console.log("\n=======================================================");
  console.log("   Universal E2E Document Skill - Setup Wizard");
  console.log("=======================================================\n");

  const projectRoot = process.cwd();
  
  // 1. ถามข้อมูลการเชื่อมต่อเว็บแอปพลิเคชัน
  console.log("--- 1. Web Application Settings ---");
  const baseUrl = await question("Base URL สำหรับการทดสอบ (เช่น http://localhost:3000): ");
  const userId = await question("Test Username (เพื่อใช้ล็อกอิน ถ้ามี): ");
  let password = "";
  if (userId) {
    password = await question("Test Password: ");
  }

  // 2. ถามข้อมูล Frontend Code (สำหรับให้ AI อ้างอิง)
  console.log("\n--- 2. Frontend Source Code Reference ---");
  console.log("เพื่อให้ AI สามารถวิเคราะห์โครงสร้าง DOM/UI ได้แม่นยำขึ้น โปรดระบุโฟลเดอร์หน้าบ้าน (Frontend)");
  let frontendPath = await question("ตำแหน่งโฟลเดอร์ (เช่น ./src, ../frontend/src, ปล่อยว่างถ้าไม่ต้องการ): ");
  
  // 3. ถามข้อมูล Redmine/Jira (ทางเลือก)
  console.log("\n--- 3. Integrations (Optional) ---");
  console.log("เลือกตั้งค่าระบบที่ใช้เก็บ Issue/BRD (Redmine หรือ Jira)");
  const redmineUrl = await question("Redmine URL (ปล่อยว่างถ้าไม่ใช้): ");
  let redmineToken = "";
  if (redmineUrl) {
    redmineToken = await question("Redmine Personal Access Token: ");
  }

  const jiraUrl = await question("Jira URL (เช่น https://your-domain.atlassian.net, ปล่อยว่างถ้าไม่ใช้): ");
  let jiraEmail = "";
  let jiraToken = "";
  if (jiraUrl) {
    jiraEmail = await question("Jira Email (ปล่อยว่างถ้าใช้ Jira Server/Data Center แบบ PAT): ");
    jiraToken = await question("Jira API Token / Personal Access Token: ");
  }

  // สร้างไฟล์ Config ต่างๆ
  console.log("\n--- 4. กำลังสร้างไฟล์ Config ---");
  
  const cypressEnvPath = path.join(process.cwd(), "cypress.env.json");
  const cypressEnv = {
    userId: userId || "",
    password: password || "",
    REDMINE_TOKEN: redmineToken || "",
    JIRA_URL: jiraUrl || "",
    JIRA_EMAIL: jiraEmail || "",
    JIRA_TOKEN: jiraToken || ""
  };
  fs.writeFileSync(cypressEnvPath, JSON.stringify(cypressEnv, null, 2));
  console.log("✓ สร้าง cypress.env.json");

  const devUrl = baseUrl;
  const sitUrl = "";
  const uatUrl = "";

  const environmentsPath = path.join(process.cwd(), "environments.json");
  const environments = {
    "dev": devUrl || "http://localhost:3000",
    "sit": sitUrl || "http://localhost:3000",
    "uat": uatUrl || "http://localhost:3000"
  };
  fs.writeFileSync(environmentsPath, JSON.stringify(environments, null, 2));
  console.log("✓ สร้าง environments.json");

  const configPath = path.join(process.cwd(), ".e2e-doc-config.json");
  const skillConfig = {
    "frontendSourcePath": frontendPath || "",
    "redmineUrl": redmineUrl || "",
    "jiraUrl": jiraUrl || "",
    "documentStyle": {
      "language": "th",
      "includeChecklist": false
    }
  };
  fs.writeFileSync(configPath, JSON.stringify(skillConfig, null, 2));
  console.log("✓ สร้าง .e2e-doc-config.json");

  console.log("\n--- 5. ตั้งค่าโปรเจกต์ (Cypress Baseline) ---");
  const initCypress = await question("ต้องการคัดลอกไฟล์ Cypress Config พื้นฐานสำหรับการ Capture แบบมาตรฐานหรือไม่? (y/n) [n]: ");
  if (initCypress.toLowerCase() === 'y') {
    const templateDir = path.join(__dirname, "..", "skills", "auto-e2e-doc", "templates");
    if (fs.existsSync(templateDir)) {
      try {
        const cp = require("child_process");
        // คัดลอกโฟลเดอร์ templates ทั้งหมดไปยัง root
        cp.execSync(`cp -R "${templateDir}/"* "${process.cwd()}/"`, { stdio: 'ignore' });
        console.log("✓ คัดลอก Cypress Config พื้นฐานเรียบร้อยแล้ว (cypress.config.js, cypress/support/...)");
      } catch (e) {
        console.log("⚠️ ไม่สามารถคัดลอก Cypress Config ได้: " + e.message);
      }
    } else {
      console.log("⚠️ ไม่พบโฟลเดอร์ templates ในแพ็กเกจ");
    }
  }

  // อัปเดต .gitignore
  const gitignorePath = path.join(projectRoot, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    let ignoreContent = fs.readFileSync(gitignorePath, "utf8");
    if (!ignoreContent.includes("cypress.env.json")) ignoreContent += "\ncypress.env.json";
    if (!ignoreContent.includes("environments.json")) ignoreContent += "\nenvironments.json";
    fs.writeFileSync(gitignorePath, ignoreContent);
    console.log("✓ อัปเดต .gitignore");
  }

  // ติดตั้ง Skill สำหรับทุก AI
  console.log("\n--- 4. กำลังติดตั้ง Skill ไปยัง AI Platforms ---");
  console.log("ติดตั้งสำหรับ Gemini, Claude, Cursor และ Codex...");
  
  // เรียกใช้ install-skill.mjs ด้วย --target all
  const installScriptPath = path.join(__dirname, "..", "skills", "auto-e2e-doc", "scripts", "install-skill.mjs");
  if (fs.existsSync(installScriptPath)) {
    const installResult = spawnSync("node", [installScriptPath, "--target", "all", "--scope", "user"], { stdio: "inherit" });
    if (installResult.status === 0) {
      console.log("✓ ติดตั้ง Skill สำเร็จ");
    } else {
      console.log("✗ พบข้อผิดพลาดในการติดตั้ง Skill");
    }
  } else {
    console.log("✗ ไม่พบไฟล์ติดตั้ง: " + installScriptPath);
  }

  console.log("\n=======================================================");
  console.log(" Setup เสร็จสมบูรณ์! คุณสามารถเรียกใช้ Skill ในแชทได้เลย");
  console.log(" ตัวอย่างคำสั่งให้ AI:");
  console.log(" '/auto-e2e-doc test หน้าเข้าสู่ระบบและค้นหาข้อมูล'");
  console.log("=======================================================\n");

  rl.close();
}

main().catch(err => {
  console.error("Error during setup:", err);
  rl.close();
  process.exit(1);
});
