import { S, initShop, bindUI, openCatalog, openCart, openCheckout, openReceipt, hasReceipt, closePanel, panelOpen, cartCount, showRaw, getBannerText, MAIN_ORIGIN } from './shop.js';
const $ = s => document.querySelector(s);
const cv = $('#game'), ctx = cv.getContext('2d');
const W = 768, H = 512; let VH = 250;
let paused = true, started = false, muted = localStorage.getItem('fvckgame.mute') === '1', dpr = 1, VW = 400, sc = 1, t = 0;

/* ---------- audio (WebAudio, tanpa file) ---------- */
let ac = null;
function beep(type) {
  if (muted) return; try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  const seq = { step: [[90, .03, 'square', .02]], add: [[520, .08], [780, .1]], ding: [[880, .12], [1320, .25]], door: [[160, .12, 'sawtooth'], [110, .2, 'sawtooth']], kick: [[200, .06, 'square'], [140, .08, 'square']] }[type] || [];
  let at = ac.currentTime; seq.forEach(([f, d, w = 'sine', v = .06]) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = w; o.frequency.value = f; g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(.0001, at + d); o.connect(g).connect(ac.destination); o.start(at); o.stop(at + d); at += d * .9; });
}
const setMute = m => { muted = m; localStorage.setItem('fvckgame.mute', m ? '1' : '0'); $('#bMute').textContent = m ? '🔇' : '🔊'; };

/* ---------- toast & dialog ---------- */
let tt; function toast(m) { const e = $('#toast'); e.textContent = m; e.hidden = false; clearTimeout(tt); tt = setTimeout(() => e.hidden = true, 2600); }
function say(title, text, act) {
  closeSay(); const d = document.createElement('div'); d.className = 'dlg'; d.id = 'say';
  d.innerHTML = `<b>${title}</b><p style="margin:8px 0 0"></p>${act ? '<div style="display:flex;gap:8px;margin-top:10px"></div>' : ''}`; d.querySelector('p').textContent = text;
  if (act) { act.forEach(([label, fn]) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { closeSay(); fn && fn(); }; d.lastChild.appendChild(b); }); }
  else d.onclick = closeSay;
  $('#hud').appendChild(d); d.style.pointerEvents = 'auto';
}
const closeSay = () => { const d = $('#say'); if (d) d.remove(); };

