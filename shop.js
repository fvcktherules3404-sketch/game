// shop.js — katalog, tas, checkout, kasir. Memakai firebase.js milik website utama (saveOrder, listenProduk, voucher, auth).
// TIDAK ada katalog/harga/ID order buatan sendiri: semua dari Firestore project fvcktherules-store.
import { mulaiBayar, isPaying, payApi, tampilLoadingBayar, sembunyiLoadingBayar, statusNorm, waitText } from './pay.js?v=20261050';
export const MAIN_ORIGIN = 'https://fucktherules.my.id';
const FB_URL = MAIN_ORIGIN + '/firebase.js?v=20261045';          // modul yang sama dengan website utama (satu sumber kebenaran; versi disamakan dgn script.js utama)
const GAS_ORDER_BACKUP = 'https://script.google.com/macros/s/AKfycbz3vRP4hkKjzv7b_lc3Qq6N5bhXZk44WJZd19fTNJNblwiGBGDH8uw0LKrFckqosBxtzw/exec';
const GAS_BITESHIP = 'https://script.google.com/macros/s/AKfycbyDTEPvP5yndja35U02nkC4lsYRy3vQqVe2s4NTx-MxBE8MCSB9co2ztG5ZDMtJzuAO/exec';
const WILAYAH = 'https://www.emsifa.com/api-wilayah-indonesia/v2';
const SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const AKS = '-';                       // varian tunggal aksesoris (tanpa warna/ukuran); sama dengan stokIdAks() di firebase.js
const CART_KEY = 'fvckgame.cart.v1', LAST_KEY = 'fvckgame.lastReceipt.v1';

