// app.js — fix-11 (contactenlijst: vakmensen, leveranciers en instanties)
// Onze Woning: huishandleiding met ruimtes, apparaten, uitleg, onderhoud, papieren en noodkaart.
import {
  db, isConfigured, loginGoogle, loginEmail, registreerEmail, wachtwoordVergeten, uitloggen, bijInlogWijziging
} from './firebase.js';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const VERSIE = 'fix-11';
const COLLS = ['ruimtes', 'items', 'onderhoud', 'historie', 'papieren'];
const D = { ruimtes: [], items: [], onderhoud: [], historie: [], papieren: [], nood: null, contacten: [] };
let contactenGeblokkeerd = false; // fix-11: database-regels nog niet bijgewerkt

let opslag = null;      // cloud (Firestore) of demo (alleen dit apparaat)
let gebruiker = null;
let klaar = false;
let zoekterm = '';
let papierFilter = 'Alles';
let view = null;
let navLinks = {};

const appEl = document.getElementById('app');

/* ---------- Iconen (vaste, eigen SVG's) ---------- */
const ICONS = {
  terug: '<path d="M15 5l-7 7 7 7"/>',
  zoek: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  let_op: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  huis: '<path d="M3 11l9-7 9 7v9H3z"/><path d="M9 20v-6h6v6"/>',
  moersleutel: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z"/>',
  papier: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
  meer: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  potlood: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  vink: '<path d="M5 12l5 5 9-10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  schild: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  slot: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  telefoon: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  kruis: '<path d="M6 6l12 12M18 6L6 18"/>',
  omhoog: '<path d="M6 15l6-6 6 6"/>',
  omlaag: '<path d="M6 9l6 6 6-6"/>',
  prullenbak: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  uit: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  persoon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/>',
  rechts: '<path d="M9 5l7 7-7 7"/>',
  greep: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  schuif: '<path d="M8 20V4M4 8l4-4 4 4M16 4v16M12 16l4 4 4-4"/>',
  importeer: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  wereld: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
};
function ico(naam, maat = 22) {
  const s = document.createElement('span');
  s.className = 'ico';
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<svg width="${maat}" height="${maat}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[naam] || ''}</svg>`;
  return s;
}

/* ---------- Kleine helpers ---------- */
let teller = 0;
const nieuwId = (p) => `${p}-${++teller}`;

// Bouwt veilig DOM-elementen: tekst gaat altijd als tekst, nooit als HTML.
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

