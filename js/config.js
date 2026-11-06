// =====================================================================
//  CONEXIÓN CON SUPABASE
//  Rellena estos dos datos (Supabase → Project Settings → API Keys / Data API).
//  Si se dejan vacíos, la app funciona en MODO PRUEBA (datos solo en este navegador).
//  La clave es la PÚBLICA (publishable / anon): está pensada para estar a la vista.
//  Nunca pongas aquí la clave secreta (service_role / Secret key).
// =====================================================================
window.RESERVAS_CONFIG = {
  supabaseUrl: 'https://jxgalzkncsttgjijnpfi.supabase.co',   // p. ej. 'https://abcdefghijkl.supabase.co'
  supabaseKey: 'sb_publishable_40xZJb3lj0kI4rbyLGdqFA_g9qygA1y',   // p. ej. 'sb_publishable_...'
};