export const S = { products: [], acc: [], status: 'loading', fb: null, user: null, cart: [], listeners: new Set() };
let stokMap = {}, stokPids = {};      // stok per varian (warna+ukuran) dari koleksi "stok" toko utama
let view = '';                        // tampilan panel saat ini ('product' = detail produk)
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const rp = n => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
// Keterangan produk dari admin berisi HTML sederhana (<b>, <br>, dst). Tampilkan sebagai format, tapi buang tag/atribut berbahaya.
const RICH_OK = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'UL', 'OL', 'LI', 'SPAN', 'SMALL', 'DIV', 'A']);
const RICH_DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'SVG', 'MATH']);
export function rich(src) {
  const html = String(src ?? '').replace(/\\n|\n/g, '<br>');
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  (function walk(node) {
    [...node.childNodes].forEach(ch => {
      if (ch.nodeType === 3) return;
      if (ch.nodeType !== 1) { ch.remove(); return; }
      if (RICH_DROP.has(ch.tagName.toUpperCase())) { ch.remove(); return; }
      walk(ch);
      if (!RICH_OK.has(ch.tagName)) { ch.replaceWith(...ch.childNodes); return; }
      const href = ch.tagName === 'A' ? ch.getAttribute('href') : null;
      [...ch.attributes].forEach(a => ch.removeAttribute(a.name));
      if (href && /^https?:\/\//i.test(href)) { ch.setAttribute('href', href); ch.setAttribute('target', '_blank'); ch.setAttribute('rel', 'noopener noreferrer'); }
    });
  })(doc.body);
  return doc.body.innerHTML;
}
const digits = v => Number(String(v ?? '').replace(/\D/g, '')) || 0;
const $ = (s, r = document) => r.querySelector(s);

/* ---------- UI panel ---------- */
let ui = { onChange: () => {}, onCart: () => {}, toast: () => {}, beep: () => {} };
export function bindUI(x) { ui = { ...ui, ...x }; }
const P = { el: $('#panel'), body: $('#pBody'), title: $('#pTitle'), back: $('#pBack'), backFn: null };
function show(title, html, backFn) {
  P.el.hidden = false; P.title.textContent = title; P.body.innerHTML = html; P.body.scrollTop = 0;
  P.backFn = backFn || null; P.back.hidden = !backFn; view = ''; ui.onChange(true);
}
export function closePanel() { P.el.hidden = true; ui.onChange(false); }
export const panelOpen = () => !P.el.hidden;
$('#pClose').onclick = closePanel; $('#pBack').onclick = () => P.backFn && P.backFn();
P.el.addEventListener('pointerdown', e => { if (e.target === P.el) closePanel(); });

/* ---------- Firebase + katalog (live) ---------- */
export async function initShop(onUpdate) {
  loadCart();
  try {
    S.fb = await import(FB_URL);
    S.fb.listenProduk(list => {
      S.products = list.map(p => ({
        id: p.id, name: p.nama || '', price: p.harga, priceN: digits(p.harga), badge: (p.badge || '').toLowerCase(),
        status: p.status || '', colors: p.warna ? p.warna.split('/').map(c => c.trim()).filter(Boolean) : [],
        stock: p.stok ? p.stok.split('/').map(s => s.trim()) : [], thumb: p.thumbnail || '', design: p.desain || '', details: p.details || [],
        specs: p.specs || '', addons: Array.isArray(p.tambahan) ? p.tambahan.filter(a => a && a.nama).map(a => ({ nama: String(a.nama), harga: Number(a.harga) || 0 })) : [], dpAllowed: p.dpAllowed || 'yes', dpMode: p.dpMode || '', dpValue: Number(p.dpValue) || 0, kodePrefix: p.kodePrefix || '', poClosed: !!p.poClosed, order: p.order || 0
      })).filter(p => ['pre', 'ready', 'sold'].includes(p.badge)).sort((a, b) => b.order - a.order);
      S.status = 'ok'; notify(onUpdate);
    }, err => { console.error(err); S.status = 'error'; notify(onUpdate); });
    // Aksesoris: koleksi terpisah, tanpa warna/ukuran. Dinormalisasi ke bentuk produk (varian tunggal '-') supaya
    // keranjang, stok, checkout & struk memakai kode yang sama dengan kaos.
    if (S.fb.listenAksesoris) S.fb.listenAksesoris(list => {
      S.acc = list.map(p => ({
        id: p.id, acc: true, name: p.nama || '', price: p.harga, priceN: digits(p.harga), badge: (p.badge || '').toLowerCase(),
        status: p.status || '', colors: [AKS], stock: [AKS], thumb: p.thumbnail || '', design: p.desain || '', details: p.details || [],
        specs: p.specs || '', addons: [], dpAllowed: p.dpAllowed || 'yes', dpMode: p.dpMode || '', dpValue: Number(p.dpValue) || 0, kodePrefix: p.kodePrefix || '', poClosed: !!p.poClosed, order: p.order || 0, big: !!p.besar   // big = tampil besar menempel di tembok (game 3D), tanpa bingkai
      })).filter(p => ['pre', 'ready', 'sold'].includes(p.badge)).sort((a, b) => b.order - a.order);
      notify(onUpdate); if (view === 'product' && !P.el.hidden && sel.pid) openProduct(sel.pid, P.backFn);
    }, err => { console.error('aksesoris', err); S.acc = []; notify(onUpdate); });
    if (S.fb.listenStok) S.fb.listenStok(docs => {
      stokMap = {}; stokPids = {};
      docs.forEach(d => { stokMap[d.id] = Number(d.qty) || 0; if (d.pid) stokPids[d.pid] = true; });
      notify(onUpdate);
      if (view === 'product' && !P.el.hidden && sel.pid) openProduct(sel.pid, P.backFn);
    });
    S.fb.onAuthStateChanged(S.fb.auth, u => { S.user = u; });
  } catch (e) { console.error('Gagal memuat firebase.js utama', e); S.status = 'error'; notify(onUpdate); }
}
function notify(cb) { cb && cb(S.status); S.listeners.forEach(f => f()); }
const byId = id => S.products.find(p => p.id === id) || S.acc.find(p => p.id === id);
const stokTracked = p => !!(p && stokPids[p.id]);
const stokQty = (p, color, size) => Number(stokMap[S.fb.stokId(p.id, color, size)]) || 0;
const stokTotal = (p, color) => p.acc ? stokQty(p, AKS, AKS) : SIZES.reduce((n, sz) => n + (color ? stokQty(p, color, sz) : p.colors.reduce((a, c) => a + stokQty(p, c, sz), 0)), 0);
const sizeOk = (p, color, size) => !stokTracked(p) ? p.stock.includes(size) : (color ? stokQty(p, color, size) > 0 : p.colors.some(c => stokQty(p, c, size) > 0));
const warnaOk = (p, color) => p.acc ? (!stokTracked(p) || stokQty(p, AKS, AKS) > 0) : !stokTracked(p) || SIZES.some(sz => stokQty(p, color, sz) > 0);
// tambahan opsional (lengan panjang, bundling, dst): pilihan disimpan sebagai daftar nama
const addonsOf = (p, names) => (names || []).map(n => (p.addons || []).find(a => a.nama === n)).filter(Boolean);
const unitPrice = (p, names) => p.priceN + addonsOf(p, names).reduce((n, a) => n + a.harga, 0);
const addonText = (p, names) => addonsOf(p, names).map(a => a.nama).join(', ');
// teks varian: kaos "Hitam|M", aksesoris tidak punya varian
const varTxt = (color, size) => (color === AKS && size === AKS) ? '' : ` (${color}|${size})`;
const addonKey = names => [...(names || [])].sort().join('|');
export const orderable = p => !!p && (p.badge === 'pre' || p.badge === 'ready') && !p.poClosed && p.colors.length > 0 && p.stock.length > 0 && !(stokTracked(p) && stokTotal(p) <= 0);
const stateMsg = () => S.status === 'loading' ? '<div class="msg">Memuat katalog dari toko utama…</div>'
  : S.status === 'error' ? `<div class="msg err">Gagal memuat katalog (koneksi / Firebase). Coba muat ulang, atau buka <a href="${MAIN_ORIGIN}" style="color:inherit">toko utama</a>.</div>`
  : !S.products.length && !S.acc.length ? '<div class="msg">Belum ada produk di katalog.</div>' : '';

/* ---------- Keranjang ---------- */
function loadCart() { try { const c = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); S.cart = Array.isArray(c) ? c.filter(i => i && i.pid && i.color && i.size && i.qty > 0).map(i => ({ ...i, addons: Array.isArray(i.addons) ? i.addons : [] })).slice(0, 50) : []; } catch { S.cart = []; } }
function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(S.cart)); } catch {} ui.onCart(cartCount()); }
export const cartCount = () => S.cart.reduce((n, i) => n + i.qty, 0);
// Validasi tiap baris terhadap data katalog TERBARU (harga selalu dari Firestore, bukan dari localStorage)
function lines() {
  return S.cart.map(i => {
    const p = byId(i.pid); let err = '';
    if (S.status !== 'ok') err = 'Katalog belum dimuat';
    else if (!p) err = 'Produk sudah tidak ada';
    else if (!orderable(p)) err = p.poClosed ? 'Pre Order ditutup' : 'Tidak tersedia';
    else if (!p.colors.includes(i.color)) err = 'Warna tidak tersedia';
    else if (!sizeOk(p, i.color, i.size) || (stokTracked(p) && stokQty(p, i.color, i.size) <= 0)) err = 'Ukuran habis';
    else if (stokTracked(p) && i.qty > stokQty(p, i.color, i.size)) err = `Stok tinggal ${stokQty(p, i.color, i.size)}`;
    const unit = p ? unitPrice(p, i.addons) : 0;
    return { ...i, p, err, unit, sub: p && !err ? unit * i.qty : 0 };
  });
}
const subtotal = () => lines().reduce((n, l) => n + l.sub, 0);
export function addToCart(pid, color, size, qty, addons = []) {
  const p = byId(pid);
  if (!orderable(p) || !p.colors.includes(color) || !sizeOk(p, color, size)) return false;
  const ak = addonKey(addons);
  const ex = S.cart.find(i => i.pid === pid && i.color === color && i.size === size && addonKey(i.addons) === ak);
  const sudah = S.cart.filter(i => i.pid === pid && i.color === color && i.size === size).reduce((n, i) => n + i.qty, 0);
  if (stokTracked(p) && sudah + qty > stokQty(p, color, size)) return 'stok';
  if (ex) ex.qty = Math.min(20, ex.qty + qty); else S.cart.push({ pid, color, size, qty, addons: addonsOf(p, addons).map(a => a.nama) });
  saveCart(); return true;
}