/* ---------- dunia ---------- */
const solids = [
  { x: 0, y: 0, w: W, h: 84 }, { x: 0, y: 496, w: 352, h: 16 }, { x: 416, y: 496, w: 352, h: 16 }, { x: 0, y: 0, w: 14, h: H }, { x: W - 14, y: 0, w: 14, h: H },
  { x: 48, y: 112, w: 160, h: 36 }, { x: 560, y: 112, w: 160, h: 36 }, { x: 304, y: 236, w: 160, h: 44 }, { x: 28, y: 224, w: 36, h: 128 },
  { x: 544, y: 352, w: 176, h: 40 }, { x: 720, y: 316, w: 34, h: 76 }, { x: 96, y: 424, w: 96, h: 18 }
];
let bannerTxt = null, ball = { x: 62, y: 462, vx: 0, vy: 0 };
const spots = [
  { r: { x: 48, y: 112, w: 160, h: 36 }, t: 'PRESS E TO BROWSE · PRE ORDER', go: () => openCatalog('pre') },
  { r: { x: 560, y: 112, w: 160, h: 36 }, t: 'PRESS E TO BROWSE · READY STOCK', go: () => openCatalog('ready') },
  { r: { x: 28, y: 224, w: 36, h: 128 }, t: 'PRESS E TO BROWSE · ARSIP', go: () => openCatalog('sold') },
  { r: { x: 304, y: 236, w: 160, h: 44 }, t: 'PRESS E TO BROWSE · SEMUA PRODUK', go: () => openCatalog('all') },
  { r: { x: 544, y: 352, w: 176, h: 40 }, t: 'PRESS E TO CHECKOUT', go: cashier },
  { r: { x: 320, y: 20, w: 128, h: 50 }, t: 'PRESS E TO READ · PAPAN DROP', go: board },
  { r: { x: 352, y: 496, w: 64, h: 16 }, t: 'PRESS E · KELUAR KE TOKO UTAMA', go: door },
  { r: { x: 50, y: 450, w: 24, h: 24 }, t: 'PRESS E · TENDANG BOLA', go: kick }
];
function cashier() {
  beep('ding');
  if (!cartCount()) return say('KASIR', 'Tas kamu masih kosong, bro. Ambil kaos dari rak dulu — atau tekan KATALOG di atas.', [['BUKA KATALOG', () => openCatalog('all')], hasReceipt() ? ['STRUK TERAKHIR', () => openReceipt()] : ['TUTUP']]);
  say('KASIR', `Oke, ${cartCount()} item. Siapin alamat sama bukti bayar ya.`, [['CHECKOUT', openCheckout], ['LIHAT TAS', openCart]]);
}
async function board() {
  say('PAPAN DROP', 'Memuat info…'); const b = bannerTxt || (bannerTxt = await getBannerText());
  const txt = b && (b.topText || b.bottomText) ? [b.topText, b.bottomText].filter(Boolean).join(' · ') : 'Belum ada pengumuman. Pantau terus — next drop segera.';
  say('PAPAN DROP', txt);
}
function door() { say('PINTU', 'Keluar dari game dan kembali ke toko utama?', [['YA, KELUAR', () => { beep('door'); location.href = MAIN_ORIGIN + '/'; }], ['TETAP DI SINI']]); }
function kick() { beep('kick'); const a = Math.random() * Math.PI * 2; ball.vx = Math.cos(a) * 160; ball.vy = Math.sin(a) * 160 - 40; toast(['OFFSIDE! (VAR bilang gol sah)', 'Rules are made to be broken.', 'GOOOL! Wasit buta lagi.'][Math.random() * 3 | 0]); }

/* ---------- pemain & input ---------- */
const pl = { x: 384, y: 470, dir: 'up', walk: 0, moving: false };
const keys = {}; let jx = 0, jy = 0;
addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('#say')) closeSay(); else if (panelOpen()) closePanel(); return; }
  if (paused) return;
  const k = e.key.toLowerCase(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (k === 'e' || k === 'enter') { interact(); return; } keys[k] = true;
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; jx = jy = 0; });
const joy = $('#joy'), knob = $('#knob'); let jid = null;
function joyMove(e) { const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = e.clientX - cx, dy = e.clientY - cy; const m = Math.hypot(dx, dy), R = r.width / 2 - 10; if (m > R) { dx *= R / m; dy *= R / m; }
  knob.style.transform = `translate(${dx}px,${dy}px)`; jx = Math.abs(dx) > 12 ? dx / R : 0; jy = Math.abs(dy) > 12 ? dy / R : 0; }
joy.addEventListener('pointerdown', e => { jid = e.pointerId; joy.setPointerCapture(jid); joyMove(e); });
joy.addEventListener('pointermove', e => { if (e.pointerId === jid) joyMove(e); });
const joyEnd = e => { if (e.pointerId === jid) { jid = null; jx = jy = 0; knob.style.transform = ''; } };
joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);
$('#bAct').addEventListener('pointerdown', e => { e.preventDefault(); interact(); });
if (matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window) document.body.classList.add('is-touch');

const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const feet = (x, y) => ({ x: x - 6, y: y - 7, w: 12, h: 7 });
function nearest() {
  let best = null, bd = 30; for (const s of spots) { const cx = Math.max(s.r.x, Math.min(pl.x, s.r.x + s.r.w)), cy = Math.max(s.r.y, Math.min(pl.y - 4, s.r.y + s.r.h)); const d = Math.hypot(pl.x - cx, pl.y - 4 - cy); if (d < bd) { bd = d; best = s; } } return best;
}
function interact() { if (paused || $('#say')) return closeSay(); const s = nearest(); if (s) s.go(); }
$('#prompt').addEventListener('pointerdown', e => { e.preventDefault(); interact(); });

