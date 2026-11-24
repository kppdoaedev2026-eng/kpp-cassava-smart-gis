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

  function saveSession() { try { sessionStorage.setItem(KEY, JSON.stringify({ t: S.token, r: S.role, n: S.name })); } catch (e) { /* ไม่เก็บ */ } }
  function restore() {
    try { const o = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (o && o.t) { S.token = o.t; S.role = o.r; S.name = o.n; } } catch (e) { /* ไม่มี */ }
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
        Object.assign(S, { token: r.token, role: r.role, name: r.name, settings: r.settings }); saveSession(); renderButton(); render(); applyMode();
      });
      return;
    }
    const s = S.settings || {}, adm = isAdmin();
    el.innerHTML = `<div class="adm-head"><b>${U.esc(S.name || '')}</b> <span class="vclass-chip" style="background:${adm ? '#b2182b' : '#0f766e'}">${adm ? 'แอดมิน' : 'เจ้าหน้าที่'}</span> <button class="btn sm" id="admLogout">ออกจากระบบ</button></div>
      <h4>🗺️ รูปแบบการแสดงแผนที่</h4>
      <div class="seg" id="admMode"><button data-mode="grid" class="${S.mode === 'grid' ? 'on' : ''}">กริด 1 กม. (สาธารณะ)</button><button data-mode="parcel" class="${S.mode === 'parcel' ? 'on' : ''}" ${s.staff_can_view_parcels === 'TRUE' || adm ? '' : 'disabled'}>พิกัดแปลง/ผังแปลง</button></div>
      <p class="hint">${S.mode === 'parcel' ? (S.rows ? `แสดงพิกัดแปลง ${U.fmt(S.rows.length)} แปลง${S.names ? ' (พร้อมชื่อ)' : ''}` : 'กำลังโหลดพิกัดแปลง…') : 'แสดงเฉพาะกริด 1 กม. ที่ไม่ระบุตัวบุคคล'}</p>
      ${adm ? `<h4>🔒 การควบคุมโดยแอดมิน</h4>
        ${toggleRow('show_parcel_names', 'แสดงชื่อแปลง/ชื่อเจ้าของแปลง', 'เปิดเฉพาะเมื่อจำเป็น ทุกการดูถูกบันทึกใน audit')}
        ${toggleRow('show_personal', 'แสดงข้อมูลส่วนบุคคล (เบอร์โทร)', 'เฉพาะแอดมินเห็น')}
        ${toggleRow('staff_can_view_parcels', 'ให้เจ้าหน้าที่ดูพิกัดแปลงได้', 'ปิด = เฉพาะแอดมิน')}
        ${toggleRow('staff_can_view_names', 'ให้เจ้าหน้าที่เห็นชื่อ (เมื่อเปิดแสดงชื่อ)', 'ค่าเริ่มต้น: ปิด')}
        <div class="row-gap" style="margin-top:8px"><button class="btn sm" id="admAudit">📜 ดูบันทึกการเข้าถึง</button></div><div id="admAuditOut"></div>` : '<p class="hint">เจ้าหน้าที่เห็นเฉพาะอำเภอที่ได้รับมอบหมาย (กำหนดในชีต KPP_PRIVATE แท็บ staff คอลัมน์ districts) · ข้อมูลส่วนบุคคลตามที่แอดมินเปิด</p>'}
      <h4>🔑 เปลี่ยนรหัสผ่านของฉัน</h4>
      <form id="admPinForm" class="adm-form"><input id="admOldPin" type="password" placeholder="รหัสเดิม" autocomplete="current-password" required>
        <input id="admNewPin" type="password" placeholder="รหัสใหม่ (อย่างน้อย 8 ตัว)" autocomplete="new-password" minlength="8" required>
        <div id="admPinMsg" class="hint" role="alert"></div><button class="btn sm" type="submit">บันทึกรหัสใหม่</button></form>`;
    $('admLogout').onclick = async () => { await call({ action: 'logout', token: S.token }); Object.assign(S, { token: null, role: null, name: '', rows: null, mode: 'grid' }); try { sessionStorage.removeItem(KEY); } catch (e) { /* ไม่เก็บ */ } clearLayer(); renderButton(); render(); };
    $('admPinForm').addEventListener('submit', async (e) => {
      e.preventDefault(); $('admPinMsg').textContent = 'กำลังบันทึก…';
      const r = await call({ action: 'change_pin', old_pin: $('admOldPin').value, new_pin: $('admNewPin').value });
      $('admPinMsg').textContent = r.ok ? 'เปลี่ยนรหัสผ่านแล้ว ครั้งต่อไปใช้รหัสใหม่' : (r.error || 'ไม่สำเร็จ');
      if (r.ok) { $('admOldPin').value = ''; $('admNewPin').value = ''; }
    });
    $('admMode').addEventListener('click', (e) => { const b = e.target.closest('button[data-mode]'); if (!b || b.disabled) return; S.mode = b.dataset.mode; applyMode(); render(); });
    el.querySelectorAll('[data-set]').forEach((i) => i.addEventListener('change', async () => {
      const r = await call({ action: 'set_settings', settings: { [i.dataset.set]: i.checked ? 'TRUE' : 'FALSE' } });
      if (r.ok) { S.settings = r.settings; S.rows = null; if (S.mode === 'parcel') applyMode(); U.toast('บันทึกการตั้งค่าแล้ว', 'ok'); } else { U.toast(r.error || 'บันทึกไม่สำเร็จ', 'err'); i.checked = !i.checked; }
    }));
    const au = $('admAudit'); if (au) au.onclick = async () => {
      const r = await call({ action: 'audit' });
      $('admAuditOut').innerHTML = r.ok ? `<div class="table-wrap" style="max-height:220px"><table class="risk"><thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>รายละเอียด</th></tr></thead><tbody>${r.rows.map((x) => `<tr><td class="l">${U.esc(String(x.time).slice(0, 19))}</td><td class="l">${U.esc(x.user)}</td><td class="l">${U.esc(x.action)}</td><td class="l">${U.esc(x.detail)}</td></tr>`).join('')}</tbody></table></div>` : U.esc(r.error);
    };
  }

  /* ---------- แสดงพิกัดแปลงบนแผนที่ (เฉพาะเมื่อเข้าสู่ระบบและเลือกโหมดพิกัดแปลง) ---------- */
  function clearLayer() { if (S.layer) { KPP.Map.map.removeLayer(S.layer); S.layer = null; } KPP.Map.layers.parcels.on = true; KPP.Map.refresh(); }
  async function applyMode() {
    if (!loggedIn() || S.mode !== 'parcel') { clearLayer(); return; }
    const cur = KPP.App.state.year + '|' + (KPP.App.state.district || '');
    if (S.rows && S.rowsKey !== cur) S.rows = null;      // เปลี่ยนปี/อำเภอ → โหลดใหม่
    if (!S.rows) {
      const st = KPP.App.state, r = await call({ action: 'parcels', year: st.year, district: st.district || '' });
      if (!r.ok) { U.toast(r.error || 'โหลดพิกัดไม่สำเร็จ', 'err'); S.mode = 'grid'; render(); return; }
      S.rows = r.rows; S.names = r.names; S.rowsKey = st.year + '|' + (st.district || '');
      if (!r.rows.length) U.toast('ไม่มีข้อมูลพิกัดแปลงในปี/อำเภอที่เลือก หรือยังไม่ได้รับมอบหมายอำเภอ', 'warn', 5000);
    }
    if (S.layer) KPP.Map.map.removeLayer(S.layer);
    KPP.Map.layers.parcels.on = false; KPP.Map.refresh();
    const g = L.layerGroup();
    S.rows.forEach((p) => {
      if (!U.isNum(+p.lat) || !U.isNum(+p.lng)) return;
      const m = L.circleMarker([+p.lat, +p.lng], { radius: 4, color: '#065F46', weight: 1, fillColor: '#10b981', fillOpacity: 0.8 });
      m.bindPopup(`<div class="pp"><h4>แปลง ${U.esc(p.key || '')}</h4><table>${[['พันธุ์', p.variety], ['พื้นที่', p.rai ? U.fmt(+p.rai) + ' ไร่' : ''], ['วันปลูก', p.plant_date], ['วันเก็บเกี่ยว', p.harvest_date], ['ชื่อ', p.owner_name], ['โทร', p.phone]].filter((x) => x[1]).map(([k, v]) => `<tr><td>${k}</td><td>${U.esc(v)}</td></tr>`).join('')}</table><div class="hint">ข้อมูลสำหรับเจ้าหน้าที่ — ห้ามเผยแพร่</div></div>`);
      g.addLayer(m);
    });
    S.layer = g.addTo(KPP.Map.map);
  }

  function init() {
    restore(); renderButton();
    const b = $('btnAdmin'); if (b) b.addEventListener('click', open);
    $('adminModal').addEventListener('click', (e) => { if (e.target.id === 'adminModal' || e.target.closest('[data-close]')) close(); });
    if (loggedIn()) call({ action: 'whoami' }).then((r) => { if (r.ok) { S.settings = r.settings; S.role = r.user.role; renderButton(); } else { S.token = null; try { sessionStorage.removeItem(KEY); } catch (e) { /* ไม่เก็บ */ } renderButton(); } });
  }
  return { init, open, loggedIn, isAdmin, call, refresh() { if (loggedIn() && S.mode === 'parcel') applyMode(); } };
})();
