// ============================================================
// Pestaña «Turnos»: los turnos se detectan solos a partir de los grupos fijos.
// Un turno = una hora + unos días (p. ej. 9:15 L-X-V «tres días», 9:15 M-J «dos días»).
// Se ve quién está en cada uno, cuántos son y cuántos huecos quedan.
// ============================================================
const ORD = w => (w + 6) % 7;            // lunes primero
const DAYS_TXT = n => ({ 1: 'un día', 2: 'dos días', 3: 'tres días', 4: 'cuatro días', 5: 'cinco días', 6: 'seis días', 7: 'siete días' }[n] || `${n} días`);

function buildTurns() {
  const slotsAt = {};                      // hora → { díaSemana → horario }
  db.schedule.forEach(t => { if (getClassType(t.classTypeId)) (slotsAt[t.time] = slotsAt[t.time] || {})[t.weekday] = t; });
  // días de cada socio a cada hora
  const pattern = {};                      // socio → hora → Set(días)
  db.schedule.forEach(t => (t.members || []).forEach(uid_ => {
    const u = getUser(uid_); if (!u || u.role !== 'client') return;
    ((pattern[uid_] = pattern[uid_] || {})[t.time] = pattern[uid_][t.time] || new Set()).add(t.weekday);
  }));
  const turns = new Map();
  Object.entries(pattern).forEach(([uid_, times]) => Object.entries(times).forEach(([time, set]) => {
    const days = [...set].sort((a, b) => ORD(a) - ORD(b));
    const key = time + '|' + days.join('');
    if (!turns.has(key)) turns.set(key, { key, time, days, members: [] });
    turns.get(key).members.push(getUser(uid_));
  }));
  // horarios que no tienen a nadie: también se enseñan (turno vacío a esa hora)
  Object.entries(slotsAt).forEach(([time, byDay]) => {
    const empty = Object.values(byDay).filter(t => !(t.members || []).some(id => getUser(id)?.role === 'client')).map(t => t.weekday).sort((a, b) => ORD(a) - ORD(b));
    if (empty.length) { const key = time + '|' + empty.join('') + '|vacio'; turns.set(key, { key, time, days: empty, members: [], empty: true }); }
  });
  // plazas: en cada día del turno, lo que queda libre en ese horario (compartido con otros turnos a la misma hora)
  const list = [...turns.values()].map(tn => {
    const perDay = tn.days.map(w => { const t = slotsAt[tn.time]?.[w]; const cap = t ? slotCapacity(t) : 0; const used = t ? (t.members || []).filter(id => getUser(id)?.role === 'client').length : 0; return { w, t, cap, used, free: cap - used }; });
    const free = perDay.length ? Math.min(...perDay.map(d => d.free)) : 0;
    const cap = perDay.length ? Math.min(...perDay.map(d => d.cap)) : 0;
    const shared = perDay.some(d => d.used > tn.members.length);
    tn.members.sort((a, b) => a.name.localeCompare(b.name));
    // socios con más días que su tarifa (p. ej. apuntados a los dos grupos de las 18:30 = 5 días con tarifa de 3)
    const tooMany = tn.members.filter(m => { const p = getPlan(m.planId); return p?.type === 'weekly' && p.perWeek && tn.days.length > p.perWeek; });
    return { ...tn, perDay, free, cap, shared, tooMany, color: perDay.find(d => d.t)?.t ? slotColor(perDay.find(d => d.t).t) : '#2F5D8A' };
  });
  return list.sort((a, b) => a.time.localeCompare(b.time) || b.days.length - a.days.length || a.days.join('').localeCompare(b.days.join('')));
}

