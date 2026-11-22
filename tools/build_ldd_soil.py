# -*- coding: utf-8 -*-
"""ชั้นความเหมาะสมของที่ดินสำหรับมันสำปะหลัง (S1–N) จากรายงาน Agri-Map จังหวัดกำแพงเพชร กรมพัฒนาที่ดิน
python tools/build_ldd_soil.py   (ต้องมี pymupdf pillow numpy scipy pyproj shapely)

ขั้นตอน: ดึงภาพที่ 10 (แผนที่ศักยภาพที่ดินมันสำปะหลัง) จาก PDF -> อ้างอิงพิกัดด้วยเส้นกริด UTM 47N บนกรอบแผนที่
-> จำแนกสีเป็น S1/S2/S3/N (รวมสีที่ถูกซ้อนทับด้วยพื้นที่ชลประทาน) -> เติมพิกเซลเส้น/ตัวอักษรจากเพื่อนบ้าน
-> ส่งออกภาพซ้อน PNG (WGS84), ค่าชั้นดินรายแปลง และพื้นที่รายตำบล/อำเภอ"""
import json, os, sys, urllib.request
import numpy as np
from PIL import Image
import fitz
from scipy import ndimage
from pyproj import Transformer
import shapely
from shapely.geometry import shape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'source')
OUT = os.path.join(ROOT, 'data')
PDF = os.path.join(SRC, 'ldd_agrimap_kpt.pdf')
PDF_URL = 'https://www.ldd.go.th/Agri-Map/Data/N/kpt.pdf'

# กริด UTM บนภาพต้นฉบับ (1773x1192 px) ตรวจจากขีดกริดทั้ง 4 ด้านของกรอบ
TICK_X = {500000: 104.0, 550000: 534.25, 600000: 965.0}
TICK_Y = {1850000: 263.5, 1800000: 694.0, 1750000: 1124.5}
MAP_BOX = (46, 46, 1140, 1140)   # x0, y0, x1, y1 ภายในกรอบแผนที่

CLASSES = ['NONE', 'S1', 'S2', 'S3', 'N']
OVERLAY, ALPHA = np.array([157, 232, 255]), 0.571   # สีพื้นที่ชลประทานโปร่งแสงที่ซ้อนทับ (คำนวณย้อนจากภาพ)
PURE = {1: (40, 120, 8), 2: (248, 248, 8), 3: (232, 152, 8), 4: (248, 8, 8), 0: (248, 248, 248)}


LINES = [(8, 8, 8), (168, 168, 168), (152, 152, 152), (120, 120, 120), (200, 200, 200), (8, 200, 248), (24, 184, 232),
         (136, 72, 120), (100, 60, 100)]   # เส้นขอบเขต/แม่น้ำ/ตัวอักษร -> เติมจากเพื่อนบ้าน


def prototypes():
    protos = []
    for k, c in PURE.items():
        c = np.array(c)
        protos.append((k, c))
        protos.append((k, np.round(c * (1 - ALPHA) + OVERLAY * ALPHA)))
    protos += [(-1, np.array(c)) for c in LINES]
    return protos