/* ---------- Katalog & produk ---------- */
const FILTERS = { all: ['SEMUA', () => true], pre: ['PRE ORDER', p => p.badge === 'pre'], ready: ['READY STOCK', p => p.badge === 'ready'], sold: ['ARSIP', p => p.badge === 'sold'], acc: ['AKSESORIS', p => !!p.acc] };
export function openCatalog(f = 'all') {
  if (!FILTERS[f]) f = 'all';
  const list = S.products.concat(S.acc).filter(FILTERS[f][1]);
  const tabs = Object.entries(FILTERS).map(([k, v]) => `<button class="chip ${k === f ? 'on' : ''}" data-act="cat" data-v="${k}">${v[0]}</button>`).join('');
  const grid = list.map(p => `<button class="card ${p.badge === 'sold' ? 'sold' : ''}" data-act="prod" data-v="${esc(p.id)}">
    <span class="badge">${esc(p.status || p.badge.toUpperCase())}</span><img src="${esc(p.thumb)}" alt="${esc(p.name)}" loading="lazy">
    <div class="t">${esc(p.name)}</div><div class="p">${esc(rp(p.priceN))}</div></button>`).join('');
  show('KATALOG', `<div class="chips" style="margin-bottom:12px">${tabs}</div>${stateMsg() || (list.length ? `<div class="grid">${grid}</div>` : `<div class="msg">${f === 'acc' ? 'Belum ada aksesoris.' : 'Tidak ada produk di rak ini.'}</div>`)}
    <div class="foot"><button class="pri" data-act="cart">TAS BELANJA (${cartCount()})</button></div>`);
}
let sel = { pid: '', color: '', size: '', qty: 1, addons: [] };
function stokInfoText(p) {
  if (!stokTracked(p)) return '';
  const q = (sel.color && sel.size) ? stokQty(p, sel.color, sel.size) : stokTotal(p, sel.color);
  const lb = (sel.color && sel.size) ? 'Stok' : (sel.color ? `Stok ${sel.color}` : 'Total stok');
  return `<div class="stokinfo ${q <= 0 ? 'habis' : q <= 5 ? 'tipis' : ''}">${esc(q <= 0 ? `${lb}: habis` : `${lb}: ${q}${q <= 5 ? ' · tinggal sedikit!' : ''}`)}</div>`;
}
export function openProduct(pid, back = () => openCatalog()) {
  const p = byId(pid); if (!p) return openCatalog();
  const lanjut = view === 'product' && sel.pid === pid;           // render ulang (pilih opsi / stok berubah): jangan lompat ke atas
  const keep = lanjut ? P.body.scrollTop : 0;
  if (sel.pid !== pid) sel = { pid, color: p.colors.length === 1 ? p.colors[0] : '', size: p.acc ? AKS : '', qty: 1, addons: [] };
  if (sel.color && !warnaOk(p, sel.color)) sel.color = '';
  if (sel.size && !sizeOk(p, sel.color, sel.size)) sel.size = '';
  if (p.acc) { sel.color = AKS; sel.size = AKS; }                 // aksesoris: varian tunggal, tidak ada pilihan warna/ukuran
  sel.addons = sel.addons.filter(n => (p.addons || []).some(a => a.nama === n));
  const ok = orderable(p);
  const imgs = (p.details.length ? p.details : [p.thumb]).map(u => `<img src="${esc(u)}" alt="${esc(p.name)}" loading="lazy">`).join('');
  const colors = p.colors.map(c => { const a = warnaOk(p, c); return `<button class="chip ${sel.color === c ? 'on' : ''}" ${a ? '' : 'disabled'} data-act="color" data-v="${esc(c)}">${esc(c)}</button>`; }).join('');
  const sizes = SIZES.map(s => { const a = sizeOk(p, sel.color, s); return `<button class="chip ${sel.size === s ? 'on' : ''}" ${a ? '' : 'disabled'} data-act="size" data-v="${s}">${s}</button>`; }).join('');
  const adds = (p.addons || []).map((a, i) => `<button class="chip addon ${sel.addons.includes(a.nama) ? 'on' : ''}" data-act="addon" data-v="${i}"><span>${esc(a.nama)}</span><b>+${esc(rp(a.harga))}</b></button>`).join('');
  const why = ok ? '' : `<div class="msg err">${p.badge === 'sold' ? 'Produk ini sudah habis (arsip).' : p.poClosed ? 'Pre Order sudah ditutup.' : (stokTracked(p) && stokTotal(p) <= 0) ? 'Stok habis.' : 'Stok/varian belum tersedia.'}</div>`;
  show(p.name.toUpperCase(), `<div class="slot">${imgs}</div><h2>${esc(p.name)}</h2><div class="price">${esc(rp(unitPrice(p, sel.addons)))} <small style="color:var(--g3);font-size:12px">${esc(p.status)}</small></div>
    ${why}${ok ? `${p.acc ? '' : `<div class="lbl">PILIH WARNA</div><div class="chips colors">${colors}</div>
    <div class="lbl">PILIH UKURAN</div><div class="chips sizes">${sizes}</div>`}${stokInfoText(p)}
    ${adds ? `<div class="lbl">TAMBAHAN (OPSIONAL)</div><div class="addons">${adds}</div>` : ''}
    ${p.acc ? '' : '<button class="guide" data-act="guide">Panduan ukuran (Size Guide)</button>'}
    <div class="lbl">JUMLAH</div><div class="qty"><button data-act="qty" data-v="-1">−</button><b id="qv">${sel.qty}</b><button data-act="qty" data-v="1">+</button></div>
    <div class="err-t" id="perr"></div><div class="foot"><button class="accent" data-act="add">ADD TO CART</button></div>` : ''}
    <div class="specs"><div class="lbl" style="margin-top:0">SPESIFIKASI PRODUK</div><div class="specs-t">${p.specs ? rich(p.specs) : 'Spesifikasi belum tersedia.'}</div></div>`, back);
  P.body.dataset.pid = pid; P.backFn = back; view = 'product'; P.body.scrollTop = keep;
}
function openSizeGuide() {
  show('PANDUAN UKURAN', `<img src="${MAIN_ORIGIN}/size.jpg" alt="Panduan ukuran" style="width:100%;border-radius:18px;background:#fff;display:block">`, () => openProduct(sel.pid, P.backFn));
}

/* ---------- Tas ---------- */
export function openCart() {
  const L = lines();
  const body = !L.length ? '<div class="msg">Tas masih kosong. Ambil kaos dari rak atau aksesoris dari meja.</div>' : L.map((l, i) => `<div class="line">
    <img src="${esc(l.p?.thumb || '')}" alt=""><div class="m"><b>${esc(l.p?.name || 'Produk dihapus')}</b><small>${l.p?.acc ? 'Aksesoris' : esc(l.color) + ' | ' + esc(l.size)}${l.p ? esc(addonText(l.p, l.addons) ? ' + ' + addonText(l.p, l.addons) : '') : ''}</small>
    ${l.err ? `<small style="color:var(--red)">${esc(l.err)}</small>` : `<small>${rp(l.unit)} × ${l.qty} = ${rp(l.sub)}</small>`}</div>
    <div class="qty"><button data-act="cq" data-i="${i}" data-v="-1">−</button><b>${l.qty}</b><button data-act="cq" data-i="${i}" data-v="1">+</button></div>
    <button data-act="cdel" data-i="${i}" aria-label="Hapus">✕</button></div>`).join('');
  const bad = L.some(l => l.err);
  show('TAS BELANJA', `${body}${L.length ? `<div class="row tot"><span>SUBTOTAL</span><span>${rp(subtotal())}</span></div>
    ${bad ? '<div class="err-t">Hapus item bermasalah (merah) sebelum checkout.</div>' : ''}
    <div class="foot"><button class="pri" data-act="checkout" ${bad || S.status !== 'ok' ? 'disabled' : ''}>KE KASIR / CHECKOUT</button><button data-act="cat" data-v="all">LANJUT BELANJA</button></div>` : ''}`);
}

