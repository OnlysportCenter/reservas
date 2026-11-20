// ============================================================
// Pestaña «Turnos»: una tarjeta por hora (9:15, 10:30, 17:30…) con todos los socios que vienen
// a esa hora. Cada socio lleva sus casillas L M X J V: encendida = viene ese día (está en el
// grupo fijo de ese día a esa hora). Pulsar una casilla le mete o le quita de ese día.
// Los socios se ordenan por sus días (primero los de más días) en apartados: «L · X · V», «Solo X»…
// ============================================================
const ORD = w => (w + 6) % 7;            // lunes primero
const hhmm = t => t.replace(/^0/, '');
const isClient = id => getUser(id)?.role === 'client';

// Días que se enseñan como columnas: lunes a viernes, y sábado/domingo solo si hay clases fijas esos días
function turnColumns() {
  const cols = [1, 2, 3, 4, 5];
  [6, 0].forEach(w => { if (db.schedule.some(t => t.weekday === w && getClassType(t.classTypeId))) cols.push(w); });
  return cols;
}

// Días fijos que tiene cada socio en total (todas las horas)
function fixedDaysCount() {
  const n = {};
  db.schedule.forEach(t => (t.members || []).forEach(id => { n[id] = (n[id] || 0) + 1; }));
  return n;
}

function patternLabel(days) {
  if (!days.length) return 'Sin días';
  if (days.length === 1) return `Solo ${DOW_LONG[days[0]].toLowerCase()}`;
  return days.map(w => DAY_LETTER[w]).join(' · ');
}

function buildHours() {
  const cols = turnColumns();
  const byTime = {};
  db.schedule.forEach(t => {
    if (!getClassType(t.classTypeId)) return;
    const h = byTime[t.time] = byTime[t.time] || { time: t.time, slots: {}, people: new Map() };
    h.slots[t.weekday] = t;
    (t.members || []).forEach(id => {
      if (!isClient(id)) return;
      if (!h.people.has(id)) h.people.set(id, new Set());
      h.people.get(id).add(t.weekday);
    });
  });
  return Object.values(byTime).map(h => {
    const perDay = cols.map(w => {
      const t = h.slots[w];
      if (!t) return { w, t: null };
      const cap = slotCapacity(t), used = (t.members || []).filter(isClient).length;
      return { w, t, cap, used, free: cap - used };
    });
    const members = [...h.people.entries()].map(([id, set]) => ({ u: getUser(id), days: [...set].sort((a, b) => ORD(a) - ORD(b)) }));
    // orden: primero los que vienen más días; a igualdad, por días (L antes que M…) y luego por nombre
    members.sort((a, b) => b.days.length - a.days.length || a.days.map(ORD).join('').localeCompare(b.days.map(ORD).join('')) || a.u.name.localeCompare(b.u.name));
    const groups = [];
    members.forEach(m => {
      const k = m.days.join('');
      let g = groups[groups.length - 1];
      if (!g || g.k !== k) groups.push(g = { k, label: patternLabel(m.days), members: [] });
      g.members.push(m);
    });
    const open = perDay.filter(d => d.t);
    const free = open.reduce((a, d) => a + Math.max(0, d.free), 0);
    const anyT = open[0]?.t;
    return { time: h.time, perDay, members, groups, free, over: open.some(d => d.free < 0), color: anyT ? slotColor(anyT) : '#2F5D8A' };
  }).sort((a, b) => a.time.localeCompare(b.time));
}