function viewAdminTurns() {
  const turns = buildTurns();
  const q = norm2(state.search);
  const withPeople = turns.filter(t => !t.empty);
  const totalMembers = new Set(withPeople.flatMap(t => t.members.map(m => m.id))).size;
  const totalFree = withPeople.reduce((a, t) => a + Math.max(0, t.free), 0);
  const noTurn = realClients().filter(c => c.active && !db.schedule.some(t => (t.members || []).includes(c.id)));
  const show = state.turnsShowEmpty ? turns : withPeople;
  const shown = q ? show.filter(t => t.members.some(m => norm2(m.name).includes(q))) : show;
  const card = tn => {
    const pct = tn.cap ? Math.min(100, Math.round(tn.members.length / tn.cap * 100)) : 0;
    const freeCls = tn.free <= 0 ? 'danger' : tn.free <= 2 ? 'warn' : 'ok';
    const editing = state.turnEdit === tn.key;
    const sel = state.turnSel || new Set();
    const targets = moveTargets(tn, turns);
    return `<div class="card turn-card ${tn.empty ? 'is-empty' : ''}" style="--c:${tn.color}">
      <div class="turn-head">
        <div><div class="turn-title">${tn.empty ? `HORARIO ${tn.time.replace(/^0/, '')} <span>· sin socios</span>` : `TURNO ${tn.time.replace(/^0/, '')} <span>· ${DAYS_TXT(tn.days.length)}</span>`}</div>
          <div class="muted small">${tn.days.map(w => DOW_LONG[w]).join(', ')}${tn.empty ? ' · sin socios todavía' : ''}</div></div>
        <div class="turn-nums">
          <div><b>${tn.members.length}</b><span>${tn.members.length === 1 ? 'socio' : 'socios'}</span></div>
          <div><b class="${freeCls}">${Math.max(0, tn.free)}</b><span>${tn.free === 1 ? 'hueco' : 'huecos'}</span></div>
        </div>
      </div>
      <div class="sx-bar" style="margin:10px 0 8px"><i class="${tn.free <= 0 ? 'full' : ''}" style="width:${pct}%;--c:${tn.color}"></i></div>
      <div class="turn-days">${tn.perDay.map(d => `<span class="${d.free <= 0 ? 'full' : ''}" title="${DOW_LONG[d.w]}: ${d.used} de ${d.cap} plazas ocupadas por grupos fijos">${DAY_LETTER[d.w]} ${d.used}/${d.cap}</span>`).join('')}
        ${tn.free < 0 ? `<span class="over">⚠️ ${-tn.free} por encima del aforo</span>` : ''}</div>
      ${tn.shared ? '<p class="muted small" style="margin:6px 0 0">Los huecos se comparten con otros socios que vienen a esa hora otros días.</p>' : ''}
      ${tn.tooMany.length ? `<div class="turn-warn">⚠️ <b>${tn.tooMany.length === tn.members.length ? (tn.members.length === 1 ? 'El socio de este turno está apuntado' : 'Todos los socios de este turno están apuntados') : `${tn.tooMany.length} ${tn.tooMany.length === 1 ? 'socio está apuntado' : 'socios están apuntados'}`} a ${tn.days.length} días</b> pero su tarifa es de menos días.
        Seguramente están en los dos grupos de las ${tn.time.replace(/^0/, '')}. Pulsa <b>✏️ Organizar</b> y pásalos a su turno.</div>` : ''}
      ${editing ? `<div class="turn-move">
        <div class="small"><b>${sel.size}</b> marcados · <button class="linkish" data-a="turn-sel-all" data-k="${tn.key}">marcar todos</button> · <button class="linkish" data-a="turn-sel-none">ninguno</button></div>
        <div class="row wrap" style="gap:6px;margin-top:8px"><span class="small muted">Pasar a:</span>${targets.map(tg => `<button class="btn sm primary" data-a="turn-move" data-t="${tn.time}" data-days="${tg.days.join('')}" ${sel.size ? '' : 'disabled'}>${esc(tg.label)}</button>`).join('')}
          <button class="btn sm" data-a="turn-move-pick" data-t="${tn.time}" ${sel.size ? '' : 'disabled'}>Elegir días…</button></div>
        <p class="muted small" style="margin:6px 0 0">Se les quita de los días que no correspondan (y de esas clases ya reservadas) y se les mete en los nuevos. Sin enviarles avisos.</p></div>` : ''}
      ${tn.members.length ? `<div class="turn-members">${tn.members.map((m, i) => {
        const p = getPlan(m.planId);
        const flag = tn.tooMany.includes(m);
        return `<div class="turn-m clickable ${q && norm2(m.name).includes(q) ? 'hit' : ''}" data-a="${editing ? 'turn-sel' : 'client-open'}" data-id="${m.id}">
          ${editing ? `<input type="checkbox" ${sel.has(m.id) ? 'checked' : ''} style="pointer-events:none;width:17px;height:17px;flex:none">` : `<span class="n">${i + 1}</span>`}
          <span class="grow ellipsis">${esc(m.name)}</span>
          ${flag ? `<span class="mtag warn" title="Su tarifa es de ${p.perWeek} días">${p.perWeek} días</span>` : ''}
          ${m.blocked ? '<span class="mtag danger">🔒</span>' : m.paymentDue ? '<span class="mtag warn">💶</span>' : ''}${!p ? '<span class="mtag">Sin tarifa</span>' : ''}</div>`;
      }).join('')}</div>` : ''}
      <div class="row wrap" style="gap:6px;margin-top:10px">
        ${tn.members.length ? `<button class="btn sm ${editing ? 'primary' : ''}" data-a="turn-edit" data-k="${tn.key}">${editing ? '✓ Terminar' : '✏️ Organizar'}</button>` : ''}
        ${tn.perDay.filter(d => d.t).map(d => `<button class="btn sm ghost" data-a="slot-open" data-id="${d.t.id}">Grupo del ${DOW_LONG[d.w].toLowerCase()}</button>`).join('')}</div>
    </div>`;
  };
  return `
    <div class="page-title"><h1>Turnos</h1><div class="row wrap">
      <label class="check" style="margin:0"><input type="checkbox" data-a="turns-empty" ${state.turnsShowEmpty ? 'checked' : ''}> Ver también horarios sin socios</label>
      <button class="btn" data-a="turns-print">🖨️ Imprimir</button></div></div>
    <div class="grid-stats">
      <div class="card kpi money" style="--k:#2F5D8A"><div class="kpi-ic">🕘</div><div><div class="v">${withPeople.length}</div><div class="l">Turnos con socios</div></div></div>
      <div class="card kpi money" style="--k:#1F7A45"><div class="kpi-ic">👥</div><div><div class="v">${totalMembers}</div><div class="l">Socios en turnos</div></div></div>
      <div class="card kpi money" style="--k:#E8890C"><div class="kpi-ic">🟢</div><div><div class="v">${totalFree}</div><div class="l">Huecos libres</div></div></div>
      <div class="card kpi money clickable" style="--k:#C0392B" data-a="turns-noturn"><div class="kpi-ic">❓</div><div><div class="v">${noTurn.length}</div><div class="l">Socios sin turno</div></div></div>
    </div>
    <input class="search" placeholder="Buscar un socio en los turnos…" value="${esc(state.search)}" data-input="search">
    ${shown.length ? `<div class="turn-grid">${shown.map(card).join('')}</div>`
      : `<div class="card empty">${q ? 'Ningún turno tiene a ese socio.' : 'Todavía no hay turnos con socios. Mete a los socios en sus grupos desde Clientes (☑️ Seleccionar → 👥 Meter en grupo) o desde Clases.'}</div>`}`;
}

