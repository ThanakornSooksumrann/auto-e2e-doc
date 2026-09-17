# 🤖 Auto E2E Doc (AI-Powered E2E Test & Document Generator)

Auto E2E Doc คือสุดยอด AI Skill ที่ถูกออกแบบมาเพื่อให้ AI (เช่น Gemini, Claude, Cursor, Codex) สามารถ **เขียนโค้ดทดสอบ Cypress, รันโค้ด, แคปหน้าจอ และแปลงผลลัพธ์ให้กลายเป็นเอกสาร (Word, Excel, HTML)** ได้โดยอัตโนมัติ

คุณสามารถให้ AI อ่านเอกสาร BRD, ดึงข้อมูลจาก Redmine / Jira หรือสั่งงานตรงๆ ให้มันรันระบบและสรุปผลออกมาเป็นเอกสารที่คนทั่วไปอ่านเข้าใจได้ทันที

---

## 🚀 คุณสมบัติเด่น (Features)
- **Framework Agnostic**: ไม่ผูกมัดกับ UI Library สามารถให้ AI หา Selector จาก Source Code ของคุณได้โดยตรง
- **Golden Template Enforcement**: บังคับให้ AI เขียนเทสตามมาตรฐานสากล (มี `cy.tc`, `cy.step`, `cy.capture`) เพื่อให้ได้โครงสร้างเอกสารที่เป๊ะทุกครั้ง
- **Auto Capture & Formatting**: จัดการขนาดหน้าจอ 1280x720, ล็อก Layout (เหมาะกับ Kendo UI หรือ Modal) และปรับภาพให้ชัดแจ๋ว
- **Multi-Format Export**: รองรับการส่งออกไฟล์แบบ `docx` (Word), `xlsx` (Excel), `html` และ `json`
- **Jira & Redmine Integration**: ให้ AI ดึง Requirement จาก Issue Tracker มาแปลงเป็น Flow อัตโนมัติ

---

## 📦 การติดตั้ง (Installation)

เพื่อให้ระบบพร้อมใช้งาน ทั้งฝั่งโค้ดและฝั่ง AI ให้ทำตามขั้นตอนต่อไปนี้:

1. **โคลนโปรเจกต์**
   ```bash
   git clone https://github.com/ThanakornSooksumrann/auto-e2e-doc.git
   cd auto-e2e-doc
   ```

2. **ติดตั้ง Dependencies**
   ```bash
   npm install
   ```

3. **รัน Setup Wizard (สำคัญมาก)**
   ```bash
   node scripts/setup.js
   ```
   *วิซาร์ดจะถามคำถามเพื่อตั้งค่าระบบดังนี้:*
   - **รหัสพนักงาน & รหัสผ่าน**: สำหรับให้ Cypress ล็อกอินอัตโนมัติ (เก็บใน `cypress.env.json` ซึ่งจะไม่ถูกนำขึ้น Git)
   - **Base URL**: เช่น `http://localhost:8080/KL_CORE_DEV`
   - **Frontend Source Path**: โฟลเดอร์หน้าบ้าน (เช่น `../src`) เพื่อให้ AI วิ่งเข้าไปหา Selector จากโค้ดจริง
   - **Redmine / Jira Token**: (ตัวเลือก) หากต้องการดึงข้อมูลจากระบบ
   - **Cypress Baseline Config**: พิมพ์ `y` เพื่อสร้างแม่แบบ `cypress.config.js` และ `commands.js` ลงในโปรเจกต์ (ถ้าโปรเจกต์ยังไม่มี Cypress)

4. **ตรวจสอบการติดตั้ง AI Skill**
   วิซาร์ดจะติดตั้ง Skill ไปยัง AI ต่างๆ ในเครื่องของคุณโดยอัตโนมัติ (เช่น `~/.agents`, `~/.claude`, `~/.cursor`)

---

## 💡 วิธีใช้งาน (How to Use)

เมื่อติดตั้งเสร็จแล้ว ให้เปิด AI ของคุณขึ้นมา (เช่น แชทในโปรแกรมที่รองรับ) แล้วเรียกใช้งานตามแพลตฟอร์ม:
- **Gemini / Codex**: พิมพ์ `/skills` หรือเรียก `$auto-e2e-doc`
- **Claude / Cursor**: พิมพ์ `/auto-e2e-doc`

### ตัวอย่างคำสั่งที่สามารถพิมพ์คุยกับ AI ได้เลย:

**แบบที่ 1: สั่งให้ไปสร้างเทส รัน และออกเอกสาร (Test Mode)**
> "ช่วยสร้างเทสสำหรับหน้าจอ **SCR-201** ให้หน่อย และขอไฟล์เป็น docx กับ xlsx นะ"
> *(AI จะเข้าไปหาโค้ดหน้าบ้าน สร้างไฟล์ `SCR-201.cy.js` ทำการรัน Cypress และเซฟภาพส่งออกเป็น Word/Excel ให้)*

**แบบที่ 2: ดึงข้อมูลจาก Jira หรือ Redmine (Flow Mode)**
> "ดึงข้อมูลจาก **Jira PROJ-123** มาทำเป็น Flow อัตโนมัติและออกไฟล์ docx ให้หน่อย"
> *(AI จะใช้คำสั่ง `--from-jira` ดึงเอกสารมาแปลง)*

**แบบที่ 3: อัปโหลดเอกสาร BRD เข้าไปตรงๆ**
> *(แนบไฟล์ BRD.docx ลงในแชท AI)*
> "ช่วยอ่าน BRD ไฟล์นี้ แล้วสร้าง Flow ทดสอบ ส่งออกเป็น html และ docx ให้ที"

---

## 🏗️ เบื้องหลังการทำงาน (How it works)

1. **AI วางแผน (Planning)**: AI จะอ่าน `.e2e-doc-config.json` และเข้าไปดูโค้ด Frontend ของคุณเพื่อหา `id` หรือ `class` ที่ถูกต้อง
2. **AI เขียนเทส (Writing)**: AI จะอ้างอิงไฟล์ `examples/golden-flow.cy.js` เป็นต้นแบบ เพื่อบังคับให้ใช้คำสั่ง `cy.tc` และ `cy.step` เสมอ
3. **AI สั่งรัน (Execution)**: AI จะใช้คำสั่งรันอัตโนมัติ เช่น `npx cypress run --spec "SCR-xxx/**/*.cy.js"`
4. **Cypress ทำงาน (Capturing)**: Cypress เปิดขึ้นมาทำงาน แคปหน้าจออัตโนมัติ และใช้ `sips` (บน macOS) เพื่อรักษาความคมชัด
5. **สร้างเอกสาร (Exporting)**: `scripts/export-flow.cjs` จะถูกเรียกเพื่อแปลง `result.json` พร้อมภาพประกอบไปเป็น Word หรือ Excel โดยจัด Layout ไม่ให้ภาพทับตัวอักษร

---

## 🔄 การอัปเดต (Updating)

ถ้าต้องการอัปเดตเวอร์ชันใหม่ในอนาคต:
```bash
cd auto-e2e-doc
git pull origin master
npm install
node scripts/setup.js
```
*(เพียงเท่านี้ AI Skill ก็จะถูกอัปเดตให้เป็นเวอร์ชันใหม่ทันที)*
