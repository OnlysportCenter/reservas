# Onlysport Center · App de reservas (prototipo)

Inspirada en el funcionamiento de Bookyway, adaptada a Onlysport Center (entrenamiento funcional
en grupos reducidos, Aguilar de la Frontera): turnos fijos de 2 o 3 días por semana.

**Imagen de marca (Ajustes › Imagen del centro):** logo (la llama de Onlysport por defecto, o sube
el tuyo), color principal, tema claro/oscuro/automático, nombre y subtítulo. Tipografías Poppins y
Figtree, como la web. Los datos de ejemplo usan los turnos reales de la web.

## Cómo abrirla
1. Clic derecho en `servidor.ps1` → **Ejecutar con PowerShell**.
2. Abre http://localhost:8080 en el navegador.
3. Entra con una cuenta de prueba (Administrador o un cliente).

## Qué incluye
**App del cliente (móvil, instalable como app):**
- Reservar clases día a día (hasta X días de antelación) viendo las plazas libres
- Lista de espera automática: si alguien cancela, entra el primero y se le avisa
- Cancelar con plazo (si cancela tarde no se devuelve la clase)
- Mis clases (próximas e historial), mi bono (clases restantes y caducidad)
- Tablón de anuncios y notificaciones (recordatorios, cambios, plazas liberadas)

**Panel del administrador:**
- Hoy: resumen, ocupación, clases del día y clientes que requieren atención
- Agenda: ver cualquier día, pasar lista (asistió / no vino), apuntar o quitar clientes,
  cambiar aforo, cancelar clases (avisa y devuelve la clase), clases extra
- Clientes: altas, edición, asignar/renovar bonos, ajustar clases ±1, activar/desactivar
- Clases: tipos de clase (color, entrenador, aforo, duración) y horario semanal recurrente
- Tablón: publicar anuncios (notifica a todos los clientes)
- Ajustes: normas de reserva/cancelación, lista de espera y bonos/tarifas

**Añadido en la versión 2:**
- Admin: apuntar a un cliente a una o varias clases a la vez, o ponerlo en lista de espera,
  eligiendo si se le avisa por correo y/o en la app. Quitarle de clases (también con aviso opcional).
- Admin: ocultar una clase concreta o todo un tipo de clase a los clientes.
- Admin: bloquear clientes por impago (motivo visible para el cliente; opción de quitarle de sus próximas clases).
- Admin: publicación de clases "X días por delante" o "la semana siguiente se publica el día D a la hora H".
- Admin: límite de clases por semana (general y personalizado por cliente).
- Admin: bandeja de correos enviados (simulados en el prototipo).
- Cliente: solo ve la clase, las plazas libres y su número en la lista de espera (nunca nombres de otros).
- Lista de espera por orden de llegada; al entrar desde la lista se avisa por correo y en la app.
- Las pantallas se actualizan solas cuando cambian los datos.

**Añadido en la versión 3 (tarifas semanales):**
- Tarifas "2 días por semana" y "3 días por semana": cada semana (lunes a domingo) el cliente tiene
  esas clases. Lo que no use se pierde al acabar la semana.
- El administrador puede añadir clases extra a una semana concreta o pasar las clases sin usar
  a la semana siguiente (se restan de la semana de origen).
- Máximo una clase al día (se puede desactivar en Ajustes).
- Cancelar a tiempo devuelve la clase para esa semana; cancelar tarde cuenta como gastada.
- Se mantiene el tipo "Bono de X clases" para casos como la clase suelta.

**Añadido en la versión 4 (grupos y cambios):**
- Grupos fijos: en Clases › Horario semanal, pulsa un horario para añadir clientes a su grupo.
  Se les reserva automáticamente cada semana. También se gestiona desde la ficha del cliente.
- El cliente se quita si va a faltar, y puede cambiarse a otra clase con hueco.
- Listas de espera en varias clases a la vez: no gastan clase. Cuenta la primera en la que entre;
  si con ella completa sus clases de la semana (o ya tiene clase ese día) se le quita de las demás.
- Si un cliente se quita de un día concreto de su grupo, no se le vuelve a apuntar ese día.
  Al desbloquear o renovar la cuota se le vuelven a reservar sus grupos.

