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
  
  // 3. ถามข้อมูล Redmine (ทางเลือก)
  console.log("\n--- 3. Redmine Integration (Optional) ---");
  const redmineUrl = await question("Redmine URL (ปล่อยว่างถ้าไม่ใช้): ");
  let redmineToken = "";
  if (redmineUrl) {
    redmineToken = await question("Redmine Personal Access Token: ");
  }

  // สร้างไฟล์ Config ต่างๆ
  console.log("\n--- กำลังสร้างไฟล์ Config ---");
  
  // 1. cypress.env.json (เก็บ credentials)
  const cypressEnvPath = path.join(projectRoot, "cypress.env.json");
  const cypressEnv = {
    userId: userId || "",
    password: password || "",
    REDMINE_TOKEN: redmineToken || ""
  };
  fs.writeFileSync(cypressEnvPath, JSON.stringify(cypressEnv, null, 2));
  console.log("✓ สร้าง cypress.env.json");

  // 2. environments.json (เก็บ URLs)
  const envsPath = path.join(projectRoot, "environments.json");
  const envs = {
    "dev": {
      "baseUrl": baseUrl || "",
      "description": "Local development environment"
    }
  };
  fs.writeFileSync(envsPath, JSON.stringify(envs, null, 2));
  console.log("✓ สร้าง environments.json");

  // 3. .e2e-doc-config.json (เก็บค่าสำหรับ AI Skill)
  const skillConfigPath = path.join(projectRoot, ".e2e-doc-config.json");
  const skillConfig = {
    "frontendSourcePath": frontendPath || "",
    "redmineUrl": redmineUrl || "",
    "documentStyle": {
      "language": "th",
      "includeChecklist": false
    }
  };
  fs.writeFileSync(skillConfigPath, JSON.stringify(skillConfig, null, 2));
  console.log("✓ สร้าง .e2e-doc-config.json");

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
