// ============================================================
//  IMPORTAR CLIENTES desde CSV / Excel / JSON
//  (p. ej. la lista de clientes exportada desde Bookyway u otra app)
//  - Detecta las columnas automáticamente (se pueden corregir a mano)
//  - Asigna tarifas y grupos fijos a partir de los horarios del archivo
// ============================================================

const imp = { rows: [], cols: [], map: {}, planMap: {}, fileName: '', opts: { update: true, email: false, blockDebt: true, defaultPlan: '' } };

// Campos de la app y nombres de columna habituales para reconocerlos
const IMP_FIELDS = [
  { key: 'name', label: 'Nombre (o nombre completo)', req: true, syn: ['nombre', 'name', 'first name', 'firstname', 'nombre completo', 'full name', 'cliente', 'socio', 'alumno', 'usuario'] },
  { key: 'last', label: 'Apellidos', syn: ['apellidos', 'apellido', 'last name', 'lastname', 'surname', 'apellido 1', 'primer apellido', 'name last', 'nombre apellidos', 'last'] },
  { key: 'last2', label: 'Segundo apellido', syn: ['apellido 2', 'segundo apellido'] },
  { key: 'alias', label: 'Alias (si el nombre es genérico)', syn: ['alias', 'apodo', 'nickname', 'nick'] },
  { key: 'email', label: 'Email', syn: ['email', 'e-mail', 'e mail', 'correo', 'correo electronico', 'mail'] },
  { key: 'phone', label: 'Teléfono', syn: ['telefono', 'tel', 'phone', 'movil', 'mobile', 'celular', 'telefono movil'] },
  { key: 'plan', label: 'Tarifa / cuota', syn: ['tarifa', 'cuota', 'plan', 'abono', 'bono', 'suscripcion', 'membership', 'modalidad', 'tipo de cuota'] },
  { key: 'groups', label: 'Horarios / grupos', syn: ['grupos', 'grupo', 'horario', 'horarios', 'clases', 'clase', 'dias', 'turno', 'turnos', 'schedule'] },
  { key: 'debt', label: 'Deuda', syn: ['deuda', 'debt', 'pendiente de pago', 'importe pendiente'] },
  { key: 'badEmail', label: 'Email inválido (S/N)', syn: ['email invalido', 'invalid email', 'email no valido'] },
];
// palabras que no son un nombre real (p. ej. Bookyway pone "Usuario 2" o el alias "Administrador")
const GENERIC_NAMES = ['usuario', 'user', 'cliente', 'socio', 'administrador', 'admin'];

const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- Lectura de archivos ----------
async function readImportFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') return readExcel(file);
  let text = await file.text();
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(await file.arrayBuffer()); // CSV de Excel en Windows
  text = text.replace(/^﻿/, '');
  if (ext === 'json' || /^\s*[\[{]/.test(text)) return parseJSONRows(text);
  return parseCSV(text);
}

function parseJSONRows(text) {
  let data = JSON.parse(text);
  // admite: [ {...}, ... ]  ó  { "clientes": [ ... ] }  ó  { "data": { "users": [ ... ] } }
  const findArray = o => {
    if (Array.isArray(o)) return o;
    if (o && typeof o === 'object') for (const k of Object.keys(o)) { const r = findArray(o[k]); if (r && r.length && typeof r[0] === 'object') return r; }
    return null;
  };
  const arr = findArray(data) || [];
  return arr.map(o => flatten(o));
}
// {nombre:{first:'A'}} -> {'nombre first':'A'} ; arrays de horarios -> texto separado por comas
function flatten(o, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(o || {})) {
    const key = prefix ? `${prefix} ${k}` : k;
    if (Array.isArray(v)) out[key] = v.map(x => typeof x === 'object' ? Object.values(x).join(' ') : x).join(', ');
    else if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v ?? '';
  }
  return out;
}

function parseCSV(text) {
  const first = text.split(/\r?\n/)[0] || '';
  const delim = [';', ',', '\t', '|'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter(r => r.some(x => String(x).trim()));
  if (!clean.length) return [];
  const head = clean[0].map((h, i) => String(h).trim() || `Columna ${i + 1}`);
  return clean.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function loadSheetJS() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar el lector de Excel (¿sin internet?). Guarda el archivo como CSV y vuelve a intentarlo.'));
    document.head.appendChild(s);
  });
}
async function readExcel(file) {
  await loadSheetJS();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'dd/mm/yyyy' });
}

