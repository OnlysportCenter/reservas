// ============================================================
//  MODO SERVIDOR (Supabase)
//  Se activa solo si config.js tiene la dirección y la clave.
//  - Clientes: entran con un código de 6 cifras que les llega al email.
//  - Administrador: entra con email y contraseña.
//  - Las acciones de los clientes (reservar, quitarse, lista de espera) las
//    hace el servidor, que comprueba todas las reglas.
//  - Lo que cambia el administrador se guarda en el servidor automáticamente.
//  - Todo se actualiza en tiempo real en todos los móviles.
// ============================================================
(function () {
  const cfg = window.RESERVAS_CONFIG || {};
  window.SERVER = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  if (!window.SERVER) {
    if (cfg.supabaseUrl && !window.supabase) console.warn('No se pudo cargar Supabase (¿sin internet?). Modo prueba.');
    return;
  }

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
  window.sb = sb;
  let role = null;          // 'admin' | 'client'
  let snapshot = {};        // última versión guardada en el servidor de cada fila (para saber qué ha cambiado)
  let settingsSnap = '';
  let queue = Promise.resolve();
  const enqueue = fn => (queue = queue.then(fn).catch(e => { console.error(e); toast('Error de conexión: ' + (e.message || e), 'err'); showSaveError(e); }));
  // Si un guardado falla, se avisa de forma fija: lo que se ve en pantalla puede no estar guardado
  function showSaveError(e) {
    if (role !== 'admin' || document.getElementById('save-error')) return;
    const el = document.createElement('div');
    el.id = 'save-error';
    el.className = 'save-error';
    el.innerHTML = `<div><b>⚠️ No se han podido guardar los últimos cambios.</b><div class="small">Recarga la página: verás lo que de verdad está guardado. (${esc(e.message || e)})</div></div>
      <button class="btn sm" onclick="location.reload()">Recargar</button>`;
    document.body.appendChild(el);
  }

  // ---------- Columnas de cada tabla (y valor por defecto si falta) ----------
  const TODAY = () => dateKey(new Date());
  const NOW = () => new Date().toISOString();
  const TABLES = {
    plans: { db: 'plans', cols: { id: null, name: '', type: 'weekly', per_week: null, credits: null, duration_days: 30, price: 0 } },
    classTypes: { db: 'class_types', cols: { id: null, name: '', color: '#2F5D8A', coach: '', capacity: 20, duration: 60, description: '', hidden: false } },
    schedule: { db: 'schedule', cols: { id: null, weekday: 1, time: '09:00', class_type_id: null, members: [], capacity: null, start_date: null, end_date: null, visible_days: null, color: null } },
    users: { db: 'members', cols: { id: null, auth_id: null, name: '', email: '', phone: '', role: 'client', active: true, blocked: false, blocked_reason: '', weekly_limit: null, week_extras: {}, plan_id: null, credits: null, plan_expires: null, email_invalid: false, imported: false, created_at: TODAY, payment_due: false, payment_month: null, payment_answer: null, payment_answered_at: null, is_placeholder: false, fee: null, fee_iva: false, import_source: '' } },
    payments: { db: 'payments', cols: { id: null, user_id: null, month: null, status: 'paid', paid_at: null, method: 'Efectivo', base: 0, iva: false, total: 0, note: '', created_at: NOW } },
    cashMoves: { db: 'cash_moves', cols: { id: null, date: null, concept: '', method: 'Efectivo', base: 0, iva: false, amount: 0, created_at: NOW } },
    workouts: { db: 'workouts', cols: { id: null, week_start: null, position: 1, title: '', rounds: null, work_secs: null, rest_secs: null, notes: '', exercises: [], created_at: NOW } },
    exercises: { db: 'exercises', cols: { id: null, name: '', created_at: NOW } },
    ptClients: { db: 'pt_clients', cols: { id: null, member_id: null, name: '', phone: '', email: '', goal: '', days: '', notes: '', active: true, created_at: NOW } },
    ptSessions: { db: 'pt_sessions', cols: { id: null, client_id: null, date: null, routine: '', notes: '', exercises: [], created_at: NOW } },
    prospects: { db: 'prospects', cols: { id: null, name: '', last_name: '', phone: '', email: '', note: '', created_at: NOW } },
    sessions: { db: 'sessions', cols: { id: null, template_id: null, class_type_id: null, date: null, time: '09:00', duration: 60, capacity: 20, coach: '', cancelled: false, hidden: false } },
    bookings: { db: 'bookings', cols: { id: null, session_id: null, user_id: null, status: 'booked', source: null, created_at: NOW, reminded: false, block_removed: false, group_removed: false } },
    announcements: { db: 'announcements', cols: { id: null, title: '', body: '', date: NOW, pinned: false } },
    notifications: { db: 'notifications', cols: { id: null, user_id: null, text: '', type: 'info', date: NOW, read: false } },
    emails: { db: 'emails', cols: { id: null, user_id: null, to_email: '', subject: '', body: '', date: NOW, sent_at: null, error: null } },
  };
  const ORDER = ['plans', 'classTypes', 'schedule', 'users', 'sessions', 'bookings', 'announcements', 'notifications', 'emails', 'prospects', 'payments', 'cashMoves', 'exercises', 'workouts', 'ptClients', 'ptSessions'];
  const TS = new Set(['cash_moves.created_at', 'workouts.created_at', 'exercises.created_at', 'pt_clients.created_at', 'pt_sessions.created_at','bookings.created_at', 'announcements.date', 'notifications.date', 'emails.date', 'emails.sent_at', 'members.payment_answered_at', 'prospects.created_at', 'payments.created_at']);
  const toCamel = s => s === 'to_email' ? 'to' : s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const toJS = (t, row) => {
    const o = {};
    for (const [k, v] of Object.entries(row)) {
      o[toCamel(k)] = (TS.has(TABLES[t].db + '.' + k) && v) ? new Date(v).toISOString() : v;
    }
    return o;
  };
  const toDB = (t, o) => {
    const r = {};
    for (const [col, def] of Object.entries(TABLES[t].cols)) {
      let v = o[toCamel(col)];
      if (v === undefined) v = typeof def === 'function' ? def() : def;
      if (col === 'price' || col === 'capacity' || col === 'duration' || col === 'visible_days' || col === 'fee') v = (v === null || v === '' || v === undefined) ? null : Number(v);
      if (col === 'base' || col === 'total' || col === 'amount') v = Number(v) || 0;
      if (col === 'rounds' || col === 'work_secs' || col === 'rest_secs' || col === 'position') v = (v === null || v === '' || v === undefined || isNaN(Number(v))) ? (col === 'position' ? 1 : null) : Math.round(Number(v));
      if (col === 'paid_at' && v === '') v = null;
      if ((col === 'start_date' || col === 'end_date') && v === '') v = null;
      r[col] = v;
    }
    return r;
  };

  async function fetchAll(build) {
    const out = []; const step = 1000;
    for (let from = 0; ; from += step) {
      const { data, error } = await build().range(from, from + step - 1);
      if (error) throw error;
      out.push(...data);
      if (data.length < step) break;
    }
    return out;
  }

  // ---------- Carga de datos ----------
  async function loadSettings() {
    const { data, error } = await sb.from('settings').select('data').eq('id', 1).single();
    if (error) throw error;
    return data.data;
  }
  async function loadAdmin() {
    const from = dateKey(addDays(new Date(), -60));
    const [settings, plans, cts, sched, members, sessions, bookings, anns, notifs, emails, prospects, payments, cashMoves, workouts, exercises, ptClients, ptSessions] = await Promise.all([
      loadSettings(),
      fetchAll(() => sb.from('plans').select('*').order('id')),
      fetchAll(() => sb.from('class_types').select('*').order('id')),
      fetchAll(() => sb.from('schedule').select('*').order('id')),
      fetchAll(() => sb.from('members').select('*').order('id')),
      fetchAll(() => sb.from('sessions').select('*').gte('date', from).order('id')),
      fetchAll(() => sb.from('bookings').select('*, sessions!inner(date)').gte('sessions.date', from).order('id')),
      fetchAll(() => sb.from('announcements').select('*').order('id')),
      fetchAll(() => sb.from('notifications').select('*').gte('date', addDays(new Date(), -60).toISOString()).order('id')),
      fetchAll(() => sb.from('emails').select('*').gte('date', addDays(new Date(), -30).toISOString()).order('id')),
      fetchAll(() => sb.from('prospects').select('*').order('id')),
      fetchAll(() => sb.from('payments').select('*').order('id')),
      fetchAll(() => sb.from('cash_moves').select('*').order('id')),
      fetchAll(() => sb.from('workouts').select('*').order('id')),
      fetchAll(() => sb.from('exercises').select('*').order('id')),
      fetchAll(() => sb.from('pt_clients').select('*').order('id')),
      fetchAll(() => sb.from('pt_sessions').select('*').order('id')),
    ]);
    bookings.forEach(b => delete b.sessions);
    const raw = { plans, classTypes: cts, schedule: sched, users: members, sessions, bookings, announcements: anns, notifications: notifs, emails, prospects, payments, cashMoves, workouts, exercises, ptClients, ptSessions };
    applyLoaded(settings, raw);
  }
  // El socio solo descarga lo que usa: las clases que puede ver (desde el lunes de esta semana hasta
  // donde llega la antelación), su historial reciente, su ficha, sus grupos y los últimos avisos.
  const SCHED_COLS = 'id, weekday, time, class_type_id, capacity, start_date, end_date, visible_days, color';
  async function loadClient() {
    const histFrom = dateKey(addDays(new Date(), -35));
    const [settings, plans, cts, sched, me, mine, anns, notifs] = await Promise.all([
      loadSettings(),
      fetchAll(() => sb.from('plans').select('*')),
      fetchAll(() => sb.from('class_types').select('*')),
      fetchAll(() => sb.from('schedule').select(SCHED_COLS)),
      fetchAll(() => sb.from('members').select('*')),
      sb.rpc('my_bookings', { since: histFrom }).then(r => { if (r.error) throw r.error; return r.data; }),
      fetchAll(() => sb.from('announcements').select('*').order('date', { ascending: false }).limit(20)),
      fetchAll(() => sb.from('notifications').select('*').order('date', { ascending: false }).limit(60)),
    ]);
    // hasta dónde ven los socios (la antelación general o la de algún turno, la mayor) + margen
    const horizon = Math.max(Number(settings.bookWindowDays) || 7, ...sched.map(t => Number(t.visible_days) || 0)) + 2;
    const from = dateKey(weekStart(new Date())), to = dateKey(addDays(new Date(), horizon));
    const myId = me[0]?.id;
    const [sessions, stats, myGroups] = await Promise.all([
      fetchAll(() => sb.from('sessions').select('*').gte('date', from).lte('date', to)),
      fetchAll(() => sb.from('session_stats').select('session_id, booked, waitlist, sessions!inner(date)').gte('sessions.date', from).lte('sessions.date', to)),
      myId ? fetchAll(() => sb.from('schedule').select('id').contains('members', [myId])) : Promise.resolve([]),
    ]);
    // clases pasadas de su historial (solo las suyas)
    const inWin = new Set(sessions.map(s => s.id));
    const pastIds = [...new Set(mine.map(b => b.session_id).filter(id => !inWin.has(id)))];
    if (pastIds.length) {
      for (let i = 0; i < pastIds.length; i += 80) {
        const { data, error } = await sb.from('sessions').select('*').in('id', pastIds.slice(i, i + 80));
        if (error) throw error;
        sessions.push(...data);
      }
    }
    const mineSet = new Set(myGroups.map(g => g.id));
    sched.forEach(t => { t.members = mineSet.has(t.id) && myId ? [myId] : []; });
    const sesIds = new Set(sessions.map(s => s.id));
    const bookings = mine.filter(b => sesIds.has(b.session_id)).map(b => ({ ...b, wait_position: b.wait_position }));
    applyLoaded(settings, { plans, classTypes: cts, schedule: sched, users: me, sessions, bookings, announcements: anns, notifications: notifs, emails: [], prospects: [], payments: [], cashMoves: [], workouts: [], exercises: [], ptClients: [], ptSessions: [] });
    const st = Object.fromEntries(stats.map(x => [x.session_id, { booked: x.booked, waitlist: x.waitlist }]));
    db.sessions.forEach(s => s.stats = st[s.id] || { booked: 0, waitlist: 0 });
  }
  function applyLoaded(settings, raw) {
    const fresh = { version: 2, settings, emails: [], notifications: [] };
    snapshot = {};
    for (const t of ORDER) {
      fresh[t] = (raw[t] || []).map(r => toJS(t, r));
      snapshot[t] = new Map(fresh[t].map(o => [o.id, JSON.stringify(toDB(t, o))]));
    }
    settingsSnap = JSON.stringify(settings);
    db = fresh;
    migrateServer();
  }
  // Campos que la app espera aunque el servidor no los tenga
  function migrateServer() {
    db.users.forEach(u => { u.weekExtras = u.weekExtras || {}; });
    db.schedule.forEach(t => { t.members = t.members || []; });
  }
  const reload = () => enqueue(async () => { await flushNow(); role === 'admin' ? await loadAdmin() : await loadClient(); });
  window.reloadData = () => reload();   // botón «Actualizar» del panel

  // ---------- Guardar cambios del administrador ----------
  let flushTimer = null;
  async function flushNow() {
    if (role !== 'admin' || !db) return;
    // ajustes
    const sj = JSON.stringify(db.settings);
    if (sj !== settingsSnap) {
      const { error } = await sb.from('settings').update({ data: db.settings }).eq('id', 1);
      if (error) throw error;
      settingsSnap = sj;
    }
    // altas y cambios (en orden, para respetar las relaciones entre tablas)
    const deletes = [];
    for (const t of ORDER) {
      const snap = snapshot[t] || new Map();
      const now = new Map();
      const changed = [];
      for (const o of db[t] || []) {
        const row = toDB(t, o); const j = JSON.stringify(row);
        now.set(o.id, j);
        if (snap.get(o.id) !== j) changed.push(row);
      }
      for (let i = 0; i < changed.length; i += 500) {
        const { error } = await sb.from(TABLES[t].db).upsert(changed.slice(i, i + 500));
        if (error) throw error;
      }
      const gone = [...snap.keys()].filter(id => !now.has(id));
      if (gone.length) deletes.push([t, gone]);
      snapshot[t] = now;
    }
    // bajas (al revés: primero lo que depende de otras tablas)
    for (const [t, ids] of deletes.reverse()) {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await sb.from(TABLES[t].db).delete().in('id', ids.slice(i, i + 200));
        if (error) throw error;
      }
    }
  }

  // ---------- Sustituir funciones de la capa de datos ----------
  window.saveDB = function () {
    if (role !== 'admin') return;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => enqueue(flushNow), 250);
  };
  window.loadDB = function () { return db; };             // los datos ya están cargados
  window.resetDB = function () { toast('Con servidor no se pueden restablecer los datos.', 'err'); return db; };
  window.generateReminders = function () {};              // los recordatorios los crea el servidor
  window.ensureSessions = function () {
    if (role !== 'admin') return;
    enqueue(async () => { await flushNow(); const { error } = await sb.rpc('ensure_sessions'); if (error) throw error; await loadAdmin(); liveRenderSafe(); });
  };

  // Acciones de los clientes: las hace el servidor
  window.book = async function (userId, sessionId) {
    const { data, error } = await sb.rpc('book_session', { sid: sessionId });
    await reload();
    return error ? { ok: false, msg: error.message } : data;
  };
  window.cancelBooking = async function (bookingId) {
    const { data, error } = await sb.rpc('cancel_booking', { bid: bookingId });
    await reload();
    return error ? { ok: false, msg: error.message } : data;
  };
  window.answerPayment = async function (userId, answer) {
    const { data, error } = await sb.rpc('answer_payment', { ans: answer });
    await reload();
    return error ? { ok: false, msg: error.message } : data;
  };
  // Borrar notificaciones: el cliente solo puede borrar las suyas (lo comprueba el servidor)
  window.deleteReadNotifications = async function () {
    if (role === 'admin') { window.saveDB(); return; }
    await sb.rpc('mark_notifications_read');
    const { error } = await sb.rpc('delete_read_notifications');
    if (error) toast(error.message, 'err');
    await reload();
  };
  window.deleteNotification = async function (id) {
    const { error } = await sb.rpc('delete_notification', { nid: id });
    if (error) toast(error.message, 'err');
    await reload();
  };
  // Bandeja de correos: antes de abrirla se trae el estado real (enviado / pendiente / error)
  const _openEmails = window.openEmails;
  window.openEmails = async function () {
    if (role === 'admin') {
      try {
        await enqueue(async () => {
          await flushNow();
          const rows = await fetchAll(() => sb.from('emails').select('*').gte('date', addDays(new Date(), -30).toISOString()).order('id'));
          db.emails = rows.map(r => toJS('emails', r));
          snapshot.emails = new Map(db.emails.map(o => [o.id, JSON.stringify(toDB('emails', o))]));
        });
      } catch (e) { console.error(e); }
    }
    _openEmails();
  };
  const _openNotifications = window.openNotifications;
  window.openNotifications = function () {
    _openNotifications();
    if (role === 'client') sb.rpc('mark_notifications_read').then(() => {});
  };

  // ---------- Tiempo real ----------
  let rtTimer = null, paintTimer = null, channel = null;
  function liveRenderSafe() { if (me() && !$('#modal-root').innerHTML) liveRender(); }
  // Recarga tras un cambio. Cada móvil espera un poco distinto para que, si entran 100 a la vez,
  // no pidan todos los datos en el mismo segundo.
  function scheduleReload() {
    clearTimeout(rtTimer);
    const wait = role === 'admin' ? 2500 : 1500 + Math.random() * 3000;
    rtTimer = setTimeout(() => reload().then(liveRenderSafe), wait);
  }
  function subscribe() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel('reservas');
    // Las plazas libres de cada clase: el aviso ya trae el número nuevo, así que el socio
    // lo pinta sin pedir nada al servidor (es lo que más cambia cuando hay mucha gente).
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'session_stats' }, payload => {
      if (role === 'admin') return scheduleReload();
      const row = payload.new && payload.new.session_id ? payload.new : null;
      const s = row && db?.sessions.find(x => x.id === row.session_id);
      if (!s) return;
      s.stats = { booked: row.booked, waitlist: row.waitlist };
      clearTimeout(paintTimer);
      paintTimer = setTimeout(liveRenderSafe, 300);
    });
    ['bookings', 'notifications', 'sessions', 'announcements', 'members', 'schedule'].forEach(t =>
      channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, scheduleReload));
    channel.subscribe();
  }

  // ---------- Acceso ----------
  // El acceso con contraseña (administrador) solo aparece en la dirección …/#admin
  const adminEntry = () => /^#admin/i.test(location.hash) || new URLSearchParams(location.search).has('admin');
  const freshStep = () => ({ email: '', mode: adminEntry() ? 'password' : 'code', sent: false });
  let loginStep = freshStep();
  window.addEventListener('hashchange', () => { if (!role) { loginStep = freshStep(); renderLogin(); } });
  window.renderLogin = function () {
    const b = brand();
    const s = loginStep;
    $('#app').innerHTML = `
      <div class="login"><div class="card">
        <div class="login-logo">${brandMark(64)}</div>
        <h1 style="font-size:26px">${esc(db?.settings?.centerName || 'Onlysport Center')}</h1>
        ${s.mode === 'password' ? `
          <p class="muted">Acceso del centro</p>
          <form data-form="login-pass">
            <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="username" value="${esc(s.email)}"></div>
            <div class="field"><label>Contraseña</label><input name="password" type="password" required autocomplete="current-password"></div>
            <button class="btn primary block" type="submit">Entrar</button>
          </form>
          <div class="row between wrap" style="margin-top:14px">
            <button class="btn ghost sm" data-a="login-mode" data-m="code">Entrar con un código</button>
            <button class="btn ghost sm" data-a="login-forgot">He olvidado la contraseña</button>
          </div>`
        : !s.sent ? `
          <p class="muted">Escribe tu email y te enviaremos un código para entrar. Sin contraseñas.</p>
          <form data-form="login-code-send">
            <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email" inputmode="email" value="${esc(s.email)}" placeholder="tu@email.com"></div>
            <button class="btn primary block" type="submit">Enviarme el código</button>
          </form>
          <p class="muted small" style="margin-top:12px">Usa el email que diste en el centro. Solo tendrás que hacerlo una vez en cada móvil: la app recuerda tu sesión.</p>
          ${adminEntry() ? '<div style="margin-top:8px;text-align:right"><button class="btn ghost sm" data-a="login-mode" data-m="password">Entrar con contraseña</button></div>' : ''}`
        : `
          <p class="muted">Te hemos enviado un código a <b>${esc(s.email)}</b>. Mira también en «Spam» o «Promociones».</p>
          <form data-form="login-code-verify">
            <div class="field"><label>Código</label><input name="code" required inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="Código" style="font-size:24px;letter-spacing:6px;text-align:center"></div>
            <button class="btn primary block" type="submit">Entrar</button>
          </form>
          <div class="row between wrap" style="margin-top:14px">
            <button class="btn ghost sm" data-a="login-back">← Cambiar email</button>
            <button class="btn ghost sm" data-a="login-resend">Reenviar código</button>
          </div>`}
        <p class="muted small" style="margin:16px 0 0;border-top:1px solid var(--border);padding-top:12px">Usamos tus datos solo para gestionar tus clases. <button class="legal-link" data-a="privacy">Privacidad</button></p>
      </div></div>`;
  };

  // Pantalla de «sin conexión»: NUNCA se cierra la sesión por un error; se reintenta
  function renderOffline(msg) {
    $('#app').innerHTML = `<div class="login"><div class="card" style="text-align:center">
      <div class="login-logo" style="display:flex;justify-content:center">${brandMark(56)}</div>
      <h2 style="margin-bottom:8px">No hemos podido conectar</h2>
      <p class="muted">Comprueba tu conexión a internet. Tu sesión sigue abierta.</p>
      <p class="muted small">${esc(msg || '')}</p>
      <button class="btn primary block" data-a="retry-load">Reintentar</button></div></div>`;
  }
  async function afterSignIn() {
    const { data, error } = await sb.rpc('claim_member');
    if (error) throw error;                       // error de conexión: se reintenta, no se cierra la sesión
    if (!data) {
      // el email no está dado de alta (o la ficha está desactivada): solo entonces se sale
      await sb.auth.signOut();
      toast('Ese email no está dado de alta en el centro. Pregunta en recepción.', 'err');
      loginStep = freshStep();
      return renderLogin();
    }
    role = data.role;
    state.userId = data.id;
    $('#app').innerHTML = '<div class="login"><div class="card" style="text-align:center">Cargando…</div></div>';
    await (role === 'admin' ? loadAdmin() : loadClient());
    applyBrand();
    state.view = role === 'admin' ? 'a-today' : 'c-book';
    state.date = dateKey(new Date());
    if (role === 'admin') ensureSessions();
    subscribe();
    render();
  }

  Object.assign(actions, {
    'login-mode': d => { loginStep = { ...loginStep, mode: d.m, sent: false }; renderLogin(); },
    'retry-load': async () => {
      $('#app').innerHTML = '<div class="login"><div class="card" style="text-align:center">Cargando…</div></div>';
      try { await afterSignIn(); } catch (e) { renderOffline(e.message); }
    },
    'login-back': () => { loginStep.sent = false; renderLogin(); },
    'login-resend': async () => {
      const { error } = await sb.auth.signInWithOtp({ email: loginStep.email, options: { shouldCreateUser: true } });
      toast(error ? error.message : 'Código reenviado', error ? 'err' : 'ok');
    },
    'login-forgot': async () => {
      const email = document.querySelector('[data-form="login-pass"] [name="email"]').value.trim();
      if (!email) return toast('Escribe primero tu email', 'err');
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      toast(error ? error.message : 'Te hemos enviado un correo para cambiar la contraseña', error ? 'err' : 'ok');
    },
  });
  Object.assign(forms, {
    'login-code-send': async f => {
      const email = f.get('email').trim().toLowerCase();
      const btn = document.querySelector('[data-form="login-code-send"] button'); if (btn) btn.disabled = true;
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) { toast('No se pudo enviar el código: ' + error.message, 'err'); if (btn) btn.disabled = false; return; }
      loginStep = { email, mode: 'code', sent: true };
      renderLogin();
    },
    'login-code-verify': async f => {
      const token = f.get('code').replace(/\s/g, '');
      const { error } = await sb.auth.verifyOtp({ email: loginStep.email, token, type: 'email' });
      if (error) return toast('Código incorrecto o caducado. Pide uno nuevo.', 'err');
      try { await afterSignIn(); } catch (e) { renderOffline(e.message); }
    },
    'login-pass': async f => {
      const email = f.get('email').trim();
      const { error } = await sb.auth.signInWithPassword({ email, password: f.get('password') });
      if (error) return toast('Email o contraseña incorrectos', 'err');
      try { await afterSignIn(); } catch (e) { renderOffline(e.message); }
    },
    'new-password': async f => {
      const { error } = await sb.auth.updateUser({ password: f.get('password') });
      if (error) return toast(error.message, 'err');
      closeModal(); toast('Contraseña cambiada', 'ok');
    },
  });

  window.logout = async function () {
    await enqueue(flushNow);
    if (channel) sb.removeChannel(channel);
    await sb.auth.signOut();
    role = null; state.userId = null; closeModal();
    loginStep = freshStep();
    renderLogin();
  };

  window.init = async function () {
    applyBrand();
    $('#app').innerHTML = '<div class="login"><div class="card" style="text-align:center">Cargando…</div></div>';
    try {
      // la marca del centro se ve también en la pantalla de entrada
      const { data: s } = await sb.from('settings').select('data').eq('id', 1).maybeSingle();
      db = { settings: s?.data || { centerName: 'Onlysport Center' }, users: [], plans: [], classTypes: [], schedule: [], sessions: [], bookings: [], announcements: [], notifications: [], emails: [] };
      applyBrand();
    } catch (e) { /* sin sesión las tablas no se pueden leer: se usa la marca por defecto */ }
    if (!db) db = { settings: { centerName: 'Onlysport Center' }, users: [], plans: [], classTypes: [], schedule: [], sessions: [], bookings: [], announcements: [], notifications: [], emails: [] };
    sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setTimeout(() => openModal(`${modalHead('Nueva contraseña')}
        <form data-form="new-password"><div class="field"><label>Contraseña nueva</label><input name="password" type="password" minlength="8" required autocomplete="new-password"></div>
        <button class="btn primary block" type="submit">Guardar</button></form>`), 300);
    });
    let session = null;
    try { ({ data: { session } } = await sb.auth.getSession()); } catch (e) { console.error(e); }
    // hay sesión guardada → se entra directamente (sin pedir código). Si falla la conexión, se reintenta.
    if (session) { try { await afterSignIn(); } catch (e) { console.error(e); renderOffline(e.message); } }
    else renderLogin();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
    // por si se pierde el tiempo real (móvil en reposo): refresco al volver a la app y cada 2 minutos
    // Al volver a la app se recarga (si hace más de 20 s de la última vez); con la app abierta,
    // un repaso cada 2 min (administrador) o 4 min (socios): lo demás llega solo por tiempo real.
    let lastLoad = Date.now();
    const refresh = () => { lastLoad = Date.now(); return reload().then(liveRenderSafe); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden && role && Date.now() - lastLoad > 20000) refresh(); });
    setInterval(() => { if (role && !document.hidden && Date.now() - lastLoad > 60000) refresh(); }, role === 'admin' ? 120000 : 240000);
  };
})();
