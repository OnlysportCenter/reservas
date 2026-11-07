// ============================================================
// Pestaña «Entrenamiento de la semana» (solo administrador)
// 3 entrenamientos por semana con rondas, tiempo de trabajo, descanso, ejercicios y observaciones.
// Los ejercicios que se escriben se guardan en una base para elegirlos rápido las semanas siguientes.
// ============================================================
const W_SLOTS = 3;
const wkKey = d => dateKey(weekStart(d));
const workoutsOf = wk => db.workouts.filter(w => String(w.weekStart).slice(0, 10) === wk);
const normEx = s => String(s || '').trim().replace(/\s+/g, ' ');
const exKey = s => norm2(normEx(s));
const fmtSecs = s => { s = Number(s); if (!s && s !== 0) return '—'; if (s < 60) return `${s} s`; const m = Math.floor(s / 60), r = s % 60; return r ? `${m}:${String(r).padStart(2, '0')} min` : `${m} min`; };
const weekLabel = wk => {
  const a = parseKey(wk), b = addDays(a, 6);
  return a.getMonth() === b.getMonth() ? `${a.getDate()} al ${b.getDate()} de ${MONTHS_LONG[b.getMonth()]}` : `${a.getDate()} de ${MONTHS_LONG[a.getMonth()]} al ${b.getDate()} de ${MONTHS_LONG[b.getMonth()]}`;
};