// Zoals replaceChildren, maar slaat lege waarden (null/false) over
function vervang(ouder, ...kids) {
  ouder.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const opNaam = (a, b) => String(a.naam || '').localeCompare(String(b.naam || ''), 'nl');

function veiligeLink(u) {
  try {
    const x = new URL(String(u || '').trim());
    return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : null;
  } catch { return null; }
}
function telLink(t) {
  const n = String(t || '').replace(/[^0-9+]/g, '');
  return n.length >= 3 ? `tel:${n}` : null;
}

function melding(tekst, fout = false) {
  const m = el('div', { class: fout ? 'melding melding-fout' : 'melding' }, tekst);
  document.getElementById('meldingen').append(m);
  setTimeout(() => m.remove(), fout ? 6000 : 3000);
}
function meldFout(err) {
  console.error(err);
  const code = err && err.code ? String(err.code) : '';
  let tekst = (err && err.message) || 'Er ging iets mis.';
  if (code.includes('permission-denied')) tekst = 'Geen toegang. Ben je als lid toegevoegd?';
  if (code.includes('unavailable')) tekst = 'Geen verbinding. Wijzigingen worden later verstuurd.';
  melding(tekst, true);
}

/* ---------- Datums ---------- */
function vandaagStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDatum(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function plusMaanden(datum, n) {
  const r = new Date(datum);
  const dag = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  const max = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(dag, max));
  return r;
}
function fmtDatum(s) {
  const d = typeof s === 'string' ? parseDatum(s) : s;
  return d ? d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

const INTERVALLEN = [[1, 'Elke maand'], [3, 'Elke 3 maanden'], [6, 'Elk half jaar'], [12, 'Elk jaar'], [24, 'Elke 2 jaar'], [36, 'Elke 3 jaar'], [60, 'Elke 5 jaar']];
const intervalLabel = (m) => (INTERVALLEN.find(([n]) => n === Number(m)) || [0, `Elke ${m} maanden`])[1];

function taakStatus(t) {
  if (!t.laatst || !parseDatum(t.laatst)) return { soort: 'nooit', label: 'Nog niet gedaan', dagen: -1e6 };
  const vandaag = parseDatum(vandaagStr());
  const due = plusMaanden(parseDatum(t.laatst), Number(t.intervalMaanden) || 12);
  const dagen = Math.round((due - vandaag) / 864e5);
  if (dagen < 0) {
    const n = -dagen;
    const label = n < 14 ? `${n} ${n === 1 ? 'dag' : 'dagen'} over tijd` : n < 60 ? `${Math.round(n / 7)} wk over tijd` : `${Math.round(n / 30)} mnd over tijd`;
    return { soort: 'laat', label, dagen, due };
  }
  if (dagen <= 30) return { soort: 'binnenkort', label: dagen === 0 ? 'vandaag' : `over ${dagen} ${dagen === 1 ? 'dag' : 'dagen'}`, dagen, due };
  return { soort: 'later', label: due.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' }), dagen, due };
}

/* ---------- Opzoeken ---------- */
const ruimteVan = (id) => D.ruimtes.find((r) => r.id === id);
const itemVan = (id) => D.items.find((i) => i.id === id);
const ruimteNaam = (id) => (ruimteVan(id) || {}).naam || 'Zonder ruimte';
const opVolgorde = (a, b) => (a.volgorde ?? 0) - (b.volgorde ?? 0) || opNaam(a, b);
const itemsIn = (rid) => D.items.filter((i) => i.ruimteId === rid).sort(opVolgorde);
// Nieuw komt achteraan, ook als oudere kaartjes nog geen volgorde hebben
const volgendNummer = (lijst) => Math.max(lijst.length, lijst.reduce((m, x) => Math.max(m, Number(x.volgorde) || 0), 0)) + 1;
const takenVan = (iid) => D.onderhoud.filter((t) => t.itemId === iid);
const gesorteerdeRuimtes = () => [...D.ruimtes].sort(opVolgorde);
function voornaam() {
  if (opslag && opslag.soort === 'demo') return 'daar';
  const n = (gebruiker && (gebruiker.displayName || gebruiker.email)) || '';
  return n.split(/[\s@]/)[0] || 'daar';
}

/* ---------- Foto's ---------- */
const fotoCache = new Map();
const dataUrl = (b64) => `data:image/jpeg;base64,${b64}`;
function laadFoto(id) {
  if (!fotoCache.has(id)) {
    const p = opslag.fotoLaden(id).then((b64) => (b64 ? dataUrl(b64) : null));
    p.catch(() => fotoCache.delete(id));
    fotoCache.set(id, p);
  }
  return fotoCache.get(id);
}
function fotoImg(id, alt, cls = 'stapfoto') {
  const img = el('img', { alt: alt || '', class: cls, decoding: 'async' });
  laadFoto(id).then((src) => { if (src) img.src = src; }).catch(() => {});
  return img;
}
function klikbareFoto(id, alt, cls) {
  return el('button', { type: 'button', class: 'fotoknop', 'aria-label': `Foto vergroten: ${alt || 'foto'}`, onclick: () => fotoTonen(id, alt) }, fotoImg(id, alt, cls));
}

// Verkleint een foto in de browser tot een kleine JPEG (past ruim in één database-document)
async function verkleinFoto(bestand) {
  if (!bestand.type.startsWith('image/')) throw new Error('Kies een foto (afbeelding).');
  let bron;
  let tijdelijk = null;
  try {
    bron = await createImageBitmap(bestand, { imageOrientation: 'from-image' });
  } catch {
    tijdelijk = URL.createObjectURL(bestand);
    bron = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Deze foto kan niet worden gelezen.'));
      i.src = tijdelijk;
    });
  }
  try {
    const bw = bron.width, bh = bron.height;
    for (const max of [1280, 1024, 800]) {
      const s = Math.min(1, max / Math.max(bw, bh));
      const w = Math.round(bw * s), h = Math.round(bh * s);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(bron, 0, 0, w, h);
      for (const q of [0.78, 0.66, 0.55]) {
        const url = c.toDataURL('image/jpeg', q);
        const b64 = url.slice(url.indexOf(',') + 1);
        if (b64.length < 850000) return { b64, w, h };
      }
    }
    throw new Error('Deze foto is te groot.');
  } finally {
    if (tijdelijk) URL.revokeObjectURL(tijdelijk);
  }
}

// Houdt bij welke foto's in een bewerkscherm zijn toegevoegd/weggehaald,
// zodat er bij Annuleren of Opslaan geen losse foto's achterblijven.
function fotoTracker() {
  const nieuw = new Set(), weg = new Set();
  const wis = (id) => { opslag.fotoVerwijderen(id); fotoCache.delete(id); };
  return {
    nieuw, weg,
    bevestig() { weg.forEach(wis); },
    terugdraaien() { nieuw.forEach(wis); }
  };
}

function fotoVeld({ fotoId, tracker, onWijzig, label = 'Foto' }) {
  const w = el('div', { class: 'fotoveld' });
  let huidig = fotoId || null;
  const invoer = el('input', { type: 'file', accept: 'image/*', class: 'sr', tabindex: '-1', 'aria-hidden': 'true' });
  invoer.addEventListener('change', async () => {
    const f = invoer.files && invoer.files[0];
    invoer.value = '';
    if (!f) return;
    w.classList.add('bezig');
    try {
      const { b64, w: fw, h: fh } = await verkleinFoto(f);
      const id = opslag.fotoOpslaan(b64, fw, fh);
      fotoCache.set(id, Promise.resolve(dataUrl(b64)));
      tracker.nieuw.add(id);
      if (huidig) tracker.weg.add(huidig);
      huidig = id;
      onWijzig(id);
      teken();
    } catch (e) { meldFout(e); } finally { w.classList.remove('bezig'); }
  });
  function teken() {
    vervang(w,
      invoer,
      huidig ? fotoImg(huidig, label, 'fotoveld-img') : null,
      el('div', { class: 'rij' },
        el('button', { type: 'button', class: 'knop knop-rand knop-klein', onclick: () => invoer.click() },
          ico('camera', 18), huidig ? 'Andere foto' : `${label} toevoegen`),
        huidig ? el('button', {
          type: 'button', class: 'knop knop-tekst knop-klein',
          onclick: () => { tracker.weg.add(huidig); huidig = null; onWijzig(null); teken(); }
        }, 'Foto weghalen') : null)
    );
  }
  teken();
  return w;
}

/* ---------- PDF's (fix-6) ---------- */
const PDF_DEEL = 600 * 1024;              // bytes per stukje (past ruim in één database-document)
const PDF_MAX = 20 * 1024 * 1024;         // max 20 MB per PDF
const PDF_CACHE = 'ow-pdf-v1';            // offline kopieën op dit apparaat

function naarB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function vanB64(b) {
  const s = atob(b);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
const fmtMB = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} kB` : `${(n / 1024 / 1024).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} MB`);
const aantalPdf = (n) => `${n} PDF${n === 1 ? '' : "'s"}`;
const pdfSleutel = (id) => new Request(new URL(`./__pdf/${encodeURIComponent(id)}`, document.baseURI).href);
async function pdfCache() {
  try { return 'caches' in window ? await caches.open(PDF_CACHE) : null; } catch { return null; }
}
async function pdfIsOffline(id) {
  const c = await pdfCache();
  return !!(c && await c.match(pdfSleutel(id)));
}
async function pdfBlob(meta, voortgang) {
  const c = await pdfCache();
  if (c) {
    const hit = await c.match(pdfSleutel(meta.id));
    if (hit) return hit.blob();
  }
  const delen = [];
  for (let i = 0; i < meta.delen; i++) {
    delen.push(vanB64(await opslag.bestandDeelLaden(meta.id, i)));
    if (voortgang) voortgang(i + 1, meta.delen);
  }
  const blob = new Blob(delen, { type: 'application/pdf' });
  if (c) { try { await c.put(pdfSleutel(meta.id), new Response(blob, { headers: { 'Content-Type': 'application/pdf' } })); } catch { /* opslag vol */ } }
  return blob;
}
async function pdfUitCache(id) {
  const c = await pdfCache();
  if (c) { try { await c.delete(pdfSleutel(id)); } catch { /* niets */ } }
}
function pdfVerwijderen(meta) {
  if (!meta) return;
  opslag.bestandVerwijderen(meta);
  pdfUitCache(meta.id);
}

// fix-9: PDF in de app tonen met pdf.js (staat in lib/pdfjs, werkt dus ook offline).
// Chrome op Android kan geen PDF in een pagina tonen en downloadt hem anders.
let pdfjsBelofte = null;
function laadPdfjs() {
  if (!pdfjsBelofte) {
    pdfjsBelofte = import('./lib/pdfjs/pdf.min.mjs').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('./lib/pdfjs/pdf.worker.min.mjs', document.baseURI).href;
      return lib;
    }).catch((e) => { pdfjsBelofte = null; throw e; });
  }
  return pdfjsBelofte;
}

async function pdfOpenen(meta, titel) {
  const naam = titel || meta.naam;
  const terugKnop = el('button', { type: 'button', class: 'icoonknop', 'aria-label': 'Terug' }, ico('terug'));
  const pagInfo = el('span', { class: 'pdf-pag', 'aria-live': 'polite' }, '');
  const zoomUit = el('button', { type: 'button', class: 'icoonknop pdf-zoom', 'aria-label': 'Uitzoomen', disabled: true }, '−');
  const zoomIn = el('button', { type: 'button', class: 'icoonknop pdf-zoom', 'aria-label': 'Inzoomen', disabled: true }, '+');
  const download = el('a', { class: 'icoonknop', 'aria-label': 'PDF downloaden', title: 'Downloaden', hidden: true }, ico('importeer'));
  const status = el('p', { class: 'pdf-status', role: 'status' }, 'PDF wordt geladen…');
  const blad = el('div', { class: 'pdf-blad' });
  const scroller = el('div', { class: 'pdf-scroll' }, status, blad);
  const kader = el('div', { class: 'pdf-kijker', role: 'dialog', 'aria-modal': 'true', 'aria-label': naam },
    el('div', { class: 'pdf-kop' }, terugKnop, el('span', { class: 'pdf-titel' }, naam), pagInfo, zoomUit, zoomIn, download),
    scroller);

  let url = null, docPdf = null, taak = null, gesloten = false, waarnemer = null, opResize = null;
  const vorigeFocus = document.activeElement;
  document.body.append(kader);
  document.body.classList.add('pdf-open');
  terugKnop.focus();
  history.pushState({ pdfKijker: true }, '');
  const opPop = () => sluit(true);
  window.addEventListener('popstate', opPop);
  const opToets = (e) => { if (e.key === 'Escape') { e.preventDefault(); terugKnop.click(); } };
  document.addEventListener('keydown', opToets);
  function sluit(viaHistorie) {
    if (gesloten) return;
    gesloten = true;
    window.removeEventListener('popstate', opPop);
    document.removeEventListener('keydown', opToets);
    if (waarnemer) waarnemer.disconnect();
    if (opResize) window.removeEventListener('resize', opResize);
    if (taak) { try { taak.destroy(); } catch { /* al weg */ } }
    if (url) setTimeout(() => URL.revokeObjectURL(url), 60000);
    kader.remove();
    document.body.classList.remove('pdf-open');
    if (!viaHistorie && history.state && history.state.pdfKijker) history.back();
    if (vorigeFocus && vorigeFocus.focus) vorigeFocus.focus();
  }
  terugKnop.addEventListener('click', () => sluit(false));

  let bytes;
  try {
    const blob = await pdfBlob(meta, (i, n) => { status.textContent = `PDF wordt geladen… ${i} van ${n}`; });
    if (gesloten) return;
    url = URL.createObjectURL(blob);
    download.href = url; download.download = meta.naam || 'document.pdf'; download.hidden = false;
    bytes = new Uint8Array(await blob.arrayBuffer());
  } catch (e) {
    status.textContent = navigator.onLine ? `Laden lukte niet: ${e.message || e}` : 'Deze PDF staat nog niet offline op dit apparaat. Open hem een keer met internet.';
    return;
  }

  try {
    const lib = await laadPdfjs();
    taak = lib.getDocument({
      data: bytes, isEvalSupported: false,
      standardFontDataUrl: new URL('./lib/pdfjs/standard_fonts/', document.baseURI).href
    });
    docPdf = await taak.promise;
  } catch (e) {
    if (gesloten) return;
    vervang(status, 'Deze PDF kan hier niet getoond worden. ',
      el('a', { href: url, download: meta.naam || 'document.pdf' }, 'Download hem'), ' en open hem met een andere app.');
    return;
  }
  if (gesloten) return;
  status.remove();

  const n = docPdf.numPages;
  const eerste = await docPdf.getPage(1);
  const basis = eerste.getViewport({ scale: 1 });
  const verhouding = basis.height / basis.width;
  let zoom = 1;
  const ZOOMS = [1, 1.5, 2, 3];
  const paginas = [];
  for (let i = 1; i <= n; i++) {
    const p = el('div', { class: 'pdf-pagina', 'data-nr': String(i), 'aria-label': `Bladzijde ${i}` });
    p.style.aspectRatio = `1 / ${verhouding}`;
    paginas.push({ el: p, getekend: 0, bezig: false });
    blad.append(p);
  }
  pagInfo.textContent = `blz. 1 / ${n}`;

  const breedte = () => Math.max(200, scroller.clientWidth - 16) * zoom;
  async function teken(idx) {
    const pg = paginas[idx];
    if (pg.bezig || pg.getekend === zoom || gesloten) return;
    pg.bezig = true;
    try {
      const page = idx === 0 ? eerste : await docPdf.getPage(idx + 1);
      const vp1 = page.getViewport({ scale: 1 });
      pg.el.style.aspectRatio = `${vp1.width} / ${vp1.height}`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const css = breedte();
      const vp = page.getViewport({ scale: (css / vp1.width) * dpr });
      const doek = document.createElement('canvas');
      doek.width = Math.floor(vp.width); doek.height = Math.floor(vp.height);
      await page.render({ canvas: doek, canvasContext: doek.getContext('2d'), viewport: vp }).promise;
      if (gesloten) return;
      pg.el.replaceChildren(doek);
      pg.getekend = zoom;
    } catch { /* volgende keer opnieuw proberen */ } finally { pg.bezig = false; }
  }
  const zichtbaar = new Set();
  waarnemer = new IntersectionObserver((ents) => {
    ents.forEach((en) => {
      const idx = Number(en.target.dataset.nr) - 1;
      if (en.isIntersecting) { zichtbaar.add(idx); teken(idx); } else zichtbaar.delete(idx);
    });
  }, { root: scroller, rootMargin: '800px 0px' });
  paginas.forEach((p) => waarnemer.observe(p.el));

  scroller.addEventListener('scroll', () => {
    const midden = scroller.scrollTop + scroller.clientHeight / 3;
    let nr = 1;
    for (const p of paginas) { if (p.el.offsetTop <= midden) nr = Number(p.el.dataset.nr); else break; }
    pagInfo.textContent = `blz. ${nr} / ${n}`;
  }, { passive: true });

  function zetZoom(z) {
    const oud = zoom;
    zoom = Math.min(3, Math.max(1, z));
    if (zoom === oud) return;
    const relY = scroller.scrollTop / Math.max(1, scroller.scrollHeight);
    blad.style.width = `${breedte()}px`;
    scroller.scrollTop = relY * scroller.scrollHeight;
    zoomUit.disabled = zoom <= 1; zoomIn.disabled = zoom >= 3;
    zichtbaar.forEach(teken);
  }
  zoomIn.disabled = false;
  zoomIn.addEventListener('click', () => zetZoom(ZOOMS.find((z) => z > zoom + 0.01) || 3));
  zoomUit.addEventListener('click', () => zetZoom([...ZOOMS].reverse().find((z) => z < zoom - 0.01) || 1));
  blad.style.width = `${breedte()}px`;

  // Knijpen met twee vingers: tijdens het knijpen alleen vergroten (snel), daarna scherp opnieuw tekenen.
  let knijpStart = 0;
  const afstand = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  scroller.addEventListener('touchstart', (e) => { if (e.touches.length === 2) knijpStart = afstand(e.touches); }, { passive: true });
  scroller.addEventListener('touchmove', (e) => {
    if (knijpStart && e.touches.length === 2) {
      e.preventDefault();
      const f = Math.min(3 / zoom, Math.max(1 / zoom, afstand(e.touches) / knijpStart));
      blad.style.transformOrigin = 'top left';
      blad.style.transform = `scale(${f})`;
    }
  }, { passive: false });
  scroller.addEventListener('touchend', (e) => {
    if (!knijpStart || e.touches.length) return;
    const m = /scale\(([\d.]+)\)/.exec(blad.style.transform);
    const f = m ? Number(m[1]) : 1;
    blad.style.transform = '';
    knijpStart = 0;
    zetZoom(Math.round(zoom * f * 4) / 4);
  });
  let resizeTimer = 0;
  opResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (gesloten) return; blad.style.width = `${breedte()}px`; paginas.forEach((p) => { p.getekend = 0; }); zichtbaar.forEach(teken); }, 200);
  };
  window.addEventListener('resize', opResize);
}

function pdfTracker() {
  const nieuw = [], weg = [];
  return {
    nieuw, weg,
    bevestig() { weg.forEach(pdfVerwijderen); },
    terugdraaien() { nieuw.forEach(pdfVerwijderen); }
  };
}

function pdfVeld({ bestand, tracker, onWijzig }) {
  const w = el('div', { class: 'fotoveld' });
  let huidig = bestand || null;
  let bezig = '';
  const invoer = el('input', { type: 'file', accept: 'application/pdf,.pdf', class: 'sr', tabindex: '-1', 'aria-hidden': 'true' });
  invoer.addEventListener('change', async () => {
    const f = invoer.files && invoer.files[0];
    invoer.value = '';
    if (!f) return;
    if (f.size > PDF_MAX) { melding(`Deze PDF is te groot (${fmtMB(f.size)}). Maximaal ${fmtMB(PDF_MAX)}.`, true); return; }
    if (opslag.soort === 'cloud' && !navigator.onLine) { melding('Voor het toevoegen van een PDF heb je internet nodig.', true); return; }
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') { melding('Dit is geen PDF-bestand.', true); return; }
      bezig = 'Opslaan…'; teken();
      const meta = await opslag.bestandOpslaan(f.name.slice(0, 120), bytes, (i, n) => { bezig = `Opslaan… ${i} van ${n}`; teken(); });
      tracker.nieuw.push(meta);
      if (huidig) tracker.weg.push(huidig);
      huidig = meta;
      onWijzig(meta);
      // meteen offline beschikbaar op dit apparaat
      const c = await pdfCache();
      if (c) { try { await c.put(pdfSleutel(meta.id), new Response(new Blob([bytes], { type: 'application/pdf' }), { headers: { 'Content-Type': 'application/pdf' } })); } catch { /* vol */ } }
    } catch (e) { meldFout(e); }
    bezig = '';
    teken();
  });
  function teken() {
    vervang(w, invoer,
      bezig ? el('p', { class: 'veld-hint', role: 'status' }, bezig) : null,
      !bezig && huidig ? el('div', { class: 'kaart kaart-p rij' }, el('span', { class: 'doc-ico', 'aria-hidden': 'true' }, 'PDF'),
        el('span', { class: 'lijst-tekst' }, el('span', { class: 'lijst-titel' }, huidig.naam), el('span', { class: 'lijst-sub' }, fmtMB(huidig.grootte)))) : null,
      !bezig ? el('div', { class: 'rij' },
        el('button', { type: 'button', class: 'knop knop-rand knop-klein', onclick: () => invoer.click() }, ico('papier', 18), huidig ? 'Andere PDF' : 'PDF toevoegen'),
        huidig ? el('button', { type: 'button', class: 'knop knop-tekst knop-klein', onclick: () => { tracker.weg.push(huidig); huidig = null; onWijzig(null); teken(); } }, 'PDF weghalen') : null) : null);
  }
  teken();
  return w;
}

async function allesOffline() {
  const lijst = D.papieren.filter((p) => p.bestand && p.bestand.id);
  if (!lijst.length) { melding('Er zijn nog geen PDF\'s toegevoegd.'); return; }
  const totaal = lijst.reduce((s, p) => s + (p.bestand.grootte || 0), 0);
  if (!await bevestig(`${aantalPdf(lijst.length)}, samen ${fmtMB(totaal)}, op dit apparaat bewaren?`, 'Bewaren')) return;
  let ok = 0, fout = 0;
  for (const p of lijst) {
    try { await pdfBlob(p.bestand); ok++; } catch { fout++; }
  }
  melding(fout ? `${ok} bewaard, ${fout} lukte niet. Heb je internet?` : `Klaar: ${aantalPdf(ok)} offline op dit apparaat.`, !!fout);
}

/* ---------- Opslag: cloud (Firestore) ---------- */
function cloudOpslag() {
  const stempel = () => ({ gewijzigd: serverTimestamp() });
  return {
    soort: 'cloud',
    start(bijWijziging) {
      const geladen = new Set();
      COLLS.forEach((c) => onSnapshot(collection(db, c), (s) => {
        D[c] = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        geladen.add(c);
        if (geladen.size === COLLS.length) klaar = true;
        bijWijziging();
      }, meldFout));
      onSnapshot(doc(db, 'instellingen', 'noodkaart'), (s) => {
        D.nood = s.exists() ? s.data() : null;
        bijWijziging();
      }, meldFout);
      // fix-11: contacten apart, zodat de app ook werkt als de database-regels nog niet zijn bijgewerkt
      onSnapshot(collection(db, 'contacten'), (s) => {
        contactenGeblokkeerd = false;
        D.contacten = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        bijWijziging();
      }, (err) => {
        if (err && String(err.code || '').includes('permission-denied')) { contactenGeblokkeerd = true; bijWijziging(); }
        else meldFout(err);
      });
    },
    // Schrijven zonder te wachten: werkt ook offline, Firestore verstuurt later.
    add(c, data) {
      const r = doc(collection(db, c));
      setDoc(r, { ...data, gemaakt: serverTimestamp(), ...stempel() }).catch(meldFout);
      return r.id;
    },
    update(c, id, patch) { updateDoc(doc(db, c, id), { ...patch, ...stempel() }).catch(meldFout); },
    remove(c, id) { deleteDoc(doc(db, c, id)).catch(meldFout); },
    removeMany(lijst) {
      for (let i = 0; i < lijst.length; i += 400) {
        const b = writeBatch(db);
        lijst.slice(i, i + 400).forEach(([c, id]) => b.delete(doc(db, c, id)));
        b.commit().catch(meldFout);
      }
    },
    setNood(data) { setDoc(doc(db, 'instellingen', 'noodkaart'), { ...data, ...stempel() }).catch(meldFout); },
    fotoOpslaan(b64, w, h) {
      const r = doc(collection(db, 'fotos'));
      setDoc(r, { mime: 'image/jpeg', data: b64, w, h, gemaakt: serverTimestamp() }).catch(meldFout);
      return r.id;
    },
    async fotoLaden(id) {
      const s = await getDoc(doc(db, 'fotos', id));
      return s.exists() ? s.data().data : null;
    },
    fotoVerwijderen(id) { deleteDoc(doc(db, 'fotos', id)).catch(meldFout); },
    // fix-6: PDF's, in stukjes in de database (geen betaalde bestandsopslag nodig)
    async bestandOpslaan(naam, bytes, voortgang) {
      const id = doc(collection(db, 'bestanden')).id;
      const delen = Math.ceil(bytes.length / PDF_DEEL);
      for (let i = 0; i < delen; i++) {
        await setDoc(doc(db, 'bestanddelen', `${id}_${i}`), { bestandId: id, nr: i, data: naarB64(bytes.subarray(i * PDF_DEEL, (i + 1) * PDF_DEEL)) });
        voortgang(i + 1, delen);
      }
      await setDoc(doc(db, 'bestanden', id), { naam, type: 'application/pdf', grootte: bytes.length, delen, gemaakt: serverTimestamp() });
      return { id, naam, grootte: bytes.length, delen };
    },
    async bestandDeelLaden(id, nr) {
      const s = await getDoc(doc(db, 'bestanddelen', `${id}_${nr}`));
      if (!s.exists()) throw new Error('Een deel van de PDF ontbreekt.');
      return s.data().data;
    },
    bestandVerwijderen(meta) {
      const b = writeBatch(db);
      for (let i = 0; i < (meta.delen || 0); i++) b.delete(doc(db, 'bestanddelen', `${meta.id}_${i}`));
      b.delete(doc(db, 'bestanden', meta.id));
      b.commit().catch(meldFout);
    }
  };
}

/* ---------- Opslag: demo (alleen op dit apparaat) ---------- */
const DEMO_SLEUTEL = 'onzewoning-demo-v1';
const demoBestanden = new Map(); // fix-6: PDF's in de demo alleen in het geheugen
function demoOpslag() {
  let st = null;
  try { st = JSON.parse(localStorage.getItem(DEMO_SLEUTEL)); } catch { st = null; }
  if (!st || !Array.isArray(st.items)) st = demoGegevens();
  if (!Array.isArray(st.contacten)) st.contacten = []; // fix-11
  const fotos = new Map(Object.entries(st.fotos || {}));
  let bijWijziging = () => {};
  let fotoWaarschuwing = false;
  const id = () => Math.random().toString(36).slice(2, 12);
  function bewaar() {
    try {
      localStorage.setItem(DEMO_SLEUTEL, JSON.stringify({ ...st, fotos: Object.fromEntries(fotos) }));
    } catch {
      try { localStorage.setItem(DEMO_SLEUTEL, JSON.stringify({ ...st, fotos: {} })); } catch { /* vol */ }
      if (!fotoWaarschuwing) { fotoWaarschuwing = true; melding('In de demo worden foto\'s niet bewaard na herladen.'); }
    }
  }
  function sync() {
    COLLS.forEach((c) => { D[c] = st[c].map((x) => ({ ...x })); });
    D.nood = st.nood ? JSON.parse(JSON.stringify(st.nood)) : null;
    D.contacten = st.contacten.map((x) => ({ ...x }));
    klaar = true;
    bewaar();
    bijWijziging();
  }
  return {
    soort: 'demo',
    start(cb) { bijWijziging = cb; sync(); },
    add(c, data) { const n = id(); st[c].push({ id: n, ...JSON.parse(JSON.stringify(data)) }); sync(); return n; },
    update(c, i, p) { const x = st[c].find((y) => y.id === i); if (x) Object.assign(x, JSON.parse(JSON.stringify(p))); sync(); },
    remove(c, i) { st[c] = st[c].filter((y) => y.id !== i); sync(); },
    removeMany(lijst) {
      lijst.forEach(([c, i]) => { if (c === 'fotos') fotos.delete(i); else st[c] = st[c].filter((y) => y.id !== i); });
      sync();
    },
    setNood(d) { st.nood = JSON.parse(JSON.stringify(d)); sync(); },
    fotoOpslaan(b64) { const n = id(); fotos.set(n, b64); bewaar(); return n; },
    async fotoLaden(i) { return fotos.get(i) || null; },
    fotoVerwijderen(i) { fotos.delete(i); bewaar(); },
    async bestandOpslaan(naam, bytes, voortgang) {
      const n = id();
      const delen = [];
      for (let i = 0; i < Math.ceil(bytes.length / PDF_DEEL); i++) delen.push(naarB64(bytes.subarray(i * PDF_DEEL, (i + 1) * PDF_DEEL)));
      demoBestanden.set(n, delen);
      voortgang(delen.length, delen.length);
      return { id: n, naam, grootte: bytes.length, delen: delen.length };
    },
    async bestandDeelLaden(i, nr) {
      const d = demoBestanden.get(i);
      if (!d) throw new Error('In de demo worden PDF\'s niet bewaard na herladen.');
      return d[nr];
    },
    bestandVerwijderen(meta) { demoBestanden.delete(meta.id); }
  };
}

function standaardNoodkaart() {
  return {
    blokken: [
      { titel: 'Water lekt', tekst: 'Draai de hoofdkraan dicht. Die zit [waar?].', fotoId: null },
      { titel: 'Stroom valt uit', tekst: 'Kijk in de groepenkast. Staat er een knopje naar beneden? Zet het weer omhoog. Gaat hij meteen weer uit? Laat hem dan uit en bel de elektricien.', fotoId: null },
      { titel: 'Je ruikt gas', tekst: 'Ramen en deuren open. Geen licht aan- of uitdoen. Draai de gaskraan dicht, ga naar buiten en bel 0800-9009.', fotoId: null }
    ],
    contacten: [{ naam: 'Buren', telefoon: '' }, { naam: 'Loodgieter', telefoon: '' }, { naam: 'Installateur', telefoon: '' }]
  };
}

function demoGegevens() {
  const d = (dagenTerug) => { const x = new Date(); x.setDate(x.getDate() - dagenTerug); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  return {
    ruimtes: [
      { id: 'r1', naam: 'Keuken', volgorde: 1 },
      { id: 'r2', naam: 'Woonkamer', volgorde: 2 },
      { id: 'r3', naam: 'Meterkast', volgorde: 3 },
      { id: 'r4', naam: 'Tuin & garage', volgorde: 4 }
    ],
    items: [
      {
        id: 'i1', ruimteId: 'r1', naam: 'Oven', soort: 'Combi-magnetron', voorGasten: true,
        uitleg: {
          intro: 'Zo bak je iets in de oven. Het duurt ongeveer 10 minuten voordat hij warm is.',
          stappen: [
            { tekst: 'Draai de linker knop naar het plaatje met een streep boven en onder.', fotoId: null },
            { tekst: 'Draai de rechter knop naar de temperatuur, bijvoorbeeld 180.', fotoId: null },
            { tekst: 'Gaat het lampje uit? Dan is de oven warm.', fotoId: null },
            { tekst: 'Klaar? Zet beide knoppen op 0.', fotoId: null }
          ],
          probleem: 'Knippert de klok? Stel eerst de tijd in, anders doet de oven niets.'
        },
        techniek: { merk: 'Voorbeeldmerk', type: 'CM-100', serienummer: '', bouwjaar: '2019', garantieTot: '', installateur: '', telefoon: '', notities: '' }
      },
      { id: 'i2', ruimteId: 'r1', naam: 'Vaatwasser', soort: 'Inbouw', voorGasten: true, uitleg: { intro: 'Tablet in het bakje, deur dicht, programma "Eco" kiezen en op Start drukken.', stappen: [], probleem: '' }, techniek: {} },
      { id: 'i3', ruimteId: 'r2', naam: 'Televisie', soort: 'Smart-tv', voorGasten: true, uitleg: { intro: '', stappen: [{ tekst: 'Pak de zwarte afstandsbediening en druk op de rode knop.', fotoId: null }, { tekst: 'Wil je Netflix? Druk op de knop met het huisje en kies Netflix.', fotoId: null }], probleem: 'Geen beeld? Druk op "Source" en kies HDMI 1.' }, techniek: {} },
      { id: 'i4', ruimteId: 'r3', naam: 'Cv-ketel', soort: 'Verwarming en warm water', voorGasten: false, uitleg: { intro: 'De ketel maakt het huis warm en zorgt voor warm water.', stappen: [{ tekst: 'Kijk op de drukmeter. De wijzer moet tussen 1,5 en 2 staan.', fotoId: null }, { tekst: 'Te laag? Vul bij met de vulkraan onder de ketel tot 1,8.', fotoId: null }], probleem: 'Rood lampje of foutcode? Druk één keer op Reset. Helpt dat niet: bel de installateur.' }, techniek: { merk: 'Voorbeeldmerk', type: 'HR-ketel', bouwjaar: '2015', installateur: 'Voorbeeld Installatie', telefoon: '', notities: '' } },
      { id: 'i5', ruimteId: 'r3', naam: 'Groepenkast', soort: 'Stroom', voorGasten: false, uitleg: { intro: 'Hier komt de stroom het huis binnen.', stappen: [], probleem: '' }, techniek: {} },
      { id: 'i6', ruimteId: 'r4', naam: 'Dakgoot', soort: 'Buiten', voorGasten: false, uitleg: { intro: '', stappen: [], probleem: '' }, techniek: {} }
    ],
    onderhoud: [
      { id: 'o1', itemId: 'i4', taak: 'Jaarlijkse onderhoudsbeurt', intervalMaanden: 12, wie: 'bedrijf', contact: 'Voorbeeld Installatie', laatst: d(386), notitie: '' },
      { id: 'o2', itemId: 'i4', taak: 'Waterdruk controleren', intervalMaanden: 1, wie: 'zelf', contact: '', laatst: d(21), notitie: 'Tussen 1,5 en 2 bar' },
      { id: 'o3', itemId: 'i4', taak: 'Radiatoren ontluchten', intervalMaanden: 12, wie: 'zelf', contact: '', laatst: d(40), notitie: '' },
      { id: 'o4', itemId: 'i2', taak: 'Filter schoonmaken', intervalMaanden: 1, wie: 'zelf', contact: '', laatst: '', notitie: '' },
      { id: 'o5', itemId: 'i6', taak: 'Bladeren uit de goot halen', intervalMaanden: 12, wie: 'zelf', contact: '', laatst: d(300), notitie: '' }
    ],
    historie: [
      { id: 'h1', itemId: 'i4', taakId: 'o1', taak: 'Jaarlijkse onderhoudsbeurt', datum: d(386) },
      { id: 'h2', itemId: 'i4', taakId: 'o3', taak: 'Radiatoren ontluchten', datum: d(40) }
    ],
    papieren: [
      { id: 'p1', itemId: 'i4', soort: 'Handleiding', titel: 'Handleiding gebruiker', datum: '', bedrag: '', link: 'https://example.com/handleiding.pdf', fotoId: null, notitie: '' },
      { id: 'p2', itemId: 'i4', soort: 'Factuur', titel: 'Factuur onderhoudsbeurt', datum: d(386), bedrag: '', link: '', fotoId: null, notitie: '' }
    ],
    nood: standaardNoodkaart(),
    contacten: [
      { id: 'c1', groep: 'vak', rol: 'Loodgieter', naam: 'Voorbeeld Loodgieters', telefoon: '030 123 45 67', email: '', website: '', notitie: 'Ook voor de cv-ketel', itemId: 'i4', voorGasten: true },
      { id: 'c2', groep: 'vak', rol: 'Slotenmaker', naam: '', telefoon: '', email: '', website: '', notitie: '', itemId: null, voorGasten: true }
    ],
    fotos: {}
  };
}

/* ---------- Opstarten ---------- */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('[sw]', e));
}

function startApp(o) {
  opslag = o;
  bouwShell();
  opslag.start(planRender);
}

function startDemo() {
  localStorage.setItem('onzewoning-modus', 'demo');
  startApp(demoOpslag());
}

function start() {
  if (localStorage.getItem('onzewoning-modus') === 'demo') return startDemo();
  if (!isConfigured) return toonNietGekoppeld();
  appEl.replaceChildren(el('p', { class: 'laden' }, 'Laden…'));
  bijInlogWijziging(async (u) => {
    gebruiker = u;
    if (!u) return toonLogin();
    try {
      const s = await getDoc(doc(db, 'leden', u.uid));
      if (!s.exists()) return toonGeenToegang(u);
    } catch (e) {
      return toonGeenToegang(u, e);
    }
    startApp(cloudOpslag());
  });
}

function welkomKop(sub) {
  return [
    el('div', { class: 'logo' }, ico('huis', 34)),
    el('div', {}, el('h1', { class: 'titel' }, 'Onze Woning'), el('p', { class: 'zacht', style: null }, sub))
  ];
}

function toonNietGekoppeld() {
  appEl.replaceChildren(el('div', { class: 'welkom' },
    welkomKop('Hoe alles in huis werkt, op één plek.'),
    el('div', { class: 'foutblok' }, 'Deze app is nog niet gekoppeld aan een Firebase-project. Vul config.js in (zie README).'),
    el('button', { type: 'button', class: 'knop knop-primair knop-breed', onclick: startDemo }, 'Bekijk met voorbeeldgegevens'),
    el('p', { class: 'zacht klein' }, 'Voorbeeldgegevens worden alleen op dit apparaat bewaard.')
  ));
}

function toonLogin() {
  const emailId = nieuwId('em'), wwId = nieuwId('ww');
  const email = el('input', { id: emailId, class: 'invoer', type: 'email', autocomplete: 'email', required: true });
  const ww = el('input', { id: wwId, class: 'invoer', type: 'password', autocomplete: 'current-password', minlength: '6', required: true });
  const fout = el('div', { class: 'foutblok', hidden: true });
  const toonFoutTekst = (e) => {
    const c = String((e && e.code) || '');
    fout.textContent = c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')
      ? 'E-mail of wachtwoord klopt niet.'
      : c.includes('email-already-in-use') ? 'Dit e-mailadres heeft al een account. Log in.'
      : c.includes('weak-password') ? 'Kies een wachtwoord van minstens 6 tekens.'
      : c.includes('popup') ? 'Het inlogvenster werd gesloten of geblokkeerd.'
      : ((e && e.message) || 'Inloggen lukte niet.');
    fout.hidden = false;
  };
  const metEmail = async (registreer) => {
    fout.hidden = true;
    if (!email.value.trim() || ww.value.length < 6) { fout.textContent = 'Vul je e-mail en een wachtwoord (min. 6 tekens) in.'; fout.hidden = false; return; }
    try { await (registreer ? registreerEmail : loginEmail)(email.value.trim(), ww.value); } catch (e) { toonFoutTekst(e); }
  };
  appEl.replaceChildren(el('div', { class: 'welkom' },
    welkomKop('Log in om verder te gaan.'),
    el('button', { type: 'button', class: 'knop knop-primair knop-breed', onclick: async () => { fout.hidden = true; try { await loginGoogle(); } catch (e) { toonFoutTekst(e); } } }, 'Inloggen met Google'),
    el('div', { class: 'scheiding' }, 'of met e-mail'),
    el('form', { class: 'stapel', novalidate: true, onsubmit: (e) => { e.preventDefault(); metEmail(false); } },
      el('div', { class: 'veld' }, el('label', { for: emailId }, 'E-mail'), email),
      el('div', { class: 'veld' }, el('label', { for: wwId }, 'Wachtwoord'), ww),
      fout,
      el('button', { type: 'submit', class: 'knop knop-rand knop-breed' }, 'Inloggen'),
      el('div', { class: 'rij-tussen' },
        el('button', { type: 'button', class: 'knop knop-tekst knop-klein', onclick: () => metEmail(true) }, 'Nieuw account'),
        el('button', {
          type: 'button', class: 'knop knop-tekst knop-klein', onclick: async () => {
            if (!email.value.trim()) { fout.textContent = 'Vul eerst je e-mail in.'; fout.hidden = false; return; }
            try { await wachtwoordVergeten(email.value.trim()); melding('Je krijgt een e-mail om je wachtwoord te herstellen.'); } catch (e) { toonFoutTekst(e); }
          }
        }, 'Wachtwoord vergeten'))
    ),
    el('button', { type: 'button', class: 'knop knop-tekst', onclick: startDemo }, 'Bekijk eerst met voorbeeldgegevens'),
    el('nav', { class: 'app-links', 'aria-label': 'Over deze app' },
      el('a', { href: 'help.html#help' }, 'Help'), el('a', { href: 'help.html#disclaimer' }, 'Disclaimer'), el('a', { href: 'help.html#privacy' }, 'Privacy'))
  ));
}

function toonGeenToegang(u, err) {
  appEl.replaceChildren(el('div', { class: 'welkom' },
    welkomKop('Je bent ingelogd, maar hebt nog geen toegang.'),
    err ? el('div', { class: 'foutblok' }, 'Controleren lukte niet. Heb je internet?') : null,
    el('p', {}, 'Vraag de beheerder om je toe te voegen. Geef deze gebruikers-ID door:'),
    el('div', { class: 'code' }, u.uid),
    el('button', {
      type: 'button', class: 'knop knop-rand knop-breed', onclick: async () => {
        try { await navigator.clipboard.writeText(u.uid); melding('Gekopieerd'); } catch { melding('Kopiëren lukte niet. Selecteer de code.'); }
      }
    }, 'Kopieer gebruikers-ID'),
    el('button', { type: 'button', class: 'knop knop-primair knop-breed', onclick: () => location.reload() }, 'Opnieuw proberen'),
    el('button', { type: 'button', class: 'knop knop-tekst', onclick: () => uitloggen() }, 'Uitloggen')
  ));
}

/* ---------- Schil en router ---------- */
function bouwShell() {
  view = el('main', { id: 'view', class: 'view' });
  const navItem = (sleutel, label, icoon) => {
    const a = el('a', { href: `#/${sleutel}` }, ico(icoon), label);
    navLinks[sleutel] = a;
    return a;
  };
  const nav = el('nav', { class: 'onder-nav', 'aria-label': 'Hoofdmenu' },
    el('div', { class: 'onder-nav-binnen' },
      navItem('', 'Start', 'huis'), navItem('onderhoud', 'Onderhoud', 'moersleutel'),
      navItem('papieren', 'Papieren', 'papier'), navItem('meer', 'Meer', 'meer')));
  vervang(appEl,
    opslag.soort === 'demo' ? el('div', { class: 'demo-band' }, 'Demo: voorbeeldgegevens, alleen op dit apparaat') : null,
    view, nav);
  window.addEventListener('hashchange', () => { volgorde = null; render(); window.scrollTo(0, 0); });
  render();
}

