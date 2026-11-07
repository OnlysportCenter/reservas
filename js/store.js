// ============================================================
//  CAPA DE DATOS (prototipo: guarda todo en localStorage)
//  Más adelante se sustituirá por un servidor/base de datos real
//  manteniendo estas mismas funciones.
// ============================================================

const DB_KEY = 'reservas_centro_db_v1';
let db = null;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---------- Fechas ----------
const pad = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const sessionStart = s => { const [h, m] = s.time.split(':').map(Number); const d = parseKey(s.date); d.setHours(h, m, 0, 0); return d; };
const sessionEnd = s => new Date(sessionStart(s).getTime() + s.duration * 60000);
// Semana de lunes a domingo
const weekStart = d => { const x = startOfDay(d); const off = (x.getDay() + 6) % 7; return addDays(x, -off); };

// ---------- Carga / guardado ----------
function loadDB() {
  try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { db = null; }
  if (!db || !db.version) { db = seedDB(); saveDB(); }
  migrate();
  ensureSessions();
  runMonthlyDue();
  return db;
}
// Modo prueba: el día de cobro marca a todos «cuota pendiente» (con servidor lo hace mark_month_due cada mañana).
// La primera vez solo apunta el mes en curso: empieza a funcionar el mes siguiente.
function runMonthlyDue() {
  const s = db.settings;
  if (s.autoMonthlyDue === false) return;
  if (new Date().getDate() < (Number(s.autoMonthlyDay) || 1)) return;
  const mk = monthKey();
  if (!db.autoDueMonth) { db.autoDueMonth = mk; saveDB(); return; }
  if (db.autoDueMonth === mk) return;
  db.autoDueMonth = mk;
  clients().filter(c => c.active && !c.isPlaceholder && c.planId && (c.paymentMonth || '') !== mk)
    .forEach(c => markPaymentDue(c.id, { email: !!s.autoMonthlyEmail, app: true }));
  saveDB();
}
function saveDB() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { console.warn('No se pudo guardar', e); }
}
function resetDB() { localStorage.removeItem(DB_KEY); db = null; return loadDB(); }

// Añade campos nuevos a datos guardados con versiones anteriores
function migrate() {
  const s = db.settings;
  const def = { publishMode: 'rolling', publishWeekday: 0, publishTime: '20:00', weeklyLimit: 0, emailOnPromote: true, onePerDay: true };
  let changed = false;
  for (const k in def) if (s[k] === undefined) { s[k] = def[k]; changed = true; }
  if (!db.emails) { db.emails = []; changed = true; }
  db.users.forEach(u => { if (u.blocked === undefined) { u.blocked = false; u.blockedReason = ''; u.weeklyLimit = null; changed = true; } });
  db.users.forEach(u => { if (!u.weekExtras) { u.weekExtras = {}; changed = true; } });
  db.users.forEach(u => { if (u.paymentDue === undefined) { u.paymentDue = false; u.paymentAnswer = null; changed = true; } });
  if (!db.prospects) { db.prospects = []; changed = true; }
  db.users.forEach(u => { if (u.planExpires) { u.planExpires = null; changed = true; } });   // ya no hay caducidad
  db.plans.forEach(p => { if (!p.type) { p.type = 'bono'; p.perWeek = null; changed = true; } });
  if (!db.plans.some(p => p.type === 'weekly')) {
    db.plans.unshift({ id: 'w2', name: '2 días por semana', type: 'weekly', perWeek: 2, credits: null, durationDays: 30, price: 50 },
      { id: 'w3', name: '3 días por semana', type: 'weekly', perWeek: 3, credits: null, durationDays: 30, price: 65 });
    changed = true;
  }
  db.classTypes.forEach(c => { if (c.hidden === undefined) { c.hidden = false; changed = true; } });
  db.schedule.forEach(t => { if (!t.members) { t.members = []; changed = true; } });
  if (!s.brand) { s.brand = { logo: null, primary: '#0E0E0D', theme: 'light', subtitle: 'Center' }; changed = true; }
  if (s.centerName === 'Mi Box CrossFit') { s.centerName = 'Onlysport Center'; changed = true; }
  // aforo real de Onlysport: 20 plazas por turno
  const fun = db.classTypes.find(c => c.id === 'ct_fun');
  if (fun && fun.capacity === 10) {
    fun.capacity = 20;
    db.sessions.filter(x => x.classTypeId === 'ct_fun' && x.capacity === 10).forEach(x => x.capacity = 20);
    changed = true;
  }
  db.sessions.forEach(x => { if (x.hidden === undefined) { x.hidden = false; changed = true; } });
  if (changed) saveDB();
}

