import {
  sb, rpc, h, $, toast, dialog, konfirmasi, idPerangkat, simpanLokal, bacaLokal, tanggal, durasi,
  tunda, GalatUjian, layarLogin, konfigTerisi, layarKonfigKosong, teksKaya,
} from './common.js';
import { renderSoal, terisi, NAMA_TIPE } from './soal.js';
import { Pengawas, cekPeramban, cekLayarTunggal, NAMA_PELANGGARAN } from './pengawas.js';
import { NAMA_APLIKASI } from './config.js';

const app = $('#app');
const PERANGKAT = idPerangkat();
let profil = null;
let selisihWaktu = 0; // server - lokal (ms)

// ====================================================================== awal
async function mulai() {
  if (!konfigTerisi()) return layarKonfigKosong(app);
  sb.auth.onAuthStateChange(async (ev) => {
    if (ev === 'PASSWORD_RECOVERY') {
      const baru = h('input', { type: 'password', minLength: 8, autocomplete: 'new-password' });
      const ok = await dialog({ judul: 'Atur kata sandi baru', isi: h('div.form-kolom', h('label', 'Kata sandi baru (min. 8 karakter)'), baru),
        tombol: [{ teks: 'Simpan', nilai: true, gaya: 'utama' }] });
      if (ok && baru.value.length >= 8) {
        const { error } = await sb.auth.updateUser({ password: baru.value });
        toast(error ? error.message : 'Kata sandi diperbarui.', error ? 'bahaya' : 'ok');
      }
    }
  });
  const { data } = await sb.auth.getSession();
  if (!data.session) return layarLogin(app, { judul: NAMA_APLIKASI, sub: 'Masuk dengan akun yang Anda daftarkan.', onMasuk: setelahMasuk });
  setelahMasuk();
}

async function setelahMasuk() {
  try {
    profil = await rpc('saya');
  } catch (e) { return galatUmum(e); }
  if (!profil) return layarProfil();
  layarDaftar();
}

async function keluar() {
  await sb.auth.signOut();
  location.reload();
}

function kepala(...kanan) {
  return h('header.kepala',
    h('div.kepala-merek', h('span.merek-tanda', { 'aria-hidden': 'true' }), NAMA_APLIKASI),
    h('div.kepala-kanan', ...kanan));
}

function galatUmum(e) {
  if (e.kode === 'LOGIN') return keluar();
  app.replaceChildren(h('div.halaman-tengah', h('div.kartu',
    h('h1', 'Tidak dapat memuat'), h('p', e.message),
    h('button.btn.btn-utama', { onclick: () => location.reload() }, 'Muat ulang'))));
}

// ====================================================================== profil
function layarProfil() {
  const nim = h('input#f-nim', { required: true, inputMode: 'text', autocomplete: 'off', maxLength: 30 });
  const nama = h('input#f-nama', { required: true, autocomplete: 'name', maxLength: 100 });
  const pesan = h('p.form-pesan', { role: 'alert' });
  const form = h('form.kartu.form-login',
    h('h1', 'Lengkapi identitas'),
    h('p.redup', 'NIM dan nama akan tercetak pada lembar ujian dan tidak bisa Anda ubah sendiri. Pastikan benar.'),
    h('label', { for: 'f-nim' }, 'NIM'), nim,
    h('label', { for: 'f-nama' }, 'Nama lengkap'), nama,
    pesan,
    h('button.btn.btn-utama.btn-penuh', { type: 'submit' }, 'Simpan identitas'),
    h('button.tautan', { type: 'button', onclick: keluar }, 'Keluar'));
  form.onsubmit = async ev => {
    ev.preventDefault();
    if (!/^[0-9A-Za-z.\-]{3,30}$/.test(nim.value.trim())) { pesan.textContent = 'NIM hanya boleh berisi huruf, angka, titik, atau tanda hubung.'; return; }
    if (nama.value.trim().length < 2) { pesan.textContent = 'Isi nama lengkap Anda.'; return; }
    const ok = await konfirmasi('Simpan identitas?', h('div', h('p', 'NIM: ', h('strong', nim.value.trim().toUpperCase())), h('p', 'Nama: ', h('strong', nama.value.trim())), h('p.redup', 'Setelah disimpan, perubahan hanya bisa dilakukan oleh admin.')), 'Simpan');
    if (!ok) return;
    try { profil = await rpc('lengkapi_profil', { p_nim: nim.value, p_nama: nama.value }); layarDaftar(); }
    catch (e) { pesan.textContent = e.message; }
  };
  app.replaceChildren(h('div.halaman-tengah', form));
  nim.focus();
}

