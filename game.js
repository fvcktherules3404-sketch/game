import { S, initShop, bindUI, openCatalog, openProduct, openCart, openCheckout, openReceipt, hasReceipt, closePanel, panelOpen, cartCount, showRaw, getBannerText, rp, MAIN_ORIGIN, logout, esc } from './shop.js';
import { initPhone } from './phone.js?v=20261012a';
const $ = s => document.querySelector(s);
const cv = $('#game');
let paused = true, started = false, muted = localStorage.getItem('fvckgame.mute') === '1', t = 0;
let rPause = false;                                   // true = jangan menggambar 3D (browser HP sedang aktif)
let phone = { isOpen: () => false, close() { }, toggle() { } };   // diganti initPhone() setelah keys/joystick siap
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

/* ================= RENDERER Three.js (CDN, versi dipin) ================= */
const keys = {}; let jx = 0, jy = 0;
let THREE = null;
for (const u of ['https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js', 'https://unpkg.com/three@0.160.0/build/three.module.min.js']) {
  try { THREE = await import(u); break; } catch (e) { console.warn('three gagal dimuat dari', u, e); }
}
const MOBILE = matchMedia('(pointer:coarse)').matches, DPR = Math.min(devicePixelRatio || 1, 3);
let renderer = null, scene = null, camera = null, keyLight = null, rackG = null, Q = MOBILE ? 1 : 2, prC = 1;
const lightsQ = [];                                  // [lampu, minimal kualitas]
// Resolusi: default = resolusi ASLI layar (piksel fisik), dibatasi anggaran piksel per kualitas; turun otomatis (resS) hanya kalau FPS rendah.
// (Sebelumnya dibatasi pixel-ratio 1.75 → di HP DPR 2.6+ gambar hanya ~67% resolusi asli = burik; mode 'situs desktop' DPR~1.1 jadi tajam.)
let resS = 1;
const PXB = [1.4e6, 3.4e6, 5.5e6];
const prFor = q => { const a = Math.max(1, innerWidth * innerHeight); return Math.max(.7, Math.min(DPR, Math.sqrt(PXB[q] / a)) * resS); };
const showErr = e => { console.error(e); const l = document.querySelector('#loadState span'); if (l) l.textContent = '3D error: ' + ((e && e.message) || e); };
if (THREE) {
  try {
    prC = prFor(Q);
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: DPR < 2.5, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = Q > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false; renderer.autoClear = false;
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(70, 1, .05, 90); scene.add(camera);
    rackG = new THREE.Group(); scene.add(rackG);
    cv.addEventListener('webglcontextlost', e => e.preventDefault());
  } catch (e) { console.error('WebGL tidak tersedia', e); renderer = null; }
}

/* ---------- helper ---------- */
let seed = 11; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
const ctex = (w, h, fn, srgb = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1; return t; };
const rep = (t, u, v) => { const c = t.clone(); c.repeat.set(u, v); c.needsUpdate = true; return c; };
// Lambert untuk permukaan kasar (jauh lebih murah dari PBR); Standard hanya untuk logam/kaca
const M = o => { if ((o.metalness || 0) > 0 || (o.roughness ?? 1) < .7) return new THREE.MeshStandardMaterial(o); const { roughness, metalness, ...r } = o; return new THREE.MeshLambertMaterial(r); };
const tm = (t, w, h, tile, o = {}) => { const m = rep(t, w / tile, h / tile); return M({ map: m, bumpMap: o.bump ? m : null, bumpScale: o.bump || 1, roughness: o.r ?? .9, metalness: o.m ?? 0, color: o.c ?? 0xffffff }); };
const STAT = [];
const bx = (w, h, d, mat, x, y, z, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (o.ry) m.rotation.y = o.ry; m.castShadow = !!o.cs; m.receiveShadow = o.rs !== false; (o.p || scene).add(m); if (!o.p) STAT.push(m); return m; };
const cyl = (r1, r2, h, mat, x, y, z, o = {}) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, o.seg || 10), mat); m.position.set(x, y, z); if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz; m.castShadow = !!o.cs; (o.p || scene).add(m); if (!o.p) STAT.push(m); return m; };
const pln = (w, h, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m; };
const fabricCache = {};
const fabric = hex => fabricCache[hex] || (fabricCache[hex] = M({ color: hex, roughness: .93, side: THREE.DoubleSide }));

function mergeG(list) {
  const pos = [], nor = [], uv = [], idx = []; let off = 0;
  list.forEach(g => {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  });
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); m.setIndex(idx);
  return m;
}
// gabungkan kotak/silinder statis yang bermaterial sama jadi satu draw call
function bakeStatic() {
  const groups = new Map();
  STAT.forEach(m => { const k = m.material.uuid + (m.castShadow ? 'c' : '-') + (m.receiveShadow ? 'r' : '-'); let g = groups.get(k); if (!g) groups.set(k, g = { mat: m.material, cs: m.castShadow, rs: m.receiveShadow, list: [] }); g.list.push(m); });
  groups.forEach(g => {
    if (g.list.length < 2) return;
    const geos = g.list.map(m => { m.updateMatrixWorld(true); const c = m.geometry.clone(); c.applyMatrix4(m.matrixWorld); return c; });
    const mm = new THREE.Mesh(mergeG(geos), g.mat); mm.castShadow = g.cs; mm.receiveShadow = g.rs; scene.add(mm);
    g.list.forEach(m => { m.removeFromParent(); m.geometry.dispose(); }); geos.forEach(c => c.dispose());
  });
  STAT.length = 0;
}

const RINGS = [[-.72, .255, .075], [-.55, .25, .078], [-.4, .245, .08], [-.25, .25, .085], [-.14, .255, .082], [-.095, .235, .07], [-.06, .17, .062], [-.035, .105, .055], [-.02, .085, .05]];
function shirtParts() {
  const NS = 22, pos = [], idx = [];
  RINGS.forEach(([y, a, b], i) => {
    for (let j = 0; j < NS; j++) {
      const th = j / NS * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const fold = 1 + .022 * Math.sin(3 * th + y * 18) + .014 * Math.sin(5 * th - y * 31 + 1.3) + (i === 0 ? .012 * Math.sin(7 * th) : 0);
      let yy = y; if (i >= 7 && s > 0) yy -= (i === 8 ? .04 : .02) * s; if (i === 0) yy += .012 * Math.sin(4 * th + 1);
      pos.push(a * c * fold, yy, b * s * fold);
    }
  });
  for (let i = 0; i < RINGS.length - 1; i++) for (let j = 0; j < NS; j++) {
    const a = i * NS + j, b = i * NS + (j + 1) % NS, c = (i + 1) * NS + (j + 1) % NS, d = (i + 1) * NS + j;
    idx.push(a, d, b, b, d, c);
  }
  const torso = new THREE.BufferGeometry(); torso.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); torso.setIndex(idx); torso.computeVertexNormals();
  const collar = new THREE.TorusGeometry(.07, .009, 6, 18); collar.rotateX(Math.PI / 2); collar.scale(1.2, 1, .72); collar.translate(0, -.03, 0);
  const sleeves = [1, -1].map(s => {
    const g = new THREE.CylinderGeometry(.074, .09, .23, 14, 3, true), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + .03 * Math.sin(3 * Math.atan2(z, x) + y * 25); p.setXYZ(i, x * k, y, z * k); }
    const m = new THREE.Matrix4().makeTranslation(s * .3016, -.153, 0).multiply(new THREE.Matrix4().makeRotationZ(-s * 115 * Math.PI / 180)).multiply(new THREE.Matrix4().makeScale(1, 1, .8));
    g.applyMatrix4(m); return g;
  });
  return { torso, collar, sleeves };
}
function hangerGeo() {
  const N = new THREE.Vector3(0, 0, 0), A = new THREE.Vector3(-.21, -.1, 0), B = new THREE.Vector3(.21, -.1, 0);
  const path = new THREE.CurvePath(); path.add(new THREE.LineCurve3(A, N)); path.add(new THREE.LineCurve3(N, B)); path.add(new THREE.LineCurve3(B, A));
  const tube = new THREE.TubeGeometry(path, 30, .007, 5, false);
  const stem = new THREE.CylinderGeometry(.007, .007, .17, 5); stem.translate(0, .085, 0);
  const ring = new THREE.TorusGeometry(.03, .007, 5, 14); ring.rotateY(Math.PI / 2); ring.translate(0, .2, 0);
  return mergeG([tube, stem, ring]);
}
const CN = [[/hitam|black/i, '#141414'], [/putih|white/i, '#e9e9e6'], [/abu|grey|gray|ash|charcoal/i, '#7d7d80'], [/biru|blue|navy/i, '#2c4a7a'], [/merah|red|maroon/i, '#8a1d1d'], [/hijau|green|olive/i, '#3c5a3a'], [/krem|cream|beige|sand|coklat|brown/i, '#b9a98b'], [/kuning|yellow/i, '#d6c43a']];
const colorOf = p => { const s = (p.colors && p.colors[0]) || ''; for (const [re, c] of CN) if (re.test(s)) return c; return ['#141414', '#e9e9e6', '#7d7d80'][(p.name || '').length % 3]; };