// ---------- Datos de ejemplo ----------
function seedDB() {
  // type 'weekly': X clases cada semana (lunes a domingo), no se acumulan
  // type 'bono':   X clases en total hasta la caducidad (opcional, p. ej. clase suelta)
  const plans = [
    { id: 'w2', name: '2 días por semana', type: 'weekly', perWeek: 2, credits: null, durationDays: 30, price: 50 },
    { id: 'w3', name: '3 días por semana', type: 'weekly', perWeek: 3, credits: null, durationDays: 30, price: 65 },
    { id: 'p1', name: 'Clase suelta', type: 'bono', perWeek: null, credits: 1, durationDays: 15, price: 12 },
  ];
  // Onlysport Center: entrenamiento funcional en grupos reducidos, sesiones de 1 hora
  const classTypes = [
    { id: 'ct_fun', name: 'Entrenamiento funcional', color: '#2F5D8A', coach: 'Entrenador', capacity: 20, duration: 60, description: 'Fuerza, resistencia y movilidad en grupo reducido, guiado por entrenador.', hidden: false },
  ];
  const schedule = [];
  // members = clientes del grupo fijo: se les reserva automáticamente cada semana
  const slot = (weekdays, time, ct = 'ct_fun') => weekdays.forEach(w => schedule.push({ id: uid(), weekday: w, time, classTypeId: ct, members: [] }));
  // Turnos de la web de Onlysport (L=1, M=2, X=3, J=4, V=5)
  slot([1, 3, 5], '09:15');
  slot([2, 4], '09:15');
  slot([1, 3, 5], '10:30');
  slot([1, 3, 5], '17:30');
  slot([1, 3, 5], '18:30');
  slot([2, 4], '18:30');
  slot([1, 2, 4], '19:30');
  slot([1, 2, 4], '20:30');
  slot([1, 2, 4], '21:30');
  const times = [...new Set(schedule.map(t => t.time))].sort();
  schedule.forEach(t => t.color = TURN_COLORS[times.indexOf(t.time) % TURN_COLORS.length]);

  const today = startOfDay(new Date());
  const exp = n => dateKey(addDays(today, n));
  const names = ['Laura Gómez', 'Carlos Ruiz', 'Ana Martín', 'Javier López', 'Lucía Sánchez', 'Pablo Díaz', 'Elena Torres',
    'Sergio Navarro', 'Marina Gil', 'David Romero', 'Sara Molina', 'Raúl Castro', 'Irene Ortega', 'Hugo Delgado'];
  const users = [
    { id: 'admin', name: 'Administrador', email: 'admin@centro.com', phone: '', role: 'admin', active: true, blocked: false, blockedReason: '', weeklyLimit: null, planId: null, credits: 0, planExpires: null, createdAt: exp(-200) },
  ];
  names.forEach((n, i) => {
    const plan = i === 13 ? plans[2] : i >= 11 ? plans[0] : plans[1];
    const email = n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(' ')[0] + '@demo.com';
    users.push({
      id: 'u' + i, name: n, email, phone: '6' + String(10000000 + i * 7654321).slice(0, 8), role: 'client', active: true,
      blocked: i === 7, blockedReason: i === 7 ? 'Cuota de este mes pendiente de pago' : '', weeklyLimit: null, weekExtras: {},
      planId: plan.id, credits: plan.credits,
      paymentDue: i === 4 || i === 9, paymentMonth: i === 4 || i === 9 ? monthKey() : null, paymentAnswer: i === 9 ? 'leave' : null,
      planExpires: null, createdAt: exp(-30 - i * 5),
    });
  });

  db = {
    version: 2,
    settings: {
      centerName: 'Onlysport Center',
      brand: { logo: null, primary: '#0E0E0D', theme: 'light', subtitle: 'Center' },
      cancelHours: 2,          // horas mínimas para cancelar con devolución
      publishMode: 'rolling',  // 'rolling' = X días por delante | 'weekly' = se publica la semana siguiente un día y hora fijos
      bookWindowDays: 14,      // modo rolling: días visibles/reservables por delante (como en Bookyway: 2 semanas)
      publishWeekday: 0,       // modo weekly: día en que se publica la semana siguiente (0 = domingo)
      publishTime: '20:00',    // modo weekly: hora de publicación
      weeklyLimit: 0,          // solo bonos por nº de clases: máximo por semana (0 = sin límite)
      onePerDay: true,         // como máximo una clase al día por cliente
      reminderHours: 3,
      waitlistEnabled: true,
      waitlistMax: 5,
      emailOnPromote: true,    // correo al entrar desde la lista de espera
    },
    plans, classTypes, schedule, users,
    sessions: [], bookings: [], emails: [],
    prospects: [
      { id: uid(), name: 'Rocío', lastName: 'Fernández Luque', phone: '611 223 344', email: 'rocio@demo.com', note: 'Prefiere tardes', createdAt: addDays(new Date(), -6).toISOString() },
      { id: uid(), name: 'Antonio', lastName: 'Jiménez', phone: '622 334 455', email: '', note: '', createdAt: addDays(new Date(), -2).toISOString() },
    ],
    announcements: [
      { id: uid(), title: '¡Bienvenid@s a la nueva app de Onlysport!', body: 'Tu turno ya está reservado cada semana. Si un día no puedes venir, quítate de la clase para dejar el hueco libre, y si quieres, cámbiate a otro turno con plazas o apúntate a su lista de espera.', date: new Date().toISOString(), pinned: true },
      { id: uid(), title: 'Ejemplo · Horario de Navidad', body: 'Así se verá un aviso del centro. Los escribes desde la pestaña Tablón de tu panel y a todos les llega una notificación.', date: addDays(new Date(), -1).toISOString(), pinned: false },
    ],
    notifications: [],
  };
  // Grupos fijos de ejemplo
  const join = (uidx, days, time) => days.forEach(w => schedule.find(x => x.weekday === w && x.time === time).members.push('u' + uidx));
  [0, 1, 2, 3, 4, 5, 6, 8, 9, 10].forEach(i => join(i, [1, 2, 4], '19:30'));  // turno L-M-J 19:30 (10 de 20)
  join(7, [1, 3, 5], '18:30');                                               // cliente bloqueado
  [11, 12].forEach(i => join(i, [2, 4], '18:30'));                           // 2 días: M-J 18:30
  ensureSessions();
  return db;
}

// ---------- Generación de sesiones a partir del horario semanal ----------
// ¿Está el turno activo esa fecha? (temporada desde / hasta)
const slotInSeason = (t, key) => (!t.startDate || key >= t.startDate) && (!t.endDate || key <= t.endDate);
function ensureSessions() {
  const today = startOfDay(new Date());
  const horizon = Math.max(db.settings.bookWindowDays, 14, ...db.schedule.map(t => Number(t.visibleDays) || 0)) + 7;
  const existing = new Set(db.sessions.filter(s => s.templateId).map(s => s.templateId + '|' + s.date));
  let added = false;
  for (let d = 0; d <= horizon; d++) {
    const date = addDays(today, d);
    const key = dateKey(date);
    const wd = date.getDay();
    db.schedule.filter(t => t.weekday === wd && slotInSeason(t, key)).forEach(t => {
      if (existing.has(t.id + '|' + key)) return;
      const ct = getClassType(t.classTypeId);
      if (!ct) return;
      const s = { id: uid(), templateId: t.id, classTypeId: ct.id, date: key, time: t.time, duration: ct.duration, capacity: slotCapacity(t), coach: ct.coach, cancelled: false, hidden: false };
      db.sessions.push(s);
      (t.members || []).forEach(m => groupBook(m, s));
      added = true;
    });
  }
  if (added) saveDB();
}

