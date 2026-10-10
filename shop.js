// shop.js — katalog, tas, checkout, kasir. Memakai firebase.js milik website utama (saveOrder, listenProduk, voucher, auth).
// TIDAK ada katalog/harga/ID order buatan sendiri: semua dari Firestore project fvcktherules-store.
export const MAIN_ORIGIN = 'https://fucktherules.my.id';
const FB_URL = MAIN_ORIGIN + '/firebase.js?v=20261013';          // modul yang sama dengan website utama (satu sumber kebenaran)
const GAS_ORDER_BACKUP = 'https://script.google.com/macros/s/AKfycbyoVdbvq1JvCtzWFbJaZUdTO2I30DXn4N0p_XOidk98cPnj8m22j2Aa0q6k90KH4sOhUw/exec';
const GAS_BITESHIP = 'https://script.google.com/macros/s/AKfycbyDTEPvP5yndja35U02nkC4lsYRy3vQqVe2s4NTx-MxBE8MCSB9co2ztG5ZDMtJzuAO/exec';
const WILAYAH = 'https://www.emsifa.com/api-wilayah-indonesia/v2';
// Salinan dari index.html website utama (di sana hardcoded, bukan di config). Ubah di sini jika rekening berubah.
export const PAY = { bank: 'MANDIRI', rek: '1370023790229', gopay: '081910421976', an: 'Dias Adhitya Purnama Putra' };
const SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const CART_KEY = 'fvckgame.cart.v1', LAST_KEY = 'fvckgame.lastReceipt.v1';

export const S = { products: [], status: 'loading', fb: null, user: null, cart: [], listeners: new Set() };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const rp = n => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const digits = v => Number(String(v ?? '').replace(/\D/g, '')) || 0;
const $ = (s, r = document) => r.querySelector(s);

/* ---------- UI panel ---------- */
let ui = { onChange: () => {}, onCart: () => {}, toast: () => {}, beep: () => {} };
export function bindUI(x) { ui = { ...ui, ...x }; }
const P = { el: $('#panel'), body: $('#pBody'), title: $('#pTitle'), back: $('#pBack'), backFn: null };
function show(title, html, backFn) {
  P.el.hidden = false; P.title.textContent = title; P.body.innerHTML = html; P.body.scrollTop = 0;
  P.backFn = backFn || null; P.back.hidden = !backFn; ui.onChange(true);
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
        stock: p.stok ? p.stok.split('/').map(s => s.trim()) : [], thumb: p.thumbnail || '', details: p.details || [],
        specs: p.specs || '', dpAllowed: p.dpAllowed || 'yes', kodePrefix: p.kodePrefix || '', poClosed: !!p.poClosed, order: p.order || 0
      })).filter(p => ['pre', 'ready', 'sold'].includes(p.badge)).sort((a, b) => b.order - a.order);
      S.status = 'ok'; notify(onUpdate);
    }, err => { console.error(err); S.status = 'error'; notify(onUpdate); });
    S.fb.onAuthStateChanged(S.fb.auth, u => { S.user = u; });
  } catch (e) { console.error('Gagal memuat firebase.js utama', e); S.status = 'error'; notify(onUpdate); }
}
function notify(cb) { cb && cb(S.status); S.listeners.forEach(f => f()); }
const byId = id => S.products.find(p => p.id === id);
export const orderable = p => !!p && (p.badge === 'pre' || p.badge === 'ready') && !p.poClosed && p.colors.length > 0 && p.stock.length > 0;
const stateMsg = () => S.status === 'loading' ? '<div class="msg">Memuat katalog dari toko utama…</div>'
  : S.status === 'error' ? `<div class="msg err">Gagal memuat katalog (koneksi / Firebase). Coba muat ulang, atau buka <a href="${MAIN_ORIGIN}" style="color:inherit">toko utama</a>.</div>`
  : !S.products.length ? '<div class="msg">Belum ada produk di katalog.</div>' : '';

/* ---------- Keranjang ---------- */
function loadCart() { try { const c = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); S.cart = Array.isArray(c) ? c.filter(i => i && i.pid && i.color && i.size && i.qty > 0).slice(0, 50) : []; } catch { S.cart = []; } }
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
    else if (!p.stock.includes(i.size)) err = 'Ukuran habis';
    return { ...i, p, err, sub: p && !err ? p.priceN * i.qty : 0 };
  });
}
const subtotal = () => lines().reduce((n, l) => n + l.sub, 0);
export function addToCart(pid, color, size, qty) {
  const p = byId(pid);
  if (!orderable(p) || !p.colors.includes(color) || !p.stock.includes(size)) return false;
  const ex = S.cart.find(i => i.pid === pid && i.color === color && i.size === size);
  if (ex) ex.qty = Math.min(20, ex.qty + qty); else S.cart.push({ pid, color, size, qty });
  saveCart(); return true;
}