// A qué turnos se puede pasar a alguien desde este: los otros turnos a esa hora y, si existen esos
// horarios, los habituales del centro (L-X-V tres días y M-J dos días)
function moveTargets(tn, turns) {
  const at = new Set(db.schedule.filter(t => t.time === tn.time).map(t => t.weekday));
  const out = new Map();
  const add = days => { days = days.filter(w => at.has(w)).sort((a, b) => ORD(a) - ORD(b)); if (!days.length || days.join('') === tn.days.join('')) return;
    out.set(days.join(''), { days, label: `${days.map(w => DAY_LETTER[w]).join('-')} (${DAYS_TXT(days.length)})` }); };
  turns.filter(t => t.time === tn.time && !t.empty && t.key !== tn.key && t.days.length < tn.days.length).forEach(t => add(t.days));
  if ([1, 3, 5].every(w => at.has(w))) add([1, 3, 5]);
  if ([2, 4].every(w => at.has(w))) add([2, 4]);
  return [...out.values()].sort((a, b) => b.days.length - a.days.length);
}
// Deja a cada socio a esa hora solo en los días indicados (sin avisos)
function moveToDays(userIds, time, days) {
  const want = new Set(days);
  let moved = 0;
  userIds.forEach(uid_ => {
    db.schedule.filter(t => t.time === time).forEach(t => {
      const inIt = (t.members || []).includes(uid_);
      if (inIt && !want.has(t.weekday)) removeGroupMember(t.id, uid_, { removeFuture: true, email: false, app: false });
      if (!inIt && want.has(t.weekday)) addGroupMember(t.id, uid_, { email: false, app: false });
    });
    moved++;
  });
  saveDB();
  return moved;
}
function openMovePick(time) {
  const days = db.schedule.filter(t => t.time === time).map(t => t.weekday).sort((a, b) => ORD(a) - ORD(b));
  openModal(`${modalHead(`Elegir días · ${time.replace(/^0/, '')}`)}
    <p class="muted" style="margin-top:-8px">Los ${(state.turnSel || new Set()).size} socios marcados quedarán a las ${time.replace(/^0/, '')} solo los días que marques.</p>
    <div class="row wrap" style="gap:6px">${days.map(w => `<label class="tab-radio"><input type="checkbox" name="mp-day" value="${w}"><span>${DOW_LONG[w]}</span></label>`).join('')}</div>
    <div class="modal-actions"><button class="btn" data-a="close">Cancelar</button><button class="btn primary" data-a="turn-move-pick-ok" data-t="${time}">Guardar</button></div>`);
}