// ---------- Grupos fijos ----------
// Reserva automática de un miembro del grupo en una sesión (si no tiene ya ningún registro en ella:
// si se quitó de esa clase concreta, no se le vuelve a apuntar)
function groupBook(userId, s) {
  const u = getUser(userId);
  if (!u || !u.active || !planStatus(u).ok) return false;
  if (sessionStart(s) <= new Date() || s.cancelled) return false;
  // las reservas quitadas por un bloqueo o al salir del grupo no impiden volver a reservar
  // (pero si el cliente se quitó él mismo de ese día, se respeta)
  if (db.bookings.some(b => b.userId === userId && b.sessionId === s.id && !b.blockRemoved && !b.groupRemoved)) return false;
  spendCredit(u);
  db.bookings.push({ id: uid(), sessionId: s.id, userId, status: 'booked', source: 'group', createdAt: new Date(0).toISOString(), reminded: false });
  return true;
}
const getSlot = id => db.schedule.find(t => t.id === id);
// Color del turno: el suyo propio o, si no tiene, el del tipo de clase
const TURN_COLORS = ['#2F5D8A', '#C0392B', '#6B7A2E', '#E07B39', '#6D4C9F', '#2A9D8F', '#9A4B2E', '#D4A017', '#C2185B', '#455A64', '#1F8F4E', '#5D4037'];
const slotColor = t => (t && t.color) || getClassType(t?.classTypeId)?.color || '#2F5D8A';
const sessionColor = s => { const t = s.templateId && db.schedule.find(x => x.id === s.templateId); return t ? slotColor(t) : (getClassType(s.classTypeId)?.color || '#2F5D8A'); };
// Pone el color a todos los días del mismo turno (misma hora y tipo de clase)
function setTurnColor(slotId, color, allDays = true) {
  const t = getSlot(slotId);
  (allDays ? db.schedule.filter(x => x.time === t.time && x.classTypeId === t.classTypeId) : [t]).forEach(x => x.color = color || null);
  saveDB();
}
// Un color distinto para cada hora de turno
function autoTurnColors() {
  const times = [...new Set(db.schedule.map(t => t.time))].sort();
  db.schedule.forEach(t => t.color = TURN_COLORS[times.indexOf(t.time) % TURN_COLORS.length]);
  saveDB();
}
// Plazas del turno: las suyas propias o, si no tiene, las del tipo de clase
const slotCapacity = t => (t.capacity ?? null) !== null && t.capacity !== '' ? Number(t.capacity) : (getClassType(t.classTypeId)?.capacity ?? 20);
function setSlotCapacity(slotId, cap) {
  const t = getSlot(slotId);
  t.capacity = cap;
  const n = slotCapacity(t);
  db.sessions.filter(s => s.templateId === slotId && !s.cancelled && sessionStart(s) > new Date()).forEach(s => {
    s.capacity = n;
    promoteWaitlist(s.id);
  });
  saveDB();
}
const slotLabel = t => `${DOW_LONG[t.weekday]} ${t.time} · ${getClassType(t.classTypeId)?.name}`;
const groupsOf = userId => db.schedule.filter(t => (t.members || []).includes(userId)).sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.time.localeCompare(b.time));
function addGroupMember(slotId, userId, { email = true, app = true } = {}) {
  if (db.settings.silentAdminAdd) email = app = false;   // «No avisar cuando apunto yo»
  const t = getSlot(slotId), u = getUser(userId);
  if (!t.members.includes(userId)) t.members.push(userId);
  let n = 0;
  db.sessions.filter(s => s.templateId === slotId).forEach(s => { if (groupBook(userId, s)) n++; });
  const txt = `El centro te ha apuntado al grupo fijo de ${slotLabel(t)}. Tendrás plaza reservada cada semana; si algún día no puedes venir, quítate desde la app.`;
  if (app) notify(userId, '📅 ' + txt, 'success');
  if (email) sendEmail(userId, 'Te hemos apuntado a un grupo', `Hola ${u.name.split(' ')[0]},\n\n${txt}\n\n${db.settings.centerName}`);
  saveDB();
  return n;
}
// Vuelve a reservar los grupos de un cliente (p. ej. al desbloquearlo o renovar su cuota)
function syncGroups(userId) {
  let n = 0;
  groupsOf(userId).forEach(t => db.sessions.filter(s => s.templateId === t.id).forEach(s => { if (groupBook(userId, s)) n++; }));
  return n;
}
function removeGroupMember(slotId, userId, { removeFuture = true, email = false, app = true } = {}) {
  const t = getSlot(slotId), u = getUser(userId);
  t.members = t.members.filter(m => m !== userId);
  let n = 0;
  if (removeFuture) {
    db.bookings.filter(b => b.userId === userId && b.status === 'booked' && b.source === 'group').forEach(b => {
      const s = getSession(b.sessionId);
      if (s && s.templateId === slotId && sessionStart(s) > new Date()) { refundCredit(u); b.status = 'cancelled'; b.groupRemoved = true; promoteWaitlist(s.id); n++; }
    });
  }
  const txt = `Ya no formas parte del grupo fijo de ${slotLabel(t)}.`;
  if (app) notify(userId, txt, 'info');
  if (email) sendEmail(userId, 'Cambio en tu grupo', `Hola ${u.name.split(' ')[0]},\n\n${txt}\n\n${db.settings.centerName}`);
  saveDB();
  return n;
}

// ---------- Publicación (hasta cuándo ven los clientes las clases) ----------
function visibleUntil(now = new Date()) {
  const s = db.settings;
  if (s.publishMode === 'weekly') {
    const ws = weekStart(now);
    const [h, m] = s.publishTime.split(':').map(Number);
    const pub = addDays(ws, (s.publishWeekday + 6) % 7); pub.setHours(h, m, 0, 0);
    return addDays(ws, now >= pub ? 14 : 7);   // exclusivo
  }
  return addDays(startOfDay(now), s.bookWindowDays + 1);
}
function publishDescription() {
  const s = db.settings;
  if (s.publishMode === 'weekly') return `Las clases de la semana siguiente se publican cada ${DOW_LONG[s.publishWeekday].toLowerCase()} a las ${s.publishTime}.`;
  return `Puedes ver y reservar clases con hasta ${s.bookWindowDays} días de antelación.`;
}
function isHidden(s) { return s.hidden || getClassType(s.classTypeId)?.hidden; }
// Hasta cuándo ven los socios esta clase: antelación propia del turno o la general de Ajustes
function sessionVisibleUntil(s) {
  const t = s.templateId && db.schedule.find(x => x.id === s.templateId);
  const vd = t && t.visibleDays !== null && t.visibleDays !== undefined && t.visibleDays !== '' ? Number(t.visibleDays) : null;
  return vd !== null ? addDays(startOfDay(new Date()), vd + 1) : visibleUntil();
}
function isVisibleToClients(s) { return !isHidden(s) && sessionStart(s) < sessionVisibleUntil(s); }

