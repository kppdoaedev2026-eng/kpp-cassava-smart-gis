# -*- coding: utf-8 -*-
"""รวมรายงานทางการเข้าระบบ -> data/reports.js
  1) ทะเบียนเกษตรกรมันสำปะหลัง (ระบบฐานข้อมูลทะเบียนเกษตรกรกลาง กสก.) รายอำเภอ/ตำบล
  2) รายงานสถานการณ์การระบาดโรคใบด่างมันสำปะหลัง (รายสัปดาห์) รายอำเภอ
  3) แปลงส่งเสริมพันธุ์ต้านทาน-ทนทาน (CSV) -> รวมรายตำบล ตัดชื่อ/เบอร์โทร/รหัสแปลงออก
python tools/build_reports.py"""
import glob, json, os, re
import openpyxl
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEARCH = [ROOT, os.path.dirname(ROOT)]
OUT = os.path.join(ROOT, 'data', 'reports.js')
geo = open(os.path.join(ROOT, 'data', 'geo.js'), encoding='utf-8').read()
G = json.loads(geo[geo.index('=') + 1:].rstrip().rstrip(';'))
D_NAME = {f['properties']['name']: f['properties']['code'] for f in G['districts']['features']}
T_BY_D = {}
for t in G['tambon_index'].values():
    T_BY_D.setdefault(t['district_code'], {})[re.sub(r'\s', '', t['name'])] = t['code']


def find(pattern):
    for d in SEARCH:
        m = sorted(glob.glob(os.path.join(d, pattern), recursive=True))
        if m:
            return m
    return []


def num(v):
    try:
        return float(str(v).replace(',', '')) if v not in (None, '') else 0.0
    except ValueError:
        return 0.0


def dcode_of(name):
    n = re.sub(r'^(อ\.|อำเภอ)', '', str(name).replace('\xa0', '').strip())
    return D_NAME.get(n)


# ---------- 1) Registry ----------
reg = {'source': 'ระบบฐานข้อมูลทะเบียนเกษตรกรกลาง กรมส่งเสริมการเกษตร — มันสำปะหลัง ปี 2569', 'province': None, 'districts': {}, 'tambons': {}}
files = find(os.path.join('**', '*_มันสำปะหลัง_ระบบฐานข้อมูลทะเบียนเกษตรกรกลาง*.xlsx'))
for f in files:
    ws = openpyxl.load_workbook(f, data_only=True).active
    for r in ws.iter_rows(min_row=3, values_only=True):
        code = str(r[0] or '').strip()
        if not code.startswith('6-'):
            continue
        c = code[2:]
        rec = {'name': str(r[1]).replace('\xa0', '').strip(), 'hh': int(num(r[2])), 'parcels': int(num(r[3])), 'rai': round(num(r[4]), 2),
               'dmg_hh': int(num(r[5])), 'dmg_parcels': int(num(r[6])), 'dmg_rai': round(num(r[7]), 2), 'remain': round(num(r[8]), 2)}
        if len(c) == 2:
            reg['province'] = rec
        elif len(c) == 4:
            reg['districts'][c] = rec
        elif len(c) == 6:
            reg['tambons'][c] = rec
print('[1] ทะเบียน: ไฟล์ %d · อำเภอ %d · ตำบล %d · รวม %s ไร่' % (len(files), len(reg['districts']), len(reg['tambons']), reg['province'] and reg['province']['rai']))

# ---------- 2) CMD reports (ทุกฉบับ -> ประวัติรายรอบ 2 สัปดาห์/รายเดือน) ----------
TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
AGES = ['lt3', 'm3_5', 'm6_8', 'gt8']


def thai_dates(text):
    out = []
    for d, mname, y in re.findall(r'(\d{1,2})\s*(' + '|'.join(TH_MONTHS) + r')\s*(?:พ\.ศ\.)?\s*(25\d\d)', text):
        out.append('%04d-%02d-%02d' % (int(y) - 543, TH_MONTHS.index(mname) + 1, int(d)))
    return out


def parse_cmd(path):
    ws = openpyxl.load_workbook(path, data_only=True).active
    rows = list(ws.iter_rows(values_only=True))
    period = next((str(r[0]) for r in rows if r[0] and 'ข้อมูลระหว่าง' in str(r[0])), '')
    dates = thai_dates(period)

    def block(r, start):
        out = {a: {'rai': round(num(r[start + 2 * i]), 2), 'farmers': int(num(r[start + 2 * i + 1]))} for i, a in enumerate(AGES)}
        out['total'] = {'rai': round(num(r[start + 8]), 2), 'farmers': int(num(r[start + 9]))}
        return out
    rep = {'source': 'รายงานสถานการณ์การระบาดของศัตรูพืช: โรคใบด่างมันสำปะหลัง จ.กำแพงเพชร', 'file': os.path.basename(path),
           'period': period.replace('ข้อมูลระหว่าง', '').strip(), 'start': dates[0] if dates else None, 'end': dates[-1] if dates else None,
           'province': None, 'districts': {}}
    for r in rows:
        name = str(r[0] or '').strip()
        if not name or len(r) < 37 or not isinstance(r[13], (int, float)):
            continue
        rec = {'standing': block(r, 5), 'prev': block(r, 15), 'now': block(r, 25), 'trend': r[35], 'checked': r[36]}
        if name.startswith('จ.'):
            rep['province'] = rec
        else:
            dc = dcode_of(name)
            if dc:
                rep['districts'][dc] = rec
            else:
                print('   ไม่พบอำเภอ', name, 'ใน', rep['file'])
    return rep