// ====================================================================== daftar ujian
async function layarDaftar() {
  app.replaceChildren(kepala(h('span.identitas', profil.nama, h('small', profil.nim)), h('button.btn.btn-garis.btn-kecil', { onclick: keluar }, 'Keluar')),
    h('main.halaman', h('p.redup', 'Memuat ujian…')));
  let data;
  try { data = await rpc('daftar_ujian_saya'); } catch (e) { return galatUmum(e); }
  selisihWaktu = new Date(data.server_time) - Date.now();
  const kini = () => Date.now() + selisihWaktu;

  const daftar = h('div.ujian-daftar');
  if (!data.ujian.length) daftar.append(h('div.kosong', h('p', 'Belum ada ujian untuk Anda.'), h('p.redup', 'Ujian akan muncul di sini ketika dosen membukanya.')));
  for (const u of data.ujian) {
    const m = new Date(u.mulai).getTime(), s = new Date(u.selesai).getTime();
    let status, aksi = null;
    if (u.status_sesi === 'selesai') {
      status = h('span.lencana.lencana-aman', 'Sudah dikumpulkan');
      aksi = u.skor != null ? h('p.nilai-besar', 'Nilai ', h('strong', Number(u.skor).toLocaleString('id-ID'))) : h('p.redup', 'Nilai akan diumumkan oleh dosen.');
    } else if (u.status_sesi) {
      status = h('span.lencana.lencana-awas', u.status_sesi === 'terkunci' ? 'Terkunci' : 'Sedang dikerjakan');
      aksi = h('button.btn.btn-utama', { onclick: () => layarPersiapan(u, true) }, 'Lanjutkan ujian');
    } else if (kini() < m) {
      status = h('span.lencana', 'Belum dibuka');
      aksi = h('p.redup', 'Dibuka ', tanggal(u.mulai));
    } else if (kini() > s) {
      status = h('span.lencana', 'Sudah ditutup');
    } else {
      status = h('span.lencana.lencana-tinta', 'Dibuka');
      aksi = h('button.btn.btn-utama', { onclick: () => layarPersiapan(u, false) }, 'Persiapan ujian');
    }
    daftar.append(h('article.ujian-kartu',
      h('div.ujian-kartu-kepala', h('h2', u.judul), status),
      u.deskripsi ? h('p', u.deskripsi) : null,
      h('dl.ujian-meta',
        h('div', h('dt', 'Dibuka'), h('dd', tanggal(u.mulai))),
        h('div', h('dt', 'Ditutup'), h('dd', tanggal(u.selesai))),
        h('div', h('dt', 'Durasi'), h('dd', u.durasi_menit + ' menit'))),
      h('div.ujian-kartu-aksi', aksi)));
  }
  app.replaceChildren(
    kepala(h('span.identitas', profil.nama, h('small', profil.nim)), h('button.btn.btn-garis.btn-kecil', { onclick: keluar }, 'Keluar')),
    h('main.halaman', h('div.halaman-judul', h('h1', 'Ujian Anda'),
      h('button.btn.btn-garis.btn-kecil', { onclick: layarDaftar }, 'Muat ulang')), daftar));
}

