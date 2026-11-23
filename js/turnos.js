// ============================================================
// Pestaña «Turnos»: una tarjeta por turno. A una misma hora puede haber varios (9:15 L-X-V «tres días»
// y 9:15 M-J «dos días»); se detectan por los días que comparten los socios (ver splitHour). Cada socio lleva sus casillas L M X J V: encendida = viene ese día (está en el
// grupo fijo de ese día a esa hora). Pulsar una casilla le mete o le quita de ese día.
// Los socios se ordenan por sus días (primero los de más días) en apartados: «L · X · V», «Solo X»…
// ============================================================
const ORD = w => (w + 6) % 7;            // lunes primero
const DAYS_TXT = n => ({ 1: 'un día', 2: 'dos días', 3: 'tres días', 4: 'cuatro días', 5: 'cinco días', 6: 'seis días' }[n] || `${n} días`);
const hhmm = t => t.replace(/^0/, '');
const isClient = id => getUser(id)?.role === 'client';

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
  return Object.values(byTime).flatMap(h => splitHour(h).map(days => ({ ...h, days, split: days.split })))
    .map(h => {
    const inG = new Set(h.days);
    const perDay = h.days.map(w => {
      const t = h.slots[w];
      const cap = slotCapacity(t), used = (t.members || []).filter(isClient).length;
      return { w, t, cap, used, free: cap - used };
    });
    const members = [...h.people.entries()]
      .map(([id, set]) => { const all = [...set].sort((a, b) => ORD(a) - ORD(b)); return { u: getUser(id), days: all.filter(w => inG.has(w)), other: all.filter(w => !inG.has(w)) }; })
      .filter(m => m.days.length);
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
    return { key: h.time + '|' + h.days.join(''), time: h.time, days: h.days, split: h.split, perDay, members, groups, free, over: open.some(d => d.free < 0), color: anyT ? slotColor(anyT) : '#2F5D8A' };
  }).sort((a, b) => a.time.localeCompare(b.time) || b.days.length - a.days.length || ORD(a.days[0]) - ORD(b.days[0]));
}

// Reparte los días de una hora en turnos (p. ej. 9:15 → L-X-V «tres días» y M-J «dos días»).
// Un turno es una combinación de días que comparten varios socios; se cogen de la más repetida
// a la menos, sin que se pisen. Los días que no encajan en ninguna quedan como un turno aparte.
function splitHour(h) {
  const all = Object.keys(h.slots).map(Number).sort((a, b) => ORD(a) - ORD(b));
  const freq = new Map();
  h.people.forEach(set => { const k = [...set].sort((a, b) => ORD(a) - ORD(b)).join(''); freq.set(k, (freq.get(k) || 0) + 1); });
  const pats = [...freq.entries()].map(([k, n]) => ({ days: k.split('').map(Number), n }))
    .sort((a, b) => b.n - a.n || b.days.length - a.days.length);
  const used = new Set(), turns = [];
  pats.forEach((p, i) => {
    if (p.days.length < 2 && turns.length) return;               // un solo día no forma turno propio si ya hay otro
    if ((p.n >= 2 || i === 0) && p.days.every(w => !used.has(w))) { turns.push(p.days); p.days.forEach(w => used.add(w)); }
  });
  const rest = all.filter(w => !used.has(w));
  if (rest.length) turns.push(rest);
  const out = turns.length ? turns : [all];
  return out.map(d => Object.assign([...d], { split: out.length > 1 }));
}

