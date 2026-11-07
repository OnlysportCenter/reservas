// ============================================================
//  INTERFAZ: app de clientes + panel de administración
// ============================================================

const SESSION_KEY = 'reservas_centro_user';
const state = {
  userId: null,
  view: null,
  date: null,          // día seleccionado (cliente y agenda admin)
  search: '',
  schedTab: 'week',
  mineTab: 'next',
};

// ---------- Utilidades ----------
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = n => n.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
const me = () => getUser(state.userId);
const isAdmin = () => me()?.role === 'admin';

const ICONS = {
  cal: '<path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>',
  check: '<path d="M9 11l3 3 7-7M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
  board: '<path d="M4 5h16v11H8l-4 4V5Z M8 9h8M8 12h5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z M10 20a2 2 0 0 0 4 0"/>',
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9Z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.2 2.5 3.8 5.5"/>',
  grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
};
const icon = (name, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${ICONS[name]}</svg>`;

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}
function openModal(html, cls = '') {
  $('#modal-root').innerHTML = `<div class="modal-bg" data-a="bg"><div class="modal ${cls}" role="dialog">${html}</div></div>`;
}
function closeModal() { $('#modal-root').innerHTML = ''; }
const modalHead = title => `<div class="modal-h"><h2>${title}</h2><button class="btn ghost sm" data-a="close" aria-label="Cerrar">${icon('x', 'width="20" height="20"')}</button></div>`;
function confirmModal(title, text, actionAttrs, btnLabel = 'Confirmar', danger = true) {
  openModal(`${modalHead(title)}<p>${text}</p><div class="modal-actions"><button class="btn" data-a="close">Volver</button><button class="btn ${danger ? 'danger' : 'primary'}" ${actionAttrs}>${btnLabel}</button></div>`);
}

// ---------- Arranque ----------
function init() {
  loadDB();
  applyBrand();
  state.userId = localStorage.getItem(SESSION_KEY);
  if (state.userId && !getUser(state.userId)) state.userId = null;
  state.date = dateKey(new Date());
  if (me()) state.view = isAdmin() ? 'a-today' : 'c-book';
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  // Actualización automática: si otra pestaña/ventana cambia los datos (alguien se quita de una clase,
  // el admin mueve la lista de espera...), esta pantalla se refresca al momento.
  // Con el servidor real esto mismo se hará en tiempo real entre todos los móviles.
  window.addEventListener('storage', e => {
    if (e.key !== DB_KEY || !e.newValue) return;
    try { db = JSON.parse(e.newValue); } catch (_) { return; }
    if (me() && !$('#modal-root').innerHTML) liveRender();
  });
  // Refresco periódico (recordatorios, clases que empiezan, publicación semanal)
  setInterval(() => { if (me() && !$('#modal-root').innerHTML) { loadDB(); liveRender(); } }, 20000);
}

// Re-render sin perder el scroll ni lo que se está escribiendo en el buscador
function liveRender() {
  if (document.activeElement?.matches('input, textarea, select')) return;
  const y = window.scrollY;
  const strip = document.querySelector('.daystrip')?.scrollLeft;
  render();
  window.scrollTo(0, y);
  const ns = document.querySelector('.daystrip'); if (ns && strip) ns.scrollLeft = strip;
}

function login(userId) {
  state.userId = userId;
  localStorage.setItem(SESSION_KEY, userId);
  state.view = isAdmin() ? 'a-today' : 'c-book';
  state.date = dateKey(new Date());
  render();
}
function logout() { state.userId = null; localStorage.removeItem(SESSION_KEY); closeModal(); render(); }

// ---------- Render principal ----------
function render() {
  applyBrand();
  const u = me();
  if (!u) return renderLogin();
  if (!u.active) { toast('Tu cuenta está desactivada. Habla con el centro.', 'err'); return logout(); }
  if (u.role === 'client') generateReminders(u.id);
  const unread = notificationsFor(u.id).filter(n => !n.read).length;
  if (u.role === 'client') announceNewNotifications(u.id, unread);
  const nav = u.role === 'admin'
    ? [['a-today', 'home', 'Hoy'], ['a-agenda', 'cal', 'Agenda'], ['a-clients', 'users', 'Clientes'], ['a-schedule', 'grid', 'Clases'], ['a-board', 'board', 'Tablón'], ['a-settings', 'gear', 'Ajustes']]
    : [['c-book', 'cal', 'Reservar'], ['c-mine', 'check', 'Mis clases'], ['c-board', 'board', 'Tablón'], ['c-profile', 'user', 'Perfil']];
  const views = {
    'c-book': viewClientBook, 'c-mine': viewClientMine, 'c-board': viewBoard, 'c-profile': viewProfile,
    'a-today': viewAdminToday, 'a-agenda': viewAdminAgenda, 'a-clients': viewAdminClients, 'a-schedule': viewAdminSchedule,
    'a-board': viewBoard, 'a-settings': viewAdminSettings,
  };
  $('#app').innerHTML = `
    <div class="shell ${u.role}">
      <header class="topbar">
        <div class="brand">${brandMark(34)}${brandName()} ${u.role === 'admin' ? '<span class="role-tag">ADMIN</span>' : ''}</div>
        ${u.role === 'client' ? `<button class="icon-btn bell-btn ${unread ? 'has-unread' : ''}" data-a="notifs" aria-label="${unread ? `${unread} notificaciones sin leer` : 'Notificaciones'}">${icon('bell')}${unread ? `<span class="badge">${unread > 9 ? '9+' : unread}</span>` : ''}</button>` : ''}
        <button class="icon-btn" data-a="logout" aria-label="Salir" title="Cerrar sesión">${icon('out')}</button>
      </header>
      <main class="content">${(views[state.view] || views[nav[0][0]])()}</main>
      <nav class="bottomnav">${nav.map(([v, ic, l]) => `<button class="${state.view === v ? 'active' : ''}" data-a="nav" data-v="${v}">${icon(ic)}<span>${l}</span></button>`).join('')}</nav>
    </div>`;
}

// ---------- Login (prototipo) ----------
function renderLogin() {
  const demo = [getUser('admin'), ...clients().slice(0, 3)];
  $('#app').innerHTML = `
    <div class="login"><div class="card">
      <div class="login-logo">${brandMark(64)}</div>
      <h1 style="font-size:26px">${esc(db.settings.centerName)}</h1>
      <p class="muted">Tus clases, tus cambios y tu lista de espera, desde el móvil.</p>
      <form data-form="login">
        <div class="field"><label>Email</label><input name="email" type="email" required placeholder="tu@email.com" autocomplete="email"></div>
        <button class="btn primary block" type="submit">Entrar</button>
      </form>
      <div class="section-h">Cuentas de prueba (prototipo)</div>
      <div class="stack demo-list">${demo.map(u => `<button class="btn block" data-a="login-as" data-id="${u.id}" style="justify-content:flex-start">
        <span class="avatar" style="width:28px;height:28px;font-size:11px">${initials(u.name)}</span>${esc(u.name)} <span class="muted small" style="margin-left:auto">${u.role === 'admin' ? 'Administrador' : 'Cliente'}</span></button>`).join('')}</div>
      <p class="muted small" style="margin-top:14px">⚠️ Prototipo: aún sin contraseñas. En la versión real cada cliente tendrá su acceso seguro.</p>
      <p class="muted small" style="margin:10px 0 0">Usamos tus datos solo para gestionar tus clases. <button class="legal-link" data-a="privacy">Privacidad</button></p>
    </div></div>`;
}

// ---------- Componentes comunes ----------
// Días de la semana que no ven los socios (Ajustes), p. ej. [6, 0] = sábado y domingo
const hiddenWeekdays = () => (db.settings.hiddenWeekdays || []).map(Number);
const clientDayHidden = d => !isAdmin() && hiddenWeekdays().includes(d.getDay());
// Si el día elegido está oculto para el socio, pasa al siguiente día visible
function fixClientDate(maxOffset) {
  const today = startOfDay(new Date());
  for (let i = 0; i <= maxOffset; i++) {
    const d = addDays(parseKey(state.date), i);
    if (d - today > maxOffset * 86400000) break;
    if (!clientDayHidden(d)) { state.date = dateKey(d); return; }
  }
}
// Tira de días (arriba de la pantalla de reservas y de la agenda)
function dayStrip(fromOffset, toOffset) {
  const today = startOfDay(new Date());
  const sel = parseKey(state.date);
  let html = '';
  for (let i = fromOffset; i <= toOffset; i++) {
    const d = addDays(today, i), k = dateKey(d);
    if (clientDayHidden(d)) continue;
    const has = sessionsOn(k).some(s => !s.cancelled);
    const mine = !isAdmin() && sessionsOn(k).some(s => { const b = userBookingIn(state.userId, s.id); return b && b.status === 'booked'; });
    const wait = !isAdmin() && sessionsOn(k).some(s => userBookingIn(state.userId, s.id)?.status === 'waitlist');
    const newMonth = d.getDate() === 1 && i !== fromOffset;
    html += `${newMonth ? `<span class="dmonth">${MONTHS[d.getMonth()]}</span>` : ''}<button class="dchip ${k === state.date ? 'active' : ''} ${i === 0 ? 'today' : ''} ${i < 0 ? 'past' : ''}" data-a="day" data-k="${k}">
      <span class="dw">${i === 0 ? 'Hoy' : DOW[d.getDay()]}</span><span class="dn">${d.getDate()}</span>
      <span class="ddots">${mine ? '<i class="ok"></i>' : ''}${wait ? '<i class="wait"></i>' : ''}${isAdmin() && has ? '<i></i>' : ''}</span></button>`;
  }
  const monthLabel = `${MONTHS_FULL_UI[sel.getMonth()]} ${sel.getFullYear()}`;
  return `<div class="calstrip">
    <div class="calstrip-head"><b>${monthLabel}</b>${!isAdmin() ? '<span class="calstrip-legend"><i class="ok"></i>tu clase<i class="wait"></i>en espera</span>' : ''}</div>
    <div class="daystrip">${html}</div></div>`;
}
const MONTHS_FULL_UI = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
// «Lunes 9 de noviembre» (+ Hoy / Mañana)
function dayTitle(key) {
  const d = parseKey(key), today = startOfDay(new Date());
  const diff = Math.round((d - today) / 86400000);
  const tag = diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : '';
  return `<h2 class="day-title">${DOW_LONG[d.getDay()]} ${d.getDate()} de ${MONTHS_FULL_UI[d.getMonth()].toLowerCase()}${tag ? ` <span class="day-tag">${tag}</span>` : ''}</h2>`;
}
function capBar(s) {
  const n = bookedIn(s.id).length, pct = Math.min(100, Math.round(n / s.capacity * 100));
  const wl = waitlistOf(s.id).length;
  return `<div class="cap"><div class="bar"><i class="${n >= s.capacity ? 'full' : ''}" style="width:${pct}%"></i></div>${n}/${s.capacity} plazas${wl ? ` · ${wl} en espera` : ''}</div>`;
}

// ============================================================
//  VISTAS CLIENTE
// ============================================================
// Días que el cliente puede ver según la configuración de publicación
function clientDaysAhead() {
  const general = Math.round((visibleUntil() - startOfDay(new Date())) / 86400000) - 1;
  const own = db.schedule.map(t => (t.visibleDays === null || t.visibleDays === undefined || t.visibleDays === '') ? 0 : Number(t.visibleDays));
  return Math.max(0, general, ...own);
}
// Lo único que ve el cliente: plazas libres (nunca nombres de otros clientes)
function spotsInfo(s) {
  const f = freeSpots(s);
  if (f <= 0) return '<div class="spots full">Completa</div>';
  return `<div class="spots ${f <= 2 ? 'few' : ''}"><b class="spots-n">${f}</b> ${f === 1 ? 'plaza libre' : 'plazas libres'}</div>`;
}
// Etiqueta de clases disponibles (semana del día seleccionado para tarifas semanales)
function weekInfo(u) {
  const d = parseKey(state.date);
  if (isWeekly(u)) {
    const left = weekLeft(u, d), thisWeek = weekKeyOf(d) === weekKeyOf(new Date());
    return `<span class="pill ${left ? 'ok' : ''}">${weekCount(u.id, d)} de ${weekAllowance(u, d)} clases ${thisWeek ? 'esta semana' : 'esa semana'}</span>`;
  }
  const lim = weeklyLimitFor(u);
  const used = weekCount(u.id, d);
  return `${lim ? `<span class="pill ${used >= lim ? 'danger' : ''}">${used}/${lim} esta semana</span>` : ''}
    <span class="pill ${planStatus(u).ok ? 'ok' : 'danger'}">${u.credits === null ? 'Ilimitado' : `${u.credits} clases`}</span>`;
}
// Texto corto de la tarifa para el panel
function planSummary(u) {
  const p = getPlan(u.planId);
  if (!p) return 'Sin tarifa';
  if (p.type === 'weekly') return `${weekCount(u.id, new Date())}/${weekAllowance(u, new Date())} esta semana`;
  return u.credits === null ? '∞' : `${u.credits} ${u.credits === 1 ? 'clase' : 'clases'}`;
}
const planDesc = p => p.type === 'weekly' ? `${p.perWeek} clases cada semana · no acumulables` : (p.credits === null ? 'Clases ilimitadas' : `${p.credits} clases en total`);

// Aviso de cuota pendiente (con respuesta: sigo / me doy de baja)
function paymentBanner(u) {
  if (!u.paymentDue) return '';
  const m = monthName(u.paymentMonth);
  if (u.paymentAnswer) return `<div class="card pay-banner answered">
      <div>💶 Cuota de <b>${m}</b> pendiente de pago. ${u.paymentAnswer === 'stay' ? 'Nos has dicho que <b>sigues</b>: recuerda pagarla en el centro.' : 'Nos has dicho que <b>te das de baja</b>. ¡Gracias por entrenar con nosotros!'}</div>
      <button class="btn sm ghost" data-a="pay-answer" data-v="${u.paymentAnswer === 'stay' ? 'leave' : 'stay'}">${u.paymentAnswer === 'stay' ? 'Me doy de baja' : 'Al final sigo'}</button></div>`;
  return `<div class="card pay-banner">
      <div><b>💶 Tu cuota de ${m} está pendiente de pago</b><div class="small" style="margin-top:2px">Se paga del 1 al 5 de cada mes. ¿Sigues con nosotros?</div></div>
      <div class="row wrap"><button class="btn sm primary" data-a="pay-answer" data-v="stay">Sí, sigo</button>
        <button class="btn sm" data-a="pay-answer" data-v="leave">Me doy de baja</button></div></div>`;
}

function viewClientBook() {
  const u = me();
  const ahead = clientDaysAhead();
  if (state.date > dateKey(addDays(new Date(), ahead)) || state.date < dateKey(new Date())) state.date = dateKey(new Date());
  fixClientDate(ahead);
  const list = sessionsOn(state.date).filter(isVisibleToClients);
  const ps = planStatus(u);
  const now = new Date();
  return `
    <div class="page-title"><h1>Reservar clase</h1>
      <div class="row">${weekInfo(u)}</div></div>
    ${paymentBanner(u)}
    ${!ps.ok ? `<div class="card" style="background:${ps.blocked ? 'var(--danger-bg)' : 'var(--warn-bg)'};border-color:transparent;margin-bottom:12px">${ps.blocked ? '🔒 ' : ''}${esc(ps.msg)}</div>` : ''}
    ${(() => { const w = db.bookings.filter(b => b.userId === u.id && b.status === 'waitlist' && sessionStart(getSession(b.sessionId)) > now).length;
      return w ? `<div class="card small" style="background:var(--warn-bg);border-color:transparent;margin-bottom:12px">⏳ Estás en lista de espera en <b>${w}</b> ${w === 1 ? 'clase' : 'clases'}. Entrarás en la primera que se libere${isWeekly(u) ? ' y, si con ella completas tus clases de la semana, te quitaremos de las demás' : ''}.</div>` : ''; })()}
    ${dayStrip(0, ahead)}
    ${dayTitle(state.date)}
    <div class="stack">
      ${list.length ? list.map(s => {
        const ct = getClassType(s.classTypeId);
        const b = userBookingIn(u.id, s.id);
        const started = sessionStart(s) <= now;
        const full = freeSpots(s) <= 0;
        let act, extra = '';
        if (s.cancelled) act = '<span class="pill danger">Cancelada</span>';
        else if (b?.status === 'booked') act = `<span class="pill ok booked-pill">✓ Reservada</span>${!started ? `<button class="btn btn-big danger" data-a="cancel-booking" data-id="${b.id}">Cancelar</button>` : ''}`;
        else if (b?.status === 'waitlist') {
          act = `<button class="btn btn-big btn-wait-out" data-a="cancel-booking" data-id="${b.id}">Salir de la lista</button>`;
          extra = `<div class="wl-pos">En lista de espera · vas el <b>nº ${waitlistPosition(b)}</b></div>`;
          if (!canUseFor(u, s).ok) extra += `<div class="muted small" style="margin-top:4px">Entrarás en cuanto te quites de otra clase ${db.settings.onePerDay && db.bookings.some(x => x.userId === u.id && x.status === 'booked' && getSession(x.sessionId)?.date === s.date) ? 'de ese día' : 'de esa semana'}.</div>`;
        }
        else if (started) act = '<span class="pill">Finalizada</span>';
        else if (ps.blocked) act = '<span class="pill">Bloqueado</span>';
        else if (full) act = db.settings.waitlistEnabled ? `<button class="btn btn-big btn-wait" data-a="book" data-id="${s.id}">Lista de espera</button>` : '';
        else if (ps.ok && !canUseFor(u, s).ok) {
          // ya tiene sus clases (semana completa u otra clase ese día): puede esperar aquí sin gastar clase
          act = db.settings.waitlistEnabled ? `<button class="btn btn-big btn-wait" data-a="book" data-id="${s.id}">Apuntarme en espera</button>` : '';
          extra = `<div class="muted small" style="margin-top:4px">Ya tienes tus clases ${/ese día/.test(canUseFor(u, s).msg) ? 'de ese día' : 'de esta semana'}. Si te apuntas, entrarás cuando te quites de otra.</div>`;
        }
        else act = `<button class="btn btn-big primary" data-a="book" data-id="${s.id}">Reservar</button>`;
        return `<div class="card session client-session ${s.cancelled ? 'cancelled' : ''} ${b?.status === 'booked' && !s.cancelled ? 'is-booked' : ''}" style="--c:${sessionColor(s)}">
          <div class="time"><div class="t">${s.time}</div><div class="d">${s.duration} min</div></div>
          <div class="info"><div class="name">${esc(ct.name)}</div>${s.cancelled ? '' : spotsInfo(s)}</div>
          ${extra ? `<div class="session-extra">${extra}</div>` : ''}
          ${act ? `<div class="act">${act}</div>` : ''}</div>`;
      }).join('') : `<div class="empty">${icon('cal')}<div>No hay clases este día.</div></div>`}
    </div>
    <p class="muted small" style="text-align:center;margin-top:16px">${esc(publishDescription())}</p>`;
}

function viewClientMine() {
  const u = me(), now = new Date();
  const mine = db.bookings.filter(b => b.userId === u.id && !['cancelled', 'late'].includes(b.status))
    .map(b => ({ b, s: getSession(b.sessionId) })).filter(x => x.s);
  const next = mine.filter(x => sessionEnd(x.s) > now && !x.s.cancelled).sort((a, b) => sessionStart(a.s) - sessionStart(b.s));
  const past = mine.filter(x => sessionEnd(x.s) <= now).sort((a, b) => sessionStart(b.s) - sessionStart(a.s)).slice(0, 30);
  const items = state.mineTab === 'next' ? next : past;
  const statusPill = b => ({ booked: '<span class="pill ok">Reservada</span>', waitlist: `<span class="pill warn">En espera · nº ${waitlistPosition(b)}</span>`, attended: '<span class="pill ok">Asististe</span>', noshow: '<span class="pill danger">No asististe</span>' }[attendStatus(b)]);
  return `
    <div class="page-title"><h1>Mis clases</h1></div>
    <div class="tabs"><button class="${state.mineTab === 'next' ? 'active' : ''}" data-a="mine-tab" data-t="next">Próximas (${next.length})</button>
      <button class="${state.mineTab === 'past' ? 'active' : ''}" data-a="mine-tab" data-t="past">Historial</button></div>
    <div class="stack">
      ${items.length ? items.map(({ b, s }) => {
        const ct = getClassType(s.classTypeId);
        const canCancel = state.mineTab === 'next' && sessionStart(s) > now;
        return `<div class="card session client-session ${b.status === 'booked' || b.status === 'attended' ? 'is-booked' : ''}" style="--c:${sessionColor(s)}">
          <div class="time"><div class="t">${s.time}</div><div class="d">${fmtDateShort(s.date)}</div></div>
          <div class="info"><div class="name">${esc(ct.name)}</div><div class="meta">${s.duration} min</div>
            ${canCancel && b.status === 'booked' && isLateCancel(s) ? `<div class="small" style="color:var(--warn);margin-top:4px">Fuera de plazo de cancelación gratuita</div>` : ''}</div>
          <div class="act">${statusPill(b)}${canCancel ? `<button class="btn btn-big ${b.status === 'booked' ? 'danger' : ''}" data-a="cancel-booking" data-id="${b.id}">${b.status === 'booked' ? 'Cancelar' : 'Salir'}</button>` : ''}</div></div>`;
      }).join('') : `<div class="empty">${icon('check')}<div>${state.mineTab === 'next' ? 'No tienes clases reservadas.' : 'Aún no hay historial.'}</div>
        ${state.mineTab === 'next' ? '<button class="btn primary" style="margin-top:12px" data-a="nav" data-v="c-book">Reservar ahora</button>' : ''}</div>`}
    </div>`;
}

function viewBoard() {
  const list = [...db.announcements].sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
  const admin = isAdmin();
  return `
    <div class="page-title"><h1>Tablón de anuncios</h1>${admin ? `<button class="btn primary" data-a="ann-edit">${icon('plus', 'width="18" height="18"')}Nuevo anuncio</button>` : ''}</div>
    <div class="stack">
      ${list.length ? list.map(a => `<div class="card ann ${a.pinned ? 'pinned' : ''}">
        <div class="row between"><h3>${a.pinned ? '📌 ' : ''}${esc(a.title)}</h3><span class="muted small">${fmtAgo(a.date)}</span></div>
        <p>${esc(a.body)}</p>
        ${admin ? `<div class="row" style="margin-top:12px"><button class="btn sm" data-a="ann-edit" data-id="${a.id}">Editar</button><button class="btn sm danger" data-a="ann-del" data-id="${a.id}">Eliminar</button></div>` : ''}
      </div>`).join('') : `<div class="empty">${icon('board')}<div>No hay anuncios todavía.</div></div>`}
    </div>`;
}

function viewProfile() {
  const u = me(), p = getPlan(u.planId);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthCount = db.bookings.filter(b => b.userId === u.id && ['booked', 'attended'].includes(b.status)).filter(b => { const s = getSession(b.sessionId); return s && sessionStart(s) >= monthStart && sessionStart(s) <= new Date(); }).length;
  const total = db.bookings.filter(b => b.userId === u.id && attendStatus(b) === 'attended').length;
  const ps = planStatus(u);
  return `
    <div class="page-title"><h1>Mi perfil</h1></div>
    ${paymentBanner(u)}
    <div class="card row" style="margin-bottom:12px"><div class="avatar" style="width:52px;height:52px;font-size:18px">${initials(u.name)}</div>
      <div class="grow"><div style="font-weight:700;font-size:17px">${esc(u.name)}</div><div class="muted small">${esc(u.email)}${u.phone ? ' · ' + esc(u.phone) : ''}</div></div></div>
    <div class="card bono" style="margin-bottom:12px">
      <div class="muted small">MI TARIFA</div>
      <div style="font-weight:700;font-size:18px;margin:2px 0 12px">${p ? esc(p.name) : 'Sin tarifa activa'}</div>
      <div class="row between" style="align-items:flex-end">
        ${isWeekly(u)
          ? `<div><div class="big">${weekLeft(u, new Date())}<span style="font-size:20px;opacity:.8"> / ${weekAllowance(u, new Date())}</span></div><div class="muted small">clases que te quedan esta semana</div></div>`
          : `<div><div class="big">${u.credits === null ? '∞' : u.credits}</div><div class="muted small">${u.credits === null ? 'clases ilimitadas' : 'clases disponibles'}</div></div>`}
        <div style="text-align:right"><div class="muted small">Cuota de ${monthName()}</div><div style="font-weight:700">${u.paymentDue ? 'Pendiente' : 'Al día'}</div></div>
      </div>
      ${isWeekly(u) ? (() => { const nx = addDays(weekStart(new Date()), 7); return `<div class="small" style="margin-top:12px;opacity:.9">Semana que viene: ${weekLeft(u, nx)} de ${weekAllowance(u, nx)} disponibles${weekExtra(u, nx) > 0 ? ` (incluye ${weekExtra(u, nx)} extra)` : ''}.<br>Las clases que no uses no pasan a la semana siguiente.</div>`; })() : ''}
      ${!ps.ok ? `<div style="margin-top:12px;background:rgba(0,0,0,.18);padding:8px 10px;border-radius:10px" class="small">${esc(ps.msg)}</div>` : ''}
    </div>
    ${groupsOf(u.id).length ? `<div class="section-h">Mis grupos fijos</div>
    <div class="card list" style="margin-bottom:12px">${groupsOf(u.id).map(t => `<div class="list-item"><span class="swatch" style="--c:${slotColor(t)}"></span><div class="grow">${esc(slotLabel(t))}</div></div>`).join('')}</div>` : ''}
    <div class="grid-stats" style="grid-template-columns:1fr 1fr">
      <div class="card stat"><div class="v">${monthCount}</div><div class="l">Clases este mes</div></div>
      <div class="card stat"><div class="v">${total}</div><div class="l">Asistencias totales</div></div>
    </div>
    <div class="card small muted">
      <b style="color:var(--text)">Normas de reserva</b><br>
      · ${esc(publishDescription())}<br>
      ${db.settings.onePerDay ? '· Como máximo una clase al día.<br>' : ''}
      · Tus clases de grupo te las reserva el centro. Si vas a faltar, quítate para dejar la plaza libre.<br>
      · Puedes cambiarte a otra clase con plazas libres, o apuntarte a la lista de espera de varias clases: solo cuenta la primera en la que entres, y si ya no te quedan clases te quitamos de las demás.<br>
      ${weeklyLimitFor(u) ? `· Puedes reservar como máximo ${weeklyLimitFor(u)} clases por semana (las listas de espera también cuentan).<br>` : ''}
      · Cancela con al menos ${db.settings.cancelHours} h de antelación para recuperar la clase.<br>
      · Si una clase está llena, apúntate a la lista de espera: entrarás automáticamente si alguien cancela.<br>
      · Te enviaremos un recordatorio ${db.settings.reminderHours} h antes de la clase.
    </div>
    <div class="card" style="margin-top:12px">
      <b>Apariencia</b> <span class="muted small">· solo en este móvil</span>
      <div class="theme-pick">${[['light', '☀️', 'Claro'], ['dark', '🌙', 'Oscuro'], ['auto', '📱', 'Según el móvil']].map(([v, ic, l]) => {
        const cur = themePref() || brand().theme;
        return `<button class="${cur === v ? 'on' : ''}" data-a="theme-pref" data-v="${v}"><span>${ic}</span>${l}</button>`;
      }).join('')}</div>
    </div>
    <button class="btn block" style="margin-top:16px" data-a="logout">${icon('out', 'width="18" height="18"')}Cerrar sesión</button>
    <p style="text-align:center;margin-top:14px"><button class="legal-link" data-a="privacy">Privacidad y tus datos</button></p>`;
}

// ---------- Aviso al llegar una notificación nueva ----------
// La primera vez (al entrar) solo se apunta lo que hay; después, cada aviso nuevo sale arriba, vibra
// el móvil y se pone el número en el icono de la app instalada.
let seenNotifs = null;
function announceNewNotifications(userId, unread) {
  const unreadList = notificationsFor(userId).filter(n => !n.read);
  if (seenNotifs === null || seenNotifs.user !== userId) { seenNotifs = { user: userId, ids: new Set(unreadList.map(n => n.id)) }; }
  else {
    const fresh = unreadList.filter(n => !seenNotifs.ids.has(n.id));
    fresh.forEach(n => seenNotifs.ids.add(n.id));
    if (fresh.length) {
      showNotifBanner(fresh[0].text, fresh.length);
      try { navigator.vibrate?.([120, 60, 120]); } catch (e) {}
    }
  }
  try { if ('setAppBadge' in navigator) unread ? navigator.setAppBadge(unread) : navigator.clearAppBadge(); } catch (e) {}
  document.title = (unread ? `(${unread}) ` : '') + (db.settings.centerName || 'Onlysport Center');
}
function showNotifBanner(text, n) {
  document.querySelector('.notif-banner')?.remove();
  const el = document.createElement('button');
  el.className = 'notif-banner';
  el.dataset.a = 'notifs';
  el.innerHTML = `<span class="nb-icon">${icon('bell')}</span><span class="nb-text"><b>${n > 1 ? `${n} avisos nuevos` : 'Aviso nuevo'}</b><span>${esc(text)}</span></span>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 7000);
  setTimeout(() => el.remove(), 7600);
}