/* ---------- Checkout ---------- */
const coBaru = () => ({ f: {}, ongkir: 0, areaId: '', voucher: null, busy: false, tok: 0 });
let co = coBaru();
function calc() {
  const sub = subtotal(); let d = 0; const v = co.voucher;
  if (v) d = v.tipe === 'nominal' ? Number(v.nilai) : v.tipe === 'persen' ? Math.round(sub * Number(v.nilai) / 100) : v.tipe === 'free_ongkir' ? co.ongkir : 0;
  d = Math.max(0, Math.min(d, sub + co.ongkir));
  return { sub, ongkir: co.ongkir, d, total: sub + co.ongkir - d };
}
const opt = (arr, ph) => `<option value="">${ph}</option>` + arr.map(([v, c, x]) => `<option value="${esc(v)}" data-c="${esc(c || '')}" data-z="${esc(x || '')}">${esc(v)}</option>`).join('');
const tc = s => s.toLowerCase().split(' ').map(w => ['DKI', 'DIY', 'NAD', 'NTB', 'NTT'].includes(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const wc = {};
async function wil(path) { if (wc[path]) return wc[path]; let r; try { r = await fetch(WILAYAH + path); if (!r.ok) throw 0; } catch { await new Promise(x => setTimeout(x, 700)); r = await fetch(WILAYAH + path); } const j = await r.json(); return (wc[path] = j.data || j); }

export function openCheckout() {
  if (!lines().length) return openCart();
  const f = co.f; if (S.user && !f.email) f.email = S.user.email || '';
  show('CHECKOUT — KASIR', `<div class="note">Data pengiriman sama seperti di toko utama. Setelah ini kamu bayar lewat <b>Midtrans</b> (QRIS, e-wallet, virtual account bank, dll). Status pesanan berubah otomatis, tanpa upload bukti.</div>
    <div id="authBox">${S.user ? `<div class="note">Login sebagai ${esc(S.user.email)}. Pesanan masuk ke riwayat akunmu.</div><button data-act="logout" style="width:100%">LOGOUT</button>` : `<button data-act="loginToggle" style="width:100%">LOGIN (OPSIONAL)</button><div id="loginForm" hidden><input id="lgE" type="email" placeholder="Email akun toko" autocomplete="email"><input id="lgP" type="password" placeholder="Password" autocomplete="current-password"><button data-act="login" class="pri" style="width:100%">MASUK</button><div class="err-t" id="lgErr"></div></div>`}</div>
    <label class="f">NAMA LENGKAP</label><input data-f="nama" value="${esc(f.nama)}" autocomplete="name">
    <label class="f">NO. WHATSAPP</label><input data-f="wa" value="${esc(f.wa)}" inputmode="tel" autocomplete="tel" placeholder="08xxxxxxxxxx">
    <label class="f">EMAIL</label><input data-f="email" type="email" value="${esc(f.email)}" autocomplete="email">
    <label class="f">ALAMAT LENGKAP (jalan, no, RT/RW)</label><input data-f="alamat" value="${esc(f.alamat)}" autocomplete="street-address">
    <label class="f">PROVINSI</label><select id="sProv"><option value="">Memuat…</option></select>
    <label class="f">KOTA / KABUPATEN</label><select id="sKota" disabled><option value="">Pilih provinsi dulu</option></select>
    <label class="f">KECAMATAN</label><select id="sKec" disabled><option value="">Pilih kota dulu</option></select>
    <label class="f">KELURAHAN / DESA</label><select id="sKel" disabled><option value="">Pilih kecamatan dulu</option></select>
    <label class="f">KODE POS</label><input id="inZip" data-f="zip" value="${esc(f.zip)}" inputmode="numeric" maxlength="5">
    <div class="note" id="ongkirTxt">Ongkir muncul setelah kelurahan dipilih.</div>
    <div style="display:flex;gap:8px"><input id="vIn" placeholder="Kode voucher" style="margin:0;text-transform:uppercase"><button data-act="voucher" style="flex:none">PAKAI</button></div>
    <div class="err-t" id="vMsg"></div><div id="sum"></div><div class="err-t" id="fErr"></div>
    <div class="foot"><button class="pri" data-act="toPay">LANJUT KE PEMBAYARAN</button></div>`, () => openCart());
  initWilayah(); renderSum();
}
function renderSum() {
  const c = calc(); const el = $('#sum'); if (!el) return;
  el.innerHTML = lines().map(l => `<div class="row"><span>${esc(l.p?.name)}${l.p?.acc ? '' : ` (${esc(l.color)}|${esc(l.size)}${l.p ? esc(addonText(l.p, l.addons) ? ' + ' + addonText(l.p, l.addons) : '') : ''})`} ×${l.qty}</span><span>${rp(l.sub)}</span></div>`).join('') +
    `<div class="row"><span>Subtotal</span><span>${rp(c.sub)}</span></div><div class="row"><span>Ongkir (J&amp;T)</span><span>${c.ongkir ? rp(c.ongkir) : '—'}</span></div>` +
    (co.voucher ? `<div class="row"><span>Voucher ${esc(co.voucher.kode)}</span><span>− ${rp(c.d)}</span></div>` : '') + `<div class="row tot"><span>TOTAL</span><span>${rp(c.total)}</span></div>`;
}
async function initWilayah() {
  const sP = $('#sProv'), sK = $('#sKota'), sC = $('#sKec'), sL = $('#sKel'); const f = co.f;
  const rst = (s, t) => { s.innerHTML = `<option value="">${t}</option>`; s.disabled = true; };
  try { sP.innerHTML = opt((await wil('/provinces.json')).map(p => [tc(p.name), p.id]), 'Pilih provinsi…'); } catch { sP.innerHTML = '<option value="">Gagal memuat, buka ulang</option>'; return; }
  const code = s => s.selectedOptions[0]?.dataset.c;
  const setOng = (t) => { $('#ongkirTxt').textContent = t; co.ongkir = 0; co.areaId = ''; renderSum(); };
  sP.onchange = async () => { f.prov = sP.value; rst(sK, 'Memuat…'); rst(sC, 'Pilih kota dulu'); rst(sL, 'Pilih kecamatan dulu'); setOng('Pilih alamat lengkap untuk ongkir.'); if (!sP.value) return;
    sK.innerHTML = opt((await wil(`/regencies/${code(sP)}.json`)).map(r => [tc(r.name), r.id]), 'Pilih kota…'); sK.disabled = false; };
  sK.onchange = async () => { f.kota = sK.value; rst(sC, 'Memuat…'); rst(sL, 'Pilih kecamatan dulu'); setOng('Pilih alamat lengkap untuk ongkir.'); if (!sK.value) return;
    sC.innerHTML = opt((await wil(`/districts/${code(sK)}.json`)).map(r => [tc(r.name), r.id]), 'Pilih kecamatan…'); sC.disabled = false; };
  sC.onchange = async () => { f.kec = sC.value; rst(sL, 'Memuat…'); setOng('Pilih alamat lengkap untuk ongkir.'); if (!sC.value) return;
    sL.innerHTML = opt((await wil(`/villages/${code(sC)}.json`)).map(r => [tc(r.name), r.id, r.postal_code || r.postalCode || r.kodepos || '']), 'Pilih kelurahan…'); sL.disabled = false; };
  sL.onchange = () => { f.kel = sL.value; const z = sL.selectedOptions[0]?.dataset.z; if (z) { $('#inZip').value = z; f.zip = z; } hitungOngkir(); };
}
async function gas(q, tries = 2) {
  for (let i = 0; i < tries; i++) { const c = new AbortController(), t = setTimeout(() => c.abort(), 20000);
    try { const r = await fetch(`${GAS_BITESHIP}?${q}`, { signal: c.signal }); const j = await r.json(); clearTimeout(t); return j; } catch { clearTimeout(t); } }
  return null;
}
async function hitungOngkir() {
  const f = co.f, tok = ++co.tok, T = $('#ongkirTxt'); co.ongkir = 0; co.areaId = ''; renderSum();
  if (!f.kel) return; T.textContent = 'Mencari area pengiriman…';
  const ps = [f.zip ? gas('endpoint=search&input=' + encodeURIComponent(f.zip)) : null, gas('endpoint=search&input=' + encodeURIComponent(`${f.kel} ${f.kec}`)), gas('endpoint=search&input=' + encodeURIComponent(f.kel))];
  const [a, b, c] = await Promise.all(ps); if (tok !== co.tok) return;
  const areas = (a?.areas?.length ? a.areas : b?.areas?.length ? b.areas : c?.areas) || [];
  if (!areas.length) { T.textContent = 'Pengiriman ke area ini belum tersedia / server lambat. Coba pilih ulang kelurahan.'; return; }
  const has = (x, s) => (x.label || '').toUpperCase().includes(s.toUpperCase());
  const m = areas.find(x => has(x, f.kel) && has(x, f.kec)) || areas.find(x => has(x, f.kel)) || areas[0];
  const berat = lines().reduce((n, l) => n + l.qty, 0) * 250;     // sama dengan toko utama: 250 g per item
  T.textContent = 'Menghitung ongkir…';
  const r = await gas(`endpoint=rates&dest=${m.id}&weight=${berat}`); if (tok !== co.tok) return;
  if (r?.pricing?.length) { co.areaId = m.id; co.ongkir = Number(r.pricing[0].price) || 0; T.textContent = `Ongkos Kirim (J&T): ${rp(co.ongkir)}`; if (co.voucher?.tipe === 'free_ongkir') $('#vMsg').textContent = ''; }
  else T.textContent = 'Ongkir tidak tersedia. ' + (r?.debug_message || r?.error || '');
  renderSum();
}
async function applyVoucher() {
  const k = $('#vIn').value.trim().toUpperCase(), M = $('#vMsg'); M.style.color = ''; if (!k) { M.textContent = 'Masukkan kode voucher.'; return; }
  M.textContent = 'Mengecek…';
  try { const v = await S.fb.getVoucherByKode(k);
    if (!v) { M.textContent = 'Kode voucher tidak ditemukan.'; return; }
    if (Number(v.kuota) <= 0) { M.textContent = 'Kuota voucher habis.'; return; }
    co.voucher = v; M.style.color = 'var(--ac)'; M.textContent = 'Voucher dipakai.'; renderSum();
  } catch { M.textContent = 'Gagal mengecek voucher.'; }
}
function validate() {
  const f = co.f; const wa = String(f.wa || '').replace(/[\s-]/g, '');
  if ((f.nama || '').trim().length < 3) return 'Nama lengkap minimal 3 huruf.';
  if (!/^(\+?62|0)8\d{7,12}$/.test(wa)) return 'Nomor WhatsApp tidak valid (contoh 081234567890).';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email || '')) return 'Email tidak valid.';
  if ((f.alamat || '').trim().length < 8) return 'Alamat lengkap terlalu pendek.';
  if (!f.prov || !f.kota || !f.kec || !f.kel) return 'Lengkapi provinsi, kota, kecamatan, dan kelurahan.';
  if (!/^\d{5}$/.test(f.zip || '')) return 'Kode pos harus 5 digit.';
  if (!co.areaId || !co.ongkir) return 'Tunggu ongkir muncul dulu.';
  if (lines().some(l => l.err)) return 'Ada item di tas yang tidak tersedia.';
  return '';
}

