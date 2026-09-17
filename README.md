# KL SCR Flow

ชุด Skill แบบพกพาสำหรับสร้างหลักฐาน flow ของ SCR โดยเลือกได้ว่าจะ **เล่น test จริง** หรือ **สร้างคำอธิบาย flow เท่านั้น** และเลือก output ได้เป็น DOCX, XLSX, CSV, PDF และ JSON

รองรับ Codex, Claude Code และ Cursor จาก source ชุดเดียวกัน โดยไม่บรรจุ credential, cookie, database connection หรือ `cypress.env.json`

## ใช้งานเร็ว

ติดตั้ง dependency ของชุดแจกจ่าย:

```bash
npm install
```

ติดตั้ง Skill ลงใน project ปัจจุบันของ Codex:

```bash
npm run install:skill -- --target codex --scope project --project /path/to/project
```

หรือเลือกติดตั้งทั้งสามเครื่องมือให้ user ปัจจุบัน:

```bash
npm run install:skill -- --target all --scope user
```

รายละเอียดคำสั่งและชื่อ slash command ของแต่ละเครื่องมืออยู่ที่ [platform-install.md](skills/kl-scr-flow/references/platform-install.md)

## Import จาก BRD

อ่านไฟล์ BRD (.docx) แล้วแปลงเป็น flow JSON อัตโนมัติ:

```bash
npm run import:brd -- --input BRD.docx --scr-id SCR-301 --out flow.json
```

หรือ import แล้ว export เป็น DOCX ในคำสั่งเดียว:

```bash
npm run export -- --from-brd BRD.docx --scr SCR-301 --formats docx,csv
```

ตัว importer ใช้ heuristic ดึง FR heading และ action step จาก BRD อาจต้อง review flow JSON ที่สร้างได้ก่อนส่งต่อ

## เชื่อมต่อ Redmine

ดึงข้อมูล issue/SCR จาก Redmine API ผ่าน Personal Access Token:

```bash
REDMINE_TOKEN=xxx npm run fetch:redmine -- --url https://redmine.example.com --issue 1234 --out flow.json
```

ค้นจาก SCR custom field:

```bash
REDMINE_TOKEN=xxx npm run fetch:redmine -- --scr SCR-201 --out flow.json
```

ดึงพร้อม BRD attachment แล้วแปลงเป็น flow:

```bash
REDMINE_TOKEN=xxx npm run fetch:redmine -- --issue 1234 --download-brd --out flow.json
```

ดึงจาก Redmine แล้ว export ในคำสั่งเดียว:

```bash
REDMINE_TOKEN=xxx npm run export -- --from-redmine 1234 --formats docx,xlsx
```

ตั้งค่า field mapping และรายละเอียดอยู่ที่ [redmine-setup.md](skills/kl-scr-flow/references/redmine-setup.md)

## เลือก Environment

เลือก URL ที่จะทดสอบได้ตอนสั่งรัน (เฉพาะ test mode):

```bash
npm run scr -- --env sit SCR-201        # รันบน SIT
npm run scr -- --env uat SCR-201        # รันบน UAT
npm run scr -- SCR-201                  # ใช้ค่า default เดิม
```

คัดลอก `environments.example.json` เป็น `environments.json` แล้วกรอก URL และ credential ของแต่ละ environment

## ใช้ตัวส่งออกโดยตรง

แปลงผล Cypress ที่มีอยู่แล้ว:

```bash
npm run export -- --scr SCR-201 --project-root /path/to/project --formats docx,xlsx,csv,pdf,json
```

สร้างเอกสาร flow โดยไม่รัน Cypress:

```bash
npm run export -- --input skills/kl-scr-flow/templates/flow.example.json --mode flow --formats docx,csv,json --out-dir ./output
```

PDF ต้องมี LibreOffice หรือ `soffice` ใน PATH; สามารถกำหนด executable ด้วย `SOFFICE_PATH` บน macOS ตัวส่งออกจะใช้ fontconfig ของ Homebrew อัตโนมัติเมื่อพบ เพื่อให้ Sarabun render ภาษาไทยได้

## ตรวจความพร้อมของชุดแจกจ่าย

```bash
npm run validate
```

ไฟล์ source ทั้งโฟลเดอร์นี้สามารถ zip แล้วส่งต่อได้ โดยให้ผู้รับแตกไฟล์และรัน `npm install` ก่อนติดตั้งหรือใช้ตัวส่งออก
