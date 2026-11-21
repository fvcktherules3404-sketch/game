/* ftr-track.js — pelacak pengunjung ringan (tanpa cookie, tanpa SDK). Satu permintaan kecil per halaman dibuka.
   Menambah hitungan harian di Firestore (project city): kunjungan, pengunjung unik hari itu, dan perangkat baru (pertama kali masuk).
   Perangkat dikenali dari penyimpanan browser (bukan IP, tidak ada data pribadi yang dikirim). */
(function () {
  try {
    var s = document.currentScript, site = s && s.getAttribute("data-site");
    if (!site || navigator.webdriver || /bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent)) return;
    if (/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)) return;
    var P = "city-fucktherules", K = "AIzaSyDphf7cMy_Qlbjfr3kzmWtvhq13vvzwKUw";
    var day = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);   // hari WIB
    var kd = "ftr.v." + site + ".d", ks = "ftr.v." + site + ".s", last = null, seen = null;
    try { last = localStorage.getItem(kd); seen = localStorage.getItem(ks); localStorage.setItem(kd, day); localStorage.setItem(ks, "1"); } catch (e) { last = day; seen = "1"; }   // tanpa penyimpanan: hanya kunjungan
    var uniq = last === day ? 0 : 1, fresh = seen ? 0 : 1;
    var id = "d_" + site + "_" + day, base = "projects/" + P + "/databases/(default)/documents";
    var body = { writes: [{ update: { name: base + "/stats/" + id, fields: { site: { stringValue: site }, day: { stringValue: day } } }, updateMask: { fieldPaths: ["site", "day"] },
      updateTransforms: [{ fieldPath: "hits", increment: { integerValue: "1" } }, { fieldPath: "uniq", increment: { integerValue: String(uniq) } }, { fieldPath: "fresh", increment: { integerValue: String(fresh) } }] }] };
    fetch("https://firestore.googleapis.com/v1/" + base + ":commit?key=" + K, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(function () { });
  } catch (e) { }
})();