/* ---------- Pembayaran (Midtrans Snap, sama dengan toko utama) ---------- */
// Alur: form kirim -> pilih LUNAS / DP -> order disimpan (status pending) -> popup Midtrans (QRIS, e-wallet, VA bank, dll).
// Status LUNAS / DP diubah OLEH SERVER (webhook Midtrans); game hanya membuat order 'pending', tidak pernah menulis status bayar.
let payS = null;                                    // pengaturan minimal DP (settings/payment), dibaca ulang setiap halaman bayar dibuka
const pay = { mode: 'lunas', dp: 0 };
const resetPay = () => { pay.mode = 'lunas'; pay.dp = 0; };
const dpOwn = i => !!(i && (i.dpMode === 'percent' || i.dpMode === 'nominal') && Number(i.dpValue) > 0);
const dpBoleh = () => !lines().some(l => l.p && l.p.dpAllowed === 'no');             // satu item "tanpa DP" => seluruh tas wajib lunas
// Minimal DP: rumus sama dengan minDPType() di script.js toko utama dan hitungMinDPItems() di payment-worker/worker.js (ubah bersamaan).
function minDP(total) {
  const hm = S.fb.hitungMinDP, arr = lines().flatMap(l => Array.from({ length: l.qty }, () => ({ harga: l.unit, dpMode: l.p.dpMode, dpValue: l.p.dpValue })));
  const own = arr.filter(dpOwn), def = arr.filter(i => !dpOwn(i));
  if (!own.length) return hm(total, payS);
  let min = own.reduce((a, i) => a + hm(i.harga, { dpMode: i.dpMode, dpValue: i.dpValue }), 0);
  if (def.length) min += hm(def.reduce((a, i) => a + i.harga, 0), payS);
  return min;
}
const dpBisa = total => !!(payS && S.fb.hitungMinDP && dpBoleh() && minDP(total) < total);
const infoBayar = total => (pay.mode === 'dp' ? { mode: 'dp', nominal: Math.round(pay.dp) } : { mode: 'lunas', nominal: total });
function validasiPay() {
  const total = calc().total;
  if (!(total > 0)) return 'Total pesanan tidak valid.';
  if (pay.mode === 'dp') {
    if (!dpBisa(total)) return 'Pesanan ini tidak bisa DP. Pilih lunas.';
    const min = minDP(total);
    if (!pay.dp) return 'Tulis nominal DP dulu.';
    if (pay.dp < min) return `DP minimal ${rp(min)}.`;
    if (pay.dp >= total) return 'DP harus kurang dari total.';
  }
  return '';
}
let payTok = 0;
async function openPay() {
  const tok = ++payTok;
  show('KASIR — BAYAR', '<div class="msg">Memuat pengaturan pembayaran…</div>', () => openCheckout()); view = 'pay';
  payS = null;
  try { if (S.fb.getPaymentSettings && S.fb.hitungMinDP) payS = await S.fb.getPaymentSettings(); } catch (e) { console.warn('pengaturan bayar', e); }
  if (tok === payTok && view === 'pay') renderPay();
}
function renderPay() {
  const total = calc().total, bisaDP = dpBisa(total), min = bisaDP ? minDP(total) : 0;
  if (!bisaDP) resetPay();
  const opts = bisaDP ? `<div class="pay-opts">
      <button class="pay-opt ${pay.mode === 'lunas' ? 'on' : ''}" data-act="pmode" data-v="lunas"><b>LUNAS</b><small>${rp(total)}</small></button>
      <button class="pay-opt ${pay.mode === 'dp' ? 'on' : ''}" data-act="pmode" data-v="dp"><b>DP</b><small>Min. ${rp(min)}</small></button></div>
    ${pay.mode === 'dp' ? `<label class="f" for="payDp">NOMINAL DP</label><input id="payDp" type="text" inputmode="numeric" autocomplete="off" placeholder="Tulis nominal DP, mis. ${min.toLocaleString('id-ID')}" value="${pay.dp ? pay.dp.toLocaleString('id-ID') : ''}"><div class="pay-hint" id="payHint"></div>` : ''}`
    : `<div class="row pay-single"><span>Bayar penuh (lunas)</span><b>${rp(total)}</b></div>`;
  show('KASIR — BAYAR', `<div class="payfill"><div class="row tot" style="border:0;margin:0"><span>TOTAL PESANAN</span><span>${rp(total)}</span></div>
    <div class="lbl">${bisaDP ? 'PILIHAN PEMBAYARAN' : 'PEMBAYARAN'}</div>${opts}
    <div class="note">Pembayaran lewat <b>Midtrans</b>: QRIS, e-wallet, virtual account bank, dan metode lain. Metode dipilih di langkah berikutnya, status pesanan berubah otomatis setelah bayar. Tidak perlu upload bukti.</div>
    <div class="note">Setelah menekan tombol di bawah, pesananmu disimpan lalu kamu masuk ke halaman pembayaran aman Midtrans. Tidak dibayar sampai batas waktu = pesanan dibatalkan otomatis.</div>
    <div class="err-t" id="pErr"></div>
    <div class="foot"><button class="accent" id="bSubmit" data-act="submit">LANJUT BAYAR</button></div></div>`, () => openCheckout());
  view = 'pay'; if (pay.mode === 'dp') updateDpHint();
}
function updateDpHint() {
  const el = $('#payHint'); if (!el) return;
  const total = calc().total, min = minDP(total); let t, err = false;
  if (!pay.dp) t = `DP minimal ${rp(min)}. Sisanya dilunasi nanti lewat aplikasi Pelunasan (HP) atau menu Pelunasan di toko utama.`;
  else if (pay.dp < min) { t = `Kurang dari DP minimal ${rp(min)}.`; err = true; }
  else if (pay.dp >= total) { t = 'DP harus kurang dari total. Mau bayar penuh? Pilih LUNAS.'; err = true; }
  else t = `Bayar sekarang ${rp(pay.dp)} · sisa ${rp(total - pay.dp)} dilunasi belakangan.`;
  el.textContent = t; el.className = 'pay-hint' + (err ? ' err' : '');
}
function onDpInput(el) { const n = Number(String(el.value).replace(/\D/g, '')) || 0; pay.dp = n; el.value = n ? n.toLocaleString('id-ID') : ''; updateDpHint(); }

