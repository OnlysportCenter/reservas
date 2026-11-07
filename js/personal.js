// ============================================================
// Pestaña «Entrenamiento personal» (solo administrador)
// Clientes de personal (socios del centro o personas nuevas), sus sesiones con ejercicios y cargas,
// y la evolución de cada ejercicio para ver cómo van subiendo los kilos.
// ============================================================
const ptSessionsOf = cid => db.ptSessions.filter(s => s.clientId === cid).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
const ptDate = d => String(d || '').slice(0, 10);
const kgTxt = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? '' : `${String(Math.round(Number(v) * 100) / 100).replace('.', ',')} kg`;
const numOrNull = v => (v === '' || v == null || isNaN(Number(String(v).replace(',', '.')))) ? null : Math.round(Number(String(v).replace(',', '.')) * 100) / 100;
const fmtPtDate = k => { const d = parseKey(ptDate(k)); return `${DOW_LONG[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

// Última vez que hizo un ejercicio (antes de una fecha / sesión)
function ptLastFor(cid, name, beforeDate, exceptId) {
  const k = exKey(name);
  for (const s of ptSessionsOf(cid)) {
    if (s.id === exceptId) continue;
    if (beforeDate && ptDate(s.date) > beforeDate) continue;
    const e = (s.exercises || []).find(x => exKey(x.name) === k);
    if (e) return { s, e };
  }
  return null;
}
// Historial de un ejercicio de un cliente (de más antiguo a más nuevo)
function ptHistory(cid, name) {
  const k = exKey(name);
  return ptSessionsOf(cid).slice().reverse().flatMap(s => (s.exercises || []).filter(e => exKey(e.name) === k).map(e => ({ s, e })));
}
const ptClientName = c => c.memberId && getUser(c.memberId) ? getUser(c.memberId).name : c.name;

function viewAdminPersonal() {
  const c = state.ptClient && db.ptClients.find(x => x.id === state.ptClient);
  if (c) return viewPtClient(c);
  const q = norm2(state.search);
  const list = db.ptClients.filter(x => (state.ptShowInactive || x.active !== false) && (!q || norm2(ptClientName(x) + ' ' + x.goal).includes(q)))
    .map(x => ({ x, ss: ptSessionsOf(x.id) }))
    .sort((a, b) => (ptDate(b.ss[0]?.date) || '').localeCompare(ptDate(a.ss[0]?.date) || '') || ptClientName(a.x).localeCompare(ptClientName(b.x)));
  const inactive = db.ptClients.filter(x => x.active === false).length;
  const thisMonth = monthKey();
  const monthSessions = db.ptSessions.filter(s => ptDate(s.date).startsWith(thisMonth)).length;
  return `
    <div class="page-title"><h1>Entrenamiento personal</h1><button class="btn primary" data-a="pt-new">${icon('plus', 'width="18" height="18"')}Nuevo cliente</button></div>
    <div class="grid-stats">
      <div class="card kpi money" style="--k:#2F5D8A"><div class="kpi-ic">🧑‍🏫</div><div><div class="v">${db.ptClients.filter(x => x.active !== false).length}</div><div class="l">Clientes de personal</div></div></div>
      <div class="card kpi money" style="--k:#1F7A45"><div class="kpi-ic">📅</div><div><div class="v">${monthSessions}</div><div class="l">Sesiones en ${monthName()}</div></div></div>
    </div>
    <input class="search" placeholder="Buscar cliente…" value="${esc(state.search)}" data-input="search">
    ${inactive ? `<label class="check small"><input type="checkbox" data-a="pt-inactive" ${state.ptShowInactive ? 'checked' : ''}> Ver también los que ya no vienen (${inactive})</label>` : ''}
    <div class="card list">${list.length ? list.map(({ x, ss }) => {
      const last = ss[0];
      return `<div class="list-item clickable" data-a="pt-open" data-id="${x.id}">
        <div class="avatar">${initials(ptClientName(x))}</div>
        <div class="grow"><div class="ellipsis" style="font-weight:600">${esc(ptClientName(x))} ${x.memberId ? '<span class="mtag group">Socio</span>' : ''}${x.active === false ? ' <span class="pill">No viene</span>' : ''}</div>
          <div class="muted small ellipsis">${esc([x.goal, x.days].filter(Boolean).join(' · ') || 'Sin objetivo apuntado')}</div></div>
        <div style="text-align:right"><div class="small"><b>${ss.length}</b> ${ss.length === 1 ? 'sesión' : 'sesiones'}</div><div class="muted small">${last ? 'última ' + fmtPtDate(last.date) : 'sin sesiones'}</div></div></div>`;
    }).join('') : `<div class="empty">${q ? 'Nadie coincide con la búsqueda.' : 'Todavía no tienes clientes de personal. Pulsa «Nuevo cliente» para añadir uno.'}</div>`}</div>`;
}

// ---------- Ficha de un cliente ----------
function viewPtClient(c) {
  const ss = ptSessionsOf(c.id);
  const tab = state.ptTab || 'sessions';
  const routines = [...new Set(ss.map(s => s.routine).filter(Boolean))];
  const u = c.memberId && getUser(c.memberId);
  const head = `
    <button class="btn ghost sm" data-a="pt-back" style="margin-bottom:8px">‹ Clientes de personal</button>
    <div class="card pt-head">
      <div class="avatar" style="width:52px;height:52px;font-size:18px">${initials(ptClientName(c))}</div>
      <div class="grow"><h1 style="font-size:22px;margin:0">${esc(ptClientName(c))}</h1>
        <div class="muted small">${[u ? 'Socio del centro' : 'Cliente de personal', c.phone || u?.phone, c.email || u?.email].filter(Boolean).map(esc).join(' · ')}</div>
        ${c.goal ? `<div style="margin-top:6px">🎯 ${esc(c.goal)}</div>` : ''}${c.days ? `<div class="small" style="margin-top:2px">📅 ${esc(c.days)}</div>` : ''}
        ${c.notes ? `<div class="wk-notes" style="margin-top:8px">📝 ${esc(c.notes).replace(/\n/g, '<br>')}</div>` : ''}</div>
      <div class="row wrap" style="gap:6px;align-self:flex-start"><button class="btn sm" data-a="pt-edit" data-id="${c.id}">✏️ Editar</button></div>
    </div>
    <div class="row wrap" style="gap:8px;margin:12px 0">
      <button class="btn primary" data-a="pt-sess-new" data-id="${c.id}">${icon('plus', 'width="16" height="16"')}Nueva sesión</button>
      ${routines.length ? `<button class="btn" data-a="pt-repeat" data-id="${c.id}">🔁 Repetir una rutina</button>` : ''}
    </div>
    <div class="tabs"><button class="${tab === 'sessions' ? 'active' : ''}" data-a="pt-tab" data-t="sessions">📋 Sesiones (${ss.length})</button>
      <button class="${tab === 'evo' ? 'active' : ''}" data-a="pt-tab" data-t="evo">📈 Evolución</button></div>`;
  return head + (tab === 'evo' ? viewPtEvolution(c, ss) : viewPtSessions(c, ss));
}

function deltaTag(cur, prev) {
  const a = numOrNull(cur), b = numOrNull(prev);
  if (a == null || b == null) return '';
  const d = Math.round((a - b) * 100) / 100;
  if (!d) return '<span class="pt-d eq" title="Igual que la vez anterior">=</span>';
  return `<span class="pt-d ${d > 0 ? 'up' : 'down'}" title="Respecto a la vez anterior">${d > 0 ? '▲ +' : '▼ '}${String(d).replace('.', ',')} kg</span>`;
}
function viewPtSessions(c, ss) {
  if (!ss.length) return '<div class="card empty">Sin sesiones todavía. Pulsa «Nueva sesión» para apuntar la primera.</div>';
  return `<div class="stack">${ss.map(s => `<div class="card pt-sess">
    <div class="row between wrap" style="gap:8px"><div><b>${fmtPtDate(s.date)}</b>${s.routine ? ` <span class="mtag group">${esc(s.routine)}</span>` : ''}</div>
      <div class="row" style="gap:4px"><button class="btn sm" data-a="pt-sess-edit" data-id="${s.id}">✏️ Editar</button><button class="btn sm" data-a="pt-sess-dup" data-id="${s.id}" title="Hacer otra sesión con esta misma rutina">🔁 Repetir</button>
        <button class="btn sm ghost" data-a="pt-sess-del" data-id="${s.id}" title="Borrar">${icon('x', 'width="15" height="15"')}</button></div></div>
    <div class="pt-scroll"><table class="pt-table"><thead><tr><th>Ejercicio</th><th>Series × reps</th><th>Carga</th></tr></thead><tbody>
      ${(s.exercises || []).map(e => { const prev = ptLastFor(c.id, e.name, ptDate(s.date), s.id); const p = prev && ptDate(prev.s.date) <= ptDate(s.date) ? prev.e : null;
        return `<tr><td><b>${esc(e.name)}</b>${e.notes ? `<div class="muted small">${esc(e.notes)}</div>` : ''}</td><td>${e.sets ? esc(e.sets) + ' × ' : ''}${esc(e.reps || '')}</td>
          <td style="white-space:nowrap">${kgTxt(e.kg) || '<span class="muted">—</span>'} ${p ? deltaTag(e.kg, p.kg) : ''}</td></tr>`; }).join('') || '<tr><td colspan="3" class="muted">Sin ejercicios</td></tr>'}
    </tbody></table></div>
    ${s.notes ? `<div class="wk-notes" style="margin-top:8px">📝 ${esc(s.notes).replace(/\n/g, '<br>')}</div>` : ''}
  </div>`).join('')}</div>`;
}

// ---------- Evolución de un ejercicio ----------
function viewPtEvolution(c, ss) {
  const counts = new Map();
  ss.forEach(s => (s.exercises || []).forEach(e => { const k = exKey(e.name); if (!k) return; const r = counts.get(k) || { name: normEx(e.name), n: 0, kg: false, lo: Infinity, hi: -Infinity }; r.n++; const v = numOrNull(e.kg); if (v != null) { r.kg = true; r.lo = Math.min(r.lo, v); r.hi = Math.max(r.hi, v); } counts.set(k, r); }));
  const exs = [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  if (!exs.length) return '<div class="card empty">Cuando apuntes sesiones con ejercicios y cargas, aquí verás cómo evoluciona cada uno.</div>';
  // al entrar se enseña el ejercicio con más progreso (si no se ha elegido otro)
  const cur = exs.find(e => exKey(e.name) === state.ptEx) || exs.filter(e => e.kg).sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo) || b.n - a.n)[0] || exs[0];
  state.ptEx = exKey(cur.name);
  const hist = ptHistory(c.id, cur.name);
  const pts = hist.filter(h => numOrNull(h.e.kg) != null).map(h => ({ date: ptDate(h.s.date), kg: numOrNull(h.e.kg), sets: h.e.sets, reps: h.e.reps, routine: h.s.routine }));
  const first = pts[0], last = pts[pts.length - 1], best = pts.reduce((m, p) => p.kg > (m?.kg ?? -Infinity) ? p : m, null);
  const diff = first && last ? Math.round((last.kg - first.kg) * 100) / 100 : 0;
  // por rutina: número de sesiones y última vez
  const byRoutine = {};
  ss.forEach(s => { const r = s.routine || 'Sin nombre de rutina'; (byRoutine[r] = byRoutine[r] || []).push(s); });
  return `
    <div class="pt-exchips">${exs.map(e => `<button class="${exKey(e.name) === state.ptEx ? 'active' : ''}" data-a="pt-ex" data-k="${esc(exKey(e.name))}">${esc(e.name)} <span>${e.n}</span></button>`).join('')}</div>
    <div class="card">
      <div class="row between wrap" style="gap:8px"><div><div class="wk-title">${esc(cur.name)}</div><div class="muted small">Carga en cada sesión (kg)</div></div>
        ${pts.length ? `<div class="pt-evo-nums">
          <div><b>${kgTxt(first.kg)}</b><span>al empezar</span></div>
          <div><b>${kgTxt(last.kg)}</b><span>la última vez</span></div>
          <div><b class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '+' : ''}${String(diff).replace('.', ',')} kg</b><span>de progreso</span></div>
          <div><b>${kgTxt(best.kg)}</b><span>su máximo</span></div></div>` : ''}</div>
      ${pts.length >= 2 ? ptChart(pts) : pts.length === 1 ? '<p class="muted small">Solo hay una sesión con carga: en la próxima ya verás la línea.</p>' : '<p class="muted small">Este ejercicio no tiene cargas apuntadas.</p>'}
      <div class="pt-scroll"><table class="pt-table" style="margin-top:12px"><thead><tr><th>Día</th><th>Rutina</th><th>Series × reps</th><th>Carga</th></tr></thead><tbody>
        ${hist.slice().reverse().map((h, i, arr) => { const prev = arr[i + 1]; return `<tr><td style="white-space:nowrap">${fmtPtDate(h.s.date)}</td><td>${esc(h.s.routine || '—')}</td><td>${h.e.sets ? esc(h.e.sets) + ' × ' : ''}${esc(h.e.reps || '')}</td>
          <td style="white-space:nowrap">${kgTxt(h.e.kg) || '—'} ${prev ? deltaTag(h.e.kg, prev.e.kg) : ''}</td></tr>`; }).join('')}
      </tbody></table></div>
    </div>
    <div class="section-h">Rutinas</div>
    <div class="card list">${Object.entries(byRoutine).map(([r, list]) => `<div class="list-item"><div class="grow"><b>${esc(r)}</b><div class="muted small">${list.length} ${list.length === 1 ? 'vez' : 'veces'} · la última ${fmtPtDate(list[0].date)}</div></div></div>`).join('')}</div>`;
}

// Gráfica de una sola línea (kg por sesión). Un solo dato → sin leyenda; el título dice qué es.
function ptChart(pts) {
  const W = 640, H = 220, L = 44, R = 64, T = 16, B = 30;
  const t0 = parseKey(pts[0].date).getTime(), t1 = parseKey(pts[pts.length - 1].date).getTime();
  const span = Math.max(1, t1 - t0);
  let lo = Math.min(...pts.map(p => p.kg)), hi = Math.max(...pts.map(p => p.kg));
  if (lo === hi) { lo -= 5; hi += 5; }
  const pad = (hi - lo) * 0.15; lo = Math.max(0, lo - pad); hi += pad;
  const step = [1, 2, 2.5, 5, 10, 20, 25, 50].find(s => (hi - lo) / s <= 5) || 100;
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const x = p => L + (parseKey(p.date).getTime() - t0) / span * (W - L - R);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = []; for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const lastP = pts[pts.length - 1];
  const dl = d => { const k = parseKey(d); return `${k.getDate()} ${MONTHS[k.getMonth()]}`; };
  const xLabels = pts.length <= 6 ? pts : [pts[0], pts[Math.floor(pts.length / 2)], lastP];
  return `<div class="pt-chart" data-pts='${esc(JSON.stringify(pts))}'>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de la carga: de ${kgTxt(pts[0].kg)} a ${kgTxt(lastP.kg)}">
      ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="ax">${String(v).replace('.', ',')}</text>`).join('')}
      ${xLabels.map(p => `<text x="${x(p)}" y="${H - 8}" text-anchor="middle" class="ax">${dl(p.date)}</text>`).join('')}
      <path d="${path}" class="ln"/>
      ${pts.map((p, i) => `<circle cx="${x(p).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="4.5" class="pt" data-i="${i}"><title>${dl(p.date)}: ${kgTxt(p.kg)}${p.sets || p.reps ? ` · ${p.sets ? p.sets + '×' : ''}${p.reps || ''}` : ''}</title></circle>`).join('')}
      <text x="${x(lastP) + 10}" y="${y(lastP.kg) + 4}" class="dl">${kgTxt(lastP.kg)}</text>
      <line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" style="display:none"/>
    </svg><div class="pt-tip" style="display:none"></div></div>`;
}
// Cruz y etiqueta al pasar el ratón (el punto más cercano)
document.addEventListener('mousemove', e => {
  const box = e.target.closest?.('.pt-chart'); if (!box) return;
  const svg = box.querySelector('svg'), tip = box.querySelector('.pt-tip'), xh = svg.querySelector('.xh');
  const pts = JSON.parse(box.dataset.pts); const circles = [...svg.querySelectorAll('circle.pt')];
  const r = svg.getBoundingClientRect(); const mx = (e.clientX - r.left) / r.width * 640;
  let best = 0, bd = Infinity; circles.forEach((c, i) => { const d = Math.abs(Number(c.getAttribute('cx')) - mx); if (d < bd) { bd = d; best = i; } });
  const c = circles[best], p = pts[best];
  circles.forEach((k, i) => k.classList.toggle('on', i === best));
  xh.setAttribute('x1', c.getAttribute('cx')); xh.setAttribute('x2', c.getAttribute('cx')); xh.style.display = '';
  const k = parseKey(p.date);
  tip.innerHTML = `<b>${kgTxt(p.kg)}</b><div>${k.getDate()} ${MONTHS[k.getMonth()]} ${k.getFullYear()}</div>${p.sets || p.reps ? `<div>${p.sets ? esc(p.sets) + ' × ' : ''}${esc(p.reps || '')}</div>` : ''}${p.routine ? `<div class="muted">${esc(p.routine)}</div>` : ''}`;
  tip.style.display = '';
  const px = Number(c.getAttribute('cx')) / 640 * r.width, py = Number(c.getAttribute('cy')) / 220 * r.height;
  tip.style.left = Math.min(Math.max(0, px - 60), r.width - 130) + 'px'; tip.style.top = Math.max(0, py - 78) + 'px';
});
document.addEventListener('mouseout', e => {
  const box = e.target.closest?.('.pt-chart'); if (!box || box.contains(e.relatedTarget)) return;
  box.querySelector('.pt-tip').style.display = 'none'; box.querySelector('.xh').style.display = 'none';
  box.querySelectorAll('circle.pt.on').forEach(c => c.classList.remove('on'));
});

// ---------- Alta / edición de cliente ----------
function openPtClientForm(id) {
  const c = id ? db.ptClients.find(x => x.id === id) : { name: '', phone: '', email: '', goal: '', days: '', notes: '', memberId: null, active: true };
  const kind = state.ptKind || (c.memberId ? 'member' : id ? 'new' : 'member');
  const opts = realClients().filter(u => !db.ptClients.some(x => x.memberId === u.id && x.id !== id)).sort((a, b) => a.name.localeCompare(b.name));
  openModal(`${modalHead(id ? 'Editar cliente de personal' : 'Nuevo cliente de personal')}
    <form data-form="pt-client" data-id="${id || ''}">
      <div class="row" style="gap:6px;margin-bottom:12px">
        <label class="tab-radio"><input type="radio" name="kind" value="member" ${kind === 'member' ? 'checked' : ''} data-a="pt-kind" data-k="member"><span>Socio del centro</span></label>
        <label class="tab-radio"><input type="radio" name="kind" value="new" ${kind === 'new' ? 'checked' : ''} data-a="pt-kind" data-k="new"><span>Persona nueva</span></label></div>
      ${kind === 'member' ? `<div class="field"><label>Socio</label><select name="memberId" required><option value="">Elige un socio…</option>${opts.map(u => `<option value="${u.id}" ${u.id === c.memberId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>`
        : `<div class="field"><label>Nombre y apellidos</label><input name="name" required value="${esc(c.memberId ? '' : c.name)}"></div>
        <div class="fields-2"><div class="field"><label>Teléfono</label><input name="phone" value="${esc(c.phone)}"></div><div class="field"><label>Email (opcional)</label><input name="email" type="email" value="${esc(c.email)}"></div></div>`}
      <div class="field"><label>Objetivo</label><input name="goal" value="${esc(c.goal)}" placeholder="p. ej. Perder peso, fuerza, recuperar rodilla…"></div>
      <div class="field"><label>Días que entrena</label><input name="days" value="${esc(c.days)}" placeholder="p. ej. Lunes y jueves 10:00"></div>
      <div class="field"><label>Notas</label><textarea name="notes" rows="3" placeholder="Lesiones, medidas, lo que te cuente…">${esc(c.notes)}</textarea></div>
      ${id ? `<label class="check"><input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''}> Sigue viniendo a personal</label>` : ''}
      <div class="modal-actions">${id ? `<button type="button" class="btn danger" data-a="pt-del" data-id="${id}" style="margin-right:auto">Borrar</button>` : ''}<button type="button" class="btn" data-a="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
}

// ---------- Sesión: editor ----------
function openPtSession(draft) {
  state.ptDraft = draft;
  const d = draft, c = db.ptClients.find(x => x.id === d.clientId);
  const lib = exerciseLibrary();
  const mine = [...new Map(ptSessionsOf(c.id).flatMap(s => (s.exercises || []).map(e => [exKey(e.name), normEx(e.name)]))).values()];
  const routines = [...new Set(ptSessionsOf(c.id).map(s => s.routine).filter(Boolean))];
  const inList = new Set(d.exercises.map(e => exKey(e.name)));
  const q = norm2(state.ptPickQ || '');
  const hint = e => { if (!normEx(e.name)) return ''; const l = ptLastFor(c.id, e.name, d.date, d.id); return l ? `<span class="pt-last" title="La última vez (${fmtPtDate(l.s.date)})">última vez: ${l.e.sets ? esc(l.e.sets) + '×' : ''}${esc(l.e.reps || '')}${l.e.kg != null && l.e.kg !== '' ? ' · ' + kgTxt(l.e.kg) : ''}</span>` : '<span class="pt-last new">primera vez</span>'; };
  openModal(`${modalHead(`Sesión de ${esc(ptClientName(c))}`)}
    <form data-form="pt-session">
      <div class="fields-2">
        <div class="field"><label>Día</label><input type="date" name="date" value="${ptDate(d.date)}" data-pt-f="date" required></div>
        <div class="field"><label>Rutina</label><input name="routine" list="pt-routines" value="${esc(d.routine)}" data-pt-f="routine" placeholder="p. ej. Rutina A · Pierna"><datalist id="pt-routines">${routines.map(r => `<option value="${esc(r)}">`).join('')}</datalist></div>
      </div>
      <datalist id="ex-list">${lib.map(e => `<option value="${esc(e.name)}">`).join('')}</datalist>
      <div class="section-h">Ejercicios (${d.exercises.length})</div>
      <div class="pt-rows">${d.exercises.map((e, i) => `<div class="pt-row">
        <span class="n">${i + 1}</span>
        <input class="search nm" list="ex-list" placeholder="Ejercicio" value="${esc(e.name)}" data-pt-ex="${i}" data-k="name" autocomplete="off">
        <input class="search sm" type="number" min="0" placeholder="Series" value="${esc(e.sets ?? '')}" data-pt-ex="${i}" data-k="sets" title="Series">
        <input class="search sm" placeholder="Reps" value="${esc(e.reps ?? '')}" data-pt-ex="${i}" data-k="reps" title="Repeticiones (o tiempo)">
        <input class="search sm" inputmode="decimal" placeholder="Kg" value="${esc(e.kg ?? '')}" data-pt-ex="${i}" data-k="kg" title="Carga en kg">
        <span class="pt-row-btns"><button type="button" class="btn sm ghost" data-a="pt-ex-up" data-i="${i}" ${i ? '' : 'disabled'}>↑</button><button type="button" class="btn sm ghost" data-a="pt-ex-down" data-i="${i}" ${i < d.exercises.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="btn sm ghost" data-a="pt-ex-rm" data-i="${i}">${icon('x', 'width="14" height="14"')}</button></span>
        <input class="search note" placeholder="Nota (técnica, sensaciones…)" value="${esc(e.notes || '')}" data-pt-ex="${i}" data-k="notes">
        <span class="hint">${hint(e)}</span>
      </div>`).join('') || '<p class="muted small">Añade los ejercicios de la sesión.</p>'}</div>
      <button type="button" class="btn sm" data-a="pt-ex-add">${icon('plus', 'width="14" height="14"')} Añadir ejercicio</button>
      ${(mine.length || lib.length) ? `<div class="wk-pick"><div class="row between wrap" style="gap:8px"><b class="small">Pulsa para añadir:</b><input class="search" style="margin:0;max-width:220px" placeholder="Buscar…" value="${esc(state.ptPickQ || '')}" data-pt-pickq></div>
        ${mine.length ? `<div class="muted small" style="margin-top:8px">Los que ya ha hecho:</div><div class="wk-chips">${mine.filter(n => !q || norm2(n).includes(q)).map(n => `<button type="button" class="${inList.has(exKey(n)) ? 'used' : ''}" data-a="pt-pick" data-n="${esc(n)}" ${inList.has(exKey(n)) ? 'disabled' : ''}>${esc(n)}</button>`).join('')}</div>` : ''}
        <div class="muted small" style="margin-top:8px">Todos tus ejercicios:</div><div class="wk-chips">${lib.filter(e => !mine.some(n => exKey(n) === exKey(e.name)) && (!q || norm2(e.name).includes(q))).map(e => `<button type="button" data-a="pt-pick" data-n="${esc(e.name)}">${esc(e.name)}</button>`).join('')}</div></div>` : ''}
      <div class="field" style="margin-top:12px"><label>Observaciones de la sesión</label><textarea name="notes" rows="3" data-pt-f="notes" placeholder="Cómo ha ido, molestias, qué subir la próxima…">${esc(d.notes || '')}</textarea></div>
      <div class="modal-actions"><button type="button" class="btn" data-a="pt-sess-cancel">Cancelar</button><button class="btn primary" type="submit">Guardar sesión</button></div>
    </form>`, 'wide');
}
function readPtForm() {
  const d = state.ptDraft; if (!d) return;
  document.querySelectorAll('[data-pt-f]').forEach(el => { d[el.dataset.ptF] = el.value; });
  document.querySelectorAll('[data-pt-ex]').forEach(el => { const e = d.exercises[Number(el.dataset.ptEx)]; if (e) e[el.dataset.k] = el.value; });
}
function redrawPt(focusLast) {
  const st = $('.modal')?.scrollTop; openPtSession(state.ptDraft); const m = $('.modal'); if (m && st != null) m.scrollTop = st;
  if (focusLast) { const ins = document.querySelectorAll('[data-pt-ex][data-k="name"]'); ins[ins.length - 1]?.focus(); }
}
const newPtSession = cid => ({ id: uid(), clientId: cid, date: dateKey(new Date()), routine: '', notes: '', exercises: [], createdAt: new Date().toISOString() });
// Nueva sesión copiando otra (misma rutina, mismas cargas para ir subiéndolas)
function ptFrom(s) {
  const n = newPtSession(s.clientId);
  n.routine = s.routine; n.exercises = (s.exercises || []).map(e => ({ name: e.name, sets: e.sets ?? '', reps: e.reps ?? '', kg: e.kg ?? '', notes: '' }));
  return n;
}
function savePtSession() {
  readPtForm();
  const d = state.ptDraft;
  d.date = ptDate(d.date) || dateKey(new Date()); d.routine = String(d.routine || '').trim(); d.notes = String(d.notes || '').trim();
  d.exercises = d.exercises.map(e => ({ name: normEx(e.name), sets: e.sets === '' || e.sets == null ? null : Math.max(0, Math.round(Number(e.sets)) || 0) || null, reps: String(e.reps ?? '').trim(), kg: numOrNull(e.kg), notes: String(e.notes || '').trim() })).filter(e => e.name);
  ensureExercises(d.exercises.map(e => e.name));
  const i = db.ptSessions.findIndex(x => x.id === d.id);
  if (i >= 0) db.ptSessions[i] = d; else db.ptSessions.push(d);
  saveDB(); state.ptDraft = null; state.ptPickQ = '';
}
function openPtRepeat(cid) {
  const ss = ptSessionsOf(cid);
  const byR = new Map(); ss.forEach(s => { const r = s.routine || ''; if (r && !byR.has(r)) byR.set(r, s); });
  openModal(`${modalHead('🔁 Repetir una rutina')}
    <p class="muted" style="margin-top:-8px">Se crea una sesión de hoy con los mismos ejercicios y las cargas de la última vez, para que solo cambies lo que suba.</p>
    <div class="card list">${[...byR].map(([r, s]) => `<div class="list-item clickable" data-a="pt-repeat-ok" data-id="${s.id}"><div class="grow"><b>${esc(r)}</b>
      <div class="muted small">La última vez ${fmtPtDate(s.date)} · ${(s.exercises || []).length} ejercicios</div><div class="muted small ellipsis">${(s.exercises || []).map(e => esc(e.name) + (e.kg != null && e.kg !== '' ? ' ' + kgTxt(e.kg) : '')).join(', ')}</div></div><span class="muted">›</span></div>`).join('')}</div>`);
}

document.addEventListener('input', e => {
  if (e.target.matches?.('[data-pt-pickq]')) { readPtForm(); state.ptPickQ = e.target.value; const p = e.target.selectionStart; redrawPt(); const el = document.querySelector('[data-pt-pickq]'); if (el) { el.focus(); el.setSelectionRange(p, p); } }
});
document.addEventListener('change', e => {
  if (e.target.matches?.('[data-pt-ex][data-k="name"]') && state.ptDraft) { readPtForm(); redrawPt(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches?.('[data-pt-ex]') && state.ptDraft) { e.preventDefault(); actions['pt-ex-add'](); }
});

Object.assign(actions, {
  'pt-new': () => { state.ptKind = null; openPtClientForm(null); },
  'pt-edit': d => { state.ptKind = null; openPtClientForm(d.id); },
  'pt-kind': (d, el) => { state.ptKind = d.k; const f = el.closest('form'); openPtClientForm(f.dataset.id || null); },
  'pt-open': d => { state.ptClient = d.id; state.ptTab = 'sessions'; state.ptEx = null; state.search = ''; render(); window.scrollTo(0, 0); },
  'pt-back': () => { state.ptClient = null; render(); window.scrollTo(0, 0); },
  'pt-tab': d => { state.ptTab = d.t; render(); },
  'pt-ex': d => { state.ptEx = d.k; render(); },
  'pt-inactive': () => { state.ptShowInactive = !state.ptShowInactive; render(); },
  'pt-del': d => confirmModal('Borrar cliente de personal', 'Se borrará su ficha y todas sus sesiones de personal. Si es socio del centro, su ficha de socio no se toca. No se puede deshacer.', `data-a="pt-del-ok" data-id="${d.id}"`, 'Borrar'),
  'pt-del-ok': d => { db.ptSessions = db.ptSessions.filter(s => s.clientId !== d.id); db.ptClients = db.ptClients.filter(c => c.id !== d.id); state.ptClient = null; saveDB(); closeModal(); toast('Cliente borrado', 'ok'); render(); },
  'pt-sess-new': d => { state.ptPickQ = ''; openPtSession(newPtSession(d.id)); },
  'pt-sess-edit': d => { const s = db.ptSessions.find(x => x.id === d.id); if (s) { state.ptPickQ = ''; openPtSession(JSON.parse(JSON.stringify(s))); } },
  'pt-sess-dup': d => { const s = db.ptSessions.find(x => x.id === d.id); if (s) { state.ptPickQ = ''; openPtSession(ptFrom(s)); } },
  'pt-sess-del': d => confirmModal('Borrar sesión', 'Se borrará esta sesión con sus ejercicios y cargas.', `data-a="pt-sess-del-ok" data-id="${d.id}"`, 'Borrar'),
  'pt-sess-del-ok': d => { db.ptSessions = db.ptSessions.filter(s => s.id !== d.id); saveDB(); closeModal(); render(); },
  'pt-sess-cancel': () => { state.ptDraft = null; closeModal(); },
  'pt-repeat': d => openPtRepeat(d.id),
  'pt-repeat-ok': d => { const s = db.ptSessions.find(x => x.id === d.id); if (s) { state.ptPickQ = ''; openPtSession(ptFrom(s)); } },
  'pt-ex-add': () => { readPtForm(); state.ptDraft.exercises.push({ name: '', sets: '', reps: '', kg: '', notes: '' }); redrawPt(true); },
  'pt-pick': d => {
    readPtForm(); const ex = state.ptDraft.exercises; const empty = ex.findIndex(e => !normEx(e.name));
    // si ya lo hizo antes, se rellenan series, reps y carga de la última vez
    const last = ptLastFor(state.ptDraft.clientId, d.n, state.ptDraft.date, state.ptDraft.id);
    const row = { name: d.n, sets: last?.e.sets ?? '', reps: last?.e.reps ?? '', kg: last?.e.kg ?? '', notes: '' };
    if (empty >= 0) ex[empty] = row; else ex.push(row);
    redrawPt();
  },
  'pt-ex-rm': d => { readPtForm(); state.ptDraft.exercises.splice(Number(d.i), 1); redrawPt(); },
  'pt-ex-up': d => { readPtForm(); const a = state.ptDraft.exercises, i = Number(d.i); if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]]; redrawPt(); },
  'pt-ex-down': d => { readPtForm(); const a = state.ptDraft.exercises, i = Number(d.i); if (i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]]; redrawPt(); },
});
Object.assign(forms, {
  'pt-client': (f, form) => {
    const id = form.dataset.id || null;
    const kind = f.get('kind');
    const data = { goal: f.get('goal').trim(), days: f.get('days').trim(), notes: f.get('notes').trim() };
    if (kind === 'member') {
      const mid = f.get('memberId'); if (!mid) return toast('Elige un socio', 'err');
      const u = getUser(mid); Object.assign(data, { memberId: mid, name: u.name, phone: '', email: '' });
    } else Object.assign(data, { memberId: null, name: f.get('name').trim(), phone: f.get('phone').trim(), email: f.get('email').trim() });
    if (id) { Object.assign(db.ptClients.find(c => c.id === id), data, { active: f.get('active') === 'on' }); }
    else { const c = { id: uid(), active: true, createdAt: new Date().toISOString(), ...data }; db.ptClients.push(c); state.ptClient = c.id; state.ptTab = 'sessions'; }
    saveDB(); closeModal(); toast('Cliente guardado', 'ok'); render();
  },
  'pt-session': () => { savePtSession(); closeModal(); toast('✅ Sesión guardada', 'ok'); render(); },
});
