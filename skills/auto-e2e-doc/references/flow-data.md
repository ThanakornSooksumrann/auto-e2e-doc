# Flow JSON input

Use UTF-8 JSON. Only `id`, `name`, and at least one action are needed.

```json
{
  "id": "SCR-DEMO-001",
  "name": "ตัวอย่างการค้นหาและบันทึกข้อมูล",
  "mode": "flow",
  "source": "คำอธิบายจากผู้ใช้",
  "cases": [
    {
      "id": "FLOW-01",
      "title": "ค้นหาและเพิ่มข้อมูล",
      "objective": "แสดงลำดับการใช้งานแบบย่อ",
      "steps": [
        {
          "action": "กรอกเงื่อนไขค้นหาและกด ค้นหา",
          "observation": "แสดงรายการตามเงื่อนไข"
        },
        {
          "action": "กด เพิ่มข้อมูล แล้วกรอกข้อมูลตัวอย่าง",
          "screenshot": "screenshots/add-data.png"
        },
        {
          "action": "กด บันทึก"
        }
      ]
    }
  ]
}
```

Optional per-step fields:

- `expected` or `observation`: a short observed result for XLSX/CSV only.
- `screenshot`: a local PNG path. A relative path is resolved from the input JSON file.

Do not include credentials, connection strings, API tokens, cookies, raw request/response bodies, or personally sensitive values in this file.