async function submit() {
  if (co.busy) return;                                    // cegah klik ganda -> order ganda
  const pe = $('#pErr'), err = validate() || validasiPay(); if (err) { pe.textContent = err; return; }
  co.busy = true; const btn = $('#bSubmit'); btn.disabled = true; btn.textContent = 'MENYIMPAN…'; pe.textContent = '';
  tampilLoadingBayar('Menyimpan pesanan…');
  const lepas = msg => { sembunyiLoadingBayar(); co.busy = false; btn.disabled = false; btn.textContent = 'LANJUT BAYAR'; pe.textContent = msg; };
  let rec;
  try {
    const f = co.f, L = lines(), c = calc(), by = infoBayar(c.total);
    const flat = L.flatMap(l => Array.from({ length: l.qty }, () => ({ nama: l.p.name, warna: l.color, size: l.size, harga: l.unit, tambahan: addonText(l.p, l.addons), ...(l.p.acc ? { jenis: 'aksesoris' } : {}) })));   // format sama: 1 entri per pcs
    const pre = L.filter(l => l.p.badge === 'pre');
    const orderData = {
      nama: f.nama.trim(), wa: f.wa.trim(), email: f.email.trim(), customerUid: S.user?.uid || null,
      alamat: `${f.alamat.trim()}, ${f.kel}, Kec. ${f.kec}, ${f.kota}, ${f.prov} ${f.zip}`,
      produk: flat, produkText: flat.map(i => i.jenis === 'aksesoris' ? i.nama : `${i.nama} (${i.warna}|${i.size}${i.tambahan ? ' + ' + i.tambahan : ''})`).join(', '),
      hargaKaos: c.sub, ongkir: c.ongkir, voucherKode: co.voucher?.kode || '', voucherDeskripsi: voucherDesc(), totalAkhir: c.total,
      tipeBayar: 'Midtrans', dp: '', buktiURL: '', payMode: by.mode, payAmount: by.nominal,      // sama dengan order dari toko utama; nominal & harga dicek ulang oleh API pembayaran
      dpEligible: dpBoleh(),
      kodePrefix: (pre.find(l => l.p.kodePrefix) || L.find(l => l.p.kodePrefix) || { p: {} }).p.kodePrefix || '',
      isPO: pre.length > 0, poIds: [...new Set(pre.map(l => l.p.id))], poNames: [...new Set(pre.map(l => l.p.name))],
      sumber: 'game'                                      // penanda tambahan; tidak dipakai logika toko utama
    };
    // Potong stok varian (atomik) sebelum order disimpan, sama seperti toko utama
    const dilacak = L.filter(l => stokTracked(l.p));
    if (dilacak.length && S.fb.kurangiStok) {
      try { orderData.stokItems = await S.fb.kurangiStok(dilacak.flatMap(l => Array.from({ length: l.qty }, () => ({ pid: l.p.id, warna: l.color, size: l.size })))); }
      catch (e) {
        if (e && e.code === 'STOK_HABIS') { const h = e.habis[0], nm = h.warna === AKS && h.size === AKS ? 'Aksesoris di tas' : `${h.warna} ${h.size}`;
          return lepas(h.sisa > 0 ? `Stok ${nm} tinggal ${h.sisa}. Ubah jumlah di tas dulu.` : `${nm} baru saja habis. Hapus dari tas dulu.`); }
        throw e;
      }
    }
    const id = await S.fb.saveOrder(orderData);           // fungsi asli toko utama: ID FVCK-XXXXXX, lacak, indeks
    if (!id) throw new Error('saveOrder null');
    if (co.voucher) { try { await S.fb.updateVoucherKuota(co.voucher.id, co.voucher.kuota - 1); } catch {} }
    fetch(GAS_ORDER_BACKUP, { method: 'POST', mode: 'no-cors', cache: 'no-cache', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(orderData) }).catch(() => {});
    rec = { kode: orderData.kodePelunasan, via: 'midtrans', mode: by.mode, payAmount: by.nominal, status: 'pending', total: c.total, sub: c.sub, ongkir: c.ongkir, d: c.d, items: flat, nama: orderData.nama, at: new Date().toISOString() };
  } catch (e) { console.error(e); return lepas('Gagal menyimpan pesanan. Periksa koneksi lalu coba lagi (pesananmu belum terkirim).'); }
  putRec(rec); S.cart = []; saveCart(); co = coBaru(); resetPay();
  ui.beep('ding'); openReceipt(rec, { auto: true });      // struk jadi "papan status" di belakang popup Midtrans
  bayar(rec, 'F');
}
const voucherDesc = () => { const v = co.voucher; return !v ? '' : v.tipe === 'nominal' ? `Diskon Belanja Rp${Number(v.nilai).toLocaleString('id-ID')}` : v.tipe === 'persen' ? `Diskon Belanja ${v.nilai}%` : 'Gratis Ongkos Kirim'; };

