// pay.js — pembayaran Midtrans Snap untuk game. Alurnya sama dengan blok "PEMBAYARAN (MIDTRANS)" di script.js web utama:
// browser hanya bicara ke API pembayaran (Cloudflare Worker "fvck-pay") yang memegang Server Key. Key Midtrans TIDAK ada di repo game.
// Alamat Worker dibaca dari payment-config.js milik web utama (satu sumber kebenaran, seperti firebase.js).
// Status LUNAS / DP diubah oleh SERVER (webhook Midtrans). Game tidak pernah menulis status bayar.
const CFG_URL = 'https://fucktherules.my.id/payment-config.js?v=1';
const SNAP_OK = /^https:\/\/app(\.sandbox)?\.midtrans\.com\/snap\/snap\.js$/;     // hanya host Snap resmi yang boleh dimuat
const TIMEOUT = 25000;

let cfgMod = null, payCfg = null, snapLoading = null, busy = false, snapWatch = 0;
let hooks = { onSnap: () => { } };
export function bindPay(x) { hooks = { ...hooks, ...x }; }          // onSnap(aktif): game berhenti menggambar 3D selama popup bayar terbuka

export const PAY_LABEL = { pending: 'Pending', dp: 'DP', lunas: 'Lunas', ditolak: 'Ditolak' };
export const statusNorm = s => (s === 'rejected' ? 'ditolak' : s || 'pending');      // status order di server -> istilah dokumen lacak
export const isPaying = () => busy;
export const waitText = tahap => tahap === 'P'
  ? 'Pelunasan belum selesai. Kamu bisa lanjut sekarang atau nanti lewat aplikasi Pelunasan.'
  : 'Pembayaran belum selesai. Pesananmu sudah tersimpan, lanjutkan lewat tombol bayar.';

export async function payApi(path, body) {
  if (!cfgMod) cfgMod = await import(CFG_URL).catch(() => null);
  const base = String((cfgMod && cfgMod.PAYMENT_API) || '').replace(/\/+$/, '');
  if (!base || /GANTI/.test(base)) throw new Error('Pembayaran online belum diaktifkan. Hubungi admin.');
  const c = new AbortController(), t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    const r = await fetch(base + path, { ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: c.signal });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Server pembayaran sedang bermasalah.');
    return d;
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('Server pembayaran tidak merespons. Periksa koneksi lalu coba lagi.');
    if (e instanceof TypeError) throw new Error('Tidak bisa terhubung ke server pembayaran. Periksa koneksi lalu coba lagi.');
    throw e;
  } finally { clearTimeout(t); }
}

function muatSnap(cfg) {
  if (window.snap) return Promise.resolve();
  if (!SNAP_OK.test(String(cfg.snapJs || ''))) return Promise.reject(new Error('Alamat halaman pembayaran tidak dikenali. Hubungi admin.'));
  if (!snapLoading) snapLoading = new Promise((res, rej) => {
    const sc = document.createElement('script'), gagal = msg => { clearTimeout(t); snapLoading = null; sc.remove(); rej(new Error(msg)); };
    const t = setTimeout(() => gagal('Halaman pembayaran Midtrans terlalu lama dimuat. Coba lagi.'), 20000);
    sc.src = cfg.snapJs; sc.setAttribute('data-client-key', cfg.clientKey);
    sc.onload = () => { clearTimeout(t); res(); };
    sc.onerror = () => gagal('Gagal memuat halaman pembayaran Midtrans.');
    document.head.appendChild(sc);
  });
  return snapLoading;
}

/* Loading khusus pembayaran (di atas panel & HP game) */
export function tampilLoadingBayar(teks) {
  let el = document.getElementById('payLoader');
  if (!el) {
    el = document.createElement('div'); el.id = 'payLoader'; el.className = 'pay-loader';
    el.innerHTML = '<div class="pay-loader-box"><div class="pay-spin"></div><div class="pay-loader-t" id="payLoaderT"></div><div class="pay-loader-s">Jangan tutup halaman ini</div></div>';
    document.body.appendChild(el);
  }
  document.getElementById('payLoaderT').textContent = teks || 'Menyiapkan pembayaran…';
  el.classList.add('show');
}
export function sembunyiLoadingBayar() { const el = document.getElementById('payLoader'); if (el) el.classList.remove('show'); }

/* Selama popup Midtrans terbuka: game berhenti menggambar 3D, dan <html>/<body> (touch-action:none milik game) dilonggarkan supaya popup
   (iframe lintas-origin) bisa di-scroll di HP. Dilepas saat: popup ditutup (onClose/onError), iframe Midtrans yang tadinya ada sudah hilang,
   atau pemain mengetuk halaman game (popup menutup seluruh layar, jadi ketukan di halaman = popup sudah tertutup). */
function snapOff() { snapMode(false); }
function snapMode(on) {
  document.documentElement.classList.toggle('snap-open', on);
  clearInterval(snapWatch); document.removeEventListener('pointerdown', snapOff, true);
  if (on) {
    let seen = false, gone = 0;
    snapWatch = setInterval(() => {
      if (document.querySelector('iframe[src*="midtrans.com"]')) { seen = true; gone = 0; }
      else if (seen && ++gone >= 3) snapMode(false);
    }, 700);
    document.addEventListener('pointerdown', snapOff, true);
  }
  try { hooks.onSnap(on); } catch (e) { console.warn(e); }
}

/* tahap 'F' = pembayaran awal (lunas / DP), 'P' = pelunasan sisa DP.
   cb.onDone({ kode, tahap, type, status?, trx?, message? }) dipanggil SEKALI saat urusan bayar selesai:
   type = 'success' | 'pending' (status = status order terbaru dari server) | 'close' (popup ditutup) | 'error' | 'fail' (gagal mulai, ada message) */
export async function mulaiBayar(kode, tahap, cb = {}) {
  tahap = tahap === 'P' ? 'P' : 'F';
  if (busy) return;
  busy = true;
  tampilLoadingBayar('Menyiapkan pembayaran…');
  let selesai = false;
  const done = res => { busy = false; try { cb.onDone && cb.onDone({ kode, tahap, ...res }); } catch (e) { console.error(e); } };
  const hasil = async type => {                    // webhook tetap jalan; /sync supaya status langsung terbarui di layar
    selesai = true;
    let sync = null; try { sync = await payApi('/sync', { kode, tahap }); } catch (e) { console.warn('sync:', e); }
    done({ type, status: sync && sync.status ? statusNorm(sync.status) : null, trx: sync ? sync.trx : null });
  };
  try {
    if (!payCfg) payCfg = await payApi('/config');
    await muatSnap(payCfg);
    const d = await payApi('/snap', { kode, tahap });
    sembunyiLoadingBayar();
    snapMode(true);
    window.snap.pay(d.token, {
      onSuccess: () => hasil('success'),
      onPending: () => hasil('pending'),
      onError: () => { selesai = true; snapMode(false); done({ type: 'error', message: 'Pembayaran gagal diproses. Coba lagi atau pilih metode lain.' }); },
      onClose: () => { if (selesai) return; snapMode(false); done({ type: 'close' }); }
    });
  } catch (e) {
    console.error(e); sembunyiLoadingBayar(); snapMode(false);
    done({ type: 'fail', message: (e && e.message) || 'Gagal memulai pembayaran.' });
  }
}