// ---------- Consultas ----------
const getUser = id => db.users.find(u => u.id === id);
const getPlan = id => db.plans.find(p => p.id === id);
const getClassType = id => db.classTypes.find(c => c.id === id);
const getSession = id => db.sessions.find(s => s.id === id);
const getBooking = id => db.bookings.find(b => b.id === id);
const clients = () => db.users.filter(u => u.role === 'client');
const sessionsOn = key => db.sessions.filter(s => s.date === key).sort((a, b) => a.time.localeCompare(b.time));
const bookedIn = sid => db.bookings.filter(b => b.sessionId === sid && ['booked', 'attended', 'noshow'].includes(b.status));
const waitlistOf = sid => db.bookings.filter(b => b.sessionId === sid && b.status === 'waitlist').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
// (con servidor, el cliente recibe su puesto ya calculado en b.waitPosition)
const waitlistPosition = b => b.waitPosition ?? (waitlistOf(b.sessionId).findIndex(x => x.id === b.id) + 1);
const userBookingIn = (uid_, sid) => db.bookings.find(b => b.sessionId === sid && b.userId === uid_ && ['booked', 'waitlist', 'attended', 'noshow'].includes(b.status));
// (con servidor, el cliente no ve las reservas de otros: usa el recuento s.stats)
const freeSpots = s => Math.max(0, s.capacity - (s.stats ? s.stats.booked : bookedIn(s.id).length));

// Estado general de la tarifa (sin mirar una semana concreta)
function planStatus(u) {
  if (u.isPlaceholder) return { ok: true };   // comodín del centro: siempre puede ocupar plaza
  if (u.blocked) return { ok: false, blocked: true, msg: `Tu cuenta está bloqueada${u.blockedReason ? ': ' + u.blockedReason : ''}. Habla con el centro.` };
  if (!u.planId || !getPlan(u.planId)) return { ok: false, msg: 'No tienes ninguna tarifa activa. Habla con el centro.' };
  if (!isWeekly(u) && u.credits !== null && u.credits <= 0) return { ok: false, msg: 'No te quedan clases en tu bono.' };
  return { ok: true };
}

// ---------- Tarifas semanales (2 / 3 días por semana) ----------
// Cada semana (lunes a domingo) el cliente tiene X clases. Lo que no use se pierde,
// salvo que el administrador le añada clases extra a una semana concreta.
const isWeekly = u => getPlan(u.planId)?.type === 'weekly';
const weekKeyOf = d => dateKey(weekStart(d));
const weekExtra = (u, d) => (u.weekExtras || {})[weekKeyOf(d)] || 0;
// Clases que cuentan en una semana: reservadas, asistidas, faltas y cancelaciones tardías.
// Las listas de espera NO cuentan: solo cuenta la clase en la que finalmente entra.
function weekCount(userId, refDate) {
  const ws = weekStart(refDate), we = addDays(ws, 7);
  return db.bookings.filter(b => b.userId === userId && ['booked', 'attended', 'noshow', 'late'].includes(b.status)).filter(b => {
    const s = getSession(b.sessionId); if (!s || s.cancelled) return false;
    const d = parseKey(s.date); return d >= ws && d < we;
  }).length;
}
// Límite semanal general (solo para bonos por número de clases)
const weeklyLimitFor = u => isWeekly(u) ? 0 : ((u.weeklyLimit ?? db.settings.weeklyLimit) || 0);
// Clases disponibles en la semana de la fecha d (tarifas semanales)
function weekAllowance(u, d) { return (getPlan(u.planId)?.perWeek || 0) + weekExtra(u, d); }
function weekLeft(u, d) { return Math.max(0, weekAllowance(u, d) - weekCount(u.id, d)); }

// ¿Puede este cliente gastar una clase en esta sesión concreta?
function canUseFor(u, s) {
  if (u.isPlaceholder) return { ok: true };   // comodín: sin límites semanales ni de un día
  const ps = planStatus(u);
  if (!ps.ok) return ps;
  const d = parseKey(s.date);
  if (isWeekly(u)) {
    if (weekLeft(u, d) <= 0) return { ok: false, msg: `Ya tienes tus ${weekAllowance(u, d)} clases de la semana del ${fmtDateShort(weekKeyOf(d))}. Si quieres cambiarte, quítate primero de otra clase de esa semana.` };
  } else {
    const lim = weeklyLimitFor(u);
    if (lim && weekCount(u.id, d) >= lim) return { ok: false, msg: `Has llegado a tu límite de ${lim} ${lim === 1 ? 'clase' : 'clases'} esa semana.` };
  }
  if (db.settings.onePerDay && db.bookings.some(b => b.userId === u.id && ['booked', 'attended', 'noshow'].includes(b.status) && getSession(b.sessionId)?.date === s.date && b.sessionId !== s.id && !getSession(b.sessionId).cancelled))
    return { ok: false, msg: 'Ya tienes una clase ese día (máximo una clase al día).' };
  return { ok: true };
}

// Tras entrar en una clase: quita al cliente de las listas de espera en las que ya no podría entrar
// (porque ha gastado sus clases de esa semana, ya tiene clase ese día, o se le acabó el bono).
function cleanupWaitlists(u, enteredSession) {
  const now = new Date(), removed = [];
  db.bookings.filter(b => b.userId === u.id && b.status === 'waitlist').forEach(b => {
    const s = getSession(b.sessionId);
    if (!s || sessionStart(s) <= now) return;
    if (!canUseFor(u, s).ok) { b.status = 'cancelled'; removed.push(s); }
  });
  if (removed.length) {
    notify(u.id, `Como ya has entrado en ${classLabel(enteredSession)}, te hemos quitado de la lista de espera de: ${removed.map(classLabel).join('; ')}.`, 'info');
  }
  return removed;
}

