/* เข้าสู่ระบบแอดมิน/เจ้าหน้าที่ + ควบคุมการแสดงพิกัดแปลง/ชื่อ/ข้อมูลส่วนบุคคล (ข้อมูลอยู่ใน Google Sheet ส่วนตัวผ่าน Apps Script — ไม่อยู่ใน repo/เว็บสาธารณะ) */
KPP.Admin = (function () {
  const U = KPP.U, C = KPP.CONFIG;
  const $ = (id) => document.getElementById(id);
  const S = { token: null, role: null, name: '', settings: null, rows: null, layer: null, mode: 'grid' };
  const KEY = 'kpp.admin.session';

  async function call(body) {
    if (!C.BACKEND_URL) return { ok: false, error: 'ยังไม่ได้ตั้งค่า BACKEND_URL ใน js/config.js (ดู tools/apps_script_kpp_backend.gs)' };
    try {
      const r = await fetch(C.BACKEND_URL, { method: 'POST', body: JSON.stringify(Object.assign({ token: S.token }, body)) });
      return await r.json();
    } catch (e) { return { ok: false, error: 'เชื่อมต่อ backend ไม่ได้' }; }
  }
  const isAdmin = () => S.role === 'admin';
  const loggedIn = () => !!S.token;

  function saveSession() { try { sessionStorage.setItem(KEY, JSON.stringify({ t: S.token, r: S.role, n: S.name, m: S.mode })); } catch (e) { /* ไม่เก็บ */ } }
  function restore() {
    try { const o = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (o && o.t) { S.token = o.t; S.role = o.r; S.name = o.n; S.mode = o.m === 'parcel' ? 'parcel' : 'grid'; } } catch (e) { /* ไม่มี */ }
  }

  function renderButton() {
    const b = $('btnAdmin'); if (!b) return;
    b.textContent = loggedIn() ? `🔓 ${S.name || (isAdmin() ? 'แอดมิน' : 'เจ้าหน้าที่')}` : '🔐 เจ้าหน้าที่';
    b.classList.toggle('on', loggedIn());
    document.body.classList.toggle('is-staff', loggedIn());
    document.body.classList.toggle('is-admin', loggedIn() && isAdmin());
  }

  function open() {
    const m = $('adminModal'); m.hidden = false; render();
  }
  function close() { $('adminModal').hidden = true; }

  function toggleRow(key, label, hint, disabled) {
    const v = S.settings && String(S.settings[key]) === 'TRUE';
    return `<label class="adm-row"><input type="checkbox" data-set="${key}" ${v ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><b>${label}</b><small>${hint}</small></span></label>`;
  }
  const distBoxes = (sel) => KPP.Data.D.districts.map((d) => `<label class="adm-chk"><input type="checkbox" value="${d.code}" ${sel.includes(d.code) ? 'checked' : ''}>${U.esc(d.name)}</label>`).join('');
  const pickDist = (root) => [...root.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.value).join(',');
  const distNames = (csv) => String(csv || '').split(/[,\s]+/).filter(Boolean).map((c) => (KPP.Data.D.dByCode[c] || {}).name || c).join(', ') || '—';

  async function loadUsers() {
    const box = $('admUsers'); if (!box) return;
    const r = await call({ action: 'list_staff' });
    if (!r.ok) { box.textContent = r.error || 'โหลดรายชื่อไม่สำเร็จ (ต้อง Deploy backend เวอร์ชันล่าสุด)'; return; }
    box.className = '';
    box.innerHTML = `<div class="table-wrap"><table class="risk"><thead><tr><th>ผู้ใช้</th><th>ชื่อ</th><th>สิทธิ์</th><th>ใช้งาน</th><th>อำเภอที่รับผิดชอบ</th><th>เข้าล่าสุด</th><th></th></tr></thead><tbody>${
      r.rows.map((x) => `<tr data-code="${U.esc(x.code)}"><td class="l"><b>${U.esc(x.code)}</b></td><td class="l">${U.esc(x.name)}</td><td>${x.role === 'admin' ? 'แอดมิน' : 'เจ้าหน้าที่'}</td>
        <td><input type="checkbox" data-au="active" ${x.active ? 'checked' : ''} ${x.code === (S.code || '') ? 'disabled' : ''} aria-label="เปิดใช้งาน ${U.esc(x.code)}"></td>
        <td class="l" style="white-space:normal">${x.role === 'admin' ? 'ทุกอำเภอ' : U.esc(distNames(x.districts))}</td><td class="l">${U.esc(String(x.last_login || '').slice(0, 16).replace('T', ' ')) || '—'}</td>
        <td class="l"><button class="btn sm" data-au="dist" ${x.role === 'admin' ? 'disabled' : ''}>อำเภอ</button> <button class="btn sm" data-au="pin">รีเซ็ตรหัส</button></td></tr>
        <tr class="adm-edit" hidden data-edit="${U.esc(x.code)}"><td colspan="7"><div class="adm-dist">${distBoxes(String(x.districts || '').split(/[,\s]+/).filter(Boolean))}</div><button class="btn primary sm" data-au="savedist">บันทึกอำเภอ</button></td></tr>`).join('')}</tbody></table></div>`;
    box.onclick = async (e) => {
      const b = e.target.closest('[data-au]'); if (!b || b.type === 'checkbox') return;
      const tr = b.closest('tr'), code = (tr.dataset.code || tr.dataset.edit);
      if (b.dataset.au === 'dist') { box.querySelector(`tr[data-edit="${code}"]`).hidden ^= 1; }
      if (b.dataset.au === 'savedist') { const x = await call({ action: 'update_staff', code, districts: pickDist(tr) }); U.toast(x.ok ? 'บันทึกอำเภอแล้ว' : x.error, x.ok ? 'ok' : 'err'); if (x.ok) loadUsers(); }
      if (b.dataset.au === 'pin') { const np = window.prompt('รหัสผ่านใหม่ของ ' + code + ' (อย่างน้อย 8 ตัว)'); if (!np) return; const x = await call({ action: 'update_staff', code, new_pin: np }); U.toast(x.ok ? 'รีเซ็ตรหัสผ่านแล้ว' : x.error, x.ok ? 'ok' : 'err'); }
    };
    box.onchange = async (e) => {
      const i = e.target.closest('[data-au="active"]'); if (!i) return;
      const code = i.closest('tr').dataset.code, x = await call({ action: 'update_staff', code, active: i.checked });
      U.toast(x.ok ? (i.checked ? 'เปิดใช้งานแล้ว' : 'ปิดการใช้งานแล้ว') : x.error, x.ok ? 'ok' : 'err'); if (!x.ok) i.checked = !i.checked;
    };
  }

  function render() {
    const el = $('adminBody');
    if (!C.BACKEND_URL) {
      el.innerHTML = `<div class="ins warning"><h4>ยังไม่ได้เชื่อมต่อ backend</h4><p>ระบบเข้าสู่ระบบเก็บข้อมูลส่วนบุคคลใน Google Sheet ส่วนตัวผ่าน Apps Script ติดตั้งตามขั้นตอนใน <code>tools/apps_script_kpp_backend.gs</code> แล้วใส่ URL ที่ได้ในค่า <code>BACKEND_URL</code> ของ <code>js/config.js</code></p></div>`;
      return;
    }
    if (!loggedIn()) {
      el.innerHTML = `<form id="admForm" class="adm-form"><p class="hint">สำหรับแอดมินและเจ้าหน้าที่ที่ได้รับรหัส — ข้อมูลพิกัด/ผังแปลงรายแปลงจะแสดงเฉพาะผู้ที่ได้รับสิทธิ์</p>
        <label class="fld"><span>รหัสผู้ใช้</span><input id="admCode" autocomplete="username" required></label>
        <label class="fld"><span>รหัสผ่าน</span><input id="admPin" type="password" autocomplete="current-password" required></label>
        <div id="admMsg" class="hint" role="alert"></div><button class="btn primary" type="submit">เข้าสู่ระบบ</button></form>`;
      $('admForm').addEventListener('submit', async (e) => {
        e.preventDefault(); $('admMsg').textContent = 'กำลังตรวจสอบ…';
        const r = await call({ action: 'login', code: $('admCode').value.trim(), pin: $('admPin').value });
        if (!r.ok) { $('admMsg').textContent = r.error || 'เข้าสู่ระบบไม่สำเร็จ'; return; }
        Object.assign(S, { token: r.token, role: r.role, name: r.name, code: $('admCode').value.trim(), settings: r.settings }); saveSession(); renderButton(); render(); applyMode();
      });
      return;
    }
    const s = S.settings || {}, adm = isAdmin();
    el.innerHTML = `<div class="adm-head"><b>${U.esc(S.name || '')}</b> <span class="vclass-chip" style="background:${adm ? '#b2182b' : '#0f766e'}">${adm ? 'แอดมิน' : 'เจ้าหน้าที่'}</span> <button class="btn sm" id="admLogout">ออกจากระบบ</button></div>
      <h4>🗺️ รูปแบบการแสดงแผนที่</h4>
      <div class="seg" id="admMode"><button data-mode="grid" class="${S.mode === 'grid' ? 'on' : ''}">กริด 1 กม. (สาธารณะ)</button><button data-mode="parcel" class="${S.mode === 'parcel' ? 'on' : ''}" ${s.staff_can_view_parcels === 'TRUE' || adm ? '' : 'disabled'}>พิกัดแปลง/ผังแปลง</button></div>
      <p class="hint" id="admModeInfo">${S.mode === 'parcel' ? (S.info || 'กำลังโหลดพิกัดแปลง…') : 'แสดงเฉพาะกริด 1 กม. ที่ไม่ระบุตัวบุคคล'}</p>
      ${adm ? `<h4>🔒 การควบคุมโดยแอดมิน</h4>
        ${toggleRow('show_parcel_names', 'แสดงชื่อแปลง/ชื่อเจ้าของแปลง', 'เปิดเฉพาะเมื่อจำเป็น ทุกการดูถูกบันทึกใน audit')}
        ${toggleRow('show_personal', 'แสดงข้อมูลส่วนบุคคล (เบอร์โทร)', 'เฉพาะแอดมินเห็น')}
        ${toggleRow('staff_can_view_parcels', 'ให้เจ้าหน้าที่ดูพิกัดแปลงได้', 'ปิด = เฉพาะแอดมิน')}
        ${toggleRow('staff_can_view_names', 'ให้เจ้าหน้าที่เห็นชื่อ (เมื่อเปิดแสดงชื่อ)', 'ค่าเริ่มต้น: ปิด')}
        <div class="row-gap" style="margin-top:8px"><button class="btn sm" id="admAudit">📜 ดูบันทึกการเข้าถึง</button></div><div id="admAuditOut"></div>` : '<p class="hint">เจ้าหน้าที่เห็นเฉพาะอำเภอที่ได้รับมอบหมาย (กำหนดในชีต KPP_PRIVATE แท็บ staff คอลัมน์ districts) · ข้อมูลส่วนบุคคลตามที่แอดมินเปิด</p>'}
      ${adm ? `<h4>👥 ผู้ใช้งานระบบ</h4><div id="admUsers" class="hint">กำลังโหลดรายชื่อ…</div>
        <details class="adm-add"><summary>➕ เพิ่มผู้ใช้งาน</summary>
          <form id="admAddForm" class="adm-form">
            <input id="auCode" placeholder="รหัสผู้ใช้ (อังกฤษ/ตัวเลข 3–30 ตัว)" autocomplete="off" required pattern="[A-Za-z0-9_.\-]{3,30}">
            <input id="auName" placeholder="ชื่อ-สกุล / หน่วยงาน" autocomplete="off" required>
            <input id="auPin" type="password" placeholder="รหัสผ่านชั่วคราว (อย่างน้อย 8 ตัว)" autocomplete="new-password" minlength="8" required>
            <select id="auRole"><option value="staff">เจ้าหน้าที่ (เห็นเฉพาะอำเภอที่รับผิดชอบ)</option><option value="admin">แอดมิน (เห็นทุกอำเภอ + จัดการระบบ)</option></select>
            <div class="hint">อำเภอที่รับผิดชอบ (เจ้าหน้าที่):</div><div class="adm-dist" id="auDist">${distBoxes([])}</div>
            <div id="auMsg" class="hint" role="alert"></div><button class="btn primary sm" type="submit">เพิ่มผู้ใช้</button></form></details>` : ''}
      <h4>🔑 เปลี่ยนรหัสผ่านของฉัน</h4>
      <form id="admPinForm" class="adm-form"><input id="admOldPin" type="password" placeholder="รหัสเดิม" autocomplete="current-password" required>
        <input id="admNewPin" type="password" placeholder="รหัสใหม่ (อย่างน้อย 8 ตัว)" autocomplete="new-password" minlength="8" required>
        <div id="admPinMsg" class="hint" role="alert"></div><button class="btn sm" type="submit">บันทึกรหัสใหม่</button></form>`;
    $('admLogout').onclick = async () => { await call({ action: 'logout', token: S.token }); Object.assign(S, { token: null, role: null, name: '', rows: null, mode: 'grid', cache: {} }); try { sessionStorage.removeItem(KEY); } catch (e) { /* ไม่เก็บ */ } clearLayer(); renderButton(); render(); };
    if (adm) {
      loadUsers();
      $('admAddForm').addEventListener('submit', async (e) => {
        e.preventDefault(); $('auMsg').textContent = 'กำลังเพิ่ม…';
        const r = await call({ action: 'add_staff', code: $('auCode').value.trim(), name: $('auName').value.trim(), pin: $('auPin').value, role: $('auRole').value, districts: pickDist($('auDist')) });
        $('auMsg').textContent = r.ok ? 'เพิ่มผู้ใช้แล้ว — แจ้งรหัสชั่วคราวให้ผู้ใช้และให้เปลี่ยนรหัสหลังเข้าสู่ระบบ' : (r.error || 'ไม่สำเร็จ');
        if (r.ok) { $('admAddForm').reset(); loadUsers(); }
      });
    }
    $('admPinForm').addEventListener('submit', async (e) => {
      e.preventDefault(); $('admPinMsg').textContent = 'กำลังบันทึก…';
      const r = await call({ action: 'change_pin', old_pin: $('admOldPin').value, new_pin: $('admNewPin').value });
      $('admPinMsg').textContent = r.ok ? 'เปลี่ยนรหัสผ่านแล้ว ครั้งต่อไปใช้รหัสใหม่' : (r.error || 'ไม่สำเร็จ');
      if (r.ok) { $('admOldPin').value = ''; $('admNewPin').value = ''; }
    });
    $('admMode').addEventListener('click', (e) => { const b = e.target.closest('button[data-mode]'); if (!b || b.disabled) return; S.mode = b.dataset.mode; saveSession(); applyMode(); render(); if (S.mode === 'parcel' && !KPP.App.state.district && isAdmin()) close(); });
    el.querySelectorAll('[data-set]').forEach((i) => i.addEventListener('change', async () => {
      const r = await call({ action: 'set_settings', settings: { [i.dataset.set]: i.checked ? 'TRUE' : 'FALSE' } });
      if (r.ok) { S.settings = r.settings; S.cache = {}; if (S.mode === 'parcel') applyMode(); U.toast('บันทึกการตั้งค่าแล้ว', 'ok'); } else { U.toast(r.error || 'บันทึกไม่สำเร็จ', 'err'); i.checked = !i.checked; }
    }));
    const au = $('admAudit'); if (au) au.onclick = async () => {
      const r = await call({ action: 'audit' });
      $('admAuditOut').innerHTML = r.ok ? `<div class="table-wrap" style="max-height:220px"><table class="risk"><thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>รายละเอียด</th></tr></thead><tbody>${r.rows.map((x) => `<tr><td class="l">${U.esc(String(x.time).slice(0, 19))}</td><td class="l">${U.esc(x.user)}</td><td class="l">${U.esc(x.action)}</td><td class="l">${U.esc(x.detail)}</td></tr>`).join('')}</tbody></table></div>` : U.esc(r.error);
    };
  }

  /* ---------- แสดงพิกัดแปลงบนแผนที่ (เฉพาะเมื่อเข้าสู่ระบบและเลือกโหมดพิกัดแปลง) ----------
     โหลดทีละอำเภอ (แคชในหน้านี้) แล้วกรองตำบลที่เลือกฝั่งเบราว์เซอร์ · แอดมินต้องเลือกอำเภอก่อน (ไม่โหลดทั้งจังหวัด) · เจ้าหน้าที่ได้เฉพาะอำเภอที่มอบหมาย */
  S.cache = {};
  /* แถบสถานะบนแผนที่ (มองเห็นได้แม้ปิดหน้าต่างเจ้าหน้าที่) */
  function mapNote(t) {
    const M = KPP.Map.map;
    if (!S.note) { S.note = L.control({ position: 'topleft' }); S.note.onAdd = () => { const d = L.DomUtil.create('div', 'adm-mapnote'); L.DomEvent.disableClickPropagation(d); return d; }; }
    if (!t) { if (S.note._map) S.note.remove(); return; }
    if (!S.note._map) S.note.addTo(M);
    S.note.getContainer().textContent = '🔐 ' + t;
  }
  function clearLayer() { if (S.layer) { KPP.Map.map.removeLayer(S.layer); S.layer = null; } mapNote(''); KPP.Map.layers.parcels.on = true; KPP.Map.refresh(); }
  function setInfo(t) { S.info = t; const el = $('admModeInfo'); if (el) el.textContent = t; mapNote(t); }
  async function applyMode() {
    if (!loggedIn() || S.mode !== 'parcel') { clearLayer(); return; }
    const st = KPP.App.state, need = isAdmin() && !st.district;
    if (need) { if (S.layer) { KPP.Map.map.removeLayer(S.layer); S.layer = null; } setInfo('เลือกอำเภอที่ตัวกรองด้านบนก่อน จึงจะแสดงพิกัดแปลง (โหลดทีละอำเภอ/ตำบลเพื่อความเร็ว)'); KPP.Map.layers.parcels.on = false; KPP.Map.refresh(); return; }
    const key = st.year + '|' + (st.district || '*');
    if (!S.cache[key]) {
      setInfo('กำลังโหลดพิกัดแปลง…');
      const r = await call({ action: 'parcels', year: st.year, district: st.district || '' });
      if (!r.ok) { U.toast(r.error || 'โหลดพิกัดไม่สำเร็จ', 'err'); S.mode = 'grid'; render(); clearLayer(); return; }
      S.cache[key] = { rows: r.rows, names: r.names };
    }
    const cur = KPP.App.state;
    if (cur.year + '|' + (cur.district || '*') !== key && !(isAdmin() === false && !cur.district)) { return; }   // ตัวกรองเปลี่ยนระหว่างรอ — รอบใหม่จะโหลดเอง
    const c = S.cache[key];
    const rows = cur.tambon ? c.rows.filter((p) => String(p.tambon) === String(cur.tambon)) : c.rows;
    S.names = c.names; S.rows = rows;
    if (S.layer) KPP.Map.map.removeLayer(S.layer);
    KPP.Map.layers.parcels.on = false; KPP.Map.refresh();
    if (!KPP.Map.map.getPane('admin')) KPP.Map.map.createPane('admin').style.zIndex = 460;   // อยู่เหนือจุดกริดสาธารณะ ใต้หมุดศูนย์/ป้ายชื่อ
    if (!S.renderer) S.renderer = L.canvas({ padding: 0.3, pane: 'admin' });
    const g = L.layerGroup();
    rows.forEach((p) => {
      if (!U.isNum(+p.lat) || !U.isNum(+p.lng) || !+p.lat) return;
      const m = L.circleMarker([+p.lat, +p.lng], { renderer: S.renderer, pane: 'admin', radius: rows.length > 6000 ? 3 : 4, color: '#065F46', weight: 1, fillColor: '#10b981', fillOpacity: 0.8 });
      m.bindPopup(() => `<div class="pp"><h4>แปลง ${U.esc(p.key || '')}</h4><table>${[['พันธุ์', p.variety], ['พื้นที่', p.rai ? U.fmt(+p.rai) + ' ไร่' : ''], ['วันปลูก', p.plant_date], ['วันเก็บเกี่ยว', p.harvest_date]].filter((x) => x[1]).map(([k, v]) => `<tr><td>${k}</td><td>${U.esc(v)}</td></tr>`).join('')}</table>
        <div class="pp-detail" data-key="${U.esc(p.key)}"><button class="btn sm primary" data-detail="${U.esc(p.key)}">🔓 ดูข้อมูลทั้งหมด${isAdmin() ? ' (รวมข้อมูลส่วนบุคคล)' : ''}</button></div><div class="hint">ข้อมูลสำหรับเจ้าหน้าที่ — ห้ามเผยแพร่ · การเปิดดูถูกบันทึก</div></div>`);
      g.addLayer(m);
    });
    S.layer = g.addTo(KPP.Map.map);
    setInfo(`แสดงพิกัดแปลง ${U.fmt(rows.length)} แปลง${cur.tambon ? ' (ตำบลที่เลือก)' : cur.district ? ' (อำเภอที่เลือก)' : ''}${S.names ? ' · มีชื่อ' : ''}`);
  }

  const LBL = { key: 'รหัสกิจกรรม', year: 'ปีเพาะปลูก', district: 'อำเภอ (รหัส)', tambon: 'ตำบล (รหัส)', moo: 'หมู่', lat: 'ละติจูด', lng: 'ลองจิจูด', rai: 'พื้นที่ (ไร่)', variety: 'พันธุ์', plant_date: 'วันปลูก', harvest_date: 'วันเก็บเกี่ยว', owner_name: 'ชื่อ-สกุล', phone: 'เบอร์โทร', note: 'ที่อยู่ / เอกสารสิทธิ์' };
  async function showDetail(btn) {
    const box = btn.closest('.pp-detail'); box.innerHTML = '<span class="hint">กำลังโหลด…</span>';
    const r = await call({ action: 'parcel_detail', key: btn.dataset.detail, year: KPP.App.state.year });
    if (!r.ok) { box.innerHTML = `<span class="hint">${U.esc(r.error || 'ไม่สำเร็จ')}${/parcel_detail|ไม่รู้จัก/.test(r.error || '') ? ' (backend ยังไม่ได้ Deploy เวอร์ชันล่าสุด)' : ''}</span>`; return; }
    box.innerHTML = `<table class="pp-full">${Object.entries(r.record).filter(([, v]) => v !== '' && v !== null).map(([k, v]) => `<tr><td>${LBL[k] || k}</td><td>${U.esc(v)}</td></tr>`).join('')}</table>`;
  }
  function init() {
    restore(); renderButton();
    KPP.Map.map.on('popupopen', (e) => { const b = e.popup.getElement() && e.popup.getElement().querySelector('[data-detail]'); if (b) b.addEventListener('click', () => showDetail(b)); });
    const b = $('btnAdmin'); if (b) b.addEventListener('click', open);
    $('adminModal').addEventListener('click', (e) => { if (e.target.id === 'adminModal' || e.target.closest('[data-close]')) close(); });
    if (loggedIn()) call({ action: 'whoami' }).then((r) => { if (r.ok) { S.settings = r.settings; S.role = r.user.role; S.code = r.user.code; renderButton(); if (S.mode === 'parcel') applyMode(); } else { S.token = null; try { sessionStorage.removeItem(KEY); } catch (e) { /* ไม่เก็บ */ } renderButton(); } });
  }
  return { init, open, loggedIn, isAdmin, call, refresh() { if (loggedIn() && S.mode === 'parcel') applyMode(); } };
})();
