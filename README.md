# FVCKTHERULES — Game Store (game.fucktherules.my.id)

Frontend tambahan (HTML/CSS/JS murni, tanpa build) untuk toko utama. **Tidak ada katalog, harga, atau sistem order sendiri.**
Game memuat `https://fucktherules.my.id/firebase.js` (modul yang sama dengan toko utama) dan memakai fungsinya langsung:
`listenProduk`, `saveOrder` (ID `PREFIX-XXXXXX`, dokumen `lacak`, indeks `lacakIdx`), `getVoucherByKode`, `updateVoucherKuota`, `getPaymentSettings`, `hitungMinDP`, `customerSignIn`. Pembayaran lewat API Midtrans web utama (lihat bagian *Pembayaran Midtrans*).

## Struktur
```
CNAME  .nojekyll  index.html  style.css  game.js (3D: Three.js r160 dari CDN jsDelivr/unpkg, kamera TPV/FPV, toko + fasad kaca + jalan, hanger, kasir)  shop.js (katalog, tas, checkout, layar bayar, struk)  pay.js (Midtrans Snap)  phone.js (HP: Berita, Diskusi, Lacak, Cek Resi, Pelunasan)
assets/favicon.png  assets/logo.png  assets/mural.png
```
Satu perubahan di repo toko utama: `payment-worker/wrangler.toml` (`ALLOWED_ORIGINS` + `https://game.fucktherules.my.id`, supaya API pembayaran menerima panggilan dari game). CNAME toko utama tetap `fucktherules.my.id`.

## Audit singkat toko utama (hasil baca ZIP)
- Firebase project `fvcktherules-store`: Auth (email/Google) + Firestore. Koleksi: `produk`, `orders`, `lacak`(+`timeline`), `lacakIdx`, `pelunasan`, `vouchers`, `customers`, `settings/bannerText`, `galeri`, `banners`.
- Produk: `nama, harga ("Rp 189.000"), badge (pre/ready/sold), status, warna ("A / B"), stok (ukuran tersedia "S / M / L"), thumbnail, details[], specs, dpAllowed, kodePrefix, poClosed`. "Stok" di sistem ini = **daftar ukuran tersedia**, bukan jumlah.
- Checkout utama: **pesan dulu → bayar lewat Midtrans Snap (Cloudflare Worker `payment-worker`) → webhook Midtrans mengubah status ke DP/LUNAS**. Order dibuat `status:'pending'`, lalu *server* yang mengubah statusnya. Game mengikuti alur persis ini (tidak pernah menulis LUNAS).
- Keranjang utama tidak punya field qty: 1 entri per pcs. Game memecah qty menjadi entri berulang agar admin/lacak/resi tetap kompatibel.
- Ongkir: Google Apps Script (Biteship, J&T, 250 g/item) + wilayah emsifa. Dipakai ulang apa adanya. Backup order ke Google Sheet (GAS POST) juga diulang.
- Pembayaran: Midtrans Snap lewat API `fvck-pay` (alamat di `payment-config.js` toko utama; Server Key hanya ada di Worker). Rekening/QRIS statis tidak dipakai lagi di game (`PAY` di `shop.js` dan `assets/qris.jpg` sudah dihapus).

## Risiko / masalah keamanan (bawaan toko utama, tidak diubah)
1. Rules `orders`: `create` hanya mewajibkan `status=='pending'` → siapa pun bisa membuat dokumen order dengan harga apa pun lewat REST API. Untuk pembayaran Midtrans ini ditutup di sisi Worker: sebelum token Snap dibuat, Worker menghitung ulang harga resmi dari katalog, memeriksa diskon, dan memvalidasi nominal DP, sehingga order berharga palsu tidak bisa dibayar (dokumennya tetap `pending`, admin bisa menolaknya). Validasi server penuh di sisi Firestore butuh Cloud Functions (plan Blaze, tidak gratis).
2. Voucher boleh diturunkan kuotanya oleh publik (by design di rules).
3. Pelanggan tidak bisa mengubah status/pembayaran (rules `orders.update` hanya admin) — sudah aman.
4. Sesi login Firebase per-origin: login di toko utama **tidak** terbawa ke game subdomain (login opsional tersedia di form checkout).
5. Game bergantung pada `fucktherules.my.id/firebase.js` (versi `?v=20261045`) dan `fucktherules.my.id/payment-config.js`. Jika nama export di sana diganti, game ikut terdampak. Itu harga dari "tidak menduplikasi kode". Alternatif: salin file itu ke repo game (tapi tidak ikut update).