// ====================================================================== persiapan
function layarPersiapan(u, lanjut) {
  const dasar = cekPeramban();
  const pengawas = new Pengawas({ ujian: u });
  const butir = {};
  const baris = (kunci, judul, isi) => {
    const el = h('li.cek', h('span.cek-tanda', { 'aria-hidden': 'true' }), h('div.cek-isi', h('strong', judul), h('p.cek-pesan'), isi));
    butir[kunci] = el; return el;
  };
  const tandai = (kunci, ok, pesan) => {
    const el = butir[kunci]; if (!el) return;
    el.classList.toggle('cek-ok', ok === true); el.classList.toggle('cek-gagal', ok === false);
    el.querySelector('.cek-pesan').textContent = pesan || '';
  };
  const vPratinjau = h('video.pratinjau-kamera', { muted: true, playsInline: true, autoplay: true });
  const tKamera = h('button.btn.btn-garis.btn-kecil', { type: 'button' }, 'Izinkan kamera');
  const tLayar = h('button.btn.btn-garis.btn-kecil', { type: 'button' }, 'Bagikan seluruh layar');
  const tMonitor = h('button.btn.btn-garis.btn-kecil', { type: 'button' }, 'Periksa ulang');
  const token = h('input#f-token', { autocomplete: 'off', spellcheck: false, maxLength: 32, placeholder: 'Diumumkan pengawas' });
  const setuju = h('input#f-setuju', { type: 'checkbox' });
  const pesan = h('p.form-pesan', { role: 'alert' });
  const tMulai = h('button.btn.btn-utama.btn-besar', { type: 'button', disabled: true }, lanjut ? 'Lanjutkan dalam layar penuh' : 'Mulai ujian dalam layar penuh');

  const daftarCek = h('ol.cek-daftar',
    baris('peramban', 'Peramban'),
    baris('perangkat', 'Perangkat'),
    baris('layarTunggal', 'Satu monitor', tMonitor),
    u.wajib_kamera ? baris('kamera', 'Kamera', h('div.cek-kamera', tKamera, vPratinjau)) : null,
    u.wajib_layar ? baris('layar', 'Berbagi layar', h('div', h('p.redup.kecil', 'Pada jendela yang muncul, pilih tab "Seluruh layar" lalu klik layar Anda.'), tLayar)) : null);

  const perbarui = () => {
    const semua = dasar.peramban.ok && dasar.perangkat.ok && cekLayarTunggal().ok
      && (!u.wajib_kamera || pengawas.kameraHidup()) && (!u.wajib_layar || pengawas.layarHidup())
      && setuju.checked && (lanjut || token.value.trim().length >= 4);
    tMulai.disabled = !semua;
  };
  tandai('peramban', dasar.peramban.ok, dasar.peramban.pesan);
  tandai('perangkat', dasar.perangkat.ok, dasar.perangkat.pesan);
  tandai('layarTunggal', dasar.layarTunggal.ok, dasar.layarTunggal.pesan);
  tMonitor.onclick = () => { const c = cekLayarTunggal(); tandai('layarTunggal', c.ok, c.pesan); perbarui(); };
  tKamera.onclick = async () => {
    try { await pengawas.mintaKamera(); pengawas.pasangPratinjau(vPratinjau); tandai('kamera', true, 'Kamera aktif. Pastikan wajah Anda terlihat jelas.'); tKamera.textContent = 'Ganti kamera'; }
    catch (e) { tandai('kamera', false, e.name === 'NotAllowedError' ? 'Izin kamera ditolak. Klik ikon kamera di bilah alamat untuk mengizinkan.' : 'Kamera tidak dapat dibuka: ' + e.message); }
    perbarui();
  };
  tLayar.onclick = async () => {
    try { await pengawas.mintaLayar(); tandai('layar', true, 'Seluruh layar sedang dibagikan.'); tLayar.textContent = 'Bagikan ulang'; }
    catch (e) { tandai('layar', false, e.name === 'NotAllowedError' ? 'Berbagi layar dibatalkan.' : e.message); }
    perbarui();
  };
  if (u.wajib_kamera) tandai('kamera', null, 'Belum diizinkan');
  if (u.wajib_layar) tandai('layar', null, 'Belum dibagikan');
  token.oninput = perbarui; setuju.onchange = perbarui;

  tMulai.onclick = async () => {
    pesan.textContent = ''; tMulai.disabled = true;
    try {
      await pengawas.masukLayarPenuh();
      const r = await rpc('mulai_ujian', { p_exam: u.id, p_token: lanjut ? '' : token.value, p_device: PERANGKAT });
      await layarUjian(r.session_id, pengawas);
    } catch (e) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
      if (e.kode === 'PERANGKAT_LAIN') return layarBlokir('Perangkat berbeda', e.message);
      if (e.kode === 'SELESAI') { toast(e.message, 'info', 6000); pengawas.berhenti(); return layarDaftar(); }
      pesan.textContent = e.message || 'Gagal memulai ujian';
      perbarui();
    }
  };

  app.replaceChildren(
    kepala(h('span.identitas', profil.nama, h('small', profil.nim))),
    h('main.halaman.halaman-sempit',
      h('button.tautan', { onclick: () => { pengawas.berhenti(); layarDaftar(); } }, '‹ Kembali ke daftar ujian'),
      h('h1', u.judul),
      h('p.redup', `Durasi ${u.durasi_menit} menit. Waktu berjalan sejak Anda menekan tombol mulai dan tidak berhenti walau koneksi putus.`),
      h('section.kartu',
        h('h2', 'Tata tertib'),
        h('div.tata-tertib', { html: teksKaya(u.tata_tertib || 'Kerjakan secara mandiri dan jujur.') }),
        h('div.privasi', h('strong', 'Pengawasan selama ujian. '),
          [u.wajib_kamera && 'foto kamera', u.wajib_layar && 'tangkapan layar'].filter(Boolean).join(' dan ') || 'Aktivitas',
          ` diambil secara berkala dan saat terjadi pelanggaran, lalu disimpan untuk diperiksa dosen. Keluar dari layar penuh, pindah tab, atau membuka aplikasi lain tercatat sebagai pelanggaran. Setelah ${u.batas_pelanggaran} pelanggaran, sesi Anda dihentikan sementara sampai pengawas membukanya.`)),
      h('section.kartu', h('h2', 'Pemeriksaan perangkat'), daftarCek),
      h('section.kartu',
        lanjut ? h('p', 'Anda melanjutkan sesi yang sudah berjalan. Token tidak diperlukan.') :
          h('div.form-kolom', h('label', { for: 'f-token' }, 'Token ujian'), token),
        h('label.centang', setuju, ' Saya sudah membaca tata tertib dan bersedia diawasi melalui kamera dan layar selama ujian.'),
        pesan, tMulai)));
  perbarui();
}

