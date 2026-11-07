// ============================================================
// Pagos: cuotas mensuales, totales del mes y del año, exportar e importar desde la app de gestión
// ============================================================
const euro = n => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const capFirst = s => s.charAt(0).toUpperCase() + s.slice(1);
const monthLabel = mk => `${capFirst(monthName(mk))} ${mk.slice(0, 4)}`;
const fmtPayDate = d => { if (!d) return ''; const x = parseKey(String(d).slice(0, 10)); return `${x.getDate()} ${MONTHS[x.getMonth()]}`; };

function viewAdminPayments() {
  const mk = state.payMonth || (state.payMonth = monthKey());
  const sum = monthSummary(mk);
  const q = norm2(state.search);
  const filt = state.payFilter || 'pending';
  const payers = payersFor(mk);
  const statusOf = c => paymentOf(c.id, mk)?.status || 'pending';
  const filters = { pending: '⏳ Pendientes', paid: '✅ Pagados', absent: '🏖 No vienen', all: 'Todos' };
  const list = payers.filter(c => (filt === 'all' || statusOf(c) === filt) && (!q || norm2(c.name + ' ' + c.email + ' ' + (c.phone || '')).includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const isCurrent = mk === monthKey();
  const year = mk.slice(0, 4);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
  const yearTotals = months.map(m => ({ m, t: monthSummary(m).total }));
  const maxT = Math.max(1, ...yearTotals.map(x => x.t));
  const yearSum = round2(yearTotals.reduce((a, x) => a + x.t, 0));
  const row = c => {
    const p = paymentOf(c.id, mk), f = feeOf(c);
    const right = !p
      ? `<button class="btn sm primary" data-a="pay-open" data-id="${c.id}" data-m="${mk}">💶 Cobrar ${euro(withIva(f.base, f.iva))}</button>`
      : p.status === 'absent'
        ? `<button class="pay-pill absent" data-a="pay-open" data-id="${c.id}" data-m="${mk}">🏖 No viene este mes</button>`
        : `<button class="pay-pill paid" data-a="pay-open" data-id="${c.id}" data-m="${mk}"><b>${euro(p.total)}</b> · ${esc(p.method)} · ${fmtPayDate(p.paidAt)}</button>`;
    const ans = !p && c.paymentDue ? (c.paymentAnswer === 'stay' ? '<span class="pill ok">Dice que sigue</span>' : c.paymentAnswer === 'leave' ? '<span class="pill danger">Se da de baja</span>' : '') : '';
    return `<div class="list-item pay-row">
      <div class="avatar">${initials(c.name)}</div>
      <div class="grow clickable" data-a="client-open" data-id="${c.id}"><div class="ellipsis" style="font-weight:600">${esc(c.name)} ${!c.active ? '<span class="pill">Inactivo</span>' : ''}${ans}</div>
        <div class="muted small ellipsis">${esc(getPlan(c.planId)?.name || 'Sin tarifa')} · cuota ${euro(withIva(f.base, f.iva))}${f.iva ? ' (IVA incl.)' : ''}</div></div>
      ${right}</div>`;
  };
  return `
    <div class="page-title"><h1>Pagos</h1><div class="row wrap">
      <button class="btn" data-a="pay-import">⬆️ Importar de gestión</button>
      <button class="btn" data-a="pay-export" data-m="${mk}">⬇️ Excel del mes</button></div></div>
    <div class="month-nav">
      <button class="btn ghost" data-a="pay-month" data-d="-1" aria-label="Mes anterior">‹</button>
      <div><b>${monthLabel(mk)}</b>${isCurrent ? '<span class="pill ok" style="margin-left:8px">Mes actual</span>' : `<button class="btn sm ghost" data-a="pay-month" data-d="0">Ir al mes actual</button>`}</div>
      <button class="btn ghost" data-a="pay-month" data-d="1" aria-label="Mes siguiente">›</button>
    </div>
    <div class="grid-stats">
      <div class="card kpi" style="--k:#1F7A45"><div class="kpi-ic">💶</div><div><div class="v">${euro(sum.total)}</div><div class="l">Cobrado${sum.ivaTotal ? ` · IVA ${euro(sum.ivaTotal)}` : ''}</div></div></div>
      <div class="card kpi" style="--k:#2F5D8A"><div class="kpi-ic">✅</div><div><div class="v">${sum.paidN}<small style="font-size:15px;color:var(--muted)">/${sum.payers}</small></div><div class="l">Han pagado</div></div></div>
      <div class="card kpi" style="--k:#E8890C"><div class="kpi-ic">⏳</div><div><div class="v">${sum.pending.length}</div><div class="l">Pendientes · ${euro(sum.expected)}</div></div></div>
      <div class="card kpi" style="--k:#6D4C9F"><div class="kpi-ic">🏖</div><div><div class="v">${sum.absent}</div><div class="l">No vienen este mes</div></div></div>
    </div>
    ${Object.keys(sum.byMethod).length ? `<div class="pay-methods">${PAY_METHODS.concat(Object.keys(sum.byMethod).filter(m => !PAY_METHODS.includes(m))).filter(m => sum.byMethod[m]).map(m => `<span class="pay-method"><b>${esc(m)}</b> ${euro(sum.byMethod[m])}</span>`).join('')}</div>` : ''}
    <div class="tabs">${Object.entries(filters).map(([k, l]) => `<button class="${filt === k ? 'active' : ''}" data-a="pay-filter" data-f="${k}">${l} (${k === 'all' ? payers.length : payers.filter(c => statusOf(c) === k).length})</button>`).join('')}</div>
    <input class="search" placeholder="Buscar socio…" value="${esc(state.search)}" data-input="search">
    <div class="card list">${list.length ? list.map(row).join('') : `<div class="empty">${filt === 'pending' ? '🎉 Nadie pendiente este mes.' : 'No hay socios en esta lista.'}</div>`}</div>
    <div class="section-h">Resumen de ${year} · total ${euro(yearSum)}</div>
    <div class="card year-chart">${yearTotals.map(({ m, t }) => `<button class="yc-col ${m === mk ? 'on' : ''}" data-a="pay-month-set" data-m="${m}" title="${monthLabel(m)}: ${euro(t)}">
      <span class="yc-v">${t ? Math.round(t) + '€' : ''}</span><span class="yc-bar"><i style="height:${Math.round(t / maxT * 100)}%"></i></span><span class="yc-m">${MONTHS[Number(m.slice(5)) - 1]}</span></button>`).join('')}</div>`;
}

// Ventana para registrar / corregir el pago de un socio en un mes
function openPaymentModal(userId, month) {
  const u = getUser(userId), p = paymentOf(userId, month), f = feeOf(u);
  const paid = p?.status === 'paid';
  const base = paid ? p.base : f.base, iva = paid ? p.iva : f.iva;
  openModal(`${modalHead(`💶 Pago de ${monthLabel(month)}`)}
    <p style="margin-top:-8px"><b>${esc(u.name)}</b> <span class="muted small">· ${esc(getPlan(u.planId)?.name || 'sin tarifa')}</span></p>
    ${p?.status === 'absent' ? '<div class="card small" style="background:var(--surface-2);border-color:transparent;margin-bottom:12px">🏖 Marcado como que <b>no viene este mes</b>. Si al final paga, registra el pago aquí.</div>' : ''}
    <form data-form="payment" data-id="${userId}" data-m="${month}">
      <div class="fields-2">
        <div class="field"><label>Fecha de pago</label><input type="date" name="paidAt" value="${paid && p.paidAt ? String(p.paidAt).slice(0, 10) : dateKey(new Date())}" required></div>
        <div class="field"><label>Forma de pago</label><select name="method">${PAY_METHODS.map(m => `<option ${(paid ? p.method : 'Efectivo') === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="field"><label>Importe (€)</label><input type="number" step="0.01" min="0" name="base" value="${base}" data-pay-preview required></div>
        <div class="field"><label>&nbsp;</label><label class="check" style="margin:10px 0 0"><input type="checkbox" name="iva" ${iva ? 'checked' : ''} data-pay-preview> Sumar IVA (21%)</label></div>
      </div>
      <div class="pay-total"><span>Total cobrado</span><b id="pay-total">${euro(withIva(base, iva))}</b></div>
      <div class="field"><label>Nota (opcional)</label><input name="note" value="${esc(p?.note || '')}" placeholder="p. ej. pagó la mitad, incluye matrícula…"></div>
      <label class="check small"><input type="checkbox" name="saveFee" ${u.fee == null ? 'checked' : ''}> Guardar este importe como su cuota habitual</label>
      ${month >= monthKey() ? '<p class="muted small" style="margin:0 0 8px">Al guardar se le quita el aviso de «cuota pendiente» en su app.</p>' : ''}
      <div class="modal-actions" style="flex-wrap:wrap">
        ${p ? `<button type="button" class="btn danger" data-a="pay-undo" data-id="${p.id}">${paid ? 'Deshacer pago' : 'Quitar «no viene»'}</button>` : ''}
        ${p?.status !== 'absent' ? `<button type="button" class="btn" data-a="pay-absent" data-id="${userId}" data-m="${month}" title="Vacaciones, lesión…: ese mes no paga">🏖 No viene este mes</button>` : ''}
        <button class="btn primary" type="submit">${paid ? 'Guardar cambios' : 'Registrar pago'}</button>
      </div>
    </form>`);
}
document.addEventListener('input', e => {
  if (!e.target.closest('[data-pay-preview]')) return;
  const form = e.target.closest('form');
  const t = $('#pay-total');
  if (form && t) t.textContent = euro(withIva(Number(form.base.value) || 0, form.iva.checked));
});
document.addEventListener('change', e => {
  if (e.target.dataset?.payPreview === undefined) return;
  const form = e.target.closest('form'), t = $('#pay-total');
  if (form && t) t.textContent = euro(withIva(Number(form.base.value) || 0, form.iva.checked));
});

// Excel (CSV) del mes
function exportPaymentsMonth(mk) {
  const cell = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const num = n => String(round2(n)).replace('.', ',');
  const rows = [['Socio', 'Email', 'Teléfono', 'Tarifa', 'Estado', 'Fecha de pago', 'Forma de pago', 'Importe', 'IVA', 'Total', 'Nota']];
  payersFor(mk).sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
    const p = paymentOf(c.id, mk);
    rows.push([c.name, c.email, c.phone, getPlan(c.planId)?.name || '', !p ? 'Pendiente' : p.status === 'absent' ? 'No viene' : 'Pagado',
      p?.paidAt ? String(p.paidAt).slice(0, 10) : '', p?.method || '', p?.status === 'paid' ? num(p.base) : '', p?.status === 'paid' ? num(p.total - p.base) : '', p?.status === 'paid' ? num(p.total) : '', p?.note || '']);
  });
  const s = monthSummary(mk);
  rows.push([], ['TOTAL COBRADO', '', '', '', '', '', '', num(s.base), num(s.ivaTotal), num(s.total)]);
  Object.entries(s.byMethod).forEach(([m, t]) => rows.push([`Total ${m}`, '', '', '', '', '', '', '', '', num(t)]));
  const csv = '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `pagos-${mk}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Importar la copia de seguridad de la app de gestión ----------
const digits9 = s => String(s || '').replace(/\D/g, '').slice(-9);
function openGestionImport() {
  openModal(`${modalHead('⬆️ Importar de la app de gestión')}
    <p class="muted" style="margin-top:-8px">Elige la copia de seguridad que exporta la app de gestión (<b>only-sport-backup-AAAA-MM-DD.json</b>, la que guardas en Google Drive).</p>
    <label class="dropzone" style="display:block;cursor:pointer">
      <input type="file" id="gest-file" accept=".json,application/json" hidden>
      <div style="font-size:28px">📄</div><b>Pulsa para elegir el archivo</b>
    </label>
    <div class="card small" style="margin-top:12px">Se traen <b>los pagos de todos los meses</b>, los meses marcados como «no viene» y la <b>cuota de cada socio</b>.
      Los socios se emparejan con los de esta app por correo, teléfono o nombre; los que no encuentre te los enseño antes de importar.
      Puedes importar varias veces: lo que ya esté se actualiza, no se duplica.</div>`);
}
document.addEventListener('change', async e => {
  if (e.target.id !== 'gest-file' || !e.target.files[0]) return;
  try {
    const data = JSON.parse((await e.target.files[0].text()).replace(/^﻿/, ''));
    if (!Array.isArray(data.members) || typeof data.pagos !== 'object') throw new Error('Este archivo no parece una copia de la app de gestión.');
    prepareGestionImport(data);
  } catch (err) { toast(err.message || 'No se pudo leer el archivo', 'err'); }
});
function prepareGestionImport(data) {
  const pool = realClients();
  const byEmail = new Map(pool.filter(c => c.email).map(c => [c.email.toLowerCase().trim(), c.id]));
  const byPhone = new Map(pool.filter(c => digits9(c.phone).length === 9).map(c => [digits9(c.phone), c.id]));
  const byName = new Map(pool.map(c => [norm2(c.name).replace(/\s+/g, ' ').trim(), c.id]));
  // cuántos pagos tiene cada socio de la copia
  const count = {};
  Object.values(data.pagos || {}).forEach(py => Object.entries(py || {}).forEach(([k, p]) => {
    const id = k.slice(0, k.lastIndexOf('_'));
    if (p && (p.pagado || p.ausente)) count[id] = (count[id] || 0) + 1;
  }));
  const rows = data.members.map(gm => {
    const full = norm2([gm.nombre, gm.apellidos].filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim();
    const match = (gm.email && byEmail.get(gm.email.toLowerCase().trim())) || (digits9(gm.telefono).length === 9 && byPhone.get(digits9(gm.telefono))) || byName.get(full) || null;
    return { gm, match, n: count[gm.id] || 0, how: match ? 'auto' : '' };
  }).filter(r => r.n || r.gm.activo !== false);
  state.gestImport = { data, rows };
  renderGestionPreview();
}
function renderGestionPreview() {
  const { rows } = state.gestImport;
  const auto = rows.filter(r => r.how === 'auto'), rest = rows.filter(r => r.how !== 'auto');
  const nPays = rows.reduce((a, r) => a + r.n, 0);
  const opts = realClients().sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const gName = gm => esc([gm.nombre, gm.apellidos].filter(Boolean).join(' ') || '(sin nombre)');
  openModal(`${modalHead('Revisar antes de importar')}
    <div class="grid-stats" style="grid-template-columns:repeat(3,1fr);margin-bottom:10px">
      <div class="card stat"><div class="v">${rows.length}</div><div class="l">Socios en la copia</div></div>
      <div class="card stat"><div class="v">${auto.length}</div><div class="l">Emparejados solos</div></div>
      <div class="card stat"><div class="v">${nPays}</div><div class="l">Pagos y meses</div></div></div>
    ${rest.length ? `<div class="section-h">Sin emparejar (${rest.length}) · elige qué hacer con cada uno</div>
      <div class="card list" style="max-height:42vh;overflow:auto">${rest.map(r => `<div class="list-item" style="flex-wrap:wrap">
        <div class="grow" style="min-width:160px"><b>${gName(r.gm)}</b><div class="muted small">${esc(r.gm.email || 'sin correo')}${r.gm.telefono ? ' · ' + esc(r.gm.telefono) : ''} · ${r.n} pago(s)${r.gm.activo === false ? ' · de baja' : ''}</div></div>
        <select class="search" style="margin:0;width:auto;max-width:240px" data-gest="${esc(r.gm.id)}">
          <option value="__new" ${r.gm.activo !== false ? 'selected' : ''}>➕ Crear cliente nuevo</option>
          <option value="__skip" ${r.gm.activo === false ? 'selected' : ''}>No importar</option>
          <optgroup label="Es este cliente:">${opts}</optgroup></select></div>`).join('')}</div>` : '<p>✅ Todos los socios se han emparejado.</p>'}
    <details style="margin-top:10px"><summary class="small" style="cursor:pointer">Ver los ${auto.length} emparejados automáticamente</summary>
      <div class="card list small" style="max-height:30vh;overflow:auto;margin-top:6px">${auto.map(r => `<div class="list-item"><span class="grow">${gName(r.gm)}</span><span class="muted">→ ${esc(getUser(r.match).name)}</span></div>`).join('')}</div></details>
    <label class="check small" style="margin-top:12px"><input type="checkbox" id="gest-fee" checked> Copiar también la cuota de cada socio (importe e IVA)</label>
    <div class="modal-actions"><button class="btn" data-a="close">Cancelar</button><button class="btn primary" data-a="gest-run">Importar</button></div>`, 'wide');
}
function runGestionImport() {
  const { data, rows } = state.gestImport;
  const copyFee = $('#gest-fee')?.checked;
  document.querySelectorAll('[data-gest]').forEach(sel => { const r = rows.find(x => x.gm.id === sel.dataset.gest); if (r) r.choice = sel.value; });
  const target = new Map();
  let created = 0, pays = 0, skipped = 0;
  rows.forEach(r => {
    let id = r.how === 'auto' ? r.match : r.choice === '__skip' ? null : r.choice === '__new' ? '' : r.choice;
    if (id === '') {
      id = uid(); created++;
      db.users.push({ id, role: 'client', name: [r.gm.nombre, r.gm.apellidos].filter(Boolean).join(' ').trim() || 'Sin nombre', email: (r.gm.email || '').trim(), phone: (r.gm.telefono || '').trim(),
        active: r.gm.activo !== false, blocked: false, blockedReason: '', weeklyLimit: null, planId: null, credits: null, planExpires: null, weekExtras: {}, imported: true, createdAt: dateKey(new Date()) });
    }
    if (!id) { skipped++; return; }
    target.set(r.gm.id, id);
    if (copyFee && r.gm.cuota !== '' && r.gm.cuota != null && !isNaN(Number(r.gm.cuota))) { const u = getUser(id); u.fee = round2(r.gm.cuota); u.feeIva = !!r.gm.cuotaIva; }
  });
  Object.entries(data.pagos || {}).forEach(([year, py]) => Object.entries(py || {}).forEach(([k, p]) => {
    const i = k.lastIndexOf('_'), gid = k.slice(0, i), mo = Number(k.slice(i + 1));
    const uid_ = target.get(gid);
    if (!uid_ || !p || !(mo >= 1 && mo <= 12) || !/^\d{4}$/.test(year)) return;
    const month = `${year}-${pad(mo)}`;
    const gm = data.members.find(m => m.id === gid) || {};
    if (p.pagado) {
      recordPayment(uid_, month, { paidAt: p.fecha ? String(p.fecha).slice(0, 10) : `${month}-01`, method: p.metodo || 'Efectivo', base: p.base != null ? p.base : (Number(gm.cuota) || 0), iva: p.iva != null ? !!p.iva : !!gm.cuotaIva, note: 'Importado de gestión', noSave: true });
      pays++;
    } else if (p.ausente) { recordPayment(uid_, month, { status: 'absent', note: 'Importado de gestión', noSave: true }); pays++; }
  }));
  saveDB();
  state.gestImport = null;
  closeModal();
  toast(`Importado: ${pays} pagos/meses${created ? ` · ${created} clientes nuevos` : ''}${skipped ? ` · ${skipped} sin importar` : ''}`, 'ok');
  render();
}

Object.assign(actions, {
  'pay-open': d => openPaymentModal(d.id, d.m || monthKey()),
  'pay-month': d => { state.payMonth = Number(d.d) === 0 ? monthKey() : shiftMonth(state.payMonth || monthKey(), Number(d.d)); render(); },
  'pay-month-set': d => { state.payMonth = d.m; render(); },
  'pay-filter': d => { state.payFilter = d.f; render(); },
  'pay-undo': d => { const p = db.payments.find(x => x.id === d.id); undoPayment(d.id); toast(p?.status === 'absent' ? 'Quitado' : 'Pago deshecho', 'ok'); closeModal(); render(); },
  'pay-absent': d => { recordPayment(d.id, d.m, { status: 'absent' }); toast('🏖 Marcado: este mes no viene', 'ok'); closeModal(); render(); },
  'pay-export': d => exportPaymentsMonth(d.m || state.payMonth || monthKey()),
  'pay-import': () => openGestionImport(),
  'gest-run': () => runGestionImport(),
});
Object.assign(forms, {
  payment: (f, form) => {
    const id = form.dataset.id, month = form.dataset.m;
    recordPayment(id, month, { paidAt: f.get('paidAt'), method: f.get('method'), base: Number(f.get('base')) || 0, iva: f.get('iva') === 'on', note: f.get('note').trim(), saveFee: f.get('saveFee') === 'on' });
    toast(`✅ Pago de ${monthLabel(month)} registrado`, 'ok');
    closeModal(); render();
  },
});
