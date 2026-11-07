// ============================================================
//  IMAGEN DE MARCA: logo, colores y tema
//  Por defecto: Onlysport Center (llama, negro tinta y blanco hueso)
// ============================================================

const FLAME_PATH = 'M 168.1 92.6 L 158.6 130.4 C 156.9 138.9 157.6 139.5 157.7 143.6 C 157.8 147.8 157.5 150.7 159 155.3 C 160.4 159.9 160.5 163.9 166.3 171.1 C 172.1 178.4 187.4 191.5 193.6 199 C 199.8 206.4 200.7 208.7 203.5 215.9 C 206.3 223 208.9 231.4 210.1 242.1 L 211.2 279.8 L 227.4 252.9 C 231.5 245.1 233.9 239.2 236 233.1 C 238.1 227 239.4 221.8 240 216.4 C 240.5 211 239.8 204.8 239.1 200.6 C 238.3 196.4 237 194.2 235.3 191.1 C 233.6 187.9 234.7 187.9 228.6 181.7 C 222.6 175.6 206.6 161.9 199 154.1 C 191.4 146.2 187.4 141 183.2 134.7 C 179 128.4 176.6 123.2 174 116.2 Z  M 208.7 11.3 L 209.4 34.1 C 209.4 39.1 209.1 38.7 208.3 41.6 C 207.6 44.6 207.7 46.1 204.8 51.7 C 201.8 57.3 193.4 70.3 190.7 75.4 C 188.1 80.5 189.3 79.9 188.9 82.2 C 188.6 84.6 188.4 86.6 188.8 89.6 C 189.2 92.6 189.7 96.1 191.3 100.4 C 192.9 104.6 195.4 109.8 198.5 114.9 C 201.5 120 206 126.3 209.6 130.9 L 219.8 142.6 L 217.7 126.4 C 217.5 120.7 218 113.4 218.8 108.3 C 219.6 103.1 219.9 101.7 222.5 95.7 C 225.1 89.7 232.2 77.3 234.4 72.3 C 236.6 67.4 235.5 68.2 235.6 65.9 C 235.8 63.5 235.8 61 235.3 58.2 C 234.8 55.3 233.7 51.9 232.4 48.6 C 231.1 45.3 229.7 42.4 227.4 38.4 C 225.1 34.4 221.9 29.1 218.8 24.6 Z  M 208.7 11.3';
const flameSVG = (cls = '') => `<svg class="${cls}" viewBox="154.9 9.3 87.6 272.5" aria-hidden="true"><path fill="currentColor" d="${FLAME_PATH}"/></svg>`;

const BRAND_DEFAULT = { logo: null, primary: '#0E0E0D', theme: 'light', subtitle: 'Center' };
const BRAND_PRESETS = [
  ['#0E0E0D', 'Negro Onlysport'], ['#2F5D8A', 'Azul turnos'], ['#6B7A2E', 'Oliva'], ['#9A4B2E', 'Teja'], ['#1F8F4E', 'Verde'], ['#E4572E', 'Naranja'],
];
const brand = () => ({ ...BRAND_DEFAULT, ...(db?.settings?.brand || {}) });

// ---------- Utilidades de color ----------
function hexToRgb(h) { const m = h.replace('#', '').match(/.{2}/g); return m ? m.map(x => parseInt(x, 16)) : [0, 0, 0]; }
function luminance(h) {
  const [r, g, b] = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const inkOn = h => luminance(h) > 0.45 ? '#0E0E0D' : '#FFFFFF';
function mix(h1, h2, t) { const a = hexToRgb(h1), b = hexToRgb(h2); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); }