// ====================================================================== ujian
async function layarUjian(sid, pengawas) {
  let data;
  try { data = await rpc('ambil_soal', { p_session: sid, p_device: PERANGKAT }); }
  catch (e) { pengawas.berhenti(); if (e.kode === 'PERANGKAT_LAIN') return layarBlokir('Perangkat berbeda', e.message); throw e; }
  if (data.status === 'selesai') { pengawas.berhenti(); return layarSelesai(data); }

  const soal = data.soal;
  const KJ = 'ujian-jwb-' + sid, KR = 'ujian-ragu-' + sid;
  const jawaban = { ...data.jawaban };
  // jawaban lokal yang belum sempat terkirim (mis. koneksi putus sebelum reload)
  const lokal = bacaLokal(KJ, {});
  const tertunda = new Map();
  for (const [qid, v] of Object.entries(lokal)) {
    if (JSON.stringify(v) !== JSON.stringify(jawaban[qid] ?? null) && soal.some(s => s.id === qid)) { jawaban[qid] = v; tertunda.set(qid, v); }
  }
  const ragu = new Set(bacaLokal(KR, []));
  let aktif = 0;
  let status = data.status;
  let sisaAkhir = performance.now() + data.sisa_detik * 1000;
  let selesai = false;

  // ---------- pengawas
  pengawas.ujian = data.ujian;
  pengawas.kanal = 'ujian-' + sid;
  pengawas.lapor = async (jenis, detail) => {
    const r = await rpc('catat_pelanggaran', { p_session: sid, p_device: PERANGKAT, p_jenis: jenis, p_detail: detail });
    if (r.dihitung) {
      perbaruiPelanggaran(r.pelanggaran, r.batas);
      toast(`${NAMA_PELANGGARAN[jenis] || 'Pelanggaran'} tercatat (${r.pelanggaran}/${r.batas}).`, 'bahaya', 6000);
    }
    if (r.status !== status) gantiStatus(r.status);
    return r;
  };
  pengawas.unggah = async (jenis, blob, vid) => {
    const path = `${data.ujian.id}/${data.profil.user_id}/${sid}/${Date.now()}-${jenis}${vid ? '-p' + vid : ''}.jpg`;
    const { error } = await sb.storage.from('bukti').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) return;
    await rpc('catat_bukti', { p_session: sid, p_device: PERANGKAT, p_jenis: jenis, p_path: path, p_violation: vid || null }).catch(() => { });
  };
  let tKirimKondisi;
  pengawas.onHalangan = daftar => {
    tampilHalangan(daftar);
    clearTimeout(tKirimKondisi);
    tKirimKondisi = setTimeout(() => { try { detak(); } catch { } }, 1000); // kondisi terbaru langsung terlihat pengawas
  };

  // ---------- kerangka
  const elTimer = h('span.timer', { role: 'timer', 'aria-live': 'off' }, '--:--');
  const elSimpan = h('span.status-simpan', 'Tersimpan');
  const elPelanggaran = h('span.lencana');
  const vKamera = h('video.kamera-mini', { muted: true, playsInline: true, autoplay: true, 'aria-label': 'Pratinjau kamera Anda' });
  const kisi = h('div.ljk-kisi', { role: 'navigation', 'aria-label': 'Nomor soal' });
  const panggung = h('div.soal-panggung');
  const nomorSoal = h('div.soal-nomor');
  const tRagu = h('button.btn.btn-garis', { type: 'button' });
  const tSebelum = h('button.btn.btn-garis', { type: 'button' }, '‹ Sebelumnya');
  const tBerikut = h('button.btn.btn-utama', { type: 'button' }, 'Berikutnya ›');
  const tKumpul = h('button.btn.btn-bahaya.btn-penuh', { type: 'button' }, 'Kumpulkan ujian');
  const tirai = h('div.tirai', { hidden: true });
  const watermark = h('div.watermark', { 'aria-hidden': 'true' });

  app.replaceChildren(
    h('div.ujian',
      h('header.ujian-kepala',
        h('div.ujian-judul', h('strong', data.ujian.judul), h('span.redup', data.profil.nama + ' — ' + data.profil.nim)),
        h('div.ujian-status', elSimpan, elPelanggaran, elTimer)),
      h('div.ujian-badan',
        h('main.ujian-utama',
          h('div.soal-lembar', nomorSoal, panggung, watermark),
          h('div.soal-nav', tSebelum, tRagu, tBerikut)),
        h('aside.ujian-samping',
          h('div.kartu.ljk', h('h2.ljk-judul', 'Lembar jawaban'), kisi,
            h('ul.ljk-keterangan',
              h('li', h('i.ljk-contoh.terjawab'), 'Terjawab'),
              h('li', h('i.ljk-contoh.ragu'), 'Ragu-ragu'),
              h('li', h('i.ljk-contoh'), 'Belum'))),
          data.ujian.wajib_kamera ? h('div.kartu.kamera-kartu', vKamera, h('p.redup.kecil', 'Kamera Anda sedang direkam berkala.')) : null,
          tKumpul))),
    tirai);
  pengawas.pasangPratinjau(vKamera);
  pasangWatermark(watermark, `${data.profil.nim} ${data.profil.nama}`);

  // ---------- nomor & navigasi
  const tombolNo = soal.map((s, i) => h('button.ljk-no', { type: 'button', onclick: () => buka(i), 'aria-label': 'Soal ' + (i + 1) }, i + 1));
  kisi.append(...tombolNo);
  const perbaruiKisi = () => soal.forEach((s, i) => {
    const b = tombolNo[i];
    b.classList.toggle('terjawab', terisi(jawaban[s.id]));
    b.classList.toggle('ragu', ragu.has(s.id));
    b.classList.toggle('aktif', i === aktif);
    b.setAttribute('aria-current', i === aktif ? 'true' : 'false');
  });
  function buka(i) {
    aktif = Math.max(0, Math.min(soal.length - 1, i));
    const s = soal[aktif];
    nomorSoal.replaceChildren(h('span.soal-no', 'Soal ' + (aktif + 1)), h('span.redup', ' dari ' + soal.length + ' · ' + NAMA_TIPE[s.tipe] + (Number(s.bobot) !== 1 ? ` · bobot ${Number(s.bobot)}` : '')));
    renderSoal(panggung, s, jawaban[s.id], v => ubahJawaban(s.id, v), { baca: status !== 'aktif' });
    tRagu.textContent = ragu.has(s.id) ? 'Hapus tanda ragu' : 'Tandai ragu-ragu';
    tRagu.classList.toggle('btn-awas', ragu.has(s.id));
    tSebelum.disabled = aktif === 0;
    tBerikut.textContent = aktif === soal.length - 1 ? 'Selesai' : 'Berikutnya ›';
    perbaruiKisi();
    panggung.scrollTop = 0;
    panggung.focus({ preventScroll: true });
  }
  tSebelum.onclick = () => buka(aktif - 1);
  tBerikut.onclick = () => aktif === soal.length - 1 ? kumpul() : buka(aktif + 1);
  tRagu.onclick = () => {
    const id = soal[aktif].id;
    ragu.has(id) ? ragu.delete(id) : ragu.add(id);
    simpanLokal(KR, [...ragu]); buka(aktif);
  };
  tKumpul.onclick = () => kumpul();

  // ---------- simpan otomatis
  let timerSimpan = null, sedangKirim = false;
  function ubahJawaban(qid, v) {
    jawaban[qid] = v;
    tertunda.set(qid, v);
    simpanLokal(KJ, Object.fromEntries(Object.entries(jawaban)));
    elSimpan.textContent = 'Menyimpan…'; elSimpan.className = 'status-simpan menyimpan';
    perbaruiKisi();
    // render ulang hanya untuk tipe yang tampilannya bergantung pada jawaban
    if (['pg', 'pgk', 'bs'].includes(soal[aktif].tipe)) renderSoal(panggung, soal[aktif], jawaban[qid], x => ubahJawaban(qid, x), { baca: status !== 'aktif' });
    clearTimeout(timerSimpan); timerSimpan = setTimeout(kirim, 500);
  }
  async function kirim() {
    if (sedangKirim || !tertunda.size) return;
    sedangKirim = true;
    try {
      while (tertunda.size) {
        const [qid, v] = tertunda.entries().next().value;
        await rpc('simpan_jawaban', { p_session: sid, p_device: PERANGKAT, p_soal: qid, p_jawaban: v ?? null });
        if (JSON.stringify(tertunda.get(qid)) === JSON.stringify(v)) tertunda.delete(qid);
      }
      elSimpan.textContent = 'Tersimpan'; elSimpan.className = 'status-simpan';
    } catch (e) {
      if (e.kode === 'SELESAI') return akhiri();
      if (e.kode === 'TERKUNCI') { gantiStatus('terkunci'); }
      else if (e.kode === 'PERANGKAT_LAIN') { pengawas.berhenti(); return layarBlokir('Perangkat berbeda', e.message); }
      elSimpan.textContent = e.kode === 'JARINGAN' ? 'Belum tersimpan — menunggu koneksi' : 'Belum tersimpan';
      elSimpan.className = 'status-simpan gagal';
      setTimeout(kirim, 3000);
    } finally { sedangKirim = false; }
  }

  // ---------- waktu & detak
  const tik = setInterval(() => {
    const sisa = (sisaAkhir - performance.now()) / 1000;
    elTimer.textContent = durasi(sisa);
    elTimer.classList.toggle('timer-kritis', sisa <= 300);
    if (sisa <= 0 && !selesai) kumpul(true);
  }, 250);
  const detak = async () => {
    try {
      const r = await rpc('detak', { p_session: sid, p_device: PERANGKAT, p_klien: pengawas.statusKlien() });
      sisaAkhir = performance.now() + r.sisa_detik * 1000;
      perbaruiPelanggaran(r.pelanggaran, r.batas);
      if (r.status !== status) gantiStatus(r.status);
      if (r.status === 'selesai') return akhiri(r);
      if (tertunda.size) kirim();
    } catch (e) {
      if (e.kode === 'PERANGKAT_LAIN') { pengawas.berhenti(); return layarBlokir('Perangkat berbeda', e.message); }
    }
  };
  const tDetak = setInterval(detak, 20000);
  window.addEventListener('online', detak);

  function perbaruiPelanggaran(n, batas) {
    elPelanggaran.textContent = `Pelanggaran ${n}/${batas}`;
    elPelanggaran.className = 'lencana ' + (n === 0 ? '' : n >= batas - 1 ? 'lencana-bahaya' : 'lencana-awas');
  }
  perbaruiPelanggaran(data.pelanggaran, data.ujian.batas_pelanggaran);

  function gantiStatus(baru) {
    status = baru;
    if (baru === 'selesai') return akhiri();
    buka(aktif);
    tampilHalangan(pengawas.halangan());
  }

  // ---------- tirai: menutupi soal bila syarat tidak terpenuhi
  function tampilHalangan(daftar) {
    if (selesai) return;
    if (status === 'terkunci') {
      tirai.hidden = false;
      tirai.replaceChildren(h('div.tirai-kotak',
        h('h2', 'Sesi Anda dihentikan sementara'),
        h('p', 'Batas pelanggaran tercapai. Hubungi pengawas untuk membuka sesi. Waktu ujian tetap berjalan.'),
        h('button.btn.btn-utama', { onclick: detak }, 'Periksa status')));
      return;
    }
    if (!daftar.length) { tirai.hidden = true; return; }
    const aksi = [];
    if (daftar.includes('tab_ganda')) aksi.push(h('p', 'Ujian ini terbuka di tab lain. Tutup tab ini dan kerjakan di satu tab saja.'));
    if (daftar.includes('layar_ganda')) aksi.push(h('p', 'Cabut monitor tambahan untuk melanjutkan.'));
    if (daftar.includes('kamera')) aksi.push(h('button.btn.btn-utama', { onclick: async () => { try { await pengawas.mintaKamera(); pengawas.pasangPratinjau(vKamera); } catch (e) { toast('Kamera tidak dapat dibuka: ' + e.message, 'bahaya'); } } }, 'Nyalakan kamera'));
    if (daftar.includes('layar')) aksi.push(h('button.btn.btn-utama', { onclick: async () => { try { await pengawas.mintaLayar(); } catch (e) { toast(e.message, 'bahaya'); } } }, 'Bagikan seluruh layar'));
    if (daftar.includes('layar_penuh')) aksi.push(h('button.btn.btn-utama', { onclick: () => pengawas.masukLayarPenuh().catch(() => { }) }, 'Kembali ke layar penuh'));
    tirai.hidden = false;
    tirai.replaceChildren(h('div.tirai-kotak', h('h2', 'Soal disembunyikan'),
      h('p', 'Penuhi syarat berikut untuk melanjutkan. Waktu tetap berjalan.'), h('div.tirai-aksi', aksi)));
  }

  // ---------- kumpul
  async function kumpul(otomatis = false) {
    if (selesai) return;
    if (!otomatis) {
      const belum = soal.filter(s => !terisi(jawaban[s.id])).length;
      const ok = await konfirmasi('Kumpulkan ujian?', h('div',
        h('p', `Terjawab ${soal.length - belum} dari ${soal.length} soal.`),
        belum ? h('p.teks-bahaya', `${belum} soal belum dijawab.`) : null,
        ragu.size ? h('p.teks-awas', `${ragu.size} soal masih ditandai ragu-ragu.`) : null,
        h('p', 'Setelah dikumpulkan, jawaban tidak bisa diubah.')), 'Kumpulkan', 'bahaya');
      if (!ok || selesai) return;
    }
    selesai = true;
    clearTimeout(timerSimpan);
    tirai.hidden = false;
    tirai.replaceChildren(h('div.tirai-kotak', h('h2', 'Mengumpulkan…'), h('p', 'Jangan tutup halaman ini.')));
    for (let i = 0; i < 5 && tertunda.size; i++) { sedangKirim = false; await kirim().catch(() => { }); if (tertunda.size) await tunda(1500); }
    let r = null;
    for (let i = 0; i < 5; i++) {
      try { r = await rpc('kumpulkan_ujian', { p_session: sid, p_device: PERANGKAT }); break; }
      catch (e) { if (e.kode === 'SELESAI') break; await tunda(2000); }
    }
    akhiri(r);
  }
  function akhiri(r) {
    selesai = true;
    clearInterval(tik); clearInterval(tDetak);
    window.removeEventListener('online', detak);
    pengawas.berhenti();
    try { localStorage.removeItem(KJ); localStorage.removeItem(KR); } catch { }
    layarSelesai(r || {});
  }

  pengawas.mulai();
  buka(0);
  if (tertunda.size) kirim();
  detak();
  tampilHalangan(pengawas.halangan());
  window.onbeforeunload = ev => { if (!selesai) { ev.preventDefault(); ev.returnValue = ''; } };
}