// Hoja para imprimir: un turno por bloque con sus socios
function printTurns() {
  const turns = buildTurns().filter(t => !t.empty);
  const w = window.open('', '_blank');
  if (!w) return toast('Permite las ventanas emergentes para imprimir', 'err');
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Turnos · ${esc(db.settings.centerName)}</title>
    <style>body{font-family:system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:#666}
    .g{columns:3 240px;column-gap:18px}.t{break-inside:avoid;border:1px solid #ccc;border-radius:8px;padding:10px 12px;margin:0 0 14px}
    .t h2{font-size:15px;margin:0}.t .s{font-size:12px;color:#555;margin:2px 0 6px}ol{margin:0;padding-left:20px;font-size:13px;line-height:1.5}</style></head><body>
    <h1>Turnos · ${esc(db.settings.centerName)}</h1><p>${fmtDateLong(dateKey(new Date()))}</p><div class="g">
    ${turns.map(t => `<div class="t"><h2>TURNO ${t.time.replace(/^0/, '')} · ${DAYS_TXT(t.days.length)} (${t.days.map(x => DAY_LETTER[x]).join('-')})</h2>
      <div class="s">${t.members.length} socios · ${Math.max(0, t.free)} huecos</div><ol>${t.members.map(m => `<li>${esc(m.name)}</li>`).join('')}</ol></div>`).join('')}
    </div><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

Object.assign(actions, {
  'turns-empty': (d, el) => { state.turnsShowEmpty = !state.turnsShowEmpty; render(); },
  'turns-print': () => printTurns(),
  'turn-edit': d => { state.turnEdit = state.turnEdit === d.k ? null : d.k; state.turnSel = new Set(); render(); },
  'turn-sel': d => { const s = state.turnSel = state.turnSel || new Set(); s.has(d.id) ? s.delete(d.id) : s.add(d.id); render(); },
  'turn-sel-all': d => { const tn = buildTurns().find(t => t.key === d.k); state.turnSel = new Set((tn?.members || []).map(m => m.id)); render(); },
  'turn-sel-none': () => { state.turnSel = new Set(); render(); },
  'turn-move': d => {
    const ids = [...(state.turnSel || [])]; if (!ids.length) return;
    const days = d.days.split('').map(Number);
    moveToDays(ids, d.t, days);
    toast(`${ids.length} socio(s) pasados a ${days.map(w => DAY_LETTER[w]).join('-')} ${d.t.replace(/^0/, '')}`, 'ok');
    state.turnSel = new Set(); state.turnEdit = null; render();
  },
  'turn-move-pick': d => openMovePick(d.t),
  'turn-move-pick-ok': d => {
    const days = [...document.querySelectorAll('input[name="mp-day"]:checked')].map(x => Number(x.value));
    if (!days.length) return toast('Marca al menos un día', 'err');
    const ids = [...(state.turnSel || [])];
    moveToDays(ids, d.t, days);
    toast(`${ids.length} socio(s) cambiados de días`, 'ok');
    state.turnSel = new Set(); state.turnEdit = null; closeModal(); render();
  },
  'turns-noturn': () => { state.view = 'a-clients'; state.clientsTab = 'clients'; state.clientFilter = 'nogroup'; state.search = ''; render(); window.scrollTo(0, 0); },
});