function viewAdminTurns() {
  if (state.turnOpen) { const v = viewTurnDetail(); if (v) return v; }
  const hours = buildHours();
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
        ${m.other.length ? `<span class="mtag" title="También viene a las ${hhmm(h.time)} el ${m.other.map(w => DOW_LONG[w].toLowerCase()).join(' y el ')} (en el otro turno de esta hora)">+${m.other.map(w => DAY_LETTER[w]).join('')}</span>` : ''}
        ${m.u.blocked ? '<span class="mtag danger">🔒</span>' : m.u.paymentDue ? '<span class="mtag warn">💶</span>' : ''}${!p ? '<span class="mtag">Sin tarifa</span>' : ''}
        <span class="turn-dbox">${h.perDay.map(d => d.t
          ? `<button class="${set.has(d.w) ? 'on' : ''}" data-a="turn-day" data-t="${h.time}" data-w="${d.w}" data-id="${m.u.id}" title="${set.has(d.w) ? 'Viene' : 'No viene'} el ${DOW_LONG[d.w].toLowerCase()} · pulsa para ${set.has(d.w) ? 'quitarle' : 'apuntarle'}">${DAY_LETTER[d.w]}</button>`
          : `<button class="na" disabled title="No hay clase el ${DOW_LONG[d.w].toLowerCase()} a las ${hhmm(h.time)}">${DAY_LETTER[d.w]}</button>`).join('')}</span>
      </div>`;
    };
    return `<div class="card turn-card ${h.members.length ? '' : 'is-empty'}" style="--c:${h.color}">
      <div class="turn-head clickable" data-a="turn-open" data-t="${h.time}" data-d="${h.days.join('')}" title="Abrir el turno en grande">
        <div><div class="turn-title">TURNO ${hhmm(h.time)} <span>· ${DAYS_TXT(h.days.length)}</span> <span class="turn-open-ic">⤢</span></div>
          <div class="muted small">${h.days.map(w => DOW_LONG[w]).join(', ')}${h.members.length ? '' : ' · sin socios todavía'}</div></div>
        <div class="turn-nums">
          <div><b>${h.members.length}</b><span>${h.members.length === 1 ? 'socio' : 'socios'}</span></div>
          <div><b class="${freeCls}">${h.free}</b><span>huecos/sem.</span></div>
        </div>
      </div>
      <div class="turn-days turn-days-grid" style="--n:${h.days.length}">${h.perDay.map(d => d.t
        ? `<button class="${d.free <= 0 ? 'full' : ''}" data-a="slot-open" data-id="${d.t.id}" title="${DOW_LONG[d.w]}: ${d.used} de ${d.cap} plazas ocupadas por fijos · pulsa para abrir el grupo"><b>${DAY_LETTER[d.w]}</b>${d.used}/${d.cap}</button>`
        : `<span class="na" title="No hay clase el ${DOW_LONG[d.w].toLowerCase()} a esta hora"><b>${DAY_LETTER[d.w]}</b>—</span>`).join('')}</div>
      ${h.over ? '<div class="turn-warn">⚠️ Algún día está por encima del aforo.</div>' : ''}
      ${h.members.length ? `<div class="turn-members">${h.groups.map(g => `
        <div class="turn-sub"><span>${esc(g.label)}</span><span>${g.members.length}</span></div>
        ${g.members.map(row).join('')}`).join('')}</div>` : ''}
      <button class="btn sm block" style="margin-top:10px" data-a="turn-open" data-t="${h.time}" data-d="${h.days.join('')}">⤢ Abrir en grande y organizar</button>
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
    <p class="muted small" style="margin:0 0 8px">Pulsa un turno para abrirlo en grande y organizarlo. Las casillas de cada socio son los días que viene a esa hora: pulsa una para apuntarle o quitarle ese día (sin enviarle avisos).</p>
    <input class="search" placeholder="Buscar un socio en los turnos…" value="${esc(state.search)}" data-input="search">
    ${shown.length ? `<div class="turn-grid">${shown.map(card).join('')}</div>`
      : `<div class="card empty">${q ? 'Ningún turno tiene a ese socio.' : 'Todavía no hay turnos con socios. Mete a los socios en sus grupos desde Clientes (☑️ Seleccionar → 👥 Meter en grupo) o desde Clases.'}</div>`}`;
}

// ---------- Turno en grande ----------
// Busca el turno abierto; si al reorganizar han cambiado sus días, el que más se le parezca a esa hora
function findTurn(hours, open) {
  const same = hours.filter(h => h.time === open.time);
  return same.find(h => h.days.join('') === open.days) ||
    same.map(h => ({ h, n: h.days.filter(w => open.days.includes(String(w))).length })).sort((a, b) => b.n - a.n)[0]?.h || null;
}

function viewTurnDetail() {
  const hours = buildHours();
  const h = findTurn(hours, state.turnOpen);
  if (!h) { state.turnOpen = null; return ''; }
  state.turnOpen = { time: h.time, days: h.days.join('') };
  const nDays = fixedDaysCount();
  const others = hours.filter(x => x.time === h.time && x !== h);
  const inTurn = new Set(h.members.map(m => m.u.id));
  const q = norm2(state.turnAddQ || '');
  const cands = q ? realClients().filter(c => c.active && !inTurn.has(c.id) && norm2(c.name).includes(q)).slice(0, 8) : [];
  const freeCls = h.free <= 0 ? 'danger' : h.free <= 3 ? 'warn' : 'ok';
  const dl = days => days.map(w => DAY_LETTER[w]).join('-');
  const dayTxt = dl(h.days);
  let i = 0;
  const row = m => {
    const p = getPlan(m.u.planId);
    const total = nDays[m.u.id] || 0;
    const tooMany = p?.type === 'weekly' && p.perWeek && total > p.perWeek;
    const set = new Set(m.days);
    i++;
    return `<div class="td-row">
      <span class="n">${i}</span>
      <div class="td-name"><button class="linkish" data-a="client-open" data-id="${m.u.id}">${esc(m.u.name)}</button>
        <div class="muted small">${p ? esc(p.name) : 'Sin tarifa'}${tooMany ? ` · <span class="mtag warn">${total} días con tarifa de ${p.perWeek}</span>` : ''}${m.other.length ? ` · <span class="mtag">también ${dl(m.other)} en el otro turno</span>` : ''}${m.u.blocked ? ' · <span class="mtag danger">🔒 Bloqueado</span>' : m.u.paymentDue ? ' · <span class="mtag warn">💶 Cuota pendiente</span>' : ''}</div></div>
      <span class="turn-dbox td-days">${h.perDay.map(d => `<button class="${set.has(d.w) ? 'on' : ''}" data-a="turn-day" data-t="${h.time}" data-w="${d.w}" data-id="${m.u.id}" title="${set.has(d.w) ? 'Viene' : 'No viene'} el ${DOW_LONG[d.w].toLowerCase()} · pulsa para ${set.has(d.w) ? 'quitarle' : 'apuntarle'}">${DAY_LETTER[d.w]}</button>`).join('')}</span>
      <div class="td-acts">
        ${others.map(o => `<button class="btn sm" data-a="turn-move-to" data-id="${m.u.id}" data-t="${h.time}" data-from="${h.days.join('')}" data-to="${o.days.join('')}" title="Le quita de ${dayTxt} y le apunta a ${dl(o.days)}">→ ${dl(o.days)}</button>`).join('')}
        <button class="btn sm ghost" data-a="turn-remove" data-id="${m.u.id}" data-t="${h.time}" data-d="${h.days.join('')}" title="Quitarle de este turno">✕ Quitar</button>
      </div>
    </div>`;
  };
  return `<div class="turn-detail" style="--c:${h.color}">
    <div class="page-title"><div><button class="btn sm ghost" data-a="turn-close">← Todos los turnos</button>
      <h1 style="margin-top:8px">Turno ${hhmm(h.time)} · ${DAYS_TXT(h.days.length)}</h1>
      <div class="muted">${h.days.map(w => DOW_LONG[w]).join(', ')}</div></div>
      <div class="turn-nums"><div><b>${h.members.length}</b><span>${h.members.length === 1 ? 'socio' : 'socios'}</span></div><div><b class="${freeCls}">${h.free}</b><span>huecos/sem.</span></div></div></div>
    <div class="quiet-note">🔕 Lo que cambies aquí <b>nunca avisa</b> a los socios: ni correo ni aviso en la app. Si quitas a alguien de un día, se le cancelan en silencio sus próximas clases de ese día.</div>
    ${others.length ? `<div class="row wrap" style="gap:6px;margin:0 0 12px"><span class="muted small">Otros turnos a las ${hhmm(h.time)}:</span>${others.map(o => `<button class="btn sm" data-a="turn-open" data-t="${o.time}" data-d="${o.days.join('')}">${DAYS_TXT(o.days.length)} (${dl(o.days)}) · ${o.members.length}</button>`).join('')}</div>` : ''}
    <div class="td-dayscards" style="--n:${h.days.length}">${h.perDay.map(d => `<div class="card td-day ${d.free < 0 ? 'over' : d.free === 0 ? 'full' : ''}" style="--c:${h.color}">
      <div class="td-day-h">${DOW_LONG[d.w]}</div>
      <div class="td-day-n"><b>${d.used}</b>/${d.cap}</div>
      <div class="muted small">${d.free < 0 ? `${-d.free} por encima del aforo` : d.free === 0 ? 'Completo' : `${d.free} ${d.free === 1 ? 'hueco' : 'huecos'}`}</div>
      <label class="small td-cap">Plazas <input type="number" min="1" max="99" value="${d.cap}" data-change="turn-cap" data-id="${d.t.id}"></label>
      <button class="btn sm ghost block" data-a="slot-open" data-id="${d.t.id}">Grupo y clases del ${DOW_LONG[d.w].toLowerCase()}</button>
    </div>`).join('')}</div>
    <div class="card" style="margin-top:14px">
      <div class="section-h" style="margin-top:0">Añadir socios a este turno</div>
      <input class="search" style="margin:0" placeholder="Escribe un nombre para añadirlo a ${dayTxt} a las ${hhmm(h.time)}…" value="${esc(state.turnAddQ || '')}" data-input="turnadd">
      ${q ? (cands.length ? `<div class="td-cands">${cands.map(c => { const g = groupsOf(c.id); return `<div class="td-cand"><div class="grow"><b>${esc(c.name)}</b><div class="muted small">${g.length ? 'Ahora: ' + esc([...new Set(g.map(t => `${DAY_LETTER[t.weekday]} ${hhmm(t.time)}`))].join(', ')) : 'Sin turno'}</div></div>
        <button class="btn sm primary" data-a="turn-add" data-id="${c.id}" data-t="${h.time}" data-d="${h.days.join('')}">+ Añadir (${dayTxt})</button></div>`; }).join('')}</div>`
        : '<p class="muted small" style="margin:8px 0 0">No hay nadie con ese nombre fuera de este turno.</p>') : ''}
    </div>
    <div class="card" style="margin-top:14px">
      <div class="section-h" style="margin-top:0">Socios del turno</div>
      ${h.members.length ? h.groups.map(g => `<div class="turn-sub"><span>${esc(g.label)}</span><span>${g.members.length}</span></div>${g.members.map(row).join('')}`).join('')
        : '<p class="muted">Todavía no hay nadie en este turno. Añádelos arriba.</p>'}
    </div></div>`;
}

// Apunta a un socio a varios días a esa hora / le quita de ellos (siempre sin avisos)
function setTurnDays(userId, time, add = [], remove = []) {
  remove.forEach(w => { const t = db.schedule.find(s => s.time === time && s.weekday === w); if (t && (t.members || []).includes(userId)) removeGroupMember(t.id, userId, { removeFuture: true, email: false, app: false }); });
  add.forEach(w => { const t = db.schedule.find(s => s.time === time && s.weekday === w); if (t && !(t.members || []).includes(userId)) addGroupMember(t.id, userId, { email: false, app: false }); });
  saveDB();
}
const keepScroll = fn => { const y = window.scrollY; fn(); render(); window.scrollTo(0, y); };
const daysOf = str => String(str).split('').map(Number);

document.addEventListener('input', e => {
  if (e.target.dataset?.input !== 'turnadd') return;
  state.turnAddQ = e.target.value;
  const pos = e.target.selectionStart;
  keepScroll(() => {});
  const inp = document.querySelector('[data-input="turnadd"]'); if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
});
document.addEventListener('change', e => {
  if (e.target.dataset?.change !== 'turn-cap') return;
  const t = getSlot(e.target.dataset.id); if (!t) return;
  const v = Math.max(1, Number(e.target.value) || 0), ct = getClassType(t.classTypeId);
  keepScroll(() => setSlotCapacity(t.id, v === ct.capacity ? null : v));
  toast(`${DOW_LONG[t.weekday]} ${hhmm(t.time)}: ${v} plazas`, 'ok');
});

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
    ${hours.map(h => `<div class="t"><h2>TURNO ${hhmm(h.time)} · ${DAYS_TXT(h.days.length)} (${h.days.map(x => DAY_LETTER[x]).join('-')})</h2>
      <div class="s">${h.members.length} socios · ${h.perDay.filter(d => d.t).map(d => `${DAY_LETTER[d.w]} ${d.used}/${d.cap}`).join(' · ')}</div>
      <table>${h.groups.map(g => `<tr class="h"><td colspan="${1 + h.perDay.length}">${esc(g.label)} (${g.members.length})</td></tr>
        ${g.members.map(m => `<tr><td>${esc(m.u.name)}</td>${h.perDay.map(d => `<td class="d ${m.days.includes(d.w) ? 'on' : ''}">${d.t ? (m.days.includes(d.w) ? DAY_LETTER[d.w] : '·') : ''}</td>`).join('')}</tr>`).join('')}`).join('')}</table></div>`).join('')}
    </div></body></html>`);
  w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400);
}

