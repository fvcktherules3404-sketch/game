# FVCKTHERULES — Game Store (game.fucktherules.my.id)

Frontend tambahan (HTML/CSS/JS murni, tanpa build) untuk toko utama. **Tidak ada katalog, harga, atau sistem order sendiri.**
Game memuat `https://fucktherules.my.id/firebase.js` (modul yang sama dengan toko utama) dan memakai fungsinya langsung:
`listenProduk`, `saveOrder` (ID `PREFIX-XXXXXX`, dokumen `lacak`, indeks `lacakIdx`), `getVoucherByKode`, `updateVoucherKuota`, `uploadGambar`, `customerSignIn`.

## Struktur
```
CNAME  .nojekyll  index.html  style.css  game.js (engine/kontrol)  shop.js (katalog, tas, checkout, kasir)
assets/qris.jpg (cadangan; utama memakai /qris.jpg dari toko utama)  assets/favicon.png
```
Tidak ada file toko utama yang diubah. CNAME toko utama tetap `fucktherules.my.id`.

## Audit singkat toko utama (hasil baca ZIP)
- Firebase project `fvcktherules-store`: Auth (email/Google) + Firestore. Koleksi: `produk`, `orders`, `lacak`(+`timeline`), `lacakIdx`, `pelunasan`, `vouchers`, `customers`, `settings/bannerText`, `galeri`, `banners`.
- Produk: `nama, harga ("Rp 189.000"), badge (pre/ready/sold), status, warna ("A / B"), stok (ukuran tersedia "S / M / L"), thumbnail, details[], specs, dpAllowed, kodePrefix, poClosed`. "Stok" di sistem ini = **daftar ukuran tersedia**, bukan jumlah.
- Checkout utama: **bayar dulu → upload bukti (Cloudinary) → `saveOrder`** dengan `status:'pending'`. Tidak ada gateway/webhook; admin memverifikasi bukti manual lalu set DP/LUNAS. Game mengikuti alur persis ini (tidak pernah menulis LUNAS).
- Keranjang utama tidak punya field qty: 1 entri per pcs. Game memecah qty menjadi entri berulang agar admin/lacak/resi tetap kompatibel.
- Ongkir: Google Apps Script (Biteship, J&T, 250 g/item) + wilayah emsifa. Dipakai ulang apa adanya. Backup order ke Google Sheet (GAS POST) juga diulang.
- Rekening: **hardcoded di index.html utama** (Mandiri 1370023790229, GoPay 081910421976, a.n. Dias Adhitya Purnama Putra), bukan di config. Disalin ke `PAY` di `shop.js` — ubah di sana jika rekening berubah.

## Risiko / masalah keamanan (bawaan toko utama, tidak diubah)
1. Rules `orders`: `create` hanya mewajibkan `status=='pending'` → siapa pun bisa membuat order dengan harga apa pun lewat REST API. Game menghitung harga dari data Firestore terbaru, tapi server tidak memvalidasi. Mitigasi realistis & gratis: admin selalu mencocokkan `totalAkhir` dengan bukti bayar & katalog (sudah jadi alur manual). Validasi server penuh butuh Cloud Functions (plan Blaze, tidak gratis).
2. Voucher boleh diturunkan kuotanya oleh publik (by design di rules).
3. Pelanggan tidak bisa mengubah status/pembayaran (rules `orders.update` hanya admin) — sudah aman.
4. Sesi login Firebase per-origin: login di toko utama **tidak** terbawa ke game subdomain (login opsional tersedia di form checkout).
5. Game bergantung pada `fucktherules.my.id/firebase.js` (versi `?v=20261013`). Jika nama export di sana diganti, game ikut terdampak. Itu harga dari "tidak menduplikasi kode". Alternatif: salin firebase.js ke repo game (tapi tidak ikut update).

## Deployment (gratis)
1. GitHub → New repository `fvcktherules-game` (Public). Upload **isi** folder ini (bukan foldernya) ke branch `main`.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`. Custom domain: `game.fucktherules.my.id` → Save → centang **Enforce HTTPS** (setelah sertifikat terbit).
3. DNS (di penyedia domain `my.id`): tambah record **CNAME** — Host `game` → Target `<username-github>.github.io`. (Jangan pakai A record untuk subdomain; jangan ubah record `@`/`www` toko utama.) Tunggu propagasi (menit–jam).
4. Firebase Console → Authentication → Settings → **Authorized domains** → tambah `game.fucktherules.my.id` (diperlukan jika memakai Google sign-in; aman ditambahkan juga untuk email).
5. Google Cloud Console → Credentials → API key `AIzaSyCVL_…`: jika ada *HTTP referrer restriction*, tambahkan `https://game.fucktherules.my.id/*`.
6. Pastikan `https://fucktherules.my.id/firebase.js` bisa diimpor lintas-origin (GitHub Pages mengirim `Access-Control-Allow-Origin: *`; cek tab Network).
7. Uji setelah live (daftar di bawah). Firestore rules **tidak perlu diubah**.

## Status pengujian
Dilakukan (Chromium headless, viewport 390×780 sentuh, **Firebase & GAS di-mock**):
- Intro → PLAY, HUD tampil; jalan dengan keyboard, tabrakan rak/loket bekerja, prompt "…TO BROWSE" muncul, E membuka katalog, ESC menutup.
- Katalog dari data `produk`, pilih warna/ukuran (hanya ukuran di `stok`), qty, ADD TO CART, badge HUD, tas persisten (localStorage, divalidasi ulang ke katalog).
- Checkout: validasi form, cascade wilayah, ongkir, voucher nominal, total (378.000+20.000−10.000=388.000), tolak submit tanpa bukti, payload order (produk dipecah per pcs, `isPO`, `kodePrefix`, `dpEligible`), struk dengan ID dari `saveOrder`, tas dikosongkan.
**BELUM diuji (perlu kamu uji di produksi):** Firebase/Firestore asli; order muncul di admin.html; ID dipakai di Pantau Pesanan; voucher persen/free_ongkir; import lintas-origin `firebase.js`; Biteship/J&T asli; QRIS asli tampil; Google/email login; Android fisik; jumlah order saat klik ganda (tombol dikunci + flag `busy`, tapi belum dihitung di database asli); perubahan produk live di admin.

## Belum diwujudkan
- Verifikasi pembayaran otomatis: tidak ada (QRIS statis, tanpa gateway). Status selalu *menunggu verifikasi admin*. Struktur siap: ganti `openPay()`/`submit()` di `shop.js` dengan gateway kelak.
- Musik ambient (hanya efek suara WebAudio buatan, tombol mute). Rak khusus "City Series": belum ada penanda series di data produk — pakai filter katalog.
- Pixel art dibuat prosedural di canvas (tanpa aset gambar) agar ringan; bisa diganti sprite sheet nanti.