def main():
    if not os.path.exists(PDF):
        print('ดาวน์โหลด', PDF_URL)
        urllib.request.urlretrieve(PDF_URL, PDF)
    doc = fitz.open(PDF)
    page = next(p for p in doc if 'ภาพที่ 10' in p.get_text() and p.get_images())
    xref = page.get_images()[0][0]
    pix = fitz.Pixmap(doc, xref)
    if pix.n > 3:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3].astype(float)
    print('ภาพ', pix.width, 'x', pix.height, 'จากหน้า', page.number + 1)

    x0, y0, x1, y1 = MAP_BOX
    sub = img[y0:y1, x0:x1]
    protos = prototypes()
    dist = np.stack([np.sqrt(((sub - c) ** 2).sum(-1)) for _, c in protos])
    best = dist.argmin(0)
    cls = np.array([k for k, _ in protos])[best]
    cls[dist.min(0) > 42] = -1                      # เส้นแม่น้ำ/ขอบเขต/ตัวอักษร
    # ชิ้นเล็กของทุกชั้น (เศษจากเส้นแม่น้ำ) และช่องว่างสีขาวเล็ก (ป้ายชื่ออำเภอ) -> เติมจากเพื่อนบ้าน
    for k in range(0, 5):
        lab, n = ndimage.label(cls == k)
        if not n:
            continue
        sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
        small = np.zeros(n + 1, bool)
        small[1:] = sizes < (4000 if k == 0 else 12)
        cls[small[lab]] = -1
    unk = cls < 0
    idx = ndimage.distance_transform_edt(unk, return_distances=False, return_indices=True)
    cls = cls[tuple(idx)]
    cls = ndimage.median_filter(cls, size=3)

    mx = (TICK_X[600000] - TICK_X[500000]) / 100000.0
    my = (TICK_Y[1750000] - TICK_Y[1850000]) / 100000.0
    print('ขนาดพิกเซล %.1f x %.1f m' % (1 / mx, 1 / my))
    H, W = cls.shape
    cols = np.arange(W) + x0 + 0.5
    rows = np.arange(H) + y0 + 0.5
    E = 500000 + (cols - TICK_X[500000]) / mx
    N = 1850000 - (rows - TICK_Y[1850000]) / my
    EE, NN = np.meshgrid(E, N)
    to_ll = Transformer.from_crs(32647, 4326, always_xy=True)
    LON, LAT = to_ll.transform(EE, NN)
    pix_rai = (1 / mx) * (1 / my) / 1600.0

    # ---- พื้นที่รายตำบล/อำเภอ ----
    tgj = json.load(open(os.path.join(SRC, 'kpp_tambons.geojson'), encoding='utf-8'))
    flat_lon, flat_lat, flat_cls = LON.ravel(), LAT.ravel(), cls.ravel()
    by_t, by_d = {}, {}
    inside_any = np.zeros(flat_cls.shape, bool)
    for f in tgj['features']:
        g = shape(f['geometry'])
        b = g.bounds
        m = (flat_lon >= b[0]) & (flat_lon <= b[2]) & (flat_lat >= b[1]) & (flat_lat <= b[3])
        ii = np.where(m)[0]
        inside = shapely.contains_xy(g, flat_lon[ii], flat_lat[ii])
        ii = ii[inside]
        inside_any[ii] = True
        counts = np.bincount(flat_cls[ii], minlength=5) * pix_rai
        tc, dc = f['properties']['tam_code'], f['properties']['amp_code']
        by_t[tc] = {k: round(float(counts[i])) for i, k in enumerate(CLASSES)}
        d = by_d.setdefault(dc, {k: 0 for k in CLASSES})
        for i, k in enumerate(CLASSES):
            d[k] += round(float(counts[i]))
    tot = {k: sum(d[k] for d in by_d.values()) for k in CLASSES}
    print('พื้นที่รวม (ไร่):', tot, ' เทียบรายงาน LDD: S1 813,687 S2 743,280 S3 504,572 N 1,722,471')

    # ---- ภาพซ้อนบนเว็บ: สุ่มตัวอย่างใหม่บนกริด lat/lng ----
    lon_min, lon_max = float(LON[inside_any.reshape(LON.shape)].min()) - 0.01, float(LON[inside_any.reshape(LON.shape)].max()) + 0.01
    lat_min, lat_max = float(LAT[inside_any.reshape(LAT.shape)].min()) - 0.01, float(LAT[inside_any.reshape(LAT.shape)].max()) + 0.01
    OW = 1400
    OH = int(OW * (lat_max - lat_min) / ((lon_max - lon_min) * np.cos(np.radians((lat_min + lat_max) / 2))))
    glon = np.linspace(lon_min, lon_max, OW)
    glat = np.linspace(lat_max, lat_min, OH)
    GLON, GLAT = np.meshgrid(glon, glat)
    to_utm = Transformer.from_crs(4326, 32647, always_xy=True)
    GE, GN = to_utm.transform(GLON, GLAT)
    px = np.floor((GE - 500000) * mx + TICK_X[500000] - x0).astype(int)
    py = np.floor((1850000 - GN) * my + TICK_Y[1850000] - y0).astype(int)
    ok = (px >= 0) & (px < W) & (py >= 0) & (py < H)
    out_cls = np.zeros(GLON.shape, int)
    out_cls[ok] = cls[py[ok], px[ok]]
    prov = shapely.union_all([shape(f['geometry']) for f in tgj['features']]).buffer(0.002)
    in_prov = shapely.contains_xy(prov, GLON.ravel(), GLAT.ravel()).reshape(GLON.shape)
    out_cls[~in_prov] = 0
    palette = {1: (26, 152, 80, 255), 2: (166, 217, 106, 255), 3: (253, 174, 97, 255), 4: (215, 48, 39, 255)}
    rgba = np.zeros(GLON.shape + (4,), np.uint8)
    for k, c in palette.items():
        rgba[out_cls == k] = c
    Image.fromarray(rgba, 'RGBA').save(os.path.join(ROOT, 'assets', 'ldd_cassava_suitability.png'), optimize=True)
    print('ภาพซ้อน', OW, 'x', OH)

    # ---- ราสเตอร์ชั้นดินสำหรับ build_data.py (สุ่มค่ารายแปลง) ----
    np.savez_compressed(os.path.join(SRC, 'ldd_cassava_class.npz'), cls=cls.astype(np.uint8),
                        e0=500000 - (TICK_X[500000] - x0) / mx, n0=1850000 + (TICK_Y[1850000] - y0) / my, px_m=1 / mx)
    t7 = json.load(open(os.path.join(SRC, 'ldd_table7.json'), encoding='utf-8'))

    with open(os.path.join(OUT, 'ldd_soil.js'), 'w', encoding='utf-8') as f:
        f.write('window.KPP_LDD=')
        json.dump({
            'source': 'แผนที่ศักยภาพของที่ดินพืชเศรษฐกิจมันสำปะหลัง จังหวัดกำแพงเพชร (ภาพที่ 10) กองนโยบายและแผนการใช้ที่ดิน กรมพัฒนาที่ดิน 2564 — Agri-Map',
            'url': PDF_URL, 'classes': CLASSES,
            'bounds': [[lat_min, lon_min], [lat_max, lon_max]],
            'pixel_m': round(1 / mx, 1),
            'accuracy_note': 'ดิจิไทซ์จากภาพแผนที่ในรายงาน (พิกเซล ~116 ม.) ผลรวมรายชั้นต่างจากตารางทางการ 3–10% — ใช้ตารางที่ 7 สำหรับสถิติรายอำเภอ',
            'table7': t7,
            'by_tambon': by_t, 'by_district': by_d
        }, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print('-> data/ldd_soil.js, assets/ldd_cassava_suitability.png')


if __name__ == '__main__':
    main()