// ---------- Detección automática ----------
function guessMapping(cols) {
  const map = {}, used = new Set();
  const n = cols.map(c => [c, norm(c)]);
  // 1ª pasada: coincidencia exacta del título
  IMP_FIELDS.forEach(f => {
    const hit = n.find(([c, nc]) => !used.has(c) && f.syn.map(norm).includes(nc));
    if (hit) { map[f.key] = hit[0]; used.add(hit[0]); }
  });
  // 2ª pasada: el título contiene la palabra (los más específicos primero, p. ej. "fecha fin cuota" antes que "cuota")
  ['badEmail', 'debt', 'groups', 'phone', 'email', 'alias', 'last2', 'last', 'name', 'plan'].forEach(k => {
    if (map[k]) return;
    const f = IMP_FIELDS.find(x => x.key === k);
    const hit = n.find(([c, nc]) => !used.has(c) && f.syn.some(s => s.length > 3 && nc.includes(norm(s))));
    if (hit) { map[k] = hit[0]; used.add(hit[0]); }
  });
  return map;
}
function guessPlan(value) {
  const v = norm(value);
  if (!v) return '';
  const exact = db.plans.find(p => norm(p.name) === v);
  if (exact) return exact.id;
  const num = (v.match(/\d+/) || [])[0];
  const weekly = db.plans.filter(p => p.type === 'weekly');
  if (num && /(dia|semana|sem|x)/.test(v)) { const p = weekly.find(p => String(p.perWeek) === num); if (p) return p.id; }
  if (/suelta|puntual|1 clase/.test(v)) { const p = db.plans.find(p => /suelta/i.test(p.name)); if (p) return p.id; }
  if (num) { const p = weekly.find(p => String(p.perWeek) === num); if (p) return p.id; }
  return '';
}

// ---------- Interpretar horarios ("Lunes y miércoles 19:00 Halterofilia", "L-X-V 7:00", ...) ----------
const DAY_WORDS = { lunes: 1, lun: 1, martes: 2, mar: 2, miercoles: 3, mie: 3, mier: 3, jueves: 4, jue: 4, viernes: 5, vie: 5, sabado: 6, sab: 6, domingo: 0, dom: 0,
  monday: 1, mon: 1, tuesday: 2, tue: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6, sunday: 0, sun: 0 };
const DAY_LETTERS = { l: 1, m: 2, x: 3, j: 4, v: 5, s: 6, d: 0 };

function parseGroups(text) {
  const result = { slots: [], unmatched: [] };
  // aquí no se quitan guiones ni puntos: hacen falta para "L-X-V" y "19.00"
  const raw = String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  if (!raw) return result;
  const segments = raw.split(/[,;|\n]+/).map(s => s.trim()).filter(Boolean);
  let pendingDays = [], pendingClass = null, pendingText = [];
  const flush = (time, ct, label) => {
    const days = [...new Set(pendingDays)];
    days.forEach(w => {
      let cands = db.schedule.filter(t => t.weekday === w && t.time === time);
      if (ct) { const f = cands.filter(t => t.classTypeId === ct); if (f.length) cands = f; }
      if (cands.length) result.slots.push(cands[0].id);
      else result.unmatched.push(`${DOW[w]} ${time}${ct ? ' ' + getClassType(ct).name : ''}`);
    });
    if (!days.length) result.unmatched.push(label);
    pendingDays = []; pendingClass = null; pendingText = [];
  };
  segments.forEach(seg => {
    pendingText.push(seg);
    // días con palabra completa o abreviada
    (seg.match(/[a-z]+/g) || []).forEach(w => { if (DAY_WORDS[w] !== undefined) pendingDays.push(DAY_WORDS[w]); });
    // días con letras: "l-x-v", "l/x", "lxv", "l y x"
    const letters = seg.match(/\b([lmxjvsd](?:\s*(?:[-\/+]|y)?\s*[lmxjvsd])*)\b/g);
    (letters || []).forEach(g => { const ls = g.replace(/[^lmxjvsd]/g, ''); if (ls.length >= 1 && (ls.length > 1 || /^[lmxjvsd]$/.test(g.trim()))) ls.split('').forEach(c => pendingDays.push(DAY_LETTERS[c])); });
    const ct = db.classTypes.find(c => seg.includes(norm(c.name)));
    if (ct) pendingClass = ct.id;
    const tm = seg.match(/\b(\d{1,2})\s*(?:[:.h]\s*(\d{2})?|\s*(?=h\b))/) || seg.match(/\b(\d{1,2})\s*(?:am|pm)\b/);
    if (tm) {
      let h = Number(tm[1]); const m = tm[2] || '00';
      if (/pm\b/.test(seg) && h < 12) h += 12;
      flush(`${pad(h)}:${m}`, pendingClass, pendingText.join(', '));
    }
  });
  if (pendingDays.length || pendingText.length) result.unmatched.push(pendingText.join(', ') + ' (sin hora)');
  result.slots = [...new Set(result.slots)];
  return result;
}