/* ---------- Katalog & produk ---------- */
const FILTERS = { all: ['SEMUA', () => true], pre: ['PRE ORDER', p => p.badge === 'pre'], ready: ['READY STOCK', p => p.badge === 'ready'], sold: ['ARSIP', p => p.badge === 'sold'] };
export function openCatalog(f = 'all') {
  const list = S.products.filter(FILTERS[f][1]);
  const tabs = Object.entries(FILTERS).map(([k, v]) => `<button class="chip ${k === f ? 'on' : ''}" data-act="cat" data-v="${k}">${v[0]}</button>`).join('');
  const grid = list.map(p => `<button class="card ${p.badge === 'sold' ? 'sold' : ''}" data-act="prod" data-v="${esc(p.id)}">
    <span class="badge">${esc(p.status || p.badge.toUpperCase())}</span><img src="${esc(p.thumb)}" alt="${esc(p.name)}" loading="lazy">
    <div class="t">${esc(p.name)}</div><div class="p">${esc(rp(p.priceN))}</div></button>`).join('');
  show('KATALOG', `<div class="chips" style="margin-bottom:12px">${tabs}</div>${stateMsg() || (list.length ? `<div class="grid">${grid}</div>` : '<div class="msg">Tidak ada produk di rak ini.</div>')}
    <div class="foot"><button class="pri" data-act="cart">TAS BELANJA (${cartCount()})</button></div>`);
}
let sel = { pid: '', color: '', size: '', qty: 1 };
export function openProduct(pid, back = () => openCatalog()) {
  const p = byId(pid); if (!p) return openCatalog();
  if (sel.pid !== pid) sel = { pid, color: p.colors.length === 1 ? p.colors[0] : '', size: '', qty: 1 };
  const ok = orderable(p);
  const imgs = (p.details.length ? p.details : [p.thumb]).map(u => `<img src="${esc(u)}" alt="${esc(p.name)}" loading="lazy">`).join('');
  const colors = p.colors.map(c => `<button class="chip ${sel.color === c ? 'on' : ''}" data-act="color" data-v="${esc(c)}">${esc(c)}</button>`).join('');
  const sizes = SIZES.map(s => { const a = p.stock.includes(s); return `<button class="chip ${sel.size === s ? 'on' : ''}" ${a ? '' : 'disabled'} data-act="size" data-v="${s}">${s}</button>`; }).join('');
  const why = ok ? '' : `<div class="msg err">${p.badge === 'sold' ? 'Produk ini sudah habis (arsip).' : p.poClosed ? 'Pre Order sudah ditutup.' : 'Stok/varian belum tersedia.'}</div>`;
  show(p.name.toUpperCase(), `<div class="slot">${imgs}</div><h2>${esc(p.name)}</h2><div class="price">${esc(rp(p.priceN))} <small style="color:var(--g3);font-size:12px">${esc(p.status)}</small></div>
    ${why}${ok ? `<div class="lbl">WARNA</div><div class="chips">${colors}</div><div class="lbl">UKURAN (hanya yang tersedia)</div><div class="chips">${sizes}</div>
    <div class="lbl">JUMLAH</div><div class="qty"><button data-act="qty" data-v="-1">−</button><b id="qv">${sel.qty}</b><button data-act="qty" data-v="1">+</button></div>
    <div class="err-t" id="perr"></div><div class="foot"><button class="accent" data-act="add">ADD TO CART</button></div>` : ''}
    <div class="specs">${esc(p.specs).replace(/\\n|\n/g, '<br>')}</div>`, back);
  P.body.dataset.pid = pid; P.backFn = back;
}