function viewAdminTurns() {
  const hours = buildHours();
  const cols = turnColumns();
  const q = norm2(state.search);
  const withPeople = hours.filter(h => h.members.length);
  const totalMembers = new Set(withPeople.flatMap(h => h.members.map(m => m.u.id))).size;
  const totalFree = withPeople.reduce((a, h) => a + h.free, 0);
  const noTurn = realClients().filter(c => c.active && !db.schedule.some(t => (t.members || []).includes(c.id)));
  const nDays = fixedDaysCount();
  const show = state.turnsShowEmpty ? hours : withPeople;
  const shown = q ? show.filter(h => h.members.some(m => norm2(m.u.name).includes(q))) : show;

  const card = h => {
    const freeCls = h.free <= 0 ? 'danger' : h.free <= 3 ? 'warn' : 'ok';
    let i = 0;
    const row = m => {
      const p = getPlan(m.u.planId);
      const total = nDays[m.u.id] || 0;
      const tooMany = p?.type === 'weekly' && p.perWeek && total > p.perWeek;
      const set = new Set(m.days);
      i++;
      return `<div class="turn-m ${q && norm2(m.u.name).includes(q) ? 'hit' : ''}">
        <span class="n">${i}</span>
        <span class="grow ellipsis clickable" data-a="client-open" data-id="${m.u.id}" title="Abrir ficha">${esc(m.u.name)}</span>
        ${tooMany ? `<span class="mtag warn" title="Viene ${total} días en total y su tarifa es de ${p.perWeek}">${total}/${p.perWeek} días</span>` : ''}
        ${m.u.blocked ? '<span class="mtag danger">🔒</span>' : m.u.paymentDue ? '<span class="mtag warn">💶</span>' : ''}${!p ? '<span class="mtag">Sin tarifa</span>' : ''}
        <span class="turn-dbox">${h.perDay.map(d => d.t
          ? `<button class="${set.has(d.w) ? 'on' : ''}" data-a="turn-day" data-t="${h.time}" data-w="${d.w}" data-id="${m.u.id}" title="${set.has(d.w) ? 'Viene' : 'No viene'} el ${DOW_LONG[d.w].toLowerCase()} · pulsa para ${set.has(d.w) ? 'quitarle' : 'apuntarle'}">${DAY_LETTER[d.w]}</button>`
          : `<button class="na" disabled title="No hay clase el ${DOW_LONG[d.w].toLowerCase()} a las ${hhmm(h.time)}">${DAY_LETTER[d.w]}</button>`).join('')}</span>
      </div>`;
    };
    return `<div class="card turn-card ${h.members.length ? '' : 'is-empty'}" style="--c:${h.color}">
      <div class="turn-head">
        <div><div class="turn-title">TURNO ${hhmm(h.time)}</div>
          <div class="muted small">${h.groups.length > 1 ? `${h.groups.length} combinaciones de días` : h.groups.length ? h.groups[0].label : 'Sin socios todavía'}</div></div>
        <div class="turn-nums">
          <div><b>${h.members.length}</b><span>${h.members.length === 1 ? 'socio' : 'socios'}</span></div>
          <div><b class="${freeCls}">${h.free}</b><span>huecos/sem.</span></div>
        </div>
      </div>
      <div class="turn-days turn-days-grid" style="--n:${cols.length}">${h.perDay.map(d => d.t
        ? `<button class="${d.free <= 0 ? 'full' : ''}" data-a="slot-open" data-id="${d.t.id}" title="${DOW_LONG[d.w]}: ${d.used} de ${d.cap} plazas ocupadas por fijos · pulsa para abrir el grupo"><b>${DAY_LETTER[d.w]}</b>${d.used}/${d.cap}</button>`
        : `<span class="na" title="No hay clase el ${DOW_LONG[d.w].toLowerCase()} a esta hora"><b>${DAY_LETTER[d.w]}</b>—</span>`).join('')}</div>
      ${h.over ? '<div class="turn-warn">⚠️ Algún día está por encima del aforo.</div>' : ''}
      ${h.members.length ? `<div class="turn-members">${h.groups.map(g => `
        <div class="turn-sub"><span>${esc(g.label)}</span><span>${g.members.length}</span></div>
        ${g.members.map(row).join('')}`).join('')}</div>` : ''}
    </div>`;
  };
  return `
    <div class="page-title"><h1>Turnos</h1><div class="row wrap">
      <label class="check" style="margin:0"><input type="checkbox" data-a="turns-empty" ${state.turnsShowEmpty ? 'checked' : ''}> Ver también horarios sin socios</label>
      <button class="btn" data-a="turns-print">🖨️ Imprimir</button></div></div>
    <div class="grid-stats">
      <div class="card kpi money" style="--k:#2F5D8A"><div class="kpi-ic">🕘</div><div><div class="v">${withPeople.length}</div><div class="l">Turnos con socios</div></div></div>
      <div class="card kpi money" style="--k:#1F7A45"><div class="kpi-ic">👥</div><div><div class="v">${totalMembers}</div><div class="l">Socios en turnos</div></div></div>
      <div class="card kpi money" style="--k:#E8890C"><div class="kpi-ic">🟢</div><div><div class="v">${totalFree}</div><div class="l">Huecos libres por semana</div></div></div>
      <div class="card kpi money clickable" style="--k:#C0392B" data-a="turns-noturn"><div class="kpi-ic">❓</div><div><div class="v">${noTurn.length}</div><div class="l">Socios sin turno</div></div></div>
    </div>
    <p class="muted small" style="margin:0 0 8px">Las casillas de cada socio son los días que viene a esa hora. Pulsa una para apuntarle o quitarle ese día (sin enviarle avisos). Pulsa el nombre para abrir su ficha.</p>
    <input class="search" placeholder="Buscar un socio en los turnos…" value="${esc(state.search)}" data-input="search">
    ${shown.length ? `<div class="turn-grid">${shown.map(card).join('')}</div>`
      : `<div class="card empty">${q ? 'Ningún turno tiene a ese socio.' : 'Todavía no hay turnos con socios. Mete a los socios en sus grupos desde Clientes (☑️ Seleccionar → 👥 Meter en grupo) o desde Clases.'}</div>`}`;
}