## Pembayaran Midtrans (pay.js) — sama dengan toko utama
Checkout game memakai API pembayaran yang sama dengan toko utama (Cloudflare Worker `fvck-pay`). **Tidak ada key/secret baru di repo game.**
- Alur: form kirim → layar **LUNAS / DP** (minimal DP dari `settings/payment` + aturan DP per produk, rumus sama dengan toko utama) → `saveOrder` (`tipeBayar:'Midtrans'`, `payMode`, `payAmount`, `status:'pending'`) → popup Midtrans Snap (QRIS, e-wallet, VA bank, dll) → **struk sebagai papan status**: MENUNGGU PEMBAYARAN / DP DITERIMA / LUNAS / DIBATALKAN.
- Status LUNAS/DP diubah **server** (webhook Midtrans + `/sync` sesaat setelah popup). Game tidak pernah menulis status bayar. Worker juga menghitung ulang harga resmi dan memvalidasi DP sebelum membuat token Snap.
- Popup ditutup tanpa bayar: pesanan tetap tersimpan; **LANJUT BAYAR** (di struk, atau di aplikasi **Lacak** HP) memakai ulang token yang sama (tanpa transaksi ganda). **CEK STATUS** untuk VA/QRIS yang dibayar lewat aplikasi bank. Tidak dibayar sampai batas waktu → Worker membatalkan pesanan dan mengembalikan stok.
- Pelunasan sisa DP: aplikasi **Pelunasan** di HP → **Lanjut bayar** (tahap `P`).
- Alamat API dibaca dari `https://fucktherules.my.id/payment-config.js` (satu sumber kebenaran, seperti `firebase.js`). Snap.js hanya dimuat dari `app(.sandbox).midtrans.com`.
- Order dari game bertanda `sumber:'game'` (hanya penanda). Struk lama dari versi bayar-manual tetap bisa dibuka (status "menunggu verifikasi admin", tanpa tombol bayar).
- Selama popup terbuka game berhenti menggambar 3D dan `touch-action` html/body dilonggarkan (kelas `snap-open`) supaya popup bisa di-scroll di HP.
- Aturan yang diduplikasi dari toko utama (ubah bersamaan jika berubah): minimal DP per produk (`minDP()` di `shop.js` ⇄ `minDPType()` di `script.js` toko utama ⇄ `hitungMinDPItems()` di `payment-worker/worker.js`).

## Deployment (gratis)
1. GitHub → New repository `fvcktherules-game` (Public). Upload **isi** folder ini (bukan foldernya) ke branch `main`.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`. Custom domain: `game.fucktherules.my.id` → Save → centang **Enforce HTTPS** (setelah sertifikat terbit).
3. DNS (di penyedia domain `my.id`): tambah record **CNAME** — Host `game` → Target `<username-github>.github.io`. (Jangan pakai A record untuk subdomain; jangan ubah record `@`/`www` toko utama.) Tunggu propagasi (menit–jam).
4. Firebase Console → Authentication → Settings → **Authorized domains** → tambah `game.fucktherules.my.id` (diperlukan jika memakai Google sign-in; aman ditambahkan juga untuk email).
5. Google Cloud Console → Credentials → API key `AIzaSyCVL_…`: jika ada *HTTP referrer restriction*, tambahkan `https://game.fucktherules.my.id/*`.
6. Pastikan `https://fucktherules.my.id/firebase.js` bisa diimpor lintas-origin (GitHub Pages mengirim `Access-Control-Allow-Origin: *`; cek tab Network).
7. **Pembayaran:** di repo toko utama, `payment-worker/wrangler.toml` harus memuat `https://game.fucktherules.my.id` di `ALLOWED_ORIGINS` (file patch disertakan). Push ke `main` → workflow *Deploy API Pembayaran* otomatis deploy ulang Worker. Tanpa ini popup bayar gagal (CORS: "Origin tidak diizinkan"). Notification URL Midtrans tidak berubah (tetap ke Worker).
8. Uji setelah live (daftar di bawah) — mulai dengan **Midtrans Sandbox**. Firestore rules **tidak perlu diubah**.