function update(dt) {
  if (paused) { pl.moving = false; return; }
  let dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + jx, dy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0) + jy;
  const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
  pl.moving = m > .15; if (pl.moving) {
    const sp = 95 * dt; let nx = pl.x + dx * sp, ny = pl.y + dy * sp;
    if (solids.some(s => hit(feet(nx, pl.y), s))) nx = pl.x; if (solids.some(s => hit(feet(nx, ny), s))) ny = pl.y;
    pl.x = Math.max(20, Math.min(W - 20, nx)); pl.y = Math.max(90, Math.min(H - 2, ny));
    pl.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    const w0 = pl.walk; pl.walk += dt * 9; if ((w0 | 0) !== (pl.walk | 0) && (pl.walk | 0) % 2 === 0) beep('step');
  }
  ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.vx *= .96; ball.vy *= .96;
  if (ball.x < 22 || ball.x > W - 22) ball.vx *= -1; if (ball.y < 100 || ball.y > H - 20) ball.vy *= -1; ball.x = Math.max(22, Math.min(W - 22, ball.x)); ball.y = Math.max(100, Math.min(H - 20, ball.y));
  const n = nearest(), p = $('#prompt'); if (n) { p.textContent = (document.body.classList.contains('is-touch') ? n.t.replace('PRESS E', 'TAP') : n.t); p.hidden = false; } else p.hidden = true;
}