let renderGepland = false;
function planRender() {
  if (renderGepland) return;
  renderGepland = true;
  requestAnimationFrame(() => { renderGepland = false; render(); });
}

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  return h.split('?')[0].split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
}

function render() {
  if (!view) return;
  const delen = route();
  // Focus en cursor bewaren (bijv. tijdens typen in het zoekveld)
  const actief = document.activeElement;
  const focus = actief && actief.id && view.contains(actief)
    ? { id: actief.id, start: actief.selectionStart, eind: actief.selectionEnd } : null;

  let node;
  if (!klaar) node = el('p', { class: 'laden' }, 'Gegevens laden…');
  else {
    switch (delen[0]) {
      case 'ruimte': node = viewRuimte(delen[1]); break;
      case 'item': node = viewItem(delen[1], delen[2] || 'uitleg'); break;
      case 'onderhoud': node = viewOnderhoud(); break;
      case 'papieren': node = viewAllePapieren(); break;
      case 'nood': node = viewNood(); break;
      case 'contacten': node = viewContacten(); break;
      case 'meer': node = viewMeer(); break;
      default: node = viewStart();
    }
  }
  view.replaceChildren(node);

  const sectie = ['onderhoud', 'papieren', 'meer'].includes(delen[0]) ? delen[0] : (['nood', 'contacten'].includes(delen[0]) ? 'meer' : '');
  Object.entries(navLinks).forEach(([k, a]) => { if (k === sectie) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });

  if (focus) {
    const f = document.getElementById(focus.id);
    if (f) { f.focus(); try { f.setSelectionRange(focus.start, focus.eind); } catch { /* niet elk veld */ } }
  }
}

function terugbalk(href, label, rechts) {
  return el('div', { class: 'terugbalk' },
    el('a', { href, class: 'terug' }, ico('terug', 24), label),
    rechts || null);
}

/* ---------- Volgorde aanpassen (fix-3) ----------
   Alleen voor leden: gasten krijgen in de volgende fase een eigen alleen-lezen scherm zonder deze knoppen. */
let volgorde = null; // { sleutel, lijst: [{ id, label, sub }] }
const inVolgorde = (sleutel) => !!volgorde && volgorde.sleutel === sleutel;

function volgordeKnop(sleutel, maakLijst) {
  return el('button', {
    type: 'button', class: 'knop knop-tekst knop-klein',
    onclick: () => { volgorde = { sleutel, lijst: maakLijst() }; render(); }
  }, ico('schuif', 18), 'Volgorde');
}

function volgordeEditor(titel, bewaar) {
  const lijst = volgorde.lijst;
  const ul = el('ul', { class: 'lijst sorteer', 'aria-label': titel });
  let sleeptId = null;
  const wissel = (a, b) => { [lijst[a], lijst[b]] = [lijst[b], lijst[a]]; };
  // Focus blijft op het verplaatste kaartje (of op de andere pijl als deze nu uit staat)
  function focusOp(sleutel) {
    const ander = sleutel.startsWith('op-') ? sleutel.replace(/^op-/, 'neer-') : sleutel.replace(/^neer-/, 'op-');
    const k = ul.querySelector(`[data-k="${sleutel}"]`);
    const k2 = ul.querySelector(`[data-k="${ander}"]`);
    if (k && !k.disabled) k.focus(); else if (k2) k2.focus();
  }
  function teken() {
    vervang(ul, lijst.map((x, n) => el('li', { class: `kaart sorteer-rij${x.id === sleeptId ? ' sleept' : ''}`, 'data-idx': n },
      el('span', { class: 'greep', title: 'Slepen', 'aria-hidden': 'true', onpointerdown: (e) => startSlepen(e, x.id) }, ico('greep', 22)),
      el('span', { class: 'lijst-tekst' }, el('span', { class: 'lijst-titel' }, x.label), x.sub ? el('span', { class: 'lijst-sub' }, x.sub) : null),
      el('button', { type: 'button', class: 'icoonknop', 'data-k': `op-${x.id}`, 'aria-label': `${x.label} omhoog`, disabled: n === 0, onclick: () => { wissel(n, n - 1); teken(); focusOp(`op-${x.id}`); } }, ico('omhoog')),
      el('button', { type: 'button', class: 'icoonknop', 'data-k': `neer-${x.id}`, 'aria-label': `${x.label} omlaag`, disabled: n === lijst.length - 1, onclick: () => { wissel(n, n + 1); teken(); focusOp(`neer-${x.id}`); } }, ico('omlaag')))));
  }
  function startSlepen(e, id) {
    e.preventDefault();
    sleeptId = id;
    try { ul.setPointerCapture(e.pointerId); } catch { /* oudere browser */ }
    teken();
  }
  ul.addEventListener('pointermove', (e) => {
    if (!sleeptId) return;
    if (e.clientY < 90) window.scrollBy(0, -14);
    else if (e.clientY > window.innerHeight - 130) window.scrollBy(0, 14);
    const onder = document.elementFromPoint(e.clientX, e.clientY);
    const rij = onder && onder.closest('.sorteer-rij');
    if (!rij || !ul.contains(rij)) return;
    const doel = Number(rij.dataset.idx);
    const van = lijst.findIndex((x) => x.id === sleeptId);
    if (doel !== van && van >= 0) { const [x] = lijst.splice(van, 1); lijst.splice(doel, 0, x); teken(); }
  });
  const stop = () => { if (!sleeptId) return; sleeptId = null; teken(); };
  ul.addEventListener('pointerup', stop);
  ul.addEventListener('pointercancel', stop);
  teken();
  return el('section', { class: 'stapel volgorde-modus', 'aria-label': titel },
    el('p', { class: 'veld-hint' }, 'Sleep aan ⋮⋮ of gebruik de pijltjes. Tik daarna op Gereed.'),
    ul,
    el('div', { class: 'knoppen-2' },
      el('button', { type: 'button', class: 'knop knop-rand', onclick: () => { volgorde = null; render(); } }, 'Annuleren'),
      el('button', { type: 'button', class: 'knop knop-primair', onclick: () => { bewaar(lijst.map((x) => x.id)); volgorde = null; render(); melding('Volgorde bewaard'); } }, ico('vink', 18), 'Gereed')));
}

