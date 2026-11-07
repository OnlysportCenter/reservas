// ============================================================
// Pagos: cuotas mensuales, totales del mes y del año, exportar e importar desde la app de gestión
// ============================================================
const euro = n => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const capFirst = s => s.charAt(0).toUpperCase() + s.slice(1);
const monthLabel = mk => `${capFirst(monthName(mk))} ${mk.slice(0, 4)}`;
const fmtPayDate = d => { if (!d) return ''; const x = parseKey(String(d).slice(0, 10)); return `${x.getDate()} ${MONTHS[x.getMonth()]}`; };

// Pestaña Pagos: Cuotas · Caja del día · Resumen del mes · Gastos
function viewAdminPayments() {
  const tab = state.payTab || 'quotas';
  const tabs = { quotas: '💶 Cuotas', day: '🧾 Caja del día', month: '📊 Resumen del mes', spend: '📉 Gastos' };
  const mk = state.payMonth || monthKey();
  const head = `<div class="page-title"><h1>Pagos y caja</h1><div class="row wrap">
      <button class="btn" data-a="pay-import">⬆️ Importar de gestión</button>
      ${tab === 'quotas' ? `<button class="btn" data-a="pay-export" data-m="${mk}">⬇️ Excel del mes</button>` : ''}
      ${tab === 'month' ? `<button class="btn" data-a="cash-export" data-m="${mk}">⬇️ Excel del mes</button>` : ''}</div></div>
    <div class="tabs">${Object.entries(tabs).map(([k, l]) => `<button class="${tab === k ? 'active' : ''}" data-a="pay-tab" data-t="${k}">${l}</button>`).join('')}</div>`;
  return head + (tab === 'day' ? viewCashDay() : tab === 'month' ? viewCashMonth() : tab === 'spend' ? viewSpending() : viewPayQuotas());
}