// ---------- Información de privacidad (RGPD) ----------
const LEGAL_DEFAULT = { nif: '', address: 'Calle Alonso de Aguilar, 16, 14920 Aguilar de la Frontera (Córdoba)', email: 'onlysport.app@gmail.com', phone: '604 490 693' };
const legal = () => ({ ...LEGAL_DEFAULT, ...((db && db.settings && db.settings.legal) || {}) });
function privacyHTML() {
  const L = legal(), name = esc(db?.settings?.centerName || 'Onlysport Center');
  const contact = L.email ? `escribiendo a <b>${esc(L.email)}</b>` : 'contactando con el centro';
  return `<div class="legal">
    <p>Esta app sirve para gestionar tus clases en ${name}. Aquí te contamos, de forma clara, qué datos usamos y para qué.</p>
    <h3>Responsable</h3>
    <p>${name}${L.nif ? ` · NIF ${esc(L.nif)}` : ''}${L.address ? ` · ${esc(L.address)}` : ''}${L.phone ? ` · Tel. ${esc(L.phone)}` : ''}${L.email ? ` · ${esc(L.email)}` : ''}.</p>
    <h3>Qué datos tratamos</h3>
    <p>Los que nos diste al apuntarte (nombre, apellidos, email y teléfono), tu tarifa, tus grupos y reservas, tu asistencia, las listas de espera en las que estás, tus respuestas sobre la cuota del mes y los avisos que te enviamos.</p>
    <h3>Para qué</h3>
    <p>Para reservar tus clases, gestionar las listas de espera, avisarte de cambios (por la app o por correo) y llevar tu relación como socio del centro. No hacemos perfiles ni usamos tus datos para publicidad.</p>
    <h3>Base legal</h3>
    <p>La relación que tienes con el centro como socio (artículo 6.1.b del Reglamento General de Protección de Datos).</p>
    <h3>Quién más los ve</h3>
    <p>Solo el centro. Los demás socios no ven tu nombre ni tus reservas: solo cuántas plazas quedan libres. No cedemos tus datos a nadie.</p>
    <p>Para que la app funcione usamos estos proveedores, que tratan los datos por cuenta del centro:</p>
    <ul><li><b>Supabase</b>: base de datos y acceso con código. Servidores en Fráncfort (Unión Europea).</li>
      <li><b>GitHub Pages</b> (GitHub Inc.): aloja la app y registra la dirección IP de las visitas por seguridad. Adherido al Marco de Privacidad de Datos UE-EE. UU.</li>
      <li><b>Google (Gmail)</b>: envía los códigos de acceso y los avisos por correo.</li></ul>
    <h3>Cuánto tiempo</h3>
    <p>Mientras seas socio. Si te das de baja, borramos tus datos de la app, salvo lo que la ley nos obligue a guardar.</p>
    <h3>Tu sesión en el móvil</h3>
    <p>La app guarda tu sesión en el navegador para no pedirte el código cada vez. No usa cookies de publicidad ni de analítica.</p>
    <h3>Personas en lista de espera para apuntarse</h3>
    <p>Si nos dejas tu nombre y tu teléfono o email porque esperas una plaza, solo los usamos para avisarte cuando haya hueco, y los borramos si ya no te interesa.</p>
    <h3>Tus derechos</h3>
    <p>Puedes pedir ver, corregir o borrar tus datos, oponerte a su uso o pedir una copia ${contact}. Si crees que no los tratamos bien, puedes reclamar ante la Agencia Española de Protección de Datos (<b>aepd.es</b>).</p>
  </div>`;
}
function openPrivacy() { openModal(`${modalHead('Privacidad')}${privacyHTML()}<div class="modal-actions"><button class="btn primary" data-a="close">Entendido</button></div>`); }