function bewaarVolgorde(coll, ids) {
  ids.forEach((id, n) => {
    const x = D[coll].find((y) => y.id === id);
    if (x && x.volgorde !== n + 1) opslag.update(coll, id, { volgorde: n + 1 });
  });
}

function bewaarNoodVolgorde(veld, ids) {
  const n = D.nood || {};
  const oud = n[veld] || [];
  const nieuw = ids.map((id) => oud[Number(id.slice(1))]).filter(Boolean);
  opslag.setNood({ blokken: n.blokken || [], contacten: n.contacten || [], [veld]: nieuw });
}

/* ---------- Start ---------- */
function viewStart() {
  const inhoud = el('div', { class: 'stapel-ruim' });
  const vul = () => inhoud.replaceChildren(...(zoekterm.trim() ? [zoekResultaten(zoekterm)] : startSecties()));
  const zoekveld = el('input', {
    id: 'zoekveld', type: 'search', placeholder: 'Zoek: oven, filter, garantie…', value: zoekterm, autocomplete: 'off',
    oninput: (e) => { zoekterm = e.target.value; vul(); }
  });
  vul();
  return el('div', { class: 'pagina' },
    el('div', { class: 'rij-tussen' },
      el('div', {}, el('p', { class: 'zacht' }, `Hallo ${voornaam()}`), el('h1', { class: 'titel' }, 'Ons huis'))),
    el('div', { class: 'zoek', role: 'search' }, el('label', { for: 'zoekveld', class: 'sr' }, 'Zoeken'), ico('zoek', 20), zoekveld),
    inhoud);
}

function onderhoudBalk() {
  // fix-9: geen lijst meer op het startscherm, alleen een samenvatting met een link naar Onderhoud
  if (!D.onderhoud.length) return null;
  const tel = { laat: 0, binnenkort: 0, nooit: 0 };
  D.onderhoud.forEach((t) => { const s = taakStatus(t).soort; if (s in tel) tel[s]++; });
  const delen = [
    tel.laat ? `${tel.laat} te laat` : null,
    tel.binnenkort ? `${tel.binnenkort} deze maand` : null,
    tel.nooit ? `${tel.nooit} nog nooit gedaan` : null
  ].filter(Boolean);
  const tekst = delen.length ? delen.join(' · ') : 'alles bij';
  return el('a', { href: '#/onderhoud', class: `onderhoudbalk${tel.laat ? ' onderhoudbalk-laat' : ''}` },
    el('span', { class: 'onderhoudbalk-ico', 'aria-hidden': 'true' }, ico('moersleutel', 20)),
    el('span', { class: 'onderhoudbalk-tekst' }, el('b', {}, 'Onderhoud: '), tekst, delen.length ? null : ' ', delen.length ? null : ico('vink', 16)),
    ico('rechts', 18));
}

function startSecties() {
  const ruimtes = gesorteerdeRuimtes();
  return [
    onderhoudBalk(),
    el('a', { href: '#/nood', class: 'noodknop' },
      el('span', { class: 'noodknop-ico' }, ico('let_op', 24)),
      el('span', { class: 'noodknop-tekst' }, el('b', {}, 'Gaat er iets mis?'), el('span', {}, 'Noodkaart: kranen, stroom, wie bel je'))),
    el('section', { class: 'stapel', 'aria-labelledby': 'kop-ruimtes' },
      el('div', { class: 'rij-tussen' },
        el('h2', { id: 'kop-ruimtes', class: 'kop-s' }, 'Ruimtes'),
        ruimtes.length > 1 && !inVolgorde('ruimtes') ? volgordeKnop('ruimtes', () => ruimtes.map((r) => ({ id: r.id, label: r.naam }))) : null),
      inVolgorde('ruimtes') ? volgordeEditor('Volgorde ruimtes', (ids) => bewaarVolgorde('ruimtes', ids)) : el('div', { class: 'raster-2' },
        ruimtes.map((r) => {
          const n = itemsIn(r.id).length;
          return el('a', { href: `#/ruimte/${r.id}`, class: 'kaart ruimtetegel' }, el('b', {}, r.naam), el('span', {}, `${n} ${n === 1 ? 'onderdeel' : 'onderdelen'}`));
        }),
        el('button', { type: 'button', class: 'tegel-nieuw', onclick: () => ruimteBewerken(null) }, ico('plus', 18), 'Ruimte')))
  ];
}

function taakRijKort(t, s) {
  const item = itemVan(t.itemId);
  return el('a', { href: `#/item/${t.itemId}/onderhoud`, class: 'kaart lijst-rij' },
    el('span', { class: `stip stip-${s.soort}` }),
    el('span', { class: 'lijst-tekst' },
      el('span', { class: 'lijst-titel', style: null }, `${item ? item.naam : '?'} · ${t.taak}`),
      el('span', { class: 'lijst-sub' }, `${item ? ruimteNaam(item.ruimteId) : ''} · ${t.wie === 'bedrijf' ? 'door bedrijf' : 'zelf'}`)),
    el('span', { class: `pil pil-${s.soort}` }, s.label));
}

function zoekResultaten(term) {
  const t = norm(term.trim());
  const past = (...v) => v.some((x) => norm(x).includes(t));
  const hits = [];
  D.ruimtes.forEach((r) => { if (past(r.naam)) hits.push({ soort: 'Ruimte', titel: r.naam, sub: '', href: `#/ruimte/${r.id}` }); });
  D.items.forEach((i) => {
    const u = i.uitleg || {}, te = i.techniek || {};
    if (past(i.naam, i.soort, u.intro, u.probleem, ...(u.stappen || []).map((s) => s.tekst), te.merk, te.type, te.serienummer, te.notities, te.installateur)) {
      hits.push({ soort: 'Apparaat', titel: i.naam, sub: ruimteNaam(i.ruimteId), href: `#/item/${i.id}/uitleg` });
    }
  });
  D.onderhoud.forEach((o) => {
    if (past(o.taak, o.notitie, o.contact)) {
      const i = itemVan(o.itemId);
      hits.push({ soort: 'Onderhoud', titel: o.taak, sub: i ? i.naam : '', href: `#/item/${o.itemId}/onderhoud` });
    }
  });
  D.papieren.forEach((p) => {
    if (past(p.titel, p.soort, p.notitie)) {
      const i = itemVan(p.itemId);
      hits.push({ soort: p.soort || 'Papier', titel: p.titel, sub: i ? i.naam : 'Algemeen', href: i ? `#/item/${i.id}/papieren` : '#/papieren' });
    }
  });
  D.contacten.forEach((c) => {
    if (past(c.rol, c.naam, c.notitie, c.telefoon, c.email)) hits.push({ soort: 'Contact', titel: [c.rol, c.naam].filter(Boolean).join(' · '), sub: c.telefoon || '', href: '#/contacten' });
  });
  if (!hits.length) return el('p', { class: 'leeg' }, `Niets gevonden voor "${term.trim()}".`);
  return el('section', { class: 'stapel', 'aria-label': 'Zoekresultaten' },
    el('p', { class: 'zacht klein' }, `${hits.length} gevonden`),
    el('ul', { class: 'lijst' }, hits.slice(0, 50).map((h) => el('li', {},
      el('a', { href: h.href, class: 'kaart lijst-rij' },
        el('span', { class: 'lijst-tekst' }, el('span', { class: 'lijst-titel' }, h.titel), el('span', { class: 'lijst-sub' }, [h.soort, h.sub].filter(Boolean).join(' · '))),
        ico('rechts', 20))))));
}

/* ---------- Ruimte ---------- */
function viewRuimte(id) {
  const r = ruimteVan(id);
  if (!r) return nietGevonden();
  const items = itemsIn(id);
  const gasten = items.filter((i) => i.voorGasten).length;
  return el('div', {},
    terugbalk('#/', 'Start', el('button', { type: 'button', class: 'icoonknop', 'aria-label': 'Ruimte bewerken', onclick: () => ruimteBewerken(r) }, ico('potlood'))),
    el('div', { class: 'pagina' },
      el('div', { class: 'stapel' },
        r.fotoId ? klikbareFoto(r.fotoId, r.naam, 'kopfoto') : null,
        el('h1', { class: 'titel-m' }, r.naam),
        el('p', { class: 'zacht' }, `${items.length} ${items.length === 1 ? 'onderdeel' : 'onderdelen'}${gasten ? ` · ${gasten} voor gasten` : ''}`)),
      inVolgorde(`items:${id}`)
        ? volgordeEditor('Volgorde onderdelen', (ids) => bewaarVolgorde('items', ids))
        : [
          items.length > 1 ? el('div', { class: 'rij-tussen' }, el('span'), volgordeKnop(`items:${id}`, () => items.map((i) => ({ id: i.id, label: i.naam, sub: i.soort })))) : null,
          items.length ? el('ul', { class: 'lijst' }, items.map((i) => el('li', {}, itemRij(i))))
            : el('p', { class: 'leeg' }, 'Nog niets in deze ruimte. Voeg een apparaat of installatie toe.'),
          el('button', { type: 'button', class: 'knop knop-primair knop-breed', onclick: () => itemBewerken(null, id) }, ico('plus', 20), 'Apparaat toevoegen')
        ]));
}

function itemRij(i) {
  const taken = takenVan(i.id).map(taakStatus);
  const laat = taken.some((s) => s.soort === 'laat' || s.soort === 'nooit');
  return el('a', { href: `#/item/${i.id}/uitleg`, class: 'kaart lijst-rij' },
    i.fotoId ? fotoImg(i.fotoId, '', 'duim') : el('span', { class: 'duim', 'aria-hidden': 'true' }),
    el('span', { class: 'lijst-tekst' }, el('span', { class: 'lijst-titel' }, i.naam), i.soort ? el('span', { class: 'lijst-sub' }, i.soort) : null),
    laat ? el('span', { class: 'pil pil-laat' }, 'Onderhoud') : i.voorGasten ? el('span', { class: 'pil pil-gast' }, 'Gasten') : null);
}

/* ---------- Apparaat ---------- */
const TABS = [['uitleg', 'Zo werkt het'], ['onderhoud', 'Onderhoud'], ['papieren', 'Papieren'], ['techniek', 'Techniek']];

function viewItem(id, tab) {
  const i = itemVan(id);
  if (!i) return nietGevonden();
  if (!TABS.some(([k]) => k === tab)) tab = 'uitleg';
  const gastId = nieuwId('gast');
  const inhoud = tab === 'onderhoud' ? tabOnderhoud(i) : tab === 'papieren' ? tabPapieren(i) : tab === 'techniek' ? tabTechniek(i) : tabUitleg(i);
  return el('div', {},
    terugbalk(`#/ruimte/${i.ruimteId}`, ruimteNaam(i.ruimteId),
      el('button', { type: 'button', class: 'icoonknop', 'aria-label': 'Naam, ruimte en foto bewerken', onclick: () => itemBewerken(i) }, ico('potlood'))),
    el('div', { class: 'item-kop' },
      i.fotoId ? el('div', { style: null }, klikbareFoto(i.fotoId, i.naam, 'kopfoto')) : null,
      el('h1', { class: 'titel-m' }, i.naam),
      el('div', { class: 'rij-tussen' },
        el('span', { class: 'zacht klein' }, [i.soort, ruimteNaam(i.ruimteId)].filter(Boolean).join(' · ')),
        el('label', { class: 'gast-schakel', for: gastId },
          el('input', { id: gastId, type: 'checkbox', checked: !!i.voorGasten, onchange: (e) => opslag.update('items', i.id, { voorGasten: e.target.checked }) }),
          'Voor gasten'))),
    el('nav', { class: 'tabs', 'aria-label': 'Onderdelen' },
      TABS.map(([k, l]) => el('a', { href: `#/item/${i.id}/${k}`, 'aria-current': k === tab ? 'page' : null }, l))),
    el('div', { class: 'tab-inhoud' }, inhoud));
}

function tabUitleg(i) {
  const u = i.uitleg || {};
  const stappen = (u.stappen || []).filter((s) => s.tekst || s.fotoId);
  const leeg = !u.intro && !stappen.length && !u.probleem;
  return [
    leeg ? el('p', { class: 'leeg' }, 'Nog geen uitleg. Schrijf in korte stappen hoe het werkt, met een foto erbij.') : null,
    u.intro ? el('p', { class: 'alinea' }, u.intro) : null,
    stappen.length ? el('ol', { class: 'stappen' }, stappen.map((s, n) => el('li', { class: 'kaart stap' },
      el('span', { class: 'stapnr', 'aria-hidden': 'true' }, String(n + 1)),
      el('span', { class: 'stap-inhoud' },
        el('span', { class: 'sr' }, `Stap ${n + 1}: `),
        s.tekst ? el('p', {}, s.tekst) : null,
        s.fotoId ? klikbareFoto(s.fotoId, `Stap ${n + 1}`, 'stapfoto') : null)))) : null,
    u.probleem ? el('div', { class: 'tipblok' }, ico('info'),
      el('div', {}, el('b', {}, 'Lukt het niet?'), el('p', {}, u.probleem))) : null,
    el('button', { type: 'button', class: 'knop knop-rand knop-breed', onclick: () => uitlegBewerken(i) }, ico('potlood', 20), leeg ? 'Uitleg schrijven' : 'Uitleg bewerken'),
    contactenBijItem(i)
  ];
}

function tabOnderhoud(i) {
  const taken = takenVan(i.id).map((t) => ({ t, s: taakStatus(t) })).sort((a, b) => a.s.dagen - b.s.dagen);
  const hist = D.historie.filter((h) => h.itemId === i.id).sort((a, b) => String(b.datum).localeCompare(String(a.datum))).slice(0, 20);
  return [
    taken.length ? null : el('p', { class: 'leeg' }, 'Nog geen onderhoud. Voeg een taak toe, bijvoorbeeld "filter schoonmaken, elke maand".'),
    ...taken.map(({ t, s }) => taakKaart(t, s)),
    el('button', { type: 'button', class: 'knop knop-rand knop-breed', onclick: () => taakBewerken(i.id, null) }, ico('plus', 20), 'Onderhoudstaak toevoegen'),
    hist.length ? el('h2', { class: 'kop-xs', style: null }, 'Geschiedenis') : null,
    hist.length ? el('ul', { class: 'historie' }, hist.map((h) => {
      const heeftBon = D.papieren.some((p) => p.itemId === i.id && p.soort === 'Factuur' && p.datum === h.datum);
      return el('li', {}, el('span', {}, h.taak), el('span', { class: 'zacht' }, fmtDatum(h.datum) + (heeftBon ? ' · factuur ✓' : '')));
    })) : null
  ];
}

function taakKaart(t, s) {
  const tel = telLink(t.contact);
  return el('div', { class: `kaart taak ${s.soort === 'laat' ? 'taak-laat' : ''}` },
    el('div', { class: 'taak-kop' },
      el('button', { type: 'button', class: 'taak-titelknop', onclick: () => taakBewerken(t.itemId, t), 'aria-label': `${t.taak} bewerken` },
        el('b', {}, t.taak),
        el('span', {}, `${intervalLabel(t.intervalMaanden)} · ${t.wie === 'bedrijf' ? 'door bedrijf' : 'zelf'}`)),
      el('span', { class: `pil pil-${s.soort}` }, s.label)),
    el('div', { class: 'taak-info' },
      el('span', {}, el('span', { class: 'lbl' }, 'Laatst gedaan'), el('b', {}, t.laatst ? fmtDatum(t.laatst) : '—')),
      t.contact ? el('span', {}, el('span', { class: 'lbl' }, 'Wie bel je'), tel ? el('a', { href: tel, class: 'vet' }, t.contact) : el('b', {}, t.contact)) : null),
    t.notitie ? el('p', { class: 'klein zacht' }, t.notitie) : null,
    el('button', {
      type: 'button', class: 'knop knop-primair knop-klein', onclick: () => {
        const datum = vandaagStr();
        opslag.update('onderhoud', t.id, { laatst: datum });
        opslag.add('historie', { itemId: t.itemId, taakId: t.id, taak: t.taak, datum });
        melding(`"${t.taak}" afgevinkt`);
      }
    }, ico('vink', 18), 'Gedaan – vandaag'));
}