/* ---------- render ---------- */
const R = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };
function floor() {
  for (let y = 84; y < H; y += 32) for (let x = 0; x < W; x += 32) R(((x + y) / 32) % 2 ? '#1b1b1b' : '#222', x, y, 32, 32);
  R('#e8ff3a22', 352, 480, 64, 16); for (let i = 0; i < 6; i++) R('#2d2d2d', 330 + i * 24, 440, 12, 3);
  R('#111', 300, 300, 168, 4);
}
function wall() {
  R('#2b2b2b', 0, 0, W, 84); for (let y = 0; y < 84; y += 14) { R('#222', 0, y, W, 1); for (let x = (y / 14 % 2) * 20; x < W; x += 40) R('#222', x, y, 1, 14); }
  R('#0a0a0a', 0, 76, W, 8); R('#fff', 0, 80, W, 2);
  R('#0a0a0a', 224, 10, 320, 54); R('#fff', 224, 10, 320, 2); R('#fff', 224, 62, 320, 2);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 30px Impact, "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('FVCK', 300, 48); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeText('THE', 384, 48); ctx.fillText('RULES', 468, 48);
  R('#3a3a3a', 320, 20, 128, 0); // papan drop
  R('#d9d9d9', 570, 22, 140, 44); R('#111', 574, 26, 132, 36); ctx.font = 'bold 8px monospace'; ctx.fillStyle = '#e8ff3a'; ctx.fillText('BORN TO DISOBEY', 640, 48);
  R('#d9d9d9', 60, 22, 120, 44); R('#111', 64, 26, 112, 36); ctx.fillStyle = '#fff'; ctx.fillText('SOCCER CULTURE', 120, 48);
  for (let i = 0; i < 6; i++) { R(i % 2 ? '#fff' : '#e8ff3a', 20 + i * 14, 70, 10, 8); }          // pennant
}
function rack(r, count, tone) {
  R('#0a0a0a', r.x, r.y, r.w, r.h); R('#888', r.x, r.y, r.w, 3); R('#555', r.x, r.y + r.h - 4, r.w, 4);
  const n = Math.max(3, Math.min(count || 3, 8)); for (let i = 0; i < n; i++) { const x = r.x + 8 + i * ((r.w - 20) / n); R(['#f2f2f2', '#555', '#111', '#8a8a8a'][(i + tone) % 4], x, r.y + 6, 14, 22); R('#e8ff3a', x + 5, r.y + 6, 4, 3); }
}
function props() {
  const c = k => S.products.filter(p => p.badge === k).length;
  rack(solids[5], c('pre'), 0); rack(solids[6], c('ready'), 1);
  const a = solids[8]; R('#0a0a0a', a.x, a.y, a.w, a.h); R('#555', a.x, a.y, 3, a.h); for (let i = 0; i < Math.max(3, Math.min(c('sold'), 5)); i++) R(['#555', '#8a8a8a', '#111'][i % 3], a.x + 6, a.y + 8 + i * 22, 24, 16);
  const tb = solids[7]; R('#444', tb.x, tb.y, tb.w, tb.h); R('#666', tb.x, tb.y, tb.w, 6); for (let i = 0; i < 5; i++) R(['#f2f2f2', '#111', '#8a8a8a'][i % 3], tb.x + 10 + i * 28, tb.y + 14, 20, 20);
  const k = solids[9]; R('#111', k.x, k.y, k.w, k.h); R('#f2f2f2', k.x, k.y, k.w, 5); R('#e8ff3a', k.x + 10, k.y + 14, 40, 14); ctx.font = 'bold 9px monospace'; ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.fillText('KASIR', k.x + 14, k.y + 25);
  R('#333', 720, 316, 34, 76); R('#555', 724, 322, 26, 20); R('#555', 724, 348, 26, 20);
  R('#5a4630', 96, 424, 96, 18); R('#2a2018', 100, 442, 6, 8); R('#2a2018', 182, 442, 6, 8);
  R('#0a0a0a', 352, 490, 64, 6); R('#e8ff3a', 356, 492, 56, 2);                                       // pintu
  R('#666', 600, 300, 14, 18); R('#f2f2f2', 604, 288, 8, 8);
  // NPC kasir
  const bob = Math.sin(t * 2) * 1; R('#000', 624, 310 + bob, 18, 20); R('#e8c9a0', 627, 298 + bob, 12, 12); R('#111', 626, 296 + bob, 14, 5); R('#fff', 629, 302 + bob, 2, 2); R('#fff', 635, 302 + bob, 2, 2);
  // bola
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ball.x, ball.y, 6, 0, 7); ctx.fill(); R('#000', ball.x - 2, ball.y - 2, 4, 4);
}
function player() {
  const f = pl.moving ? (pl.walk | 0) % 2 : 0, x = pl.x | 0, y = pl.y | 0;
  R('#00000066', x - 8, y - 3, 16, 5); R('#222', x - 5, y - 8 + f, 4, 8 - f); R('#222', x + 1, y - 8 + (1 - f), 4, 8 - (1 - f));
  R('#0a0a0a', x - 7, y - 20, 14, 13); R('#fff', x - 7, y - 20, 14, 2); R('#f2f2f2', x - 2, y - 17, 4, 3);
  R('#e8c9a0', x - 5, y - 30, 10, 10); R('#111', x - 6, y - 32, 12, 5);
  if (pl.dir !== 'up') { const ox = pl.dir === 'left' ? -2 : pl.dir === 'right' ? 2 : 0; R('#000', x - 3 + ox, y - 26, 2, 2); R('#000', x + 1 + ox, y - 26, 2, 2); }
}
function frame(ts) {
  const dt = Math.min(.05, (ts - (frame.l || ts)) / 1000); frame.l = ts; t += dt; update(dt);
  const cx = Math.max(0, Math.min(W - VW, pl.x - VW / 2)) - (VW > W ? (VW - W) / 2 : 0), cy = Math.max(0, Math.min(H - VH, pl.y - 20 - VH / 2)) - (VH > H ? (VH - H) / 2 : 0);
  ctx.setTransform(sc, 0, 0, sc, 0, 0); ctx.imageSmoothingEnabled = false; R('#000', 0, 0, VW + 2, VH + 2);
  ctx.setTransform(sc, 0, 0, sc, -cx * sc, -cy * sc); floor(); wall();
  const items = [{ y: 0, d: props }, { y: pl.y, d: player }]; items.sort((a, b) => a.y - b.y); items.forEach(i => i.d());
  const n = !paused && nearest(); if (n) { ctx.strokeStyle = '#e8ff3a'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.strokeRect(n.r.x - 2, n.r.y - 2, n.r.w + 4, n.r.h + 4); ctx.setLineDash([]); }
  requestAnimationFrame(frame);
}
function resize() { dpr = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; sc = Math.min(cv.height / 200, cv.width / 300); VW = cv.width / sc; VH = cv.height / sc; }
addEventListener('resize', resize); resize(); requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { if (document.hidden) { for (const k in keys) keys[k] = false; jx = jy = 0; } });