function openNotifications() {
  const list = notificationsFor(state.userId);
  const read = list.filter(n => n.read).length;
  openModal(`${modalHead('Notificaciones')}
    ${read ? `<div class="row between wrap" style="margin:-6px 0 10px"><span class="muted small">${read} ${read === 1 ? 'leída' : 'leídas'}</span>
      <button class="btn sm" data-a="notif-clear">🗑 Borrar las leídas</button></div>` : ''}
    <div class="card list">${list.length ? list.slice(0, 40).map(n => `<div class="notif ${n.read ? '' : 'unread'}"><div class="grow">${esc(n.text)}<div class="muted small">${fmtAgo(n.date)}</div></div>
      <button class="btn sm ghost" data-a="notif-del" data-id="${n.id}" title="Borrar" aria-label="Borrar">${icon('x', 'width="16" height="16"')}</button></div>`).join('')
      : '<div class="empty">No tienes notificaciones.</div>'}</div>`);
  list.forEach(n => n.read = true);
  saveDB();
}

// ============================================================
//  VISTAS ADMINISTRADOR
// ============================================================
function viewAdminToday() {
  const today = dateKey(new Date());
  const ss = sessionsOn(today).filter(s => !s.cancelled);
  const booked = ss.reduce((a, s) => a + bookedIn(s.id).length, 0);
  const cap = ss.reduce((a, s) => a + s.capacity, 0);
  const active = clients().filter(c => c.active);
  const soon = addDays(startOfDay(new Date()), 7);
  const dueCount = active.filter(c => c.paymentDue).length;
  const noPlan = active.filter(c => !planStatus(c).ok);
  return `
    <div class="page-title"><h1>${(() => { const h = new Date().getHours(); return h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'; })()}</h1></div>
    <p class="admin-hello">${fmtDateLong(today)} · ${ss.length} ${ss.length === 1 ? 'clase' : 'clases'} hoy</p>
    <div class="grid-stats">
      <div class="card kpi" style="--k:#2F5D8A"><div class="kpi-ic">${icon('users')}</div><div><div class="v">${active.length}</div><div class="l">Socios activos</div></div></div>
      <div class="card kpi" style="--k:#1F7A45"><div class="kpi-ic">${icon('check')}</div><div><div class="v">${booked}</div><div class="l">Reservas hoy</div></div></div>
      <div class="card kpi" style="--k:#6D4C9F"><div class="kpi-ic">${icon('grid')}</div><div><div class="v">${cap ? Math.round(booked / cap * 100) : 0}%</div><div class="l">Ocupación hoy</div></div></div>
      <div class="card kpi" style="--k:#E8890C"><div class="kpi-ic">${icon('bell')}</div><div><div class="v">${dueCount}</div><div class="l">Cuotas pendientes</div></div></div>
    </div>
    <div class="section-h">Clases de hoy</div>
    <div class="stack">${ss.length ? ss.map(adminSessionCard).join('') : '<div class="card empty">Hoy no hay clases.</div>'}</div>
    ${paymentSummaryHTML()}
    ${(db.prospects || []).length ? `<div class="card row between wrap" style="margin-top:14px">
      <div><b>📝 ${db.prospects.length} ${db.prospects.length === 1 ? 'persona espera' : 'personas esperan'} plaza</b><div class="muted small">Lista de espera de clientes nuevos</div></div>
      <button class="btn sm" data-a="prospects-open">Ver lista</button></div>` : ''}
    ${noPlan.length ? `<div class="section-h">Requieren atención</div><div class="card list">
      ${noPlan.map(c => [c, shortStatus(c), 'danger'])
        .map(([c, txt, t]) => `<div class="list-item clickable" data-a="client-open" data-id="${c.id}"><div class="avatar">${initials(c.name)}</div><div class="grow">${esc(c.name)}</div><span class="pill ${t}">${esc(txt)}</span></div>`).join('')}
    </div>` : ''}`;
}

function shortStatus(c) {
  const ps = planStatus(c);
  if (ps.ok) return 'Activo';
  if (c.blocked) return 'Bloqueado';
  if (!c.planId) return 'Sin bono';
  return 'Sin clases';
}

function adminSessionCard(s) {
  const ct = getClassType(s.classTypeId);
  const published = sessionStart(s) < visibleUntil();
  return `<div class="card session clickable ${s.cancelled ? 'cancelled' : ''} ${isHidden(s) ? 'is-hidden' : ''}" style="--c:${sessionColor(s)}" data-a="session-open" data-id="${s.id}">
    <div class="time"><div class="t">${s.time}</div><div class="d">${s.duration} min</div></div>
    <div class="info"><div class="name">${esc(ct.name)}</div><div class="meta">${esc(s.coach)}${s.templateId ? '' : ' · clase extra'}</div>${capBar(s)}</div>
    <div class="act">${s.cancelled ? '<span class="pill danger">Cancelada</span>' : ''}${isHidden(s) ? '<span class="pill">🙈 Oculta</span>' : ''}
      ${!s.cancelled && !isHidden(s) && !published ? '<span class="pill warn">Sin publicar</span>' : ''}${!s.cancelled && freeSpots(s) <= 0 ? '<span class="pill danger">Completa</span>' : ''}</div></div>`;
}

// Casillas para elegir cómo avisar al cliente
const notifyChecks = (email = true, app = true) => `
  <label class="check"><input type="checkbox" id="n-email" ${email ? 'checked' : ''}> ✉️ Avisar por correo</label>
  <label class="check"><input type="checkbox" id="n-app" ${app ? 'checked' : ''}> 🔔 Avisar en la app</label>`;
const readNotify = () => ({ email: !!$('#n-email')?.checked, app: !!$('#n-app')?.checked });

function viewAdminAgenda() {
  const list = sessionsOn(state.date);
  return `
    <div class="page-title"><h1>Agenda</h1><button class="btn primary" data-a="extra-session">${icon('plus', 'width="18" height="18"')}Clase extra</button></div>
    ${dayStrip(-7, db.settings.bookWindowDays + 7)}
    ${dayTitle(state.date)}
    <div class="stack">${list.length ? list.map(adminSessionCard).join('') : '<div class="card empty">No hay clases este día.</div>'}</div>`;
}

function openSession(id) {
  state.back = 'session';
  const s = getSession(id), ct = getClassType(s.classTypeId);
  const bk = bookedIn(id), wl = waitlistOf(id);
  const past = sessionStart(s) <= new Date();
  const free = clients().filter(c => c.active && !userBookingIn(c.id, id));
  const ended = sessionEnd(s) <= new Date();
  const n = bk.length, cap = s.capacity, pct = Math.min(100, Math.round(n / Math.max(1, cap) * 100));
  const fromGroup = bk.filter(b => b.source === 'group').length;
  const attendedN = bk.filter(b => attendStatus(b) === 'attended').length, noshowN = bk.filter(b => b.status === 'noshow').length;
  const statusTag = s.cancelled ? '<span class="sx-tag danger">Cancelada</span>' : ended ? '<span class="sx-tag">Terminada</span>' : past ? '<span class="sx-tag live">En curso</span>' : isVisibleToClients(s) ? '<span class="sx-tag ok">👁 Visible para socios</span>' : '<span class="sx-tag">🔒 Aún no la ven los socios</span>';
  const memberRow = b => {
    const u = getUser(b.userId), p = getPlan(u.planId), st = attendStatus(b);
    const tags = [b.source === 'group' ? '<span class="mtag group">Grupo fijo</span>' : '<span class="mtag">Extra</span>',
      u.paymentDue ? '<span class="mtag warn">💶 Cuota</span>' : '', u.blocked ? '<span class="mtag danger">🔒 Bloqueado</span>' : ''].join('');
    return `<div class="sx-member ${st === 'noshow' ? 'noshow' : ''}">
      <div class="avatar">${initials(u.name)}</div>
      <div class="grow"><div class="sx-name">${esc(u.name)}</div>
        <div class="sx-meta">${tags}<span class="muted small">${esc(p?.name || 'Sin tarifa')}${u.phone ? ' · ' + esc(u.phone) : ''}</span></div></div>
      ${past ? `<div class="att-toggle" role="group" aria-label="Asistencia">
          <button class="att yes ${st === 'attended' || (!ended && st === 'booked') ? 'on' : ''}" data-a="attend" data-id="${b.id}" data-s="attended">✓ Asistió</button>
          <button class="att no ${st === 'noshow' ? 'on' : ''}" data-a="attend" data-id="${b.id}" data-s="noshow">✗ No vino</button></div>`
        : `<button class="btn sm quitar" data-a="admin-unbook" data-id="${b.id}" title="Quitar de la clase">${icon('x', 'width="15" height="15"')} Quitar</button>`}
    </div>`;
  };
  openModal(`
    <div class="sx-head" style="--c:${sessionColor(s)}">
      <div class="sx-time"><b>${s.time}</b><span>${s.duration} min</span></div>
      <div class="grow"><h2>${esc(ct.name)}</h2><div class="sx-sub">${fmtDateLong(s.date)} · ${esc(s.coach)}${s.templateId ? '' : ' · clase extra'}</div><div style="margin-top:6px">${statusTag}${s.hidden ? '<span class="sx-tag">🙈 Oculta</span>' : ''}</div></div>
      <button class="btn ghost sm" data-a="close" aria-label="Cerrar">${icon('x', 'width="20" height="20"')}</button>
    </div>
    ${ct.hidden ? '<div class="card small" style="background:var(--surface-2);border-color:transparent;margin:12px 0 0">🙈 Todo el tipo de clase está oculto a los clientes (se cambia en Clases › Tipos de clase).</div>' : ''}
    <div class="sx-stats">
      <div><b>${n}<small>/${cap}</small></b><span>Apuntados</span></div>
      <div><b class="${cap - n <= 0 ? 'danger' : cap - n <= 2 ? 'warn' : 'ok'}">${Math.max(0, cap - n)}</b><span>Plazas libres</span></div>
      <div><b class="${wl.length ? 'warn' : ''}">${wl.length}</b><span>En espera</span></div>
      <div><b>${fromGroup}</b><span>De grupo fijo</span></div>
      ${past ? `<div><b class="ok">${attendedN}</b><span>Asistieron</span></div><div><b class="${noshowN ? 'danger' : ''}">${noshowN}</b><span>Faltaron</span></div>` : ''}
    </div>
    <div class="sx-bar"><i class="${n >= cap ? 'full' : ''}" style="width:${pct}%;--c:${sessionColor(s)}"></i></div>
    <div class="sx-cols">
      <div>
        <div class="section-h">Apuntados (${n})${past ? ' · <span style="text-transform:none;letter-spacing:0">si no marcas nada, cuenta como que asistió</span>' : ''}</div>
        <div class="card list sx-list">${n ? bk.map(memberRow).join('') : '<div class="empty">Nadie apuntado todavía.</div>'}</div>
        ${wl.length ? `<div class="section-h">Lista de espera (${wl.length}) · por orden de llegada</div><div class="card list sx-list">${wl.map((b, i) => {
          const u = getUser(b.userId), can = canUseFor(u, s).ok;
          return `<div class="sx-member"><div class="avatar wl">${i + 1}</div><div class="grow"><div class="sx-name">${esc(u.name)}</div>
            <div class="sx-meta"><span class="muted small">${can ? 'Entrará en cuanto haya plaza' : 'Espera a quitarse de otra clase'} · desde ${fmtAgo(b.createdAt)}</span></div></div>
            <button class="btn sm quitar" data-a="admin-unbook" data-id="${b.id}">${icon('x', 'width="15" height="15"')} Quitar</button></div>`;
        }).join('')}</div>` : ''}
      </div>
      <div class="sx-side">
        ${!s.cancelled && !past ? `<div class="card">
          <b>Apuntar a un cliente</b>
          <select class="search" style="margin:10px 0 6px" id="add-client-sel"><option value="">Elige cliente…</option>${free.map(c => `<option value="${c.id}">${esc(c.name)}${c.blocked ? ' (bloqueado)' : ''}</option>`).join('')}</select>
          <div class="small">${notifyChecks()}</div>
          <div class="stack" style="gap:8px"><button class="btn primary block" data-a="admin-book" data-id="${s.id}" data-m="auto">Apuntar a la clase</button>
            <button class="btn btn-wait block" data-a="admin-book" data-id="${s.id}" data-m="waitlist">Poner en lista de espera</button></div>
          <p class="muted small" style="margin:8px 0 0">Puedes apuntar aunque esté llena.</p></div>` : ''}
        <div class="card">
          <b>Ajustes de esta clase</b>
          <div class="row" style="margin-top:10px"><label class="muted small grow">Aforo</label><input type="number" min="1" class="search" style="margin:0;width:90px" value="${s.capacity}" data-change="capacity" data-id="${s.id}"></div>
          <div class="stack" style="gap:8px;margin-top:10px">
            <button class="btn block" data-a="session-hide" data-id="${s.id}">${s.hidden ? '👁 Mostrar a los socios' : '🙈 Ocultar a los socios'}</button>
            ${s.cancelled ? `<button class="btn block" data-a="session-restore" data-id="${s.id}">Reactivar clase</button>` : !past ? `<button class="btn danger block" data-a="session-cancel" data-id="${s.id}">Cancelar clase</button>` : ''}
          </div>
        </div>
      </div>
    </div>`, 'wide');
}

function openRemoveConfirm(bookingId) {
  const b = getBooking(bookingId), u = getUser(b.userId), s = getSession(b.sessionId);
  openModal(`${modalHead('Quitar de la clase')}
    <p><b>${esc(u.name)}</b> · ${esc(classLabel(s))}${b.status === 'waitlist' ? ' (lista de espera)' : ''}</p>
    ${b.status !== 'waitlist' ? '<p class="muted small">Se le devolverá la clase al bono y entrará el primero de la lista de espera, si lo hay.</p>' : ''}
    ${notifyChecks(false, true)}
    <div class="modal-actions"><button class="btn" data-a="${state.back === 'client' ? 'client-open' : 'session-open'}" data-id="${state.back === 'client' ? u.id : s.id}">Volver</button>
      <button class="btn danger" data-a="admin-unbook-ok" data-id="${b.id}">Quitar</button></div>`);
}