const PAPIER_SOORTEN = ['Handleiding', 'Factuur', 'Offerte', 'Garantie', 'Contract', 'Overig'];

function papierLijst(papieren, metItem) {
  if (!papieren.length) return el('p', { class: 'leeg' }, 'Nog geen papieren. Voeg een link toe (bijv. de handleiding online) of maak een foto van de bon.');
  return el('ul', { class: 'lijst' }, papieren.map((p) => {
    const link = veiligeLink(p.link);
    const sub = [p.soort, metItem ? ((itemVan(p.itemId) || {}).naam || 'Algemeen') : null, p.datum ? fmtDatum(p.datum) : null, p.bedrag ? `€ ${p.bedrag}` : null].filter(Boolean).join(' · ');
    const pdf = p.bestand && p.bestand.id ? p.bestand : null;
    const voorkant = pdf ? el('span', { class: 'doc-ico', 'aria-hidden': 'true' }, 'PDF')
      : p.fotoId ? fotoImg(p.fotoId, '', 'doc-ico') : el('span', { class: 'doc-ico', 'aria-hidden': 'true' }, link ? 'LINK' : 'DOC');
    const tekst = el('span', { class: 'lijst-tekst' }, el('span', { class: 'lijst-titel' }, p.titel), el('span', { class: 'lijst-sub' }, sub));
    const hoofd = pdf
      ? el('button', { type: 'button', class: 'kaart lijst-rij', onclick: () => pdfOpenen(pdf, p.titel) }, voorkant, tekst)
      : link
      ? el('a', { href: link, target: '_blank', rel: 'noopener noreferrer', class: 'kaart lijst-rij' }, voorkant, tekst, ico('link', 18))
      : p.fotoId
        ? el('button', { type: 'button', class: 'kaart lijst-rij', onclick: () => fotoTonen(p.fotoId, p.titel) }, voorkant, tekst)
        : el('button', { type: 'button', class: 'kaart lijst-rij', onclick: () => papierBewerken(p.itemId, p) }, voorkant, tekst);
    return el('li', { class: 'papier-rij' }, hoofd,
      el('button', { type: 'button', class: 'icoonknop', 'aria-label': `${p.titel} bewerken`, onclick: () => papierBewerken(p.itemId, p) }, ico('potlood', 20)));
  }));
}

function filterChips(lijst, bijKlik) {
  const aanwezig = ['Alles', ...PAPIER_SOORTEN.filter((s) => lijst.some((p) => p.soort === s))];
  if (!aanwezig.includes(papierFilter)) papierFilter = 'Alles';
  return el('div', { class: 'filters', role: 'group', 'aria-label': 'Filter op soort' },
    aanwezig.map((s) => el('button', { type: 'button', class: 'chip', 'aria-pressed': s === papierFilter ? 'true' : 'false', onclick: () => { papierFilter = s; bijKlik(); } }, s)));
}

function tabPapieren(i) {
  const alle = D.papieren.filter((p) => p.itemId === i.id).sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')));
  const lijst = papierFilter === 'Alles' ? alle : alle.filter((p) => p.soort === papierFilter);
  const g = (i.techniek || {}).garantieTot;
  const gd = g ? parseDatum(g) : null;
  return [
    gd ? el('div', { class: 'melding-groen' }, ico('schild'),
      el('span', {}, el('b', {}, 'Garantie '), gd >= parseDatum(vandaagStr()) ? `loopt tot ${fmtDatum(g)}` : `is verlopen sinds ${fmtDatum(g)}`)) : null,
    alle.length > 1 ? filterChips(alle, render) : null,
    papierLijst(lijst, false),
    el('p', { class: 'slot-noot' }, ico('slot', 16), 'Papieren zijn nooit zichtbaar voor gasten'),
    el('button', { type: 'button', class: 'knop knop-primair knop-breed', onclick: () => papierBewerken(i.id, null) }, ico('plus', 20), 'Papier toevoegen')
  ];
}

const TECH_VELDEN = [
  ['merk', 'Merk'], ['type', 'Type / model'], ['serienummer', 'Serienummer'], ['bouwjaar', 'Bouwjaar'],
  ['aangeschaft', 'Gekocht op', 'date'], ['garantieTot', 'Garantie tot', 'date'],
  ['installateur', 'Installateur / leverancier'], ['telefoon', 'Telefoon installateur', 'tel']
];

function tabTechniek(i) {
  const t = i.techniek || {};
  const rijen = TECH_VELDEN.filter(([k]) => t[k]).map(([k, l, type]) => {
    let w = t[k];
    if (type === 'date') w = fmtDatum(w);
    const tel = type === 'tel' ? telLink(t[k]) : null;
    return el('div', {}, el('dt', {}, l), el('dd', {}, tel ? el('a', { href: tel }, w) : w));
  });
  return [
    rijen.length ? el('dl', { class: 'kaart dl' }, rijen) : null,
    t.notities ? el('div', { class: 'stapel' }, el('h2', { class: 'kop-xs' }, 'Technische uitleg'), el('p', { class: 'alinea' }, t.notities)) : null,
    !rijen.length && !t.notities ? el('p', { class: 'leeg' }, 'Nog geen technische gegevens. Tip: maak een foto van het typeplaatje.') : null,
    el('button', { type: 'button', class: 'knop knop-rand knop-breed', onclick: () => techniekBewerken(i) }, ico('potlood', 20), 'Techniek bewerken')
  ];
}

/* ---------- Overzichten ---------- */
function viewOnderhoud() {
  const alle = D.onderhoud.map((t) => ({ t, s: taakStatus(t) })).sort((a, b) => a.s.dagen - b.s.dagen);
  const groep = (titel, lijst) => lijst.length ? el('section', { class: 'stapel' }, el('h2', { class: 'kop-s' }, titel), el('ul', { class: 'lijst' }, lijst.map(({ t, s }) => el('li', {}, taakRijKort(t, s))))) : null;
  return el('div', { class: 'pagina' },
    el('h1', { class: 'titel' }, 'Onderhoud'),
    alle.length ? null : el('p', { class: 'leeg' }, 'Nog geen onderhoudstaken. Die voeg je toe bij een apparaat, op het tabblad Onderhoud.'),
    groep('Moet nu', alle.filter(({ s }) => s.soort === 'laat' || s.soort === 'nooit')),
    groep('Komende maand', alle.filter(({ s }) => s.soort === 'binnenkort')),
    groep('Later', alle.filter(({ s }) => s.soort === 'later')));
}

function viewAllePapieren() {
  const alle = [...D.papieren].sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')));
  const lijst = papierFilter === 'Alles' ? alle : alle.filter((p) => p.soort === papierFilter);
  return el('div', { class: 'pagina' },
    el('h1', { class: 'titel' }, 'Papieren'),
    alle.length > 1 ? filterChips(alle, render) : null,
    papierLijst(lijst, true),
    el('button', { type: 'button', class: 'knop knop-primair knop-breed', onclick: () => papierBewerken(null, null) }, ico('plus', 20), 'Papier toevoegen'));
}

function viewNood() {
  const n = D.nood;
  return el('div', {},
    el('div', { class: 'noodkop' },
      el('div', { class: 'rij-tussen' },
        el('a', { href: '#/', class: 'terug' }, ico('terug', 24), 'Start'),
        el('button', { type: 'button', class: 'icoonknop', 'aria-label': 'Noodkaart bewerken', onclick: noodBewerken }, ico('potlood'))),
      el('div', { class: 'noodkop-tekst' }, el('h1', { class: 'titel-m' }, 'Gaat er iets mis?'), el('p', {}, 'Kies wat er aan de hand is.'))),
    el('div', { class: 'pagina' },
      el('a', { href: 'tel:112', class: 'tel112' }, 'Brand of gevaar? Bel 112', ico('telefoon')),
      !n ? el('div', { class: 'stapel' },
        el('p', { class: 'leeg' }, 'De noodkaart is nog leeg.'),
        el('button', { type: 'button', class: 'knop knop-primair knop-breed', onclick: () => { opslag.setNood(standaardNoodkaart()); melding('Voorbeeld gezet. Vul de [haakjes] in.'); } }, 'Begin met een voorbeeld')) : null,
      n && (n.blokken || []).length > 1 && !inVolgorde('nood-blokken')
        ? el('div', { class: 'rij-tussen' }, el('h2', { class: 'kop-xs' }, 'Situaties'), volgordeKnop('nood-blokken', () => n.blokken.map((b, k) => ({ id: `b${k}`, label: b.titel || '(zonder titel)' })))) : null,
      inVolgorde('nood-blokken')
        ? volgordeEditor('Volgorde situaties', (ids) => bewaarNoodVolgorde('blokken', ids))
        : n ? (n.blokken || []).map((b) => el('div', { class: 'kaart noodblok' },
          b.fotoId ? klikbareFoto(b.fotoId, b.titel, 'noodblok-foto') : null,
          el('div', {}, el('b', {}, b.titel), el('p', {}, b.tekst)))) : null,
      n && (n.contacten || []).length ? el('div', { class: 'rij-tussen' }, el('h2', { class: 'kop-xs' }, 'Wie bel je?'),
        n.contacten.length > 1 && !inVolgorde('nood-contacten') ? volgordeKnop('nood-contacten', () => n.contacten.map((c, k) => ({ id: `c${k}`, label: c.naam || '(zonder naam)', sub: c.telefoon }))) : null) : null,
      inVolgorde('nood-contacten') ? volgordeEditor('Volgorde contacten', (ids) => bewaarNoodVolgorde('contacten', ids)) :
      n && (n.contacten || []).length ? el('div', { class: 'raster-2' }, n.contacten.map((c) => {
        const tel = telLink(c.telefoon);
        return tel ? el('a', { href: tel, class: 'kaart contact' }, el('b', {}, c.naam), el('span', {}, c.telefoon))
          : el('div', { class: 'kaart contact' }, el('b', {}, c.naam), el('span', { class: 'zacht' }, 'nummer invullen'));
      })) : null,
      el('a', { href: '#/contacten', class: 'kaart lijst-rij' }, ico('telefoon'),
        el('span', { class: 'lijst-tekst' }, el('span', { class: 'lijst-titel' }, 'Meer contacten'), el('span', { class: 'lijst-sub' }, 'Vakmensen, leveranciers en instanties')), ico('rechts', 20))));
}

/* ---------- Contacten (fix-11) ----------
   Vakmensen, leveranciers en instanties. De noodcontacten blijven op de noodkaart staan
   en worden hier bovenaan getoond (alleen-lezen; bewerken via de noodkaart). */
const CONTACT_GROEPEN = [['vak', 'Vakmensen'], ['lev', 'Leveranciers en installateurs'], ['inst', 'Instanties']];
let contactZoek = '';