**Añadido en la versión 5 (importar clientes):**
- Clientes › Importar: sube un Excel (.xlsx), CSV o JSON con tus clientes (p. ej. exportado de Bookyway).
- Detecta solas las columnas (nombre, apellidos, email, teléfono, tarifa, horarios, fin de cuota) y
  se pueden corregir a mano. Asocia cada valor de tarifa del archivo a una tarifa de la app.
- Si hay columna de horarios ("Lunes y Miércoles 19:00", "L-X-V 18:00", "mar/jue 7.00"…), mete a
  cada cliente en sus grupos fijos y le reserva las clases automáticamente.
- Vista previa antes de importar: nuevos, actualizados (mismo email), errores, horarios que no
  existen y grupos que superarían el aforo. Plantilla CSV de ejemplo descargable.
- Para leer Excel hace falta internet (se carga un lector externo). Sin internet, guarda como CSV.

**Ajustes para la exportación de Bookyway (BookyWayMembers.xlsx):**
- Reconoce sus columnas (Nombre, Apellido, E-mail, Alias, Teléfono, Vencimiento Suscripción, Deuda, Email inválido).
- "Usuario 2", "Usuario 7"… se importan con el nombre real de la columna Alias.
- La fila del administrador (alias "Administrador") no se importa. Opción de bloquear a los que tienen deuda.
- Bookyway no exporta tarifas ni horarios: después se asignan en bloque.
  - Clientes › ☑️ Seleccionar: filtrar (sin tarifa, sin grupo…), marcar varios y asignar tarifa / bloquear.
  - Clases › Horario semanal › (horario): buscar y marcar varios clientes para meterlos en el grupo.

**Cuota pendiente y nuevos en espera:**
- Ficha del cliente (o Clientes › Seleccionar): «Cuota pendiente». El cliente ve un aviso con
  «Sí, sigo» / «Me doy de baja» y su respuesta sale en Hoy. No bloquea las reservas. «Marcar como pagada» lo quita.
- Clientes › «Nuevos en espera»: lista (solo administrador) de personas que preguntan por plaza,
  con nombre, apellidos, teléfono y correo, por orden de llegada. «Dar de alta» la convierte en cliente.

**Temporada y antelación:**
- Cada turno tiene temporada (desde / hasta, por meses) y, opcional, sus propios días de antelación
  para los socios. Clases › Horario semanal › «Temporada de todos los turnos» la pone a todos.
- Clases › «Calendario de la temporada»: semana a semana hasta el final de la temporada. Las clases
  lejanas salen como «previstas» y se crean al abrirlas (o solas cuando se acercan).
- Ajustes › «Días que ven los socios por delante»: cada día aparece uno más (14 = como Bookyway).

**Colores por turno:** cada turno (misma hora) puede tener su color; se elige al crearlo o en su
ficha («Todos los días de las 19:30»). Clases › «Un color por turno» los reparte automáticamente.
Se ve en el horario, el calendario, la agenda y la app de los socios.

## Modo servidor (Supabase + GitHub Pages + Gmail)
- Si `js/config.js` tiene la dirección y la clave pública de Supabase, la app usa el servidor:
  clientes entran con un código de 6 cifras al email; el administrador con email y contraseña.
- Las reglas (plazas, lista de espera, clases por semana, una al día, bloqueos) las comprueba el
  servidor (`supabase-reservas/1-base-de-datos.sql`). Los clientes solo ven sus reservas y el número
  de plazas libres.
- La carpeta `D:\CLAUDE\supabase-reservas` (SQL, función de correos, plantillas) NUNCA se sube a GitHub.
- Guía paso a paso: "Guía: poner online Onlysport Reservas" (Claude Docs).
- Con `config.js` vacío, la app sigue funcionando en modo prueba (datos en el navegador).

## Limitaciones del prototipo
- Los datos se guardan en el navegador (cada dispositivo ve los suyos). Para que
  clientes y administrador compartan datos hace falta un servidor/base de datos.
- No hay contraseñas todavía. Las notificaciones son dentro de la app (no push al móvil).

Toda la lógica de datos está en `js/store.js` para poder cambiarla por un servidor real
sin rehacer las pantallas.