// Apuntar a un cliente a varias clases a la vez
function openMultiAdd(userId) {
  const u = getUser(userId), now = new Date();
  const upcoming = db.sessions.filter(s => !s.cancelled && sessionStart(s) > now && !userBookingIn(userId, s.id))
    .sort((a, b) => sessionStart(a) - sessionStart(b)).slice(0, 120);
  const byDay = {};
  upcoming.forEach(s => (byDay[s.date] = byDay[s.date] || []).push(s));
  openModal(`${modalHead('Apuntar a clases')}
    <p class="muted" style="margin-top:-8px">${esc(u.name)}${u.blocked ? ' · <b style="color:var(--danger)">bloqueado</b>' : ''} · ${esc(getPlan(u.planId)?.name || 'sin tarifa')} · ${esc(planSummary(u))}</p>
    <p class="muted small">Desde aquí puedes apuntarle aunque supere sus clases de la semana.</p>
    <form data-form="multiadd" data-id="${userId}">
      <div class="multi-list">${Object.keys(byDay).map(k => `<div class="multi-day">${fmtDateLong(k)}</div>
        ${byDay[k].map(s => { const ct = getClassType(s.classTypeId), f = freeSpots(s); return `<label class="multi-item"><input type="checkbox" name="sid" value="${s.id}">
          <span class="swatch" style="--c:${sessionColor(s)}"></span><b>${s.time}</b> ${esc(ct.name)} <span class="muted small" style="margin-left:auto">${f > 0 ? f + ' libres' : 'completa'}${isHidden(s) ? ' · oculta' : ''}</span></label>`; }).join('')}`).join('') || '<div class="empty">No hay clases próximas.</div>'}</div>
      <div class="field" style="margin-top:12px"><label>Cómo apuntarlo</label>
        <select name="mode"><option value="auto">En la clase (si está completa → lista de espera)</option>
          <option value="force">En la clase aunque esté completa (supera el aforo)</option>
          <option value="waitlist">Siempre en lista de espera</option></select></div>
      ${notifyChecks()}
      <p class="muted small">Si eliges avisar por correo, recibirá un único correo con todas las clases.</p>
      <div class="modal-actions"><button type="button" class="btn" data-a="client-open" data-id="${userId}">Volver</button><button class="btn primary" type="submit">Apuntar</button></div>
    </form>`);
}