function websiteLink(w) {
  const v = String(w || '').trim();
  if (!v) return null;
  return veiligeLink(/^https?:\/\//i.test(v) ? v : `https://${v}`);
}
const geldigeMail = (m) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(String(m || '').trim());
const contactTitel = (c) => c.rol || c.naam || '(zonder naam)';

function belKnop(telefoon, label) {
  const tel = telLink(telefoon);
  return tel ? el('a', { href: tel, class: 'belknop', 'aria-label': `${label} bellen` }, ico('telefoon', 20)) : null;
}

function contactKaart(c) {
  const leeg = !c.telefoon && !c.naam && !c.email;
  const sub = leeg ? 'nog invullen' : [c.naam && c.rol ? c.naam : null, c.notitie].filter(Boolean).join(' · ');
  return el('li', { class: 'contact-rij' },
    el('button', { type: 'button', class: `kaart lijst-rij${leeg ? ' contact-leeg' : ''}`, onclick: () => contactTonen(c) },
      el('span', { class: 'lijst-tekst' },
        el('span', { class: 'lijst-titel' }, contactTitel(c)),
        sub ? el('span', { class: 'lijst-sub' }, sub) : null)),
    belKnop(c.telefoon, contactTitel(c)));
}

function viewContacten() {
  const t = norm(contactZoek.trim());
  const past = (c) => !t || [c.rol, c.naam, c.notitie, c.telefoon, c.email, (itemVan(c.itemId) || {}).naam].some((x) => norm(x).includes(t));
  const nood = ((D.nood && D.nood.contacten) || []).filter((c) => !t || norm(c.naam).includes(t) || norm(c.telefoon).includes(t));
  const zoekId = 'contact-zoek';
  const sorteer = (a, b) => String(contactTitel(a)).localeCompare(String(contactTitel(b)), 'nl');
  const groepen = CONTACT_GROEPEN.map(([k, titel]) => [titel, D.contacten.filter((c) => (c.groep || 'vak') === k && past(c)).sort(sorteer)]);
  const niets = !nood.length && groepen.every(([, l]) => !l.length);
  return el('div', {},
    terugbalk('#/meer', 'Meer', el('button', { type: 'button', class: 'icoonknop', 'aria-label': 'Contact toevoegen', onclick: () => contactBewerken(null) }, ico('plus'))),
    el('div', { class: 'pagina' },
      el('h1', { class: 'titel' }, 'Contacten'),
      contactenGeblokkeerd ? el('div', { class: 'tipblok' }, ico('info'),
        el('div', {}, el('b', {}, 'Nog niet beschikbaar'), el('p', {}, 'De beveiligingsregels van de database moeten nog worden bijgewerkt (firestore.rules, fix-11). Daarna verschijnen hier je contacten.'))) : null,
      el('div', { class: 'zoek', role: 'search' }, el('label', { for: zoekId, class: 'sr' }, 'Zoek in contacten'), ico('zoek', 20),
        el('input', { id: zoekId, type: 'search', placeholder: 'Zoek: loodgieter, Kalkhoven…', value: contactZoek, autocomplete: 'off', oninput: (e) => { contactZoek = e.target.value; render(); } })),
      nood.length ? el('section', { class: 'stapel' },
        el('div', { class: 'rij-tussen' }, el('h2', { class: 'kop-xs' }, 'Bij nood'), el('a', { href: '#/nood', class: 'klein' }, 'Noodkaart')),
        el('ul', { class: 'lijst' }, nood.map((c) => el('li', { class: 'contact-rij' },
          el('div', { class: 'kaart lijst-rij' }, el('span', { class: 'lijst-tekst' }, el('span', { class: 'lijst-titel' }, c.naam || 'Contact'), el('span', { class: 'lijst-sub' }, c.telefoon || 'nummer invullen'))),
          belKnop(c.telefoon, c.naam || 'Contact'))))) : null,
      groepen.map(([titel, lijst]) => lijst.length ? el('section', { class: 'stapel' }, el('h2', { class: 'kop-xs' }, titel), el('ul', { class: 'lijst' }, lijst.map(contactKaart))) : null),
      niets ? el('p', { class: 'leeg' }, t ? `Niets gevonden voor "${contactZoek.trim()}".` : 'Zet hier de vakmensen en bedrijven die je nodig hebt, zoals de loodgieter of de elektricien.') : null,
      el('button', { type: 'button', class: 'knop knop-primair knop-breed', onclick: () => contactBewerken(null) }, ico('plus', 20), 'Contact toevoegen')));
}

function contactTonen(c) {
  const item = c.itemId ? itemVan(c.itemId) : null;
  const tel = telLink(c.telefoon);
  const web = websiteLink(c.website);
  const mail = geldigeMail(c.email) ? `mailto:${c.email.trim()}` : null;
  const groep = (CONTACT_GROEPEN.find(([k]) => k === (c.groep || 'vak')) || [])[1];
  const regel = (icoon, inhoud) => el('div', { class: 'kaart kaart-p rij' }, ico(icoon, 20), inhoud);
  dialoog({
    titel: contactTitel(c),
    bouw: (l) => vervang(l,
      el('p', { class: 'zacht klein' }, [groep, c.voorGasten === false ? 'niet voor gasten' : 'zichtbaar voor gasten'].filter(Boolean).join(' · ')),
      c.naam && c.rol ? el('p', { class: 'kop-xs' }, c.naam) : null,
      c.telefoon ? regel('telefoon', tel ? el('a', { href: tel, class: 'vet' }, c.telefoon) : el('span', {}, c.telefoon)) : null,
      c.email ? regel('mail', mail ? el('a', { href: mail }, c.email) : el('span', {}, c.email)) : null,
      c.website ? regel('wereld', web ? el('a', { href: web, target: '_blank', rel: 'noopener noreferrer' }, c.website) : el('span', {}, c.website)) : null,
      c.notitie ? el('p', { class: 'alinea' }, c.notitie) : null,
      item ? el('a', { href: `#/item/${item.id}/uitleg`, class: 'kaart lijst-rij', onclick: () => { const d = document.querySelector('dialog.sheet'); if (d) d.close(); } },
        el('span', { class: 'lijst-tekst' }, el('span', { class: 'lijst-titel' }, item.naam), el('span', { class: 'lijst-sub' }, `Hoort bij · ${ruimteNaam(item.ruimteId)}`)), ico('rechts', 20)) : null,
      !c.telefoon && !c.email && !c.website ? el('p', { class: 'leeg' }, 'Nog geen gegevens. Tik op Bewerken om ze in te vullen.') : null),
    opslaanLabel: 'Bewerken',
    opslaan: () => { setTimeout(() => contactBewerken(c), 0); }
  });
}

function contactBewerken(c) {
  const groep = keuze(CONTACT_GROEPEN, c ? c.groep || 'vak' : 'vak');
  const rol = tekstInvoer(c && c.rol, { required: true, placeholder: 'Bijv. Loodgieter', autocomplete: 'off' });
  const naam = tekstInvoer(c && c.naam, { placeholder: 'Bijv. Eleveld Zeist', autocomplete: 'off' });
  const telefoon = el('input', { class: 'invoer', type: 'tel', value: c ? c.telefoon || '' : '', placeholder: '030 123 45 67' });
  const email = el('input', { class: 'invoer', type: 'email', value: c ? c.email || '' : '', placeholder: 'naam@bedrijf.nl', autocomplete: 'off' });
  const website = el('input', { class: 'invoer', type: 'url', value: c ? c.website || '' : '', placeholder: 'www.bedrijf.nl', autocomplete: 'off' });
  const notitie = tekstVak(c && c.notitie, { placeholder: 'Bijv. storingsdienst 24/7, doet ook het ketelonderhoud' });
  const opties = [['', '— geen —'], ...[...D.items].sort((a, b) => `${ruimteNaam(a.ruimteId)} ${a.naam}`.localeCompare(`${ruimteNaam(b.ruimteId)} ${b.naam}`, 'nl'))
    .map((i) => [i.id, `${ruimteNaam(i.ruimteId)} – ${i.naam}`])];
  const onderdeel = keuze(opties, c && c.itemId ? c.itemId : '');
  const gastId = nieuwId('gast');
  const gast = el('input', { id: gastId, type: 'checkbox', checked: c ? c.voorGasten !== false : true });
  dialoog({
    titel: c ? 'Contact bewerken' : 'Nieuw contact',
    bouw: (l) => l.append(
      veld('Groep', groep), veld('Wat doet hij/zij?', rol), veld('Naam of bedrijf', naam),
      veld('Telefoon', telefoon), veld('E-mail', email), veld('Website', website),
      veld('Hoort bij onderdeel (mag)', onderdeel, 'Dan zie je dit contact ook bij dat onderdeel.'),
      veld('Notitie', notitie),
      el('label', { class: 'vinkje', for: gastId }, gast, 'Zichtbaar voor gasten')),
    opslaan: () => {
      const m = email.value.trim();
      if (m && !geldigeMail(m)) { email.setAttribute('aria-invalid', 'true'); email.focus(); melding('Dit e-mailadres klopt niet.', true); return false; }
      const w = website.value.trim();
      if (w && !websiteLink(w)) { website.setAttribute('aria-invalid', 'true'); website.focus(); melding('Dit webadres klopt niet.', true); return false; }
      const data = {
        groep: groep.value, rol: rol.value.trim().slice(0, 80), naam: naam.value.trim().slice(0, 120),
        telefoon: telefoon.value.trim().slice(0, 40), email: m.slice(0, 120), website: w.slice(0, 200),
        notitie: notitie.value.trim().slice(0, 1000), itemId: onderdeel.value || null, voorGasten: gast.checked
      };
      if (c) opslag.update('contacten', c.id, data); else opslag.add('contacten', data);
      melding(c ? 'Contact bewaard' : 'Contact toegevoegd');
    },
    verwijder: c ? async () => {
      if (!await bevestig(`Contact "${contactTitel(c)}" verwijderen?`)) return false;
      opslag.remove('contacten', c.id);
    } : null
  });
}

function contactenBijItem(i) {
  const lijst = D.contacten.filter((c) => c.itemId === i.id);
  if (!lijst.length) return null;
  return el('section', { class: 'stapel' },
    el('h2', { class: 'kop-xs' }, 'Wie bel je?'),
    el('ul', { class: 'lijst' }, lijst.map(contactKaart)));
}

function viewMeer() {
  const rij = (icoon, tekst, actie, href) => el('li', {}, href
    ? el('a', { href, class: 'kaart lijst-rij' }, ico(icoon), el('span', { class: 'lijst-tekst' }, el('span', { class: 'lijst-titel' }, tekst)), ico('rechts', 20))
    : el('button', { type: 'button', class: 'kaart lijst-rij', onclick: actie }, ico(icoon), el('span', { class: 'lijst-tekst' }, el('span', { class: 'lijst-titel' }, tekst))));
  const demo = opslag.soort === 'demo';
  return el('div', { class: 'pagina' },
    el('h1', { class: 'titel' }, 'Meer'),
    el('ul', { class: 'lijst' },
      rij('let_op', 'Noodkaart bekijken', null, '#/nood'),
      rij('potlood', 'Noodkaart bewerken', noodBewerken),
      rij('telefoon', 'Contacten', null, '#/contacten'),
      rij('plus', 'Ruimte toevoegen', () => ruimteBewerken(null)),
      rij('importeer', 'Gegevens importeren', importeren),
      rij('papier', 'Alle PDF\'s offline bewaren', allesOffline)),
    el('section', { class: 'stapel' },
      el('h2', { class: 'kop-xs' }, 'Account'),
      el('div', { class: 'kaart kaart-p rij' }, ico('persoon'),
        el('span', { class: 'lijst-tekst' },
          el('span', { class: 'lijst-titel' }, demo ? 'Demo-modus' : (gebruiker && (gebruiker.displayName || gebruiker.email)) || 'Ingelogd'),
          el('span', { class: 'lijst-sub' }, demo ? 'Gegevens staan alleen op dit apparaat' : 'Gegevens worden gedeeld met je partner'))),
      el('ul', { class: 'lijst' },
        demo
          ? rij('uit', 'Demo stoppen', async () => {
            if (await bevestig('Demo stoppen? De voorbeeldgegevens worden gewist.', 'Stoppen')) {
              localStorage.removeItem(DEMO_SLEUTEL); localStorage.removeItem('onzewoning-modus'); location.hash = ''; location.reload();
            }
          })
          : rij('uit', 'Uitloggen', async () => { await uitloggen(); location.reload(); }))),
    el('section', { class: 'stapel' },
      el('h2', { class: 'kop-xs' }, 'Over deze app'),
      el('ul', { class: 'lijst' },
        rij('info', 'Help', null, 'help.html#help'),
        rij('let_op', 'Disclaimer', null, 'help.html#disclaimer'),
        rij('schild', 'Privacy', null, 'help.html#privacy'))),
    el('p', { class: 'zacht klein' }, 'Gasten uitnodigen met een link en code komt in de volgende fase.'),
    el('a', { href: 'https://bruindav.github.io/DigidaveStore/', class: 'versie meer-voet' },
      el('img', { src: 'digidave-logo.png', alt: '' }), `Onze Woning · ${VERSIE} · gemaakt door digidave`));
}

function nietGevonden() {
  return el('div', { class: 'pagina' }, el('p', { class: 'leeg' }, 'Dit onderdeel bestaat niet (meer).'), el('a', { href: '#/', class: 'knop knop-rand' }, 'Naar start'));
}

/* ---------- Dialogen ---------- */
function dialoog({ titel, bouw, opslaan, verwijder, opslaanLabel = 'Opslaan', bijAnnuleren }) {
  const titelId = nieuwId('dt');
  const d = el('dialog', { class: 'sheet', 'aria-labelledby': titelId });
  const lijf = el('div', { class: 'sheet-lijf' });
  let opgeslagen = false;
  const sluit = () => d.close();
  const form = el('form', { class: 'sheet-form', novalidate: true },
    el('div', { class: 'sheet-kop' }, el('h2', { id: titelId }, titel),
      el('button', { type: 'button', class: 'icoonknop', 'aria-label': 'Sluiten', onclick: sluit }, ico('kruis'))),
    lijf,
    el('div', { class: 'sheet-voet' },
      verwijder ? el('button', {
        type: 'button', class: 'knop knop-gevaar', onclick: async () => {
          if (await verwijder() !== false) { opgeslagen = true; sluit(); }
        }
      }, 'Verwijderen') : null,
      el('span', { class: 'flex1' }),
      opslaan ? el('button', { type: 'button', class: 'knop knop-rand', onclick: sluit }, 'Annuleren') : null,
      el('button', { type: 'submit', class: 'knop knop-primair' }, opslaan ? opslaanLabel : 'Sluiten')));
  bouw(lijf);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!opslaan) return sluit();
    const leeg = [...form.querySelectorAll('[required]')].filter((x) => !String(x.value || '').trim());
    form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
    if (leeg.length) {
      leeg.forEach((x) => x.setAttribute('aria-invalid', 'true'));
      leeg[0].focus();
      melding('Vul de verplichte velden in.', true);
      return;
    }
    try {
      if (await opslaan() !== false) { opgeslagen = true; sluit(); }
    } catch (err) { meldFout(err); }
  });
  d.addEventListener('close', () => { if (!opgeslagen && bijAnnuleren) bijAnnuleren(); d.remove(); });
  d.append(form);
  document.body.append(d);
  d.showModal();
  return d;
}

function bevestig(tekst, okLabel = 'Verwijderen') {
  return new Promise((resolve) => {
    let ja = false;
    const d = el('dialog', { class: 'sheet', 'aria-label': 'Bevestigen' });
    d.append(el('div', { class: 'sheet-form' },
      el('div', { class: 'sheet-lijf' }, el('p', { class: 'kop-xs', style: null }, tekst)),
      el('div', { class: 'sheet-voet' },
        el('span', { class: 'flex1' }),
        el('button', { type: 'button', class: 'knop knop-rand', onclick: () => d.close() }, 'Nee'),
        el('button', { type: 'button', class: 'knop knop-primair', onclick: () => { ja = true; d.close(); } }, okLabel))));
    d.addEventListener('close', () => { d.remove(); resolve(ja); });
    document.body.append(d);
    d.showModal();
  });
}

function fotoTonen(id, alt) {
  dialoog({ titel: alt || 'Foto', bouw: (lijf) => lijf.append(fotoImg(id, alt, 'foto-groot')) });
}

function veld(label, invoer, hint) {
  if (!invoer.id) invoer.id = nieuwId('v');
  return el('div', { class: 'veld' }, el('label', { for: invoer.id }, label), invoer, hint ? el('span', { class: 'veld-hint' }, hint) : null);
}
const tekstInvoer = (waarde, extra = {}) => el('input', { class: 'invoer', type: 'text', value: waarde || '', ...extra });
const tekstVak = (waarde, extra = {}) => el('textarea', { class: 'invoer', rows: '3', ...extra }, waarde || '');
function keuze(opties, waarde) {
  return el('select', { class: 'invoer' }, opties.map(([v, l]) => el('option', { value: v, selected: String(v) === String(waarde) ? true : null }, l)));
}

/* ---------- Bewerkschermen ---------- */
function ruimteBewerken(r) {
  const tr = fotoTracker();
  let fotoId = r ? r.fotoId || null : null;
  const naam = tekstInvoer(r && r.naam, { required: true, placeholder: 'Bijv. Keuken', autocomplete: 'off' });
  dialoog({
    titel: r ? 'Ruimte bewerken' : 'Nieuwe ruimte',
    bouw: (l) => l.append(veld('Naam', naam), el('div', { class: 'veld' }, el('span', { class: 'veld-label' }, 'Foto (mag)'), fotoVeld({ fotoId, tracker: tr, onWijzig: (id) => { fotoId = id; } }))),
    opslaan: () => {
      const data = { naam: naam.value.trim(), fotoId: fotoId || null };
      if (r) opslag.update('ruimtes', r.id, data);
      else {
        const id = opslag.add('ruimtes', { ...data, volgorde: volgendNummer(D.ruimtes) });
        location.hash = `#/ruimte/${id}`;
      }
      tr.bevestig();
    },
    bijAnnuleren: () => tr.terugdraaien(),
    verwijder: r ? async () => {
      if (itemsIn(r.id).length) { melding('Haal eerst de onderdelen uit deze ruimte weg.', true); return false; }
      if (!await bevestig(`Ruimte "${r.naam}" verwijderen?`)) return false;
      tr.terugdraaien();
      const weg = [['ruimtes', r.id]];
      if (r.fotoId) weg.push(['fotos', r.fotoId]);
      opslag.removeMany(weg);
      location.hash = '#/';
    } : null
  });
}

function fotosVanItem(i) {
  const ids = [];
  if (i.fotoId) ids.push(i.fotoId);
  ((i.uitleg || {}).stappen || []).forEach((s) => { if (s.fotoId) ids.push(s.fotoId); });
  return ids;
}

function itemBewerken(i, ruimteId) {
  const tr = fotoTracker();
  let fotoId = i ? i.fotoId || null : null;
  const naam = tekstInvoer(i && i.naam, { required: true, placeholder: 'Bijv. Oven', autocomplete: 'off' });
  const soort = tekstInvoer(i && i.soort, { placeholder: 'Bijv. Combi-magnetron', autocomplete: 'off' });
  const ruimtes = gesorteerdeRuimtes();
  const ruimte = keuze(ruimtes.map((r) => [r.id, r.naam]), i ? i.ruimteId : ruimteId);
  const gastId = nieuwId('g');
  const gast = el('input', { id: gastId, type: 'checkbox', checked: i ? !!i.voorGasten : true }); // fix-4: nieuw = standaard zichtbaar voor gasten
  dialoog({
    titel: i ? 'Onderdeel bewerken' : 'Nieuw apparaat of onderdeel',
    bouw: (l) => l.append(
      veld('Naam', naam), veld('Wat is het? (mag)', soort), veld('Ruimte', ruimte),
      el('label', { class: 'vinkje', for: gastId }, gast, 'Zichtbaar voor gasten'),
      el('div', { class: 'veld' }, el('span', { class: 'veld-label' }, 'Foto (mag)'), fotoVeld({ fotoId, tracker: tr, onWijzig: (id) => { fotoId = id; } }))),
    opslaan: () => {
      if (!ruimte.value) { melding('Maak eerst een ruimte aan.', true); return false; }
      const data = { naam: naam.value.trim(), soort: soort.value.trim(), ruimteId: ruimte.value, voorGasten: gast.checked, fotoId: fotoId || null };
      if (i) opslag.update('items', i.id, data);
      else {
        const id = opslag.add('items', { ...data, volgorde: volgendNummer(itemsIn(data.ruimteId)), uitleg: { intro: '', stappen: [], probleem: '' }, techniek: {} });
        location.hash = `#/item/${id}/uitleg`;
      }
      tr.bevestig();
    },
    bijAnnuleren: () => tr.terugdraaien(),
    verwijder: i ? async () => {
      if (!await bevestig(`"${i.naam}" verwijderen? Ook de uitleg, het onderhoud en de papieren gaan weg.`)) return false;
      tr.terugdraaien();
      const weg = [['items', i.id], ...fotosVanItem(i).map((f) => ['fotos', f])];
      D.onderhoud.filter((t) => t.itemId === i.id).forEach((t) => weg.push(['onderhoud', t.id]));
      D.historie.filter((h) => h.itemId === i.id).forEach((h) => weg.push(['historie', h.id]));
      D.papieren.filter((p) => p.itemId === i.id).forEach((p) => { weg.push(['papieren', p.id]); if (p.fotoId) weg.push(['fotos', p.fotoId]); pdfVerwijderen(p.bestand); });
      opslag.removeMany(weg);
      location.hash = `#/ruimte/${i.ruimteId}`;
    } : null
  });
}