// Añadir/quitar clases extra a una semana concreta
function addWeekExtra(userId, d, delta) {
  const u = getUser(userId), k = weekKeyOf(d);
  u.weekExtras = u.weekExtras || {};
  u.weekExtras[k] = (u.weekExtras[k] || 0) + delta;
  if (!u.weekExtras[k]) delete u.weekExtras[k];
  if (delta > 0) promoteMemberWaitlists(userId);
  saveDB();
}
// Pasar las clases no usadas de una semana a la siguiente
function carryOverWeek(userId, d, { email = false, app = true } = {}) {
  const u = getUser(userId);
  const n = weekLeft(u, d);
  if (!n) return 0;
  const next = addDays(weekStart(d), 7);
  addWeekExtra(userId, next, n);
  // se restan de la semana de origen para que no se puedan usar ni pasar dos veces
  const k = weekKeyOf(d);
  u.weekExtras[k] = (u.weekExtras[k] || 0) - n;
  if (!u.weekExtras[k]) delete u.weekExtras[k];
  const txt = `Se te ${n === 1 ? 'ha pasado 1 clase' : `han pasado ${n} clases`} sin usar a la semana del ${fmtDateShort(dateKey(next))}.`;
  if (app) notify(userId, '➕ ' + txt, 'success');
  if (email) sendEmail(userId, 'Clases pasadas a la semana siguiente', `Hola ${u.name.split(' ')[0]},\n\n${txt}\n\n${db.settings.centerName}`);
  saveDB();
  return n;
}

// ---------- Notificaciones y correo ----------
function notify(userId, text, type = 'info') {
  if (getUser(userId)?.isPlaceholder) return;   // los comodines no tienen app
  db.notifications.push({ id: uid(), userId, text, type, date: new Date().toISOString(), read: false });
}
// El cliente borra sus notificaciones (con servidor lo sustituye remote.js)
function deleteReadNotifications(userId) { db.notifications = db.notifications.filter(n => !(n.userId === userId && n.read)); saveDB(); }
function deleteNotification(id) { db.notifications = db.notifications.filter(n => n.id !== id); saveDB(); }
function notificationsFor(userId) {
  return db.notifications.filter(n => n.userId === userId).sort((a, b) => b.date.localeCompare(a.date));
}
// Prototipo: el correo se guarda en una bandeja simulada. Con servidor real se enviará de verdad.
function sendEmail(userId, subject, body) {
  const u = getUser(userId);
  if (!u || u.isPlaceholder || !u.email) return;   // sin correo (comodines)
  db.emails.push({ id: uid(), userId, to: u.email, subject, body, date: new Date().toISOString() });
}
function generateReminders(userId) {
  const now = new Date();
  const limit = now.getTime() + db.settings.reminderHours * 3600000;
  let changed = false;
  db.bookings.filter(b => b.userId === userId && b.status === 'booked' && !b.reminded).forEach(b => {
    const s = getSession(b.sessionId);
    if (!s || s.cancelled) return;
    const st = sessionStart(s).getTime();
    if (st > now.getTime() && st <= limit) {
      b.reminded = true; changed = true;
      notify(userId, `⏰ Recordatorio: tienes ${getClassType(s.classTypeId).name} hoy a las ${s.time}.`, 'reminder');
    }
  });
  if (changed) saveDB();
}
const classLabel = s => `${getClassType(s.classTypeId).name} · ${fmtDateShort(s.date)} a las ${s.time}`;

// ---------- Créditos ----------
// (en tarifas semanales el consumo se calcula a partir de las reservas de la semana)
const spendCredit = u => { if (!isWeekly(u) && u.credits !== null) u.credits = Math.max(0, u.credits - 1); };
const refundCredit = u => { if (!isWeekly(u) && u.credits !== null) u.credits += 1; };

// ---------- Reservar (cliente) ----------
function book(userId, sessionId) {
  const u = getUser(userId), s = getSession(sessionId);
  if (!u || !s) return { ok: false, msg: 'Datos no válidos' };
  const ps = planStatus(u);
  if (ps.blocked) return ps;
  if (userBookingIn(userId, sessionId)) return { ok: false, msg: 'Ya estás apuntad@ a esta clase.' };
  if (s.cancelled) return { ok: false, msg: 'Esta clase ha sido cancelada.' };
  if (!isVisibleToClients(s)) return { ok: false, msg: 'Esta clase todavía no está disponible.' };
  if (sessionStart(s) <= new Date()) return { ok: false, msg: 'Esta clase ya ha empezado.' };
  const cu = canUseFor(u, s);
  // Lista de espera: clase completa, o el cliente ya tiene sus clases (semana completa / clase ese día).
  // En el segundo caso no gasta clase ni entra hasta que se quite de una de las suyas.
  if (freeSpots(s) <= 0 || !cu.ok) {
    if (!db.settings.waitlistEnabled) return cu.ok ? { ok: false, msg: 'La clase está completa.' } : cu;
    if (waitlistOf(s.id).length >= db.settings.waitlistMax) return { ok: false, msg: 'La lista de espera está completa.' };
    const b = { id: uid(), sessionId, userId, status: 'waitlist', createdAt: new Date().toISOString(), reminded: false };
    db.bookings.push(b);
    saveDB();
    return { ok: true, waitlist: true, msg: !cu.ok
      ? `Te hemos apuntado a la lista de espera (vas el nº ${waitlistPosition(b)}). Como ya tienes tus clases, entrarás en cuanto te quites de otra ${/ese día/.test(cu.msg) ? 'de ese día' : 'de esa semana'}.`
      : `Clase completa: estás el nº ${waitlistPosition(b)} en la lista de espera. Si se libera una plaza entrarás automáticamente y te avisaremos.` };
  }
  spendCredit(u);
  db.bookings.push({ id: uid(), sessionId, userId, status: 'booked', createdAt: new Date().toISOString(), reminded: false });
  const removed = cleanupWaitlists(u, s);
  saveDB();
  return { ok: true, msg: `¡Reserva confirmada! ${classLabel(s)}${removed.length ? ` · Te hemos quitado de ${removed.length} lista(s) de espera.` : ''}` };
}

