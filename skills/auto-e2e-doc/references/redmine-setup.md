# ตั้งค่า Redmine สำหรับ kl-scr-flow

## สร้าง Personal Access Token

1. เข้า Redmine แล้วกดที่ชื่อผู้ใช้มุมขวาบน เลือก **My account**
2. ในหน้า My account หา **API access key** หรือ **Personal Access Tokens**
3. สร้าง token ใหม่ (กำหนด scope เป็น read-only ก็พอ)
4. คัดลอก token เก็บไว้

## ตั้งค่า Token

ไม่ควรเก็บ token ใน file ที่ commit ได้ ใช้วิธีใดวิธีหนึ่ง:

### Environment variable (แนะนำ)

```bash
export REDMINE_TOKEN=your-token-here
export REDMINE_URL=https://redmine.example.com
```

### Flag ตอนเรียกคำสั่ง

```bash
node fetch-redmine.cjs --url https://redmine.example.com --token your-token --issue 1234
```

## ตั้งค่า Field Mapping

Redmine เก็บ custom field เป็น `cf_XX` (XX = ID ของ field) ต้อง map ให้ตรงกับ field ของ flow

### วิธีที่ 1: ไฟล์ config

คัดลอก `templates/redmine.example.json` เป็น `redmine.json` ในโฟลเดอร์ project:

```json
{
  "url": "https://redmine.example.com",
  "projectId": "kl-core",
  "trackerName": "SCR",
  "fieldMap": {
    "scr": "cf_10",
    "brd": "cf_11",
    "fr": "cf_12",
    "actor": "cf_13",
    "menu": "cf_14"
  }
}
```

### วิธีที่ 2: flag ตอนเรียกคำสั่ง

```bash
node fetch-redmine.cjs --field-map scr=cf_10,brd=cf_11,fr=cf_12 --issue 1234 --out flow.json
```

## หา custom field ID

เรียก Redmine API:

```bash
curl -H "X-Redmine-API-Key: YOUR_TOKEN" https://redmine.example.com/issues/1234.json | jq '.issue.custom_fields'
```

ผลลัพธ์จะแสดง field ID และชื่อ:

```json
[
  { "id": 10, "name": "SCR ID", "value": "SCR-201" },
  { "id": 11, "name": "BRD Reference", "value": "TSH_KL_FACO_BRD..." }
]
```

ใช้ `cf_10`, `cf_11` ฯลฯ ใน fieldMap

## ตัวอย่างการใช้งาน

```bash
# ดึง issue เดียว
REDMINE_TOKEN=xxx node fetch-redmine.cjs --url https://redmine.example.com --issue 1234 --out flow.json

# ค้นจาก SCR ID
REDMINE_TOKEN=xxx node fetch-redmine.cjs --scr SCR-201 --out flow.json

# ดึงพร้อม BRD attachment
REDMINE_TOKEN=xxx node fetch-redmine.cjs --issue 1234 --download-brd --out flow.json

# ใช้กับ export-flow.cjs (one-liner)
REDMINE_TOKEN=xxx node export-flow.cjs --from-redmine 1234 --formats docx,xlsx
```