paths = []
for d in SEARCH:
    paths += glob.glob(os.path.join(d, 'รายงานใบด่าง*.xlsx')) + glob.glob(os.path.join(d, 'รายงานใบด่าง', '*.xlsx'))
by_end = {}
for pth in sorted(set(os.path.normcase(os.path.abspath(x)) for x in paths)):
    try:
        rep = parse_cmd(pth)
    except Exception as e:
        print('   อ่านไม่ได้', pth, e); continue
    if not rep['province'] or not rep['end']:
        print('   ข้าม (ไม่พบช่วงวันที่/ยอดจังหวัด)', os.path.basename(pth)); continue
    by_end[rep['end']] = rep
history = [by_end[k] for k in sorted(by_end)]
cmd = history[-1] if history else None
cmd_history = [{'period': h['period'], 'start': h['start'], 'end': h['end'],
                'standing': h['province']['standing']['total']['rai'], 'cmd': h['province']['now']['total']['rai'], 'farmers': h['province']['now']['total']['farmers'],
                'districts': {c: {'standing': v['standing']['total']['rai'], 'cmd': v['now']['total']['rai'], 'farmers': v['now']['total']['farmers']} for c, v in h['districts'].items()}}
               for h in history]
for h in cmd_history:
    print('[2] ใบด่าง %s → %s: ระบาด %.0f / ยืนต้น %.0f ไร่ (%d ราย)' % (h['start'], h['end'], h['cmd'], h['standing'], h['farmers']))

# ---------- 3) Resistant / tolerant variety project plots ----------
res = None
f = find('ข้อมูลมันสำปะหลังพันธุ์ต้านทาน-ทนทาน*.csv')
if f:
    df = pd.read_csv(f[-1], dtype=str, encoding='utf-8-sig')
    df = df.drop(columns=[c for c in ['เกษตรกร', 'เบอร์โทร', 'รหัสแปลง'] if c in df.columns])
    df = df[df['สถานะ'].fillna('') != 'ยกเลิก']
    tam, unmatched = {}, set()
    for r in df.itertuples(index=False):
        rr = r._asdict() if hasattr(r, '_asdict') else dict(zip(df.columns, r))
        rr = dict(zip(df.columns, r))
        dc = dcode_of(rr['อำเภอ'])
        tc = T_BY_D.get(dc, {}).get(re.sub(r'\s', '', str(rr['ตำบล'])).replace('เเ', 'แ'))
        if not tc:
            unmatched.add(f"{rr['อำเภอ']}/{rr['ตำบล']}")
            continue
        t = tam.setdefault(tc, {'plots': 0, 'rai': 0.0, 'cuttings': 0, 'varieties': {}, 'projects': {}, 'status': {}, 'cmd': 0, 'soil': {}, 'irrigation': {}, 'assessed': {}})
        t['plots'] += 1
        rai = num(rr['ไร่']); t['rai'] = round(t['rai'] + rai, 2)
        t['cuttings'] += int(num(rr['ท่อนที่รับ']))
        for key, col in [('varieties', 'พันธุ์'), ('projects', 'โครงการ'), ('status', 'สถานะ'), ('soil', 'ความเหมาะสมดิน'), ('irrigation', 'ระบบให้น้ำ'), ('assessed', 'ผลประเมิน')]:
            v = rr.get(col)
            if isinstance(v, str) and v.strip():
                t[key][v.strip()] = t[key].get(v.strip(), 0) + (rai if key == 'varieties' else 1)
        if str(rr.get('CMD/SLCMV', '')).strip() == 'ใช่':
            t['cmd'] += 1
    tot = {'plots': sum(t['plots'] for t in tam.values()), 'rai': round(sum(t['rai'] for t in tam.values()), 2), 'cuttings': sum(t['cuttings'] for t in tam.values()),
           'cmd': sum(t['cmd'] for t in tam.values()), 'varieties': {}}
    for t in tam.values():
        for k, v in t['varieties'].items():
            tot['varieties'][k] = round(tot['varieties'].get(k, 0) + v, 2)
    res = {'source': 'ทะเบียนแปลงส่งเสริมมันสำปะหลังพันธุ์ต้านทาน-ทนทาน จ.กำแพงเพชร (' + os.path.basename(f[-1]).split('_')[-1].replace('.csv', '') + ')',
           'tambons': tam, 'total': tot}
    print('[3] แปลงพันธุ์ต้านทาน: %d แปลง %.1f ไร่ ใน %d ตำบล · ไม่พบตำบล %s' % (tot['plots'], tot['rai'], len(tam), sorted(unmatched)))

with open(OUT, 'w', encoding='utf-8') as fo:
    fo.write('window.KPP_REPORTS=')
    json.dump({'registry': reg, 'cmd': cmd, 'cmd_history': cmd_history, 'resist_plots': res}, fo, ensure_ascii=False, separators=(',', ':'))
    fo.write(';\n')
print('->', OUT, '%.0f KB' % (os.path.getsize(OUT) / 1024))