// ---------- Apuntar desde administración (una o varias clases) ----------
// whenFull: 'force' (apuntar aunque supere el aforo) | 'waitlist' (poner en lista de espera)
// mode: 'auto' (plaza si hay, si no según whenFull) | 'waitlist' (siempre a lista de espera)
function adminAddToSessions(userId, sessionIds, { whenFull = 'waitlist', mode = 'auto', email = true, app = true } = {}) {
  if (db.settings.silentAdminAdd) email = app = false;   // «No avisar cuando apunto yo»
  const u = getUser(userId);
  const res = { booked: [], waitlist: [], skipped: [] };
  sessionIds.map(getSession).filter(Boolean).sort((a, b) => sessionStart(a) - sessionStart(b)).forEach(s => {
    if (userBookingIn(userId, s.id)) return res.skipped.push(s);
    const full = freeSpots(s) <= 0;
    if (mode === 'waitlist' || (full && whenFull === 'waitlist')) {
      db.bookings.push({ id: uid(), sessionId: s.id, userId, status: 'waitlist', createdAt: new Date().toISOString(), reminded: false });
      res.waitlist.push(s);
      if (freeSpots(s) > 0) promoteWaitlist(s.id);   // si hay hueco y ya puede, entra directamente
    } else {
      if (planStatus(u).ok) spendCredit(u);
      db.bookings.push({ id: uid(), sessionId: s.id, userId, status: 'booked', createdAt: new Date().toISOString(), reminded: false });
      res.booked.push(s);
      cleanupWaitlists(u, s);
    }
  });
  const lines = [];
  res.booked.forEach(s => lines.push(`✅ ${classLabel(s)}`));
  res.waitlist.forEach(s => lines.push(`⏳ ${classLabel(s)} (lista de espera, nº ${waitlistPosition(userBookingIn(userId, s.id))})`));
  if (lines.length) {
    if (app) notify(userId, `El centro te ha apuntado a:\n${lines.join('\n')}`, 'success');
    if (email) sendEmail(userId, lines.length > 1 ? `Te hemos apuntado a ${lines.length} clases` : 'Te hemos apuntado a una clase',
      `Hola ${u.name.split(' ')[0]},\n\nEl centro te ha apuntado a:\n${lines.join('\n')}\n\nPuedes ver tus clases en la app.\n\n${db.settings.centerName}`);
  }
  saveDB();
  return res;
}

// ---------- Cancelar ----------
function isLateCancel(s) { return sessionStart(s).getTime() - Date.now() < db.settings.cancelHours * 3600000; }
function cancelBooking(bookingId) {
  const b = getBooking(bookingId);
  if (!b) return { ok: false, msg: 'Reserva no encontrada' };
  const s = getSession(b.sessionId), u = getUser(b.userId);
  if (b.status === 'waitlist') { b.status = 'cancelled'; saveDB(); return { ok: true, msg: 'Has salido de la lista de espera.' }; }
  if (sessionStart(s) <= new Date()) return { ok: false, msg: 'No se puede cancelar una clase que ya ha empezado.' };
  const late = isLateCancel(s);
  // Fuera de plazo: la clase cuenta como gastada (estado 'late')
  b.status = late ? 'late' : 'cancelled';
  let msg = isWeekly(u) ? 'Reserva cancelada. Recuperas la clase para esa semana.' : 'Reserva cancelada. Se te ha devuelto la clase al bono.';
  if (!late) refundCredit(u);
  else msg = `Reserva cancelada fuera de plazo (menos de ${db.settings.cancelHours} h): la clase cuenta como gastada.`;
  promoteWaitlist(s.id);
  promoteMemberWaitlists(u.id);   // si esperaba en otra clase, ahora quizá ya puede entrar
  saveDB();
  return { ok: true, msg };
}
// Quitar a un cliente desde administración (siempre devuelve la clase)
function adminRemoveBooking(bookingId, { email = false, app = true } = {}) {
  const b = getBooking(bookingId); if (!b) return;
  const s = getSession(b.sessionId), u = getUser(b.userId);
  const wasWait = b.status === 'waitlist';
  if (!wasWait && b.status === 'booked') refundCredit(u);
  b.status = 'cancelled';
  const txt = wasWait ? `El centro te ha quitado de la lista de espera de ${classLabel(s)}.` : `El centro ha anulado tu reserva de ${classLabel(s)}. Se te ha devuelto la clase.`;
  if (app) notify(u.id, txt, 'warn');
  if (email) sendEmail(u.id, 'Cambio en tu reserva', `Hola ${u.name.split(' ')[0]},\n\n${txt}\n\n${db.settings.centerName}`);
  if (!wasWait) { promoteWaitlist(s.id); promoteMemberWaitlists(u.id); }
  saveDB();
}

// Cuando se libera una plaza, entra automáticamente el primero de la lista de espera (por orden)
function promoteWaitlist(sessionId) {
  const s = getSession(sessionId);
  if (!s || s.cancelled || sessionStart(s) <= new Date()) return;
  // entra el primero de la lista que PUEDA entrar; quien aún no puede sigue esperando
  for (const b of waitlistOf(sessionId)) {
    if (freeSpots(s) <= 0) break;
    if (b.status !== 'waitlist') continue;
    const u = getUser(b.userId);
    const cu = canUseFor(u, s);
    if (cu.ok) {
      spendCredit(u);
      b.status = 'booked';
      const removed = cleanupWaitlists(u, s);
      const extra = removed.length ? `\n\nComo ya no te quedan clases libres para ello, te hemos quitado de la lista de espera de:\n${removed.map(classLabel).join('\n')}` : '';
      notify(u.id, `🎉 ¡Ya tienes plaza! Has pasado de la lista de espera a ${classLabel(s)}.`, 'success');
      if (db.settings.emailOnPromote) sendEmail(u.id, '¡Has entrado en la clase!', `Hola ${u.name.split(' ')[0]},\n\nSe ha liberado una plaza y has pasado de la lista de espera a la clase:\n${classLabel(s)}${extra}\n\nSi no puedes asistir, quítate desde la app.\n\n${db.settings.centerName}`);
    }
  }
}
// Cuando a un cliente se le libera una clase, se miran sus listas de espera por orden
function promoteMemberWaitlists(userId) {
  const now = new Date();
  db.bookings.filter(b => b.userId === userId && b.status === 'waitlist')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach(b => { const s = getSession(b.sessionId); if (s && !s.cancelled && sessionStart(s) > now) promoteWaitlist(s.id); });
}