function uitlegBewerken(i) {
  const tr = fotoTracker();
  const u = i.uitleg || {};
  const stappen = (u.stappen || []).map((s) => ({ tekst: s.tekst || '', fotoId: s.fotoId || null }));
  const intro = tekstVak(u.intro, { placeholder: 'Bijv. Zo zet je de tv aan.' });
  const probleem = tekstVak(u.probleem, { placeholder: 'Bijv. Geen beeld? Druk op Source en kies HDMI 1.' });
  const houder = el('div', { class: 'stapel' });
  function teken(focusLaatste) {
    houder.replaceChildren(
      ...stappen.map((s, n) => {
        const vak = tekstVak(s.tekst, { id: nieuwId('stap'), placeholder: 'Wat moet je doen? Kort en simpel.', oninput: (e) => { s.tekst = e.target.value; } });
        return el('div', { class: 'kaart stap-edit' },
          el('div', { class: 'stap-edit-kop' },
            el('span', { class: 'stapnr', 'aria-hidden': 'true' }, String(n + 1)),
            el('label', { for: vak.id, class: 'vet klein', style: null }, ` Stap ${n + 1}`),
            el('span', { class: 'flex1' }),
            el('button', { type: 'button', class: 'icoonknop', 'aria-label': `Stap ${n + 1} omhoog`, disabled: n === 0, onclick: () => { [stappen[n - 1], stappen[n]] = [stappen[n], stappen[n - 1]]; teken(); } }, ico('omhoog')),
            el('button', { type: 'button', class: 'icoonknop', 'aria-label': `Stap ${n + 1} omlaag`, disabled: n === stappen.length - 1, onclick: () => { [stappen[n + 1], stappen[n]] = [stappen[n], stappen[n + 1]]; teken(); } }, ico('omlaag')),
            el('button', { type: 'button', class: 'icoonknop', 'aria-label': `Stap ${n + 1} verwijderen`, onclick: () => { if (s.fotoId) tr.weg.add(s.fotoId); stappen.splice(n, 1); teken(); } }, ico('prullenbak'))),
          vak,
          fotoVeld({ fotoId: s.fotoId, tracker: tr, onWijzig: (id) => { s.fotoId = id; } }));
      }),
      el('button', { type: 'button', class: 'knop knop-rand knop-breed', onclick: () => { stappen.push({ tekst: '', fotoId: null }); teken(true); } }, ico('plus', 20), 'Stap toevoegen'));
    if (focusLaatste) { const v = houder.querySelectorAll('textarea'); if (v.length) v[v.length - 1].focus(); }
  }
  teken();
  dialoog({
    titel: `Uitleg: ${i.naam}`,
    bouw: (l) => l.append(
      el('p', { class: 'veld-hint' }, 'Schrijf alsof je het aan een gast uitlegt: korte zinnen, één handeling per stap.'),
      veld('Korte inleiding (mag)', intro),
      el('h3', { class: 'subkop' }, 'Stappen'), houder,
      veld('Lukt het niet? (tip, mag)', probleem)),
    opslaan: () => {
      opslag.update('items', i.id, {
        uitleg: { intro: intro.value.trim(), probleem: probleem.value.trim(), stappen: stappen.filter((s) => s.tekst.trim() || s.fotoId).map((s) => ({ tekst: s.tekst.trim(), fotoId: s.fotoId || null })) }
      });
      tr.bevestig();
    },
    bijAnnuleren: () => tr.terugdraaien()
  });
}

function taakBewerken(itemId, t) {
  const naam = tekstInvoer(t && t.taak, { required: true, placeholder: 'Bijv. Filter schoonmaken', autocomplete: 'off' });
  const interval = keuze(INTERVALLEN, t ? t.intervalMaanden : 12);
  const wie = keuze([['zelf', 'Zelf'], ['bedrijf', 'Bedrijf / installateur']], t ? t.wie : 'zelf');
  const contact = tekstInvoer(t && t.contact, { placeholder: 'Naam of telefoonnummer', autocomplete: 'off' });
  const laatst = el('input', { class: 'invoer', type: 'date', value: (t && t.laatst) || '', max: vandaagStr() });
  const notitie = tekstVak(t && t.notitie, { rows: '2', placeholder: 'Bijv. tussen 1,5 en 2 bar' });
  dialoog({
    titel: t ? 'Onderhoud bewerken' : 'Nieuwe onderhoudstaak',
    bouw: (l) => l.append(veld('Wat moet er gebeuren?', naam),
      el('div', { class: 'twee-kol' }, veld('Hoe vaak?', interval), veld('Wie doet het?', wie)),
      veld('Wie bel je? (mag)', contact),
      veld('Laatst gedaan (mag)', laatst, 'Leeg laten als je het niet weet.'),
      veld('Notitie (mag)', notitie)),
    opslaan: () => {
      const data = { itemId, taak: naam.value.trim(), intervalMaanden: Number(interval.value), wie: wie.value, contact: contact.value.trim(), laatst: laatst.value || '', notitie: notitie.value.trim() };
      if (t) opslag.update('onderhoud', t.id, data); else opslag.add('onderhoud', data);
    },
    verwijder: t ? async () => {
      if (!await bevestig(`Taak "${t.taak}" verwijderen?`)) return false;
      opslag.remove('onderhoud', t.id);
    } : null
  });
}

function papierBewerken(itemId, p) {
  const tr = fotoTracker();
  const ptr = pdfTracker();
  let fotoId = p ? p.fotoId || null : null;
  let bestand = p && p.bestand && p.bestand.id ? p.bestand : null;
  const itemKeuze = keuze([['', 'Algemeen (geen apparaat)'], ...[...D.items].sort(opNaam).map((i) => [i.id, `${i.naam} (${ruimteNaam(i.ruimteId)})`])], p ? p.itemId || '' : itemId || '');
  const soort = keuze(PAPIER_SOORTEN.map((s) => [s, s]), p ? p.soort : 'Handleiding');
  const titel = tekstInvoer(p && p.titel, { required: true, placeholder: 'Bijv. Handleiding gebruiker', autocomplete: 'off' });
  const datum = el('input', { class: 'invoer', type: 'date', value: (p && p.datum) || '' });
  const bedrag = tekstInvoer(p && p.bedrag, { inputmode: 'decimal', placeholder: 'Bijv. 149,00' });
  const link = el('input', { class: 'invoer', type: 'url', value: (p && p.link) || '', placeholder: 'https://…', autocomplete: 'off' });
  const notitie = tekstVak(p && p.notitie, { rows: '2' });
  dialoog({
    titel: p ? 'Papier bewerken' : 'Nieuw papier',
    bouw: (l) => l.append(
      veld('Hoort bij', itemKeuze),
      el('div', { class: 'twee-kol' }, veld('Soort', soort), veld('Datum (mag)', datum)),
      veld('Titel', titel),
      el('div', { class: 'veld' }, el('span', { class: 'veld-label' }, 'PDF (mag)'), el('span', { class: 'veld-hint' }, 'Bijv. de handleiding of de factuur. Werkt ook zonder internet. Max 20 MB.'),
        pdfVeld({ bestand, tracker: ptr, onWijzig: (m) => { bestand = m; } })),
      veld('Link (mag)', link, 'Bijv. de handleiding op de site van de fabrikant, of een bestand in Google Drive.'),
      el('div', { class: 'veld' }, el('span', { class: 'veld-label' }, 'Foto (mag)'), el('span', { class: 'veld-hint' }, 'Bijv. van de bon of de garantiekaart.'),
        fotoVeld({ fotoId, tracker: tr, onWijzig: (id) => { fotoId = id; } })),
      veld('Bedrag in € (mag)', bedrag),
      veld('Notitie (mag)', notitie)),
    opslaan: () => {
      const l = link.value.trim();
      if (l && !veiligeLink(l)) { link.setAttribute('aria-invalid', 'true'); link.focus(); melding('De link moet beginnen met https://', true); return false; }
      const data = { itemId: itemKeuze.value || null, soort: soort.value, titel: titel.value.trim(), datum: datum.value || '', bedrag: bedrag.value.trim(), link: l ? veiligeLink(l) : '', fotoId: fotoId || null, bestand: bestand || null, notitie: notitie.value.trim() };
      if (p) opslag.update('papieren', p.id, data); else opslag.add('papieren', data);
      tr.bevestig();
      ptr.bevestig();
    },
    bijAnnuleren: () => { tr.terugdraaien(); ptr.terugdraaien(); },
    verwijder: p ? async () => {
      if (!await bevestig(`"${p.titel}" verwijderen?`)) return false;
      tr.terugdraaien();
      ptr.terugdraaien();
      const weg = [['papieren', p.id]];
      if (p.fotoId) weg.push(['fotos', p.fotoId]);
      opslag.removeMany(weg);
      pdfVerwijderen(p.bestand);
    } : null
  });
}

function techniekBewerken(i) {
  const t = i.techniek || {};
  const velden = TECH_VELDEN.map(([k, l, type]) => [k, l, el('input', { class: 'invoer', type: type || 'text', value: t[k] || '', autocomplete: 'off' })]);
  const notities = tekstVak(t.notities, { rows: '5', placeholder: 'Bijv. hoe het systeem in elkaar zit, instellingen, waar onderdelen zitten.' });
  dialoog({
    titel: `Techniek: ${i.naam}`,
    bouw: (l) => l.append(...velden.map(([, lbl, inv]) => veld(lbl, inv)), veld('Technische uitleg', notities)),
    opslaan: () => {
      const data = {};
      velden.forEach(([k, , inv]) => { data[k] = inv.value.trim(); });
      data.notities = notities.value.trim();
      opslag.update('items', i.id, { techniek: data });
    }
  });
}

/* ---------- Importeren (fix-5) ----------
   Leest een importbestand (JSON) in dat Claude maakt op basis van handleidingen.
   Bestaande ruimtes/onderdelen worden herkend aan hun naam; alleen lege velden worden ingevuld,
   onderhoudstaken en papieren worden toegevoegd als er nog geen met dezelfde naam is. */
const importTekst = (v, max = 4000) => String(v ?? '').trim().slice(0, max);
const importDatum = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

function importTechniek(t) {
  const uit = {};
  if (!t || typeof t !== 'object') return uit;
  TECH_VELDEN.forEach(([k, , type]) => {
    const v = type === 'date' ? importDatum(t[k]) : importTekst(t[k], 200);
    if (v) uit[k] = v;
  });
  const n = importTekst(t.notities, 4000);
  if (n) uit.notities = n;
  return uit;
}

function verwerkImport(data, uitvoeren, bijwerken = false) {
  if (!data || data.formaat !== 'onzewoning-import' || (!Array.isArray(data.ruimtes) && !Array.isArray(data.contacten))) {
    throw new Error('Dit is geen importbestand van Onze Woning.');
  }
  const fotos = data.fotos && typeof data.fotos === 'object' ? data.fotos : {};
  const pdfs = data.pdfs && typeof data.pdfs === 'object' ? data.pdfs : {};
  const nieuweItems = new Map(); // fix-11: "ruimte|onderdeel" -> id, voor contacten in hetzelfde bestand
  const tel = { contactenNieuw: 0, contactenBijgewerkt: 0, noodContacten: 0, ruimtesNieuw: 0, itemsNieuw: 0, itemsAangevuld: 0, itemsBijgewerkt: 0, takenBijgewerkt: 0, taken: 0, papieren: 0, fotos: 0, pdfs: 0, pdfBytes: 0, pdfTaken: [] };
  // fix-9: PDF uit het importbestand (alleen geldige PDF's tot 20 MB)
  const pdfGeldig = (ref) => {
    if (!ref || !Object.prototype.hasOwnProperty.call(pdfs, ref)) return null;
    const b = pdfs[ref];
    if (typeof b !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(b)) return null;
    const grootte = Math.floor(b.length * 3 / 4) - (b.endsWith('==') ? 2 : b.endsWith('=') ? 1 : 0);
    if (grootte > PDF_MAX) return null;
    try { if (atob(b.slice(0, 8)).slice(0, 5) !== '%PDF-') return null; } catch { return null; }
    return { b, grootte };
  };
  const pdfErbij = (ref, papierId, naam) => {
    const g = pdfGeldig(ref);
    if (!g) return;
    tel.pdfs++; tel.pdfBytes += g.grootte;
    if (uitvoeren) tel.pdfTaken.push({ papierId, b64: g.b, naam });
  };
  const teWissenFotos = [];
  const fotoIds = new Map();
  const foto = (ref) => {
    if (!ref || !Object.prototype.hasOwnProperty.call(fotos, ref)) return null;
    const b = fotos[ref];
    if (typeof b !== 'string' || b.length >= 850000 || !/^[A-Za-z0-9+/=]+$/.test(b)) return null;
    if (!fotoIds.has(ref)) {
      tel.fotos++;
      let id = 'nieuw';
      if (uitvoeren) { id = opslag.fotoOpslaan(b, 0, 0); fotoCache.set(id, Promise.resolve(dataUrl(b))); }
      fotoIds.set(ref, id);
    }
    return fotoIds.get(ref);
  };
  const stappenVan = (lijst) => (Array.isArray(lijst) ? lijst : []).slice(0, 30)
    .map((s) => ({ tekst: importTekst(s && s.tekst, 1000), fotoId: foto(s && s.foto) }))
    .filter((s) => s.tekst || s.fotoId);

  let ruimteVolg = volgendNummer(D.ruimtes);
  (Array.isArray(data.ruimtes) ? data.ruimtes : []).slice(0, 50).forEach((r) => {
    const rnaam = importTekst(r && r.naam, 80);
    if (!rnaam) return;
    const ruimte = D.ruimtes.find((x) => norm(x.naam) === norm(rnaam));
    let rid = ruimte ? ruimte.id : null;
    if (!ruimte) {
      tel.ruimtesNieuw++;
      if (uitvoeren) rid = opslag.add('ruimtes', { naam: rnaam, fotoId: null, volgorde: ruimteVolg++ });
    }
    let itemVolg = volgendNummer(rid ? D.items.filter((i) => i.ruimteId === rid) : []);
    (Array.isArray(r.items) ? r.items : []).slice(0, 200).forEach((it) => {
      const inaam = importTekst(it && it.naam, 80);
      if (!inaam) return;
      const u = it.uitleg && typeof it.uitleg === 'object' ? it.uitleg : {};
      const bestaand = ruimte ? D.items.find((i) => i.ruimteId === rid && norm(i.naam) === norm(inaam)) : null;
      let iid = bestaand ? bestaand.id : null;
      if (!bestaand) {
        tel.itemsNieuw++;
        const nieuw = {
          naam: inaam, soort: importTekst(it.soort, 120), ruimteId: rid, voorGasten: it.voorGasten !== false,
          fotoId: foto(it.foto), volgorde: itemVolg++,
          uitleg: { intro: importTekst(u.intro), probleem: importTekst(u.probleem), stappen: stappenVan(u.stappen) },
          techniek: importTechniek(it.techniek)
        };
        if (uitvoeren) iid = opslag.add('items', nieuw);
        nieuweItems.set(`${norm(rnaam)}|${norm(inaam)}`, iid);
      } else if (bijwerken) {
        // fix-7: bestaande uitleg/techniek vervangen door de versie uit het bestand (alleen als de tekst anders is)
        const patch = {};
        if (importTekst(it.soort) && importTekst(it.soort, 120) !== (bestaand.soort || '')) patch.soort = importTekst(it.soort, 120);
        if (!bestaand.fotoId && it.foto) { const f = foto(it.foto); if (f) patch.fotoId = f; }
        const oud = bestaand.uitleg || {};
        const nieuweStappen = (Array.isArray(u.stappen) ? u.stappen : []).slice(0, 30);
        const tekstOud = JSON.stringify([oud.intro || '', oud.probleem || '', (oud.stappen || []).map((x) => x.tekst || '')]);
        const tekstNieuw = JSON.stringify([importTekst(u.intro), importTekst(u.probleem),
          nieuweStappen.map((x) => importTekst(x && x.tekst, 1000)).filter((t, n) => t || (nieuweStappen[n] && nieuweStappen[n].foto))]);
        if (tekstOud !== tekstNieuw) {
          const stappen = stappenVan(nieuweStappen);
          patch.uitleg = { intro: importTekst(u.intro), probleem: importTekst(u.probleem), stappen };
          const blijven = new Set(stappen.map((x) => x.fotoId).concat([bestaand.fotoId]));
          (oud.stappen || []).forEach((x) => { if (x.fotoId && !blijven.has(x.fotoId)) teWissenFotos.push(x.fotoId); });
        }
        const tech = { ...(bestaand.techniek || {}) };
        let techAnders = false;
        Object.entries(importTechniek(it.techniek)).forEach(([k, v]) => { if (tech[k] !== v) { tech[k] = v; techAnders = true; } });
        if (techAnders) patch.techniek = tech;
        if (Object.keys(patch).length) { tel.itemsBijgewerkt++; if (uitvoeren) opslag.update('items', iid, patch); }
      } else {
        const patch = {};
        if (!bestaand.soort && importTekst(it.soort)) patch.soort = importTekst(it.soort, 120);
        if (!bestaand.fotoId && it.foto) { const f = foto(it.foto); if (f) patch.fotoId = f; }
        const oud = bestaand.uitleg || {};
        const ul = { intro: oud.intro || '', probleem: oud.probleem || '', stappen: oud.stappen || [] };
        let ulAnders = false;
        if (!ul.intro && importTekst(u.intro)) { ul.intro = importTekst(u.intro); ulAnders = true; }
        if (!ul.probleem && importTekst(u.probleem)) { ul.probleem = importTekst(u.probleem); ulAnders = true; }
        if (!ul.stappen.length && Array.isArray(u.stappen) && u.stappen.length) { ul.stappen = stappenVan(u.stappen); ulAnders = true; }
        if (ulAnders) patch.uitleg = ul;
        const tech = { ...(bestaand.techniek || {}) };
        let techAnders = false;
        Object.entries(importTechniek(it.techniek)).forEach(([k, v]) => { if (!tech[k]) { tech[k] = v; techAnders = true; } });
        if (techAnders) patch.techniek = tech;
        if (Object.keys(patch).length) { tel.itemsAangevuld++; if (uitvoeren) opslag.update('items', iid, patch); }
      }
      const bestaandeTaken = bestaand ? D.onderhoud.filter((t) => t.itemId === bestaand.id) : [];
      const takenNamen = bestaandeTaken.map((t) => norm(t.taak));
      (Array.isArray(it.onderhoud) ? it.onderhoud : []).slice(0, 30).forEach((t) => {
        const taak = importTekst(t && t.taak, 120);
        if (!taak) return;
        if (takenNamen.includes(norm(taak))) {
          // fix-8: bij bijwerken ook de uitleg/interval van een bestaande taak vervangen ("laatst gedaan" blijft staan)
          const oudT = bestaandeTaken.find((x) => norm(x.taak) === norm(taak));
          if (bijwerken && oudT) {
            const tp = {};
            const notitie = importTekst(t.notitie, 1000);
            if (notitie && notitie !== (oudT.notitie || '')) tp.notitie = notitie;
            const iv = Number(t.intervalMaanden);
            if (INTERVALLEN.some(([n]) => n === iv) && iv !== oudT.intervalMaanden) tp.intervalMaanden = iv;
            const contact = importTekst(t.contact, 120);
            if (contact && contact !== (oudT.contact || '')) tp.contact = contact;
            if (Object.keys(tp).length) { tel.takenBijgewerkt++; if (uitvoeren) opslag.update('onderhoud', oudT.id, tp); }
          }
          return;
        }
        takenNamen.push(norm(taak));
        tel.taken++;
        if (uitvoeren) {
          opslag.add('onderhoud', {
            itemId: iid, taak,
            intervalMaanden: INTERVALLEN.some(([n]) => n === Number(t.intervalMaanden)) ? Number(t.intervalMaanden) : 12,
            wie: t.wie === 'bedrijf' ? 'bedrijf' : 'zelf', contact: importTekst(t.contact, 120),
            laatst: importDatum(t.laatst), notitie: importTekst(t.notitie, 1000)
          });
        }
      });
      const bestaandePapieren = bestaand ? D.papieren.filter((p) => p.itemId === bestaand.id) : [];
      const papierNamen = bestaandePapieren.map((p) => norm(p.titel));
      (Array.isArray(it.papieren) ? it.papieren : []).slice(0, 30).forEach((p) => {
        const titel = importTekst(p && p.titel, 120);
        if (!titel) return;
        const pdfNaam = `${titel.replace(/[\\/:*?"<>|]/g, '').slice(0, 100)}.pdf`;
        if (papierNamen.includes(norm(titel))) {
          // fix-9: bestaand papier zonder PDF krijgt de PDF uit het bestand; een eigen PDF blijft altijd staan
          const oudP = bestaandePapieren.find((x) => norm(x.titel) === norm(titel));
          if (oudP && !(oudP.bestand && oudP.bestand.id) && p.pdf) pdfErbij(p.pdf, oudP.id, pdfNaam);
          return;
        }
        papierNamen.push(norm(titel));
        tel.papieren++;
        const fotoId = foto(p.foto);
        let pid = null;
        if (uitvoeren) {
          pid = opslag.add('papieren', {
            itemId: iid, soort: PAPIER_SOORTEN.includes(p.soort) ? p.soort : 'Overig', titel,
            datum: importDatum(p.datum), bedrag: importTekst(p.bedrag, 20), link: veiligeLink(p.link) || '',
            fotoId: fotoId || null, notitie: importTekst(p.notitie, 1000)
          });
        }
        if (p.pdf) pdfErbij(p.pdf, pid, pdfNaam);
      });
    });
  });
  importContacten(data.contacten, uitvoeren, bijwerken, tel, nieuweItems);
  if (uitvoeren) teWissenFotos.forEach((id) => { opslag.fotoVerwijderen(id); fotoCache.delete(id); });
  return tel;
}