/* ---------- alur layar ---------- */
const howHTML = `<div class="note"><b>DESKTOP</b><br>WASD / Panah = jalan · E = interaksi · ESC = tutup panel · Mouse = pilih produk & tombol.</div>
<div class="note"><b>MOBILE</b><br>Joystick kiri bawah = jalan · tombol E kanan bawah (atau tap tulisan "TAP …") = interaksi.</div>
<div class="note"><b>MISI</b><br>1) Dekati rak, tekan E, pilih warna & ukuran, ADD TO CART.<br>2) Jalan ke KASIR (atau tekan tombol KASIR ▸ di atas = lompat langsung).<br>3) Isi data kirim, bayar via QRIS / transfer, upload bukti, dapat struk + ID pesanan.</div>
<div class="note">Cuma mau belanja cepat? Tombol <b>KATALOG</b> membuka semua produk tanpa jalan-jalan. Harga & stok selalu dari toko utama.</div>
<div class="note">Coba tendang bola di pojok kiri bawah. Atau cari papan drop di dinding atas.</div>`;
function play() {
  $('#intro').hidden = true; $('#hud').hidden = false; started = true; paused = false; beep('door'); setMute(muted);
  if (!localStorage.getItem('fvckgame.seen')) { localStorage.setItem('fvckgame.seen', '1'); say('SELAMAT DATANG', document.body.classList.contains('is-touch') ? 'Geser joystick untuk jalan. Tekan E untuk berinteraksi. Tombol KASIR ▸ = langsung ke kasir.' : 'WASD / Panah = jalan. E = interaksi. ESC = tutup panel. Tombol KASIR ▸ = langsung ke kasir.'); }
}
$('#bPlay').onclick = play; $('#bHow').onclick = () => showRaw('HOW TO PLAY', howHTML);
$('#bQuick').onclick = () => openCatalog('all');
$('#bMenu').onclick = () => showRaw('MENU', `${howHTML}<div class="foot">${hasReceipt() ? '<button id="mRec">STRUK TERAKHIR</button>' : ''}<a class="btn" href="${MAIN_ORIGIN}/">KEMBALI KE TOKO UTAMA</a></div>`);
document.addEventListener('click', e => { if (e.target.id === 'mRec') openReceipt(); });
$('#bCatalog').onclick = () => openCatalog('all'); $('#bCart').onclick = openCart; $('#bKasir').onclick = () => { cartCount() ? openCheckout() : cashier(); };
$('#bMute').onclick = () => setMute(!muted);

bindUI({
  toast, beep,
  onChange: open => { paused = open || !started; if (open) { for (const k in keys) keys[k] = false; jx = jy = 0; closeSay(); } },
  onCart: n => { $('#cartN').textContent = n; }
});
const load = $('#loadState');
initShop(st => {
  load.className = 'load ' + (st === 'ok' ? 'ok' : st === 'error' ? 'err' : '');
  load.querySelector('span').textContent = st === 'ok' ? `${S.products.length} produk siap` : st === 'error' ? 'Katalog gagal dimuat — coba muat ulang. Atau belanja di toko utama.' : 'Memuat katalog…';
}).then(() => { $('#cartN').textContent = cartCount(); });
$('#cartN').textContent = cartCount();