/* ---------- hanger + kaos: SATU geometri bersama; tekstur (desain asli produk) per hanger, hanya untuk yang dekat ---------- */
// kanvas tekstur 256x512: atas 256x256 = desain kaos asli (foto produk tanpa latar), kiri-bawah 192x192 = tag, kotak kecil = warna kain polos
const SC = 1.3, TW = 256, TH = 512, TAGW = 192;
let hGroups = [], hl = null, hSig = '', HGEO = null, photoBusy = 0, lastHot = null;
const PH = {}, plainM = {};                           // PH[url] = { cut, bx, by, bw, bh } | null (gagal)
const FAB_UV = [224 / TW, 1 - 288 / TH];
const frontUV = (x, y) => { const s = Math.max(.004, Math.min(.996, (x + .44) / .88)), tt = Math.max(.004, Math.min(.996, (y + .74) / .74)); return [s, 1 - (1 - tt) * .5]; };
function buildHGeo() {
  const P = [], N = [], U = [], C = [], I = []; let off = 0;
  const addIndexed = (g, col, uvf) => {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); C.push(col[0], col[1], col[2]); const t = uvf(p.getX(i), p.getY(i), u ? u.getX(i) : 0, u ? u.getY(i) : 0); U.push(t[0], t[1]); }
    if (g.index) for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i) + off); else for (let i = 0; i < p.count; i++) I.push(i + off);
    off += p.count;
  };
  const addTris = g => {                              // pecah jadi segitiga lepas: separuh depan (z>0) memakai desain, belakang kain polos
    const p = g.attributes.position, n = g.attributes.normal, ix = g.index, cnt = ix ? ix.count : p.count;
    for (let t = 0; t < cnt; t += 3) {
      const v = [0, 1, 2].map(k => ix ? ix.getX(t + k) : t + k), front = (p.getZ(v[0]) + p.getZ(v[1]) + p.getZ(v[2])) / 3 > 1e-4;
      v.forEach(i => { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); C.push(1, 1, 1); const uv = front ? frontUV(p.getX(i), p.getY(i)) : FAB_UV; U.push(uv[0], uv[1]); I.push(off++); });
    }
  };
  addIndexed(hangerGeo(), [.012, .012, .012], () => FAB_UV);
  const sp = shirtParts(); addTris(sp.torso); sp.sleeves.forEach(addTris); addIndexed(sp.collar, [1, 1, 1], () => FAB_UV);
  const tag = new THREE.PlaneGeometry(.15, .15); tag.rotateX(-.05); tag.translate(0, -.6, .105);
  addIndexed(tag, [1, 1, 1], (x, y, pu, pv) => [(2 + pu * (TAGW - 4)) / TW, 1 - (256 + 2 + (1 - pv) * (TAGW - 4)) / TH]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I);
  hl = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.92, .86, .24)), new THREE.LineBasicMaterial({ color: 0xe8ff3a })); hl.position.set(0, -.56, 0); hl.visible = false;
  return g;
}
function plainMat(hex) {
  return plainM[hex] || (plainM[hex] = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 4; const x = c.getContext('2d'); x.fillStyle = hex; x.fillRect(0, 0, 4, 4);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshLambertMaterial({ map: t, vertexColors: true, side: THREE.DoubleSide });
  })());
}
function drawTag(c, p) {
  const W = TAGW; c.fillStyle = '#fffdf3'; c.fillRect(0, 0, W, W); c.fillStyle = '#111'; c.fillRect(0, 0, W, 30);
  c.fillStyle = '#ffca1f'; c.font = 'bold 19px monospace'; c.textAlign = 'center'; c.fillText(String(p.status || p.badge || '').toUpperCase().slice(0, 14), W / 2, 22);
  c.fillStyle = '#111'; c.font = 'bold 27px Arial Narrow, Arial, sans-serif';
  const words = String(p.name || '').toUpperCase().split(/\s+/); const lines = []; let cur = '';
  words.forEach(wd => { if (c.measureText((cur + ' ' + wd).trim()).width > W - 16 && cur) { lines.push(cur); cur = wd; } else cur = (cur + ' ' + wd).trim(); }); if (cur) lines.push(cur);
  lines.slice(0, 3).forEach((l, i) => c.fillText(l, W / 2, 66 + i * 30));
  c.font = 'bold 30px monospace'; c.fillText(rp(p.priceN), W / 2, W - 14);
}
function drawFull(o) {
  const c = o.cv.getContext('2d'); c.fillStyle = o.hex; c.fillRect(0, 0, TW, TH);
  const ph = PH[o.h.p.thumb]; if (ph) c.drawImage(ph.cut, ph.bx, ph.by, ph.bw, ph.bh, 0, 0, TW, TW);   // desain asli kaos
  c.save(); c.translate(0, 256); drawTag(c, o.h.p); c.restore(); o.full.map.needsUpdate = true;
}
function makeFull(o) {
  o.cv = document.createElement('canvas'); o.cv.width = TW; o.cv.height = TH;
  const t = new THREE.CanvasTexture(o.cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  o.full = new THREE.MeshLambertMaterial({ map: t, vertexColors: true, side: THREE.DoubleSide }); o.m.material = o.full; drawFull(o);
}
function dropFull(o) { o.m.material = plainMat(o.hex); o.full.map.dispose(); o.full.dispose(); o.full = null; o.cv = null; }
// buang latar foto produk (flood-fill dari tepi) lalu ambil kotak batas kaos
function makeCut(im) {
  const w = im.naturalWidth, h = im.naturalHeight, whole = { cut: im, bx: 0, by: 0, bw: w, bh: h };
  try {
    const cv3 = document.createElement('canvas'); cv3.width = w; cv3.height = h; const c = cv3.getContext('2d', { willReadFrequently: true }); c.drawImage(im, 0, 0);
    const d = c.getImageData(0, 0, w, h), px = d.data, N = w * h; let r = 0, g = 0, b = 0, n = 0;
    const edge = (x, y) => { const i = (y * w + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; };
    for (let x = 0; x < w; x++) { edge(x, 0); edge(x, h - 1); } for (let y = 1; y < h - 1; y++) { edge(0, y); edge(w - 1, y); }
    r /= n; g /= n; b /= n;
    const bg = new Uint8Array(N), st = [], isBg = i => { const k = i * 4; return Math.abs(px[k] - r) + Math.abs(px[k + 1] - g) + Math.abs(px[k + 2] - b) < 92; };
    const push = i => { if (!bg[i] && isBg(i)) { bg[i] = 1; st.push(i); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); } for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (st.length) { const i = st.pop(), x = i % w, y = (i / w) | 0; if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w); }
    let x0 = w, y0 = h, x1 = 0, y1 = 0, fg = 0;
    for (let i = 0; i < N; i++) { if (bg[i]) px[i * 4 + 3] = 0; else { fg++; const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (fg < N * .12 || x1 - x0 < w * .25 || y1 - y0 < h * .25) return whole;      // deteksi gagal → pakai foto utuh
    c.putImageData(d, 0, 0); return { cut: cv3, bx: x0, by: y0, bw: x1 - x0 + 1, bh: y1 - y0 + 1 };
  } catch (e) { return whole; }                      // CORS / canvas tainted → foto utuh
}
function loadPhoto(o) {
  const u = o.h.p.thumb; if (!u || o.ph) return; o.ph = 1;
  if (PH[u] !== undefined) { if (PH[u]) drawFull(o); return; }
  if (photoBusy >= 2) { o.ph = 0; return; }
  photoBusy++; PH[u] = null; const im = new Image(); im.crossOrigin = 'anonymous';
  im.onload = () => { photoBusy--; PH[u] = makeCut(im); hGroups.forEach(q => { if (q.h.p.thumb === u && q.full) drawFull(q); }); };
  im.onerror = () => { photoBusy--; };
  im.src = u.includes('/upload/') ? u.replace('/upload/', '/upload/w_256,c_limit,q_auto/') : u;
}
function photoTick() {                                // hanya ~12 hanger terdekat yang punya tekstur desain (hemat memori)
  const list = hGroups.map(o => ({ o, d: Math.hypot(pl.x - o.h.x, pl.z - o.h.z) })).sort((a, b) => a.d - b.d); let made = 0;
  list.forEach(({ o, d }, k) => {
    if (k < 12 && d < 8) { if (!o.full && made < 2) { makeFull(o); made++; o.ph = 0; } if (o.full && !o.ph) loadPhoto(o); }
    else if (o.full && (k > 16 || d > 10)) { dropFull(o); o.ph = 0; }
  });
}

function syncHangers() {
  if (!renderer) return;
  const sig = hangers.map(h => h.p.id + '|' + h.p.name + '|' + ((h.p.colors || [])[0] || '') + '|' + h.p.priceN + '|' + h.p.thumb + '|' + h.x + ',' + h.z).join(';') + '#' + rails.length;
  if (sig === hSig) return; hSig = sig;
  if (!HGEO) HGEO = buildHGeo();
  hGroups.forEach(o => { scene.remove(o.g); if (o.full) dropFull(o); }); hGroups = [];
  if (hl.parent) hl.parent.remove(hl);
  rackG.traverse(o => { if (o.geometry) o.geometry.dispose(); }); rackG.clear();
  const metal = M({ color: 0x151515, metalness: .8, roughness: .35 });
  rails.forEach(r => {
    const horiz = r.sx > r.sz, L = Math.max(r.sx, r.sz);
    cyl(.02, .02, L, metal, r.cx, 1.98, r.cz, horiz ? { rz: Math.PI / 2, p: rackG } : { rx: Math.PI / 2, p: rackG });
    r.ends.forEach(([x, z]) => { cyl(.026, .026, 2, metal, x, 1, z, { p: rackG, cs: true }); bx(horiz ? .05 : .7, .03, horiz ? .7 : .05, metal, x, .015, z, { p: rackG, cs: true }); });
  });
  hangers.forEach((h, i) => {
    const hex = colorOf(h.p), g = new THREE.Group(); g.position.set(h.x, 1.98, h.z); g.rotation.y = h.ry; g.scale.setScalar(SC);
    const m = new THREE.Mesh(HGEO, plainMat(hex)); m.position.y = -.2; m.castShadow = Q > 1; g.add(m); scene.add(g);
    hGroups.push({ g, m, h, i, hex, ph: 0, full: null, cv: null });
  });
  lastHot = null;
}

/* ---------- manusia sederhana (pemain & kasir) ---------- */
function makeHuman(o) {
  const g = new THREE.Group(), sk = M({ color: o.skin || 0xd9b08c, roughness: .7 }), top = M({ color: o.top, roughness: .9 }), pan = M({ color: o.pants, roughness: .85 }), sh = M({ color: o.shoes, roughness: .8 });
  const add = (geo, mat, x, y, z, p = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; p.add(m); return m; };
  add(new THREE.CapsuleGeometry(.17, .36, 4, 10), top, 0, 1.22, 0).scale.set(1.15, 1, .72);
  add(new THREE.CapsuleGeometry(.15, .1, 4, 10), pan, 0, .93, 0).scale.set(1.15, 1, .75);
  add(new THREE.SphereGeometry(.115, 14, 12), sk, 0, 1.72, 0).scale.y = 1.12;
  if (o.mask) { add(new THREE.SphereGeometry(.122, 14, 12), M({ color: 0x0b0b0b, roughness: 1 }), 0, 1.72, 0).scale.y = 1.12; add(new THREE.BoxGeometry(.15, .035, .02), sk, 0, 1.735, .115); }
  else { const ey = M({ color: 0x111111 }); add(new THREE.SphereGeometry(.012, 6, 6), ey, -.04, 1.73, .108); add(new THREE.SphereGeometry(.012, 6, 6), ey, .04, 1.73, .108); }
  if (o.cap) { const cm = M({ color: o.cap, roughness: .8 }); add(new THREE.SphereGeometry(.125, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cm, 0, 1.745, 0); add(new THREE.BoxGeometry(.2, .018, .14), cm, 0, 1.745, .13); }
  const leg = s => { const p = new THREE.Group(); p.position.set(.085 * s, .92, 0); g.add(p); add(new THREE.CapsuleGeometry(.082, .6, 4, 8), pan, 0, -.4, 0, p); add(new THREE.BoxGeometry(.14, .09, .27), sh, 0, -.87, .05, p); return p; };
  const arm = s => { const p = new THREE.Group(); p.position.set(.25 * s, 1.47, 0); g.add(p); add(new THREE.CapsuleGeometry(.062, .2, 4, 8), top, 0, -.14, 0, p); add(new THREE.CapsuleGeometry(.052, .2, 4, 8), sk, 0, -.4, 0, p); add(new THREE.SphereGeometry(.055, 8, 8), sk, 0, -.55, 0, p); return p; };
  return { g, L: leg(-1), R: leg(1), aL: arm(-1), aR: arm(1) };
}
function animHuman(h, w, moving) {
  const s = moving ? Math.sin(w) * .7 : 0;
  h.L.rotation.x = s; h.R.rotation.x = -s; h.aL.rotation.x = -s * .8; h.aR.rotation.x = s * .8;
  h.g.position.y = moving ? Math.abs(Math.sin(w)) * .03 : 0;
}

/* ---------- dunia 3D: toko, fasad kaca, jalan, properti ---------- */
let mirrorG = null, MIRI = 1;
const MIR = [[-6, -5.96, 0, -6, -4.7], [-7.96, 4.7, Math.PI / 2, -6.8, 4.9], [7.96, 4.7, -Math.PI / 2, 6.9, 4.7]];   // x, z, rotasi, titik interaksi x, z
function placeMirror(i) { const m = MIR[i]; mirrorG.position.set(m[0], 1.3, m[1]); mirrorG.rotation.y = m[2]; const s = SPOTS.find(q => q.id === 'mirror'); if (s) { s.x = m[3]; s.z = m[4]; } try { localStorage.setItem('fvckgame.mir2', String(i)); } catch { } }
function moveMirror() { MIRI = (MIRI + 1) % MIR.length; placeMirror(MIRI); toast('CERMIN DIPINDAH'); beep('step'); }
let PM = null, CM = null, ballM = null, blob = null, FPH = null, FPI = null, HS = null, scrTex = null, scrCv = null, lastCart = -1;
function buildWorld() {
  const T = {};
  T.brick = ctex(1024, 1024, (c, w) => { c.fillStyle = '#6d5d54'; c.fillRect(0, 0, w, w); for (let r = 0; r < 16; r++) { const off = (r % 2) * 128; for (let x = -256; x < w + 256; x += 256) { c.fillStyle = `hsl(${10 + rnd() * 8},${34 + rnd() * 14}%,${40 + rnd() * 14}%)`; c.fillRect(x + off + 6, r * 64 + 5, 244, 54); } } for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,230,210'},${rnd() * .08})`; c.fillRect(rnd() * w, rnd() * w, 2 + rnd() * 8, 1 + rnd() * 3); } });
  T.floor = ctex(512, 512, (c, w) => { c.fillStyle = '#26262a'; c.fillRect(0, 0, w, w); const q = [['#52525a', 5, 5], ['#46464d', 261, 5], ['#46464d', 5, 261], ['#52525a', 261, 261]]; q.forEach(([col, x, y]) => { const g = c.createLinearGradient(x, y, x + 246, y + 246); g.addColorStop(0, col); g.addColorStop(1, '#3c3c42'); c.fillStyle = g; c.fillRect(x, y, 246, 246); }); for (let i = 0; i < 700; i++) { c.fillStyle = `rgba(255,255,255,${rnd() * .035})`; c.fillRect(rnd() * w, rnd() * w, 3, 2); } });
  T.wall = ctex(512, 512, (c, w) => { c.fillStyle = '#e2ded6'; c.fillRect(0, 0, w, w); c.fillStyle = 'rgba(0,0,0,.08)'; for (let y = 0; y < w; y += 128) { c.fillRect(0, y, w, 2); for (let x = (y / 128 % 2) * 128; x < w; x += 256) c.fillRect(x, y, 2, 128); } for (let i = 0; i < 1800; i++) { c.fillStyle = `rgba(0,0,0,${rnd() * .035})`; c.fillRect(rnd() * w, rnd() * w, 2, 2); } });
  T.pave = ctex(512, 512, (c, w) => { c.fillStyle = '#9a9da1'; c.fillRect(0, 0, w, w); for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,255,255'},${rnd() * .07})`; c.fillRect(rnd() * w, rnd() * w, 2, 2); } c.fillStyle = '#62656a'; c.fillRect(0, 0, w, 4); c.fillRect(0, 0, 4, w); c.fillRect(0, 254, w, 3); c.fillRect(254, 0, 3, w); });
  T.asph = ctex(256, 256, (c, w) => { c.fillStyle = '#4a4b4f'; c.fillRect(0, 0, w, w); for (let i = 0; i < 2500; i++) { c.fillStyle = `rgba(255,255,255,${rnd() * .09})`; c.fillRect(rnd() * w, rnd() * w, 1.5, 1.5); } });
  T.wood = ctex(256, 256, (c, w) => { c.fillStyle = '#4a3626'; c.fillRect(0, 0, w, w); for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,200,150'},${rnd() * .08})`; c.fillRect(0, rnd() * w, w, 1 + rnd() * 2); } });
  T.card = ctex(128, 128, (c, w) => { c.fillStyle = '#a98a62'; c.fillRect(0, 0, w, w); for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(0,0,0,${rnd() * .07})`; c.fillRect(rnd() * w, rnd() * w, 3, 1); } c.fillStyle = 'rgba(220,200,160,.85)'; c.fillRect(0, 56, w, 14); });
  const lab = (w, h, f, bg = '#0a0a0a') => ctex(w, h, (c, ww, hh) => { c.fillStyle = bg; c.fillRect(0, 0, ww, hh); c.strokeStyle = bg === '#0a0a0a' ? '#f2f2f2' : '#0a0a0a'; c.lineWidth = 6; c.strokeRect(6, 6, ww - 12, hh - 12); c.fillStyle = bg === '#0a0a0a' ? '#f2f2f2' : '#0a0a0a'; c.textAlign = 'center'; f(c, ww, hh); });
  const glow = t => M({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .55, roughness: .6 });
  let logoImg = null;
  const drawFV = (c, w, h) => { c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#f2f2f2'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12); c.fillStyle = '#f2f2f2'; c.textAlign = 'center'; c.font = '900 96px Impact, "Arial Black", sans-serif';
    if (logoImg) { c.fillStyle = '#fffdf3'; c.beginPath(); c.arc(112, h / 2, 64, 0, 7); c.fill(); const lh = 112, lw = lh * logoImg.width / logoImg.height; c.drawImage(logoImg, 112 - lw / 2, h / 2 - lh / 2, lw, lh); c.fillStyle = '#f2f2f2'; c.fillText('FVCK THE RULES', w / 2 + 70, h / 2 + 33); }
    else c.fillText('FVCK THE RULES', w / 2, h / 2 + 33); };
  const sFV = ctex(1024, 192, drawFV);
  { const im = new Image(); im.onload = () => { logoImg = im; drawFV(sFV.image.getContext('2d'), 1024, 192); sFV.needsUpdate = true; }; im.src = 'assets/logo.png'; }
  const sBorn = lab(512, 112, (c, w, h) => { c.font = '900 56px Impact, sans-serif'; c.fillText('BORN TO DISOBEY', w / 2, h / 2 + 20); });
  const sCult = lab(512, 112, (c, w, h) => { c.font = '900 52px Impact, sans-serif'; c.fillText('SOCCER CULTURE', w / 2, h / 2 + 19); });
  const sDrop = lab(256, 170, (c, w, h) => { c.font = '900 44px Impact, sans-serif'; c.fillText('NEW DROP', w / 2, 70); c.font = '18px monospace'; c.fillText('PRE ORDER · READY', w / 2, 104); c.fillText('SCAN · TAP · BELI', w / 2, 130); });
  const pos1 = lab(256, 360, (c, w, h) => { c.font = '900 80px Impact, sans-serif'; c.fillText('FVCK', w / 2, 120); c.fillText('THE', w / 2, 200); c.fillText('RULES', w / 2, 280); }, '#e8ff3a');
  const pos2 = lab(256, 360, (c, w, h) => { c.font = '900 120px Impact, sans-serif'; c.fillText('26', w / 2, 200); c.font = '20px monospace'; c.fillText('STREET · SOCCER · SOCIAL', w / 2, 300); }, '#e9e9e6');
  const sBall = ctex(128, 64, (c, w, h) => { c.fillStyle = '#f2f2f2'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(10 + i * 22, 14 + (i % 2) * 30, 9, 0, 7); c.fill(); } });
  const mirT = ctex(128, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#6b7a8e'); g.addColorStop(.5, '#2b3442'); g.addColorStop(1, '#4a586b'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.09)'; c.beginPath(); c.moveTo(0, 20); c.lineTo(50, 0); c.lineTo(110, 0); c.lineTo(0, 120); c.fill(); });
  const skyT = ctex(4, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5fb0ee'); g.addColorStop(.6, '#a9d8f7'); g.addColorStop(1, '#e8f6ff'); c.fillStyle = g; c.fillRect(0, 0, w, h); });

  /* langit + kabut + lampu (ruangan terang & hangat) */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(70, 16, 12), new THREE.MeshBasicMaterial({ map: skyT, side: THREE.BackSide, fog: false, depthWrite: false })); scene.add(sky);
  scene.background = new THREE.Color(0xbfe4fb); scene.fog = new THREE.Fog(0xcfe8f7, 24, 75);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc9c2b4, 1.9));
  keyLight = new THREE.DirectionalLight(0xfff4e6, 1.3); keyLight.position.set(3, 12, 2); scene.add(keyLight, keyLight.target);
  keyLight.castShadow = Q > 0; keyLight.shadow.mapSize.set(Q > 1 ? 2048 : 1024, Q > 1 ? 2048 : 1024);
  const sc = keyLight.shadow.camera; sc.left = -9.5; sc.right = 9.5; sc.top = 7.5; sc.bottom = -7.5; sc.near = 4; sc.far = 24; keyLight.shadow.bias = -.0005; keyLight.shadow.normalBias = .03; sc.updateProjectionMatrix();
  [[-1.5, 0, 1, 24], [5, 3.2, 0, 22], [-4.5, -2, 2, 20], [4.5, -2, 2, 20]].forEach(([x, z, mq, it]) => { const l = new THREE.PointLight(0xfff1e0, it, 13, 2); l.position.set(x, 3.0, z); l.visible = Q >= mq; scene.add(l); lightsQ.push([l, mq]); });

  /* lantai, plafon, dinding */
  const metal = M({ color: 0x151515, metalness: .8, roughness: .35 }), black = M({ color: 0x0c0c0c, roughness: .7 }), white = M({ color: 0xe9e9e6, roughness: .45 });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), tm(T.floor, 16, 12, 2, { r: .9 })); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; scene.add(fl);
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), M({ color: 0xefede8, roughness: 1 })); ce.rotation.x = Math.PI / 2; ce.position.y = 3.4; scene.add(ce);
  [-4, 0, 4].forEach(z => bx(16, .3, .22, M({ color: 0xb9b6ae, roughness: .9 }), 0, 3.25, z));
  [-5, -1.7, 1.7, 5].forEach(x => [-3, 1.5, 4.5].forEach(z => bx(.07, .04, 1.5, new THREE.MeshBasicMaterial({ color: 0xfff6e8 }), x, 3.3, z, { rs: false })));
  bx(16.4, 3.6, .2, tm(T.wall, 16.4, 3.6, 2), 0, 1.8, -6.1);
  bx(.2, 3.6, 12.4, tm(T.brick, 12.4, 3.6, 1.6, { bump: 2, r: .95 }), -8.1, 1.8, 0);
  bx(.2, 3.6, 12.4, tm(T.wall, 12.4, 3.6, 2), 8.1, 1.8, 0);
  { const ao = ctex(4, 64, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, false);
    const am = new THREE.MeshBasicMaterial({ map: ao, transparent: true, depthWrite: false, fog: false });
    [[0, -5.65, 16, 0], [-7.65, 0, 12, Math.PI / 2], [7.65, 0, 12, -Math.PI / 2]].forEach(([x, z, w, ry]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, .7), am); m.rotation.set(-Math.PI / 2, 0, ry); m.rotation.order = 'YXZ'; m.position.set(x, .01, z); scene.add(m); }); }
  /* fasad depan: etalase kaca + pintu */
  const brickM = (w, h) => tm(T.brick, w, h, 1.6, { bump: 2, r: .95 }), glass = M({ color: 0x9fb8d8, transparent: true, opacity: .14, roughness: .05, depthWrite: false });
  [[-8.2, -1.2], [1.2, 8.2]].forEach(([a, b]) => {
    const w = b - a, cx = (a + b) / 2;
    bx(w, .7, .2, brickM(w, .7), cx, .35, 6.1); bx(w, 1.9, .2, brickM(w, 1.9), cx, 3.65, 6.1);
    pln(w, 2, glass, cx, 1.7, 6.1);
    for (let i = 0; i <= 3; i++) bx(.08, 2, .12, metal, a + i * w / 3, 1.7, 6.1);
    bx(w, .06, .12, metal, cx, .7, 6.1); bx(w, .06, .12, metal, cx, 2.7, 6.1); bx(w, .05, .1, metal, cx, 1.7, 6.1);
  });
  bx(2.4, 1.9, .2, brickM(2.4, 1.9), 0, 3.65, 6.1); bx(.1, 2.7, .14, metal, -1.2, 1.35, 6.1); bx(.1, 2.7, .14, metal, 1.2, 1.35, 6.1); bx(2.4, .08, .14, metal, 0, 2.7, 6.1);
  pln(1.1, 2.6, glass, -.57, 1.35, 6.1); pln(1.1, 2.6, glass, .57, 1.35, 6.1); bx(.05, 2.6, .1, metal, 0, 1.35, 6.1);
  [-.12, .12].forEach(x => cyl(.014, .014, .7, metal, x, 1.05, 6.02));
  bx(2, .01, .14, new THREE.MeshBasicMaterial({ color: 0xe8ff3a }), 0, .006, 5.55, { rs: false });
  /* jalan di luar (terlihat lewat kaca) */
  const sw = new THREE.Mesh(new THREE.PlaneGeometry(60, 3), tm(T.pave, 60, 3, 2, { r: .85 })); sw.rotation.x = -Math.PI / 2; sw.position.set(0, 0, 7.6); sw.receiveShadow = true; scene.add(sw);
  const rd = new THREE.Mesh(new THREE.PlaneGeometry(60, 9), tm(T.asph, 60, 9, 2, { r: .95 })); rd.rotation.x = -Math.PI / 2; rd.position.set(0, -.1, 13.6); scene.add(rd);
  bx(60, .14, .2, M({ color: 0x777b80, roughness: .9 }), 0, -.02, 9.15);
  for (let x = -26; x <= 26; x += 4) bx(2.2, .01, .14, new THREE.MeshBasicMaterial({ color: 0xdedede }), x, -.088, 13.6, { rs: false });
  bx(60, 9, 1, brickM(60, 9), 0, 4.5, 19.2);
  const litM = new THREE.MeshBasicMaterial({ color: 0xa9c8e0 }), darkM = new THREE.MeshBasicMaterial({ color: 0x5d7893 });
  for (let i = 0; i < 12; i++) for (let r = 0; r < 2; r++) pln(1.4, 1.6, (i * 7 + r * 3) % 4 === 0 ? darkM : litM, -22 + i * 4, 2.4 + r * 3.4, 18.65, Math.PI);
  [-5.5, 5.5].forEach(x => { cyl(.05, .06, 4.2, metal, x, 2.1, 8.7); bx(.5, .08, .12, metal, x, 4.2, 8.7); bx(.4, .05, .1, new THREE.MeshBasicMaterial({ color: 0xffe2b0 }), x, 4.12, 8.7, { rs: false }); });

  /* papan & tanda */
  [[sBorn, 4, .9, 7.92, 2.7, -1.5, -Math.PI / 2], [sCult, 4, .9, -7.92, 2.7, -1.5, Math.PI / 2], [sDrop, 1.8, 1.2, 5, 1.8, -5.95, 0]].forEach(([t, w, h, x, y, z, ry]) => {
    const side = !!ry; bx(side ? .08 : w, h + .1, side ? w : .08, black, side ? x + Math.sign(x) * .04 : x, y, side ? z : z - .03);
    pln(w, h, glow(t), side ? x - Math.sign(x) * .012 : x, y, side ? z : z + .02, ry);
  });
  pln(3.6, .675, glow(sFV), 0, 3.05, 5.985, Math.PI);          // logo + nama di atas pintu (terlihat dari dalam)
  { const im = new Image(); im.onload = () => {                // mural graffiti "FVCK THE RULES" di dinding belakang
      const t = new THREE.Texture(im); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
      const mw = 8, mh = mw * im.height / im.width, m = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), M({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.position.set(0, 2.15, -5.99); scene.add(m); }; im.src = 'assets/mural.png'; }
  const posM = t => M({ map: t, roughness: .85 }); pln(.8, 1.15, posM(pos1), 6.9, 1.9, -5.95, 0); pln(.8, 1.15, posM(pos2), -7.9, 1.7, 3.2, Math.PI / 2);
  mirrorG = new THREE.Group(); scene.add(mirrorG); bx(1.4, 2.4, .08, black, 0, 0, 0, { p: mirrorG });
  { const gm = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), new THREE.MeshBasicMaterial({ map: mirT })); gm.position.z = .045; mirrorG.add(gm); }
  try { const raw = localStorage.getItem('fvckgame.mir2'); if (raw !== null && +raw >= 0 && +raw < MIR.length) MIRI = +raw; } catch { }

  /* meja tengah + kaos terlipat */
  const woodM = tm(T.wood, 2.6, 1.3, 1.2, { r: .6 });
  bx(2.6, .08, 1.3, woodM, 0, .8, 0, { cs: true }); [[-1.2, -.55], [1.2, -.55], [-1.2, .55], [1.2, .55]].forEach(([x, z]) => bx(.06, .76, .06, metal, x, .38, z, { cs: true }));
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) bx(.42, .05, .5, fabric(['#e9e9e6', '#141414', '#7d7d80'][(i + j) % 3]), -1 + i * .5, .865 + j * .052, (i % 2 ? .2 : -.2), { ry: (rnd() - .5) * .15, cs: true });
  /* bangku, kardus */
  bx(1.9, .06, .42, woodM, -4.6, .46, 4.7, { cs: true }); [-.8, .8].forEach(x => bx(.06, .43, .36, metal, -4.6 + x, .215, 4.7, { cs: true }));
  const cardM = M({ map: T.card, roughness: .95 });
  [[7.05, .25, 3.1, .8, .5, .8, 0], [7.05, .7, 3.1, .7, .4, .7, .2], [7.05, 1.05, 3.1, .5, .3, .5, -.1], [-7.35, .25, 3.8, .8, .5, .8, .1], [-7.3, .7, 3.85, .6, .4, .6, .35]].forEach(([x, y, z, w, h, d, ry]) => bx(w, h, d, cardM, x, y, z, { ry, cs: true }));
  /* kasir */
  bx(3.2, 1.05, .9, black, 5, .525, 3.5, { cs: true }); bx(3.3, .06, 1, white, 5, 1.08, 3.5, { cs: true }); bx(3, .14, .02, new THREE.MeshBasicMaterial({ color: 0xe8ff3a }), 5, .5, 3.96, { rs: false });
  scrCv = document.createElement('canvas'); scrCv.width = 256; scrCv.height = 160; scrTex = new THREE.CanvasTexture(scrCv); scrTex.colorSpace = THREE.SRGBColorSpace;
  bx(.56, .36, .04, black, 4.2, 1.42, 3.45); bx(.06, .2, .06, black, 4.2, 1.2, 3.45); pln(.5, .3, new THREE.MeshBasicMaterial({ map: scrTex }), 4.2, 1.42, 3.472, 0);
  bx(.4, .015, .14, black, 4.2, 1.12, 3.2); bx(.22, .12, .2, black, 5.3, 1.17, 3.7); bx(.02, .02, .02, new THREE.MeshBasicMaterial({ color: 0xe8ff3a }), 5.3, 1.24, 3.8, { rs: false });
  bx(.06, 2.6, .3, metal, 3.4, 1.3, 2.2); bx(.06, 2.6, .3, metal, 6.6, 1.3, 2.2); bx(3.2, 2.6, .04, black, 5, 1.3, 2.06);
  [.5, 1.1, 1.7, 2.3].forEach((y, si) => { bx(3.2, .04, .3, metal, 5, y, 2.2); for (let k = 0; k < 6; k++) bx(.4, .3, .25, fabric(['#141414', '#e9e9e6', '#7d7d80', '#2c4a7a'][(k + si) % 4]), 3.75 + k * .48, y + .17, 2.2, { ry: (rnd() - .5) * .1 }); });
  /* bola */
  ballM = new THREE.Mesh(new THREE.SphereGeometry(.28, 18, 14), M({ map: sBall, roughness: .6 })); ballM.castShadow = true; scene.add(ballM);
  /* karakter */
  PM = makeHuman({ top: 0xe8e8e8, pants: 0x5d7fa6, shoes: 0x2f3fb5, mask: true }); scene.add(PM.g);
  CM = makeHuman({ top: 0x0a0a0a, pants: 0x1a1a1a, shoes: 0x111111, cap: 0x0a0a0a }); CM.g.position.set(5, 0, 2.75); scene.add(CM.g);
  blob = new THREE.Mesh(new THREE.CircleGeometry(.4, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .35, depthWrite: false })); blob.rotation.x = -Math.PI / 2; scene.add(blob);
  /* tangan first-person (menempel kamera) */
  /* tangan first-person: dirender di scene terpisah setelah depth buffer dibersihkan (tidak menembus dinding, tanpa artefak tumpang-tindih) */
  HS = new THREE.Scene(); HS.add(new THREE.HemisphereLight(0xffffff, 0x9a8f80, 1.7)); { const dl = new THREE.DirectionalLight(0xffffff, 1.1); dl.position.set(.2, 1.5, .3); HS.add(dl); }
  FPH = new THREE.Group(); HS.add(FPH); FPI = new THREE.Group(); FPH.add(FPI);
  const hm = c => new THREE.MeshLambertMaterial({ color: c });
  [-1, 1].forEach(s => {
    const a = new THREE.Group(); a.position.set(.2 * s, -.34, -.2); a.rotation.set(-1.22, 0, -.1 * s); FPI.add(a);
    const part = (geo, mat, y, sx = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.scale.set(sx, 1, sz); a.add(m); return m; };
    part(new THREE.CapsuleGeometry(.062, .18, 4, 8), hm(0xe8e8e8), .08); part(new THREE.CapsuleGeometry(.05, .14, 4, 8), hm(0xd9b08c), .28);
    part(new THREE.SphereGeometry(.058, 10, 8), hm(0xd9b08c), .42, 1, .8).scale.y = 1.15;
    const th = part(new THREE.CapsuleGeometry(.016, .04, 3, 6), hm(0xd9b08c), .4); th.position.x = -.05 * s; th.rotation.z = .6 * s;
  });
  FPH.visible = false;
  placeMirror(MIRI); bakeStatic();
}
function drawScreen() {
  const n = cartCount(), c = scrCv.getContext('2d'); c.fillStyle = '#050505'; c.fillRect(0, 0, 256, 160);
  c.fillStyle = '#e8ff3a'; c.font = '900 26px Impact, sans-serif'; c.textAlign = 'center'; c.fillText('FVCKTHERULES', 128, 46);
  c.fillStyle = '#f2f2f2'; c.font = '16px monospace'; c.fillText(n ? n + ' ITEM DI TAS' : 'TAS KOSONG', 128, 86); c.fillText('[E] CHECKOUT', 128, 118); scrTex.needsUpdate = true;
}

/* ---------- dunia: hanger, rak, kasir ---------- */
const RW = 7.5, RZN = -5.6, RZP = 5.6;
let hangers = [], rails = [], solids = [];
const SP = .8, ROW = 1.9;   // jarak antar hanger & antar baris (kaos diperbesar 1.3x)
const GROUPS = [{ k: 'pre', x: -7.15, z: -4.5, dx: 0, dz: 1, ry: Math.PI / 2, ix: 1, iz: 0, max: 8 }, { k: 'ready', x: 7.15, z: -4.5, dx: 0, dz: 1, ry: -Math.PI / 2, ix: -1, iz: 0, max: 8 }, { k: 'sold', x: -3.4, z: -3.6, dx: 1, dz: 0, ry: 0, ix: 0, iz: 1, max: 10, rg: 1.4 }];
const STATIC_SOLIDS = [[-1.3, -.65, 1.3, .65], [3.4, 2, 6.6, 3.95], [6.6, 2.2, 7.5, 3.95], [-5.6, 4.45, -3.6, 4.95], [-7.75, 3.35, -6.85, 4.25]];
function rebuild() {
  hangers = []; rails = []; solids = STATIC_SOLIDS.slice();
  GROUPS.forEach(g => {
    const list = S.products.filter(p => p.badge === g.k).slice(0, g.max * 2);
    for (let row = 0; row < 2; row++) {
      const part = list.slice(row * g.max, (row + 1) * g.max); if (!part.length) continue;
      const rg = g.rg || ROW, ox = g.x + g.ix * row * rg, oz = g.z + g.iz * row * rg, span = (part.length - 1) * SP, len = span + .95;
      part.forEach((p, i) => hangers.push({ p, x: ox + g.dx * i * SP, z: oz + g.dz * i * SP, ry: g.ry, ph: i * 1.7 }));
      const cx = ox + g.dx * span / 2, cz = oz + g.dz * span / 2;
      rails.push({ cx, cz, sx: g.dx ? len : .05, sz: g.dz ? len : .05, ends: [[cx - g.dx * len / 2, cz - g.dz * len / 2], [cx + g.dx * len / 2, cz + g.dz * len / 2]] });
      const hx = g.dx ? len / 2 : .42, hz = g.dz ? len / 2 : .42; solids.push([cx - hx, cz - hz, cx + hx, cz + hz]);
    }
  });
  try { syncHangers(); } catch (e) { showErr(e); }
}
S.listeners.add(rebuild); rebuild();
const SPOTS = [
  { id: 'table', x: 0, z: 0, lim: 2.0, t: 'PRESS E TO BROWSE · SEMUA PRODUK', go: () => openCatalog('all') },
  { id: 'kasir', x: 5, z: 4.5, lim: 2.0, t: 'PRESS E TO CHECKOUT', go: cashier },
  { id: 'board', x: 5.0, z: -4.9, lim: 1.8, t: 'PRESS E TO READ · PAPAN DROP', go: board },
  { id: 'door', x: 0, z: 5.1, lim: 1.5, t: 'PRESS E · KELUAR KE TOKO UTAMA', go: door },
  { id: 'ball', x: 0, z: 0, lim: 1.3, t: 'PRESS E · TENDANG BOLA', go: kick },
  { id: 'mirror', x: -6, z: -4.7, lim: 1.4, t: 'PRESS E · CERMIN', go: () => say('CERMIN', 'Outfit check. Rules? Dilanggar.', [['PINDAH CERMIN', moveMirror], ['TUTUP']]) }
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
const pl = { x: -2.6, z: 1.2, ry: Math.PI, walk: 0, moving: false }, cam = { yaw: 0, pitch: .06 };
let fp = localStorage.getItem('fvckgame.fp') === '1';
const setFP = v => { fp = v; localStorage.setItem('fvckgame.fp', v ? '1' : '0'); $('#bView').textContent = v ? 'FPV' : 'TPV'; };
setFP(fp);
$('#bView').addEventListener('click', () => { setFP(!fp); beep('step'); });
addEventListener('keydown', e => { if (!paused && (e.key === 'v' || e.key === 'V')) setFP(!fp); });
addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (phone.isOpen()) phone.close(); else if ($('#say')) closeSay(); else if (panelOpen()) closePanel(); return; }
  if ((e.key === 'p' || e.key === 'P') && started && !panelOpen() && !$('#say')) { phone.toggle(); return; }
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
cv.addEventListener('pointermove', e => { if (e.pointerId !== lid) return; cam.yaw += (e.clientX - lx) * .006; cam.pitch = Math.max(fp ? -1.25 : -.4, Math.min(fp ? 1.25 : .8, cam.pitch - (e.clientY - ly) * .004)); lx = e.clientX; ly = e.clientY; });
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

/* ---------- kamera + gambar tiap frame ---------- */
const camPos = THREE ? new THREE.Vector3() : null, camTar = THREE ? new THREE.Vector3() : null; let camInit = false, lastFP = false, frameNo = 0, photoT = 0;
function updateCamera(dt) {
  const act = started, yaw = act ? cam.yaw : t * .15, fpv = fp && act;
  const lim = fpv ? 1.25 : .8, lo = fpv ? -1.25 : -.4; if (act) cam.pitch = Math.max(lo, Math.min(lim, cam.pitch));
  const p = act ? cam.pitch : .08, cp = Math.cos(p), sp = Math.sin(p), sy = Math.sin(yaw), cyw = Math.cos(yaw);
  const dir = [sy * cp, sp, -cyw * cp], rgt = [cyw, 0, sy], px = act ? pl.x : 0, pz = act ? pl.z : 0;
  if (fpv !== lastFP) { camInit = false; lastFP = fpv; }
  const bob = pl.moving ? Math.sin(pl.walk * 2) * .03 : Math.sin(t * 1.6) * .006;
  if (fpv) {
    const ex = px + sy * .08, ey = 1.62 + bob, ez = pz - cyw * .08;
    camera.position.set(ex, ey, ez); camera.lookAt(ex + dir[0], ey + dir[1], ez + dir[2]);
    FPI.position.set(Math.sin(pl.walk) * (pl.moving ? .012 : 0), (pl.moving ? Math.abs(Math.sin(pl.walk)) * .015 : Math.sin(t * 1.1) * .004), 0);
    camera.updateMatrixWorld(); FPH.position.copy(camera.position); FPH.quaternion.copy(camera.quaternion);
  } else {
    const dist0 = act ? 2.5 : 5.4, off = act ? .38 : 0, ty = act ? 1.5 : 1.3;
    const inside = (x, y, z) => x > -7.75 && x < 7.75 && z > -5.8 && z < 5.8 && y > .3 && y < 3.2;
    let d = dist0, cx = 0, cy = 0, cz = 0;
    for (; d > .5; d -= .1) { cx = px - dir[0] * d + rgt[0] * off; cy = ty - dir[1] * d; cz = pz - dir[2] * d + rgt[2] * off; if (inside(cx, cy, cz)) break; }
    camTar.set(px + rgt[0] * off, ty, pz + rgt[2] * off);
    if (!camInit) { camPos.set(cx, cy, cz); camInit = true; } else camPos.lerp(new THREE.Vector3(cx, cy, cz), 1 - Math.exp(-dt * 14));
    camera.position.copy(camPos); camera.lookAt(camTar);
  }
}
function render(dt) {
  if (!renderer) return;
  const fpv = fp && started;
  PM.g.visible = !fpv; PM.g.position.set(pl.x, 0, pl.z); PM.g.rotation.y = pl.ry; animHuman(PM, pl.walk, pl.moving);
  blob.visible = !fpv && Q === 0; blob.position.set(pl.x, .012, pl.z);
  FPH.visible = fpv;
  CM.aL.rotation.x = Math.sin(t * 1.4) * .05; CM.aR.rotation.x = -Math.sin(t * 1.4) * .05; CM.g.rotation.y = Math.sin(t * .4) * .25;
  ballM.position.set(ball.x, .28, ball.z); ballM.rotation.z -= ball.vx * dt / .28; ballM.rotation.x += ball.vz * dt / .28;
  hGroups.forEach(o => { const on = hot === o.h; o.g.rotation.x = Math.sin(t * 1.3 + o.h.ph) * .016 + (on ? Math.sin(t * 6) * .04 : 0); });
  if (t - photoT > .5) { photoT = t; photoTick(); }
  const n = cartCount(); if (n !== lastCart) { lastCart = n; drawScreen(); }
  updateCamera(dt);
  if (Q > 0 && (frameNo++ & 1) === 0) renderer.shadowMap.needsUpdate = true;      // bayangan diperbarui tiap 2 frame
  renderer.clear(); renderer.render(scene, camera);
  if (fpv) { renderer.clearDepth(); renderer.render(HS, camera); }
}
function resize() {
  if (!renderer) return;
  prC = prFor(Q); renderer.setPixelRatio(prC);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = Math.max(62, Math.min(95, 2 * Math.atan(Math.tan(75 * Math.PI / 360) / camera.aspect) * 180 / Math.PI));   // HP portrait: sudut pandang horizontal tetap lebar
  camera.updateProjectionMatrix();
}
function setQ(q) {
  Q = q; resS = 1;
  renderer.shadowMap.enabled = q > 0; if (keyLight) keyLight.castShadow = q > 0;
  lightsQ.forEach(([l, mq]) => l.visible = q >= mq);
  hGroups.forEach(o => o.m.castShadow = q > 1);
  scene.traverse(o => { if (o.isMesh && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  resize();
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 250));
let lastT = 0, lastR = 0, fAcc = 0, fN = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (document.hidden) { lastT = ts; return; }
  if (ts - lastR < 10.5) return;                      // layar 120Hz → render ~60fps (hemat baterai, HP tidak panas)
  lastR = ts;
  const dt = Math.min(.05, (ts - (lastT || ts)) / 1000); lastT = ts; t += dt;
  update(dt); if (!rPause) render(dt);
  if (started && !paused && dt > 0) {                  // resolusi adaptif: turunkan resolusi dulu, baru kualitas
    fAcc += dt; fN++;
    if (fN >= 60) {
      const fps = fN / fAcc;
      if (fps < 30) { if (resS > .65) { resS = Math.max(.6, resS * .85); resize(); } else if (Q > 0) setQ(Q - 1); }
      else if (fps > 56 && resS < 1) { resS = Math.min(1, resS * 1.1); resize(); }
      fAcc = 0; fN = 0;
    }
  }
}
if (renderer) {
  try { buildWorld(); syncHangers(); resize(); requestAnimationFrame(frame); } catch (e) { showErr(e); renderer = null; }
}

/* ---------- alur layar ---------- */
const howHTML = `<div class="note"><b>DESKTOP</b><br>WASD = jalan · geser mouse (tahan klik) / ← → = putar kamera · E = ambil baju / interaksi · V = ganti sudut pandang (orang ketiga/orang pertama) · ESC = tutup panel.</div>
<div class="note"><b>MOBILE</b><br>Joystick kiri bawah = jalan · geser layar = putar kamera · tombol E (atau tap tulisan "TAP …") = interaksi · tombol TPV/FPV di atas = ganti sudut pandang.</div>
<div class="note"><b>MISI</b><br>1) Dekati hanger, tekan E, pilih warna & ukuran, ADD TO CART.<br>2) Jalan ke KASIR (atau tekan tombol KASIR ▸ di atas = lompat langsung).<br>3) Isi data kirim, bayar via QRIS / transfer, upload bukti, dapat struk + ID pesanan.</div>
<div class="note">Cuma mau belanja cepat? Tombol <b>KATALOG</b> membuka semua produk tanpa jalan-jalan. Harga & stok selalu dari toko utama.</div>
<div class="note">Coba tendang bola di lantai. Cari papan drop di dinding belakang.</div>`;
function play() {
  $('#intro').hidden = true; $('#hud').hidden = false; started = true; paused = false; beep('door'); setMute(muted);
  if (!localStorage.getItem('fvckgame.seen')) { localStorage.setItem('fvckgame.seen', '1'); say('SELAMAT DATANG', document.body.classList.contains('is-touch') ? 'Joystick = jalan, geser layar = putar kamera, E = ambil baju dari hanger. KASIR ▸ = langsung ke kasir.' : 'WASD = jalan, geser mouse = putar kamera, E = ambil baju dari hanger. KASIR ▸ = langsung ke kasir.'); }
}
phone = initPhone({ onOpen: () => { paused = true; for (const k in keys) keys[k] = false; jx = jy = 0; closeSay(); if (panelOpen()) closePanel(); }, onClose: () => { paused = !started; }, onWeb: a => { rPause = a; } });
$('#bPhone').onclick = () => { if (started && !panelOpen()) phone.toggle(); };
$('#bPlay').onclick = play; $('#bHow').onclick = () => showRaw('HOW TO PLAY', howHTML);
$('#bQuick').onclick = () => openCatalog('all');
const acctHTML = () => S.user ? `<div class="note">Login sebagai <b>${esc(S.user.email || 'akun toko')}</b>.</div><button id="mOut" style="width:100%">LOGOUT</button>` : '<div class="note">Belum login. Login bersifat opsional dan ada di langkah checkout (kasir).</div>';
$('#bMenu').onclick = () => showRaw('MENU', `${howHTML}<div class="lbl">AKUN</div>${acctHTML()}<div class="foot">${hasReceipt() ? '<button id="mRec">STRUK TERAKHIR</button>' : ''}<a class="btn" href="${MAIN_ORIGIN}/">KEMBALI KE TOKO UTAMA</a></div>`);
document.addEventListener('click', async e => { if (e.target.id === 'mRec') openReceipt(); if (e.target.id === 'mOut') { e.target.disabled = true; const ok = await logout(); toast(ok ? 'Kamu sudah logout' : 'Logout gagal, coba lagi'); $('#bMenu').onclick(); } });
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

if (!renderer) { $('#bPlay').onclick = () => openCatalog('all'); setTimeout(() => { const l = $('#loadState span'); if (l && !/3D error/.test(l.textContent)) l.textContent = 'WebGL/Three.js tidak tersedia — memakai KATALOG CEPAT.'; }, 300); }
