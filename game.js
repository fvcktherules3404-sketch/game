import { S, initShop, bindUI, openCatalog, openProduct, openCart, openCheckout, openReceipt, hasReceipt, closePanel, panelOpen, cartCount, showRaw, getBannerText, rp, MAIN_ORIGIN } from './shop.js';
const $ = s => document.querySelector(s);
const cv = $('#game');
let paused = true, started = false, muted = localStorage.getItem('fvckgame.mute') === '1', t = 0;
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

/* ================= RENDERER WebGL mini (tanpa library, ±6 KB) ================= */
const gl = cv.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'low-power' });
const keys = {}; let jx = 0, jy = 0;
const I4 = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const mT = (x, y, z) => { const m = I4(); m[12] = x; m[13] = y; m[14] = z; return m; };
const mS = (x, y, z) => { const m = I4(); m[0] = x; m[5] = y; m[10] = z; return m; };
const mRy = a => { const c = Math.cos(a), s = Math.sin(a), m = I4(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; };
const mRx = a => { const c = Math.cos(a), s = Math.sin(a), m = I4(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; };
const mRz = a => { const c = Math.cos(a), s = Math.sin(a), m = I4(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; };
const r3 = m => new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
const persp = (f, a, n, fa) => { const t = 1 / Math.tan(f / 2), m = new Float32Array(16); m[0] = t / a; m[5] = t; m[10] = (fa + n) / (n - fa); m[11] = -1; m[14] = 2 * fa * n / (n - fa); return m; };
function lookAt(e, c, u) {
  let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]], l = Math.hypot(...z); z = z.map(v => v / l);
  let x = [u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]]; l = Math.hypot(...x); x = x.map(v => v / l);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]], d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -d(x, e), -d(y, e), -d(z, e), 1]);
}
let pr, uMVP, uR, uC, uUV, uEm, uTx, CUBE, SPH, WHITE;
if (gl) {
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec3 aP,aN;attribute vec2 aT;uniform mat4 uMVP;uniform mat3 uR;uniform vec2 uUV;varying vec3 vN;varying vec2 vT;varying float vD;void main(){gl_Position=uMVP*vec4(aP,1.);vN=uR*aN;vT=aT*uUV;vD=gl_Position.w;}'));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec3 vN;varying vec2 vT;varying float vD;uniform vec4 uC;uniform sampler2D uTex;uniform float uTx,uEm;void main(){vec4 b=uC;if(uTx>.5)b=texture2D(uTex,vT)*vec4(uC.rgb,1.);float l=max(dot(normalize(vN),normalize(vec3(.35,.9,.45))),0.);vec3 c=b.rgb*(.55+.6*l)+uEm*vec3(.91,1.,.23);c=mix(c,vec3(.04),clamp((vD-13.)/16.,0.,.85));gl_FragColor=vec4(c,b.a);}'));
  gl.linkProgram(pr); gl.useProgram(pr);
  [uMVP, uR, uC, uUV, uEm, uTx] = ['uMVP', 'uR', 'uC', 'uUV', 'uEm', 'uTx'].map(n => gl.getUniformLocation(pr, n));
  ['aP', 'aN', 'aT'].forEach((n, i) => { gl.bindAttribLocation(pr, i, n); }); gl.linkProgram(pr); gl.useProgram(pr);
  [uMVP, uR, uC, uUV, uEm, uTx] = ['uMVP', 'uR', 'uC', 'uUV', 'uEm', 'uTx'].map(n => gl.getUniformLocation(pr, n));
  for (let i = 0; i < 3; i++) gl.enableVertexAttribArray(i);
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(.04, .04, .04, 1);
  const mk = (v, ix) => { const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW); const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(ix), gl.STATIC_DRAW); return { vb, ib, n: ix.length }; };
  const F = [[[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]]];
  let v = [], ix = []; F.forEach(([n, u, w], f) => { [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => v.push(...[0, 1, 2].map(i => n[i] * .5 + (u[i] * a + w[i] * b) * .5), ...n, (a + 1) / 2, 1 - (b + 1) / 2)); ix.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3); });
  CUBE = mk(v, ix); v = []; ix = [];
  for (let y = 0; y <= 8; y++) for (let x = 0; x <= 12; x++) { const th = y / 8 * Math.PI, ph = x / 12 * Math.PI * 2, nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph); v.push(nx * .5, ny * .5, nz * .5, nx, ny, nz, x / 12, y / 8); if (y < 8 && x < 12) { const a = y * 13 + x; ix.push(a, a + 1, a + 13, a + 1, a + 14, a + 13); } }
  SPH = mk(v, ix);
}
const useM = m => { gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24); };
const mkTex = (src, rep) => { const x = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, x); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); const w = rep ? gl.REPEAT : gl.CLAMP_TO_EDGE; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (rep) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); return x; };
const cTex = (w, h, fn, rep) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return mkTex(c, rep); };
let VP = I4(), ID = I4(), TX = {};
function draw(m, M, R, c, o = {}) {
  gl.uniformMatrix4fv(uMVP, false, mul(VP, M)); gl.uniformMatrix3fv(uR, false, r3(R)); gl.uniform4fv(uC, c); gl.uniform2f(uUV, o.u || 1, o.v || 1); gl.uniform1f(uEm, o.em || 0);
  if (o.tex) { gl.bindTexture(gl.TEXTURE_2D, o.tex); gl.uniform1f(uTx, 1); } else gl.uniform1f(uTx, 0); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
}
const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255, 1];
const B = (x, y, z, sx, sy, sz, c, o = {}) => { const R = o.ry ? mRy(o.ry) : ID; draw(CUBE, mul(mT(x, y, z), mul(R, mS(sx, sy, sz))), R, typeof c === 'string' ? hex(c) : c, o); };
function human(x, z, ry, sw, c) {
  const rM = mul(mT(x, 0, z), mRy(ry)), R0 = mRy(ry), part = (ox, oy, oz, rx, cy, sz, col) => { const Rr = mul(R0, mRx(rx)); draw(CUBE, mul(mul(rM, mT(ox, oy, oz)), mul(mRx(rx), mul(mT(0, cy, 0), mS(...sz)))), Rr, hex(col)); };
  part(-.14, .85, 0, sw, -.4, [.2, .8, .24], c.pants); part(.14, .85, 0, -sw, -.4, [.2, .8, .24], c.pants);
  part(0, 1.2, 0, 0, 0, [.5, .7, .3], c.top); part(-.37, 1.5, 0, -sw, -.3, [.16, .6, .2], c.top); part(.37, 1.5, 0, sw, -.3, [.16, .6, .2], c.top);
  part(0, 1.78, 0, 0, 0, [.32, .32, .32], '#e8c9a0'); part(0, 1.95, 0, 0, 0, [.36, .1, .36], c.cap); part(0, 1.92, .2, 0, 0, [.3, .04, .16], c.cap);
  if (c.logo) part(0, 1.3, .16, 0, 0, [.2, .12, .02], '#e8ff3a');
}
/* ---------- tekstur buatan (canvas, tanpa file) ---------- */
let texFloor, texWall, texSign, texBorn, texCult, texBoard;
if (gl) {
  texFloor = cTex(128, 128, (c, w) => { c.fillStyle = '#242424'; c.fillRect(0, 0, w, w); c.fillStyle = '#2a2a2a'; c.fillRect(2, 2, 60, 60); c.fillRect(66, 66, 60, 60); c.fillStyle = '#161616'; c.fillRect(0, 63, w, 2); c.fillRect(63, 0, 2, w); for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * .04})`; c.fillRect(Math.random() * w, Math.random() * w, 3, 2); } }, true);
  texWall = cTex(128, 128, (c, w) => { c.fillStyle = '#2d2d2d'; c.fillRect(0, 0, w, w); c.fillStyle = '#1e1e1e'; for (let y = 0; y < w; y += 16) { c.fillRect(0, y, w, 2); for (let x = (y / 16 % 2) * 32; x < w; x += 64) c.fillRect(x, y, 2, 16); } }, true);
  const lab = (w, h, f) => cTex(w, h, (c) => { c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#f2f2f2'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12); c.fillStyle = '#f2f2f2'; c.textAlign = 'center'; f(c, w, h); });
  texSign = lab(512, 128, (c, w, h) => { c.font = '900 76px Impact,"Arial Black",sans-serif'; c.fillText('FVCK', 120, 90); c.strokeStyle = '#f2f2f2'; c.lineWidth = 2; c.strokeText('THE', 256, 90); c.fillText('RULES', 400, 90); });
  texBorn = lab(512, 128, (c) => { c.fillStyle = '#e8ff3a'; c.font = '900 56px Impact,sans-serif'; c.fillText('BORN TO DISOBEY', 256, 84); });
  texCult = lab(512, 128, (c) => { c.font = '900 52px Impact,sans-serif'; c.fillText('SOCCER CULTURE', 256, 82); });
  texBoard = lab(256, 256, (c) => { c.fillStyle = '#e8ff3a'; c.font = '900 52px Impact,sans-serif'; c.fillText('DROP', 128, 100); c.fillStyle = '#f2f2f2'; c.font = '22px monospace'; c.fillText('PRESS E', 128, 150); c.fillText('UNTUK BACA', 128, 180); });
}
function prodTex(p) {
  const u = p.thumb; if (!u) return null; let e = TX[u]; if (e) return e.t;
  e = TX[u] = { t: null }; const im = new Image(); im.crossOrigin = 'anonymous';
  im.onload = () => { try { e.t = mkTex(im, false); } catch { e.t = null; } }; im.onerror = () => { };
  im.src = u.includes('/upload/') ? u.replace('/upload/', '/upload/w_256,c_limit,q_auto/') : u; return null;
}

/* ---------- dunia: hanger, rak, kasir ---------- */
const RW = 7.5, RZN = -5.6, RZP = 5.6;
let hangers = [], rails = [], solids = [];
const GROUPS = [{ k: 'pre', x: -7.15, z: -4.5, dx: 0, dz: 1, ry: Math.PI / 2, ix: 1, iz: 0, max: 11 }, { k: 'ready', x: 7.15, z: -4.5, dx: 0, dz: 1, ry: -Math.PI / 2, ix: -1, iz: 0, max: 11 }, { k: 'sold', x: -3.8, z: -5.3, dx: 1, dz: 0, ry: 0, ix: 0, iz: 1, max: 13 }];
const STATIC_SOLIDS = [[-1.3, -.65, 1.3, .65], [3.4, 2, 6.6, 3.95], [6.6, 2.2, 7.5, 3.95]];
function rebuild() {
  hangers = []; rails = []; solids = STATIC_SOLIDS.slice();
  GROUPS.forEach(g => {
    const list = S.products.filter(p => p.badge === g.k).slice(0, g.max * 2);
    for (let row = 0; row < 2; row++) {
      const part = list.slice(row * g.max, (row + 1) * g.max); if (!part.length) continue;
      const ox = g.x + g.ix * row * 1.7, oz = g.z + g.iz * row * 1.7, len = part.length * .62 + .3;
      part.forEach((p, i) => hangers.push({ p, x: ox + g.dx * i * .62, z: oz + g.dz * i * .62, ry: g.ry, ph: i * 1.7 }));
      const cx = ox + g.dx * (part.length * .62 / 2 - .31), cz = oz + g.dz * (part.length * .62 / 2 - .31);
      rails.push({ cx, cz, sx: g.dx ? len : .05, sz: g.dz ? len : .05, ends: [[ox - g.dx * .4, oz - g.dz * .4], [ox + g.dx * (part.length * .62 - .2), oz + g.dz * (part.length * .62 - .2)]] });
      const hx = g.dx ? len / 2 : .4, hz = g.dz ? len / 2 : .4; solids.push([cx - hx, cz - hz, cx + hx, cz + hz]);
    }
  });
  hangers.forEach(h => prodTex(h.p));
}
S.listeners.add(rebuild); rebuild();
const SPOTS = [
  { id: 'table', x: 0, z: 0, lim: 2.0, t: 'PRESS E TO BROWSE · SEMUA PRODUK', go: () => openCatalog('all') },
  { id: 'kasir', x: 5, z: 4.5, lim: 2.0, t: 'PRESS E TO CHECKOUT', go: cashier },
  { id: 'board', x: 5.0, z: -4.9, lim: 1.8, t: 'PRESS E TO READ · PAPAN DROP', go: board },
  { id: 'door', x: 0, z: 5.1, lim: 1.5, t: 'PRESS E · KELUAR KE TOKO UTAMA', go: door },
  { id: 'ball', x: 0, z: 0, lim: 1.3, t: 'PRESS E · TENDANG BOLA', go: kick }
];
function cashier() {
  beep('ding');
  if (!cartCount()) return say('KASIR', 'Tas kamu masih kosong, bro. Pilih kaos dari hanger dulu — atau tekan KATALOG di atas.', [['BUKA KATALOG', () => openCatalog('all')], hasReceipt() ? ['STRUK TERAKHIR', () => openReceipt()] : ['TUTUP']]);
  say('KASIR', `Oke, ${cartCount()} item. Siapin alamat sama bukti bayar ya.`, [['CHECKOUT', openCheckout], ['LIHAT TAS', openCart]]);
}
let bannerTxt = null;
async function board() {
  say('PAPAN DROP', 'Memuat info…'); const b = bannerTxt || (bannerTxt = await getBannerText());
  say('PAPAN DROP', b && (b.topText || b.bottomText) ? [b.topText, b.bottomText].filter(Boolean).join(' · ') : 'Belum ada pengumuman. Pantau terus — next drop segera.');
}
function door() { say('PINTU', 'Keluar dari game dan kembali ke toko utama?', [['YA, KELUAR', () => { beep('door'); location.href = MAIN_ORIGIN + '/'; }], ['TETAP DI SINI']]); }
const ball = { x: -3, z: 3.5, vx: 0, vz: 0 };
function kick() { beep('kick'); const dx = ball.x - pl.x, dz = ball.z - pl.z, l = Math.hypot(dx, dz) || 1; ball.vx = dx / l * 7; ball.vz = dz / l * 7; toast(['OFFSIDE! (VAR bilang gol sah)', 'Rules are made to be broken.', 'GOOOL! Wasit buta lagi.'][Math.random() * 3 | 0]); }

/* ---------- pemain, kamera, input ---------- */
const pl = { x: -2.6, z: 1.2, ry: Math.PI, walk: 0, moving: false }, cam = { yaw: 0, pitch: .38 };
addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('#say')) closeSay(); else if (panelOpen()) closePanel(); return; }
  if (paused) return; const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
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
let lid = null, lx = 0, ly = 0;                                  // geser layar/mouse = putar kamera
cv.addEventListener('pointerdown', e => { if (paused) return; lid = e.pointerId; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(lid); });
cv.addEventListener('pointermove', e => { if (e.pointerId !== lid) return; cam.yaw += (e.clientX - lx) * .006; cam.pitch = Math.max(.12, Math.min(.9, cam.pitch + (e.clientY - ly) * .004)); lx = e.clientX; ly = e.clientY; });
const lEnd = e => { if (e.pointerId === lid) lid = null; }; cv.addEventListener('pointerup', lEnd); cv.addEventListener('pointercancel', lEnd);
$('#bAct').addEventListener('pointerdown', e => { e.preventDefault(); interact(); });
if (matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window) document.body.classList.add('is-touch');

let hot = null;
function nearest() {
  let best = null, bs = 1;
  for (const h of hangers) { const d = Math.hypot(pl.x - h.x, pl.z - h.z) / 1.5; if (d < bs) { bs = d; best = { h, t: `PRESS E · ${h.p.name.toUpperCase()} · ${rp(h.p.priceN)}`, go: () => openProduct(h.p.id, () => closePanel()) }; } }
  for (const s of SPOTS) { const sx = s.id === 'ball' ? ball.x : s.x, sz = s.id === 'ball' ? ball.z : s.z; const d = Math.hypot(pl.x - sx, pl.z - sz) / s.lim; if (d < bs) { bs = d; best = s; } }
  return best;
}
function interact() { if (paused || $('#say')) return closeSay(); const s = nearest(); if (s) s.go(); }
$('#prompt').addEventListener('pointerdown', e => { e.preventDefault(); interact(); });

function update(dt) {
  if (!paused) {
    if (keys.arrowleft) cam.yaw -= dt * 2; if (keys.arrowright) cam.yaw += dt * 2;
    const ix = (keys.d ? 1 : 0) - (keys.a ? 1 : 0) + jx, iz = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0) - jy;
    const fx = Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
    let dx = fx * iz + rx * ix, dz = fz * iz + rz * ix; const m = Math.hypot(dx, dz); if (m > 1) { dx /= m; dz /= m; }
    pl.moving = m > .15;
    if (pl.moving) {
      pl.x += dx * 3.4 * dt; pl.z += dz * 3.4 * dt;
      let da = Math.atan2(dx, dz) - pl.ry; da = Math.atan2(Math.sin(da), Math.cos(da)); pl.ry += da * Math.min(1, dt * 12);
      const w0 = pl.walk; pl.walk += dt * 8; if (Math.floor(w0 / Math.PI) !== Math.floor(pl.walk / Math.PI)) beep('step');
    }
    for (const [a, b, c, d] of solids) { const nx = Math.max(a, Math.min(pl.x, c)), nz = Math.max(b, Math.min(pl.z, d)), ddx = pl.x - nx, ddz = pl.z - nz, dist = Math.hypot(ddx, ddz);
      if (dist < .35) { if (dist > 1e-4) { pl.x = nx + ddx / dist * .35; pl.z = nz + ddz / dist * .35; } else { pl.x = a - .35; } } }
    pl.x = Math.max(-RW + .1, Math.min(RW - .1, pl.x)); pl.z = Math.max(RZN + .1, Math.min(RZP, pl.z));
    const n = nearest(), p = $('#prompt'); hot = n && n.h || null;
    if (n) { p.textContent = document.body.classList.contains('is-touch') ? n.t.replace('PRESS E', 'TAP') : n.t; p.hidden = false; } else p.hidden = true;
  } else pl.moving = false;
  const dxb = ball.x - pl.x, dzb = ball.z - pl.z, db = Math.hypot(dxb, dzb); if (db < .6 && pl.moving) { ball.vx += dxb / db * 4 * dt * 10; ball.vz += dzb / db * 4 * dt * 10; }
  ball.x += ball.vx * dt; ball.z += ball.vz * dt; const f = Math.pow(.25, dt); ball.vx *= f; ball.vz *= f;
  if (Math.abs(ball.x) > 7.6) { ball.vx *= -1; ball.x = Math.sign(ball.x) * 7.6; } if (ball.z < -5.5 || ball.z > 5.5) { ball.vz *= -1; ball.z = Math.max(-5.5, Math.min(5.5, ball.z)); }
}

/* ---------- gambar tiap frame ---------- */
function render() {
  const asp = cv.width / cv.height, yaw = started ? cam.yaw : t * .15, pit = started ? cam.pitch : .45, dist = 4.6;
  const fx = Math.sin(yaw), fz = -Math.cos(yaw), tx = started ? pl.x : 0, tz = started ? pl.z : 0;
  let cx = tx - fx * dist * Math.cos(pit), cz = tz - fz * dist * Math.cos(pit); const cy = 1.4 + dist * Math.sin(pit);
  cx = Math.max(-RW + .3, Math.min(RW - .3, cx)); cz = Math.max(-5.7, Math.min(5.7, cz));
  VP = mul(persp(.95, asp, .1, 50), lookAt([cx, cy, cz], [tx, 1.2, tz], [0, 1, 0]));
  gl.viewport(0, 0, cv.width, cv.height); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); useM(CUBE);
  const W = [1, 1, 1, 1];
  B(0, -.05, 0, 16, .1, 12, W, { tex: texFloor, u: 8, v: 6 });
  B(0, 1.7, -6.05, 16.2, 3.4, .1, W, { tex: texWall, u: 8, v: 2 }); B(-8.05, 1.7, 0, .1, 3.4, 12.2, W, { tex: texWall, u: 6, v: 2 }); B(8.05, 1.7, 0, .1, 3.4, 12.2, W, { tex: texWall, u: 6, v: 2 });
  B(-4.5, 1.7, 6.05, 7, 3.4, .1, W, { tex: texWall, u: 4, v: 2 }); B(4.5, 1.7, 6.05, 7, 3.4, .1, W, { tex: texWall, u: 4, v: 2 }); B(0, 3, 6.05, 2, .8, .1, W, { tex: texWall });
  B(0, .02, 5.5, 2, .02, 1, '#e8ff3a', { em: .15 }); B(-1.05, 1.1, 6, .1, 2.2, .15, '#f2f2f2'); B(1.05, 1.1, 6, .1, 2.2, .15, '#f2f2f2');
  B(0, 2.7, -5.97, 6, 1.3, .06, W, { tex: texSign }); B(7.92, 2.7, -1.5, 4, .9, .06, W, { tex: texBorn, ry: -Math.PI / 2 }); B(-7.92, 2.7, -1.5, 4, .9, .06, W, { tex: texCult, ry: Math.PI / 2 });
  B(5.0, 1.8, -5.95, 1.8, 1.2, .08, W, { tex: texBoard });
  for (let i = 0; i < 16; i++) B(-7.5 + i, 3.3, -5.9, .3, .25, .02, i % 2 ? '#f2f2f2' : '#e8ff3a');
  rails.forEach(r => { B(r.cx, 2.0, r.cz, r.sx, .04, r.sz, '#9a9a9a'); r.ends.forEach(([x, z]) => B(x, 1.0, z, .05, 2.0, .05, '#555')); });
  // hanger + kaos (foto produk jadi tekstur)
  hangers.forEach(h => {
    const e = h.p.thumb && TX[h.p.thumb], tex = e && e.t, on = hot === h, sw = Math.sin(t * 1.3 + h.ph) * .03 + (on ? Math.sin(t * 6) * .07 : 0), sc = on ? 1.1 : 1;
    const rM = mul(mT(h.x, 0, h.z), mRy(h.ry)), R0 = mRy(h.ry);
    const sub = (M, R, s, c, o) => draw(CUBE, mul(rM, mul(M, mS(...s))), mul(R0, R), c, o);
    sub(mT(0, 1.9, 0), ID, [.03, .14, .03], hex('#bbbbbb')); sub(mul(mT(0, 1.82, 0), mRz(sw)), mRz(sw), [.5, .03, .03], hex('#bbbbbb'));
    sub(mul(mT(0, 1.8, 0), mul(mRz(sw), mT(0, -.38 * sc, 0))), mRz(sw), [.5 * sc, .72 * sc, .05], tex ? W : hex(['#555555', '#8a8a8a', '#d9d9d9'][h.p.name.length % 3]), { tex, em: on ? .18 : 0 });
  });
  // meja tengah (semua produk) + lipatan kaos
  B(0, .8, 0, 2.6, .12, 1.3, '#4a4a4a'); [[-1.1, -.5], [1.1, -.5], [-1.1, .5], [1.1, .5]].forEach(([x, z]) => B(x, .37, z, .1, .74, .1, '#222'));
  for (let i = 0; i < 5; i++) { for (let j = 0; j < 3; j++) B(-1 + i * .5, .92 + j * .05, i % 2 ? .2 : -.2, .42, .05, .5, ['#f2f2f2', '#111', '#8a8a8a'][(i + j) % 3]); }
  // kasir
  B(5, .55, 3.5, 3.2, 1.1, .9, '#0c0c0c'); B(5, 1.12, 3.5, 3.3, .06, 1, '#f2f2f2'); B(5, .5, 3.96, 3, .16, .02, '#e8ff3a', { em: .1 }); B(4.2, 1.35, 3.5, .5, .36, .4, '#333'); B(4.2, 1.45, 3.35, .4, .02, .3, '#e8ff3a', { em: .3 });
  B(5, 1.3, 2.2, 3.2, 2.6, .3, '#1a1a1a'); for (let i = 0; i < 6; i++) B(3.8 + i * .45, 1.7 + (i % 2) * .4, 2.38, .35, .3, .05, ['#f2f2f2', '#555', '#8a8a8a'][i % 3]);
  B(7.05, .5, 3.1, .8, 1, .8, '#333'); B(7.05, 1.2, 3.1, .6, .4, .6, '#444');
  human(5, 2.75, 0, Math.sin(t * 1.5) * .05, { pants: '#1a1a1a', top: '#f2f2f2', cap: '#0a0a0a', logo: false });
  // bola + bayangan + pemain
  gl.depthMask(false); B(pl.x, .015, pl.z, .9, .01, .9, [0, 0, 0, .4]); B(ball.x, .015, ball.z, .6, .01, .6, [0, 0, 0, .4]); gl.depthMask(true);
  useM(SPH); const bR = mRy(ball.x * 3); draw(SPH, mul(mT(ball.x, .28, ball.z), mS(.56, .56, .56)), bR, [.95, .95, .95, 1]); useM(CUBE);
  human(pl.x, pl.z, pl.ry, pl.moving ? Math.sin(pl.walk) * .7 : 0, { pants: '#222222', top: '#0a0a0a', cap: '#f2f2f2', logo: true });
}
let lastT = 0;
function frame(ts) {
  requestAnimationFrame(frame); if (document.hidden) { lastT = ts; return; }
  const dt = Math.min(.05, (ts - (lastT || ts)) / 1000); lastT = ts; t += dt; update(dt); render();
}
function resize() { const d = Math.min(1.5, devicePixelRatio || 1); cv.width = Math.round(innerWidth * d); cv.height = Math.round(innerHeight * d); }
addEventListener('resize', resize); resize();
if (gl) requestAnimationFrame(frame);
else { $('#bPlay').onclick = () => openCatalog('all'); setTimeout(() => { const l = $('#loadState span'); if (l) l.textContent = 'WebGL tidak tersedia — memakai KATALOG CEPAT.'; }, 300); }

/* ---------- alur layar ---------- */
const howHTML = `<div class="note"><b>DESKTOP</b><br>WASD = jalan · geser mouse (tahan klik) / ← → = putar kamera · E = ambil baju / interaksi · ESC = tutup panel.</div>
<div class="note"><b>MOBILE</b><br>Joystick kiri bawah = jalan · geser layar = putar kamera · tombol E (atau tap tulisan "TAP …") = interaksi.</div>
<div class="note"><b>MISI</b><br>1) Dekati hanger, tekan E, pilih warna & ukuran, ADD TO CART.<br>2) Jalan ke KASIR (atau tekan tombol KASIR ▸ di atas = lompat langsung).<br>3) Isi data kirim, bayar via QRIS / transfer, upload bukti, dapat struk + ID pesanan.</div>
<div class="note">Cuma mau belanja cepat? Tombol <b>KATALOG</b> membuka semua produk tanpa jalan-jalan. Harga & stok selalu dari toko utama.</div>
<div class="note">Coba tendang bola di lantai. Cari papan drop di dinding belakang.</div>`;
function play() {
  $('#intro').hidden = true; $('#hud').hidden = false; started = true; paused = false; beep('door'); setMute(muted);
  if (!localStorage.getItem('fvckgame.seen')) { localStorage.setItem('fvckgame.seen', '1'); say('SELAMAT DATANG', document.body.classList.contains('is-touch') ? 'Joystick = jalan, geser layar = putar kamera, E = ambil baju dari hanger. KASIR ▸ = langsung ke kasir.' : 'WASD = jalan, geser mouse = putar kamera, E = ambil baju dari hanger. KASIR ▸ = langsung ke kasir.'); }
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
if (location.search.includes('debug')) window.__g = { pl, cam, ball };