Object.assign(actions, {
  'turns-empty': () => { state.turnsShowEmpty = !state.turnsShowEmpty; render(); },
  'turns-print': () => printTurns(),
  'turn-open': d => { state.turnOpen = { time: d.t, days: d.d }; state.turnAddQ = ''; render(); window.scrollTo(0, 0); },
  'turn-close': () => { state.turnOpen = null; state.turnAddQ = ''; render(); window.scrollTo(0, 0); },
  'turn-add': d => {
    const u = getUser(d.id);
    state.turnAddQ = ''; keepScroll(() => setTurnDays(d.id, d.t, daysOf(d.d)));
    toast(`${u.name.split(' ')[0]} añadido a ${daysOf(d.d).map(w => DAY_LETTER[w]).join('-')} ${hhmm(d.t)} (sin avisarle)`, 'ok');
  },
  'turn-move-to': d => {
    const u = getUser(d.id), to = daysOf(d.to);
    keepScroll(() => setTurnDays(d.id, d.t, to, daysOf(d.from).filter(w => !to.includes(w))));
    toast(`${u.name.split(' ')[0]} pasado a ${to.map(w => DAY_LETTER[w]).join('-')} ${hhmm(d.t)} (sin avisarle)`, 'ok');
  },
  'turn-remove': d => {
    const u = getUser(d.id);
    confirmModal('Quitar del turno', `¿Quitar a <b>${esc(u.name)}</b> del turno de las ${hhmm(d.t)} (${daysOf(d.d).map(w => DAY_LETTER[w]).join('-')})? Se le cancelan en silencio sus próximas clases de esos días. No se le avisa.`, `data-a="turn-remove-ok" data-id="${d.id}" data-t="${d.t}" data-d="${d.d}"`, 'Quitar');
  },
  'turn-remove-ok': d => { closeModal(); keepScroll(() => setTurnDays(d.id, d.t, [], daysOf(d.d))); toast('Quitado del turno (sin avisarle)', 'ok'); },
  'turn-day': d => { const y = window.scrollY; toggleTurnDay(d.id, d.t, Number(d.w)); render(); window.scrollTo(0, y); },
  'turns-noturn': () => { state.view = 'a-clients'; state.clientsTab = 'clients'; state.clientFilter = 'nogroup'; state.search = ''; render(); window.scrollTo(0, 0); },
});