function viewPayQuotas() {
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
    <div class="month-nav">
      <button class="btn ghost" data-a="pay-month" data-d="-1" aria-label="Mes anterior">‹</button>
      <div><b>${monthLabel(mk)}</b>${isCurrent ? '<span class="pill ok" style="margin-left:8px">Mes actual</span>' : `<button class="btn sm ghost" data-a="pay-month" data-d="0">Ir al mes actual</button>`}</div>
      <button class="btn ghost" data-a="pay-month" data-d="1" aria-label="Mes siguiente">›</button>
    </div>
    <div class="grid-stats">
      <div class="card kpi money" style="--k:#1F7A45"><div class="kpi-ic">💶</div><div><div class="v">${euro(sum.total)}</div><div class="l">Cobrado${sum.ivaTotal ? ` · IVA ${euro(sum.ivaTotal)}` : ''}</div></div></div>
      <div class="card kpi money" style="--k:#2F5D8A"><div class="kpi-ic">✅</div><div><div class="v">${sum.paidN}<small style="font-size:15px;color:var(--muted)">/${sum.payers}</small></div><div class="l">Han pagado</div></div></div>
      <div class="card kpi money" style="--k:#E8890C"><div class="kpi-ic">⏳</div><div><div class="v">${sum.pending.length}</div><div class="l">Pendientes · ${euro(sum.expected)}</div></div></div>
      <div class="card kpi money" style="--k:#6D4C9F"><div class="kpi-ic">🏖</div><div><div class="v">${sum.absent}</div><div class="l">No vienen este mes</div></div></div>
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
    <div class="card small" style="margin-top:12px">Se traen <b>los pagos de todos los meses</b>, los meses marcados como «no viene», la <b>cuota de cada socio</b> y los <b>movimientos de caja</b> (ventas y gastos).
      Los socios se emparejan con los de esta app por correo, teléfono o nombre; los que no encuentre te los enseño antes de importar.
      Puedes importar varias veces: lo que ya esté se actualiza, no se duplica.</div>
    ${(() => { const c = gestionImportedCounts(); return c.pays || c.moves || c.users ? `<div class="card small row between wrap" style="margin-top:12px;gap:10px">
      <span>Ya hay importado: <b>${c.pays}</b> pagos/meses, <b>${c.moves}</b> movimientos de caja y <b>${c.users}</b> clientes creados por la importación.</span>
      <button class="btn sm danger" data-a="gest-undo">↩️ Deshacer la importación</button></div>` : ''; })()}`);
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
  // Empareja primero por nombre (lo más fiable si hay familias que comparten correo o teléfono),
  // luego por correo y por teléfono. Un cliente de esta app solo puede recibir a un socio de la copia.
  const taken = new Set();
  const free = id => id && !taken.has(id) ? id : null;
  const rows = data.members.map(gm => {
    const full = norm2([gm.nombre, gm.apellidos].filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim();
    const match = free(byName.get(full)) || (gm.email && free(byEmail.get(gm.email.toLowerCase().trim()))) || (digits9(gm.telefono).length === 9 && free(byPhone.get(digits9(gm.telefono)))) || null;
    if (match) taken.add(match);
    return { gm, match, n: count[gm.id] || 0, how: match ? 'auto' : '' };
  }).filter(r => r.n || r.gm.activo !== false);
  let nMoves = 0;
  Object.values(data.cajaExtra || {}).forEach(py => Object.values(py || {}).forEach(arr => { nMoves += (arr || []).length; }));
  state.gestImport = { data, rows, nMoves };
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
    ${state.gestImport.nMoves ? `<label class="check small"><input type="checkbox" id="gest-cash" checked> Traer también los ${state.gestImport.nMoves} movimientos de caja (ventas y gastos)</label>` : ''}
    <div class="modal-actions"><button class="btn" data-a="close">Cancelar</button><button class="btn primary" data-a="gest-run">Importar</button></div>`, 'wide');
}
function runGestionImport() {
  const { data, rows } = state.gestImport;
  const copyFee = $('#gest-fee')?.checked;
  document.querySelectorAll('[data-gest]').forEach(sel => { const r = rows.find(x => x.gm.id === sel.dataset.gest); if (r) r.choice = sel.value; });
  const target = new Map();
  let created = 0, pays = 0, skipped = 0;
  // correos ya usados (en el servidor no puede haber dos personas con el mismo correo)
  const usedEmails = new Set(db.users.map(u => (u.email || '').toLowerCase().trim()).filter(Boolean));
  const noEmail = [];
  rows.forEach(r => {
    let id = r.how === 'auto' ? r.match : r.choice === '__skip' ? null : r.choice === '__new' ? '' : r.choice;
    if (id === '') {
      id = uid(); created++;
      const name = [r.gm.nombre, r.gm.apellidos].filter(Boolean).join(' ').trim() || 'Sin nombre';
      let email = (r.gm.email || '').trim();
      if (email && usedEmails.has(email.toLowerCase())) { noEmail.push(name); email = ''; }   // correo repetido: se crea sin correo
      if (email) usedEmails.add(email.toLowerCase());
      db.users.push({ id, role: 'client', name, email, phone: (r.gm.telefono || '').trim(), importSource: 'gestion',
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
  // movimientos de caja: se guardan con un id fijo («g-…») para que al reimportar no se dupliquen
  let moves = 0;
  if ($('#gest-cash')?.checked) {
    const have = new Set(db.cashMoves.map(m => m.id));
    Object.values(data.cajaExtra || {}).forEach(py => Object.entries(py || {}).forEach(([day, arr]) => (arr || []).forEach(mv => {
      const id = 'g-' + (mv.id || `${day}-${mv.concepto}-${mv.importe}`);
      if (have.has(id) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
      const amount = round2(Number(mv.importe) || 0);
      if (!amount) return;
      db.cashMoves.push({ id, date: day, concept: mv.concepto || (amount < 0 ? 'Gasto' : 'Ingreso'), method: mv.metodo || 'Efectivo',
        base: round2(mv.base != null ? Number(mv.base) : amount), iva: !!mv.iva, amount, createdAt: mv.hora || `${day}T12:00:00.000Z` });
      have.add(id); moves++;
    })));
  }
  saveDB();
  state.gestImport = null;
  closeModal();
  toast(`Importado: ${pays} pagos/meses${moves ? ` · ${moves} movimientos de caja` : ''}${created ? ` · ${created} clientes nuevos` : ''}${skipped ? ` · ${skipped} sin importar` : ''}`, 'ok');
  render();
  if (noEmail.length) openModal(`${modalHead('Importación hecha')}
    <p>Estos <b>${noEmail.length}</b> clientes nuevos tenían un correo que ya usa otra persona (por ejemplo, familiares con el mismo correo), así que se han creado <b>sin correo</b>:</p>
    <div class="card list small" style="max-height:40vh;overflow:auto">${noEmail.map(n => `<div class="list-item">${esc(n)}</div>`).join('')}</div>
    <p class="muted small">Sus pagos se han importado igual. Si quieres que entren en la app, ponles su propio correo desde Clientes.</p>
    <div class="modal-actions"><button class="btn primary" data-a="close">Entendido</button></div>`);
}

// Deshacer la importación: borra los pagos y movimientos de caja importados y los clientes que creó la importación
function gestionImportedCounts() {
  return {
    pays: db.payments.filter(p => p.note === 'Importado de gestión').length,
    moves: db.cashMoves.filter(m => String(m.id).startsWith('g-')).length,
    users: db.users.filter(u => u.importSource === 'gestion' && !db.bookings.some(b => b.userId === u.id)).length,
  };
}
function undoGestionImport() {
  const ids = new Set(db.users.filter(u => u.importSource === 'gestion' && !db.bookings.some(b => b.userId === u.id)).map(u => u.id));
  db.payments = db.payments.filter(p => p.note !== 'Importado de gestión' && !ids.has(p.userId));
  db.cashMoves = db.cashMoves.filter(m => !String(m.id).startsWith('g-'));
  db.users = db.users.filter(u => !ids.has(u.id));
  db.schedule.forEach(t => { if ((t.members || []).some(id => ids.has(id))) t.members = t.members.filter(id => !ids.has(id)); });
  saveDB();
}

// ============================================================
// Caja: cuotas cobradas cada día (por su fecha de pago) + otros movimientos (ventas y gastos)
// ============================================================
const cashPaysOn = day => db.payments.filter(p => p.status === 'paid' && p.paidAt && String(p.paidAt).slice(0, 10) === day);
const cashMovesOn = day => db.cashMoves.filter(m => String(m.date).slice(0, 10) === day).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
function addCashMove({ date, concept, base, iva, method, spend }) {
  const b = Math.abs(round2(base));
  const amount = withIva(b, iva) * (spend ? -1 : 1);
  db.cashMoves.push({ id: uid(), date, concept, method, base: spend ? -b : b, iva: !!iva, amount: round2(amount), createdAt: new Date().toISOString() });
  saveDB();
}
function deleteCashMove(id) { db.cashMoves = db.cashMoves.filter(m => m.id !== id); saveDB(); }
// Resumen de caja de un periodo: prefix 'AAAA-MM-DD' (día), 'AAAA-MM' (mes) o 'AAAA' (año)
function cashSummary(prefix) {
  const inP = d => d && String(d).slice(0, 10).startsWith(prefix);
  const pays = db.payments.filter(p => p.status === 'paid' && inP(p.paidAt));
  const moves = db.cashMoves.filter(m => inP(m.date));
  const byMethod = {}, byDay = {};
  const add = (met, day, v) => { byMethod[met] = round2((byMethod[met] || 0) + v); byDay[day] = round2((byDay[day] || 0) + v); };
  pays.forEach(p => add(p.method || 'Sin especificar', String(p.paidAt).slice(0, 10), p.total));
  moves.forEach(m => add(m.method || 'Efectivo', String(m.date).slice(0, 10), m.amount));
  const quotas = round2(pays.reduce((a, p) => a + p.total, 0));
  const sales = round2(moves.filter(m => m.amount > 0).reduce((a, m) => a + m.amount, 0));
  const spend = round2(moves.filter(m => m.amount < 0).reduce((a, m) => a + m.amount, 0));
  return { quotas, sales, spend, net: round2(quotas + sales + spend), byMethod, byDay, nPays: pays.length, nMoves: moves.length };
}
const methodChips = bm => Object.keys(bm).length ? `<div class="pay-methods">${PAY_METHODS.concat(Object.keys(bm).filter(m => !PAY_METHODS.includes(m))).filter(m => bm[m]).map(m => `<span class="pay-method"><b>${esc(m)}</b> ${euro(bm[m])}</span>`).join('')}</div>` : '';
const cashKpis = s => `<div class="grid-stats">
  <div class="card kpi money" style="--k:#1F7A45"><div class="kpi-ic">💰</div><div><div class="v">${euro(s.net)}</div><div class="l">Total en caja</div></div></div>
  <div class="card kpi money" style="--k:#2F5D8A"><div class="kpi-ic">💶</div><div><div class="v">${euro(s.quotas)}</div><div class="l">Cuotas (${s.nPays})</div></div></div>
  <div class="card kpi money" style="--k:#6D4C9F"><div class="kpi-ic">🥤</div><div><div class="v">${euro(s.sales)}</div><div class="l">Otras ventas</div></div></div>
  <div class="card kpi money" style="--k:#C0392B"><div class="kpi-ic">📉</div><div><div class="v">${euro(s.spend)}</div><div class="l">Gastos</div></div></div></div>`;
const fmtDayLong = k => { const d = parseKey(k); return `${capFirst(DOW_LONG[d.getDay()])} ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`; };

function viewCashDay() {
  const day = state.cashDate || (state.cashDate = dateKey(new Date()));
  const s = cashSummary(day), pays = cashPaysOn(day), moves = cashMovesOn(day);
  const isToday = day === dateKey(new Date());
  return `
    <div class="month-nav">
      <button class="btn ghost" data-a="cash-day" data-d="-1" aria-label="Día anterior">‹</button>
      <div><b>${fmtDayLong(day)}</b>${isToday ? '<span class="pill ok" style="margin-left:8px">Hoy</span>' : '<button class="btn sm ghost" data-a="cash-day" data-d="0">Ir a hoy</button>'}
        <input type="date" class="search" style="margin:0 0 0 6px;width:auto;padding:6px 8px" value="${day}" data-change="cash-date" aria-label="Elegir fecha"></div>
      <button class="btn ghost" data-a="cash-day" data-d="1" aria-label="Día siguiente">›</button>
    </div>
    ${cashKpis(s)}
    ${methodChips(s.byMethod)}
    <div class="section-h">Cuotas cobradas este día (${pays.length})</div>
    <div class="card list">${pays.length ? pays.map(p => { const u = getUser(p.userId); return `<div class="list-item clickable" data-a="pay-open" data-id="${p.userId}" data-m="${p.month}">
      <div class="avatar">${initials(u?.name || '?')}</div>
      <div class="grow"><div class="ellipsis" style="font-weight:600">${esc(u?.name || 'Socio borrado')}</div><div class="muted small">Cuota de ${monthName(p.month)}${p.month.slice(0, 4) !== day.slice(0, 4) ? ' ' + p.month.slice(0, 4) : ''}${p.iva ? ' · con IVA' : ''}</div></div>
      <span class="pill">${esc(p.method)}</span><b style="min-width:80px;text-align:right">${euro(p.total)}</b></div>`; }).join('')
      : '<div class="empty">Sin cuotas cobradas este día. Las que registres en «Cuotas» aparecen aquí según su fecha de pago.</div>'}</div>
    <div class="section-h">Otros movimientos de caja (${moves.length})</div>
    <div class="card">
      <form data-form="cashmove" data-day="${day}" class="cash-form">
        <div class="row" style="gap:6px;margin-bottom:10px"><label class="tab-radio"><input type="radio" name="kind" value="sale" checked><span>➕ Ingreso</span></label><label class="tab-radio"><input type="radio" name="kind" value="spend"><span>➖ Gasto</span></label></div>
        <div class="row wrap" style="gap:8px">
          <input class="search grow" style="margin:0;min-width:180px" name="concept" placeholder="Concepto (venta de agua, material, luz…)" required>
          <input class="search" style="margin:0;width:120px" name="base" type="number" step="0.01" min="0.01" placeholder="Importe €" required>
          <select class="search" style="margin:0;width:auto" name="method">${PAY_METHODS.map(m => `<option>${m}</option>`).join('')}</select>
          <label class="check" style="margin:0"><input type="checkbox" name="iva"> IVA 21%</label>
          <button class="btn primary" type="submit">Añadir</button>
        </div>
        <div class="row wrap" style="gap:8px;margin-top:10px">
          <button type="button" class="btn sm" data-a="cash-quick" data-c="Agua / bebida" data-k="sale">🥤 Agua / bebida</button>
          <button type="button" class="btn sm" data-a="cash-quick" data-c="Matrícula" data-k="sale">📝 Matrícula</button>
          <button type="button" class="btn sm" data-a="cash-quick" data-c="" data-k="spend">📉 Gasto rápido</button>
        </div>
      </form>
      ${moves.length ? `<div class="list" style="margin-top:12px;border-top:1px solid var(--border)">${moves.map(m => `<div class="list-item">
        <div class="grow"><div style="font-weight:600">${esc(m.concept || (m.amount < 0 ? 'Gasto' : 'Ingreso'))}</div><div class="muted small">${esc(m.method)}${m.iva ? ' · con IVA' : ''}</div></div>
        <b style="color:${m.amount < 0 ? 'var(--danger)' : 'var(--ok)'}">${m.amount < 0 ? '' : '+'}${euro(m.amount)}</b>
        <button class="btn sm ghost" data-a="cash-del" data-id="${m.id}" title="Eliminar">${icon('x', 'width="16" height="16"')}</button></div>`).join('')}</div>`
        : '<p class="muted small" style="margin:12px 0 0">Sin movimientos este día. Aquí van las ventas sueltas y los gastos de caja.</p>'}
    </div>`;
}

function viewCashMonth() {
  const mk = state.payMonth || (state.payMonth = monthKey());
  const s = cashSummary(mk);
  const days = Object.keys(s.byDay).sort();
  const isCurrent = mk === monthKey();
  return `
    <div class="month-nav">
      <button class="btn ghost" data-a="pay-month" data-d="-1" aria-label="Mes anterior">‹</button>
      <div><b>${monthLabel(mk)}</b>${isCurrent ? '<span class="pill ok" style="margin-left:8px">Mes actual</span>' : '<button class="btn sm ghost" data-a="pay-month" data-d="0">Ir al mes actual</button>'}</div>
      <button class="btn ghost" data-a="pay-month" data-d="1" aria-label="Mes siguiente">›</button>
    </div>
    ${cashKpis(s)}
    ${methodChips(s.byMethod)}
    <p class="muted small" style="margin:-4px 0 12px">Cuenta el dinero por el día en que entró: una cuota de noviembre pagada el 30 de octubre suma en octubre.</p>
    <div class="section-h">Día a día</div>
    <div class="card list">${days.length ? days.map(d => { const ds = cashSummary(d); return `<div class="list-item clickable" data-a="cash-goto" data-d="${d}">
      <div class="grow"><b>${fmtDayLong(d)}</b><div class="muted small">${ds.nPays} cuota(s)${ds.nMoves ? ` · ${ds.nMoves} movimiento(s)` : ''}${ds.spend ? ` · gastos ${euro(ds.spend)}` : ''}</div></div>
      <b>${euro(s.byDay[d])}</b><span class="muted">›</span></div>`; }).join('') : '<div class="empty">Sin dinero registrado este mes.</div>'}</div>`;
}

function viewSpending() {
  const y = state.spendYear || (state.spendYear = String(new Date().getFullYear()));
  const list = db.cashMoves.filter(m => m.amount < 0 && String(m.date).startsWith(y)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const total = round2(list.reduce((a, m) => a + m.amount, 0));
  const byMonth = {};
  list.forEach(m => (byMonth[String(m.date).slice(0, 7)] = byMonth[String(m.date).slice(0, 7)] || []).push(m));
  const ys = cashSummary(y);
  return `
    <div class="month-nav">
      <button class="btn ghost" data-a="spend-year" data-d="-1" aria-label="Año anterior">‹</button>
      <div><b>${y}</b></div>
      <button class="btn ghost" data-a="spend-year" data-d="1" aria-label="Año siguiente">›</button>
    </div>
    <div class="grid-stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="card kpi money" style="--k:#C0392B"><div class="kpi-ic">📉</div><div><div class="v">${euro(total)}</div><div class="l">Gastos de ${y}</div></div></div>
      <div class="card kpi money" style="--k:#2F5D8A"><div class="kpi-ic">💶</div><div><div class="v">${euro(round2(ys.quotas + ys.sales))}</div><div class="l">Ingresos de ${y}</div></div></div>
      <div class="card kpi money" style="--k:#1F7A45"><div class="kpi-ic">💰</div><div><div class="v">${euro(ys.net)}</div><div class="l">Balance de ${y}</div></div></div>
    </div>
    <p class="muted small" style="margin:-4px 0 12px">Los gastos se apuntan en «Caja del día» con «➖ Gasto».</p>
    ${Object.keys(byMonth).length ? Object.keys(byMonth).sort().reverse().map(m => `
      <div class="section-h row between"><span>${monthLabel(m)}</span><span style="color:var(--danger)">${euro(round2(byMonth[m].reduce((a, x) => a + x.amount, 0)))}</span></div>
      <div class="card list">${byMonth[m].map(g => `<div class="list-item">
        <div class="grow clickable" data-a="cash-goto" data-d="${String(g.date).slice(0, 10)}"><div style="font-weight:600">${esc(g.concept || 'Gasto')}</div><div class="muted small">${fmtDateShort(String(g.date).slice(0, 10))} · ${esc(g.method)}</div></div>
        <b style="color:var(--danger)">${euro(g.amount)}</b>
        <button class="btn sm ghost" data-a="cash-del" data-id="${g.id}" title="Eliminar">${icon('x', 'width="16" height="16"')}</button></div>`).join('')}</div>`).join('')
      : '<div class="card empty">Sin gastos registrados en ' + y + '.</div>'}`;
}

function exportCashMonth(mk) {
  const cell = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const num = n => String(round2(n)).replace('.', ',');
  const rows = [['Fecha', 'Tipo', 'Concepto', 'Forma de pago', 'Importe', 'IVA', 'Total']];
  const items = [
    ...db.payments.filter(p => p.status === 'paid' && String(p.paidAt || '').startsWith(mk)).map(p => [String(p.paidAt).slice(0, 10), 'Cuota', `${getUser(p.userId)?.name || '?'} · cuota ${monthName(p.month)}`, p.method, p.base, round2(p.total - p.base), p.total]),
    ...db.cashMoves.filter(m => String(m.date).startsWith(mk)).map(m => [String(m.date).slice(0, 10), m.amount < 0 ? 'Gasto' : 'Ingreso', m.concept, m.method, m.base, round2(m.amount - m.base), m.amount]),
  ].sort((a, b) => a[0].localeCompare(b[0]));
  items.forEach(r => rows.push([r[0], r[1], r[2], r[3], num(r[4]), num(r[5]), num(r[6])]));
  const s = cashSummary(mk);
  rows.push([], ['', '', 'Cuotas', '', '', '', num(s.quotas)], ['', '', 'Otras ventas', '', '', '', num(s.sales)], ['', '', 'Gastos', '', '', '', num(s.spend)], ['', '', 'TOTAL EN CAJA', '', '', '', num(s.net)]);
  Object.entries(s.byMethod).forEach(([m, t]) => rows.push(['', '', `Total ${m}`, '', '', '', num(t)]));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `caja-${mk}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
document.addEventListener('change', e => {
  if (e.target.dataset?.change === 'cash-date' && e.target.value) { state.cashDate = e.target.value; render(); }
});

Object.assign(actions, {
  'pay-tab': d => { state.payTab = d.t; render(); },
  'cash-day': d => { state.cashDate = Number(d.d) === 0 ? dateKey(new Date()) : dateKey(addDays(parseKey(state.cashDate || dateKey(new Date())), Number(d.d))); render(); },
  'cash-goto': d => { state.cashDate = d.d; state.payTab = 'day'; render(); window.scrollTo(0, 0); },
  'cash-quick': d => {
    const f = document.querySelector('[data-form="cashmove"]'); if (!f) return;
    f.querySelector(`[name=kind][value="${d.k}"]`).checked = true;
    f.concept.value = d.c; (d.c ? f.base : f.concept).focus();
  },
  'cash-del': d => confirmModal('Eliminar movimiento', 'Se borrará este movimiento de caja. No se puede deshacer.', `data-a="cash-del-ok" data-id="${d.id}"`, 'Eliminar'),
  'cash-del-ok': d => { deleteCashMove(d.id); closeModal(); toast('Movimiento eliminado', 'ok'); render(); },
  'cash-export': d => exportCashMonth(d.m || state.payMonth || monthKey()),
  'spend-year': d => { state.spendYear = String(Number(state.spendYear || new Date().getFullYear()) + Number(d.d)); render(); },
});
Object.assign(forms, {
  cashmove: (f, form) => {
    const base = Number(f.get('base'));
    if (!f.get('concept').trim() || !base) return toast('Pon un concepto y un importe', 'err');
    addCashMove({ date: form.dataset.day, concept: f.get('concept').trim(), base, iva: f.get('iva') === 'on', method: f.get('method'), spend: f.get('kind') === 'spend' });
    toast(f.get('kind') === 'spend' ? '📉 Gasto apuntado' : '➕ Ingreso apuntado', 'ok');
    render();
  },
});

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
  'gest-undo': () => { const c = gestionImportedCounts(); confirmModal('Deshacer la importación',
    `Se borrarán ${c.pays} pagos/meses importados, ${c.moves} movimientos de caja importados y ${c.users} clientes que creó la importación. Lo que hayas apuntado tú a mano en esta app no se toca. No se puede deshacer.`,
    'data-a="gest-undo-ok"', 'Borrar lo importado'); },
  'gest-undo-ok': () => { undoGestionImport(); closeModal(); toast('Importación deshecha', 'ok'); render(); },
});
Object.assign(forms, {
  payment: (f, form) => {
    const id = form.dataset.id, month = form.dataset.m;
    recordPayment(id, month, { paidAt: f.get('paidAt'), method: f.get('method'), base: Number(f.get('base')) || 0, iva: f.get('iva') === 'on', note: f.get('note').trim(), saveFee: f.get('saveFee') === 'on' });
    toast(`✅ Pago de ${monthLabel(month)} registrado`, 'ok');
    closeModal(); render();
  },
});