/* ---------- Struk & status pembayaran ---------- */
const readRec = () => { try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch { return null; } };
const putRec = r => { try { localStorage.setItem(LAST_KEY, JSON.stringify(r)); } catch {} };
const updRec = r => { const c = readRec(); if (c && c.kode === r.kode) putRec(r); };      // jangan menimpa struk pesanan yang lebih baru
let curRec = null;
const ST = { pending: 'MENUNGGU PEMBAYARAN', dp: 'DP DITERIMA', lunas: 'LUNAS', ditolak: 'DIBATALKAN' };
function setMsg(type, text) { const m = $('#rMsg'); if (!m) return; m.hidden = !text; m.className = 'pm ' + (type || ''); m.textContent = text || ''; }
function paintReceipt(r) {
  if (!r || view !== 'receipt' || !curRec || curRec.kode !== r.kode) return;
  const st = statusNorm(r.status), mid = r.via === 'midtrans';
  const dpNom = Number(r.dpNominal) || Number(r.payAmount) || 0, sisa = Number(r.sisa) > 0 ? Number(r.sisa) : Math.max(0, r.total - dpNom);
  let rows = '', note;
  if (st === 'pending' && mid && r.mode === 'dp') rows = `<div class="row"><span>Bayar sekarang (DP)</span><span>${rp(r.payAmount)}</span></div><div class="row"><span>Sisa dilunasi nanti</span><span>${rp(r.total - r.payAmount)}</span></div>`;
  if (st === 'dp') rows = `<div class="row"><span>DP dibayar</span><span>${rp(dpNom)}</span></div><div class="row"><span>Sisa pelunasan</span><span>${rp(sisa)}</span></div>`;
  if (st === 'pending') note = mid ? 'Selesaikan pembayaran sebelum batas waktu, kalau tidak pesanan <b>dibatalkan otomatis</b> dan stok dikembalikan. Sudah bayar lewat aplikasi bank / e-wallet? Tekan <b>CEK STATUS</b>.'
    : 'Admin akan mengecek bukti bayarmu. Lacak pesanan dengan ID di atas lewat aplikasi <b>Lacak</b> di HP atau menu <b>Cek Pesanan</b> di toko utama.';
  else if (st === 'dp') note = `DP sudah diterima. Lunasi sisa <b>${rp(sisa)}</b> lewat aplikasi <b>Pelunasan</b> di HP (📱) atau menu Pelunasan di toko utama, pakai ID pesanan di atas.`;
  else if (st === 'lunas') note = 'Pembayaran lunas, terima kasih! Pantau pesananmu dengan ID di atas lewat aplikasi <b>Lacak</b> di HP (📱) atau menu <b>Cek Pesanan</b> di toko utama.';
  else note = 'Pembayaran tidak selesai atau sudah kedaluwarsa, jadi pesanan dibatalkan dan stok dikembalikan. Silakan pesan ulang.';
  const el = id => $('#' + id);
  el('rInfo').innerHTML = rows; el('rNote').innerHTML = note;
  const s = el('rStat'); s.textContent = !mid && st === 'pending' ? 'MENUNGGU VERIFIKASI ADMIN' : ST[st] || st.toUpperCase(); s.className = 'st-' + st;
  el('rPay').hidden = el('rChk').hidden = !(mid && st === 'pending');
}
async function refreshRec(r) {                           // status terbaru dari dokumen lacak (publik, bisa dibaca tanpa login)
  if (!S.fb || !S.fb.cariLacak || !r || !r.kode) return;
  try {
    const d = ((await S.fb.cariLacak({ kode: r.kode })) || [])[0];
    if (d) { r.status = d.pay || 'pending'; if (d.sisa != null) r.sisa = Number(d.sisa) || 0; if (d.dpNominal != null) r.dpNominal = Number(d.dpNominal) || 0; updRec(r); }
  } catch (e) { console.warn('refresh struk', e); }
  paintReceipt(r);
}
function statusMsg(r, cek) {
  const st = statusNorm(r.status);
  return st === 'lunas' ? ['ok', 'PEMBAYARAN BERHASIL!']
    : st === 'dp' ? ['ok', 'DP BERHASIL DIBAYAR!']
    : st === 'ditolak' ? ['err', 'PESANAN DIBATALKAN.']
    : ['wait', cek ? 'Belum ada pembayaran masuk. Kalau sudah bayar, tunggu sebentar lalu tekan CEK STATUS lagi.' : 'MENUNGGU PEMBAYARAN.'];
}
function bayar(r, tahap = 'F') {
  if (!r || isPaying()) return;
  setMsg('', '');
  mulaiBayar(r.kode, tahap, { onDone: res => hasilBayar(r, res) });
}
async function hasilBayar(r, res) {
  if (res.status) r.status = res.status;
  if (res.type === 'success' || res.type === 'pending') {
    if (statusNorm(r.status) === 'pending') await refreshRec(r);      // sync gagal / webhook belum masuk: baca dokumen lacak
    const [t, m] = statusMsg(r); setMsg(t, m);
    if (t === 'ok') { ui.beep('ding'); ui.toast(statusNorm(r.status) === 'lunas' ? '✓ Pembayaran berhasil' : '✓ DP berhasil dibayar'); } else ui.toast('Menunggu pembayaran…');
  } else if (res.type === 'close') setMsg('wait', waitText('F'));
  else setMsg('err', res.message || 'Gagal memulai pembayaran.');
  updRec(r); paintReceipt(r);
}
async function cekStatus() {
  const r = curRec; if (!r || isPaying()) return;
  setMsg('wait', 'Memeriksa status pembayaran…');
  try { const s = await payApi('/sync', { kode: r.kode, tahap: 'F' }); if (s && s.status) r.status = statusNorm(s.status); } catch (e) { console.warn('sync', e); }
  await refreshRec(r);
  const [t, m] = statusMsg(r, true); setMsg(t, m);
}
export function openReceipt(r = readRec(), opt = {}) {
  if (!r) { ui.toast('Belum ada struk.'); return; }
  curRec = r;
  show('STRUK PESANAN', `<div class="receipt"><h3>FVCKTHERULES</h3><div style="text-align:center;font-size:11px">BORN TO DISOBEY</div><div class="id" id="rid">${esc(r.kode)}</div>
    <div style="text-align:center;font-size:11px">ID PESANAN — simpan untuk Pantau Pesanan</div><hr>
    ${r.items.map(i => `<div class="row"><span>${esc(i.nama)}${i.jenis === 'aksesoris' ? '' : ` (${esc(i.warna)}|${esc(i.size)}${i.tambahan ? esc(' + ' + i.tambahan) : ''})`}</span><span>${esc(String(i.harga).startsWith('Rp') ? i.harga : rp(digits(i.harga)))}</span></div>`).join('')}<hr>
    <div class="row"><span>Subtotal</span><span>${rp(r.sub)}</span></div><div class="row"><span>Ongkir</span><span>${rp(r.ongkir)}</span></div>${r.d ? `<div class="row"><span>Voucher</span><span>− ${rp(r.d)}</span></div>` : ''}
    <div class="row tot"><span>TOTAL PESANAN</span><span>${rp(r.total)}</span></div><div id="rInfo"></div>
    <div class="row"><span>STATUS</span><b id="rStat"></b></div></div>
    <div class="pm" id="rMsg" hidden></div>
    <div class="note" id="rNote" style="margin-top:14px"></div>
    <div class="rbtns"><button data-act="copy" data-v="${esc(r.kode)}">SALIN ID PESANAN</button><button id="rChk" data-act="cek" hidden>CEK STATUS</button><a class="btn full" href="${MAIN_ORIGIN}/">BUKA TOKO UTAMA (CEK PESANAN)</a></div>
    <div class="foot"><button class="accent" id="rPay" data-act="rpay" hidden>LANJUT BAYAR</button><button data-act="close">KEMBALI KE TOKO</button></div>`);
  view = 'receipt'; paintReceipt(r);
  if (!opt.auto) refreshRec(r);                           // buka ulang struk lama: ambil status terbaru
}
export const hasReceipt = () => { try { return !!localStorage.getItem(LAST_KEY); } catch { return false; } };