// fix-11: contacten uit het importbestand. Groep "nood" komt op de noodkaart, de rest in Contacten.
// Herkend aan rol + naam; bij bijwerken worden gewijzigde gegevens overschreven, anders alleen lege velden aangevuld.
function importContacten(lijst, uitvoeren, bijwerken, tel, nieuweItems) {
  if (!Array.isArray(lijst)) return;
  let nood = D.nood ? { blokken: [...(D.nood.blokken || [])], contacten: [...(D.nood.contacten || [])] } : null;
  let noodAnders = false;
  lijst.slice(0, 200).forEach((x) => {
    if (!x || typeof x !== 'object') return;
    const groep = ['nood', 'vak', 'lev', 'inst'].includes(x.groep) ? x.groep : 'vak';
    const rol = importTekst(x.rol, 80);
    const naam = importTekst(x.naam, 120);
    const telefoon = importTekst(x.telefoon, 40);
    if (!rol && !naam) return;
    if (groep === 'nood') {
      const label = naam || rol;
      if (!nood) nood = { blokken: standaardNoodkaart().blokken, contacten: [] };
      if (nood.contacten.some((c) => norm(c.naam) === norm(label))) return;
      nood.contacten.push({ naam: label, telefoon });
      tel.noodContacten++; noodAnders = true;
      return;
    }
    let itemId = null;
    const o = x.onderdeel && typeof x.onderdeel === 'object' ? x.onderdeel : null;
    if (o) {
      const rn = norm(importTekst(o.ruimte, 80)), inm = norm(importTekst(o.naam, 80));
      const r = D.ruimtes.find((y) => norm(y.naam) === rn);
      const it = r ? D.items.find((y) => y.ruimteId === r.id && norm(y.naam) === inm) : null;
      itemId = it ? it.id : (nieuweItems.get(`${rn}|${inm}`) || null);
    }
    const m = importTekst(x.email, 120);
    const data = {
      groep, rol, naam, telefoon, email: geldigeMail(m) ? m : '',
      website: websiteLink(x.website) ? importTekst(x.website, 200) : '', notitie: importTekst(x.notitie, 1000),
      itemId, voorGasten: x.voorGasten !== false
    };
    const bestaand = D.contacten.find((c) => norm(c.rol) === norm(rol) && norm(c.naam) === norm(naam));
    if (!bestaand) { tel.contactenNieuw++; if (uitvoeren) opslag.add('contacten', data); return; }
    const patch = {};
    ['telefoon', 'email', 'website', 'notitie'].forEach((k) => {
      if (data[k] && data[k] !== (bestaand[k] || '') && (bijwerken || !bestaand[k])) patch[k] = data[k];
    });
    if (data.itemId && !bestaand.itemId) patch.itemId = data.itemId;
    if (bijwerken && groep !== (bestaand.groep || 'vak')) patch.groep = groep;
    if (Object.keys(patch).length) { tel.contactenBijgewerkt++; if (uitvoeren) opslag.update('contacten', bestaand.id, patch); }
  });
  if (noodAnders && uitvoeren) opslag.setNood(nood);
}

function importSamenvatting(t) {
  const w = (n, een, meer) => (n ? `${n} ${n === 1 ? een : meer}` : null);
  return [
    w(t.ruimtesNieuw, 'nieuwe ruimte', 'nieuwe ruimtes'),
    w(t.itemsNieuw, 'nieuw onderdeel', 'nieuwe onderdelen'),
    w(t.itemsAangevuld, 'bestaand onderdeel aangevuld', 'bestaande onderdelen aangevuld'),
    w(t.itemsBijgewerkt, 'bestaand onderdeel bijgewerkt (uitleg/techniek vervangen)', 'bestaande onderdelen bijgewerkt (uitleg/techniek vervangen)'),
    w(t.taken, 'onderhoudstaak', 'onderhoudstaken'),
    w(t.takenBijgewerkt, 'bestaande onderhoudstaak bijgewerkt', 'bestaande onderhoudstaken bijgewerkt'),
    w(t.papieren, 'papier', 'papieren'),
    w(t.fotos, 'foto', "foto's"),
    w(t.contactenNieuw, 'nieuw contact', 'nieuwe contacten'),
    w(t.contactenBijgewerkt, 'bestaand contact bijgewerkt', 'bestaande contacten bijgewerkt'),
    w(t.noodContacten, 'contact op de noodkaart', 'contacten op de noodkaart'),
    t.pdfs ? `${aantalPdf(t.pdfs)} (${fmtMB(t.pdfBytes)})` : null
  ].filter(Boolean);
}

// fix-9: PDF's uit het importbestand één voor één opslaan, met voortgang
async function importPdfs(taken) {
  let fout = 0;
  for (let i = 0; i < taken.length; i++) {
    const t = taken[i];
    try {
      melding(`PDF ${i + 1} van ${taken.length} opslaan… (niet afsluiten)`);
      const bytes = vanB64(t.b64);
      const meta = await opslag.bestandOpslaan(t.naam, bytes, () => {});
      opslag.update('papieren', t.papierId, { bestand: meta });
      const c = await pdfCache();
      if (c) { try { await c.put(pdfSleutel(meta.id), new Response(new Blob([bytes], { type: 'application/pdf' }), { headers: { 'Content-Type': 'application/pdf' } })); } catch { /* vol */ } }
    } catch { fout++; }
  }
  return fout;
}

function importeren() {
  const invoer = el('input', { type: 'file', accept: '.json,application/json', class: 'sr', tabindex: '-1', 'aria-hidden': 'true' });
  document.body.append(invoer);
  invoer.addEventListener('change', async () => {
    const f = invoer.files && invoer.files[0];
    invoer.remove();
    if (!f) return;
    if (f.size > 120 * 1024 * 1024) { melding('Dit bestand is te groot.', true); return; } // fix-9: ruimer, PDF's kunnen erin zitten
    let data;
    try { data = JSON.parse(await f.text()); } catch { melding('Dit is geen geldig importbestand.', true); return; }
    let gewoon, bij;
    try { gewoon = verwerkImport(data, false, false); bij = verwerkImport(data, false, true); } catch (e) { meldFout(e); return; }
    const kanBijwerken = bij.itemsBijgewerkt > 0 || bij.takenBijgewerkt > 0 || bij.contactenBijgewerkt > gewoon.contactenBijgewerkt;
    // fix-8: staat er in het bestand een nieuwere uitleg, dan staat "bijwerken" standaard aan
    let bijwerken = kanBijwerken;
    const vakId = nieuwId('bij');
    const overzicht = el('div', { class: 'stapel' });
    const tekenOverzicht = () => {
      const regels = importSamenvatting(bijwerken ? bij : gewoon);
      vervang(overzicht, regels.length
        ? [el('p', {}, 'Dit gebeurt:'), el('ul', { class: 'klein' }, regels.map((r) => el('li', {}, r)))]
        : el('p', { class: 'leeg' }, kanBijwerken ? 'Er is niets nieuws. Wel is de uitleg in het bestand anders dan in de app: vink hieronder "bijwerken" aan.' : 'Er is niets nieuws om te importeren. Alles staat er al.'));
    };
    tekenOverzicht();
    dialoog({
      titel: 'Gegevens importeren',
      bouw: (l) => vervang(l,
        overzicht,
        kanBijwerken ? el('label', { class: 'vinkje', for: vakId },
          el('input', { id: vakId, type: 'checkbox', checked: bijwerken, onchange: (e) => { bijwerken = e.target.checked; tekenOverzicht(); } }),
          'Bestaande uitleg, techniek en onderhoudstips bijwerken met de versie uit het bestand') : null,
        el('p', { class: 'veld-hint' }, kanBijwerken
          ? 'Met vinkje wordt de uitleg vervangen door die uit het bestand; eigen aanpassingen in die uitleg gaan dan verloren. Zonder vinkje worden alleen lege velden aangevuld. "Laatst gedaan" bij onderhoud en je papieren blijven altijd staan.'
          : 'Wat je zelf al hebt ingevuld, blijft staan. Alleen lege velden worden aangevuld.')),
      opslaanLabel: 'Importeren',
      opslaan: (importSamenvatting(gewoon).length || kanBijwerken) ? () => {
        if (!importSamenvatting(bijwerken ? bij : gewoon).length) { melding('Vink "bijwerken" aan of kies Annuleren.', true); return false; }
        const gekozen = bijwerken ? bij : gewoon;
        if (gekozen.pdfs && opslag.soort === 'cloud' && !navigator.onLine) { melding('Voor het importeren van PDF\'s heb je internet nodig.', true); return false; }
        const klaar = verwerkImport(data, true, bijwerken);
        if (!klaar.pdfTaken.length) { melding(`Geïmporteerd: ${importSamenvatting(klaar).join(', ')}`); return; }
        importPdfs(klaar.pdfTaken).then((fout) => {
          melding(fout ? `Geïmporteerd, maar ${aantalPdf(fout)} lukte niet. Probeer het later opnieuw.` : `Geïmporteerd: ${importSamenvatting(klaar).join(', ')}`, !!fout);
        });
      } : null
    });
  });
  invoer.click();
}

function noodBewerken() {
  const tr = fotoTracker();
  const bron = D.nood || standaardNoodkaart();
  const blokken = (bron.blokken || []).map((b) => ({ titel: b.titel || '', tekst: b.tekst || '', fotoId: b.fotoId || null }));
  const contacten = (bron.contacten || []).map((c) => ({ naam: c.naam || '', telefoon: c.telefoon || '' }));
  const blokHouder = el('div', { class: 'stapel' });
  const contactHouder = el('div', { class: 'stapel' });
  function tekenBlokken() {
    blokHouder.replaceChildren(...blokken.map((b, n) => el('div', { class: 'kaart stap-edit' },
      el('div', { class: 'stap-edit-kop' }, el('b', {}, `Situatie ${n + 1}`), el('span', { class: 'flex1' }),
        el('button', { type: 'button', class: 'icoonknop', 'aria-label': `Situatie ${n + 1} verwijderen`, onclick: () => { if (b.fotoId) tr.weg.add(b.fotoId); blokken.splice(n, 1); tekenBlokken(); } }, ico('prullenbak'))),
      veld('Wat is er aan de hand?', tekstInvoer(b.titel, { placeholder: 'Bijv. Water lekt', oninput: (e) => { b.titel = e.target.value; } })),
      veld('Wat moet je doen?', tekstVak(b.tekst, { oninput: (e) => { b.tekst = e.target.value; } })),
      fotoVeld({ fotoId: b.fotoId, tracker: tr, onWijzig: (id) => { b.fotoId = id; } }))),
    el('button', { type: 'button', class: 'knop knop-rand knop-breed', onclick: () => { blokken.push({ titel: '', tekst: '', fotoId: null }); tekenBlokken(); } }, ico('plus', 20), 'Situatie toevoegen'));
  }
  function tekenContacten() {
    contactHouder.replaceChildren(...contacten.map((c, n) => el('div', { class: 'twee-kol', style: null },
      veld('Naam', tekstInvoer(c.naam, { oninput: (e) => { c.naam = e.target.value; } })),
      el('div', { class: 'rij', style: null },
        el('div', { class: 'flex1' }, veld('Telefoon', el('input', { class: 'invoer', type: 'tel', value: c.telefoon, oninput: (e) => { c.telefoon = e.target.value; } }))),
        el('button', { type: 'button', class: 'icoonknop', 'aria-label': `${c.naam || 'Contact'} verwijderen`, onclick: () => { contacten.splice(n, 1); tekenContacten(); } }, ico('prullenbak'))))),
    el('button', { type: 'button', class: 'knop knop-rand knop-breed', onclick: () => { contacten.push({ naam: '', telefoon: '' }); tekenContacten(); } }, ico('plus', 20), 'Contact toevoegen'));
  }
  tekenBlokken(); tekenContacten();
  dialoog({
    titel: 'Noodkaart bewerken',
    bouw: (l) => l.append(el('h3', { class: 'subkop' }, 'Situaties'), blokHouder, el('h3', { class: 'subkop' }, 'Wie bel je?'), contactHouder),
    opslaan: () => {
      opslag.setNood({
        blokken: blokken.filter((b) => b.titel.trim() || b.tekst.trim()).map((b) => ({ titel: b.titel.trim(), tekst: b.tekst.trim(), fotoId: b.fotoId || null })),
        contacten: contacten.filter((c) => c.naam.trim() || c.telefoon.trim()).map((c) => ({ naam: c.naam.trim(), telefoon: c.telefoon.trim() }))
      });
      tr.bevestig();
    },
    bijAnnuleren: () => tr.terugdraaien()
  });
}

start();
