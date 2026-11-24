# -*- coding: utf-8 -*-
"""รวมรายงานทางการเข้าระบบ -> data/reports.js
  1) ทะเบียนเกษตรกรมันสำปะหลัง (ระบบฐานข้อมูลทะเบียนเกษตรกรกลาง กสก.) รายอำเภอ/ตำบล
  2) รายงานสถานการณ์การระบาดโรคใบด่างมันสำปะหลัง (รายสัปดาห์) รายอำเภอ
  3) แปลงส่งเสริมพันธุ์ต้านทาน-ทนทาน (CSV) -> รวมรายตำบล ตัดชื่อ/เบอร์โทร/รหัสแปลงออก
  4) การสนับสนุนท่อนพันธุ์ (ทะเบียนการสนับสนุนพันธุ์.csv + รายชื่อรับท่อนพันธุ์อิทธิ) -> รวมรายโครงการ/ตำบล ไม่เก็บชื่อ/เบอร์โทร
  5) สรุปสาธารณะจาก CassavaPlot Monitor (Apps Script ?api=public) -> ถ้าดึงไม่ได้ใช้ข้อมูลรอบก่อน
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
    print('[2] ใบด่าง %s → %s: ระบาด %.0f / ปลูก %.0f ไร่ (%d ราย)' % (h['start'], h['end'], h['cmd'], h['standing'], h['farmers']))

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
                v = v.strip()
                if key == 'varieties':   # คละพันธุ์ = คละพันธุ์อิทธิ 1, 2, 3 (พันธุ์ต้านทาน)
                    v = {'คละพันธุ์': 'คละพันธุ์อิทธิ 1–3', 'อิทธิ': 'อิทธิ (ไม่ระบุเบอร์)'}.get(v, v)
                t[key][v] = t[key].get(v, 0) + (rai if key == 'varieties' else 1)
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

# ---------- 4) การสนับสนุนท่อนพันธุ์ (โฟลเดอร์ "สนับสนุนพันธุ์มัน") — รวมรายโครงการ/ตำบล ไม่มีข้อมูลส่วนบุคคล ----------
STALKS_PER_RAI = 400   # ต้นพันธุ์ (ลำ) ต่อไร่ ตามรายงานการสนับสนุนท่อนพันธุ์ จ.กำแพงเพชร


def tcode_of(dc, name):
    n = re.sub(r'\s', '', str(name or '')).replace('เเ', 'แ').replace('หินดาด', 'หินดาต')
    return T_BY_D.get(dc, {}).get(n) if dc and n else None


def dcode_fix(name):
    return dcode_of(str(name or '').replace('พรานดระต่าย', 'พรานกระต่าย'))


support = {'source': 'ทะเบียนการสนับสนุนท่อนพันธุ์มันสำปะหลัง จ.กำแพงเพชร (สนง.เกษตรจังหวัด) + รายชื่อรับท่อนพันธุ์อิทธิ โรงแป้งธนะวัฒน์ ปี 2569',
           'stalks_per_rai': STALKS_PER_RAI, 'records': []}
f = find(os.path.join('**', 'ทะเบียนการสนับสนุนพันธุ์*.csv'))
if f:
    df = pd.read_csv(f[-1], dtype=str, encoding='utf-8-sig').fillna('')
    for r in df.to_dict('records'):
        dc = dcode_fix(r['อำเภอ']) if r['อำเภอ'].strip() else None
        stalks = num(r['ต้นพันธุ์ (ลำ)']); rai = num(r['พื้นที่ (ไร่)'])
        qty = bool(stalks or rai)            # ไม่ระบุทั้งลำและไร่ -> นับเฉพาะจำนวนเกษตรกร
        if not rai: rai = stalks / STALKS_PER_RAI
        if not stalks: stalks = rai * STALKS_PER_RAI
        rec = {'year': int(num(r['ปี'])) or None, 'project': r['โครงการ'].strip(), 'd': dc, 't': tcode_of(dc, r['ตำบล']),
               'variety': r['พันธุ์'].strip(), 'farmers': int(num(r['เกษตรกร (ราย)'])) or None, 'plots': int(num(r['แปลง'])) or None,
               'rai': round(rai, 2), 'stalks': round(stalks), 'note': r['หมายเหตุ'].strip()}
        if not qty: rec['noqty'] = True
        support['records'].append(rec)
        if r['อำเภอ'].strip() and not dc:
            print('   [4] ไม่พบอำเภอ', r['อำเภอ'])
f = find(os.path.join('**', '*รับท่อนพันธุ์อิทธิ*.xlsx'))
for path in f:
    ws = openpyxl.load_workbook(path, data_only=True).active
    agg = {}
    for r in ws.iter_rows(min_row=3, values_only=True):
        if not str(r[0] or '').strip().isdigit():
            continue
        dc = dcode_fix(r[7]); tc = tcode_of(dc, r[6])
        a = agg.setdefault((dc, tc), {'farmers': 0, 'อิทธิ 1': 0, 'อิทธิ 2': 0, 'อิทธิ 3': 0})
        a['farmers'] += 1
        for k, c in (('อิทธิ 1', 11), ('อิทธิ 2', 12), ('อิทธิ 3', 13)):
            a[k] += num(r[c])
    for (dc, tc), a in sorted(agg.items(), key=lambda x: str(x[0])):
        stalks = a['อิทธิ 1'] + a['อิทธิ 2'] + a['อิทธิ 3']
        support['records'].append({'year': 2569, 'project': 'โรงแป้งธนะวัฒน์ สนับสนุนท่อนพันธุ์อิทธิ 1–3 ปี 2569', 'd': dc, 't': tc,
                                   'variety': 'คละพันธุ์อิทธิ 1–3', 'farmers': a['farmers'], 'plots': None, 'rai': round(stalks / STALKS_PER_RAI, 2),
                                   'stalks': round(stalks), 'note': ' · '.join('%s %s ลำ' % (k, format(round(a[k]), ',')) for k in ('อิทธิ 1', 'อิทธิ 2', 'อิทธิ 3') if a[k])})
        if not tc:
            print('   [4] ไม่พบตำบล (ธนะวัฒน์)', dc, a['farmers'], 'ราย')
# Sanyu project (AFDG) — แปลงสาธิต (Type = Demo) รายละ อิทธิ 1, 2, 3 · ไม่นับแถว Monitor (ยืนยันโดยเจ้าของ: 3 ราย)
for path in find(os.path.join('**', '*Sanyu project*.xlsx')):
    ws = openpyxl.load_workbook(path, data_only=True).active
    agg = {}
    for r in ws.iter_rows(min_row=2, values_only=True):
        if str(r[1] or '').strip().lower() != 'demo':
            continue
        addr = str(r[6] or '')
        mt, md = re.search(r'ต\.\s*(\S+)', addr), re.search(r'อ\.\s*(\S+)', addr)
        dn = md.group(1) if md else ''
        dc = dcode_fix('เมืองกำแพงเพชร' if dn in ('เมือง', 'เมืองกำแพงเพชร') else dn)
        tc = tcode_of(dc, mt.group(1) if mt else '')
        a = agg.setdefault((dc, tc), {'farmers': 0, 'rai': 0.0})
        a['farmers'] += 1; a['rai'] += num(r[3])
    yy = re.search(r'(\d{2})(\d{2})(\d{2})\s', os.path.basename(path))
    for (dc, tc), a in agg.items():
        support['records'].append({'year': 2500 + int(yy.group(1)) + 43 if yy else 2569, 'project': 'Sanyu project (AFDG) แปลงสาธิต — สนับสนุนอิทธิ 1, 2, 3', 'd': dc, 't': tc,
                                   'variety': 'คละพันธุ์อิทธิ 1–3', 'farmers': a['farmers'], 'plots': a['farmers'], 'rai': round(a['rai'], 2),
                                   'stalks': round(a['rai'] * STALKS_PER_RAI), 'note': 'ต้นพันธุ์คำนวณ %d ลำ/ไร่' % STALKS_PER_RAI})
        if not tc:
            print('   [4] ไม่พบตำบล (Sanyu)', dc)
print('[4] สนับสนุนพันธุ์: %d รายการ · %.2f ไร่ · %s ลำ' % (len(support['records']), sum(x['rai'] for x in support['records']), format(sum(x['stalks'] for x in support['records']), ',')))
if not support['records']:
    support = None

# ---------- 5) ระบบติดตามแปลงส่งเสริม CassavaPlot Monitor (Apps Script) — สรุปสาธารณะ ไม่มีข้อมูลส่วนบุคคล ----------
cfg = open(os.path.join(ROOT, 'js', 'config.js'), encoding='utf-8').read()
m = re.search(r"PLOT_MONITOR_URL:\s*'([^']+)'", cfg)
plot_monitor = None
try:
    prev = open(OUT, encoding='utf-8').read()
    plot_monitor = json.loads(prev[prev.index('=') + 1:].rstrip().rstrip(';')).get('plot_monitor')
except Exception:
    pass
if m:
    import urllib.request
    try:
        with urllib.request.urlopen(m.group(1) + '?api=public', timeout=60) as resp:
            body = resp.read().decode('utf-8')
        data = json.loads(body)
        if data.get('ok'):
            data['fetched_at'] = __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')
            plot_monitor = data
            s = data.get('summary') or {}
            print('[5] CassavaPlot: %s แปลง · %s ไร่ (อัปเดต %s)' % (s.get('plotCount'), s.get('totalArea'), data.get('updatedAt')))
        else:
            print('   [5] CassavaPlot ตอบกลับไม่สำเร็จ:', data.get('error'), '— ใช้ข้อมูลเดิม')
    except Exception as e:
        print('   [5] ดึงข้อมูล CassavaPlot ไม่ได้ (ต้องติดตั้ง tools/apps_script_public_api.gs ก่อน):', str(e)[:80], '— ใช้ข้อมูลเดิม' if plot_monitor else '')

with open(OUT, 'w', encoding='utf-8') as fo:
    fo.write('window.KPP_REPORTS=')
    json.dump({'registry': reg, 'cmd': cmd, 'cmd_history': cmd_history, 'resist_plots': res, 'support': support, 'plot_monitor': plot_monitor}, fo, ensure_ascii=False, separators=(',', ':'))
    fo.write(';\n')
print('->', OUT, '%.0f KB' % (os.path.getsize(OUT) / 1024))