// Grupo fijo de un horario semanal
function openSlot(slotId) {
  state.back = 'slot';
  const t = getSlot(slotId), ct = getClassType(t.classTypeId);
  const members = t.members.map(getUser).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  const others = clients().filter(c => c.active && !t.members.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  const next = db.sessions.filter(s => s.templateId === slotId && sessionStart(s) > new Date() && !s.cancelled).sort((a, b) => sessionStart(a) - sessionStart(b))[0];
  openModal(`${modalHead(`Grupo · ${esc(slotLabel(t))}`)}
    <div class="card row wrap" style="margin:-4px 0 12px;gap:12px">
      <div class="grow"><b>Plazas de este turno</b><div class="muted small">${t.capacity ? 'Propias de este turno' : `Las del tipo de clase (${ct.capacity})`}. Se aplican a todas sus próximas clases.</div></div>
      <input type="number" min="1" max="200" id="slot-cap" class="search" style="margin:0;width:90px" value="${slotCapacity(t)}">
      <button class="btn sm primary" data-a="slot-cap" data-id="${t.id}">Guardar</button>
    </div>
    <div class="card" style="margin:0 0 12px">
      <b>Color del turno</b> <span class="muted small">· se ve en tu horario, el calendario y la app de los socios</span>
      <div class="row wrap" style="margin-top:8px">${colorSwatches(slotColor(t), 'turn-color')}
        <input type="color" id="turn-color-custom" value="${slotColor(t)}" style="width:44px;height:32px;padding:2px;border-radius:8px;border:1px solid var(--border)"></div>
      <div class="row wrap" style="margin-top:8px">
        <label class="check" style="margin:0"><input type="checkbox" id="turn-color-all" checked> Todos los días de las ${t.time} (${db.schedule.filter(x => x.time === t.time && x.classTypeId === t.classTypeId).map(x => DOW[x.weekday]).join(', ')})</label>
        <button class="btn sm primary" style="margin-left:auto" data-a="turn-color-save" data-id="${t.id}">Guardar color</button>
      </div>
    </div>
    <div class="card" style="margin:0 0 12px">
      <b>Temporada y antelación</b> <span class="muted small">· ahora: ${seasonText(t)}${t.visibleDays != null && t.visibleDays !== '' ? ` · los socios lo ven ${t.visibleDays} días antes` : ''}</span>
      <div class="fields-2" style="margin-top:8px">
        <div class="field" style="margin:0"><label>Desde (mes)</label><input id="season-from" type="month" value="${t.startDate ? t.startDate.slice(0, 7) : ''}"></div>
        <div class="field" style="margin:0"><label>Hasta (mes)</label><input id="season-to" type="month" value="${t.endDate ? t.endDate.slice(0, 7) : ''}"></div>
      </div>
      <div class="row wrap" style="margin-top:8px">
        <div class="field grow" style="margin:0"><label>Días de antelación para los socios</label><input id="season-vis" type="number" min="0" max="120" placeholder="Lo general: ${db.settings.bookWindowDays}" value="${t.visibleDays ?? ''}"></div>
        <button class="btn sm primary" style="align-self:flex-end" data-a="slot-season" data-id="${t.id}">Guardar</button>
      </div>
    </div>
    <p class="muted" style="margin-top:-4px">${members.length} de ${slotCapacity(t)} plazas ocupadas por el grupo fijo${members.length > slotCapacity(t) ? ' · <b style="color:var(--danger)">supera el aforo</b>' : ''}.
      Las plazas que queden libres las pueden reservar otros clientes.</p>
    <div class="card list">${members.length ? members.map(u => `<div class="list-item"><div class="avatar">${initials(u.name)}</div>
      <div class="grow"><div class="ellipsis">${esc(u.name)}</div><div class="muted small">${esc(getPlan(u.planId)?.name || 'Sin tarifa')} · ${groupsOf(u.id).length} grupo(s)${u.blocked ? ' · <b style="color:var(--danger)">bloqueado</b>' : ''}
        ${!planStatus(u).ok && !u.blocked ? ' · <b style="color:var(--warn)">no se le reserva hasta que tenga tarifa activa</b>' : ''}</div></div>
      <button class="btn sm ghost" data-a="group-remove" data-id="${t.id}" data-u="${u.id}" title="Quitar del grupo">${icon('x', 'width="16" height="16"')}</button></div>`).join('') : '<div class="empty">Este horario no tiene grupo fijo todavía.</div>'}</div>
    <div class="section-h">Añadir clientes al grupo</div>
    <input class="search" placeholder="Buscar cliente…" data-filter="#group-add-list .multi-item">
    <label class="check small"><input type="checkbox" data-filter-nogroup="#group-add-list .multi-item"> Mostrar solo clientes sin ningún grupo</label>
    <div class="multi-list" id="group-add-list" style="max-height:30vh">${others.map(c => {
      const ng = groupsOf(c.id).length, w = isWeekly(c) ? getPlan(c.planId).perWeek : null;
      return `<label class="multi-item" data-search="${esc(norm2(c.name + ' ' + c.email))}" data-groups="${ng}"><input type="checkbox" name="gadd" value="${c.id}">
        <span class="grow ellipsis">${esc(c.name)}</span><span class="muted small">${esc(getPlan(c.planId)?.name || 'sin tarifa')} · ${ng}${w ? '/' + w : ''} grupo(s)</span></label>`;
    }).join('') || '<div class="empty">No quedan clientes por añadir.</div>'}</div>
    ${notifyChecks(false, true)}
    <button class="btn primary" data-a="group-add" data-id="${t.id}">Añadir seleccionados al grupo</button>
    <p class="muted small">Se le reservan ya las próximas clases de este horario y, a partir de ahí, todas las semanas.</p>
    ${next ? `<div class="modal-actions"><button class="btn" data-a="session-open" data-id="${next.id}">Ver próxima clase (${fmtDateShort(next.date)})</button></div>` : ''}`);
}
function openGroupRemove(slotId, userId) {
  const t = getSlot(slotId), u = getUser(userId);
  openModal(`${modalHead('Quitar del grupo')}
    <p><b>${esc(u.name)}</b> dejará de estar en el grupo fijo de ${esc(slotLabel(t))}.</p>
    <label class="check"><input type="checkbox" id="g-future" checked> Quitarle también de las próximas clases ya reservadas de este horario</label>
    ${notifyChecks(false, true)}
    <div class="modal-actions"><button class="btn" data-a="${state.back === 'client' ? 'client-open' : 'slot-open'}" data-id="${state.back === 'client' ? userId : slotId}">Volver</button>
      <button class="btn danger" data-a="group-remove-ok" data-id="${slotId}" data-u="${userId}">Quitar del grupo</button></div>`);
}

function openBlockForm(userId) {
  const u = getUser(userId);
  openModal(`${modalHead('Bloquear cliente')}
    <p><b>${esc(u.name)}</b> no podrá reservar ni apuntarse a listas de espera hasta que lo desbloquees.</p>
    <form data-form="block" data-id="${userId}">
      <div class="field"><label>Motivo (lo verá el cliente)</label><input name="reason" value="Cuota pendiente de pago"></div>
      <label class="check"><input type="checkbox" name="cancelFuture"> Quitarle también de sus próximas clases y listas de espera</label>
      <label class="check"><input type="checkbox" name="email" checked> ✉️ Avisar por correo</label>
      <div class="modal-actions"><button type="button" class="btn" data-a="client-open" data-id="${userId}">Volver</button><button class="btn danger" type="submit">Bloquear</button></div>
    </form>`);
}

// Resumen de cuotas pendientes para el panel «Hoy»
const PAY_LABEL = { stay: ['✅ Sigue', 'ok'], leave: ['👋 Se da de baja', 'danger'] };
function paymentSummaryHTML() {
  const due = clients().filter(c => c.paymentDue);
  if (!due.length) return '';
  const order = { leave: 0, null: 1, stay: 2 };
  due.sort((a, b) => (order[a.paymentAnswer] ?? 1) - (order[b.paymentAnswer] ?? 1) || a.name.localeCompare(b.name));
  const n = k => due.filter(c => (c.paymentAnswer || null) === k).length;
  return `<div class="section-h">Cuotas pendientes (${due.length}) · ${n('stay')} ${n('stay') === 1 ? 'sigue' : 'siguen'} · ${n('leave')} ${n('leave') === 1 ? 'se da' : 'se dan'} de baja · ${n(null)} sin responder</div>
    <div class="card list">${due.map(c => {
      const [txt, cls] = PAY_LABEL[c.paymentAnswer] || ['⏳ Sin responder', 'warn'];
      return `<div class="list-item clickable" data-a="client-open" data-id="${c.id}"><div class="avatar">${initials(c.name)}</div>
        <div class="grow"><div class="ellipsis">${esc(c.name)}</div><div class="muted small">${c.phone ? esc(c.phone) : esc(c.email)}</div></div>
        <span class="pill ${cls}">${txt}</span></div>`;
    }).join('')}</div>`;
}

// Lista de espera de clientes nuevos (solo administrador)
function viewProspects() {
  const list = [...(db.prospects || [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const q = norm2(state.search);
  const shown = list.filter(p => !q || norm2(`${p.name} ${p.lastName} ${p.phone} ${p.email}`).includes(q));
  return `
    <p class="muted small" style="margin-top:-4px">Personas que han preguntado por plaza, por orden de llegada. Solo la ves tú. Cuando quede un hueco, pulsa «Dar de alta» y pasa a ser cliente.</p>
    <div class="card list">${shown.length ? shown.map(p => `<div class="list-item prospect">
        <div class="avatar">${list.indexOf(p) + 1}</div>
        <div class="grow"><div style="font-weight:600">${esc(p.name)} ${esc(p.lastName)}</div>
          <div class="small contact">${p.phone ? `<a href="tel:${esc(p.phone.replace(/\s/g, ''))}">📞 ${esc(p.phone)}</a>` : ''}${p.email ? `<a href="mailto:${esc(p.email)}">✉️ ${esc(p.email)}</a>` : ''}</div>
          <div class="muted small">En espera desde el ${fmtDateShort(dateKey(new Date(p.createdAt)))}${p.note ? ' · ' + esc(p.note) : ''}</div></div>
        <div class="row prospect-actions"><button class="btn sm primary" data-a="prospect-convert" data-id="${p.id}">Dar de alta</button>
          <button class="btn sm" data-a="prospect-edit" data-id="${p.id}">Editar</button>
          <button class="btn sm ghost" data-a="prospect-del" data-id="${p.id}" title="Quitar de la lista">${icon('x', 'width="16" height="16"')}</button></div>
      </div>`).join('') : `<div class="empty">${list.length ? 'Nadie coincide con la búsqueda.' : 'Nadie en la lista de espera todavía.'}</div>`}</div>`;
}
function openProspectForm(id) {
  const p = id ? db.prospects.find(x => x.id === id) : { name: '', lastName: '', phone: '', email: '', note: '' };
  openModal(`${modalHead(id ? 'Editar persona' : 'Nueva persona en espera')}
    <form data-form="prospect" data-id="${id || ''}">
      <div class="fields-2">
        <div class="field"><label>Nombre</label><input name="name" required value="${esc(p.name)}"></div>
        <div class="field"><label>Apellidos</label><input name="lastName" value="${esc(p.lastName)}"></div>
        <div class="field"><label>Teléfono</label><input name="phone" type="tel" value="${esc(p.phone)}"></div>
        <div class="field"><label>Correo</label><input name="email" type="email" value="${esc(p.email)}"></div>
      </div>
      <div class="field"><label>Nota (opcional)</label><input name="note" value="${esc(p.note)}" placeholder="p. ej. prefiere tardes, 2 días"></div>
      <div class="modal-actions"><button type="button" class="btn" data-a="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
}

function viewAdminClients() {
  const tabs = `<div class="tabs"><button class="${state.clientsTab !== 'prospects' ? 'active' : ''}" data-a="clients-tab" data-t="clients">Clientes (${clients().length})</button>
    <button class="${state.clientsTab === 'prospects' ? 'active' : ''}" data-a="clients-tab" data-t="prospects">📝 Nuevos en espera (${(db.prospects || []).length})</button></div>`;
  if (state.clientsTab === 'prospects') return `
    <div class="page-title"><h1>Nuevos en espera</h1><button class="btn primary" data-a="prospect-edit">${icon('plus', 'width="18" height="18"')}Añadir persona</button></div>
    ${tabs}
    <input class="search" placeholder="Buscar por nombre, teléfono o correo…" value="${esc(state.search)}" data-input="search">
    ${viewProspects()}`;
  return viewAdminClientsList(tabs);
}

function viewAdminClientsList(tabs = '') {
  const q = norm2(state.search);
  state.sel = state.sel || new Set();
  const filters = {
    all: ['Todos', () => true],
    noplan: ['Sin tarifa', c => !getPlan(c.planId)],
    nogroup: ['Sin grupo', c => !groupsOf(c.id).length],
    pay: ['💶 Cuota pendiente', c => c.paymentDue],
    blocked: ['Bloqueados', c => c.blocked],
    bademail: ['Email inválido', c => c.emailInvalid || !c.email],
  };
  const f = filters[state.clientFilter || 'all'] || filters.all;
  const list = clients().filter(c => (!q || norm2(c.name).includes(q) || norm2(c.email).includes(q)) && f[1](c)).sort((a, b) => a.name.localeCompare(b.name));
  const selMode = !!state.selectMode;
  return `
    <div class="page-title"><h1>Clientes <span class="muted" style="font-size:15px">(${clients().length})</span></h1><div class="row wrap">
      <button class="btn" data-a="select-mode">${selMode ? 'Terminar selección' : '☑️ Seleccionar'}</button>
      <button class="btn" data-a="import">⬆️ Importar</button><button class="btn primary" data-a="client-edit">${icon('plus', 'width="18" height="18"')}Nuevo</button></div></div>
    ${tabs}
    <input class="search" placeholder="Buscar por nombre o email…" value="${esc(state.search)}" data-input="search">
    <div class="tabs">${Object.entries(filters).map(([k, [l, fn]]) => `<button class="${(state.clientFilter || 'all') === k ? 'active' : ''}" data-a="client-filter" data-f="${k}">${l} (${clients().filter(fn).length})</button>`).join('')}</div>
    ${selMode ? `<div class="card bulk-bar">
      <div class="row wrap"><b>${state.sel.size} seleccionados</b>
        <button class="btn sm" data-a="sel-all">Marcar los ${list.length} de la lista</button><button class="btn sm ghost" data-a="sel-none">Desmarcar</button></div>
      <div class="row wrap" style="margin-top:8px"><select class="search" style="margin:0;width:auto" id="bulk-plan">${db.plans.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
        <button class="btn primary sm" data-a="bulk-plan" ${state.sel.size ? '' : 'disabled'}>Asignar tarifa</button>
        <button class="btn sm danger" data-a="bulk-block" ${state.sel.size ? '' : 'disabled'}>🔒 Bloquear</button>
        <button class="btn sm" data-a="bulk-unblock" ${state.sel.size ? '' : 'disabled'}>🔓 Desbloquear</button></div>
      <div class="row wrap" style="margin-top:8px">
        <button class="btn sm" data-a="bulk-paydue" ${state.sel.size ? '' : 'disabled'}>💶 Marcar cuota pendiente</button>
        <button class="btn sm ok" data-a="bulk-paid" ${state.sel.size ? '' : 'disabled'}>✅ Marcar como pagada</button></div>
    </div>` : ''}
    <div class="card list">${list.length ? list.map(c => {
      const p = getPlan(c.planId), ps = planStatus(c);
      return `<div class="list-item clickable" data-a="${selMode ? 'sel-toggle' : 'client-open'}" data-id="${c.id}">
        ${selMode ? `<input type="checkbox" ${state.sel.has(c.id) ? 'checked' : ''} style="pointer-events:none;width:18px;height:18px">` : ''}
        <div class="avatar">${initials(c.name)}</div>
        <div class="grow"><div class="ellipsis" style="font-weight:600">${esc(c.name)} ${!c.active ? '<span class="pill">Inactivo</span>' : ''}${c.blocked ? '<span class="pill danger">🔒 Bloqueado</span>' : ''}${c.paymentDue ? `<span class="pill ${(PAY_LABEL[c.paymentAnswer] || [, 'warn'])[1]}">💶 ${c.paymentAnswer === 'stay' ? 'Sigue' : c.paymentAnswer === 'leave' ? 'Baja' : 'Pendiente'}</span>` : ''}</div>
          <div class="muted small ellipsis">${esc(c.email) || 'sin email'}${c.emailInvalid ? ' · ⚠️ email inválido' : ''}${groupsOf(c.id).length ? ` · 📅 ${groupsOf(c.id).length} grupo(s)` : ''}</div></div>
        <div style="text-align:right"><span class="pill ${ps.ok ? 'ok' : 'danger'}">${planSummary(c)}</span>
          <div class="muted small">${p ? esc(p.name) : ''}</div></div></div>`;
    }).join('') : '<div class="empty">No hay clientes.</div>'}</div>`;
}

function openClient(id) {
  const c = getUser(id), p = getPlan(c.planId), ps = planStatus(c);
  state.back = 'client';
  const now = new Date();
  const all = db.bookings.filter(b => b.userId === id && !['cancelled', 'late'].includes(b.status)).map(b => ({ b, s: getSession(b.sessionId) })).filter(x => x.s && !x.s.cancelled);
  const next = all.filter(x => sessionStart(x.s) > now).sort((a, b) => sessionStart(a.s) - sessionStart(b.s));
  const hist = all.filter(x => sessionStart(x.s) <= now).sort((a, b) => sessionStart(b.s) - sessionStart(a.s)).slice(0, 10);
  const lim = weeklyLimitFor(c);
  const attended = db.bookings.filter(b => b.userId === id && attendStatus(b) === 'attended').length;
  const noshow = db.bookings.filter(b => b.userId === id && b.status === 'noshow').length;
  openModal(`${modalHead(esc(c.name))}
    <p class="muted" style="margin-top:-8px">${esc(c.email)}${c.phone ? ' · ' + esc(c.phone) : ''}</p>
    ${c.blocked ? `<div class="card row between wrap" style="background:var(--danger-bg);border-color:transparent;margin-bottom:12px">
        <div><b style="color:var(--danger)">🔒 Bloqueado</b><div class="small">${esc(c.blockedReason || 'Sin motivo')}</div></div>
        <button class="btn ok" data-a="client-unblock" data-id="${c.id}">Desbloquear</button></div>` : ''}
    ${c.paymentDue ? `<div class="card row between wrap" style="background:var(--warn-bg);border-color:transparent;margin-bottom:12px">
        <div><b>💶 Cuota de ${monthName(c.paymentMonth)} pendiente</b>
          <div class="small">${c.paymentAnswer === 'stay' ? '✅ Ha respondido que <b>sigue</b>' : c.paymentAnswer === 'leave' ? '👋 Ha respondido que <b>se da de baja</b>' : '⏳ Todavía no ha respondido'}${c.paymentAnsweredAt ? ` · ${fmtAgo(c.paymentAnsweredAt)}` : ''}</div></div>
        <button class="btn ok" data-a="pay-paid" data-id="${c.id}">✅ Marcar como pagada</button></div>` : ''}
    <div class="row wrap" style="margin-bottom:12px">
      <button class="btn primary" data-a="multi-add" data-id="${c.id}">${icon('plus', 'width="16" height="16"')}Apuntar a clases</button>
      ${!c.paymentDue ? `<button class="btn" data-a="pay-due" data-id="${c.id}">💶 Cuota pendiente</button>` : ''}
      ${!c.blocked ? `<button class="btn danger" data-a="client-block" data-id="${c.id}">🔒 Bloquear (impago)</button>` : ''}
    </div>
    <div class="section-h" style="margin-top:4px">Grupos fijos (${groupsOf(c.id).length}${isWeekly(c) ? ` · tarifa de ${getPlan(c.planId).perWeek} por semana` : ''})</div>
    <div class="card list" style="margin-bottom:8px">${groupsOf(c.id).map(t => `<div class="list-item"><span class="swatch" style="--c:${slotColor(t)}"></span>
      <div class="grow">${esc(slotLabel(t))}</div>
      <button class="btn sm ghost" data-a="group-remove" data-id="${t.id}" data-u="${c.id}" title="Quitar del grupo">${icon('x', 'width="16" height="16"')}</button></div>`).join('') || '<div class="empty" style="padding:16px">Sin grupo fijo.</div>'}</div>
    ${isWeekly(c) && groupsOf(c.id).length > getPlan(c.planId).perWeek ? `<p class="small" style="color:var(--warn)">⚠️ Tiene más grupos que clases por semana en su tarifa.</p>` : ''}
    <div class="row" style="margin-bottom:12px"><select class="search" style="margin:0" id="client-group-sel"><option value="">Añadir a un grupo…</option>
      ${db.schedule.filter(t => !t.members.includes(c.id)).sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.time.localeCompare(b.time)).map(t => `<option value="${t.id}">${esc(slotLabel(t))} (${t.members.length}/${slotCapacity(t)})</option>`).join('')}</select>
      <button class="btn" data-a="client-group-add" data-id="${c.id}">Añadir</button></div>
    <div class="row wrap small" style="margin:-4px 0 8px">${notifyChecks()}</div>
    <div class="section-h" style="margin-top:4px">Próximas clases (${next.length})</div>
    <div class="card list" style="margin-bottom:12px">${next.length ? next.map(({ b, s }) => `<div class="list-item"><span class="swatch" style="--c:${sessionColor(s)}"></span>
      <div class="grow">${esc(getClassType(s.classTypeId).name)}<div class="muted small">${fmtDateShort(s.date)} · ${s.time}</div></div>
      <span class="pill ${b.status === 'waitlist' ? 'warn' : 'ok'}">${b.status === 'waitlist' ? 'Espera nº ' + waitlistPosition(b) : 'Reservada'}</span>
      <button class="btn sm ghost" data-a="admin-unbook" data-id="${b.id}" title="Quitar">${icon('x', 'width="16" height="16"')}</button></div>`).join('') : '<div class="empty">Sin clases próximas.</div>'}</div>
    <div class="card" style="margin-bottom:12px">
      <div class="row between"><div><div class="muted small">Tarifa actual</div><b>${p ? esc(p.name) : 'Sin tarifa'}</b></div>
        <div style="text-align:right"><span class="pill ${ps.ok ? 'ok' : 'danger'}">${ps.ok ? 'Activa' : 'Inactiva'}</span><div class="muted small">Cuota de ${monthName()}: ${c.paymentDue ? '💶 pendiente' : '✅ al día'}</div></div></div>
      ${isWeekly(c) ? [0, 7].map(off => {
        const d = addDays(weekStart(new Date()), off), used = weekCount(c.id, d), all = weekAllowance(c, d), ex = weekExtra(c, d);
        return `<div class="week-row">
          <div class="grow"><div class="muted small">${off ? 'Semana que viene' : 'Esta semana'} (lun ${d.getDate()} ${MONTHS[d.getMonth()]})</div>
            <b>${used} de ${all} usadas</b>${ex > 0 ? ` <span class="pill ok">+${ex} extra</span>` : ex < 0 ? ` <span class="pill">${-ex} pasada(s) a la siguiente</span>` : ''}</div>
          <div class="row"><button class="btn sm" data-a="week-extra" data-id="${c.id}" data-k="${dateKey(d)}" data-d="-1" ${ex > 0 ? '' : 'disabled'} title="Quitar clase extra">−1</button>
            <button class="btn sm" data-a="week-extra" data-id="${c.id}" data-k="${dateKey(d)}" data-d="1" title="Añadir clase extra">+1 extra</button></div></div>`;
      }).join('') + (() => {
        const left = weekLeft(c, new Date());
        return `<div class="row wrap" style="margin-top:10px"><button class="btn sm" data-a="carry" data-id="${c.id}" ${left ? '' : 'disabled'}>➡️ Pasar ${left} sin usar a la semana que viene</button></div>
          <p class="muted small" style="margin:6px 0 0">Las clases no usadas se pierden al acabar la semana, salvo que las pases tú o le añadas extras.</p>`;
      })()
      : `<div class="row between" style="margin-top:10px">
        <div><div class="muted small">Clases disponibles</div><div style="font-size:24px;font-weight:700">${c.credits === null ? '∞' : c.credits}</div></div>
        ${c.credits !== null && p ? `<div class="row"><button class="btn sm" data-a="credits" data-id="${c.id}" data-d="-1">−1</button><button class="btn sm" data-a="credits" data-id="${c.id}" data-d="1">+1</button></div>` : ''}
      </div>`}
      <div class="row" style="margin-top:12px"><select class="search" style="margin:0" id="plan-sel">${db.plans.map(pl => `<option value="${pl.id}">${esc(pl.name)} · ${pl.price} €</option>`).join('')}</select>
        <button class="btn primary" data-a="assign-plan" data-id="${c.id}">Asignar / renovar</button></div>
      <p class="muted small" style="margin:6px 0 0">Asignar o renovar la tarifa reinicia la fecha de caducidad. El cobro se hace en el centro.</p>
      <div class="row wrap ${isWeekly(c) ? 'hidden' : ''}" style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
        <div class="grow"><div class="muted small">Máximo de clases por semana</div><b>${lim ? lim : 'Sin límite'}</b> <span class="muted small">${c.weeklyLimit == null ? '(general del centro)' : '(personalizado)'}</span></div>
        <input type="number" min="0" max="30" style="width:80px" class="search" id="wl-input" placeholder="—" value="${c.weeklyLimit ?? ''}">
        <button class="btn sm" data-a="weekly-limit" data-id="${c.id}">Guardar</button>
      </div>
      <p class="muted small ${isWeekly(c) ? 'hidden' : ''}" style="margin:4px 0 0">Déjalo vacío para usar el límite general (Ajustes). 0 = sin límite.</p>
    </div>
    <div class="grid-stats" style="grid-template-columns:1fr 1fr;margin-bottom:6px">
      <div class="card stat"><div class="v">${attended}</div><div class="l">Asistencias</div></div>
      <div class="card stat"><div class="v">${noshow}</div><div class="l">Faltas</div></div></div>
    <div class="section-h">Historial</div>
    <div class="card list">${hist.length ? hist.map(({ b, s }) => `<div class="list-item"><span class="swatch" style="--c:${sessionColor(s)}"></span>
      <div class="grow">${esc(getClassType(s.classTypeId).name)}<div class="muted small">${fmtDateShort(s.date)} · ${s.time}</div></div>
      <span class="pill ${attendStatus(b) === 'attended' ? 'ok' : b.status === 'noshow' ? 'danger' : ''}">${{ booked: 'Reservada', waitlist: 'En espera', attended: '✓ Asistió', noshow: '✗ No vino' }[attendStatus(b)]}</span></div>`).join('') : '<div class="empty">Sin reservas.</div>'}</div>
    <div class="modal-actions">
      <button class="btn" data-a="client-toggle" data-id="${c.id}">${c.active ? 'Desactivar cuenta' : 'Activar cuenta'}</button>
      <button class="btn primary" data-a="client-edit" data-id="${c.id}">Editar datos</button></div>`);
}

function openClientForm(id, prefill = null, prospectId = '') {
  const c = id ? getUser(id) : (prefill || { name: '', email: '', phone: '' });
  openModal(`${modalHead(id ? 'Editar cliente' : prospectId ? 'Dar de alta' : 'Nuevo cliente')}
    ${prospectId ? '<p class="muted small" style="margin-top:-8px">Al guardar, la persona sale de la lista de espera de nuevos y pasa a ser cliente.</p>' : ''}
    <form data-form="client" data-id="${id || ''}" data-prospect="${prospectId}">
      <div class="field"><label>Nombre y apellidos</label><input name="name" required value="${esc(c.name)}"></div>
      <div class="field"><label>Email</label><input name="email" type="email" required value="${esc(c.email)}"></div>
      <div class="field"><label>Teléfono</label><input name="phone" value="${esc(c.phone)}"></div>
      ${!id ? `<div class="field"><label>Tarifa inicial (opcional)</label><select name="planId"><option value="">Sin tarifa</option>${db.plans.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>` : ''}
      <div class="modal-actions"><button type="button" class="btn" data-a="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
}

function viewAdminSchedule() {
  const tab = state.schedTab;
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `
    <div class="page-title"><h1>Clases y horario</h1></div>
    <div class="tabs"><button class="${tab === 'week' ? 'active' : ''}" data-a="sched-tab" data-t="week">Horario semanal</button>
      <button class="${tab === 'cal' ? 'active' : ''}" data-a="sched-tab" data-t="cal">📅 Calendario de la temporada</button>
      <button class="${tab === 'types' ? 'active' : ''}" data-a="sched-tab" data-t="types">Tipos de clase</button></div>
    ${tab === 'cal' ? viewSeasonCalendar() : tab === 'week' ? `
      <div class="row between wrap" style="margin-bottom:10px"><p class="muted small" style="margin:0">El horario se repite cada semana. Pulsa en un horario para gestionar su <b>grupo fijo</b>: sus clientes tendrán plaza reservada automáticamente cada semana.</p>
        <div class="row wrap"><button class="btn" data-a="auto-colors">🎨 Un color por turno</button>
        <button class="btn" data-a="season-all">📆 Temporada de todos los turnos</button>
        <button class="btn primary" data-a="slot-add">${icon('plus', 'width="18" height="18"')}Añadir horario</button></div></div>
      <div class="week-grid">${order.map(w => `<div class="week-col"><h4>${DOW_LONG[w]}</h4>
        ${db.schedule.filter(t => t.weekday === w).sort((a, b) => a.time.localeCompare(b.time)).map(t => { const ct = getClassType(t.classTypeId); return ct ? `<div class="slot clickable ${ct.hidden ? 'is-hidden' : ''}" style="--c:${slotColor(t)}" data-a="slot-open" data-id="${t.id}" title="Ver grupo fijo"><div><b>${t.time}</b> ${esc(ct.name)}${ct.hidden ? ' 🙈' : ''}
          <div class="slot-members ${(t.members || []).length > slotCapacity(t) ? 'over' : ''}">👥 ${(t.members || []).length}/${slotCapacity(t)}${t.capacity ? ' plazas' : ''}</div>
          ${t.startDate || t.endDate || (t.visibleDays != null && t.visibleDays !== '') ? `<div class="slot-members">📆 ${seasonText(t)}${t.visibleDays != null && t.visibleDays !== '' ? ` · 👁 ${t.visibleDays} d` : ''}</div>` : ''}</div><button class="x" data-a="slot-del" data-id="${t.id}" title="Quitar">×</button></div>` : ''; }).join('') || '<div class="muted small">—</div>'}
      </div>`).join('')}</div>` : `
      <div class="row between" style="margin-bottom:10px"><span></span><button class="btn primary" data-a="ct-edit">${icon('plus', 'width="18" height="18"')}Nuevo tipo de clase</button></div>
      <div class="card list">${db.classTypes.map(ct => `<div class="list-item clickable" data-a="ct-edit" data-id="${ct.id}">
        <span class="swatch" style="--c:${ct.color};width:18px;height:18px"></span>
        <div class="grow"><b>${esc(ct.name)}</b> ${ct.hidden ? '<span class="pill">🙈 Oculta</span>' : ''}<div class="muted small">${esc(ct.coach)} · ${ct.duration} min · ${ct.capacity} plazas</div></div>
        <span class="muted small">${db.schedule.filter(t => t.classTypeId === ct.id).length} horarios/sem</span></div>`).join('')}</div>`}`;
}

// Muestrario de colores para los turnos (al pulsar uno se copia al selector)
const colorSwatches = (current, name) => TURN_COLORS.map(c =>
  `<button type="button" class="swatch-btn ${String(current).toLowerCase() === c.toLowerCase() ? 'on' : ''}" style="--c:${c}" data-a="pick-color" data-c="${c}" data-target="${name}" title="${c}"></button>`).join('');
const monthLastDay = ym => { const [y, m] = ym.split('-').map(Number); return dateKey(new Date(y, m, 0)); };
const seasonText = t => !t.startDate && !t.endDate ? 'Todo el año'
  : `${t.startDate ? MONTHS_FULL[parseKey(t.startDate).getMonth()].slice(0, 3) : '…'}–${t.endDate ? MONTHS_FULL[parseKey(t.endDate).getMonth()].slice(0, 3) + ' ' + String(parseKey(t.endDate).getFullYear()).slice(2) : 'sin fin'}`;
// Calendario de toda la temporada, semana a semana (el administrador ve todo; marca lo que ya ven los socios)
const MONTHS_FULL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function viewSeasonCalendar() {
  const thisWeek = weekStart(new Date());
  const lastWeek = weekStart(parseKey(seasonEnd()));
  let ws = state.calWeek ? parseKey(state.calWeek) : thisWeek;
  if (ws < thisWeek) ws = thisWeek;
  if (ws > lastWeek) ws = lastWeek;
  state.calWeek = dateKey(ws);
  const we = addDays(ws, 6);
  const label = ws.getMonth() === we.getMonth()
    ? `${ws.getDate()} al ${we.getDate()} de ${MONTHS_FULL[we.getMonth()]}`
    : `${ws.getDate()} de ${MONTHS_FULL[ws.getMonth()]} al ${we.getDate()} de ${MONTHS_FULL[we.getMonth()]}`;
  const weeksLeft = Math.round((lastWeek - ws) / (7 * 86400000));
  const days = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(ws, i));
  const today = dateKey(new Date());
  return `
    <div class="cal-nav card">
      <button class="btn" data-a="cal-week" data-d="-1" ${ws <= thisWeek ? 'disabled' : ''}>‹ Anterior</button>
      <div class="cal-title"><b>Semana del ${label}</b><div class="muted small">${weeksLeft ? `Quedan ${weeksLeft} semanas de temporada (hasta el ${parseKey(seasonEnd()).getDate()} de ${MONTHS_FULL[parseKey(seasonEnd()).getMonth()]} de ${parseKey(seasonEnd()).getFullYear()})` : 'Última semana de la temporada'}</div></div>
      <button class="btn" data-a="cal-week" data-d="1" ${ws >= lastWeek ? 'disabled' : ''}>Siguiente ›</button>
    </div>
    <div class="row wrap" style="margin:8px 0 10px;gap:6px">
      <button class="btn sm" data-a="cal-week" data-d="0">Esta semana</button>
      <button class="btn sm" data-a="cal-week" data-d="4">+1 mes</button>
      <span class="muted small" style="margin-left:auto">👁 = ya lo ven los socios · 🔒 = todavía no</span>
    </div>
    <div class="week-grid">${days.map(d => {
      const k = dateKey(d);
      const real = sessionsOn(k);
      const items = [...real, ...projectedSessions(k)].sort((a, b) => a.time.localeCompare(b.time));
      return `<div class="week-col ${k === today ? 'today' : ''}"><h4>${DOW_LONG[d.getDay()]} ${d.getDate()}</h4>
        ${items.map(s => {
          const ct = getClassType(s.classTypeId); if (!ct) return '';
          const n = s.projected ? s.members : bookedIn(s.id).length;
          const vis = !s.cancelled && isVisibleToClients(s);
          const past = sessionStart(s) <= new Date();
          return `<div class="slot clickable ${s.cancelled ? 'cancelled' : ''} ${isHidden(s) ? 'is-hidden' : ''}" style="--c:${sessionColor(s)}"
              data-a="cal-open" ${s.projected ? `data-slot="${s.templateId}" data-k="${k}"` : `data-id="${s.id}"`} title="${s.projected ? 'Clase prevista: se crea al abrirla' : ''}">
            <div><b>${s.time}</b> ${esc(ct.name)}
              <div class="slot-members ${n > s.capacity ? 'over' : ''}">${s.cancelled ? '❌ Cancelada' : `👥 ${n}/${s.capacity}${s.projected ? ' previstos' : ''}`} ${past ? '' : vis ? '· 👁' : '· 🔒'}</div></div></div>`;
        }).join('') || '<div class="muted small">—</div>'}</div>`;
    }).join('')}</div>
    <p class="muted small" style="margin-top:10px">Los socios ven las clases con ${db.settings.publishMode === 'weekly' ? 'la publicación semanal de Ajustes' : `${db.settings.bookWindowDays} días de antelación`} (cada día aparece uno más), salvo los turnos con antelación propia. Tú las ves todas. Pulsa una clase para ver quién va, cambiar plazas o cancelarla.</p>`;
}

function openClassTypeForm(id) {
  const ct = id ? getClassType(id) : { name: '', color: '#e4572e', coach: '', capacity: 12, duration: 60, description: '' };
  openModal(`${modalHead(id ? 'Editar tipo de clase' : 'Nuevo tipo de clase')}
    <form data-form="ct" data-id="${id || ''}">
      <div class="field"><label>Nombre</label><input name="name" required value="${esc(ct.name)}"></div>
      <div class="fields-2">
        <div class="field"><label>Entrenador/a</label><input name="coach" required value="${esc(ct.coach)}"></div>
        <div class="field"><label>Color</label><input name="color" type="color" value="${ct.color}" style="height:44px;padding:4px"></div>
        <div class="field"><label>Aforo (plazas)</label><input name="capacity" type="number" min="1" required value="${ct.capacity}"></div>
        <div class="field"><label>Duración (min)</label><input name="duration" type="number" min="10" step="5" required value="${ct.duration}"></div>
      </div>
      <div class="field"><label>Descripción</label><textarea name="description">${esc(ct.description)}</textarea></div>
      <label class="check"><input type="checkbox" name="hidden" ${ct.hidden ? 'checked' : ''}> 🙈 Ocultar este tipo de clase a los clientes (no lo verán ni podrán reservarlo)</label>
      <div class="modal-actions">${id ? `<button type="button" class="btn danger" data-a="ct-del" data-id="${id}" style="margin-right:auto">Eliminar</button>` : ''}
        <button type="button" class="btn" data-a="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
}

function openSlotForm(oneOff = false) {
  openModal(`${modalHead(oneOff ? 'Añadir clase extra' : 'Añadir horario semanal')}
    <form data-form="${oneOff ? 'oneoff' : 'slot'}">
      <div class="field"><label>Tipo de clase</label><select name="classTypeId">${db.classTypes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      ${oneOff ? `<div class="field"><label>Fecha</label><input name="date" type="date" required value="${state.date}"></div>
        <label class="check"><input type="checkbox" name="hidden"> 🙈 Crearla oculta (no la verán los clientes)</label>`
      : `<div class="field"><label>Días de la semana</label><div class="row wrap">${[1, 2, 3, 4, 5, 6, 0].map(w => `<label class="check" style="margin:0 8px 4px 0"><input type="checkbox" name="wd" value="${w}"> ${DOW[w]}</label>`).join('')}</div></div>`}
      <div class="fields-2">
        <div class="field"><label>Hora de inicio</label><input name="time" type="time" required value="18:00"></div>
        <div class="field"><label>Plazas</label><input name="capacity" type="number" min="1" max="200" placeholder="${db.classTypes[0]?.capacity ?? 20}" value="${db.classTypes[0]?.capacity ?? 20}"></div>
      </div>
      <p class="muted small" style="margin-top:-4px">Las plazas se pueden cambiar luego en cada turno.</p>
      ${oneOff ? '' : `
      <div class="field"><label>Color del turno</label>
        <div class="row wrap">${colorSwatches(TURN_COLORS[db.schedule.length ? new Set(db.schedule.map(t => t.time)).size % TURN_COLORS.length : 0], 'new-color')}
          <input type="color" name="color" id="new-color-custom" value="${TURN_COLORS[db.schedule.length ? new Set(db.schedule.map(t => t.time)).size % TURN_COLORS.length : 0]}" style="width:44px;height:32px;padding:2px;border-radius:8px;border:1px solid var(--border)"></div></div>
      <div class="section-h" style="margin-top:4px">Temporada</div>
      <div class="fields-2">
        <div class="field"><label>Desde (mes)</label><input name="from" type="month" value="${dateKey(new Date()).slice(0, 7)}"></div>
        <div class="field"><label>Hasta (mes)</label><input name="to" type="month" value="${defaultSeasonEnd().slice(0, 7)}"></div>
      </div>
      <p class="muted small" style="margin-top:-4px">Se repite todas las semanas de esos meses. Deja «Hasta» vacío si no tiene fin.</p>
      <div class="field"><label>Los socios lo ven con estos días de antelación</label>
        <input name="visibleDays" type="number" min="0" max="120" placeholder="Lo general: ${db.settings.bookWindowDays} días"></div>
      <p class="muted small" style="margin-top:-4px">Vacío = lo que tengas en Ajustes. Cada día que pasa aparece un día más. Tú lo ves siempre todo.</p>`}
      <div class="modal-actions"><button type="button" class="btn" data-a="close">Cancelar</button><button class="btn primary" type="submit">Añadir</button></div>
    </form>`);
}

function openAnnouncementForm(id) {
  const a = id ? db.announcements.find(x => x.id === id) : { title: '', body: '', pinned: false };
  openModal(`${modalHead(id ? 'Editar anuncio' : 'Nuevo anuncio')}
    <form data-form="ann" data-id="${id || ''}">
      <div class="field"><label>Título</label><input name="title" required value="${esc(a.title)}"></div>
      <div class="field"><label>Mensaje</label><textarea name="body" required>${esc(a.body)}</textarea></div>
      <label class="check"><input type="checkbox" name="pinned" ${a.pinned ? 'checked' : ''}> Fijar arriba del tablón</label>
      ${!id ? '<p class="muted small">Todos los clientes recibirán una notificación.</p>' : ''}
      <div class="modal-actions"><button type="button" class="btn" data-a="close">Cancelar</button><button class="btn primary" type="submit">${id ? 'Guardar' : 'Publicar'}</button></div>
    </form>`);
}

function viewAdminSettings() {
  const s = db.settings;
  return `
    <div class="page-title"><h1>Ajustes</h1></div>
    ${brandSettingsHTML()}
    <div class="page-title" style="margin-top:26px"><h1 style="font-size:18px">Datos legales</h1><button class="btn sm" data-a="privacy">Ver la privacidad</button></div>
    <form class="card" data-form="legal">
      <p class="muted small" style="margin-top:0">Aparecen en la información de privacidad que ven los socios.</p>
      <div class="fields-2">
        <div class="field"><label>NIF / CIF</label><input name="nif" value="${esc(legal().nif)}" placeholder="Opcional"></div>
        <div class="field"><label>Email de contacto</label><input name="email" type="email" value="${esc(legal().email)}"></div>
        <div class="field"><label>Teléfono</label><input name="phone" value="${esc(legal().phone)}"></div>
        <div class="field"><label>Dirección</label><input name="address" value="${esc(legal().address)}"></div>
      </div>
      <button class="btn primary" type="submit">Guardar datos legales</button>
    </form>
    <div class="page-title" style="margin-top:26px"><h1 style="font-size:18px">Normas de reserva</h1></div>
    <form class="card" data-form="settings">
      <div class="section-h" style="margin-top:0">Publicación de clases y horarios</div>
      <div class="field"><label>¿Cuándo ven los clientes las clases?</label>
        <select name="publishMode" data-change="publish-mode">
          <option value="rolling" ${s.publishMode === 'rolling' ? 'selected' : ''}>Siempre X días por delante</option>
          <option value="weekly" ${s.publishMode === 'weekly' ? 'selected' : ''}>La semana siguiente se publica un día y hora fijos</option>
        </select></div>
      <div class="fields-2 ${s.publishMode === 'rolling' ? '' : 'hidden'}" id="pub-rolling">
        <div class="field"><label>Días que ven los socios por delante (cada día aparece uno más)</label><input name="bookWindowDays" type="number" min="1" max="120" value="${s.bookWindowDays}"></div>
      </div>
      <div class="fields-2 ${s.publishMode === 'weekly' ? '' : 'hidden'}" id="pub-weekly">
        <div class="field"><label>Día de publicación</label><select name="publishWeekday">${[1, 2, 3, 4, 5, 6, 0].map(w => `<option value="${w}" ${s.publishWeekday === w ? 'selected' : ''}>${DOW_LONG[w]}</option>`).join('')}</select></div>
        <div class="field"><label>Hora</label><input name="publishTime" type="time" value="${s.publishTime}"></div>
      </div>
      <p class="muted small" style="margin-top:-4px">Ahora mismo los clientes ven las clases hasta el <b>${fmtDateLong(dateKey(addDays(visibleUntil(), -1)))}</b>.</p>

      <div class="section-h">Reservas</div>
      <div class="fields-2">
        <div class="field"><label>Máx. clases/semana en bonos por nº de clases (0 = sin límite)</label><input name="weeklyLimit" type="number" min="0" max="30" value="${s.weeklyLimit}"></div>
        <div class="field"><label>Horas mínimas para cancelar gratis</label><input name="cancelHours" type="number" min="0" max="72" value="${s.cancelHours}"></div>
        <div class="field"><label>Recordatorio (horas antes)</label><input name="reminderHours" type="number" min="0" max="48" value="${s.reminderHours}"></div>
        <div class="field"><label>Máximo en lista de espera</label><input name="waitlistMax" type="number" min="1" max="50" value="${s.waitlistMax}"></div>
      </div>
      <label class="check"><input type="checkbox" name="onePerDay" ${s.onePerDay ? 'checked' : ''}> Máximo una clase al día por cliente</label>
      <div class="field"><label>Días que aparecen en la app de los socios</label>
        <div class="row wrap">${[1, 2, 3, 4, 5, 6, 0].map(w => `<label class="tab-radio"><input type="checkbox" name="showDay" value="${w}" ${(s.hiddenWeekdays || []).map(Number).includes(w) ? '' : 'checked'}><span>${DOW[w]}</span></label>`).join('')}</div>
        <p class="muted small" style="margin:6px 0 0">Desmarca sábado y domingo si no hay clases, para que el calendario de los socios no quede tan cargado. Tú los sigues viendo.</p></div>
      <label class="check"><input type="checkbox" name="waitlistEnabled" ${s.waitlistEnabled ? 'checked' : ''}> Activar lista de espera automática</label>
      <label class="check"><input type="checkbox" name="emailOnPromote" ${s.emailOnPromote ? 'checked' : ''}> ✉️ Enviar correo cuando alguien entra desde la lista de espera (la notificación en la app se envía siempre)</label>

      <div class="section-h">Cuota mensual</div>
      <label class="check"><input type="checkbox" name="autoMonthlyDue" ${s.autoMonthlyDue !== false ? 'checked' : ''}> 💶 Marcar a todos los socios «cuota pendiente» automáticamente cada mes</label>
      <div class="fields-2">
        <div class="field"><label>Día del mes en que se marca</label><input name="autoMonthlyDay" type="number" min="1" max="28" value="${s.autoMonthlyDay || 1}"></div>
      </div>
      <label class="check"><input type="checkbox" name="autoMonthlyEmail" ${s.autoMonthlyEmail ? 'checked' : ''}> ✉️ Avisar también por correo (si no, solo en la app)</label>
      <p class="muted small" style="margin-top:-4px">Les sale el aviso «¿Sigues con nosotros?» y tú ves las respuestas en Hoy. A quien ya hayas marcado como pagado ese mes no se le vuelve a marcar. Empieza a funcionar el mes que viene.</p>
      <button class="btn primary" type="submit">Guardar ajustes</button>
    </form>
    <div class="page-title" style="margin-top:26px"><h1 style="font-size:18px">Correos enviados</h1><button class="btn sm" data-a="emails">Ver bandeja (${db.emails.length})</button></div>
    <p class="muted small" style="margin-top:-8px">${window.SERVER ? 'Los correos se envían desde tu Gmail en menos de un minuto. Aquí ves los de los últimos 30 días.' : 'En el prototipo los correos no salen de verdad: se guardan aquí para que veas qué recibiría cada cliente.'}</p>
    <div class="page-title" style="margin-top:26px"><h1 style="font-size:18px">Tarifas</h1><button class="btn primary sm" data-a="plan-edit">${icon('plus', 'width="16" height="16"')}Nueva tarifa</button></div>
    <div class="card list">${db.plans.map(p => `<div class="list-item clickable" data-a="plan-edit" data-id="${p.id}">
      <div class="grow"><b>${esc(p.name)}</b><div class="muted small">${planDesc(p)} · cuota mensual</div></div>
      <b>${p.price} €</b></div>`).join('')}</div>
    ${window.SERVER ? '' : `<div class="section-h">Prototipo</div>
    <div class="card row between wrap"><span class="muted small">Borra todos los cambios y vuelve a los datos de ejemplo.</span><button class="btn danger" data-a="reset">Restablecer datos</button></div>`}`;
}

// En modo prueba todos cuentan como «enviados» (no salen de verdad)
const emailSent = e => !window.SERVER || !!e.sentAt;
function openEmails() {
  const list = [...db.emails].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
  const sent = db.emails.filter(emailSent).length, pending = db.emails.length - sent;
  openModal(`${modalHead(window.SERVER ? 'Correos enviados' : 'Correos enviados (simulados)')}
    ${db.emails.length ? `<div class="row between wrap" style="margin:-6px 0 10px">
      <span class="muted small">${sent} ${sent === 1 ? 'enviado' : 'enviados'}${window.SERVER && pending ? ` · ${pending} pendiente(s) o con error` : ''}</span>
      ${sent ? `<button class="btn sm" data-a="emails-clear">🗑 Borrar los enviados (${sent})</button>` : ''}</div>` : ''}
    <div class="stack">${list.length ? list.map(e => `<div class="card email">
      <div class="row between" style="gap:8px"><b>${esc(e.subject)}</b><span class="row" style="gap:4px"><span class="muted small">${fmtAgo(e.date)}</span>
        <button class="btn sm ghost" data-a="email-del" data-id="${e.id}" title="${emailSent(e) ? 'Borrar' : 'Borrar (no se enviará)'}" aria-label="Borrar">${icon('x', 'width="16" height="16"')}</button></span></div>
      <div class="muted small">Para: ${esc(e.to)}${window.SERVER ? (e.sentAt ? ' · ✅ enviado' : e.error ? ` · ❌ error: ${esc(e.error)}` : ' · ⏳ pendiente') : ''}</div><pre>${esc(e.body)}</pre></div>`).join('') : '<div class="empty">No hay correos en la bandeja.</div>'}</div>`);
}

function openPlanForm(id) {
  const p = id ? getPlan(id) : { name: '', type: 'weekly', perWeek: 2, credits: 8, durationDays: 30, price: 50 };
  const w = p.type === 'weekly';
  openModal(`${modalHead(id ? 'Editar tarifa' : 'Nueva tarifa')}
    <form data-form="plan" data-id="${id || ''}">
      <div class="field"><label>Nombre</label><input name="name" required value="${esc(p.name)}" placeholder="p. ej. 2 días por semana"></div>
      <div class="field"><label>Tipo</label><select name="type" data-change="plan-type">
        <option value="weekly" ${w ? 'selected' : ''}>Clases por semana (no se acumulan)</option>
        <option value="bono" ${!w ? 'selected' : ''}>Bono de X clases en total (p. ej. clase suelta)</option></select></div>
      <div class="field ${w ? '' : 'hidden'}" id="pt-weekly"><label>Clases por semana</label><input name="perWeek" type="number" min="1" max="7" value="${p.perWeek ?? 2}"></div>
      <div id="pt-bono" class="${w ? 'hidden' : ''}">
        <label class="check"><input type="checkbox" name="unlimited" ${p.credits === null && !w ? 'checked' : ''}> Clases ilimitadas</label>
      </div>
      <div class="fields-2">
        <div class="field ${w ? 'hidden' : ''}" id="pt-credits"><label>Nº de clases</label><input name="credits" type="number" min="1" value="${p.credits ?? 8}"></div>
        <input type="hidden" name="durationDays" value="${p.durationDays || 30}">
        <div class="field"><label>Precio (€)</label><input name="price" type="number" min="0" step="0.5" required value="${p.price}"></div>
      </div>
      <div class="modal-actions">${id ? `<button type="button" class="btn danger" data-a="plan-del" data-id="${id}" style="margin-right:auto">Eliminar</button>` : ''}
        <button type="button" class="btn" data-a="close">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
}

// ============================================================
//  EVENTOS
// ============================================================
const actions = {
  'login-as': d => login(d.id),
  logout: () => logout(),
  nav: d => { state.view = d.v; if (d.v === 'c-book' || d.v === 'a-agenda') state.date = dateKey(new Date()); closeModal(); render(); window.scrollTo(0, 0); },
  day: d => { state.date = d.k; render(); },
  close: () => closeModal(),
  bg: (d, el, e) => { if (e.target === el) closeModal(); },
  notifs: () => { document.querySelector('.notif-banner')?.remove(); openNotifications(); render(); },
  'mine-tab': d => { state.mineTab = d.t; render(); },
  privacy: () => openPrivacy(),
  'theme-pref': d => { setThemePref(d.v); render(); },
  'notif-clear': async (d, el) => { el.disabled = true; await deleteReadNotifications(state.userId); openNotifications(); render(); toast('Notificaciones leídas borradas', 'ok'); },
  'notif-del': async d => { await deleteNotification(d.id); openNotifications(); render(); },
  'pay-answer': async (d, el) => {
    el.disabled = true;
    const r = await answerPayment(state.userId, d.v);
    toast(r.msg, r.ok ? 'ok' : 'err'); render();
  },

  book: async (d, el) => {
    el.disabled = true;
    const r = await book(state.userId, d.id);
    toast(r.msg, r.ok ? (r.waitlist ? '' : 'ok') : 'err');
    render();
  },
  'cancel-booking': async d => {
    const b = db.bookings.find(x => x.id === d.id), s = getSession(b.sessionId);
    const ct = getClassType(s.classTypeId).name;
    if (b.status === 'waitlist') { const r = await cancelBooking(d.id); toast(r.msg); return render(); }
    const late = isLateCancel(s);
    confirmModal('¿Cancelar reserva?', `${esc(ct)} · ${fmtDateShort(s.date)} a las ${s.time}.<br><br>${late
      ? `<b style="color:var(--danger)">Estás fuera de plazo</b> (menos de ${db.settings.cancelHours} h): la clase <b>contará como gastada</b>.`
      : (isWeekly(me()) ? 'Recuperarás la clase para usarla otro día de esa semana.' : 'La clase se devolverá a tu bono.')}`, `data-a="cancel-booking-ok" data-id="${d.id}"`, 'Sí, cancelar');
  },
  'cancel-booking-ok': async (d, el) => { el.disabled = true; const r = await cancelBooking(d.id); closeModal(); toast(r.msg, r.ok ? 'ok' : 'err'); render(); },

  // Admin: sesiones
  'session-open': d => openSession(d.id),
  'session-cancel': d => openModal(`${modalHead('Cancelar clase')}<p>Se avisará a todos los apuntados y se les devolverá la clase.</p>
    <div class="field"><label>Motivo (opcional)</label><input id="cancel-reason" placeholder="p. ej. entrenador enfermo"></div>
    <div class="modal-actions"><button class="btn" data-a="session-open" data-id="${d.id}">Volver</button><button class="btn danger" data-a="session-cancel-ok" data-id="${d.id}">Cancelar clase</button></div>`),
  'session-cancel-ok': d => { cancelSession(d.id, $('#cancel-reason')?.value.trim()); toast('Clase cancelada y clientes avisados', 'ok'); openSession(d.id); render(); },
  'session-restore': d => { restoreSession(d.id); openSession(d.id); render(); },
  'session-hide': d => { toggleSessionHidden(d.id); toast(getSession(d.id).hidden ? 'Clase oculta a los clientes' : 'Clase visible para los clientes'); openSession(d.id); render(); },
  attend: d => { const b = getBooking(d.id); setAttendance(d.id, d.s); openSession(b.sessionId); render(); },
  'admin-unbook': d => openRemoveConfirm(d.id),
  'admin-unbook-ok': d => {
    const b = getBooking(d.id);
    adminRemoveBooking(d.id, readNotify());
    toast('Cliente quitado de la clase', 'ok');
    state.back === 'client' ? openClient(b.userId) : openSession(b.sessionId); render();
  },
  'admin-book': d => {
    const cid = $('#add-client-sel').value;
    if (!cid) return toast('Elige un cliente', 'err');
    const r = adminAddToSessions(cid, [d.id], { mode: d.m, whenFull: 'force', ...readNotify() });
    toast(r.waitlist.length ? 'Puesto en lista de espera' : 'Cliente apuntado', 'ok'); openSession(d.id); render();
  },
  'multi-add': d => openMultiAdd(d.id),
  'client-block': d => openBlockForm(d.id),
  'client-unblock': d => { unblockUser(d.id); toast('Cliente desbloqueado y avisado', 'ok'); openClient(d.id); render(); },
  'weekly-limit': d => {
    const v = $('#wl-input').value.trim();
    getUser(d.id).weeklyLimit = v === '' ? null : Math.max(0, Number(v));
    saveDB(); toast('Límite semanal guardado', 'ok'); openClient(d.id); render();
  },
  emails: () => openEmails(),
  'emails-clear': () => {
    const n = db.emails.filter(emailSent).length;
    db.emails = db.emails.filter(e => !emailSent(e)); saveDB();
    toast(`${n} correo(s) borrados de la bandeja`, 'ok'); openEmails(); render();
  },
  'email-del': d => { db.emails = db.emails.filter(e => e.id !== d.id); saveDB(); openEmails(); render(); },
  'client-filter': d => { state.clientFilter = d.f; render(); },
  'clients-tab': d => { state.clientsTab = d.t; state.search = ''; state.selectMode = false; render(); },
  'prospects-open': () => { state.view = 'a-clients'; state.clientsTab = 'prospects'; render(); window.scrollTo(0, 0); },
  'prospect-edit': d => openProspectForm(d.id),
  'prospect-del': d => confirmModal('Quitar de la lista', 'Esta persona saldrá de la lista de espera de nuevos.', `data-a="prospect-del-ok" data-id="${d.id}"`, 'Quitar'),
  'prospect-del-ok': d => { deleteProspect(d.id); closeModal(); render(); },
  'prospect-convert': d => {
    const p = db.prospects.find(x => x.id === d.id);
    openClientForm(null, { name: `${p.name} ${p.lastName}`.trim(), email: p.email, phone: p.phone }, p.id);
  },
  'pay-due': d => {
    const c = getUser(d.id);
    openModal(`${modalHead('Cuota pendiente')}
      <p><b>${esc(c.name)}</b> verá un aviso en la app: <i>«Tu cuota de ${monthName()} está pendiente de pago. ¿Sigues con nosotros?»</i> con los botones <b>Sí, sigo</b> y <b>Me doy de baja</b>.</p>
      <p class="muted small">Puede seguir reservando con normalidad. Si quieres que no pueda, usa «Bloquear».</p>
      ${notifyChecks(false, true)}
      <div class="modal-actions"><button class="btn" data-a="client-open" data-id="${c.id}">Volver</button><button class="btn primary" data-a="pay-due-ok" data-id="${c.id}">Marcar cuota pendiente</button></div>`);
  },
  'pay-due-ok': d => { markPaymentDue(d.id, readNotify()); toast('Aviso de cuota enviado', 'ok'); openClient(d.id); render(); },
  'pay-paid': d => { markPaid(d.id); toast('Cuota marcada como pagada', 'ok'); openClient(d.id); render(); },
  'bulk-paydue': () => openModal(`${modalHead('Cuota pendiente')}
      <p>Se marcará la cuota de ${monthName()} como pendiente a <b>${state.sel.size}</b> cliente(s). Verán un aviso en la app para decir si siguen o se dan de baja.</p>
      ${notifyChecks(false, true)}
      <div class="modal-actions"><button class="btn" data-a="close">Volver</button><button class="btn primary" data-a="bulk-paydue-ok">Marcar cuota pendiente</button></div>`),
  'bulk-paydue-ok': () => { const nt = readNotify(); state.sel.forEach(id => markPaymentDue(id, nt)); toast(`Aviso enviado a ${state.sel.size} cliente(s)`, 'ok'); state.sel.clear(); closeModal(); render(); },
  'bulk-paid': () => { state.sel.forEach(id => markPaid(id)); toast('Cuotas marcadas como pagadas', 'ok'); state.sel.clear(); render(); },
  'select-mode': () => { state.selectMode = !state.selectMode; state.sel = new Set(); render(); },
  'sel-toggle': d => { state.sel.has(d.id) ? state.sel.delete(d.id) : state.sel.add(d.id); liveRender(); },
  'sel-all': () => { document.querySelectorAll('[data-a="sel-toggle"]').forEach(el => state.sel.add(el.dataset.id)); render(); },
  'sel-none': () => { state.sel.clear(); render(); },
  'bulk-plan': () => {
    const pid = $('#bulk-plan').value, p = getPlan(pid);
    confirmModal('Asignar tarifa', `Se asignará <b>${esc(p.name)}</b> a <b>${state.sel.size}</b> cliente(s). No se les envía ningún aviso.`, `data-a="bulk-plan-ok" data-p="${pid}"`, 'Asignar', false);
  },
  'bulk-plan-ok': d => {
    const p = getPlan(d.p);
    state.sel.forEach(id => { const u = getUser(id); u.planId = p.id; u.credits = p.type === 'weekly' ? null : p.credits; u.planExpires = null; syncGroups(id); });
    saveDB(); toast(`Tarifa asignada a ${state.sel.size} cliente(s)`, 'ok'); state.sel.clear(); closeModal(); render();
  },
  'bulk-block': () => confirmModal('Bloquear clientes', `Se bloquearán ${state.sel.size} cliente(s) por cuota pendiente. No podrán reservar.`, 'data-a="bulk-block-ok"', 'Bloquear'),
  'bulk-block-ok': () => { state.sel.forEach(id => blockUser(id, 'Cuota pendiente de pago', { email: false })); toast('Clientes bloqueados', 'ok'); state.sel.clear(); closeModal(); render(); },
  'bulk-unblock': () => { state.sel.forEach(id => { if (getUser(id).blocked) unblockUser(id, false); }); toast('Clientes desbloqueados', 'ok'); state.sel.clear(); render(); },
  'slot-open': d => openSlot(d.id),
  'cal-week': d => {
    const n = Number(d.d);
    state.calWeek = n === 0 ? dateKey(weekStart(new Date())) : dateKey(addDays(parseKey(state.calWeek), 7 * n));
    render();
  },
  'cal-open': d => {
    if (d.id) return openSession(d.id);
    const s = materializeSession(d.slot, d.k);
    openSession(s.id); render();
  },
  'pick-color': d => {
    const inp = document.getElementById(d.target + '-custom'); if (inp) inp.value = d.c;
    document.querySelectorAll(`[data-a="pick-color"][data-target="${d.target}"]`).forEach(b => b.classList.toggle('on', b.dataset.c === d.c));
  },
  'turn-color-save': d => {
    setTurnColor(d.id, $('#turn-color-custom').value, $('#turn-color-all').checked);
    toast('Color del turno guardado', 'ok'); openSlot(d.id); render();
  },
  'auto-colors': () => confirmModal('Un color por turno', 'Cada hora de turno tendrá un color distinto (por ejemplo, todas las clases de las 19:30 en el mismo color). Luego puedes cambiar cualquiera.', 'data-a="auto-colors-ok"', 'Poner colores', false),
  'auto-colors-ok': () => { autoTurnColors(); closeModal(); toast('Colores repartidos', 'ok'); render(); },
  'season-all': () => openModal(`${modalHead('Temporada de todos los turnos')}
      <p>Se aplica a los <b>${db.schedule.length}</b> huecos del horario semanal. Luego puedes cambiar cualquier turno por separado.</p>
      <div class="fields-2">
        <div class="field"><label>Desde (mes)</label><input id="season-from" type="month" value="${dateKey(new Date()).slice(0, 7)}"></div>
        <div class="field"><label>Hasta (mes)</label><input id="season-to" type="month" value="${defaultSeasonEnd().slice(0, 7)}"></div>
      </div>
      <div class="field"><label>Días de antelación para los socios</label><input id="season-vis" type="number" min="0" max="120" placeholder="Vacío = lo general de Ajustes (${db.settings.bookWindowDays} días)"></div>
      <p class="muted small">Si una clase ya reservada queda fuera de la temporada, se cancela y se avisa a los apuntados.</p>
      <div class="modal-actions"><button class="btn" data-a="close">Cancelar</button><button class="btn primary" data-a="season-all-ok">Aplicar a todos</button></div>`),
  'season-all-ok': () => {
    const from = $('#season-from').value, to = $('#season-to').value, vd = $('#season-vis').value.trim();
    const season = { startDate: from ? from + '-01' : null, endDate: to ? monthLastDay(to) : null, visibleDays: vd === '' ? null : Math.max(0, Number(vd)) };
    if (season.startDate && season.endDate && season.endDate < season.startDate) return toast('«Hasta» no puede ser antes que «Desde»', 'err');
    db.schedule.forEach(t => setSlotSeason(t.id, season, { ensure: false }));
    ensureSessions();
    toast('Temporada aplicada a todos los turnos', 'ok'); closeModal(); render();
  },
  'slot-season': d => {
    const from = $('#season-from').value, to = $('#season-to').value, vd = $('#season-vis').value.trim();
    setSlotSeason(d.id, { startDate: from ? from + '-01' : null, endDate: to ? monthLastDay(to) : null, visibleDays: vd === '' ? null : Math.max(0, Number(vd)) });
    toast('Temporada del turno guardada', 'ok'); openSlot(d.id); render();
  },
  'slot-cap': d => {
    const t = getSlot(d.id), ct = getClassType(t.classTypeId);
    const v = Math.max(1, Number($('#slot-cap').value) || 0);
    setSlotCapacity(d.id, v === ct.capacity ? null : v);
    toast(`Turno con ${v} plazas`, 'ok'); openSlot(d.id); render();
  },
  'group-add': d => {
    const ids = [...document.querySelectorAll('input[name="gadd"]:checked')].map(x => x.value);
    if (!ids.length) return toast('Marca al menos un cliente', 'err');
    const nt = readNotify();
    const n = ids.reduce((a, id) => a + addGroupMember(d.id, id, nt), 0);
    toast(`${ids.length} cliente(s) añadidos al grupo · ${n} clase(s) reservadas`, 'ok'); openSlot(d.id); render();
  },
  'client-group-add': d => {
    const sid = $('#client-group-sel').value;
    if (!sid) return toast('Elige un grupo', 'err');
    const n = addGroupMember(sid, d.id, readNotify());
    toast(`Añadido al grupo · ${n} clase(s) reservadas`, 'ok'); openClient(d.id); render();
  },
  'group-remove': d => openGroupRemove(d.id, d.u),
  'group-remove-ok': d => {
    const n = removeGroupMember(d.id, d.u, { removeFuture: $('#g-future').checked, ...readNotify() });
    toast(`Quitado del grupo${n ? ` y de ${n} clase(s)` : ''}`, 'ok');
    state.back === 'client' ? openClient(d.u) : openSlot(d.id); render();
  },
  'week-extra': d => { addWeekExtra(d.id, parseKey(d.k), Number(d.d)); toast(Number(d.d) > 0 ? 'Clase extra añadida a esa semana' : 'Clase extra quitada', 'ok'); openClient(d.id); render(); },
  carry: d => { const n = carryOverWeek(d.id, new Date()); toast(`${n} clase(s) pasadas a la semana que viene`, 'ok'); openClient(d.id); render(); },
  'extra-session': () => openSlotForm(true),

  // Admin: clientes
  'client-open': d => openClient(d.id),
  'client-edit': d => openClientForm(d.id),
  'client-toggle': d => { const c = getUser(d.id); c.active = !c.active; saveDB(); openClient(d.id); render(); },
  credits: d => { adjustCredits(d.id, Number(d.d)); openClient(d.id); render(); },
  'assign-plan': d => { assignPlan(d.id, $('#plan-sel').value); toast('Bono asignado', 'ok'); openClient(d.id); render(); },

  // Admin: horario
  'sched-tab': d => { state.schedTab = d.t; render(); },
  'slot-add': () => openSlotForm(false),
  'slot-del': d => confirmModal('Quitar horario', 'Se eliminarán las próximas clases de este horario. Si hay clientes apuntados se les avisará y se les devolverá la clase.', `data-a="slot-del-ok" data-id="${d.id}"`, 'Quitar'),
  'slot-del-ok': d => { removeScheduleSlot(d.id); closeModal(); render(); },
  'ct-edit': d => openClassTypeForm(d.id),
  'ct-del': d => confirmModal('Eliminar tipo de clase', 'Se eliminarán también todos sus horarios y próximas clases.', `data-a="ct-del-ok" data-id="${d.id}"`, 'Eliminar'),
  'ct-del-ok': d => { deleteClassType(d.id); closeModal(); render(); },

  // Admin: tablón
  'ann-edit': d => openAnnouncementForm(d.id),
  'ann-del': d => confirmModal('Eliminar anuncio', '¿Seguro que quieres eliminar este anuncio?', `data-a="ann-del-ok" data-id="${d.id}"`, 'Eliminar'),
  'ann-del-ok': d => { deleteAnnouncement(d.id); closeModal(); render(); },

  // Admin: ajustes
  'plan-edit': d => openPlanForm(d.id),
  'plan-del': d => { if (db.users.some(u => u.planId === d.id)) return toast('Hay clientes con este bono; no se puede eliminar.', 'err'); deletePlan(d.id); closeModal(); render(); },
  reset: () => confirmModal('Restablecer datos', 'Se borrarán todos los cambios del prototipo.', 'data-a="reset-ok"', 'Restablecer'),
  'reset-ok': () => { resetDB(); closeModal(); logout(); },
};

const forms = {
  login: (f) => {
    const u = db.users.find(x => x.email.toLowerCase() === f.get('email').trim().toLowerCase());
    if (!u) return toast('No encontramos ese email. Pide al centro que te dé de alta.', 'err');
    login(u.id);
  },
  client: (f, form) => {
    const id = form.dataset.id || null;
    const data = { name: f.get('name').trim(), email: f.get('email').trim(), phone: f.get('phone').trim() };
    if (id) data.id = id;
    const r = saveClient(data);
    if (!r.ok) return toast(r.msg, 'err');
    if (!id && f.get('planId')) { const nu = db.users.find(u => u.email === data.email); assignPlan(nu.id, f.get('planId')); }
    if (!id && form.dataset.prospect) deleteProspect(form.dataset.prospect);
    toast(form.dataset.prospect ? 'Dado de alta como cliente' : 'Cliente guardado', 'ok');
    if (id) openClient(id);
    else if (form.dataset.prospect) { const nu = db.users.find(u => u.email === data.email && u.name === data.name); nu ? openClient(nu.id) : closeModal(); }
    else closeModal();
    render();
  },
  legal: f => {
    db.settings.legal = { nif: f.get('nif').trim(), email: f.get('email').trim(), phone: f.get('phone').trim(), address: f.get('address').trim() };
    saveDB(); toast('Datos legales guardados', 'ok'); render();
  },
  prospect: (f, form) => {
    saveProspect({ id: form.dataset.id || undefined, name: f.get('name').trim(), lastName: f.get('lastName').trim(), phone: f.get('phone').trim(), email: f.get('email').trim(), note: f.get('note').trim() });
    toast(form.dataset.id ? 'Guardado' : 'Añadida a la lista de espera', 'ok'); closeModal(); render();
  },
  ct: (f, form) => {
    saveClassType({ id: form.dataset.id || undefined, name: f.get('name').trim(), coach: f.get('coach').trim(), color: f.get('color'),
      capacity: Number(f.get('capacity')), duration: Number(f.get('duration')), description: f.get('description').trim(), hidden: f.get('hidden') === 'on' });
    closeModal(); render();
  },
  slot: (f) => {
    const wds = f.getAll('wd').map(Number);
    if (!wds.length) return toast('Marca al menos un día', 'err');
    const ct = getClassType(f.get('classTypeId'));
    const cap = Number(f.get('capacity')) || null;
    // si coincide con el del tipo de clase, el turno sigue al tipo de clase
    const from = f.get('from'), to = f.get('to'), vd = String(f.get('visibleDays') || '').trim();
    const season = { startDate: from ? from + '-01' : null, endDate: to ? monthLastDay(to) : null, visibleDays: vd === '' ? null : Math.max(0, Number(vd)), color: f.get('color') || null };
    if (season.startDate && season.endDate && season.endDate < season.startDate) return toast('«Hasta» no puede ser antes que «Desde»', 'err');
    wds.forEach(w => addScheduleSlot(w, f.get('time'), f.get('classTypeId'), cap && cap !== ct.capacity ? cap : null, season));
    toast('Horario añadido', 'ok'); closeModal(); render();
  },
  multiadd: (f, form) => {
    const ids = f.getAll('sid');
    if (!ids.length) return toast('Marca al menos una clase', 'err');
    const m = f.get('mode');
    const r = adminAddToSessions(form.dataset.id, ids, { mode: m === 'waitlist' ? 'waitlist' : 'auto', whenFull: m === 'force' ? 'force' : 'waitlist', ...readNotify() });
    toast(`Apuntado a ${r.booked.length} clase(s)${r.waitlist.length ? ` y ${r.waitlist.length} en lista de espera` : ''}`, 'ok');
    openClient(form.dataset.id); render();
  },
  block: (f, form) => {
    const n = blockUser(form.dataset.id, f.get('reason').trim(), { cancelFuture: f.get('cancelFuture') === 'on', email: f.get('email') === 'on' });
    toast(`Cliente bloqueado${n ? ` y quitado de ${n} clase(s)` : ''}`, 'ok'); openClient(form.dataset.id); render();
  },
  oneoff: (f) => {
    addOneOffSession(f.get('date'), f.get('time'), f.get('classTypeId'), f.get('hidden') === 'on');
    const cap = Number(f.get('capacity')); if (cap) { db.sessions[db.sessions.length - 1].capacity = cap; saveDB(); }
    state.date = f.get('date'); toast('Clase extra creada', 'ok'); closeModal(); render(); },
  ann: (f, form) => {
    saveAnnouncement({ id: form.dataset.id || undefined, title: f.get('title').trim(), body: f.get('body').trim(), pinned: f.get('pinned') === 'on' });
    toast(form.dataset.id ? 'Anuncio guardado' : 'Anuncio publicado y clientes avisados', 'ok'); closeModal(); render();
  },
  plan: (f, form) => {
    const weekly = f.get('type') === 'weekly';
    savePlan({ id: form.dataset.id || undefined, name: f.get('name').trim(), type: weekly ? 'weekly' : 'bono',
      perWeek: weekly ? Number(f.get('perWeek')) : null,
      credits: weekly || f.get('unlimited') === 'on' ? null : Number(f.get('credits')),
      durationDays: Number(f.get('durationDays')), price: Number(f.get('price')) });
    closeModal(); render();
  },
  settings: (f) => {
    Object.assign(db.settings, {
      bookWindowDays: Number(f.get('bookWindowDays')), cancelHours: Number(f.get('cancelHours')),
      reminderHours: Number(f.get('reminderHours')), waitlistMax: Number(f.get('waitlistMax')), waitlistEnabled: f.get('waitlistEnabled') === 'on',
      publishMode: f.get('publishMode'), publishWeekday: Number(f.get('publishWeekday')), publishTime: f.get('publishTime') || '20:00',
      weeklyLimit: Number(f.get('weeklyLimit')), emailOnPromote: f.get('emailOnPromote') === 'on', onePerDay: f.get('onePerDay') === 'on',
      hiddenWeekdays: [0, 1, 2, 3, 4, 5, 6].filter(w => !f.getAll('showDay').map(Number).includes(w)),
      autoMonthlyDue: f.get('autoMonthlyDue') === 'on', autoMonthlyDay: Math.min(28, Math.max(1, Number(f.get('autoMonthlyDay')) || 1)), autoMonthlyEmail: f.get('autoMonthlyEmail') === 'on',
    });
    saveDB();
    ensureSessions(); toast('Ajustes guardados', 'ok'); render();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  // evita que un clic dentro del modal dispare el cierre por fondo
  if (el.dataset.a === 'bg' && e.target !== el) return;
  e.preventDefault();
  actions[el.dataset.a]?.(el.dataset, el, e);
});
document.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  forms[form.dataset.form]?.(new FormData(form), form);
});
// Filtro de listas dentro de ventanas (sin redibujar, para no perder lo marcado)
const norm2 = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function applyListFilter(sel) {
  const q = norm2(document.querySelector(`[data-filter="${sel}"]`)?.value || '');
  const onlyNo = document.querySelector(`[data-filter-nogroup="${sel}"]`)?.checked;
  document.querySelectorAll(sel).forEach(el => {
    const show = (!q || el.dataset.search.includes(q)) && (!onlyNo || el.dataset.groups === '0');
    el.style.display = show ? '' : 'none';
  });
}
document.addEventListener('input', e => { if (e.target.dataset.filter) applyListFilter(e.target.dataset.filter); });
document.addEventListener('change', e => { if (e.target.dataset.filterNogroup) applyListFilter(e.target.dataset.filterNogroup); });

document.addEventListener('input', e => {
  if (e.target.dataset.input === 'search') {
    state.search = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const inp = document.querySelector('[data-input="search"]');
    inp.focus(); inp.setSelectionRange(pos, pos);
  }
});
document.addEventListener('change', e => {
  if (e.target.dataset.change === 'plan-type') {
    const w = e.target.value === 'weekly';
    ['#pt-bono', '#pt-credits'].forEach(s => $(s).classList.toggle('hidden', w));
    $('#pt-weekly').classList.toggle('hidden', !w);
  }
  if (e.target.dataset.change === 'publish-mode') {
    $('#pub-rolling').classList.toggle('hidden', e.target.value !== 'rolling');
    $('#pub-weekly').classList.toggle('hidden', e.target.value !== 'weekly');
  }
  if (e.target.dataset.change === 'capacity') {
    const v = Math.max(1, Number(e.target.value) || 1);
    updateSessionCapacity(e.target.dataset.id, v);
    openSession(e.target.dataset.id); render();
  }
});

// Se arranca cuando han cargado todos los scripts (marca, importación…)
// (remote.js sustituye init() cuando hay servidor configurado)
document.addEventListener('DOMContentLoaded', () => window.init());