## Status pengujian
Dilakukan (Chromium headless, viewport 390×780 sentuh, **Firebase & GAS di-mock**):
- Versi 3D: render WebGL (SwiftShader) tanpa error; kamera third-person, tekstur dinding/lantai/papan, hanger dengan kaos (tekstur foto produk, memuat dari Cloudinary w_256), prompt per hanger, E membuka panel produk, ESC menutup. Posisi pemain di-teleport lewat hook `?debug` untuk tes (hook tidak aktif tanpa parameter itu).
- Katalog dari data `produk`, pilih warna/ukuran (hanya ukuran di `stok`), qty, ADD TO CART, badge HUD, tas persisten (localStorage, divalidasi ulang ke katalog).
- Checkout & pembayaran Midtrans: diuji end-to-end dengan **`worker.js` asli toko utama** (Firestore & Midtrans diganti emulator) di Chromium headless 390×780 sentuh, 73 cek lulus: LUNAS (pre order + tambahan + voucher), DP dengan aturan per produk (nominal + persen) dan parity minimal DP dengan Worker (119.999 ditolak, 120.000 diterima), popup ditutup → LANJUT BAYAR (token dipakai ulang, tanpa transaksi ganda), VA pending → CEK STATUS, kedaluwarsa (order batal + stok kembali), Worker tidak terjangkau, aksesoris (hanya lunas), Pelunasan & Lacak di HP, struk lama, CORS origin game, tanpa error JavaScript.
**BELUM diuji (perlu kamu uji di produksi):** Firebase/Firestore asli; order muncul di admin.html; ID dipakai di Pantau Pesanan; voucher free_ongkir; import lintas-origin `firebase.js` / `payment-config.js` dari domain asli; **popup Midtrans Snap asli + webhook asli (coba di Sandbox dulu)**; CORS dari `game.fucktherules.my.id` asli setelah Worker di-deploy ulang; Biteship/J&T asli; Google/email login; Android/iOS fisik (terutama scroll popup Snap di HP); perubahan produk live di admin.

## Belum diwujudkan
- Musik ambient (hanya efek suara WebAudio buatan, tombol mute). Rak khusus "City Series": belum ada penanda series di data produk — pakai filter katalog.
- Semua model dibuat prosedural dari kode (kaos = badan+lengan+kerah berkerut, bukan kotak; tekstur bata/beton digambar via canvas). Warna kaos mengikuti field `warna` produk; foto produk tampil di panel/katalog, bukan ditempel ke kaos. Three.js dimuat dari CDN (butuh internet); jika gagal, game jatuh ke KATALOG CEPAT. Untuk realisme lebih tinggi: ganti dengan model .glb gratis (CC0) + GLTFLoader.


## Pembaruan terbaru
- Tema popup/katalog/tas/checkout/kasir disamakan dengan web utama (krem, tombol pill, kartu bulat, judul Gaegu, font Inter). Logo burung kuning memakai logo web utama (assets/logo.png; favicon juga diperkecil 358KB -> 15KB).
- Kaos & hanger diperbesar 1.3x (jarak antar hanger 0.8 m; muat 16 produk per sisi rak + 20 di rak belakang; sisanya tetap ada di KATALOG). Foto produk tampil sebagai patch bulat di dada kaos (dimuat malas hanya untuk hanger yang dekat).
- Cermin bisa dipindah: dekati cermin, tekan E, pilih "PINDAH CERMIN" (3 posisi dinding, tersimpan di localStorage).
- Optimasi: satu draw call per hanger (atlas tekstur), geometri statis digabung per material, material Lambert untuk permukaan kasar, bayangan diperbarui tiap 2 frame, resolusi adaptif (turun dulu sebelum kualitas), batas ~60fps di layar 120Hz, lampu titik berkurang di kualitas rendah, tekstur dinding/lantai resolusi lebih tinggi + AO sudut dinding.

