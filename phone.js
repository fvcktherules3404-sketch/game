// phone.js — "HP" di dalam game: Berita & Diskusi diambil dari Firebase JURNAL (fvck-journal) milik web utama.
// Hanya BACA (read-only), memakai query yang sama persis dengan journal.js di web utama. Membalas/bereaksi tetap lewat web utama.
import { S, PAY, rp, MAIN_ORIGIN } from './shop.js?v=20261030';

const JOURNAL_URL = 'https://jurnal-fucktherules.my.id', MAIN_URL = 'https://fucktherules.my.id/';
const FS_URL = 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';   // sama dengan versi di firebase.js web utama
const CATS = [['all', 'Semua'], ['football', 'Football'], ['indonesia', 'Indonesia'], ['world', 'World'], ['culture', 'Culture'], ['opinion', 'Opinion']];
const TYPES = [['fire', '🔥'], ['heart', '❤️'], ['like', '👍']];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toDate = ts => (ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null);
const fmtDate = ts => { const d = toDate(ts); return d ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
const fmtDT = ts => { const d = toDate(ts); return d ? d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; };
const catLabel = k => (CATS.find(c => c[0] === k) || [k, k || 'News'])[1];

const ICON = {
  news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h13v14H6a2 2 0 0 1-2-2V5z"/><path d="M17 8h3v9a2 2 0 0 1-2 2"/><path d="M7.5 9h6M7.5 12.5h6M7.5 16h3.5"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12z"/><path d="M9 11h6M9 14h4"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"/><path d="M5 17a3 3 0 0 1 3-3h11"/></svg>',
  shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8l1.5-4h13L20 8"/><path d="M4 8h16v2a3 3 0 0 1-6 0 3 3 0 0 1-4 0 3 3 0 0 1-6 0V8z"/><path d="M5 12v8h14v-8"/></svg>',
  pack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7a2 2 0 0 1 2-2h11v4"/><rect x="4" y="7" width="16" height="12" rx="2"/><path d="M16 13h4"/></svg>',
  sig: '<svg viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx=".8"/><rect x="5" y="5" width="3" height="7" rx=".8"/><rect x="10" y="2.5" width="3" height="9.5" rx=".8"/><rect x="15" y="0" width="3" height="12" rx=".8"/></svg>',
  wifi: '<svg viewBox="0 0 18 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 4.5a11 11 0 0 1 15 0M4.2 7.4a7 7 0 0 1 9.6 0M7 10.2a3 3 0 0 1 4 0"/></svg>',
  bat: '<svg viewBox="0 0 26 13" fill="none"><rect x="1" y="1" width="21" height="11" rx="3.2" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="3" width="17" height="7" rx="1.6" fill="currentColor"/><rect x="23" y="4.5" width="2" height="4" rx="1" fill="currentColor"/></svg>',
};

// sampul tanpa foto: potongan lapangan sepak bola (sama dengan web utama)
function pitch(seed) {
  const h = [...String(seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7), zoom = [1, 1.6, 2.2, 3][h % 4], W = 105, H = 68, w = W / zoom, hh = H / zoom;
  const x = (((h >> 3) % 1000) / 1000) * (W - w), y = (((h >> 13) % 1000) / 1000) * (H - hh);
  return `<svg viewBox="${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${hh.toFixed(2)}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".5"><rect x="0" y="0" width="105" height="68"/><line x1="52.5" y1="0" x2="52.5" y2="68"/><circle cx="52.5" cy="34" r="9.15"/><rect x="0" y="13.84" width="16.5" height="40.32"/><rect x="88.5" y="13.84" width="16.5" height="40.32"/><rect x="0" y="24.84" width="5.5" height="18.32"/><rect x="99.5" y="24.84" width="5.5" height="18.32"/></g></svg>`;
}
const cover = a => `<div class="ph-cover">${a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<div class="ph-pitch">${pitch(a.id || a.title)}</div></div>`;
const skel = n => Array.from({ length: n }, () => '<div class="ph-skel"><i></i><i></i><i></i></div>').join('');
const errBox = (msg, retry) => `<div class="ph-empty"><b>Belum bisa dimuat</b><p>${esc(msg)}</p>${retry ? '<button class="ph-btn2" data-retry>Coba lagi</button>' : ''}<button class="ph-btn2 ghost" data-web="${MAIN_URL}">Buka web utama ↗</button></div>`;

// ---------- util aplikasi pesanan (sama dengan web utama) ----------
const PAY_LABEL = { pending: 'Pending', dp: 'DP', lunas: 'Lunas', ditolak: 'Ditolak' };
const ms = v => (v && v.toMillis ? v.toMillis() : v && v.seconds ? v.seconds * 1000 : v ? new Date(v).getTime() || 0 : 0);
const classify = v => { v = String(v || '').trim(); if (v.includes('@')) return { email: v }; if (/[A-Za-z]/.test(v) && v.includes('-')) return { kode: v }; if (/^[\d+\s().-]{6,}$/.test(v)) return { hp: v }; return { kode: v }; };
const kv = (k, v) => `<div class="ph-kv"><span>${k}</span><b>${v}</b></div>`;
const NOTFOUND = 'Periksa kembali ID Order, email, atau no. HP yang kamu pakai saat checkout.';

let FS = null;
async function fs() {                                       // Firestore jurnal dari modul firebase.js web utama (journalDb) + SDK versi yang sama
  if (FS) return FS;
  const fb = S.fb; if (!fb || !fb.journalDb) throw new Error('Koneksi ke jurnal belum tersedia.');
  const f = await import(FS_URL); FS = { db: fb.journalDb, ...f }; return FS;
}
const data = { articles: null, posts: null, replies: {} };
async function loadArticles() {
  const { db, collection, query, where, orderBy, limit, getDocs } = await fs();
  const snap = await getDocs(query(collection(db, 'articles'), where('status', '==', 'published'), orderBy('publishedAt', 'desc'), limit(40)));
  return (data.articles = snap.docs.map(d => ({ id: d.id, ...d.data() })));
}
async function loadPosts() {
  const { db, collection, query, where, orderBy, limit, getDocs, getCountFromServer } = await fs();
  const snap = await getDocs(query(collection(db, 'posts'), where('status', '==', 'published'), orderBy('createdAt', 'desc'), limit(12)));
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const cnt = q => getCountFromServer(q).then(s => s.data().count).catch(() => 0);
  await Promise.all(items.map(async p => {
    const col = collection(db, 'posts', p.id, 'reactions');
    const [rc, ...tc] = await Promise.all([cnt(collection(db, 'posts', p.id, 'replies')), ...TYPES.map(([t]) => cnt(query(col, where('type', '==', t))))]);
    p.replyCount = rc; p.counts = Object.fromEntries(TYPES.map(([t], i) => [t, tc[i]]));
  }));
  return (data.posts = items);
}
async function loadReplies(id) {
  const { db, collection, query, orderBy, limit, getDocs } = await fs();
  const s = await getDocs(query(collection(db, 'posts', id, 'replies'), orderBy('createdAt', 'asc'), limit(60)));
  return (data.replies[id] = s.docs.map(d => ({ id: d.id, ...d.data() })));
}

export function initPhone({ onOpen, onClose, onWeb } = {}) {
  const root = document.createElement('div'); root.id = 'phone'; root.className = 'ph-wrap'; root.hidden = true;
  root.innerHTML = `<button class="ph-x" aria-label="Tutup HP">✕</button>
  <div class="ph-device"><i class="ph-key k1"></i><i class="ph-key k2"></i><i class="ph-key k3"></i>
    <div class="ph-screen">
      <div class="ph-status"><b class="ph-time"></b><span class="ph-cam"></span><span class="ph-sys">${ICON.sig}${ICON.wifi}${ICON.bat}</span></div>
      <div class="ph-app" id="phApp"></div>
      <button class="ph-nav" aria-label="Beranda"><i></i></button>
    </div></div>`;
  document.body.appendChild(root);
  const app = root.querySelector('#phApp'), timeEl = root.querySelector('.ph-time');
  let view = { n: 'home' }, hist = [], cat = 'all', tick = 0, open = false, webOn = false, wt = 0;
  const ord = { lacak: {}, resi: {}, pel: {} };          // state tiap aplikasi pesanan: { q, list, sel, tl, loading, err, bukti, sent }

  const clock = () => { const d = new Date(); timeEl.textContent = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':'); };
  const bar = (title, back, refresh) => `<div class="ph-bar">${back ? '<button class="ph-bk" data-back aria-label="Kembali">‹</button>' : '<span class="ph-sp"></span>'}<span class="ph-tt">${esc(title)}</span>${refresh ? '<button class="ph-bk" data-refresh aria-label="Muat ulang">⟳</button>' : '<span class="ph-sp"></span>'}</div>`;
  const go = (v, push = true) => { if (push) hist.push(view); view = v; render(); app.scrollTop = 0; };
  const home = () => { hist = []; view = { n: 'home' }; render(); };

  function renderHome() {
    const d = new Date(), tm = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':'), dt = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
    app.className = 'ph-app ph-homebg';
    app.innerHTML = `<div class="ph-widget"><div class="ph-bigtime">${tm}</div><div class="ph-date">${esc(dt)}</div></div>
    <div class="ph-grid">
      <button data-open="berita"><span class="ph-ic" style="background:#ffca1f;color:#111">${ICON.news}</span><em>Berita</em></button>
      <button data-open="diskusi"><span class="ph-ic" style="background:#45e08f;color:#111">${ICON.chat}</span><em>Diskusi</em></button>
      <button data-open="lacak"><span class="ph-ic" style="background:#ffe1b0;color:#111">${ICON.pack}</span><em>Lacak</em></button>
      <button data-open="resi"><span class="ph-ic" style="background:#c3effd;color:#111">${ICON.truck}</span><em>Cek Resi</em></button>
      <button data-open="pel"><span class="ph-ic" style="background:#ff5f1f;color:#fffdf3">${ICON.wallet}</span><em>Pelunasan</em></button>
      <button data-web="${JOURNAL_URL}"><span class="ph-ic" style="background:#111;color:#fffdf3">${ICON.book}</span><em>Jurnal</em></button>
      <button data-web="${MAIN_URL}"><span class="ph-ic" style="background:#b5c4ff;color:#111">${ICON.shop}</span><em>Toko</em></button>
    </div>
    <div class="ph-brand"><img src="assets/logo.png" alt="" width="34" height="48"><span>fvcktherules</span></div>`;
  }

  async function renderBerita() {
    app.className = 'ph-app';
    const chips = `<div class="ph-chips">${CATS.map(([k, l]) => `<button class="${cat === k ? 'on' : ''}" data-cat="${k}">${l}</button>`).join('')}</div>`;
    app.innerHTML = bar('Berita', true, true) + chips + '<div class="ph-list" id="phList">' + skel(3) + '</div>';
    const list = app.querySelector('#phList'), my = ++tick;
    try {
      const items = data.articles || await loadArticles(); if (my !== tick) return;
      const f = cat === 'all' ? items : items.filter(a => a.category === cat);
      list.innerHTML = f.length ? f.map(a => `<article class="ph-card" data-art="${esc(a.id)}">${cover(a)}<div class="ph-cb"><div class="ph-meta"><span class="ph-tag">${esc(catLabel(a.category))}</span><time>${fmtDate(a.publishedAt || a.createdAt)}</time></div><h3>${esc(a.title)}</h3><p>${esc(a.summary)}</p></div></article>`).join('')
        : '<div class="ph-empty"><b>Belum ada berita</b><p>Berita baru muncul setelah editor menyetujuinya.</p></div>';
    } catch (e) { if (my === tick) list.innerHTML = errBox(e && e.code === 'permission-denied' ? 'Akses ke jurnal ditolak (rules Firestore).' : (e && e.message) || 'Periksa koneksi internet.', true); }
  }
  function renderArticle(id) {
    const a = (data.articles || []).find(x => x.id === id); app.className = 'ph-app';
    if (!a) { app.innerHTML = bar('Berita', true) + errBox('Berita tidak ditemukan.', false); return; }
    app.innerHTML = bar(catLabel(a.category), true) + `<div class="ph-art">${cover(a)}<div class="ph-meta"><span class="ph-tag">${esc(catLabel(a.category))}</span><time>${fmtDate(a.publishedAt || a.createdAt)}</time></div><h2>${esc(a.title)}</h2><p class="ph-sum">${esc(a.summary)}</p>
      <button class="ph-btn2" data-web="${JOURNAL_URL}/article.html?id=${encodeURIComponent(a.id)}">Baca selengkapnya ›</button></div>`;
  }

  async function renderDiskusi() {
    app.className = 'ph-app';
    app.innerHTML = bar('Diskusi', true, true) + '<div class="ph-list" id="phList">' + skel(2) + '</div>';
    const list = app.querySelector('#phList'), my = ++tick;
    try {
      const items = data.posts || await loadPosts(); if (my !== tick) return;
      list.innerHTML = items.length ? items.map(p => `<article class="ph-post" data-post="${esc(p.id)}"><header><span class="ph-av">F</span><div><strong>FvcktheRules</strong><span class="ph-tag adm">Admin</span>${p.pinned ? '<span class="ph-tag pin">Pinned</span>' : ''}<time>${fmtDT(p.createdAt)}</time></div></header>
        ${p.label ? `<h3>${esc(p.label)}</h3>` : ''}<p>${esc(p.content)}</p>${p.image ? `<img class="ph-pimg" src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
        <div class="ph-act"><span>${TYPES.map(([t, e]) => `${e} ${p.counts?.[t] ?? 0}`).join('&nbsp;&nbsp;')}</span><button data-replies="${esc(p.id)}">💬 ${p.replyCount ?? 0} balasan</button></div><div class="ph-thread" hidden></div></article>`).join('')
        + `<button class="ph-btn2 ghost" data-web="${MAIN_URL}">Ikut diskusi di web utama ›</button>`
        : '<div class="ph-empty"><b>Belum ada post</b><p>Post pertama dari tim akan muncul di sini.</p></div>';
    } catch (e) { if (my === tick) list.innerHTML = errBox(e && e.code === 'permission-denied' ? 'Akses ke jurnal ditolak (rules Firestore).' : (e && e.message) || 'Periksa koneksi internet.', true); }
  }

  // ---------- aplikasi pesanan: Lacak / Cek Resi / Pelunasan (fungsi sama dengan web utama) ----------
  const TITLES = { lacak: 'Lacak pesanan', resi: 'Cek resi', pel: 'Pelunasan' };
  const resiBox = (d, resiMode) => d.resi ? `<div class="ph-resi"><span class="ph-cap">Resi anda</span><b>${esc(d.resi)}</b><p>Paket sudah diserahkan ke pihak pengirim. Cek progres pengiriman melalui resi ini.</p><div class="ph-row2"><button class="ph-btn2" data-copy="${esc(d.resi)}">Salin resi</button><button class="ph-btn2 ghost" data-trk="${esc(d.resi)}">Lacak di J&amp;T ›</button></div></div>` : (resiMode ? '<p class="ph-note">Pesanan anda belum dikirim.</p>' : '');
  function detailLacak(d, tl, resiMode) {
    const items = d.items && d.items.length ? d.items : [{ nama: d.produk || '', warna: '', size: '' }], art = d.poNames && d.poNames.length ? d.poNames.join(', ') : d.produk || '', pay = d.pay || 'pending';
    const events = tl && tl.length ? tl.map(e => ({ text: e.text, at: ms(e.createdAt) })) : [{ text: 'Pesanan dibuat', at: ms(d.createdAt) }];
    return `<div class="ph-detail"><span class="ph-cap">ID pemesanan</span><p class="ph-kode">${esc(d.kode)}</p>${resiBox(d, resiMode)}<p class="ph-art-n">${esc(art)}</p>
      ${kv('Nama', esc(d.nama || '-'))}${d.email ? kv('Email', esc(d.email)) : ''}${d.hp ? kv('Nomor HP', esc(d.hp)) : ''}
      ${items.map(i => kv('Produk', esc(i.nama)) + (i.warna || i.size ? kv('Warna / Size', esc(i.warna) + ' / ' + esc(i.size)) : '')).join('')}
      <div class="ph-hr"></div>${d.total ? kv('Total', rp(d.total)) : ''}${pay === 'dp' && d.dpNominal ? kv('DP', rp(d.dpNominal)) + kv('Sisa', rp(d.sisa)) : ''}${kv('Status', esc(PAY_LABEL[pay] || pay))}
      ${pay === 'dp' && !resiMode ? '<p class="ph-note">Lunasi sisa lewat aplikasi <b>Pelunasan</b> dengan ID order ini.</p>' : ''}
      ${resiMode ? '' : `<div class="ph-tl"><b>Timeline</b>${events.map((e, k) => `<div class="ph-step${k === events.length - 1 ? ' last' : ''}"><i></i><div><strong>${esc(e.text)}</strong><time>${e.at ? fmtDT(new Date(e.at)) : ''}</time></div></div>`).join('')}</div>`}</div>`;
  }
  function detailPel(d, st) {
    const ring = `<div class="ph-detail"><span class="ph-cap">Ringkasan pesanan</span><p class="ph-kode">${esc(d.kode)}</p><p class="ph-art-n">${esc(d.produk)}</p><p class="ph-muted" style="margin:0 0 8px">Atas nama ${esc(d.nama)}</p>
      ${kv('Total', rp(d.totalAkhir))}${kv('DP dibayar', '- ' + rp(d.dpNominal))}<div class="ph-hr"></div><div class="ph-kv big"><span>Sisa pelunasan</span><b>${rp(d.sisa)}</b></div></div>`;
    if (d.status === 'lunas') return ring + '<div class="ph-detail"><span class="ph-cap">Status</span><p class="ph-ok">Pesananmu sudah LUNAS. Terima kasih!</p></div>';
    const wait = d.status === 'menunggu_verifikasi';
    return ring + `<div class="ph-detail"><span class="ph-cap">Rekening pembayaran</span>
      <div class="ph-acc"><span>${esc(PAY.bank)}</span><b>${esc(PAY.rek)}</b><button class="ph-mini" data-copy="${esc(PAY.rek)}">Salin</button></div>
      <div class="ph-acc"><span>GOPAY</span><b>${esc(PAY.gopay)}</b><button class="ph-mini" data-copy="${esc(PAY.gopay)}">Salin</button></div>
      <p class="ph-muted">a.n ${esc(PAY.an)}</p><img class="ph-qris" src="${MAIN_ORIGIN}/qris.jpg" alt="QRIS" onerror="this.onerror=null;this.src='assets/qris.jpg'"></div>
      ${wait ? '<p class="ph-note">Bukti pelunasan sudah terkirim dan menunggu verifikasi admin. Salah upload? Kirim ulang di bawah.</p>' : ''}
      <div class="ph-detail"><span class="ph-cap">Upload bukti pelunasan (${rp(d.sisa)})</span><label class="ph-upload" for="phBukti"><span id="phBuktiLbl">${st.bukti ? '✓ Foto siap dikirim' : 'Tap untuk pilih foto bukti'}</span></label><input type="file" id="phBukti" accept="image/*" hidden>
      <button class="ph-btn2" data-kirim ${st.sending ? 'disabled' : ''}>${st.sending ? 'Mengirim…' : 'Kirim bukti pelunasan'}</button><div class="ph-err">${esc(st.err2 || '')}</div></div>`;
  }
  function renderOrder(kind) {
    const st = ord[kind]; app.className = 'ph-app';
    let body = '';
    if (st.loading) body = skel(2);
    else if (st.list === null || st.list === undefined) body = `<div class="ph-empty"><p>${kind === 'pel' ? 'Masukkan ID order untuk melunasi sisa pembayaran DP.' : kind === 'resi' ? 'Masukkan ID order untuk melihat nomor resi pengiriman.' : 'Masukkan ID order, email, atau no. HP untuk melihat status pesanan.'}</p></div>`;
    else if (!st.list.length) body = `<div class="ph-empty"><b>Pesanan tidak ditemukan</b><p>${NOTFOUND}${kind === 'pel' ? ' Pelunasan hanya tersedia untuk pesanan DP.' : ''}</p></div>`;
    else {
      const d = st.list.find(x => x.kode === st.sel);
      if (!d) body = '<div class="ph-list">' + st.list.map(x => `<button class="ph-pick" data-pick="${esc(x.kode)}"><b>${esc(x.kode)}</b><span>${esc((x.poNames && x.poNames.length) ? x.poNames.join(', ') : x.produk)}</span>${x.status === 'lunas' ? '<em>Lunas</em>' : ''}</button>`).join('') + '</div>';
      else body = (st.list.length > 1 ? '<button class="ph-link" data-unsel>‹ Pesanan lain</button>' : '') + (kind === 'pel' ? detailPel(d, st) : detailLacak(d, st.tl, kind === 'resi'));
    }
    app.innerHTML = bar(TITLES[kind], true) + `<div class="ph-form"><div class="ph-search"><input id="phQ" value="${esc(st.q || '')}" placeholder="ID order / email / no. HP" autocomplete="off" autocapitalize="off"><button class="ph-go" data-find="${kind}">Cari</button></div><div class="ph-err">${esc(st.err || '')}</div></div><div class="ph-res">${body}</div>`;
  }
  async function pickOrder(kind, kode) {
    const st = ord[kind]; st.sel = kode; st.tl = null; st.err2 = ''; render();
    if (kind !== 'lacak') return;
    const d = st.list.find(x => x.kode === kode); if (!d) return;
    try {                                                    // timeline + update per artikel, persis seperti web utama
      const fb = S.fb; let tl = (await fb.getTimeline(kode)).filter(e => e.kind !== 'legacy'); const mulai = ms(d.createdAt);
      const art = fb.getPoUpdates ? (await fb.getPoUpdates(d.isPO === false ? [] : d.poIds)).filter(e => ms(e.createdAt) >= mulai) : [];
      st.tl = tl.concat(art).sort((a, b) => (ms(a.createdAt) - ms(b.createdAt)) || (a.kind === 'created' ? -1 : 0));
    } catch (e) { console.warn('timeline', e); }
    if (view.n === kind && st.sel === kode) render();
  }
  async function findOrder(kind) {
    const st = ord[kind], q = (app.querySelector('#phQ')?.value || '').trim(); st.q = q; st.err = ''; st.sel = null; st.bukti = null;
    if (!q) { st.err = 'Isi ID order, email, atau no. HP dulu.'; st.list = null; return render(); }
    st.loading = true; render();
    try {
      const fn = { lacak: S.fb?.cariLacak, resi: S.fb?.cariResi, pel: S.fb?.cariPelunasan }[kind]; if (!fn) throw new Error('Fitur ini belum tersedia di web utama.');
      const list = await fn(classify(q)); if (list === null || list === undefined) throw new Error('Gagal memuat. Coba lagi sebentar lagi.');
      st.list = list; st.loading = false; if (list.length === 1) { await pickOrder(kind, list[0].kode); return; }
    } catch (e) { st.list = null; st.err = (e && e.message) || 'Gagal memuat. Coba lagi sebentar lagi.'; }
    st.loading = false; if (view.n === kind) render();
  }

  // browser mini di dalam HP: halaman web tampil di layar HP (iframe), pemain tidak keluar dari game
  function renderWeb() {
    const u = view.url; let host = u; try { const x = new URL(u); host = x.host + (x.pathname !== '/' ? x.pathname : ''); } catch { }
    app.className = 'ph-app ph-web';
    app.innerHTML = `<div class="ph-bar"><button class="ph-bk" data-back aria-label="Kembali ke HP">‹</button><div class="ph-url"><i>${/^https:/.test(u) ? '🔒' : ''}</i><span>${esc(host)}</span></div><button class="ph-bk" data-reload aria-label="Muat ulang">⟳</button><button class="ph-bk" data-ext="${esc(u)}" aria-label="Buka di tab baru">↗</button></div>
      <div class="ph-wf"><iframe src="${esc(u)}" title="${esc(view.title || 'Web')}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals" referrerpolicy="strict-origin-when-cross-origin" allow="clipboard-write"></iframe>
      <div class="ph-wl"><i class="ph-spin"></i><span>Memuat…</span></div>
      <div class="ph-hint" hidden>Halaman tidak tampil? Beberapa situs tidak bisa dibuka di dalam HP. <button data-ext="${esc(u)}">Buka di tab baru ↗</button></div></div>`;
    const fr = app.querySelector('iframe'), ld = app.querySelector('.ph-wl'), hint = app.querySelector('.ph-hint');
    fr.addEventListener('load', () => { ld.hidden = true; clearTimeout(wt); hint.hidden = true; });
    clearTimeout(wt); wt = setTimeout(() => { hint.hidden = false; }, 8000);
    if (!webOn) { webOn = true; onWeb && onWeb(true); }                  // game berhenti menggambar 3D selama browser HP aktif (hemat baterai)
  }

  function render() { if (view.n !== 'web' && webOn) { webOn = false; clearTimeout(wt); onWeb && onWeb(false); } clock(); root.querySelector('.ph-screen').classList.toggle('home', view.n === 'home'); ({ home: renderHome, berita: renderBerita, diskusi: renderDiskusi, artikel: () => renderArticle(view.id), web: renderWeb, lacak: () => renderOrder('lacak'), resi: () => renderOrder('resi'), pel: () => renderOrder('pel') })[view.n](); }

  app.addEventListener('click', async e => {
    const t = e.target.closest('button, .ph-card'); if (!t) return;
    if (t.dataset.open) return go({ n: t.dataset.open });
    if (t.dataset.find) return findOrder(t.dataset.find);
    if (t.dataset.pick) return pickOrder(view.n, t.dataset.pick);
    if (t.dataset.unsel !== undefined) { ord[view.n].sel = null; return render(); }
    if (t.dataset.copy) { try { await navigator.clipboard.writeText(t.dataset.copy); t.textContent = 'Tersalin ✓'; } catch { t.textContent = t.dataset.copy; } return; }
    if (t.dataset.trk) { try { await navigator.clipboard.writeText(t.dataset.trk); } catch { } return go({ n: 'web', url: 'https://jet.co.id/track', title: 'J&T' }); }
    if (t.dataset.kirim !== undefined) {
      const st = ord.pel, d = (st.list || []).find(x => x.kode === st.sel); if (!d) return;
      if (!st.bukti) { st.err2 = 'Upload foto bukti dulu.'; return render(); }
      st.sending = true; st.err2 = ''; render();
      try { await S.fb.kirimBuktiPelunasan(d.kode, st.bukti); d.status = 'menunggu_verifikasi'; st.bukti = null; } catch (e) { console.warn(e); st.err2 = 'Gagal mengirim. Coba lagi.'; }
      st.sending = false; if (view.n === 'pel') render(); return;
    }
    if (t.dataset.web) return go({ n: 'web', url: t.dataset.web, title: t.dataset.title || '' });
    if (t.dataset.ext) return void window.open(t.dataset.ext, '_blank', 'noopener');
    if (t.dataset.reload !== undefined) { const fr = app.querySelector('iframe'); if (fr) { app.querySelector('.ph-wl').hidden = false; fr.src = view.url; } return; }
    if (t.dataset.back !== undefined) return hist.length ? (view = hist.pop(), render()) : home();
    if (t.dataset.refresh !== undefined || t.dataset.retry !== undefined) { if (view.n === 'berita') data.articles = null; if (view.n === 'diskusi') { data.posts = null; data.replies = {}; } return render(); }
    if (t.dataset.cat) { cat = t.dataset.cat; return render(); }
    if (t.dataset.art) return go({ n: 'artikel', id: t.dataset.art });
    if (t.dataset.replies) {
      const post = t.closest('.ph-post'), th = post.querySelector('.ph-thread'); if (!th.hidden) { th.hidden = true; return; }
      th.hidden = false; th.innerHTML = '<div class="ph-skel"><i></i><i></i></div>';
      try {
        const rs = data.replies[t.dataset.replies] || await loadReplies(t.dataset.replies);
        th.innerHTML = rs.length ? rs.map(r => `<div class="ph-reply"><strong>${esc(r.name)}</strong>${r.isAdmin ? '<span class="ph-tag adm">Admin</span>' : ''}<time>${fmtDT(r.createdAt)}</time><p>${esc(r.content)}</p></div>`).join('') : '<p class="ph-muted">Belum ada balasan.</p>';
      } catch { th.innerHTML = '<p class="ph-muted">Balasan belum bisa dimuat.</p>'; }
    }
  });
  app.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'phQ') { e.preventDefault(); findOrder(view.n); } });
  app.addEventListener('change', async e => {                                                // upload bukti pelunasan (Cloudinary preset 'bukti', sama dengan web utama)
    if (e.target.id !== 'phBukti' || !e.target.files[0]) return; const lbl = app.querySelector('#phBuktiLbl'), st = ord.pel; lbl.textContent = 'Mengunggah…'; st.bukti = null;
    try { st.bukti = await S.fb.uploadGambar(e.target.files[0], 'bukti'); } catch (er) { console.warn(er); }
    lbl.textContent = st.bukti ? '✓ ' + e.target.files[0].name : 'Gagal upload, coba lagi'; if (!st.bukti) e.target.value = '';
  });
  const closePhone = () => { if (!open) return; open = false; root.hidden = true; clearInterval(clk); clearTimeout(wt); app.innerHTML = ''; if (webOn) { webOn = false; onWeb && onWeb(false); } onClose && onClose(); };
  let clk = 0;
  const openPhone = () => { if (open) return; open = true; hist = []; view = { n: 'home' }; root.hidden = false; onOpen && onOpen(); render(); clk = setInterval(() => { clock(); if (view.n === 'home') renderHome(); }, 20000); };
  root.querySelector('.ph-x').onclick = closePhone;
  root.addEventListener('pointerdown', e => { if (e.target === root) closePhone(); });                 // ketuk di luar HP = tutup
  root.querySelector('.ph-nav').onclick = () => (view.n === 'home' ? closePhone() : home());          // tombol/gesture beranda
  return { open: openPhone, close: closePhone, toggle: () => (open ? closePhone() : openPhone()), isOpen: () => open };
}