// ---------- Administración de sesiones ----------
function cancelSession(sessionId, reason = '', email = true) {
  const s = getSession(sessionId);
  s.cancelled = true;
  db.bookings.filter(b => b.sessionId === sessionId && ['booked', 'waitlist'].includes(b.status)).forEach(b => {
    if (b.status === 'booked') refundCredit(getUser(b.userId));
    b.status = 'cancelled';
    const txt = `❌ La clase ${classLabel(s)} ha sido cancelada${reason ? ': ' + reason : ''}. Se te ha devuelto la clase.`;
    notify(b.userId, txt, 'warn');
    if (email) sendEmail(b.userId, 'Clase cancelada', `Hola,\n\n${txt}\n\n${db.settings.centerName}`);
  });
  saveDB();
}
function restoreSession(sessionId) { getSession(sessionId).cancelled = false; saveDB(); }
function toggleSessionHidden(sessionId) { const s = getSession(sessionId); s.hidden = !s.hidden; saveDB(); }
// Asistencia automática: una reserva de una clase ya terminada cuenta como «asistió»
// salvo que el centro marque «no vino».
function attendStatus(b) {
  if (b.status === 'booked') { const s = getSession(b.sessionId); if (s && !s.cancelled && sessionEnd(s) <= new Date()) return 'attended'; }
  return b.status;
}
function setAttendance(bookingId, status) { getBooking(bookingId).status = status; saveDB(); }
function updateSessionCapacity(sessionId, cap) { getSession(sessionId).capacity = cap; promoteWaitlist(sessionId); saveDB(); }

// ---------- Horario semanal ----------
function addScheduleSlot(weekday, time, classTypeId, capacity = null, { startDate = null, endDate = null, visibleDays = null, color = null } = {}) {
  db.schedule.push({ id: uid(), weekday, time, classTypeId, members: [], capacity, startDate, endDate, visibleDays, color });
  ensureSessions(); saveDB();
}
// Cambiar temporada y antelación de un turno: quita las clases que quedan fuera y crea las que entran
function setSlotSeason(slotId, { startDate = null, endDate = null, visibleDays = null }, { ensure = true } = {}) {
  const t = getSlot(slotId);
  Object.assign(t, { startDate, endDate, visibleDays });
  const now = new Date();
  db.sessions.filter(s => s.templateId === slotId && sessionStart(s) > now && !slotInSeason(t, s.date)).forEach(s => {
    if (bookedIn(s.id).length || waitlistOf(s.id).length) cancelSession(s.id, 'fuera de la temporada del turno');
    else db.sessions = db.sessions.filter(x => x.id !== s.id);
  });
  saveDB();
  if (ensure) ensureSessions();
}
// Clases lejanas que aún no existen: se calculan a partir del horario (para el calendario del administrador)
function projectedSessions(key) {
  const d = parseKey(key);
  return db.schedule.filter(t => t.weekday === d.getDay() && slotInSeason(t, key) && getClassType(t.classTypeId))
    .filter(t => !db.sessions.some(s => s.templateId === t.id && s.date === key))
    .map(t => ({ projected: true, templateId: t.id, classTypeId: t.classTypeId, date: key, time: t.time, capacity: slotCapacity(t),
      duration: getClassType(t.classTypeId).duration, coach: getClassType(t.classTypeId).coach, members: t.members.length }));
}
// Crear ya una clase futura del horario (al abrirla desde el calendario) con sus reservas de grupo
function materializeSession(slotId, key) {
  const t = getSlot(slotId), ct = getClassType(t.classTypeId);
  const found = db.sessions.find(s => s.templateId === slotId && s.date === key);
  if (found) return found;
  const s = { id: uid(), templateId: t.id, classTypeId: ct.id, date: key, time: t.time, duration: ct.duration, capacity: slotCapacity(t), coach: ct.coach, cancelled: false, hidden: false };
  db.sessions.push(s);
  t.members.forEach(m => groupBook(m, s));
  saveDB();
  return s;
}
// Hasta dónde llega la temporada (para el calendario): la fecha de fin más lejana, o un año
function seasonEnd() {
  const ends = db.schedule.map(t => t.endDate).filter(Boolean).sort();
  const noEnd = db.schedule.some(t => !t.endDate);
  const yearAhead = dateKey(addDays(new Date(), 365));
  return noEnd || !ends.length ? yearAhead : ends[ends.length - 1];
}
// Temporada por defecto: hasta el 30 de junio que viene
function defaultSeasonEnd() {
  const d = new Date(); const y = d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear();
  return `${y}-06-30`;
}
function removeScheduleSlot(slotId) {
  const now = new Date();
  db.sessions.filter(s => s.templateId === slotId && sessionStart(s) > now).forEach(s => {
    if (bookedIn(s.id).length || waitlistOf(s.id).length) cancelSession(s.id, 'cambio de horario');
    else db.sessions = db.sessions.filter(x => x.id !== s.id);
  });
  db.schedule = db.schedule.filter(t => t.id !== slotId);
  saveDB();
}
function addOneOffSession(date, time, classTypeId, hidden = false) {
  const ct = getClassType(classTypeId);
  db.sessions.push({ id: uid(), templateId: null, classTypeId, date, time, duration: ct.duration, capacity: ct.capacity, coach: ct.coach, cancelled: false, hidden });
  saveDB();
}
function saveClassType(data) {
  if (data.id) {
    const ct = getClassType(data.id);
    Object.assign(ct, data);
    db.sessions.filter(s => s.classTypeId === ct.id && sessionStart(s) > new Date()).forEach(s => {
      s.coach = ct.coach; s.duration = ct.duration;
      const t = s.templateId && getSlot(s.templateId);
      const hasOwn = t && t.capacity !== null && t.capacity !== undefined && t.capacity !== '';
      if (!hasOwn && bookedIn(s.id).length <= ct.capacity) s.capacity = ct.capacity;
      promoteWaitlist(s.id);
    });
  } else {
    db.classTypes.push({ ...data, id: uid() });
  }
  saveDB();
}
function deleteClassType(id) {
  db.schedule.filter(t => t.classTypeId === id).forEach(t => removeScheduleSlot(t.id));
  db.classTypes = db.classTypes.filter(c => c.id !== id);
  saveDB();
}