function parseDateAny(v) {
  if (v === '' || v == null) return null;
  if (v instanceof Date && !isNaN(v)) return dateKey(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return dateKey(new Date(y, Number(m[2]) - 1, Number(m[1]))); }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return dateKey(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (/^\d{5}$/.test(s)) return dateKey(new Date(Math.round((Number(s) - 25569) * 86400000))); // fecha numérica de Excel
  return null;
}

// ---------- Construir cada cliente a partir de una fila ----------
function rowToClient(r) {
  const g = k => imp.map[k] ? String(r[imp.map[k]] ?? '').trim() : '';
  let name = [g('name'), g('last'), g('last2')].filter(Boolean).join(' ').replace(/\s+/g, ' ');
  // nombre genérico ("Usuario 2") → usar el alias si parece un nombre real
  const alias = g('alias');
  const generic = !g('name') || GENERIC_NAMES.includes(norm(g('name'))) || /^\d+$/.test(g('last'));
  if (generic && alias && !GENERIC_NAMES.includes(norm(alias))) name = alias;
  const debt = parseFloat(String(g('debt')).replace(',', '.')) || 0;
  const badEmail = /^(y|s|si|yes|true|1)$/i.test(norm(g('badEmail')));
  const email = g('email').toLowerCase();
  const planRaw = g('plan');
  const planId = planRaw ? (imp.planMap[planRaw] ?? '') : '';
  const groups = imp.map.groups ? parseGroups(g('groups')) : { slots: [], unmatched: [] };
  const expires = parseDateAny(imp.map.expires ? r[imp.map.expires] : '');
  const existing = email ? db.users.find(u => u.email.toLowerCase() === email) : db.users.find(u => u.role === 'client' && norm(u.name) === norm(name));
  const errors = [];
  if (!name) errors.push('sin nombre');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('email no válido');
  // la cuenta de administrador de Bookyway (alias "Administrador") no se importa como cliente
  const isAdminRow = ['administrador', 'admin', 'administrator'].includes(norm(alias));
  if (isAdminRow) errors.length = 0;
  const status = isAdminRow ? 'skip' : errors.length ? 'error' : existing ? (existing.role === 'admin' || !imp.opts.update ? 'skip' : 'update') : 'new';
  return { name, email, phone: g('phone'), planId, planRaw, groups, expires, existing, status, errors, debt, badEmail, generic: generic && name !== alias };
}

// ---------- Pantalla ----------
function openImport() {
  imp.rows = []; imp.cols = []; imp.map = {}; imp.planMap = {}; imp.fileName = '';
  renderImport();
}
function renderImport() {
  // al cambiar una opción se redibuja sin perder la posición ni repetir la animación
  const prevScroll = $('.modal')?.scrollTop;
  const wasOpen = !!$('.modal .imp-table');
  renderImportInner();
  const m = $('.modal');
  if (m && wasOpen) { m.style.animation = 'none'; m.parentElement.style.animation = 'none'; m.scrollTop = prevScroll || 0; }
}
function renderImportInner() {
  if (!imp.rows.length) {
    openModal(`${modalHead('Importar clientes')}
      <p>Sube la lista de clientes que ya tienes: <b>Excel (.xlsx)</b>, <b>CSV</b> o <b>JSON</b>. Sirve el archivo que exportes desde Bookyway u otra aplicación.</p>
      ${(db.settings.importLog || []).length || importDays().length ? `<div class="card small row between wrap" style="gap:10px;margin-bottom:12px"><span>¿Te has equivocado de archivo?</span><button class="btn sm danger" data-a="imp-undo-list">↩️ Deshacer una importación</button></div>` : ''}
      <label class="dropzone" id="imp-drop">
        <input type="file" id="imp-file" accept=".csv,.json,.xlsx,.xls,.txt" hidden>
        <div style="font-size:28px">📄</div><b>Pulsa para elegir el archivo</b><div class="muted small">o arrástralo aquí</div>
      </label>
      <div class="card small" style="margin-top:12px">
        <b>Consejos</b><br>
        · La primera fila debe tener los títulos de las columnas (Nombre, Email, Teléfono, Tarifa…).<br>
        · Si incluyes una columna de <b>horarios</b> (p. ej. <i>"Lunes y Miércoles 19:00"</i> o <i>"L-X-V 7:00"</i>), cada cliente se añadirá a esos <b>grupos fijos</b> y se le reservarán sus clases.<br>
        · Los clientes que ya existan (mismo email) se pueden actualizar en vez de duplicarse.
      </div>
      <div class="modal-actions"><button class="btn" data-a="imp-template">⬇️ Descargar plantilla de ejemplo</button></div>`);
    const inp = $('#imp-file'), drop = $('#imp-drop');
    inp.addEventListener('change', () => inp.files[0] && handleImportFile(inp.files[0]));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); e.dataTransfer.files[0] && handleImportFile(e.dataTransfer.files[0]); });
    return;
  }
  const parsed = imp.rows.map(rowToClient);
  const cnt = k => parsed.filter(p => p.status === k).length;
  const groupsTotal = parsed.filter(p => p.status === 'new' || p.status === 'update').reduce((a, p) => a + p.groups.slots.length, 0);
  const unmatched = [...new Set(parsed.flatMap(p => p.groups.unmatched))];
  // grupos que quedarían por encima del aforo
  const proj = {};
  db.schedule.forEach(t => proj[t.id] = new Set(t.members));
  parsed.filter(p => p.status === 'new' || p.status === 'update').forEach((p, i) => p.groups.slots.forEach(sid => proj[sid].add(p.existing?.id || 'new' + i)));
  const over = db.schedule.filter(t => proj[t.id].size > slotCapacity(t))
    .map(t => `${slotLabel(t)} (${proj[t.id].size}/${slotCapacity(t)})`);
  const planValues = imp.map.plan ? [...new Set(imp.rows.map(r => String(r[imp.map.plan] ?? '').trim()).filter(Boolean))] : [];
  const colOpts = sel => `<option value="">— No importar —</option>${imp.cols.map(c => `<option value="${esc(c)}" ${sel === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}`;
  const st = { new: '<span class="pill ok">Nuevo</span>', update: '<span class="pill warn">Actualizar</span>', skip: '<span class="pill">Ya existe</span>', error: '<span class="pill danger">Error</span>' };
  openModal(`${modalHead('Importar clientes')}
    <p class="muted" style="margin-top:-8px">📄 ${esc(imp.fileName)} · ${imp.rows.length} filas</p>

    <div class="section-h">1 · Columnas del archivo</div>
    <p class="muted small" style="margin-top:-4px">Las hemos detectado automáticamente. Corrige las que no estén bien.</p>
    <div class="fields-2">${IMP_FIELDS.map(f => `<div class="field"><label>${f.label}${f.req ? ' *' : ''}</label><select data-imp-map="${f.key}">${colOpts(imp.map[f.key])}</select></div>`).join('')}</div>

    ${planValues.length ? `<div class="section-h">2 · Tarifas</div>
    <p class="muted small" style="margin-top:-4px">Elige qué tarifa de la app corresponde a cada valor del archivo.</p>
    <div class="card list">${planValues.map(v => `<div class="list-item"><div class="grow ellipsis">"${esc(v)}" <span class="muted small">· ${imp.rows.filter(r => String(r[imp.map.plan]).trim() === v).length} clientes</span></div>
      <select class="search" style="margin:0;width:auto;max-width:55%" data-imp-plan="${esc(v)}"><option value="">Sin tarifa</option>${db.plans.map(p => `<option value="${p.id}" ${imp.planMap[v] === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>`).join('')}</div>` : ''}

    <div class="section-h">${planValues.length ? 3 : 2} · Opciones</div>
    <label class="check"><input type="checkbox" data-imp-opt="update" ${imp.opts.update ? 'checked' : ''}> Si el cliente ya existe (mismo email), actualizar sus datos</label>
    <label class="check"><input type="checkbox" data-imp-opt="email" ${imp.opts.email ? 'checked' : ''}> ✉️ Enviar correo de bienvenida a los clientes nuevos</label>
    ${imp.map.debt ? `<label class="check"><input type="checkbox" data-imp-opt="blockDebt" ${imp.opts.blockDebt ? 'checked' : ''}> 🔒 Bloquear a los clientes que tengan deuda (${parsed.filter(p => p.debt > 0 && p.status !== 'error' && p.status !== 'skip').length})</label>` : ''}
    <div class="field"><label>Tarifa para los clientes que no traen tarifa en el archivo</label>
      <select data-imp-default-plan><option value="">Sin tarifa (la asigno después)</option>${db.plans.map(p => `<option value="${p.id}" ${imp.opts.defaultPlan === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>

    <div class="section-h">Vista previa</div>
    <div class="row wrap" style="margin-bottom:8px">
      <span class="pill ok">${cnt('new')} nuevos</span><span class="pill warn">${cnt('update')} a actualizar</span>
      ${cnt('skip') ? `<span class="pill">${cnt('skip')} se omiten (ya existen o son administrador)</span>` : ''}${cnt('error') ? `<span class="pill danger">${cnt('error')} con errores</span>` : ''}
      ${imp.map.groups ? `<span class="pill">📅 ${groupsTotal} plazas en grupos</span>` : ''}
      ${parsed.some(p => p.debt > 0) ? `<span class="pill danger">${parsed.filter(p => p.debt > 0).length} con deuda</span>` : ''}
      ${parsed.some(p => p.badEmail) ? `<span class="pill warn">${parsed.filter(p => p.badEmail).length} email inválido</span>` : ''}
    </div>
    ${!imp.map.plan && !imp.map.groups ? `<div class="card small" style="background:var(--info-bg);border-color:transparent;margin-bottom:8px">ℹ️ Este archivo no trae la <b>tarifa</b> ni los <b>horarios</b> de cada cliente (Bookyway no los exporta). Después de importar podrás asignarlos rápido a muchos a la vez: tarifas desde <b>Clientes › Seleccionar</b> y grupos desde <b>Clases › Horario semanal</b> (pulsando cada horario).</div>` : ''}
    ${parsed.some(p => p.generic) ? `<p class="small" style="color:var(--warn)">${parsed.filter(p => p.generic).length} clientes tienen un nombre genérico (p. ej. "Usuario 2") y no tienen alias: revísalos después.</p>` : ''}
    ${unmatched.length ? `<div class="card small" style="background:var(--warn-bg);border-color:transparent;margin-bottom:8px">⚠️ Horarios que no coinciden con ninguna clase del horario semanal (no se asignarán): <b>${unmatched.slice(0, 12).map(esc).join(' · ')}</b>${unmatched.length > 12 ? '…' : ''}<br>Revisa que existan en Clases › Horario semanal, o asígnalos después a mano.</div>` : ''}
    ${over.length ? `<div class="card small" style="background:var(--danger-bg);border-color:transparent;margin-bottom:8px">👥 Estos grupos quedarán <b>por encima del aforo</b>: ${over.map(esc).join(' · ')}.<br>Se importarán igualmente; puedes subir el aforo o mover a alguien de grupo después.</div>` : ''}
    ${parsed.some(p => !p.email && p.status !== 'error') ? '<p class="small" style="color:var(--warn)">Algunos clientes no tienen email: se importarán, pero no podrán entrar en la app hasta que se lo añadas.</p>' : ''}
    <div class="table-wrap"><table class="imp-table"><thead><tr><th></th><th>Nombre</th><th>Email</th><th>Tarifa</th><th>Grupos</th></tr></thead><tbody>
      ${parsed.slice(0, 50).map(p => `<tr><td>${st[p.status]}</td><td>${esc(p.name) || '<i class="muted">—</i>'}${p.errors.length ? `<div class="small" style="color:var(--danger)">${p.errors.join(', ')}</div>` : ''}${p.debt > 0 ? `<div class="small" style="color:var(--danger)">Deuda: ${p.debt} €</div>` : ''}</td>
        <td class="small">${esc(p.email) || '<i class="muted">sin email</i>'}${p.badEmail ? '<div style="color:var(--warn)">⚠️ inválido</div>' : ''}</td><td class="small">${esc(getPlan(p.planId)?.name || (p.planRaw ? '⚠️ ' + p.planRaw : '—'))}</td>
        <td class="small">${p.groups.slots.map(id => esc(slotLabel(getSlot(id)))).join('<br>') || '—'}${p.groups.unmatched.length ? `<div style="color:var(--warn)">${p.groups.unmatched.map(esc).join(', ')}</div>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    ${parsed.length > 50 ? `<p class="muted small">Mostrando 50 de ${parsed.length}.</p>` : ''}
    <div class="modal-actions"><button class="btn" data-a="imp-reset">Elegir otro archivo</button>
      <button class="btn primary" data-a="imp-run" ${!imp.map.name || !(cnt('new') + cnt('update')) ? 'disabled' : ''}>Importar ${cnt('new') + cnt('update')} clientes</button></div>`);
}

async function handleImportFile(file) {
  try {
    toast('Leyendo archivo…');
    const rows = await readImportFile(file);
    if (!rows.length) return toast('No hemos encontrado clientes en el archivo.', 'err');
    imp.rows = rows; imp.fileName = file.name;
    imp.cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    imp.map = guessMapping(imp.cols);
    autoPlanMap();
    renderImport();
  } catch (e) {
    console.error(e);
    toast('No se pudo leer el archivo: ' + e.message, 'err');
  }
}
function autoPlanMap() {
  imp.planMap = {};
  if (!imp.map.plan) return;
  [...new Set(imp.rows.map(r => String(r[imp.map.plan] ?? '').trim()).filter(Boolean))].forEach(v => imp.planMap[v] = guessPlan(v));
}

function runImport() {
  const parsed = imp.rows.map(rowToClient).filter(p => p.status === 'new' || p.status === 'update');
  const res = { created: 0, updated: 0, groups: 0, reserved: 0 };
  // registro para poder deshacer esta importación
  const log = { id: uid(), at: new Date().toISOString(), file: imp.fileName, created: [], updated: [], groupAdds: [] };
  parsed.forEach(p => {
    let u = p.existing;
    if (u) {
      log.updated.push({ id: u.id, before: { name: u.name, phone: u.phone, emailInvalid: !!u.emailInvalid, blocked: !!u.blocked, blockedReason: u.blockedReason || '', planId: u.planId ?? null, credits: u.credits ?? null, planExpires: u.planExpires ?? null } });
      u.name = p.name || u.name;
      if (p.phone) u.phone = p.phone;
      res.updated++;
    } else {
      u = { id: uid(), role: 'client', active: true, blocked: false, blockedReason: '', weeklyLimit: null, weekExtras: {}, planId: null, credits: 0, planExpires: null,
        createdAt: dateKey(new Date()), name: p.name, email: p.email, phone: p.phone, imported: true };
      db.users.push(u);
      log.created.push(u.id);
      res.created++;
      if (imp.opts.email && p.email) sendEmail(u.id, `Bienvenid@ a ${db.settings.centerName}`, `Hola ${p.name.split(' ')[0]},\n\nYa tienes acceso a la app de reservas de ${db.settings.centerName}. Entra con este email (${p.email}) para ver tus clases, quitarte si vas a faltar o apuntarte a la lista de espera.\n\n${db.settings.centerName}`);
    }
    if (p.badEmail) u.emailInvalid = true;
    if (p.debt > 0 && imp.opts.blockDebt && !u.blocked) { u.blocked = true; u.blockedReason = `Deuda pendiente de ${p.debt} €`; res.blocked = (res.blocked || 0) + 1; }
    const planId = p.planId || (!p.existing?.planId ? imp.opts.defaultPlan : '');
    if (planId) {
      const plan = getPlan(planId);
      u.planId = plan.id;
      u.credits = plan.type === 'weekly' ? null : plan.credits;
      u.planExpires = null;   // cuota mensual: la tarifa no caduca
    }
    p.groups.slots.forEach(sid => {
      const t = getSlot(sid);
      if (!t.members.includes(u.id)) { t.members.push(u.id); res.groups++; log.groupAdds.push([sid, u.id]); }
    });
    res.reserved += syncGroups(u.id);
  });
  // se guardan las 3 últimas importaciones
  db.settings.importLog = [log, ...(db.settings.importLog || [])].slice(0, 3);
  saveDB();
  closeModal();
  render();
  openModal(`${modalHead('Importación completada ✅')}
    <div class="grid-stats" style="grid-template-columns:1fr 1fr">
      <div class="card stat"><div class="v">${res.created}</div><div class="l">Clientes nuevos</div></div>
      <div class="card stat"><div class="v">${res.updated}</div><div class="l">Actualizados</div></div>
      <div class="card stat"><div class="v">${res.groups}</div><div class="l">Altas en grupos fijos</div></div>
      <div class="card stat"><div class="v">${res.reserved}</div><div class="l">Clases reservadas</div></div>
    </div>
    ${res.blocked ? `<p class="small">🔒 ${res.blocked} cliente(s) bloqueados por deuda.</p>` : ''}
    <p class="muted small">Revisa los grupos en Clases › Horario semanal. Si algún grupo supera el aforo, aparecerá en rojo.</p>
    <p class="muted small">¿Te has equivocado de archivo? En Clientes › ⬆️ Importar tienes «↩️ Deshacer una importación».</p>
    <div class="modal-actions"><button class="btn danger" data-a="imp-undo" data-id="${log.id}">↩️ Deshacer esta importación</button><button class="btn" data-a="close">Cerrar</button><button class="btn primary" data-a="nav" data-v="a-clients">Ver clientes</button></div>`);
}

// ---------- Deshacer una importación de clientes ----------
// Borra un cliente y todo lo suyo (reservas, avisos, pagos, grupos). En el servidor se borra en cascada.
function purgeClients(ids) {
  const set = new Set(ids);
  db.schedule.forEach(t => { if ((t.members || []).some(id => set.has(id))) t.members = t.members.filter(id => !set.has(id)); });
  db.bookings = db.bookings.filter(b => !set.has(b.userId));
  db.notifications = db.notifications.filter(n => !set.has(n.userId));
  db.emails = db.emails.filter(e => !set.has(e.userId));
  if (db.payments) db.payments = db.payments.filter(p => !set.has(p.userId));
  db.users = db.users.filter(u => !set.has(u.id));
}
function undoImportLog(logId) {
  const log = (db.settings.importLog || []).find(l => l.id === logId);
  if (!log) return null;
  const affectedSessions = new Set(db.bookings.filter(b => log.created.includes(b.userId)).map(b => b.sessionId));
  purgeClients(log.created.filter(id => getUser(id)?.role === 'client'));
  // los clientes que ya existían vuelven a como estaban, y salen de los grupos a los que los metió la importación
  log.updated.forEach(({ id, before }) => { const u = getUser(id); if (u) Object.assign(u, before); });
  log.groupAdds.forEach(([sid, uid_]) => {
    const t = getSlot(sid); if (!t || !getUser(uid_)) return;
    t.members = t.members.filter(x => x !== uid_);
    db.bookings.filter(b => b.userId === uid_ && b.source === 'group' && ['booked', 'waitlist'].includes(b.status) && getSession(b.sessionId)?.templateId === sid && sessionStart(getSession(b.sessionId)) > new Date())
      .forEach(b => { b.status = 'cancelled'; b.groupRemoved = true; affectedSessions.add(b.sessionId); });
  });
  affectedSessions.forEach(sid => { if (getSession(sid)) promoteWaitlist(sid); });
  db.settings.importLog = db.settings.importLog.filter(l => l.id !== logId);
  saveDB();
  return log;
}
// Importaciones hechas antes de que existiera el registro: clientes importados agrupados por día
function importDays() {
  const logged = new Set((db.settings.importLog || []).flatMap(l => l.created));
  const days = {};
  db.users.filter(u => u.role === 'client' && u.imported && u.importSource !== 'gestion' && !logged.has(u.id))
    .forEach(u => (days[u.createdAt] = days[u.createdAt] || []).push(u));
  return Object.entries(days).sort((a, b) => String(b[0]).localeCompare(String(a[0])));
}
function openImportUndo() {
  const logs = db.settings.importLog || [];
  const days = importDays();
  const when = iso => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} a las ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  openModal(`${modalHead('↩️ Deshacer una importación')}
    <p class="muted" style="margin-top:-8px">Elige la importación que quieres deshacer. Se borran los clientes que creó (con sus reservas y grupos) y los que actualizó vuelven a como estaban.</p>
    ${logs.length ? `<div class="section-h">Últimas importaciones</div><div class="card list">${logs.map(l => `<div class="list-item" style="flex-wrap:wrap">
      <div class="grow" style="min-width:180px"><b>📄 ${esc(l.file || 'Archivo')}</b><div class="muted small">${when(l.at)} · ${l.created.length} nuevos · ${l.updated.length} actualizados</div></div>
      <button class="btn sm danger" data-a="imp-undo" data-id="${l.id}">Deshacer</button></div>`).join('')}</div>` : ''}
    ${days.length ? `<div class="section-h">${logs.length ? 'Importaciones anteriores' : 'Clientes importados por día'}</div>
      <p class="muted small" style="margin-top:-4px">De estas no se guardó el detalle: solo se pueden borrar los clientes que se crearon ese día (los que ya existían y se actualizaron no se pueden devolver a como estaban).</p>
      <div class="card list">${days.map(([day, us]) => `<div class="list-item" style="flex-wrap:wrap">
        <div class="grow" style="min-width:180px"><b>${day ? fmtDateShort(day) + ' ' + String(day).slice(0, 4) : 'Sin fecha'}</b> · ${us.length} clientes
          <div class="muted small ellipsis">${us.slice(0, 4).map(u => esc(u.name)).join(', ')}${us.length > 4 ? '…' : ''}</div></div>
        <button class="btn sm danger" data-a="imp-undo-day" data-d="${esc(day || '')}">Borrar estos ${us.length}</button></div>`).join('')}</div>` : ''}
    ${!logs.length && !days.length ? '<div class="card empty">No hay importaciones de clientes que deshacer.</div>' : ''}
    <div class="modal-actions"><button class="btn" data-a="import">Volver</button></div>`);
}

function downloadTemplate() {
  const csv = '﻿nombre;apellidos;email;telefono;tarifa;horarios\n' +
    'Laura;Gómez Pérez;laura@email.com;600111222;2 días por semana;Martes y Jueves 18:30\n' +
    'Carlos;Ruiz;carlos@email.com;600333444;3 días por semana;L-X-V 9:15\n' +
    'Ana;Martín;ana@email.com;600555666;3 días;L-M-J 20:30\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'plantilla-clientes.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Eventos ----------
Object.assign(actions, {
  import: () => openImport(),
  'imp-reset': () => openImport(),
  'imp-run': () => runImport(),
  'imp-template': () => downloadTemplate(),
  'imp-undo-list': () => openImportUndo(),
  'imp-undo': d => {
    const l = (db.settings.importLog || []).find(x => x.id === d.id);
    if (!l) return toast('Esa importación ya no se puede deshacer', 'err');
    confirmModal('Deshacer la importación', `Se borrarán ${l.created.length} clientes creados por «${esc(l.file || 'el archivo')}» (con sus reservas y grupos) y ${l.updated.length} clientes que ya existían volverán a como estaban. No se puede deshacer.`, `data-a="imp-undo-ok" data-id="${l.id}"`, 'Deshacer importación');
  },
  'imp-undo-ok': d => { const l = undoImportLog(d.id); closeModal(); toast(l ? `Importación deshecha: ${l.created.length} clientes borrados` : 'No se encontró', l ? 'ok' : 'err'); render(); },
  'imp-undo-day': d => {
    const us = importDays().find(([day]) => String(day || '') === d.d)?.[1] || [];
    confirmModal('Borrar clientes importados', `Se borrarán los ${us.length} clientes importados el ${d.d ? fmtDateShort(d.d) : 'día sin fecha'}, con sus reservas, grupos y pagos. No se puede deshacer.`, `data-a="imp-undo-day-ok" data-d="${esc(d.d)}"`, `Borrar ${us.length} clientes`);
  },
  'imp-undo-day-ok': d => {
    const us = importDays().find(([day]) => String(day || '') === d.d)?.[1] || [];
    const sessions = new Set(db.bookings.filter(b => us.some(u => u.id === b.userId)).map(b => b.sessionId));
    purgeClients(us.map(u => u.id));
    sessions.forEach(sid => { if (getSession(sid)) promoteWaitlist(sid); });
    saveDB(); closeModal(); toast(`${us.length} clientes borrados`, 'ok'); render();
  },
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.impMap) { imp.map[t.dataset.impMap] = t.value || undefined; if (t.dataset.impMap === 'plan') autoPlanMap(); renderImport(); }
  else if (t.dataset.impPlan !== undefined) { imp.planMap[t.dataset.impPlan] = t.value; renderImport(); }
  else if (t.dataset.impDefaultPlan !== undefined) { imp.opts.defaultPlan = t.value; }
  else if (t.dataset.impOpt) { imp.opts[t.dataset.impOpt] = t.checked; renderImport(); }
});