// Apunta o quita a un socio de un día concreto a una hora (sin avisos)
function toggleTurnDay(userId, time, weekday) {
  const t = db.schedule.find(s => s.time === time && s.weekday === weekday);
  const u = getUser(userId);
  if (!t || !u) return;
  const day = DOW_LONG[weekday].toLowerCase();
  if ((t.members || []).includes(userId)) {
    removeGroupMember(t.id, userId, { removeFuture: true, email: false, app: false });
    toast(`${u.name.split(' ')[0]} ya no viene el ${day} a las ${hhmm(time)}`, 'ok');
  } else {
    const used = (t.members || []).filter(isClient).length;
    addGroupMember(t.id, userId, { email: false, app: false });
    const p = getPlan(u.planId), total = fixedDaysCount()[userId] || 0;
    if (used >= slotCapacity(t)) toast(`Apuntado el ${day}, pero ese grupo ya estaba lleno (${used}/${slotCapacity(t)})`, 'err');
    else if (p?.type === 'weekly' && p.perWeek && total > p.perWeek) toast(`Apuntado el ${day}. Ojo: ahora viene ${total} días y su tarifa es de ${p.perWeek}`, 'err');
    else toast(`${u.name.split(' ')[0]} viene el ${day} a las ${hhmm(time)}`, 'ok');
  }
  saveDB();
}

// Hoja para imprimir: un bloque por hora con sus socios y los días que viene cada uno
function printTurns() {
  const hours = buildHours().filter(h => h.members.length);
  const w = window.open('', '_blank');
  if (!w) return toast('Permite las ventanas emergentes para imprimir', 'err');
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Turnos · ${esc(db.settings.centerName)}</title>
    <style>body{font-family:system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:#666}
    .g{columns:3 260px;column-gap:18px}.t{break-inside:avoid;border:1px solid #ccc;border-radius:8px;padding:10px 12px;margin:0 0 14px}
    .t h2{font-size:15px;margin:0}.t .s{font-size:12px;color:#555;margin:2px 0 6px}table{border-collapse:collapse;width:100%;font-size:12.5px}
    td{padding:2px 0;border-bottom:1px solid #eee}td.d{width:16px;text-align:center;font-weight:700;color:#bbb}td.d.on{color:#111}
    tr.h td{font-weight:700;color:#555;padding-top:6px;border-bottom:1px solid #ccc}</style></head><body>
    <h1>Turnos · ${esc(db.settings.centerName)}</h1><p>${fmtDateLong(dateKey(new Date()))}</p><div class="g">
    ${hours.map(h => `<div class="t"><h2>TURNO ${hhmm(h.time)}</h2>
      <div class="s">${h.members.length} socios · ${h.perDay.filter(d => d.t).map(d => `${DAY_LETTER[d.w]} ${d.used}/${d.cap}`).join(' · ')}</div>
      <table>${h.groups.map(g => `<tr class="h"><td colspan="${1 + h.perDay.length}">${esc(g.label)} (${g.members.length})</td></tr>
        ${g.members.map(m => `<tr><td>${esc(m.u.name)}</td>${h.perDay.map(d => `<td class="d ${m.days.includes(d.w) ? 'on' : ''}">${d.t ? (m.days.includes(d.w) ? DAY_LETTER[d.w] : '·') : ''}</td>`).join('')}</tr>`).join('')}`).join('')}</table></div>`).join('')}
    </div></body></html>`);
  w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400);
}

Object.assign(actions, {
  'turns-empty': () => { state.turnsShowEmpty = !state.turnsShowEmpty; render(); },
  'turns-print': () => printTurns(),
  'turn-day': d => { const y = window.scrollY; toggleTurnDay(d.id, d.t, Number(d.w)); render(); window.scrollTo(0, y); },
  'turns-noturn': () => { state.view = 'a-clients'; state.clientsTab = 'clients'; state.clientFilter = 'nogroup'; state.search = ''; render(); window.scrollTo(0, 0); },
});