// Uso de cada ejercicio: cuántas veces y cuándo fue la última (para no repetir mucho)
function exerciseUsage(exceptWorkoutId = null) {
  const use = new Map();
  db.workouts.forEach(w => {
    if (w.id === exceptWorkoutId) return;
    (w.exercises || []).forEach(e => {
      const k = exKey(e.name); if (!k) return;
      const u = use.get(k) || { n: 0, last: '' };
      u.n++; const wk = String(w.weekStart).slice(0, 10); if (wk > u.last) u.last = wk;
      use.set(k, u);
    });
  });
  return use;
}
// Lista de ejercicios guardados (la base + los que salen en entrenamientos), ordenada por nombre
function exerciseLibrary() {
  const map = new Map();
  db.exercises.forEach(e => { const k = exKey(e.name); if (k && !map.has(k)) map.set(k, { id: e.id, name: normEx(e.name) }); });
  db.workouts.forEach(w => (w.exercises || []).forEach(e => { const k = exKey(e.name); if (k && !map.has(k)) map.set(k, { id: null, name: normEx(e.name) }); }));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
function ensureExercises(names) {
  const have = new Set(db.exercises.map(e => exKey(e.name)));
  names.map(normEx).filter(Boolean).forEach(n => { const k = exKey(n); if (!have.has(k)) { db.exercises.push({ id: uid(), name: n, createdAt: new Date().toISOString() }); have.add(k); } });
}
// «hace 1 semana», «esta semana»…
function agoWeeks(wk, ref) {
  if (!wk) return '';
  const n = Math.round((parseKey(ref) - parseKey(wk)) / (7 * 86400000));
  return n <= 0 ? (n === 0 ? 'esta semana' : 'más adelante') : n === 1 ? 'la semana pasada' : `hace ${n} semanas`;
}

function viewAdminWorkouts() {
  const wk = state.wWeek || (state.wWeek = wkKey(new Date()));
  const list = workoutsOf(wk).sort((a, b) => a.position - b.position);
  const isThis = wk === wkKey(new Date());
  const usage = exerciseUsage();
  const prevWk = dateKey(addDays(parseKey(wk), -7));
  const prevNames = new Set(workoutsOf(prevWk).flatMap(w => (w.exercises || []).map(e => exKey(e.name))));
  const card = pos => {
    const w = list.find(x => x.position === pos);
    if (!w) return `<div class="card wk-card empty-slot"><div class="wk-num">${pos}</div><div class="muted">Entrenamiento ${pos} sin crear</div>
      <div class="row wrap" style="gap:6px;justify-content:center;margin-top:10px">
        <button class="btn primary" data-a="w-new" data-p="${pos}">${icon('plus', 'width="16" height="16"')}Crear entrenamiento ${pos}</button>
        ${db.workouts.length ? `<button class="btn" data-a="w-copy-from" data-p="${pos}">📋 Copiar uno anterior</button>` : ''}</div></div>`;
    const ex = w.exercises || [];
    const rep = ex.filter(e => prevNames.has(exKey(e.name))).length;
    return `<div class="card wk-card">
      <div class="wk-head"><div class="wk-num">${pos}</div>
        <div class="grow"><div class="wk-title">${esc(w.title || `Entrenamiento ${pos}`)}</div>
          <div class="wk-meta">${w.rounds ? `<span>🔁 <b>${w.rounds}</b> ${w.rounds === 1 ? 'ronda' : 'rondas'}</span>` : ''}${w.workSecs ? `<span>💪 <b>${fmtSecs(w.workSecs)}</b> trabajo</span>` : ''}${w.restSecs != null && w.restSecs !== '' ? `<span>😮‍💨 <b>${fmtSecs(w.restSecs)}</b> descanso</span>` : ''}<span>🏋️ <b>${ex.length}</b> ejercicios</span></div></div></div>
      ${rep ? `<div class="wk-rep">🔁 ${rep} ${rep === 1 ? 'ejercicio repetido' : 'ejercicios repetidos'} de la semana pasada</div>` : ''}
      <ol class="wk-ex">${ex.map(e => `<li class="${prevNames.has(exKey(e.name)) ? 'rep' : ''}"><b>${esc(e.name)}</b>${e.detail ? ` <span class="muted">· ${esc(e.detail)}</span>` : ''}</li>`).join('') || '<li class="muted">Sin ejercicios</li>'}</ol>
      ${w.notes ? `<div class="wk-notes">📝 ${esc(w.notes).replace(/\n/g, '<br>')}</div>` : ''}
      <div class="row wrap" style="gap:6px;margin-top:12px">
        <button class="btn sm primary" data-a="w-edit" data-id="${w.id}">✏️ Editar</button>
        <button class="btn sm" data-a="w-dup" data-id="${w.id}">📋 Copiar a la semana que viene</button>
        <button class="btn sm ghost danger" data-a="w-del" data-id="${w.id}" style="margin-left:auto">Borrar</button></div>
    </div>`;
  };
  // ejercicios más usados en las últimas 6 semanas
  const since = dateKey(addDays(parseKey(wk), -35));
  const recent = new Map();
  db.workouts.filter(w => String(w.weekStart).slice(0, 10) >= since && String(w.weekStart).slice(0, 10) <= wk).forEach(w => (w.exercises || []).forEach(e => { const k = exKey(e.name); if (!k) return; const r = recent.get(k) || { name: normEx(e.name), n: 0 }; r.n++; recent.set(k, r); }));
  const top = [...recent.values()].sort((a, b) => b.n - a.n).slice(0, 12);
  const lib = exerciseLibrary();
  const libQ = norm2(state.wLibQ || '');
  return `
    <div class="page-title"><h1>Entrenamiento de la semana</h1><button class="btn" data-a="w-print">🖨️ Imprimir la semana</button></div>
    <div class="month-nav">
      <button class="btn ghost" data-a="w-week" data-d="-1" aria-label="Semana anterior">‹</button>
      <div><b>Semana del ${weekLabel(wk)}</b>${isThis ? '<span class="pill ok" style="margin-left:8px">Esta semana</span>' : '<button class="btn sm ghost" data-a="w-week" data-d="0">Ir a esta semana</button>'}</div>
      <button class="btn ghost" data-a="w-week" data-d="1" aria-label="Semana siguiente">›</button>
    </div>
    <div class="wk-grid">${Array.from({ length: W_SLOTS }, (_, i) => card(i + 1)).join('')}</div>
    ${top.length ? `<div class="section-h">Lo que más has repetido (últimas 6 semanas)</div>
      <div class="card"><div class="wk-top">${top.map(t => `<span class="${t.n >= 4 ? 'hot' : t.n >= 2 ? 'warm' : ''}">${esc(t.name)} <b>×${t.n}</b></span>`).join('')}</div></div>` : ''}
    <div class="section-h row between"><span>📚 Ejercicios guardados (${lib.length})</span></div>
    <div class="card">
      <div class="row wrap" style="gap:8px">
        <input class="search grow" style="margin:0;min-width:180px" placeholder="Buscar ejercicio…" value="${esc(state.wLibQ || '')}" data-w-libq>
        <form data-form="w-ex-add" class="row" style="gap:6px"><input class="search" style="margin:0;width:200px" name="name" placeholder="Nuevo ejercicio" required><button class="btn" type="submit">Añadir</button></form>
      </div>
      <div class="wk-lib">${lib.filter(e => !libQ || norm2(e.name).includes(libQ)).map(e => { const u = usage.get(exKey(e.name)); return `<div class="wk-lib-i">
        <span class="grow">${esc(e.name)}</span><span class="muted small">${u ? `${u.n}× · ${agoWeeks(u.last, wk)}` : 'sin usar'}</span>
        ${e.id ? `<button class="btn sm ghost" data-a="w-ex-del" data-id="${e.id}" title="Quitar de la lista">${icon('x', 'width="14" height="14"')}</button>` : ''}</div>`; }).join('') || '<div class="muted small" style="padding:8px">Todavía no hay ejercicios. Se guardan solos al crear los entrenamientos.</div>'}</div>
    </div>`;
}

// ---------- Editor ----------
function openWorkoutEditor(w) {
  // borrador en memoria mientras se edita
  state.wDraft = state.wDraft || JSON.parse(JSON.stringify(w));
  const d = state.wDraft;
  const usage = exerciseUsage(d.id);
  const lib = exerciseLibrary();
  const q = norm2(state.wPickQ || '');
  const inList = new Set((d.exercises || []).map(e => exKey(e.name)));
  const wk = String(d.weekStart).slice(0, 10);
  const prevWk = dateKey(addDays(parseKey(wk), -7));
  const prevNames = new Set(workoutsOf(prevWk).flatMap(x => (x.exercises || []).map(e => exKey(e.name))));
  const sameWeek = new Set(workoutsOf(wk).filter(x => x.id !== d.id).flatMap(x => (x.exercises || []).map(e => exKey(e.name))));
  const tag = name => { const k = exKey(name); if (!k) return ''; if (sameWeek.has(k)) return '<span class="mtag warn">ya está esta semana</span>'; if (prevNames.has(k)) return '<span class="mtag warn">la semana pasada</span>'; const u = usage.get(k); return u ? `<span class="mtag">${agoWeeks(u.last, wk)}</span>` : '<span class="mtag ok">nuevo</span>'; };
  const presets = [20, 30, 40, 45, 60];
  openModal(`${modalHead(`${d.id && db.workouts.some(x => x.id === d.id) ? 'Editar' : 'Nuevo'} entrenamiento ${d.position} · semana del ${weekLabel(wk)}`)}
    <form data-form="workout" class="wk-form">
      <div class="field"><label>Nombre (opcional)</label><input name="title" value="${esc(d.title)}" placeholder="p. ej. Full body, Tren inferior, Cardio…" data-w-field="title"></div>
      <div class="wk-times">
        <div class="field"><label>Rondas del circuito</label><input name="rounds" type="number" min="1" max="50" value="${d.rounds ?? ''}" placeholder="p. ej. 3" data-w-field="rounds"></div>
        <div class="field"><label>Tiempo de trabajo (segundos)</label><input name="workSecs" type="number" min="0" max="3600" value="${d.workSecs ?? ''}" placeholder="p. ej. 40" data-w-field="workSecs">
          <div class="wk-presets">${presets.map(p => `<button type="button" data-a="w-preset" data-f="workSecs" data-v="${p}" class="${Number(d.workSecs) === p ? 'on' : ''}">${p}s</button>`).join('')}</div></div>
        <div class="field"><label>Tiempo de descanso (segundos)</label><input name="restSecs" type="number" min="0" max="3600" value="${d.restSecs ?? ''}" placeholder="p. ej. 20" data-w-field="restSecs">
          <div class="wk-presets">${[10, 15, 20, 30, 60].map(p => `<button type="button" data-a="w-preset" data-f="restSecs" data-v="${p}" class="${Number(d.restSecs) === p ? 'on' : ''}">${p}s</button>`).join('')}</div></div>
      </div>
      <div class="section-h" style="margin-top:6px">Ejercicios (${(d.exercises || []).length})</div>
      <datalist id="ex-list">${lib.map(e => `<option value="${esc(e.name)}">`).join('')}</datalist>
      <div class="wk-rows">${(d.exercises || []).map((e, i) => `<div class="wk-row">
        <span class="n">${i + 1}</span>
        <input class="search" list="ex-list" placeholder="Ejercicio" value="${esc(e.name)}" data-w-ex="${i}" data-k="name" autocomplete="off">
        <input class="search det" placeholder="Detalle (reps, peso…)" value="${esc(e.detail || '')}" data-w-ex="${i}" data-k="detail">
        <span class="wk-tag">${tag(e.name)}</span>
        <span class="wk-row-btns"><button type="button" class="btn sm ghost" data-a="w-ex-up" data-i="${i}" ${i ? '' : 'disabled'} title="Subir">↑</button><button type="button" class="btn sm ghost" data-a="w-ex-down" data-i="${i}" ${i < d.exercises.length - 1 ? '' : 'disabled'} title="Bajar">↓</button><button type="button" class="btn sm ghost" data-a="w-ex-rm" data-i="${i}" title="Quitar">${icon('x', 'width="14" height="14"')}</button></span>
      </div>`).join('') || '<p class="muted small">Añade ejercicios escribiéndolos o pulsándolos en la lista de abajo.</p>'}</div>
      <button type="button" class="btn sm" data-a="w-ex-add-row">${icon('plus', 'width="14" height="14"')} Añadir ejercicio</button>
      ${lib.length ? `<div class="wk-pick">
        <div class="row between wrap" style="gap:8px"><b class="small">Pulsa para añadir:</b><input class="search" style="margin:0;max-width:220px" placeholder="Buscar…" value="${esc(state.wPickQ || '')}" data-w-pickq></div>
        <div class="wk-chips">${lib.filter(e => (!q || norm2(e.name).includes(q))).map(e => { const k = exKey(e.name), used = inList.has(k), warn = sameWeek.has(k) || prevNames.has(k);
          return `<button type="button" class="${used ? 'used' : warn ? 'warn' : ''}" data-a="w-pick" data-n="${esc(e.name)}" ${used ? 'disabled' : ''} title="${used ? 'Ya está en este entrenamiento' : warn ? 'Lo usaste hace poco' : ''}">${esc(e.name)}</button>`; }).join('')}</div>
        <p class="muted small" style="margin:6px 0 0">En naranja, los que ya has puesto esta semana o la pasada.</p></div>` : ''}
      <div class="field" style="margin-top:12px"><label>Observaciones</label><textarea name="notes" rows="3" placeholder="Material, variantes, escalados…" data-w-field="notes">${esc(d.notes || '')}</textarea></div>
      <div class="modal-actions"><button type="button" class="btn" data-a="w-cancel">Cancelar</button><button class="btn primary" type="submit">Guardar entrenamiento</button></div>
    </form>`, 'wide');
}
// Lee lo escrito en la ventana al borrador (antes de redibujarla)
function readWorkoutForm() {
  const d = state.wDraft; if (!d) return;
  document.querySelectorAll('[data-w-field]').forEach(el => { d[el.dataset.wField] = el.value; });
  document.querySelectorAll('[data-w-ex]').forEach(el => { const e = d.exercises[Number(el.dataset.wEx)]; if (e) e[el.dataset.k] = el.value; });
}
function redrawEditor(focusLast) {
  const st = $('.modal')?.scrollTop;
  openWorkoutEditor(state.wDraft);
  const m = $('.modal'); if (m && st != null) m.scrollTop = st;
  if (focusLast) { const ins = document.querySelectorAll('[data-w-ex][data-k="name"]'); ins[ins.length - 1]?.focus(); }
}
function newWorkout(pos, wk) { return { id: uid(), weekStart: wk, position: pos, title: '', rounds: null, workSecs: null, restSecs: null, notes: '', exercises: [], createdAt: new Date().toISOString() }; }
function saveWorkoutDraft() {
  readWorkoutForm();
  const d = state.wDraft;
  const num = v => (v === '' || v == null || isNaN(Number(v))) ? null : Math.max(0, Math.round(Number(v)));
  d.title = String(d.title || '').trim(); d.notes = String(d.notes || '').trim();
  d.rounds = num(d.rounds); d.workSecs = num(d.workSecs); d.restSecs = num(d.restSecs);
  d.exercises = (d.exercises || []).map(e => ({ name: normEx(e.name), detail: String(e.detail || '').trim() })).filter(e => e.name);
  ensureExercises(d.exercises.map(e => e.name));
  const i = db.workouts.findIndex(x => x.id === d.id);
  if (i >= 0) db.workouts[i] = d; else db.workouts.push(d);
  saveDB();
  state.wDraft = null; state.wPickQ = '';
}
function duplicateWorkout(w, wk, pos) {
  const c = JSON.parse(JSON.stringify(w));
  c.id = uid(); c.weekStart = wk; c.position = pos; c.createdAt = new Date().toISOString();
  db.workouts.push(c); saveDB(); return c;
}
function openCopyFrom(pos) {
  const wk = state.wWeek;
  const past = [...db.workouts].sort((a, b) => String(b.weekStart).localeCompare(String(a.weekStart)) || a.position - b.position).slice(0, 30);
  openModal(`${modalHead(`Copiar un entrenamiento anterior como el ${pos}`)}
    <p class="muted" style="margin-top:-8px">Se copia en la semana del ${weekLabel(wk)} y luego lo puedes cambiar.</p>
    <div class="card list" style="max-height:55vh;overflow:auto">${past.map(w => `<div class="list-item clickable" data-a="w-copy-ok" data-id="${w.id}" data-p="${pos}">
      <div class="grow"><b>${esc(w.title || `Entrenamiento ${w.position}`)}</b><div class="muted small">Semana del ${weekLabel(String(w.weekStart).slice(0, 10))} · ${(w.exercises || []).length} ejercicios · ${agoWeeks(String(w.weekStart).slice(0, 10), wk)}</div>
        <div class="muted small ellipsis">${(w.exercises || []).map(e => esc(e.name)).join(', ')}</div></div><span class="muted">›</span></div>`).join('')}</div>`);
}
function printWeek() {
  const wk = state.wWeek; const list = workoutsOf(wk).sort((a, b) => a.position - b.position);
  const win = window.open('', '_blank'); if (!win) return toast('Permite las ventanas emergentes para imprimir', 'err');
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Entrenamientos · semana del ${weekLabel(wk)}</title>
    <style>body{font-family:system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 16px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
    .w{border:1px solid #bbb;border-radius:10px;padding:12px 14px;break-inside:avoid}.w h2{margin:0 0 4px;font-size:17px}.m{font-size:13px;color:#444;margin-bottom:8px}
    ol{margin:0;padding-left:22px;font-size:14px;line-height:1.6}.n{margin-top:8px;font-size:13px;white-space:pre-wrap}@media(max-width:700px){.g{grid-template-columns:1fr}}</style></head><body>
    <h1>${esc(db.settings.centerName)} · Entrenamientos de la semana del ${weekLabel(wk)}</h1><div class="g">
    ${list.map(w => `<div class="w"><h2>${w.position}. ${esc(w.title || 'Entrenamiento ' + w.position)}</h2>
      <div class="m">${[w.rounds ? `${w.rounds} rondas` : '', w.workSecs ? `${fmtSecs(w.workSecs)} trabajo` : '', w.restSecs != null ? `${fmtSecs(w.restSecs)} descanso` : ''].filter(Boolean).join(' · ')}</div>
      <ol>${(w.exercises || []).map(e => `<li>${esc(e.name)}${e.detail ? ' — ' + esc(e.detail) : ''}</li>`).join('')}</ol>${w.notes ? `<div class="n">📝 ${esc(w.notes)}</div>` : ''}</div>`).join('') || '<p>No hay entrenamientos esta semana.</p>'}
    </div><script>window.onload=()=>window.print()<\/script></body></html>`);
  win.document.close();
}

document.addEventListener('input', e => {
  if (e.target.matches?.('[data-w-libq]')) {
    state.wLibQ = e.target.value; const pos = e.target.selectionStart; render();
    const el = document.querySelector('[data-w-libq]'); if (el) { el.focus(); el.setSelectionRange(pos, pos); }
  }
  if (e.target.matches?.('[data-w-pickq]')) {
    readWorkoutForm(); state.wPickQ = e.target.value; const pos = e.target.selectionStart; redrawEditor();
    const el = document.querySelector('[data-w-pickq]'); if (el) { el.focus(); el.setSelectionRange(pos, pos); }
  }
});
// Intro en un ejercicio = añadir el siguiente (en vez de guardar y cerrar)
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches?.('[data-w-ex]') && state.wDraft) { e.preventDefault(); actions['w-ex-add-row'](); }
});
// al elegir un nombre de la lista (o salir del campo) se actualiza la etiqueta de «repetido»
document.addEventListener('change', e => {
  if (e.target.matches?.('[data-w-ex][data-k="name"]') && state.wDraft) { readWorkoutForm(); redrawEditor(); }
});

Object.assign(actions, {
  'w-week': d => { state.wWeek = Number(d.d) === 0 ? wkKey(new Date()) : dateKey(addDays(parseKey(state.wWeek || wkKey(new Date())), 7 * Number(d.d))); render(); },
  'w-new': d => { state.wDraft = null; state.wPickQ = ''; openWorkoutEditor(newWorkout(Number(d.p), state.wWeek)); },
  'w-edit': d => { state.wDraft = null; state.wPickQ = ''; const w = db.workouts.find(x => x.id === d.id); if (w) openWorkoutEditor(w); },
  'w-cancel': () => { state.wDraft = null; closeModal(); },
  'w-preset': d => { readWorkoutForm(); state.wDraft[d.f] = Number(d.v); redrawEditor(); },
  'w-ex-add-row': () => { readWorkoutForm(); state.wDraft.exercises.push({ name: '', detail: '' }); redrawEditor(true); },
  'w-pick': d => {
    readWorkoutForm();
    const ex = state.wDraft.exercises; const empty = ex.findIndex(e => !normEx(e.name));
    if (empty >= 0) ex[empty].name = d.n; else ex.push({ name: d.n, detail: '' });
    redrawEditor();
  },
  'w-ex-rm': d => { readWorkoutForm(); state.wDraft.exercises.splice(Number(d.i), 1); redrawEditor(); },
  'w-ex-up': d => { readWorkoutForm(); const a = state.wDraft.exercises, i = Number(d.i); if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]]; redrawEditor(); },
  'w-ex-down': d => { readWorkoutForm(); const a = state.wDraft.exercises, i = Number(d.i); if (i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]]; redrawEditor(); },
  'w-del': d => confirmModal('Borrar entrenamiento', 'Se borrará este entrenamiento de la semana. Los ejercicios siguen guardados en tu lista.', `data-a="w-del-ok" data-id="${d.id}"`, 'Borrar'),
  'w-del-ok': d => { db.workouts = db.workouts.filter(w => w.id !== d.id); saveDB(); closeModal(); toast('Entrenamiento borrado', 'ok'); render(); },
  'w-dup': d => {
    const w = db.workouts.find(x => x.id === d.id); if (!w) return;
    const next = dateKey(addDays(parseKey(String(w.weekStart).slice(0, 10)), 7));
    const taken = new Set(workoutsOf(next).map(x => x.position));
    const pos = taken.has(w.position) ? [1, 2, 3].find(p => !taken.has(p)) : w.position;
    if (!pos) return toast('La semana que viene ya tiene los 3 entrenamientos', 'err');
    duplicateWorkout(w, next, pos); state.wWeek = next; toast(`Copiado como entrenamiento ${pos} de la semana que viene`, 'ok'); render();
  },
  'w-copy-from': d => openCopyFrom(Number(d.p)),
  'w-copy-ok': d => { const w = db.workouts.find(x => x.id === d.id); if (!w) return; const c = duplicateWorkout(w, state.wWeek, Number(d.p)); closeModal(); render(); state.wDraft = null; openWorkoutEditor(c); },
  'w-ex-del': d => { db.exercises = db.exercises.filter(e => e.id !== d.id); saveDB(); render(); },
  'w-print': () => printWeek(),
});
Object.assign(forms, {
  workout: () => { saveWorkoutDraft(); closeModal(); toast('✅ Entrenamiento guardado', 'ok'); render(); },
  'w-ex-add': (f, form) => { const n = normEx(f.get('name')); if (!n) return; ensureExercises([n]); saveDB(); toast('Ejercicio añadido', 'ok'); render(); },
});
