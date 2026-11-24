# KPP Cassava API v1 (อ่านอย่างเดียว)

API ข้อมูลสรุปมันสำปะหลังจังหวัดกำแพงเพชร สำหรับระบบอื่นดึงไปใช้ — เป็นไฟล์ JSON static บน GitHub Pages (รองรับ CORS ทุกต้นทาง, ไม่ต้องใช้คีย์)

**Base URL:** `https://kppdoaedev2026-eng.github.io/kpp-cassava-smart-gis/api/v1/`
เริ่มที่ `index.json` (รายการ endpoint ทั้งหมด + ขนาดไฟล์ + เวลาสร้าง `generated_at`)

| ไฟล์ | เนื้อหา |
|---|---|
| `districts.json` | รหัส/ชื่ออำเภอและตำบล |
| `production.json` | พื้นที่ปลูก/เก็บเกี่ยว/ผลผลิต/ผลผลิตต่อไร่ รายอำเภอ รายปี (สถิติทางการ ปี พ.ศ.) |
| `registry.json` | ทะเบียนเกษตรกรปี 2569 รายอำเภอ/ตำบล |
| `cmd.json` | โรคใบด่าง รายรอบรายงาน + เกณฑ์ระดับระบาด |
| `support.json` | การสนับสนุนท่อนพันธุ์ทุกโครงการ |
| `resist_plots.json` | แปลงส่งเสริมพันธุ์ต้านทาน/ทนทาน รายตำบล |
| `plot_monitor.json` | สรุปจาก CassavaPlot Monitor |
| `trends.json` | ผังแปลง 2563–2569: พันธุ์ เดือนปลูก/เก็บเกี่ยว อายุเก็บเกี่ยว (รายอำเภอ/ตำบล) |
| `prices.json` | ราคาหัวมันสด พร้อมแหล่งอ้างอิง |

ทุกไฟล์มี `api`, `version`, `app_version`, `generated_at`, `license` · ไม่มีข้อมูลบุคคลและพิกัดรายแปลง

```js
const r = await fetch('https://kppdoaedev2026-eng.github.io/kpp-cassava-smart-gis/api/v1/production.json');
const { rows } = await r.json();   // [{year, district_code, planted_rai, production_ton, yield_kg_per_rai, ...}]
```
```python
import requests
d = requests.get('https://kppdoaedev2026-eng.github.io/kpp-cassava-smart-gis/api/v1/cmd.json').json()
```
- รหัสอำเภอ 4 หลัก (เช่น 6201 เมืองกำแพงเพชร) ตำบล 6 หลัก · ปีในไฟล์เป็น พ.ศ.
- อัปเดตเมื่อรัน `python tools/build_api.py` แล้ว push (เว็บ build ใน 1–2 นาที) — ใช้ `generated_at` ตรวจความสดของข้อมูล
- ข้อมูลรายแปลง/ข้อมูลส่วนบุคคลไม่อยู่ใน API นี้ (อยู่ใน KPP Backend ที่ต้องล็อกอิน)