// ---------- Aplicar la marca a la página ----------
// Preferencia de cada persona en su móvil (Claro / Oscuro / Según el móvil). Manda sobre la del centro.
const THEME_KEY = 'onlysport-theme';
function themePref() { try { const v = localStorage.getItem(THEME_KEY); return ['light', 'dark', 'auto'].includes(v) ? v : null; } catch (e) { return null; } }
function setThemePref(v) { try { v ? localStorage.setItem(THEME_KEY, v) : localStorage.removeItem(THEME_KEY); } catch (e) {} applyBrand(); }
const effectiveTheme = b => themePref() || b.theme;
function applyBrand(b = brand()) {
  const root = document.documentElement;
  const mode = effectiveTheme(b);
  const dark = mode === 'dark' || (mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  // en modo oscuro un color muy oscuro no se vería: se usa el blanco hueso
  const accent = dark && luminance(b.primary) < 0.06 ? '#F3F1EC' : b.primary;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-ink', inkOn(accent));
  root.style.setProperty('--accent-soft', dark ? mix(accent, '#000000', 0.75) : mix(accent, '#FFFFFF', 0.88));
  // color de lo seleccionado en la barra de navegación (siempre sobre negro)
  root.style.setProperty('--nav-accent', luminance(b.primary) < 0.06 ? '#FFFFFF' : (luminance(b.primary) < 0.12 ? mix(b.primary, '#FFFFFF', 0.45) : b.primary));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0E0E0D');
  const fav = document.querySelector('link[rel="icon"]');
  if (fav) fav.href = b.logo || 'icons/icon-192.png';
  if (db?.settings?.centerName) document.title = db.settings.centerName;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (effectiveTheme(brand()) === 'auto') applyBrand(); });

// Logo para la cabecera / login
function brandMark(size = 32) {
  const b = brand();
  if (b.logo) return `<img class="brand-logo" src="${b.logo}" alt="" style="width:${size}px;height:${size}px">`;
  return `<span class="brand-mark" style="width:${size}px;height:${size}px">${flameSVG()}</span>`;
}
function brandName() {
  const name = db.settings.centerName || '';
  const sub = brand().subtitle;
  // "Onlysport Center" con subtítulo "Center" → Onlysport + CENTER pequeño, como en la web
  const main = sub && name.toLowerCase().endsWith(' ' + sub.toLowerCase()) ? name.slice(0, -sub.length - 1) : name;
  return `<span class="brand-text"><b>${esc(main)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>`;
}