/* ---------- Event delegation ---------- */
P.body.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t) return; const a = t.dataset.act, v = t.dataset.v, i = Number(t.dataset.i);
  if (a === 'cat') openCatalog(v);
  else if (a === 'prod') openProduct(v);
  else if (a === 'color') { sel.color = v; openProduct(sel.pid, P.backFn); }
  else if (a === 'addon') { const ad = byId(sel.pid)?.addons[Number(v)]; if (ad) { const k = sel.addons.indexOf(ad.nama); if (k >= 0) sel.addons.splice(k, 1); else sel.addons.push(ad.nama); openProduct(sel.pid, P.backFn); } }
  else if (a === 'guide') openSizeGuide();
  else if (a === 'size') { sel.size = v; openProduct(sel.pid, P.backFn); }
  else if (a === 'qty') { sel.qty = Math.max(1, Math.min(20, sel.qty + Number(v))); $('#qv').textContent = sel.qty; }
  else if (a === 'add') { if (!sel.color) return ($('#perr').textContent = 'Pilih warna dulu.'); if (!sel.size) return ($('#perr').textContent = 'Pilih ukuran dulu.');
    const r = addToCart(sel.pid, sel.color, sel.size, sel.qty, sel.addons);
    if (r === true) { ui.beep('add'); ui.toast(`✓ Masuk tas: ${byId(sel.pid).name}${varTxt(sel.color, sel.size)} ×${sel.qty}`); sel.qty = 1; sel.addons = []; openProduct(sel.pid, P.backFn); }
    else $('#perr').textContent = r === 'stok' ? `Stok tidak cukup (tersedia ${stokQty(byId(sel.pid), sel.color, sel.size)}, termasuk yang sudah di tas).` : 'Varian tidak tersedia.'; }
  else if (a === 'cart') openCart();
  else if (a === 'cq') { const it = S.cart[i]; if (it) { it.qty = Math.max(1, Math.min(20, it.qty + Number(v))); saveCart(); openCart(); } }
  else if (a === 'cdel') { S.cart.splice(i, 1); saveCart(); openCart(); }
  else if (a === 'checkout') { co.voucher = null; resetPay(); openCheckout(); }
  else if (a === 'voucher') applyVoucher();
  else if (a === 'toPay') { const err = validate(); $('#fErr').textContent = err; if (!err) openPay(); }
  else if (a === 'pmode') { pay.mode = v === 'dp' ? 'dp' : 'lunas'; renderPay(); }
  else if (a === 'submit') submit();
  else if (a === 'rpay') bayar(curRec, 'F');
  else if (a === 'cek') cekStatus();
  else if (a === 'copy') { try { await navigator.clipboard.writeText(v); ui.toast('Tersalin: ' + v); } catch { ui.toast('Tahan & salin manual: ' + v); } }
  else if (a === 'close') closePanel();
  else if (a === 'logout') { const old = S.user?.email; if (await logout()) { if (old && co.f.email === old) co.f.email = ''; ui.toast('Kamu sudah logout'); openCheckout(); } else ui.toast('Logout gagal, coba lagi'); }
  else if (a === 'loginToggle') $('#loginForm').hidden = !$('#loginForm').hidden;
  else if (a === 'login') { const m = $('#lgErr'); m.textContent = 'Masuk…'; try { await S.fb.customerSignIn($('#lgE').value.trim(), $('#lgP').value); S.user = S.fb.auth.currentUser; co.f.email = S.user?.email || co.f.email; openCheckout(); } catch (er) { m.textContent = 'Login gagal. Cek email/password.'; } }
});
P.body.addEventListener('input', e => { const k = e.target.dataset.f; if (k) { co.f[k] = e.target.value; if (k === 'zip') co.f.zip = e.target.value.replace(/\D/g, ''); } else if (e.target.id === 'payDp') onDpInput(e.target); });
export const openProductFrom = openProduct;
// logout akun toko (sama dengan web utama: keluar dari akun toko + akun jurnal)
export async function logout() {
  try { if (S.fb && S.fb.customerSignOut) await S.fb.customerSignOut(); else if (S.fb && S.fb.auth) await S.fb.auth.signOut(); } catch (e) { console.warn('logout gagal', e); return false; }
  S.user = null; return true;
}

export const showRaw = show;
export function getBannerText() { return new Promise(res => { try { S.fb.listenBannerText(d => res(d)); setTimeout(() => res(null), 4000); } catch { res(null); } }); }
