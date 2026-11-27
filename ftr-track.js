/* ftr-track.js — pelacak pengunjung ringan (tanpa SDK). Dua bagian, keduanya ke Firestore project "city":
   1) Statistik harian (stats/): kunjungan, pengunjung unik hari itu, perangkat baru. Satu permintaan per halaman dibuka.
   2) Aktivitas per perangkat (aktivitas/{hari}_{perangkat}): urutan aksi pelanggan (buka halaman, lihat produk, pilih ukuran/warna,
      isi alamat, bayar, keluar) lengkap dengan jam. Dibaca admin di Insight > Aktivitas.
   Perangkat dikenali dari ID acak (cookie milik sendiri di fucktherules.my.id + localStorage), bukan IP.
   Yang dikirim hanya nama aksi, nama produk, ukuran, dan warna. Isi alamat, nama, nomor HP, dan email TIDAK pernah dikirim.
   Situs lain bisa memanggil window.ftrEvent(kode, detail, {once:true}) untuk mencatat aksi sendiri. */
(function () {
  try {
    var s = document.currentScript, site = s && s.getAttribute("data-site");
    if (!site || navigator.webdriver || /bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent)) return;
    if (/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)) return;
    var P = "city-fucktherules", K = "AIzaSyDphf7cMy_Qlbjfr3kzmWtvhq13vvzwKUw";
    var base = "projects/" + P + "/databases/(default)/documents", API = "https://firestore.googleapis.com/v1/" + base + ":commit?key=" + K;
    var wib = function (ms) { return new Date(ms + 7 * 36e5).toISOString().slice(0, 10); };   // hari WIB
    var day = wib(Date.now());

    /* ---------- 1) statistik harian (tidak berubah) ---------- */
    try {
      var kd = "ftr.v." + site + ".d", ks = "ftr.v." + site + ".s", last = null, seen = null;
      try { last = localStorage.getItem(kd); seen = localStorage.getItem(ks); localStorage.setItem(kd, day); localStorage.setItem(ks, "1"); } catch (e) { last = day; seen = "1"; }   // tanpa penyimpanan: hanya kunjungan
      var uniq = last === day ? 0 : 1, fresh = seen ? 0 : 1;
      var id = "d_" + site + "_" + day;
      var body = { writes: [{ update: { name: base + "/stats/" + id, fields: { site: { stringValue: site }, day: { stringValue: day } } }, updateMask: { fieldPaths: ["site", "day"] },
        updateTransforms: [{ fieldPath: "hits", increment: { integerValue: "1" } }, { fieldPath: "uniq", increment: { integerValue: String(uniq) } }, { fieldPath: "fresh", increment: { integerValue: String(fresh) } }] }] };
      fetch(API, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(function () { });
    } catch (e) { }

    /* ---------- 2) aktivitas per perangkat ---------- */
    try {
      var ID_RE = /^[a-z0-9]{8,16}$/;
      var rand = function (n) { var a = "abcdefghijklmnopqrstuvwxyz0123456789", o = "", b = new Uint8Array(n); try { crypto.getRandomValues(b); } catch (e) { for (var i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256); } for (var j = 0; j < n; j++) o += a[b[j] % 36]; return o; };
      var cookieGet = function (n) { var m = document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : ""; };
      var cookieSet = function (n, v) { var dom = /(^|\.)fucktherules\.my\.id$/.test(location.hostname) ? "; domain=.fucktherules.my.id" : ""; document.cookie = n + "=" + v + dom + "; path=/; max-age=31536000; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : ""); };
      var dev = ""; try { dev = cookieGet("ftr_dev"); } catch (e) { }
      if (!ID_RE.test(dev)) { try { dev = localStorage.getItem("ftr.dev") || ""; } catch (e) { dev = ""; } }
      if (!ID_RE.test(dev)) dev = rand(12);
      try { localStorage.setItem("ftr.dev", dev); } catch (e) { }
      try { cookieSet("ftr_dev", dev); } catch (e) { }   // web utama, game, dan kota berbagi satu ID perangkat (sub-domain yang sama)

      var u = navigator.userAgent;
      var os = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android" : /Windows/.test(u) ? "Windows" : /Mac OS/.test(u) ? "Mac" : /Linux/.test(u) ? "Linux" : "Lainnya";
      var br = /Instagram/.test(u) ? "Instagram" : /FBAN|FBAV/.test(u) ? "Facebook" : /TikTok|musical_ly|Bytedance/i.test(u) ? "TikTok" : /Line\//.test(u) ? "LINE" : /EdgA?\//.test(u) ? "Edge" : /OPR\//.test(u) ? "Opera" : /SamsungBrowser/.test(u) ? "Samsung" : /Firefox|FxiOS/.test(u) ? "Firefox" : /Chrome|CriOS/.test(u) ? "Chrome" : /Safari/.test(u) ? "Safari" : "";
      var ua = br ? os + " · " + br : os;

      var queue = [], timer = 0, onceSet = {}, lastKD = "", lastKDt = 0, away = false, awayAt = 0, lastPath = "";
      var clean = function (v, n) { return String(v == null ? "" : v).replace(/[|\r\n]+/g, " ").trim().slice(0, n); };

      function flush(tries) {
        if (timer) { clearTimeout(timer); timer = 0; }
        if (!queue.length) return;
        var items = queue.splice(0, queue.length), byDay = {};
        items.forEach(function (it) { (byDay[wib(it.t)] = byDay[wib(it.t)] || []).push(it); });
        Object.keys(byDay).forEach(function (d) {
          var list = byDay[d];
          for (var i = 0; i < list.length; i += 10) {   // maksimal 10 aksi per penulisan (batas di Rules)
            (function (chunk) {
              var vals = chunk.map(function (it) { return { stringValue: it.t + "|" + site + "|" + it.k + "|" + it.d }; });
              var b = { writes: [{ update: { name: base + "/aktivitas/" + d + "_" + dev, fields: { dev: { stringValue: dev }, day: { stringValue: d }, ua: { stringValue: ua } } }, updateMask: { fieldPaths: ["dev", "day", "ua"] },
                updateTransforms: [{ fieldPath: "ev", appendMissingElements: { values: vals } }] }] };
              fetch(API, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })
                .then(function (r) { if (!r.ok) { try { r.text().then(function (x) { console.warn("ftr-track: aktivitas ditolak", r.status, String(x).slice(0, 240)); }); } catch (e) { } } if (!r.ok && !tries) { queue = chunk.concat(queue); timer = setTimeout(function () { flush(1); }, 8000); } })
                .catch(function () { if (!tries) { queue = chunk.concat(queue); timer = setTimeout(function () { flush(1); }, 8000); } });
            })(list.slice(i, i + 10));
          }
        });
      }
      function ev(k, d, o) {
        try {
          k = clean(k, 20); d = clean(d, 60); if (!/^[a-z_]+$/.test(k)) return;
          var key = k + "|" + d, now = Date.now();
          if (o && o.once) { if (onceSet[key]) return; onceSet[key] = 1; }
          if (key === lastKD && now - lastKDt < 15000) return;   // aksi yang sama beruntun (render ulang) dihitung sekali
          lastKD = key; lastKDt = now;
          queue.push({ t: now, k: k, d: d });
          if (queue.length >= 10) flush(); else if (!timer) timer = setTimeout(flush, 4000);
        } catch (e) { }
      }
      window.ftrEvent = ev;

      /* halaman dibuka + perpindahan halaman di situs satu-halaman (web utama memakai pushState) */
      function pathEvt() { var p = location.pathname; if (p === lastPath) return; lastPath = p; ev("buka", p); }
      pathEvt();
      try { var ps = history.pushState; if (ps) history.pushState = function () { var r = ps.apply(this, arguments); setTimeout(pathEvt, 0); return r; }; } catch (e) { }
      addEventListener("popstate", function () { setTimeout(pathEvt, 0); });

      /* mengisi alamat: hanya dicatat bahwa kolom alamat sudah terisi, isinya tidak dikirim */
      document.addEventListener("focusout", function (e) {
        try {
          var t = e.target; if (!t || !/^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
          var nm = (t.id || "") + " " + (t.name || "") + " " + ((t.dataset && t.dataset.f) || "");
          if (/alamat|address/i.test(nm) && !/mail/i.test(nm) && String(t.value || "").trim().length >= 8) ev("alamat", "", { once: true });
        } catch (er) { }
      }, true);

      /* keluar / kembali */
      function leave() { if (away) return; away = true; awayAt = Date.now(); ev("keluar", ""); flush(); }
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") leave();
        else if (away) { var gone = Date.now() - awayAt; away = false; if (gone >= 120000) ev("kembali", ""); }
      });
      addEventListener("pagehide", leave);
    } catch (e) { }
  } catch (e) { }
})();