// ---------- Subir logo (se reduce a 256 px para que ocupe poco) ----------
function readLogoFile(file) {
  return new Promise((res, rej) => {
    if (!file.type.startsWith('image/')) return rej(new Error('El archivo no es una imagen'));
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('No se pudo leer la imagen'));
    fr.onload = () => {
      if (file.type === 'image/svg+xml') { if (fr.result.length > 300000) return rej(new Error('El SVG es demasiado grande')); return res(fr.result); }
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 256 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/png'));
      };
      img.onerror = () => rej(new Error('Imagen no válida'));
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

// ---------- Sección de Ajustes ----------
function brandSettingsHTML() {
  const b = brand();
  return `
    <div class="page-title" style="margin-top:4px"><h1 style="font-size:18px">Imagen del centro</h1></div>
    <form class="card" data-form="brand">
      <div class="row wrap" style="gap:16px;align-items:flex-start">
        <div class="brand-preview" id="brand-preview">${brandPreview(b)}</div>
        <div class="grow" style="min-width:220px">
          <div class="field"><label>Nombre del centro</label><input name="centerName" required value="${esc(db.settings.centerName)}" data-brand-live></div>
          <div class="field"><label>Texto pequeño bajo el nombre (opcional)</label><input name="subtitle" value="${esc(b.subtitle || '')}" placeholder="p. ej. Center" data-brand-live></div>
        </div>
      </div>
      <div class="field"><label>Logo</label>
        <div class="row wrap">
          <label class="btn">⬆️ Subir logo<input type="file" accept="image/*" id="logo-file" hidden></label>
          <button type="button" class="btn" data-a="logo-default">🔥 Usar la llama de Onlysport</button>
        </div>
        <p class="muted small" style="margin:6px 0 0">PNG, JPG o SVG. Mejor cuadrado y con fondo transparente. Se usa en la cabecera, en la pantalla de entrada y en la pestaña del navegador.</p>
        <input type="hidden" name="logo" value="${b.logo ? 'custom' : ''}">
      </div>
      <div class="field"><label>Color principal</label>
        <div class="row wrap">
          ${BRAND_PRESETS.map(([c, n]) => `<button type="button" class="swatch-btn ${b.primary.toLowerCase() === c.toLowerCase() ? 'on' : ''}" style="--c:${c}" data-a="brand-color" data-c="${c}" title="${n}"></button>`).join('')}
          <input type="color" name="primary" value="${b.primary}" data-brand-live style="width:48px;height:36px;padding:2px;border-radius:8px;border:1px solid var(--border)">
        </div></div>
      <div class="field"><label>Tema</label>
        <div class="tabs" style="margin:0">${[['light', '☀️ Claro'], ['dark', '🌙 Oscuro'], ['auto', '🖥️ Según el móvil']].map(([v, l]) => `<label class="tab-radio"><input type="radio" name="theme" value="${v}" ${b.theme === v ? 'checked' : ''} data-brand-live><span>${l}</span></label>`).join('')}</div></div>
      <div class="row wrap"><button class="btn primary" type="submit">Guardar imagen</button>
        <button type="button" class="btn ghost" data-a="brand-reset">Volver a la imagen de Onlysport</button></div>
    </form>`;
}
function brandPreview(b) {
  const logo = b.logo ? `<img src="${b.logo}" alt="" style="width:30px;height:30px;border-radius:8px;object-fit:contain">` : `<span class="brand-mark" style="width:30px;height:30px">${flameSVG()}</span>`;
  const dark = b.theme === 'dark';
  const accent = dark && luminance(b.primary) < 0.06 ? '#F3F1EC' : b.primary;
  return `<div class="bp-phone ${dark ? 'dark' : ''}">
    <div class="bp-top">${logo}<span><b>${esc(b._name ?? db.settings.centerName)}</b></span></div>
    <div class="bp-body"><div class="bp-card"><b>18:30</b> Funcional<div class="bp-free">5 plazas libres</div></div>
      <div class="bp-btn" style="background:${accent};color:${inkOn(accent)}">Reservar</div></div></div>`;
}
function readBrandForm(form) {
  const f = new FormData(form);
  return { ...brand(), primary: f.get('primary'), theme: f.get('theme'), subtitle: f.get('subtitle').trim(), _name: f.get('centerName') };
}
let pendingLogo; // undefined = sin cambios · null = llama · dataURL = logo subido

function refreshBrandPreview() {
  const form = document.querySelector('[data-form="brand"]'); if (!form) return;
  const b = readBrandForm(form);
  if (pendingLogo !== undefined) b.logo = pendingLogo;
  $('#brand-preview').innerHTML = brandPreview(b);
  document.querySelectorAll('.swatch-btn').forEach(x => x.classList.toggle('on', x.dataset.c.toLowerCase() === b.primary.toLowerCase()));
}

Object.assign(actions, {
  'brand-color': d => { const inp = document.querySelector('[data-form="brand"] [name="primary"]'); inp.value = d.c; refreshBrandPreview(); },
  'logo-default': () => { pendingLogo = null; refreshBrandPreview(); toast('Se usará la llama de Onlysport. Pulsa Guardar.'); },
  'brand-reset': () => {
    db.settings.brand = { ...BRAND_DEFAULT }; pendingLogo = undefined; saveDB(); applyBrand(); render(); toast('Imagen de Onlysport restaurada', 'ok');
  },
});
Object.assign(forms, {
  brand: (f, form) => {
    const b = readBrandForm(form);
    delete b._name;
    if (pendingLogo !== undefined) b.logo = pendingLogo;
    db.settings.brand = b;
    db.settings.centerName = f.get('centerName').trim() || db.settings.centerName;
    pendingLogo = undefined;
    saveDB(); applyBrand(); render(); toast('Imagen del centro guardada', 'ok');
  },
});
document.addEventListener('input', e => { if (e.target.matches('[data-brand-live]')) refreshBrandPreview(); });
document.addEventListener('change', async e => {
  if (e.target.matches('[data-brand-live]')) refreshBrandPreview();
  if (e.target.id === 'logo-file' && e.target.files[0]) {
    try { pendingLogo = await readLogoFile(e.target.files[0]); refreshBrandPreview(); toast('Logo cargado. Pulsa Guardar para aplicarlo.'); }
    catch (err) { toast(err.message, 'err'); }
  }
});

applyBrand();
