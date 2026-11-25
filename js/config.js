window.KPP = window.KPP || {};

KPP.CONFIG = {
  TITLE: 'ระบบส่งเสริมและจัดการมันสำปะหลังจังหวัดกำแพงเพชร',
  TITLE_EN: 'Kamphaeng Phet Cassava Promotion & Management System',
  PURPOSE: 'รายงานและนำเสนอสถานการณ์การผลิต ผลผลิต พันธุ์ และโรคมันสำปะหลัง เพื่อการส่งเสริมและบริหารจัดการ',
  CENTER: [16.33, 99.58],
  ZOOM: 9,
  YEARS: [2565, 2566, 2567, 2569],
  CMD_UPDATE_DAYS: 30,   // รอบอัปเดตรายงานใบด่าง: ทุก 2 สัปดาห์ – 1 เดือน
  // เป้าหมายลดพื้นที่ระบาดโรคใบด่าง (เทียบรายงานรอบแรกในระบบเป็นฐาน) โดยปลูกพันธุ์ต้านทาน/ทนทานทดแทนในพื้นที่ระบาด
  CMD_GOAL: { reduce: 0.30, cuttingsPerRai: 1600, stalksPerRai: 400, multiplyRatio: 10, supportFromYear: 2569 },   // 1 ลำ ≈ 4 ท่อน
  // ระบบติดตามแปลงส่งเสริม CassavaPlot Monitor (Apps Script) — ดึงสรุปสาธารณะ ?api=public (ดู tools/apps_script_public_api.gs)
  // KPP Backend (Apps Script + Google Sheet ส่วนตัว) สำหรับเข้าสู่ระบบแอดมิน/เจ้าหน้าที่ — ใส่ URL /exec หลังติดตั้ง tools/apps_script_kpp_backend.gs
  BACKEND_URL: 'https://script.google.com/macros/s/AKfycbzsDC_9sW8uspKq0alv4DVjAOHkpzFde-9hvj49m0wLqxJ6uNCzPyCYuDjv5EXRYPrd/exec',
  // App Hub กรมส่งเสริมการเกษตร (รายการแอป)
  APP_HUB_URL: 'https://script.google.com/macros/s/AKfycbxrj4O1p9v71-hTS-SHPGbs94CIwGXuFX7iegXW6ksFpE1coXD5Qt7ODRdrtoBqpQAl/exec',
  PLOT_MONITOR_URL: 'https://script.google.com/macros/s/AKfycbzrQJEFODEicBIC_0kmx17652OxjE0GK_3NRm43db2beM8tr2uutQWssHiy6KkpBDWlqw/exec',
  DEFAULT_YEAR: 2569,
  PRICE_BAHT_PER_KG: 2.2,   // ใช้ประเมินมูลค่าความเสียหาย (ปรับได้ใน นำเข้าข้อมูล › ตั้งค่า)
  // ราคาหัวมันสำปะหลังสด (บาท/กก.) — เพิ่มรายการใหม่ได้ที่นี่ (วันที่ ค.ศ., แหล่งอ้างอิง) ระบบใช้รายการล่าสุดแสดงในหน้าสถานการณ์การผลิต
  PRICES: [
    { date: '2026-09-04', place: 'อ.ปางศิลาทอง จ.กำแพงเพชร', price: 4.00, kind: 'หัวมันสดคละ ราคารับซื้อ', src: 'rakakaset.com (อ้างอิง สศก.)', url: 'https://rakakaset.com/%E0%B8%A1%E0%B8%B1%E0%B8%99%E0%B8%AA%E0%B8%B3%E0%B8%9B%E0%B8%B0%E0%B8%AB%E0%B8%A5%E0%B8%B1%E0%B8%87/%E0%B8%81%E0%B8%B3%E0%B9%81%E0%B8%9E%E0%B8%87%E0%B9%80%E0%B8%9E%E0%B8%8A%E0%B8%A3/%E0%B8%9B%E0%B8%B2%E0%B8%87%E0%B8%A8%E0%B8%B4%E0%B8%A5%E0%B8%B2%E0%B8%97%E0%B8%AD%E0%B8%87/' }
  ],
  AID_BAHT_PER_RAI: 1980,
  SURVEILLANCE_RADII_KM: [5, 10],
  FLOOD_REPEAT_MIN_YEARS: 2,
  FLOOD_HIGH_YEARS: 3,
  FLOOD_PEAK: '10-01',
  EARLY_HARVEST_MIN_MONTHS: 8,

  DEVELOPER: 'นายดนุพน สุมังคะละ',
  DEVELOPER_TITLE: 'นักวิชาการส่งเสริมการเกษตรปฏิบัติการ',
  DEVELOPER_UNIT: 'กลุ่มส่งเสริมและพัฒนาการผลิต สำนักงานเกษตรจังหวัดกำแพงเพชร',
  VERSION: '4.11.0',

  // การจัดกลุ่มพันธุ์ต่อโรคใบด่าง (ปรับ/เพิ่มพันธุ์ใหม่ได้ใน นำเข้าข้อมูล › ตั้งค่า)
  // ชื่อพันธุ์จับคู่แบบไม่สนคำว่า "พันธุ์"/"มันสำปะหลัง"/ช่องว่าง และรองรับชื่อเรียกอื่น (VARIETY_ALIASES)
  VARIETY_CLASSES: [
    { key: 'resistant', label: 'ต้านทาน', color: '#1a7f37', rank: 0 },
    { key: 'tolerant', label: 'ทนทาน', color: '#8fd16a', rank: 1 },
    { key: 'general', label: 'ทั่วไป', color: '#8a9bb0', rank: 2 },
    { key: 'susceptible', label: 'อ่อนแอ', color: '#d7301f', rank: 3 }
  ],
  // เมื่อแก้ค่าเริ่มต้นของพันธุ์ใด ให้เพิ่มเลขรุ่นและระบุชื่อพันธุ์ที่เปลี่ยน — เบราว์เซอร์ที่เคยบันทึกค่าไว้จะได้รับค่าใหม่ของพันธุ์นั้น
  VARIETY_DEFAULTS_VER: 2,
  VARIETY_DEFAULTS_CHANGED: { 2: ['ระยอง 72'] },   // v2 (24 พ.ย. 2569): ระยอง 72 = ทนทาน (ยืนยันโดยเจ้าของ)
  VARIETY_DEFAULTS: {
    resistant: ['อิทธิ 1', 'อิทธิ 2', 'อิทธิ 3', 'อิทธิ (ไม่ระบุเบอร์)', 'คละพันธุ์อิทธิ 1–3'],
    tolerant: ['ห้วยบง 60', 'เกษตรศาสตร์ 50', 'ระยอง 72'],
    susceptible: ['ระยอง 11', 'CMR 89', 'ไม่ระบุพันธุ์', 'พันธุ์อื่นๆ', 'แขกดำ'],
    general: ['ห้วยบง 90', 'ห้วยบง', 'ระยอง 1', 'ระยอง 4', 'ระยอง 15', 'ระยอง 81', 'เกษตรศาสตร์ 80', 'เกษตรศาสตร์ 81']   // ยืนยันโดยเจ้าของ 24 พ.ย. 2569
  },
  VARIETY_ALIASES: { 'KU50': 'เกษตรศาสตร์ 50', 'KU 50': 'เกษตรศาสตร์ 50', 'อิธิ 3': 'อิทธิ 3', 'อิธิ 1': 'อิทธิ 1', 'อิธิ 2': 'อิทธิ 2', '89': 'CMR 89', 'CMR89': 'CMR 89', 'CMR38-125-77': 'CMR 89', '-': 'ไม่ระบุพันธุ์', 'คละพันธุ์': 'คละพันธุ์อิทธิ 1–3', 'คละพันธุ์อิทธิ': 'คละพันธุ์อิทธิ 1–3', 'อิทธิ': 'อิทธิ (ไม่ระบุเบอร์)' },
  VARIETY_DEFAULT_CLASS: 'general',

  // ทะเบียนตรวจสอบพันธุ์ (สถานะตามหน่วยงาน) — ใช้ตรวจชื่อพันธุ์ในผังแปลง/การสนับสนุน
  // st: doa = กรมวิชาการเกษตรประกาศรับรอง/แนะนำ · ku = มหาวิทยาลัยเกษตรศาสตร์ + มูลนิธิสถาบันพัฒนามันสำปะหลังฯ พัฒนา/แนะนำ
  //     ttdi = มูลนิธิสถาบันพัฒนามันสำปะหลังฯ พัฒนา กสก. ส่งเสริม (ไม่พบประกาศรับรองของ กวก.) · unverified = ไม่พบในแหล่งอ้างอิง ต้องตรวจสอบชื่อ
  //     local = พันธุ์พื้นเมือง/นำเข้าไม่รับรอง · none = ไม่ระบุพันธุ์
  // cmd: ปฏิกิริยาต่อโรคใบด่างตามแหล่งอ้างอิง (r = ต้านทาน, t = ทนทาน, s = อ่อนแอ, '' = ไม่มีข้อมูลทางการ) · src: ดัชนีใน VARIETY_SOURCES
  VARIETY_REGISTRY: {
    'ระยอง 1': { st: 'unverified', ag: 'กรมวิชาการเกษตร (พันธุ์เก่า)', cmd: '', cls: 'general', src: [], note: 'ไม่อยู่ในรายชื่อ 9 พันธุ์ที่ กวก. ประกาศรับรองและแนะนำ (แนวหน้า 2557) · จัดเป็นพันธุ์ทั่วไป (ยืนยันโดยเจ้าของ)' },
    'ระยอง 2': { st: 'doa', ag: 'กรมวิชาการเกษตร', cmd: '', src: [0] },
    'ระยอง 3': { st: 'doa', ag: 'กรมวิชาการเกษตร', cmd: '', src: [0] },
    'ระยอง 5': { st: 'doa', ag: 'กรมวิชาการเกษตร', cmd: '', src: [0] },
    'ระยอง 7': { st: 'doa', ag: 'กรมวิชาการเกษตร', cmd: '', src: [0] },
    'ระยอง 9': { st: 'doa', ag: 'กรมวิชาการเกษตร', cmd: '', src: [0] },
    'ระยอง 11': { st: 'doa', ag: 'กรมวิชาการเกษตร', cmd: 's', cmdBy: 'owner', src: [0], note: 'จัดเป็นอ่อนแอตามมติเจ้าของระบบ' },
    'ระยอง 60': { st: 'doa', ag: 'กรมวิชาการเกษตร', cmd: '', src: [0] },
    'ระยอง 72': { st: 'doa', ag: 'กรมวิชาการเกษตร (กวก. ระยอง 72)', cmd: 't', src: [0, 1, 2], note: 'กสก. จัดเป็นพันธุ์ทนทาน แต่ในพื้นที่ระบาดหนักพบติดโรคได้ 50–70%' },
    'ระยอง 90': { st: 'doa', ag: 'กรมวิชาการเกษตร', cmd: '', src: [0] },
    'ระยอง 86-13': { st: 'doa', ag: 'กรมวิชาการเกษตร', cmd: '', src: [0] },
    'เกษตรศาสตร์ 50': { st: 'ku', ag: 'มก. + มูลนิธิสถาบันพัฒนามันสำปะหลังฯ', cmd: 't', src: [2, 3], note: 'ในพื้นที่ระบาดหนักพบติดโรคได้ 50–70%' },
    'ห้วยบง 60': { st: 'ku', ag: 'มก. + มูลนิธิสถาบันพัฒนามันสำปะหลังฯ', cmd: 't', src: [2, 3], note: 'ในพื้นที่ระบาดหนักพบติดโรคได้ 50–70%' },
    'ห้วยบง 80': { st: 'ku', ag: 'มก. + มูลนิธิสถาบันพัฒนามันสำปะหลังฯ (คุ้มครองพันธุ์พืช กวก.)', cmd: '', src: [4] },
    'เกษตรศาสตร์ 72': { st: 'ku', ag: 'มหาวิทยาลัยเกษตรศาสตร์', cmd: '', src: [5] },
    'อิทธิ 1': { st: 'ttdi', ag: 'มูลนิธิสถาบันพัฒนามันสำปะหลังฯ', cmd: 'r', src: [3, 6], note: 'ทดสอบติดโรค < 1%' },
    'อิทธิ 2': { st: 'ttdi', ag: 'มูลนิธิสถาบันพัฒนามันสำปะหลังฯ', cmd: 'r', src: [3, 6], note: 'ทดสอบไม่พบการติดโรค' },
    'อิทธิ 3': { st: 'ttdi', ag: 'มูลนิธิสถาบันพัฒนามันสำปะหลังฯ', cmd: 'r', src: [3, 6], note: 'ทดสอบไม่พบการติดโรค' },
    'อิทธิ (ไม่ระบุเบอร์)': { st: 'ttdi', ag: 'มูลนิธิสถาบันพัฒนามันสำปะหลังฯ', cmd: 'r', src: [3], note: 'ควรระบุเบอร์พันธุ์ในการบันทึก' },
    'คละพันธุ์อิทธิ 1–3': { st: 'ttdi', ag: 'มูลนิธิสถาบันพัฒนามันสำปะหลังฯ', cmd: 'r', src: [3] },
    'ห้วยบง': { st: 'unverified', ag: '—', cmd: '', cls: 'general', src: [], note: 'ไม่ระบุเบอร์ (60/80/90) — จัดกลุ่มไม่ได้ · จัดเป็นพันธุ์ทั่วไป (ยืนยันโดยเจ้าของ)' },
    'ห้วยบง 90': { st: 'unverified', ag: '—', cmd: '', cls: 'general', src: [], note: 'ไม่พบเอกสารรับรองจากหน่วยงาน · จัดเป็นพันธุ์ทั่วไป (ยืนยันโดยเจ้าของ)' },
    'ระยอง 4': { st: 'unverified', ag: '—', cmd: '', cls: 'general', src: [], note: 'ไม่พบพันธุ์ชื่อนี้ในรายชื่อพันธุ์รับรอง — อาจบันทึกผิด · จัดเป็นพันธุ์ทั่วไป (ยืนยันโดยเจ้าของ)' },
    'ระยอง 15': { st: 'unverified', ag: '—', cmd: '', cls: 'general', src: [], note: 'ไม่พบในแหล่งอ้างอิงที่ตรวจสอบ · จัดเป็นพันธุ์ทั่วไป (ยืนยันโดยเจ้าของ)' },
    'ระยอง 81': { st: 'unverified', ag: '—', cmd: '', cls: 'general', src: [], note: 'ไม่พบพันธุ์ชื่อนี้ในรายชื่อพันธุ์รับรอง — อาจบันทึกผิด · จัดเป็นพันธุ์ทั่วไป (ยืนยันโดยเจ้าของ)' },
    'เกษตรศาสตร์ 80': { st: 'unverified', ag: '—', cmd: '', cls: 'general', src: [], note: 'พบเพียงผลทดลอง ไม่พบประกาศรับรอง · จัดเป็นพันธุ์ทั่วไป (ยืนยันโดยเจ้าของ)' },
    'เกษตรศาสตร์ 81': { st: 'unverified', ag: 'ศขพ.ที่ 6 สนับสนุนทดลองปลูก', cmd: '', cls: 'general', src: [], note: 'ไม่พบประกาศรับรอง · จัดเป็นพันธุ์ทั่วไป (ยืนยันโดยเจ้าของ)' },
    'แว๊กซี่ (Waxy)': { st: 'unverified', ag: '—', cmd: '', src: [], note: 'มันสำปะหลังแป้งข้าวเหนียว (สายพันธุ์วิจัย)' },
    'CMR 89': { st: 'local', ag: 'ไม่ใช่พันธุ์รับรองของไทย', cmd: 's', cmdBy: 'owner', src: [], note: 'จัดเป็นอ่อนแอตามมติเจ้าของระบบ' },
    'แขกดำ': { st: 'local', ag: 'พันธุ์พื้นเมือง', cmd: 's', cmdBy: 'owner', src: [] },
    'ไม่ระบุพันธุ์': { st: 'none', ag: '—', cmd: '', src: [] },
    'พันธุ์อื่นๆ': { st: 'none', ag: '—', cmd: '', src: [] }
  },
  VARIETY_STATUS: {
    doa: { label: 'กวก. รับรอง/แนะนำ', color: '#1a7f37' }, ku: { label: 'มก./มูลนิธิฯ พัฒนา', color: '#2a78d6' },
    ttdi: { label: 'มูลนิธิฯ พัฒนา · กสก. ส่งเสริม', color: '#0f766e' }, unverified: { label: 'ต้องตรวจสอบ', color: '#d97706' },
    local: { label: 'ไม่ใช่พันธุ์รับรอง', color: '#b2182b' }, none: { label: 'ไม่ระบุพันธุ์', color: '#64748b' }
  },
  VARIETY_SOURCES: [
    { t: 'แนวหน้า (21 ก.พ. 2557) เปิดตัวมันสำปะหลังพันธุ์ใหม่ ระยอง 86-13 — กวก. ประกาศรับรองและแนะนำ 9 พันธุ์', u: 'https://www.naewna.com/local/91515' },
    { t: 'ฐานข้อมูลพรรณพืชและเชื้อพันธุกรรมพืช กรมวิชาการเกษตร (กวก. ระยอง 72)', u: 'https://doaplant.doa.go.th/RecFront/PlantDetail/195' },
    { t: 'กรมส่งเสริมการเกษตร แนะเลือกท่อนพันธุ์ทนทาน สู้โรคใบด่าง (กรุงเทพธุรกิจ)', u: 'https://www.bangkokbiznews.com/economics/1228483' },
    { t: 'เทคโนโลยีชาวบ้าน: เร่งขยายพันธุ์ อิทธิ 1–3 ต้านโรคใบด่าง', u: 'https://www.khaosod.co.th/technologychaoban/techno-news/article_320962' },
    { t: 'สถาบันวิจัยและพัฒนาแห่ง มก.: มันสำปะหลังพันธุ์ห้วยบง 80', u: 'https://www3.rdi.ku.ac.th/?p=18172' },
    { t: 'สถาบันวิจัยและพัฒนาแห่ง มก.: มันสำปะหลังพันธุ์เกษตรศาสตร์ 72', u: 'https://www3.rdi.ku.ac.th/?p=18167' },
    { t: 'ข่าว กสก.: เพาะขยายกล้าพันธุ์ต้านทานโรคใบด่าง (อิทธิ 1–3)', u: 'https://doaenews.doae.go.th/archives/22954' }
  ],

  SOIL_CLASSES: [
    { key: 'S1', label: 'S1 เหมาะสมสูง', color: '#1a9850' },
    { key: 'S2', label: 'S2 เหมาะสมปานกลาง', color: '#a6d96a' },
    { key: 'S3', label: 'S3 เหมาะสมเล็กน้อย', color: '#fdae61' },
    { key: 'N', label: 'N ไม่เหมาะสม', color: '#d73027' }
  ],
  RAINY_PLANT_MONTHS: [5, 6, 7, 8, 9],

  DISEASES: [
    { key: 'cmd', name: 'โรคใบด่างมันสำปะหลัง (CMD)', short: 'ใบด่าง CMD' }
  ],

  SOURCES: {
    OFFICIAL: { label: 'DOAE สถิติทางการ', cls: 'src-real', note: 'สถิติการปลูกพืช สนง.เกษตรจังหวัดกำแพงเพชร (KPP Agri Data Center)' },
    PARCEL: { label: 'DOAE ผังแปลงดิจิทัล', cls: 'src-real', note: 'ผังแปลงเกษตรกรรมดิจิทัล (ทะเบียนเกษตรกร) — ข้อมูลขึ้นทะเบียนระหว่างปี ยังไม่ครบรอบการผลิต' },
    PROJECTED: { label: 'ประมาณการ', cls: 'src-est', note: 'ผลผลิตประมาณการ = พื้นที่ขึ้นทะเบียนคงเหลือ × ผลผลิตเฉลี่ย 3 ปีล่าสุด (2565–2567)' },
    REGISTRY: { label: 'ทะเบียนเกษตรกร ทบก.', cls: 'src-real', note: 'ระบบฐานข้อมูลทะเบียนเกษตรกรกลาง กรมส่งเสริมการเกษตร — ผลการขึ้นทะเบียนและปรับปรุงทะเบียนเกษตรกรปลูกมันสำปะหลัง ปี 2569 (รายอำเภอ/ตำบล)' },
    REPORT: { label: 'รายงานระบาด CMD', cls: 'src-real', note: 'รายงานสถานการณ์การระบาดโรคใบด่างมันสำปะหลัง (รายสัปดาห์) จ.กำแพงเพชร — พื้นที่ระบาดและพื้นที่ปลูกรายอำเภอ' },
    PROJECT: { label: 'แปลงส่งเสริมพันธุ์', cls: 'src-real', note: 'ทะเบียนแปลงส่งเสริมมันสำปะหลังพันธุ์ต้านทาน-ทนทาน (โครงการ PJ-2569-001/002) รวมรายตำบล ไม่แสดงข้อมูลเกษตรกร' },
    ESTIMATE: { label: 'ประมาณการ', cls: 'src-est', note: 'ไม่มีสถิติทางการในแหล่งข้อมูล — ใช้ค่าเฉลี่ย 2565–2567' },
    FLOOD: { label: 'รายงานอุทกภัย 63–69', cls: 'src-real', note: 'แบบรายงานภัยพิบัติ (อุทกภัย/วาตภัย) ปี 2563–2569 สนง.เกษตรจังหวัดกำแพงเพชร' },
    NETWORK: { label: 'DOAE ทำเนียบศูนย์', cls: 'src-real', note: 'ทำเนียบ ศจช./ศดปช./ศพก./แปลงใหญ่ (KPP Agri Data Center)' },
    PRICE: { label: 'ราคาตลาด', cls: 'src-real', note: 'ราคาหัวมันสำปะหลังสด (บาท/กก.) ตามรายการ PRICES พร้อมแหล่งอ้างอิง — เป็นราคา ณ จุดเวลา ไม่ใช่ค่าเฉลี่ยทั้งปี' },
    PARCELALL: { label: 'ผังแปลงหลายปี', cls: 'src-real', note: 'ผังแปลงเกษตรกรรมดิจิทัล กสก. จ.กำแพงเพชร ทุกชนิดพืช (14 ไฟล์ + ไฟล์มันสำปะหลัง 22-11-2569) — กิจกรรมปลูกมันสำปะหลังปี 2563–2569 รวมรายอำเภอ/ตำบล ไม่มีข้อมูลบุคคล' },
    LDDSOIL: { label: 'LDD ชุดดิน 1:25,000', cls: 'src-real', note: 'ข้อมูลชุดดินและกลุ่มชุดดิน จ.กำแพงเพชร มาตราส่วน 1:25,000 กรมพัฒนาที่ดิน (tswc.ldd.go.th/DownloadGIS, ปรับปรุง 2567) — เนื้อดิน ความอุดมสมบูรณ์ ปฏิกิริยาดิน ประจำหน่วยแผนที่' },
    LDD: { label: 'LDD Agri-Map', cls: 'src-real', note: 'แผนที่ศักยภาพที่ดินพืชเศรษฐกิจมันสำปะหลัง จ.กำแพงเพชร (ตารางที่ 7 และภาพที่ 10) กองนโยบายและแผนการใช้ที่ดิน กรมพัฒนาที่ดิน 2564' },
    MODEL: { label: 'ดัชนีวิเคราะห์', cls: 'src-est', note: 'ดัชนีคำนวณจากข้อมูลจริง (น้ำท่วมซ้ำซาก ชั้นดิน LDD ฤดูปลูก อายุพืช) ตามเกณฑ์ที่ระบุในหน้าจอ' },
    SUPPORT: { label: 'สนับสนุนท่อนพันธุ์', cls: 'src-real', note: 'ทะเบียนการสนับสนุนท่อนพันธุ์มันสำปะหลัง จ.กำแพงเพชร (ทุกโครงการ) และรายชื่อรับท่อนพันธุ์อิทธิ โรงแป้งธนะวัฒน์ — รวมรายโครงการ/ตำบล ไม่แสดงข้อมูลเกษตรกร' },
    PLOTMON: { label: 'CassavaPlot Monitor', cls: 'src-real', note: 'ระบบติดตามแปลงส่งเสริมมันสำปะหลัง กำแพงเพชร (Google Apps Script) — สรุปสาธารณะ อัปเดตต่อเนื่อง' },
    IMPORT: { label: 'นำเข้าโดยผู้ใช้', cls: 'src-import', note: 'ข้อมูลที่นำเข้าผ่าน Data Import Studio' }
  },

  BASEMAPS: {
    light: { name: 'แผนที่สว่าง (Esri Light Gray)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; Esri, HERE, Garmin, OpenStreetMap', maxZoom: 16 },
    sat: { name: 'ภาพถ่ายดาวเทียม (Esri)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; Esri' },
    terrain: { name: 'ภูมิประเทศ (OpenTopoMap)', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap, SRTM &copy; OpenTopoMap', sub: 'abc', maxZoom: 17 },
    dark: { name: 'Dark Matter (Esri Dark Gray)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; Esri, HERE, Garmin, OpenStreetMap', maxZoom: 16 },
    osm: { name: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap contributors' }
  },

  // ช่องข้อมูลมาตรฐานสำหรับนำเข้า: key -> คำพ้องที่ใช้จับคู่คอลัมน์อัตโนมัติ
  IMPORT_FIELDS: {
    year: ['ปี', 'ปีเพาะปลูก', 'year', 'ปี พ.ศ.', 'crop_year', 'year_act'],
    district: ['อำเภอ', 'district', 'amphoe', 'a_name', 'อ.'],
    tambon: ['ตำบล', 'tambon', 'subdistrict', 't_name', 'ต.'],
    moo: ['หมู่', 'หมู่ที่', 'หมู่บ้าน', 'moo', 'village'],
    planted: ['พื้นที่ปลูก', 'เนื้อที่เพาะปลูก', 'planted', 'planted_rai', 'พื้นที่เพาะปลูก', 'act_rai'],
    harvested: ['พื้นที่เก็บเกี่ยว', 'เนื้อที่เก็บเกี่ยว', 'harvested', 'harvested_rai'],
    production: ['ผลผลิต', 'ผลผลิตรวม', 'production', 'production_ton', 'ผลผลิต(ตัน)'],
    cmd: ['พื้นที่ระบาด', 'พื้นที่ระบาดใบด่าง', 'cmd', 'cmd_rai', 'ใบด่าง', 'โรคใบด่าง'],
    rootrot: ['หัวเน่า', 'โรคหัวเน่า', 'rootrot', 'root_rot'],
    mealybug: ['เพลี้ยแป้ง', 'mealybug'],
    whitefly: ['แมลงหวี่ขาว', 'whitefly'],
    broom: ['พุ่มแจ้', 'โรคพุ่มแจ้', 'witches_broom', 'broom'],
    resist: ['พันธุ์ต้านทาน', 'พื้นที่พันธุ์ต้านทาน', 'resist', 'resistant_rai', 'resistant'],
    variety: ['พันธุ์', 'ชื่อพันธุ์', 'variety', 'breed', 'breed_name'],
    clean_stem: ['แปลงพันธุ์สะอาด', 'clean_stem', 'แปลงขยายพันธุ์'],
    name: ['ชื่อ', 'ชื่อจุด', 'name', 'สถานที่'],
    lat: ['lat', 'latitude', 'ละติจูด', 'y_wgs84'],
    lng: ['lng', 'lon', 'long', 'longitude', 'ลองจิจูด', 'x_wgs84'],
    utm_x: ['easting', 'utm_x', 'x', 'พิกัด x', 'utm e'],
    utm_y: ['northing', 'utm_y', 'y', 'พิกัด y', 'utm n'],
    zone: ['zone', 'โซน', 'utm_zone']
  }
};