/* ---------- Tas ---------- */
export function openCart() {
  const L = lines();
  const body = !L.length ? '<div class="msg">Tas masih kosong. Ambil kaos dari rak.</div>' : L.map((l, i) => `<div class="line">
    <img src="${esc(l.p?.thumb || '')}" alt=""><div class="m"><b>${esc(l.p?.name || 'Produk dihapus')}</b><small>${esc(l.color)} | ${esc(l.size)}</small>
    ${l.err ? `<small style="color:var(--red)">${esc(l.err)}</small>` : `<small>${rp(l.p.priceN)} × ${l.qty} = ${rp(l.sub)}</small>`}</div>
    <div class="qty"><button data-act="cq" data-i="${i}" data-v="-1">−</button><b>${l.qty}</b><button data-act="cq" data-i="${i}" data-v="1">+</button></div>
    <button data-act="cdel" data-i="${i}" aria-label="Hapus">✕</button></div>`).join('');
  const bad = L.some(l => l.err);
  show('TAS BELANJA', `${body}${L.length ? `<div class="row tot"><span>SUBTOTAL</span><span>${rp(subtotal())}</span></div>
    ${bad ? '<div class="err-t">Hapus item bermasalah (merah) sebelum checkout.</div>' : ''}
    <div class="foot"><button class="pri" data-act="checkout" ${bad || S.status !== 'ok' ? 'disabled' : ''}>KE KASIR / CHECKOUT</button><button data-act="cat" data-v="all">LANJUT BELANJA</button></div>` : ''}`);
}