## Pembaruan 11 Okt
- Ruangan dibuat terang (siang, dinding krem, plafon putih); lantai kembali ke keramik kotak 2x2 seperti versi sebelumnya.
- Mural graffiti "FVCK THE RULES" (assets/mural.png) di dinding belakang; logo + nama di atas pintu. Papan tanda yang sebelumnya tertutup (kotak hitam) sudah diperbaiki.
- Cermin default di posisi ke-2 (dinding kiri depan); tetap bisa dipindah lewat E di cermin (kunci simpanan baru: fvckgame.mir2).
- Rak "arsip/sold" dipindah ke tengah agar mural tidak tertutup.
- Desain kaos asli: foto produk dibuang latarnya (flood-fill dari tepi) lalu dipetakan ke dada, bahu, dan lengan model 3D. Hanya ~12 hanger terdekat (<8 m) yang diberi tekstur desain; yang jauh memakai warna polos supaya ringan. Jika foto berlatar rumit / CORS gagal, foto utuh dipakai.
- Tangan FPV kini dirender di scene terpisah (depth dibersihkan sebelum menggambar tangan) — menggantikan trik depthTest:false yang menyebabkan garis/pita aneh di tangan.
- Resolusi: sekarang default memakai resolusi asli layar (piksel fisik) dengan anggaran piksel per kualitas, dan turun otomatis (maks. ke 60%) hanya jika FPS < 30. Sebelumnya dibatasi pixel-ratio 1.75 sehingga di HP DPR 2.6+ hanya ~67% resolusi asli (burik), sedangkan mode 'situs desktop' (DPR ~1.1) tampil tajam. Preferensi kualitas tidak lagi disimpan antar sesi.

## HP di dalam game (phone.js)
- Tombol 📱 di HUD (atau tombol P; Esc/ketuk di luar untuk menutup). Tampilan HP sungguhan: bezel, kamera punch-hole, status bar (jam asli perangkat), layar beranda dengan ikon aplikasi, tombol beranda.
- Aplikasi **Berita** (daftar + filter kategori + detail) dan **Diskusi** (post admin, jumlah reaksi, balasan) membaca Firebase jurnal `fvck-journal` lewat `journalDb` dari firebase.js web utama — query yang sama dengan journal.js (`articles` status=published orderBy publishedAt; `posts` status=published orderBy createdAt; `replies`). Hanya BACA; membalas/bereaksi tetap di web utama (tombol "Ikut diskusi di web utama"). Butuh firebase.js live web utama yang mengekspor `journalDb` dan Firestore SDK 12.13.0 yang sama.
- Data baru dimuat saat HP dibuka pertama kali; tombol ⟳ untuk muat ulang. Jika gagal (rules/jaringan/index), tampil pesan + "Coba lagi".

## Logout
- Menu ☰ → bagian **AKUN**: menampilkan email yang sedang login + tombol **LOGOUT** (atau "Belum login").
- Checkout (kasir): kalau sudah login, ada tombol **LOGOUT** di bawah "Login sebagai …". Email yang terisi otomatis dikosongkan setelah logout.
- Logout memakai `customerSignOut()` dari firebase.js web utama (keluar dari akun toko + akun jurnal); jika tidak tersedia, jatuh ke `auth.signOut()`.

## Browser mini di dalam HP
- Semua tombol web di HP (ikon Jurnal/Toko, "Baca selengkapnya", "Ikut diskusi di web utama") membuka halaman **di dalam layar HP** (iframe + bilah alamat, ‹ kembali, ⟳, ↗ buka di tab baru) — pemain tidak keluar dari game.
- Syarat: situs tujuan boleh di-embed (tidak mengirim header `X-Frame-Options` / CSP `frame-ancestors`). GitHub Pages tidak memblokirnya secara default. Jika halaman tidak tampil, setelah 8 detik muncul saran "Buka di tab baru".
- Selama browser HP aktif, game berhenti menggambar 3D (hemat baterai/GPU) dan lanjut lagi saat kembali ke aplikasi HP/menutup HP.
- Menu ☰ → "Kembali ke toko utama" dan pintu toko tetap keluar ke web utama (sengaja).

