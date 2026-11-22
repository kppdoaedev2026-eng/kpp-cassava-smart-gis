window.KPP = window.KPP || {};

KPP.CONFIG = {
  TITLE: 'ระบบแผนที่อัจฉริยะและแดชบอร์ดบริหารจัดการมันสำปะหลังจังหวัดกำแพงเพชร',
  TITLE_EN: 'Kamphaeng Phet Cassava Smart GIS & Executive Dashboard',
  CENTER: [16.33, 99.58],
  ZOOM: 9,
  YEARS: [2565, 2566, 2567, 2568, 2569],
  DEFAULT_YEAR: 2569,
  PRICE_BAHT_PER_KG: 2.2,
  AID_BAHT_PER_RAI: 1980,
  SURVEILLANCE_RADII_KM: [5, 10],
  FLOOD_REPEAT_MIN_YEARS: 2,
  FLOOD_HIGH_YEARS: 3,
  FLOOD_PEAK: '10-01',
  EARLY_HARVEST_MIN_MONTHS: 8,

  DEVELOPER: 'สำนักงานเกษตรจังหวัดกำแพงเพชร',
  DEVELOPER_UNIT: 'กรมส่งเสริมการเกษตร กระทรวงเกษตรและสหกรณ์',
  VERSION: '2.0.0',

  // การจัดกลุ่มพันธุ์ต่อโรคใบด่าง (ปรับ/เพิ่มพันธุ์ใหม่ได้ใน นำเข้าข้อมูล › ตั้งค่า)
  // ชื่อพันธุ์จับคู่แบบไม่สนคำว่า "พันธุ์"/"มันสำปะหลัง"/ช่องว่าง และรองรับชื่อเรียกอื่น (VARIETY_ALIASES)
  VARIETY_CLASSES: [
    { key: 'resistant', label: 'ต้านทาน', color: '#1a7f37', rank: 0 },
    { key: 'tolerant', label: 'ทนทาน', color: '#8fd16a', rank: 1 },
    { key: 'modsus', label: 'ค่อนข้างอ่อนแอ', color: '#f5a742', rank: 2 },
    { key: 'susceptible', label: 'อ่อนแอ', color: '#d7301f', rank: 3 }
  ],
  VARIETY_DEFAULTS: {
    resistant: ['อิทธิ 1', 'อิทธิ 2', 'อิทธิ 3'],
    tolerant: ['ห้วยบง 60', 'เกษตรศาสตร์ 50'],
    susceptible: ['ระยอง 11', 'CMR 89', 'ไม่ระบุพันธุ์', 'พันธุ์อื่นๆ', 'แขกดำ']
  },
  VARIETY_ALIASES: { 'KU50': 'เกษตรศาสตร์ 50', 'KU 50': 'เกษตรศาสตร์ 50', 'อิธิ 3': 'อิทธิ 3', 'อิธิ 1': 'อิทธิ 1', 'อิธิ 2': 'อิทธิ 2', '89': 'CMR 89', 'CMR89': 'CMR 89', 'CMR38-125-77': 'CMR 89', '-': 'ไม่ระบุพันธุ์' },
  VARIETY_DEFAULT_CLASS: 'modsus',

  SOIL_CLASSES: [
    { key: 'S1', label: 'S1 เหมาะสมสูง', color: '#1a9850' },
    { key: 'S2', label: 'S2 เหมาะสมปานกลาง', color: '#a6d96a' },
    { key: 'S3', label: 'S3 เหมาะสมเล็กน้อย', color: '#fdae61' },
    { key: 'N', label: 'N ไม่เหมาะสม', color: '#d73027' }
  ],
  RAINY_PLANT_MONTHS: [5, 6, 7, 8, 9],

  DISEASES: [
    { key: 'cmd', name: 'โรคใบด่างมันสำปะหลัง (CMD)', short: 'ใบด่าง CMD' },
    { key: 'rootrot', name: 'โรครากเน่าโคนเน่า', short: 'รากเน่าโคนเน่า' },
    { key: 'mealybug', name: 'เพลี้ยแป้ง', short: 'เพลี้ยแป้ง' },
    { key: 'whitefly', name: 'แมลงหวี่ขาว', short: 'แมลงหวี่ขาว' },
    { key: 'broom', name: 'โรคพุ่มแจ้', short: 'พุ่มแจ้' }
  ],

  SOURCES: {
    OFFICIAL: { label: 'DOAE สถิติทางการ', cls: 'src-real', note: 'สถิติการปลูกพืช สนง.เกษตรจังหวัดกำแพงเพชร (KPP Agri Data Center)' },
    PARCEL: { label: 'DOAE ผังแปลงดิจิทัล', cls: 'src-real', note: 'ผังแปลงเกษตรกรรมดิจิทัล (ทะเบียนเกษตรกร) — ข้อมูลขึ้นทะเบียนระหว่างปี ยังไม่ครบรอบการผลิต' },
    PROJECTED: { label: 'ประมาณการ', cls: 'src-est', note: 'ผลผลิตประมาณการ = พื้นที่ขึ้นทะเบียน × ผลผลิตเฉลี่ย 3 ปีล่าสุด (2565–2567)' },
    ESTIMATE: { label: 'ประมาณการ', cls: 'src-est', note: 'ไม่มีสถิติทางการในแหล่งข้อมูล — ใช้ค่าเฉลี่ย 2565–2567' },
    FLOOD: { label: 'รายงานอุทกภัย 63–69', cls: 'src-real', note: 'แบบรายงานภัยพิบัติ (อุทกภัย/วาตภัย) ปี 2563–2569 สนง.เกษตรจังหวัดกำแพงเพชร' },
    NETWORK: { label: 'DOAE ทำเนียบศูนย์', cls: 'src-real', note: 'ทำเนียบ ศจช./ศดปช./ศพก./แปลงใหญ่ (KPP Agri Data Center)' },
    LDD: { label: 'LDD Agri-Map', cls: 'src-real', note: 'แผนที่ศักยภาพที่ดินพืชเศรษฐกิจมันสำปะหลัง จ.กำแพงเพชร (ตารางที่ 7 และภาพที่ 10) กองนโยบายและแผนการใช้ที่ดิน กรมพัฒนาที่ดิน 2564' },
    MODEL: { label: 'ดัชนีวิเคราะห์', cls: 'src-est', note: 'ดัชนีคำนวณจากข้อมูลจริง (น้ำท่วมซ้ำซาก ชั้นดิน LDD ฤดูปลูก อายุพืช) ตามเกณฑ์ที่ระบุในหน้าจอ' },
    SIMULATED: { label: 'ข้อมูลจำลอง', cls: 'src-sim', note: 'ยังไม่มีผลสำรวจในระบบ — ค่าจำลองแบบกำหนดได้ เพื่อสาธิตเท่านั้น กรุณานำเข้าผลสำรวจจริงผ่าน Data Import Studio' },
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