function pasangWatermark(el, teks) {
  const c = document.createElement('canvas');
  c.width = 420; c.height = 220;
  const x = c.getContext('2d');
  x.translate(210, 110); x.rotate(-0.35);
  x.font = '600 18px "Atkinson Hyperlegible", sans-serif';
  x.fillStyle = 'rgba(34,37,42,0.07)'; x.textAlign = 'center';
  x.fillText(teks, 0, 0);
  x.fillText(new Date().toLocaleDateString('id-ID'), 0, 26);
  el.style.backgroundImage = `url(${c.toDataURL()})`;
}

// ====================================================================== selesai & blokir
function layarSelesai(r) {
  window.onbeforeunload = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  app.replaceChildren(h('div.halaman-tengah', h('div.kartu.selesai',
    h('div.selesai-tanda', { 'aria-hidden': 'true' }),
    h('h1', 'Ujian sudah dikumpulkan'),
    r?.jumlah_soal ? h('p', `Terjawab ${r.terjawab} dari ${r.jumlah_soal} soal.`) : null,
    r?.skor != null ? h('p.nilai-besar', 'Nilai Anda ', h('strong', Number(r.skor).toLocaleString('id-ID'))) : h('p.redup', 'Nilai akan diumumkan oleh dosen.'),
    h('p.redup', 'Kamera dan berbagi layar sudah dimatikan. Anda boleh menutup halaman ini.'),
    h('button.btn.btn-garis', { onclick: layarDaftar }, 'Kembali ke daftar ujian'))));
}

function layarBlokir(judul, pesan) {
  window.onbeforeunload = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  app.replaceChildren(h('div.halaman-tengah', h('div.kartu',
    h('h1', judul), h('p', pesan),
    h('button.btn.btn-garis', { onclick: layarDaftar }, 'Kembali ke daftar ujian'))));
}

mulai();