## Gambar desain kaos (field `desain`)
- Admin web utama (patch: admin.html + admin.js) punya kolom baru **GAMBAR DESAIN UNTUK GAME 3D** di form produk → disimpan ke dokumen `produk.desain` (URL Cloudinary).
- Game menempelkannya di dada tengah, ukuran baku: lebar 28 cm (maks. tinggi 40 cm), tepi atas 13 cm di bawah tepi atas kerah, rasio asli dipertahankan, di atas warna kain dari kolom `warna`. Kanvas 2x agar tajam. Dimuat hanya untuk hanger terdekat.
- Format: PNG/WebP transparan, desain cetak saja (tanpa gambar kaos), lebar ±1200 px. Jika kolom kosong, game memakai foto produk tanpa latar (cara lama).

## Aplikasi pesanan di HP: Lacak, Cek Resi, Pelunasan
- Memakai fungsi yang sama dengan web utama lewat `S.fb` (firebase.js live): `cariLacak`, `getTimeline`, `getPoUpdates`, `cariResi`, `cariPelunasan`. Input satu kolom: ID order / email / no. HP (klasifikasi sama dengan `klasifikasiPantau`).
- **Lacak**: detail pesanan + kotak resi + timeline (termasuk update per artikel PO). **Cek Resi**: nomor resi, tombol salin, dan "Lacak di J&T" (resi otomatis tersalin, J&T dibuka di browser mini HP). **Pelunasan**: ringkasan total/DP/sisa + tombol **Lanjut bayar** (Midtrans, tahap `P`; bukan lagi transfer + upload bukti). Di **Lacak**, pesanan yang masih *Pending* juga punya tombol **Lanjut bayar** (tahap `F`).
- Data pelanggan hanya terbaca lewat pencarian (index hash di web utama) — aturan keamanan tidak diubah.

## Aksesoris (meja AKSESORIS)
- Data dari koleksi Firestore `aksesoris` (diisi admin di web utama → menu **Aksesoris**), dibaca lewat `listenAksesoris` di firebase.js web utama. Bentuknya sama dengan produk, tanpa warna/ukuran/tambahan/desain. Pre Order / Ready / Sold Out jadi satu daftar.
- Stok aksesoris = satu dokumen di koleksi `stok` (ID `stokIdAks`), jadi checkout game memakai `kurangiStok` yang sama dan order yang ditolak admin mengembalikan stoknya otomatis. Tanpa dokumen stok = tidak dibatasi.
- Di game: meja kayu + papan **AKSESORIS** di dinding kiri, di samping kaca (antara papan SOCCER CULTURE dan poster 26). Dekati lalu E → katalog filter AKSESORIS. Foto thumbnail aksesoris dipajang berdiri di atas meja (maks. 8; yang sold out di urutan akhir dan digelapkan).
- Aksesoris juga muncul di KATALOG (SEMUA / PRE ORDER / READY STOCK / ARSIP) dan chip **AKSESORIS**. Di tas & struk tidak ada teks warna/ukuran. Di order, item aksesoris memakai `warna:'-'`, `size:'-'`, `jenis:'aksesoris'`.
- Urutan deploy: **web utama dulu** (firebase.js baru + firestore.rules baru + `wrangler.toml` baru agar Worker menerima origin game), baru game (game memanggil `firebase.js?v=20261045`).

## Aksesoris BESAR (menempel di tembok)
- Admin web utama → Aksesoris → centang **BESAR** (field `besar: true` di dokumen `aksesoris`). Dibaca game sebagai `big`.
- Tidak dicentang (default) = seperti sebelumnya: kecil, berbingkai, berdiri di atas meja (maks. 8).
- Dicentang = foto dipasang **besar menempel di dinding kiri tepat di atas meja AKSESORIS** (di bawah papan nama), seperti syal/scarf, **tanpa bingkai**. Pakai PNG transparan supaya hanya gambarnya yang tampak. Rasio asli dipertahankan (maks. 0,95 m tinggi), maks. 4 buah berjajar; sold out di urutan akhir dan digelapkan. Foto dimuat Cloudinary lebar 768 px.