// ---------- Clientes y bonos ----------
function saveClient(data) {
  if (data.email && db.users.some(u => u.email && u.email.toLowerCase() === data.email.toLowerCase() && u.id !== data.id)) return { ok: false, msg: 'Ya existe un usuario con ese email.' };
  if (data.id) Object.assign(getUser(data.id), data);
  else db.users.push({ id: uid(), role: 'client', active: true, blocked: false, blockedReason: '', weeklyLimit: null, planId: null, credits: 0, planExpires: null, createdAt: dateKey(new Date()), ...data });
  saveDB();
  return { ok: true };
}
// Usuario comodín: ficha del centro sin correo ni tarifa, para que el administrador reserve plazas
const placeholders = () => db.users.filter(u => u.role === 'client' && u.isPlaceholder);
const realClients = () => db.users.filter(u => u.role === 'client' && !u.isPlaceholder);
function createPlaceholder(name) {
  const n = (name || '').trim() || `Plaza del centro ${placeholders().length + 1}`;
  const id = uid();
  db.users.push({ id, role: 'client', isPlaceholder: true, name: n, email: '', phone: '', active: true, blocked: false, blockedReason: '', weeklyLimit: null, planId: null, credits: null, planExpires: null, weekExtras: {}, createdAt: dateKey(new Date()) });
  saveDB();
  return id;
}
// Un comodín libre en esa clase (crea uno nuevo si todos están ya dentro)
function freePlaceholderFor(sessionId) {
  const p = placeholders().find(u => u.active && !userBookingIn(u.id, sessionId));
  return p ? p.id : createPlaceholder();
}
function blockUser(userId, reason, { cancelFuture = false, email = true } = {}) {
  const u = getUser(userId);
  u.blocked = true; u.blockedReason = reason;
  let n = 0;
  if (cancelFuture) {
    db.bookings.filter(b => b.userId === userId && ['booked', 'waitlist'].includes(b.status)).forEach(b => {
      const s = getSession(b.sessionId);
      if (s && sessionStart(s) > new Date()) { adminRemoveBooking(b.id, { app: false }); b.blockRemoved = true; n++; }
    });
  }
  const txt = `Tu cuenta ha sido bloqueada${reason ? ': ' + reason : ''}. No podrás reservar hasta que se regularice. Habla con el centro.`;
  notify(userId, '🔒 ' + txt, 'warn');
  if (email) sendEmail(userId, 'Cuenta bloqueada', `Hola ${u.name.split(' ')[0]},\n\n${txt}\n\n${db.settings.centerName}`);
  saveDB();
  return n;
}
function unblockUser(userId, email = true) {
  const u = getUser(userId);
  u.blocked = false; u.blockedReason = '';
  syncGroups(userId);
  promoteMemberWaitlists(userId);
  notify(userId, '🔓 Tu cuenta vuelve a estar activa. Ya puedes reservar.', 'success');
  if (email) sendEmail(userId, 'Cuenta desbloqueada', `Hola ${u.name.split(' ')[0]},\n\nTu cuenta vuelve a estar activa. Ya puedes reservar tus clases.\n\n${db.settings.centerName}`);
  saveDB();
}
// ---------- Cuota pendiente ----------
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const monthName = key => { const [y, m] = (key || monthKey()).split('-').map(Number); return MONTHS_LONG[m - 1]; };
function markPaymentDue(userId, { email = false, app = true } = {}) {
  const u = getUser(userId);
  u.paymentDue = true; u.paymentMonth = monthKey(); u.paymentAnswer = null; u.paymentAnsweredAt = null;
  const txt = `Tu cuota de ${monthName(u.paymentMonth)} está pendiente de pago (se paga del 1 al 5 de cada mes). Entra en la app y dinos si sigues con nosotros.`;
  if (app) notify(userId, '💶 ' + txt, 'warn');
  if (email) sendEmail(userId, `Cuota de ${monthName(u.paymentMonth)} pendiente`, `Hola ${u.name.split(' ')[0]},\n\n${txt}\n\nSi ya la has pagado, ignora este mensaje.\n\n${db.settings.centerName}`);
  saveDB();
}
function markPaid(userId) {
  const u = getUser(userId);
  u.paymentDue = false; u.paymentAnswer = null; u.paymentAnsweredAt = null;
  saveDB();
}
// El cliente responde: 'stay' (sigo) | 'leave' (me doy de baja). Con servidor lo sustituye remote.js.
function answerPayment(userId, answer) {
  const u = getUser(userId);
  if (!u.paymentDue) return { ok: false, msg: 'No tienes ninguna cuota pendiente.' };
  u.paymentAnswer = answer; u.paymentAnsweredAt = new Date().toISOString();
  saveDB();
  return { ok: true, msg: answer === 'stay' ? '¡Genial! Se lo hemos dicho al centro. Recuerda pagar la cuota.' : 'De acuerdo, se lo hemos dicho al centro. ¡Gracias por entrenar con nosotros!' };
}

// ---------- Lista de espera de clientes nuevos (solo administrador) ----------
function saveProspect(data) {
  if (data.id) Object.assign(db.prospects.find(p => p.id === data.id), data);
  else db.prospects.push({ ...data, id: uid(), createdAt: new Date().toISOString() });
  saveDB();
}
function deleteProspect(id) { db.prospects = db.prospects.filter(p => p.id !== id); saveDB(); }

function assignPlan(userId, planId) {
  const u = getUser(userId), p = getPlan(planId);
  u.planId = p.id;
  u.credits = p.type === 'weekly' ? null : p.credits;
  u.planExpires = null;   // la cuota es mensual: la tarifa no caduca
  syncGroups(userId);
  promoteMemberWaitlists(userId);
  notify(u.id, `✅ Tu tarifa ahora es: ${p.name}.`, 'success');
  saveDB();
}
function adjustCredits(userId, delta) { const u = getUser(userId); if (u.credits !== null) u.credits = Math.max(0, u.credits + delta); saveDB(); }
function savePlan(data) { if (data.id) Object.assign(getPlan(data.id), data); else db.plans.push({ ...data, id: uid() }); saveDB(); }
function deletePlan(id) { db.plans = db.plans.filter(p => p.id !== id); saveDB(); }

// ---------- Tablón ----------
function saveAnnouncement(data) {
  if (data.id) Object.assign(db.announcements.find(a => a.id === data.id), data);
  else {
    db.announcements.push({ ...data, id: uid(), date: new Date().toISOString() });
    clients().filter(c => c.active).forEach(c => notify(c.id, `📢 Nuevo anuncio: ${data.title}`, 'info'));
  }
  saveDB();
}
function deleteAnnouncement(id) { db.announcements = db.announcements.filter(a => a.id !== id); saveDB(); }

// ---------- Formato ----------
const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DOW_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fmtDateShort(key) { const d = parseKey(key); return `${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; }
function fmtDateLong(key) { const d = parseKey(key); return `${DOW_LONG[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`; }
function fmtAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return 'ahora';
  if (diff < 60) return `hace ${Math.floor(diff)} min`;
  if (diff < 1440) return `hace ${Math.floor(diff / 60)} h`;
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