/* ---------- Checkout ---------- */
let co = { f: {}, ongkir: 0, areaId: '', voucher: null, busy: false, bukti: '', tok: 0 };
const needDP = () => !lines().some(l => l.p && l.p.dpAllowed === 'no');
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
  show('CHECKOUT — KASIR', `<div class="note">Data pengiriman sama seperti di toko utama. Setelah ini kamu bayar (QRIS / transfer), upload bukti, lalu pesanan masuk ke admin.</div>
    <div id="authBox">${S.user ? `<div class="note">Login sebagai ${esc(S.user.email)}. Pesanan masuk ke riwayat akunmu.</div>` : `<button data-act="loginToggle" style="width:100%">LOGIN (OPSIONAL)</button><div id="loginForm" hidden><input id="lgE" type="email" placeholder="Email akun toko" autocomplete="email"><input id="lgP" type="password" placeholder="Password" autocomplete="current-password"><button data-act="login" class="pri" style="width:100%">MASUK</button><div class="err-t" id="lgErr"></div></div>`}</div>
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
  el.innerHTML = lines().map(l => `<div class="row"><span>${esc(l.p?.name)} (${esc(l.color)}|${esc(l.size)}) ×${l.qty}</span><span>${rp(l.sub)}</span></div>`).join('') +
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

/* ---------- Pembayaran di kasir ---------- */
let payTab = 'qris';
function openPay() {
  const c = calc();
  const qr = `<div class="qr"><img id="qrImg" src="${MAIN_ORIGIN}/qris.jpg" alt="QRIS FVCKTHERULES" onerror="this.onerror=null;this.src='assets/qris.jpg'"></div>
    <div class="note">Scan QRIS ini dengan aplikasi bank / e-wallet. Bermain di HP yang sama? Tekan tombol di bawah untuk menyimpan gambar, lalu pilih dari galeri di aplikasi pembayaran.</div>
    <a class="btn" style="width:100%" href="${MAIN_ORIGIN}/qris.jpg" download="QRIS-FVCKTHERULES.jpg" target="_blank" rel="noopener">SIMPAN / BUKA GAMBAR QR</a>`;
  const tf = `<div class="acc"><div class="lbl" style="margin-top:0">${PAY.bank}</div><b>${PAY.rek}</b><br><button data-act="copy" data-v="${PAY.rek}" style="margin-top:8px">SALIN NO. REKENING</button></div>
    <div class="acc"><div class="lbl" style="margin-top:0">GOPAY</div><b>${PAY.gopay}</b><br><button data-act="copy" data-v="${PAY.gopay}" style="margin-top:8px">SALIN NOMOR</button></div><div class="row"><span>Atas nama</span><b>${esc(PAY.an)}</b></div>`;
  show('KASIR — BAYAR', `<div class="row tot" style="border:0;margin:0"><span>TRANSFER SEBESAR</span><span style="color:var(--ac)">${rp(c.total)}</span></div>
    <div class="tabs"><button data-act="ptab" data-v="qris" class="${payTab === 'qris' ? 'on' : ''}">QRIS</button><button data-act="ptab" data-v="bank" class="${payTab === 'bank' ? 'on' : ''}">TRANSFER BANK</button></div>
    ${payTab === 'qris' ? qr : tf}
    <div class="note">${needDP() ? 'Pembayaran dapat dilakukan Full (Lunas) atau DP minimal Rp70.000. ' : ''}Status pesanan tetap <b>MENUNGGU VERIFIKASI</b> sampai admin mengecek bukti bayarmu. Tombol di bawah tidak mengubah status menjadi lunas.</div>
    <div class="lbl">UPLOAD BUKTI BAYAR</div><input id="bukti" type="file" accept="image/*"><div class="err-t" id="bMsg">${co.bukti ? '✓ Bukti sudah terupload.' : ''}</div><div class="err-t" id="pErr"></div>
    <div class="foot"><button class="accent" id="bSubmit" data-act="submit">KIRIM PESANAN</button></div>`, () => openCheckout());
  $('#bukti').onchange = async e => { const file = e.target.files[0]; if (!file) return; const m = $('#bMsg'); m.style.color = ''; m.textContent = 'Mengupload…'; co.bukti = '';
    co.bukti = (await S.fb.uploadGambar(file, 'bukti').catch(() => null)) || ''; m.textContent = co.bukti ? '✓ Bukti sudah terupload.' : '✗ Gagal upload, coba lagi.'; };
}
async function submit() {
  if (co.busy) return;                                    // cegah klik ganda -> order ganda
  const err = validate(); const pe = $('#pErr'); if (err) { pe.textContent = err; return; }
  if (!co.bukti) { pe.textContent = 'Upload bukti bayar dulu (sama seperti di toko utama).'; return; }
  co.busy = true; const btn = $('#bSubmit'); btn.disabled = true; btn.textContent = 'MENGIRIM…'; pe.textContent = '';
  try {
    const f = co.f, L = lines(), c = calc();
    const flat = L.flatMap(l => Array.from({ length: l.qty }, () => ({ nama: l.p.name, warna: l.color, size: l.size, harga: l.p.price })));   // format sama: 1 entri per pcs
    const pre = L.filter(l => l.p.badge === 'pre');
    const orderData = {
      nama: f.nama.trim(), wa: f.wa.trim(), email: f.email.trim(), customerUid: S.user?.uid || null,
      alamat: `${f.alamat.trim()}, ${f.kel}, Kec. ${f.kec}, ${f.kota}, ${f.prov} ${f.zip}`,
      produk: flat, produkText: flat.map(i => `${i.nama} (${i.warna}|${i.size})`).join(', '),
      hargaKaos: c.sub, ongkir: c.ongkir, voucherKode: co.voucher?.kode || '', voucherDeskripsi: voucherDesc(), totalAkhir: c.total,
      tipeBayar: 'Cek Bukti Bayar', dp: '', buktiURL: co.bukti, dpEligible: L.some(l => l.p.dpAllowed !== 'no'),
      kodePrefix: (pre.find(l => l.p.kodePrefix) || L.find(l => l.p.kodePrefix) || { p: {} }).p.kodePrefix || '',
      isPO: pre.length > 0, poIds: [...new Set(pre.map(l => l.p.id))], poNames: [...new Set(pre.map(l => l.p.name))],
      sumber: 'game'                                      // penanda tambahan; tidak dipakai logika toko utama
    };
    const id = await S.fb.saveOrder(orderData);           // fungsi asli toko utama: ID FVCK-XXXXXX, lacak, indeks
    if (!id) throw new Error('saveOrder null');
    if (co.voucher) { try { await S.fb.updateVoucherKuota(co.voucher.id, co.voucher.kuota - 1); } catch {} }
    fetch(GAS_ORDER_BACKUP, { method: 'POST', mode: 'no-cors', cache: 'no-cache', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(orderData) }).catch(() => {});
    const rec = { kode: orderData.kodePelunasan, total: c.total, sub: c.sub, ongkir: c.ongkir, d: c.d, items: flat, nama: orderData.nama, at: new Date().toISOString() };
    try { localStorage.setItem(LAST_KEY, JSON.stringify(rec)); } catch {}
    S.cart = []; saveCart(); co = { f: {}, ongkir: 0, areaId: '', voucher: null, busy: false, bukti: '', tok: 0 };
    ui.beep('ding'); openReceipt(rec);
  } catch (e) { console.error(e); co.busy = false; btn.disabled = false; btn.textContent = 'KIRIM PESANAN'; $('#pErr').textContent = 'Gagal menyimpan pesanan. Periksa koneksi lalu coba lagi (pesananmu belum terkirim).'; }
}
const voucherDesc = () => { const v = co.voucher; return !v ? '' : v.tipe === 'nominal' ? `Diskon Belanja Rp${Number(v.nilai).toLocaleString('id-ID')}` : v.tipe === 'persen' ? `Diskon Belanja ${v.nilai}%` : 'Gratis Ongkos Kirim'; };
export function openReceipt(r = JSON.parse(localStorage.getItem(LAST_KEY) || 'null')) {
  if (!r) { ui.toast('Belum ada struk.'); return; }
  show('STRUK PESANAN', `<div class="receipt"><h3>FVCKTHERULES</h3><div style="text-align:center;font-size:11px">BORN TO DISOBEY</div><div class="id" id="rid">${esc(r.kode)}</div>
    <div style="text-align:center;font-size:11px">ID PESANAN — simpan untuk Pantau Pesanan</div><hr>
    ${r.items.map(i => `<div class="row"><span>${esc(i.nama)} (${esc(i.warna)}|${esc(i.size)})</span><span>${esc(i.harga)}</span></div>`).join('')}<hr>
    <div class="row"><span>Subtotal</span><span>${rp(r.sub)}</span></div><div class="row"><span>Ongkir</span><span>${rp(r.ongkir)}</span></div>${r.d ? `<div class="row"><span>Voucher</span><span>− ${rp(r.d)}</span></div>` : ''}
    <div class="row tot"><span>TOTAL BAYAR</span><span>${rp(r.total)}</span></div><div class="row"><span>STATUS</span><b>MENUNGGU VERIFIKASI ADMIN</b></div></div>
    <div class="note" style="margin-top:20px">Admin akan mengecek bukti bayarmu. Lacak pesanan dengan ID di atas lewat menu <b>Cek Pesanan</b> di toko utama. Jika DP, pelunasan juga lewat toko utama.</div>
    <div class="foot"><button data-act="copy" data-v="${esc(r.kode)}">SALIN ID PESANAN</button><a class="btn pri" href="${MAIN_ORIGIN}/">BUKA TOKO UTAMA (CEK PESANAN)</a><button data-act="close">KEMBALI KE TOKO</button></div>`);
}
export const hasReceipt = () => { try { return !!localStorage.getItem(LAST_KEY); } catch { return false; } };

/* ---------- Event delegation ---------- */
P.body.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t) return; const a = t.dataset.act, v = t.dataset.v, i = Number(t.dataset.i);
  if (a === 'cat') openCatalog(v);
  else if (a === 'prod') openProduct(v);
  else if (a === 'color') { sel.color = v; openProduct(sel.pid, P.backFn); }
  else if (a === 'size') { sel.size = v; openProduct(sel.pid, P.backFn); }
  else if (a === 'qty') { sel.qty = Math.max(1, Math.min(20, sel.qty + Number(v))); $('#qv').textContent = sel.qty; }
  else if (a === 'add') { if (!sel.color) return ($('#perr').textContent = 'Pilih warna dulu.'); if (!sel.size) return ($('#perr').textContent = 'Pilih ukuran dulu.');
    if (addToCart(sel.pid, sel.color, sel.size, sel.qty)) { ui.beep('add'); ui.toast(`✓ Masuk tas: ${byId(sel.pid).name} (${sel.color}|${sel.size}) ×${sel.qty}`); sel.qty = 1; openProduct(sel.pid, P.backFn); }
    else $('#perr').textContent = 'Varian tidak tersedia.'; }
  else if (a === 'cart') openCart();
  else if (a === 'cq') { const it = S.cart[i]; if (it) { it.qty = Math.max(1, Math.min(20, it.qty + Number(v))); saveCart(); openCart(); } }
  else if (a === 'cdel') { S.cart.splice(i, 1); saveCart(); openCart(); }
  else if (a === 'checkout') { co.voucher = null; openCheckout(); }
  else if (a === 'voucher') applyVoucher();
  else if (a === 'toPay') { const err = validate(); $('#fErr').textContent = err; if (!err) openPay(); }
  else if (a === 'ptab') { payTab = v; openPay(); }
  else if (a === 'submit') submit();
  else if (a === 'copy') { try { await navigator.clipboard.writeText(v); ui.toast('Tersalin: ' + v); } catch { ui.toast('Tahan & salin manual: ' + v); } }
  else if (a === 'close') closePanel();
  else if (a === 'loginToggle') $('#loginForm').hidden = !$('#loginForm').hidden;
  else if (a === 'login') { const m = $('#lgErr'); m.textContent = 'Masuk…'; try { await S.fb.customerSignIn($('#lgE').value.trim(), $('#lgP').value); S.user = S.fb.auth.currentUser; co.f.email = S.user?.email || co.f.email; openCheckout(); } catch (er) { m.textContent = 'Login gagal. Cek email/password.'; } }
});
P.body.addEventListener('input', e => { const k = e.target.dataset.f; if (k) { co.f[k] = e.target.value; if (k === 'zip') co.f.zip = e.target.value.replace(/\D/g, ''); } });
export const openProductFrom = openProduct;

export const showRaw = show;
export function getBannerText() { return new Promise(res => { try { S.fb.listenBannerText(d => res(d)); setTimeout(() => res(null), 4000); } catch { res(null); } }); }
