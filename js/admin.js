import {
  sb, rpc, h, $, toast, dialog, konfirmasi, tanggal, jam, durasi, relatif, layarLogin, rapikanUrl,
  konfigTerisi, layarKonfigKosong, teksKaya,
} from './common.js';
import { renderSoal, NAMA_TIPE, ringkasJawaban } from './soal.js';
import { NAMA_PELANGGARAN } from './pengawas.js';
import { CONTOH_SOAL } from './contoh-soal.js';
import { NAMA_APLIKASI } from './config.js';

const app = $('#app');
let profil = null;
let daftarUjian = [];
let jumlahSoal = {};
let pilihan = null;    // id ujian terpilih
let tab = 'pengaturan';
let bersihkan = [];    // fungsi pembersih saat pindah tab (realtime, interval)

const TAB = [
  ['pengaturan', 'Pengaturan'],
  ['soal', 'Soal'],
  ['peserta', 'Peserta'],
  ['pantau', 'Pemantauan'],
  ['hasil', 'Hasil'],
];

// ====================================================================== awal
async function mulai() {
  if (!konfigTerisi()) return layarKonfigKosong(app);
  const { data } = await sb.auth.getSession();
  if (!data.session) return layarLogin(app, { judul: 'Admin ujian', sub: NAMA_APLIKASI });
  rapikanUrl();
  setelahMasuk();
}

async function setelahMasuk() {
  try { profil = await rpc('saya'); } catch (e) { return toast(e.message, 'bahaya'); }
  if (!profil || profil.role !== 'admin') {
    const { data } = await sb.auth.getUser();
    app.replaceChildren(h('div.halaman-tengah', h('div.kartu',
      h('h1', 'Akun ini bukan admin'),
      h('p', 'Masuk sebagai: ', h('strong', data.user?.email || '–')),
      h('p', 'Untuk menjadikan akun ini admin, isi dulu identitas di halaman peserta, lalu jalankan perintah berikut di Supabase > SQL Editor:'),
      h('pre.kode', `update public.profiles set role = 'admin'\nwhere id = '${data.user?.id}';`),
      h('div.baris-aksi',
        h('a.btn.btn-garis', { href: './' }, 'Ke halaman peserta'),
        h('button.btn.btn-utama', { onclick: () => location.reload() }, 'Sudah, muat ulang'),
        h('button.tautan', { onclick: keluar }, 'Keluar')))));
    return;
  }
  await muatUjian();
  gambar();
}

async function keluar() { await sb.auth.signOut(); location.reload(); }

async function muatUjian() {
  const { data, error } = await sb.from('exams').select('*').order('mulai', { ascending: false });
  if (error) { toast(error.message, 'bahaya'); return; }
  daftarUjian = data;
  jumlahSoal = await rpc('admin_jumlah_soal').catch(() => ({}));
  if (pilihan && !daftarUjian.some(u => u.id === pilihan)) pilihan = null;
}

const ujianIni = () => daftarUjian.find(u => u.id === pilihan);

// ====================================================================== tata letak
function gambar() {
  bersihkan.forEach(f => f()); bersihkan = [];
  const sisi = h('nav.admin-sisi', { 'aria-label': 'Daftar ujian' },
    h('button.btn.btn-utama.btn-penuh', { onclick: ujianBaru }, 'Ujian baru'),
    h('ul.admin-ujian', daftarUjian.map(u => h('li', h('button.admin-ujian-item' + (u.id === pilihan ? '.aktif' : ''), {
      onclick: () => { pilihan = u.id; tab = tab === 'akun' ? 'pengaturan' : tab; gambar(); },
    }, h('strong', u.judul), h('span.redup.kecil', tanggal(u.mulai)),
      h('span.kecil', u.terbit ? h('span.titik.titik-aman') : h('span.titik'), u.terbit ? 'Terbit' : 'Draf', ' · ', (jumlahSoal[u.id] || 0) + ' soal'))))),
    daftarUjian.length ? null : h('p.redup.kecil', 'Belum ada ujian.'),
    h('button.admin-ujian-item' + (tab === 'akun' ? '.aktif' : ''), { onclick: () => { tab = 'akun'; pilihan = null; gambar(); } }, h('strong', 'Akun peserta'), h('span.redup.kecil', 'NIM, nama, dan peran')));

  const utama = h('main.admin-utama');
  app.replaceChildren(
    h('header.kepala', h('div.kepala-merek', h('span.merek-tanda', { 'aria-hidden': 'true' }), NAMA_APLIKASI, h('span.lencana', 'Admin')),
      h('div.kepala-kanan', h('span.identitas', profil.nama, h('small', profil.nim)), h('button.btn.btn-garis.btn-kecil', { onclick: keluar }, 'Keluar'))),
    h('div.admin', sisi, utama));

  if (tab === 'akun') return halamanAkun(utama);
  const u = ujianIni();
  if (!u) {
    utama.append(h('div.kosong', h('h1', 'Pilih ujian di sebelah kiri'), h('p.redup', 'atau buat ujian baru untuk mulai menyusun soal.')));
    return;
  }
  const isi = h('div.tab-isi');
  utama.append(
    h('div.halaman-judul', h('div', h('h1', u.judul), h('p.redup', tanggal(u.mulai), ' sampai ', tanggal(u.selesai), ' · token ', h('code', u.token)))),
    h('div.tab-baris', { role: 'tablist' }, TAB.map(([k, l]) => h('button.tab' + (tab === k ? '.aktif' : ''), {
      role: 'tab', 'aria-selected': String(tab === k), onclick: () => { tab = k; gambar(); },
    }, l))),
    isi);
  ({ pengaturan: tabPengaturan, soal: tabSoal, peserta: tabPeserta, pantau: tabPantau, hasil: tabHasil }[tab] || tabPengaturan)(isi, u);
}

// ====================================================================== pengaturan
const keInput = iso => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const dariInput = v => new Date(v).toISOString();
const tokenAcak = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');

function ujianBaru() {
  const m = new Date(); m.setMinutes(0, 0, 0); m.setHours(m.getHours() + 1);
  const s = new Date(m.getTime() + 3 * 3600e3);
  pilihan = 'baru'; tab = 'pengaturan';
  daftarUjian = daftarUjian.filter(u => u.id !== 'baru');
  daftarUjian.unshift({
    id: 'baru', judul: 'Ujian baru', deskripsi: '', tata_tertib: TATA_TERTIB_BAKU, mulai: m.toISOString(), selesai: s.toISOString(),
    durasi_menit: 90, token: tokenAcak(), terbit: false, acak_soal: true, acak_opsi: true, jumlah_soal: null,
    batas_pelanggaran: 3, aksi_pelanggaran: 'kunci', wajib_kamera: true, wajib_layar: true, interval_bukti_detik: 60,
    tampilkan_nilai: false, pakai_whitelist: false,
  });
  gambar();
}

const TATA_TERTIB_BAKU = `1. Kerjakan sendiri tanpa bantuan orang lain, catatan, internet, atau AI.
2. Gunakan laptop/PC dengan Google Chrome atau Microsoft Edge, satu monitor saja.
3. Tetap di layar penuh. Jangan pindah tab, jendela, atau aplikasi.
4. Pastikan wajah terlihat jelas di kamera dan ruangan cukup terang.
5. Jawaban tersimpan otomatis. Bila koneksi putus, buka kembali halaman ujian di perangkat yang sama.`;

function tabPengaturan(isi, u) {
  const f = {};
  const baris = (label, el, bantuan) => h('div.form-baris', h('label', { for: el.id }, label), el, bantuan ? h('p.bantuan', bantuan) : null);
  const input = (k, attrs = {}) => (f[k] = h('input#p-' + k, { value: u[k] ?? '', ...attrs }));
  const cek = (k, label, bantuan) => h('label.centang', (f[k] = h('input', { type: 'checkbox', checked: !!u[k] })), ' ', label, bantuan ? h('span.bantuan', ' — ' + bantuan) : null);
  f.deskripsi = h('textarea#p-deskripsi', { rows: 2, value: u.deskripsi });
  f.tata_tertib = h('textarea#p-tata_tertib', { rows: 6, value: u.tata_tertib });
  f.mulai = h('input#p-mulai', { type: 'datetime-local', value: keInput(u.mulai) });
  f.selesai = h('input#p-selesai', { type: 'datetime-local', value: keInput(u.selesai) });
  f.aksi_pelanggaran = h('select#p-aksi', h('option', { value: 'kunci', selected: u.aksi_pelanggaran === 'kunci' }, 'Kunci sesi sampai dibuka pengawas'),
    h('option', { value: 'kumpul', selected: u.aksi_pelanggaran === 'kumpul' }, 'Kumpulkan otomatis'));
  const pesan = h('p.form-pesan', { role: 'alert' });

  const form = h('form.kartu.form-grid',
    h('fieldset', h('legend', 'Identitas ujian'),
      baris('Judul', input('judul', { required: true, maxLength: 200 })),
      baris('Deskripsi singkat', f.deskripsi),
      baris('Tata tertib (ditampilkan sebelum mulai)', f.tata_tertib)),
    h('fieldset', h('legend', 'Jadwal & akses'),
      h('div.form-dua', baris('Dibuka', f.mulai), baris('Ditutup', f.selesai)),
      h('div.form-dua',
        baris('Durasi (menit)', input('durasi_menit', { type: 'number', min: 1, max: 600 }), 'Waktu dihitung per peserta sejak ia mulai, maksimal sampai jam ditutup.'),
        h('div.form-baris', h('label', { for: 'p-token' }, 'Token'),
          h('div.input-grup', input('token', { maxLength: 32, autocomplete: 'off' }),
            h('button.btn.btn-garis', { type: 'button', onclick: () => { f.token.value = tokenAcak(); } }, 'Acak')),
          h('p.bantuan', 'Umumkan saat ujian dimulai.'))),
      cek('terbit', 'Terbitkan', 'ujian muncul di daftar peserta'),
      cek('pakai_whitelist', 'Batasi ke daftar NIM', 'atur di tab Peserta')),
    h('fieldset', h('legend', 'Soal'),
      cek('acak_soal', 'Acak urutan soal per peserta'),
      cek('acak_opsi', 'Acak urutan opsi', 'soal mengurutkan & menjodohkan selalu diacak'),
      baris('Jumlah soal yang diambil', input('jumlah_soal', { type: 'number', min: 1, placeholder: 'Semua' }), 'Kosongkan untuk memakai semua soal. Bila diisi dan acak soal aktif, setiap peserta mendapat soal acak dari bank.'),
      cek('tampilkan_nilai', 'Tampilkan nilai ke peserta setelah selesai')),
    h('fieldset', h('legend', 'Pengawasan'),
      cek('wajib_kamera', 'Wajib kamera'),
      cek('wajib_layar', 'Wajib berbagi seluruh layar'),
      h('div.form-dua',
        baris('Interval bukti (detik)', input('interval_bukti_detik', { type: 'number', min: 15, max: 600 }), 'Foto kamera & tangkapan layar diambil sekitar sekali per interval ini.'),
        baris('Batas pelanggaran', input('batas_pelanggaran', { type: 'number', min: 1, max: 100 }))),
      baris('Jika batas tercapai', f.aksi_pelanggaran)),
    pesan,
    h('div.baris-aksi',
      h('button.btn.btn-utama', { type: 'submit' }, u.id === 'baru' ? 'Buat ujian' : 'Simpan pengaturan'),
      u.id !== 'baru' ? h('button.btn.btn-garis', { type: 'button', onclick: () => duplikat(u) }, 'Duplikat ujian') : null,
      u.id !== 'baru' ? h('button.btn.btn-bahaya-garis', { type: 'button', onclick: () => hapusUjian(u) }, 'Hapus ujian') : null));

  form.onsubmit = async ev => {
    ev.preventDefault(); pesan.textContent = '';
    const v = {
      judul: f.judul.value.trim(), deskripsi: f.deskripsi.value, tata_tertib: f.tata_tertib.value,
      mulai: dariInput(f.mulai.value), selesai: dariInput(f.selesai.value),
      durasi_menit: +f.durasi_menit.value, token: f.token.value.trim().toUpperCase(),
      terbit: f.terbit.checked, pakai_whitelist: f.pakai_whitelist.checked, acak_soal: f.acak_soal.checked,
      acak_opsi: f.acak_opsi.checked, jumlah_soal: f.jumlah_soal.value ? +f.jumlah_soal.value : null,
      tampilkan_nilai: f.tampilkan_nilai.checked, wajib_kamera: f.wajib_kamera.checked, wajib_layar: f.wajib_layar.checked,
      interval_bukti_detik: +f.interval_bukti_detik.value, batas_pelanggaran: +f.batas_pelanggaran.value,
      aksi_pelanggaran: f.aksi_pelanggaran.value,
    };
    if (v.judul.length < 2) return (pesan.textContent = 'Judul terlalu pendek.');
    if (new Date(v.selesai) <= new Date(v.mulai)) return (pesan.textContent = 'Waktu ditutup harus setelah waktu dibuka.');
    if (v.token.length < 4) return (pesan.textContent = 'Token minimal 4 karakter.');
    if (v.terbit && u.id !== 'baru' && !jumlahSoal[u.id]) return (pesan.textContent = 'Tambahkan soal sebelum menerbitkan ujian.');
    const q = u.id === 'baru' ? sb.from('exams').insert(v).select().single() : sb.from('exams').update(v).eq('id', u.id).select().single();
    const { data, error } = await q;
    if (error) return (pesan.textContent = error.message);
    toast(u.id === 'baru' ? 'Ujian dibuat. Lanjutkan dengan menambah soal.' : 'Pengaturan disimpan.', 'ok');
    pilihan = data.id;
    if (u.id === 'baru') tab = 'soal';
    await muatUjian(); gambar();
  };
  isi.append(form);
}

async function duplikat(u) {
  const { id, dibuat, ...salin } = u;
  salin.judul = u.judul + ' (salinan)'; salin.terbit = false; salin.token = tokenAcak();
  const { data, error } = await sb.from('exams').insert(salin).select().single();
  if (error) return toast(error.message, 'bahaya');
  const soal = await rpc('admin_soal_list', { p_exam: u.id });
  if (soal.length) await rpc('admin_soal_import', { p_exam: data.id, p_daftar: soal.map(bersihSoal), p_ganti: false });
  const { data: wl } = await sb.from('exam_whitelist').select('nim').eq('exam_id', u.id);
  if (wl?.length) await sb.from('exam_whitelist').insert(wl.map(w => ({ exam_id: data.id, nim: w.nim })));
  toast('Ujian diduplikat beserta soalnya.', 'ok');
  pilihan = data.id; await muatUjian(); gambar();
}

async function hapusUjian(u) {
  const ketik = h('input', { autocomplete: 'off' });
  const ok = await dialog({ judul: 'Hapus ujian?', isi: h('div.form-kolom',
    h('p', 'Semua soal, sesi, jawaban, nilai, dan catatan pelanggaran ujian ini akan terhapus permanen. Hapus dulu berkas bukti di tab Hasil bila ingin mengosongkan Storage.'),
    h('label', 'Ketik HAPUS untuk melanjutkan'), ketik),
    tombol: [{ teks: 'Batal', nilai: false }, { teks: 'Hapus permanen', gaya: 'bahaya', nilai: () => ketik.value === 'HAPUS' }] });
  if (!ok) return;
  const { error } = await sb.from('exams').delete().eq('id', u.id);
  if (error) return toast(error.message, 'bahaya');
  toast('Ujian dihapus.', 'ok'); pilihan = null; await muatUjian(); gambar();
}

// ====================================================================== soal
const bersihSoal = s => ({ tipe: s.tipe, konten: s.konten, kunci: s.kunci, bobot: Number(s.bobot), parsial: s.parsial });

async function tabSoal(isi, u) {
  if (u.id === 'baru') { isi.append(h('p.redup', 'Simpan ujian terlebih dahulu.')); return; }
  isi.append(h('p.redup', 'Memuat soal…'));
  let soal;
  try { soal = await rpc('admin_soal_list', { p_exam: u.id }); } catch (e) { isi.replaceChildren(h('p.teks-bahaya', e.message)); return; }
  const pilihTipe = h('select', { 'aria-label': 'Tipe soal baru' }, Object.entries(NAMA_TIPE).map(([k, v]) => h('option', { value: k }, v)));
  const totalBobot = soal.reduce((a, s) => a + Number(s.bobot), 0);

  const daftar = h('ol.soal-daftar');
  soal.forEach((s, i) => daftar.append(h('li.soal-baris',
    h('span.soal-baris-no', i + 1),
    h('div.soal-baris-isi', h('span.lencana', NAMA_TIPE[s.tipe]), ' ', h('span', ringkasTeks(s.konten.teks)),
      h('span.redup.kecil', ` · bobot ${Number(s.bobot)}`)),
    h('div.soal-baris-aksi',
      h('button.btn-ikon', { 'aria-label': 'Naikkan', disabled: i === 0, onclick: () => pindah(i, i - 1) }, '▲'),
      h('button.btn-ikon', { 'aria-label': 'Turunkan', disabled: i === soal.length - 1, onclick: () => pindah(i, i + 1) }, '▼'),
      h('button.btn.btn-garis.btn-kecil', { onclick: () => editorSoal(u, s, soal.length) }, 'Ubah'),
      h('button.btn.btn-garis.btn-kecil', { onclick: async () => { await rpc('admin_soal_simpan', { p_exam: u.id, p_soal: bersihSoal(s) }); toast('Soal diduplikat.', 'ok'); await muatUjian(); gambar(); } }, 'Duplikat'),
      h('button.btn.btn-bahaya-garis.btn-kecil', { onclick: async () => {
        if (!await konfirmasi('Hapus soal ' + (i + 1) + '?', 'Soal yang dihapus tidak ikut dinilai, termasuk pada sesi yang sudah berjalan.', 'Hapus', 'bahaya')) return;
        await rpc('admin_soal_hapus', { p_id: s.id }); await muatUjian(); gambar();
      } }, 'Hapus')))));

  async function pindah(a, b) {
    const ids = soal.map(s => s.id); [ids[a], ids[b]] = [ids[b], ids[a]];
    await rpc('admin_soal_urutkan', { p_exam: u.id, p_ids: ids }); gambar();
  }

  isi.replaceChildren(
    h('div.alat',
      h('div.input-grup', pilihTipe, h('button.btn.btn-utama', { onclick: () => editorSoal(u, { tipe: pilihTipe.value }, soal.length) }, 'Tambah soal')),
      h('div.alat-kanan',
        h('button.btn.btn-garis', { onclick: () => imporSoal(u) }, 'Impor JSON'),
        h('button.btn.btn-garis', { onclick: () => unduh(`soal-${slug(u.judul)}.json`, JSON.stringify(soal.map(bersihSoal), null, 2)), disabled: !soal.length }, 'Ekspor JSON'),
        h('button.btn.btn-garis', { onclick: () => pratinjauUjian(soal) , disabled: !soal.length }, 'Pratinjau sebagai peserta'))),
    h('p.redup', `${soal.length} soal · total bobot ${totalBobot}` + (u.jumlah_soal ? ` · peserta mendapat ${Math.min(u.jumlah_soal, soal.length)} soal` : '')),
    soal.length ? daftar : h('div.kosong', h('p', 'Belum ada soal.'), h('p.redup', 'Tambah soal satu per satu, atau impor bank soal JSON. ',
      h('button.tautan', { onclick: () => unduh('contoh-bank-soal.json', JSON.stringify(CONTOH_SOAL, null, 2)) }, 'Unduh contoh format JSON'))));
}

const ringkasTeks = t => { const s = String(t || '').replace(/\{\{[^}]+\}\}/g, '___').replace(/[`*]/g, ''); return s.length > 110 ? s.slice(0, 110) + '…' : s; };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function unduh(nama, isi, tipe = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([isi], { type: tipe })), download: nama });
  document.body.append(a); a.click(); a.remove();
}

async function imporSoal(u) {
  const berkas = h('input', { type: 'file', accept: '.json,application/json' });
  const teks = h('textarea', { rows: 10, placeholder: '[ { "tipe": "pg", "konten": {...}, "kunci": {...} } ]', spellcheck: false });
  const ganti = h('input', { type: 'checkbox' });
  berkas.onchange = async () => { teks.value = await berkas.files[0].text(); };
  const ok = await dialog({ judul: 'Impor bank soal', lebar: '720px', isi: h('div.form-kolom',
    h('p.redup', 'Pilih berkas JSON atau tempel isinya. ', h('button.tautan', { type: 'button', onclick: () => unduh('contoh-bank-soal.json', JSON.stringify(CONTOH_SOAL, null, 2)) }, 'Unduh contoh format')),
    berkas, teks, h('label.centang', ganti, ' Ganti semua soal yang ada')),
    tombol: [{ teks: 'Batal', nilai: false }, { teks: 'Impor', gaya: 'utama', nilai: true }] });
  if (!ok) return;
  let daftar;
  try { daftar = JSON.parse(teks.value); } catch { return toast('JSON tidak valid.', 'bahaya'); }
  if (!Array.isArray(daftar)) daftar = daftar.soal || [daftar];
  try {
    const n = await rpc('admin_soal_import', { p_exam: u.id, p_daftar: daftar, p_ganti: ganti.checked });
    toast(`${n} soal diimpor.`, 'ok'); await muatUjian(); gambar();
  } catch (e) { toast(e.message, 'bahaya', 8000); }
}

function pratinjauUjian(soal) {
  let i = 0;
  const panggung = h('div.soal-panggung');
  const no = h('p.soal-nomor');
  const tampil = () => {
    no.replaceChildren(h('span.soal-no', `Soal ${i + 1}`), h('span.redup', ` dari ${soal.length} · ${NAMA_TIPE[soal[i].tipe]}`));
    renderSoal(panggung, soal[i], undefined, () => { });
  };
  const tSeb = h('button.btn.btn-garis', { type: 'button', onclick: () => { i = Math.max(0, i - 1); tampil(); } }, '‹ Sebelumnya');
  const tBer = h('button.btn.btn-garis', { type: 'button', onclick: () => { i = Math.min(soal.length - 1, i + 1); tampil(); } }, 'Berikutnya ›');
  tampil();
  dialog({ judul: 'Pratinjau (tanpa pengacakan)', lebar: '860px', isi: h('div.soal-lembar', no, panggung, h('div.soal-nav', tSeb, tBer)) });
}

// ---------------------------------------------------------------- editor soal
const idBaru = (awal) => awal + Math.random().toString(36).slice(2, 7);

function keModel(s) {
  const k = s.konten || {}; const j = s.kunci?.jawaban;
  const m = { tipe: s.tipe, teks: k.teks || '', gambar: k.gambar || '', bobot: Number(s.bobot ?? 1), parsial: s.parsial ?? true };
  switch (s.tipe) {
    case 'pg': case 'pgk': {
      const benar = new Set(s.tipe === 'pg' ? [j] : (j || []));
      m.acak = k.acak !== false;
      m.opsi = (k.opsi || [{ id: 'a', teks: '' }, { id: 'b', teks: '' }, { id: 'c', teks: '' }, { id: 'd', teks: '' }])
        .map(o => ({ id: o.id, teks: o.teks || '', gambar: o.gambar || '', benar: benar.has(o.id) }));
      if (!s.kunci && m.opsi.length) m.opsi[0].benar = true;
      break;
    }
    case 'bs': m.pernyataan = (k.pernyataan || [{ id: 'p1', teks: '' }, { id: 'p2', teks: '' }]).map(p => ({ ...p, nilai: j?.[p.id] ?? true })); break;
    case 'jodoh': {
      const kanan = Object.fromEntries((k.kanan || []).map(x => [x.id, x]));
      const dipakai = new Set(Object.values(j || {}));
      m.pasangan = (k.kiri || [{ id: 'l1', teks: '' }, { id: 'l2', teks: '' }]).map((x, i) => ({
        kiri: { ...x }, kanan: { ...(kanan[j?.[x.id]] || { id: 'r' + (i + 1), teks: '' }) } }));
      m.pengecoh = (k.kanan || []).filter(x => !dipakai.has(x.id)).map(x => ({ ...x }));
      break;
    }
    case 'urut': {
      const peta = Object.fromEntries((k.item || []).map(x => [x.id, x]));
      m.item = j ? j.map(id => ({ ...peta[id] })) : [{ id: 'i1', teks: '' }, { id: 'i2', teks: '' }, { id: 'i3', teks: '' }];
      break;
    }
    case 'kelompok':
      m.kategori = (k.kategori || [{ id: 'k1', teks: '' }, { id: 'k2', teks: '' }]).map(x => ({ ...x }));
      m.item = (k.item || [{ id: 'x1', teks: '' }, { id: 'x2', teks: '' }]).map(x => ({ ...x, kat: j?.[x.id] || '' }));
      break;
    case 'isian':
      m.teks = k.teks || 'Tulis kalimat lalu sisipkan {{c1}} di bagian yang kosong.';
      m.celah = Object.fromEntries((k.celah || [{ id: 'c1', opsi: [{ id: 'o1', teks: '' }, { id: 'o2', teks: '' }] }]).map(c => [c.id,
        (c.opsi || []).map((o, i) => ({ ...o, benar: j ? j[c.id] === o.id : i === 0 }))]));
      break;
  }
  return m;
}

function dariModel(m) {
  const konten = { teks: m.teks };
  if (m.gambar) konten.gambar = m.gambar;
  let jawaban;
  const bersih = arr => arr.map(({ id, teks, gambar }) => (gambar ? { id, teks, gambar } : { id, teks }));
  switch (m.tipe) {
    case 'pg': case 'pgk':
      konten.opsi = bersih(m.opsi);
      if (!m.acak) konten.acak = false;
      jawaban = m.tipe === 'pg' ? m.opsi.find(o => o.benar)?.id : m.opsi.filter(o => o.benar).map(o => o.id);
      break;
    case 'bs':
      konten.pernyataan = bersih(m.pernyataan);
      jawaban = Object.fromEntries(m.pernyataan.map(p => [p.id, !!p.nilai]));
      break;
    case 'jodoh':
      konten.kiri = bersih(m.pasangan.map(p => p.kiri));
      konten.kanan = bersih([...m.pasangan.map(p => p.kanan), ...m.pengecoh]);
      jawaban = Object.fromEntries(m.pasangan.map(p => [p.kiri.id, p.kanan.id]));
      break;
    case 'urut':
      konten.item = bersih(m.item);
      jawaban = m.item.map(x => x.id);
      break;
    case 'kelompok':
      konten.kategori = bersih(m.kategori);
      konten.item = bersih(m.item);
      jawaban = Object.fromEntries(m.item.map(x => [x.id, x.kat]));
      break;
    case 'isian': {
      const dipakai = [...m.teks.matchAll(/\{\{([^}]+)\}\}/g)].map(x => x[1]);
      konten.celah = dipakai.filter(id => m.celah[id]).map(id => ({ id, opsi: bersih(m.celah[id]) }));
      jawaban = Object.fromEntries(konten.celah.map(c => [c.id, m.celah[c.id].find(o => o.benar)?.id]));
      break;
    }
  }
  return { tipe: m.tipe, konten, kunci: { jawaban }, bobot: m.bobot, parsial: m.parsial };
}

function editorSoal(u, s, jumlah) {
  const m = keModel(s);
  const latar = h('div.modal-latar');
  const kotak = h('div.modal.editor', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Editor soal' });
  const formEl = h('div.editor-form');
  const pratinjau = h('div.soal-panggung');
  const pesan = h('p.form-pesan', { role: 'alert' });
  let tPratinjau;
  const segarkan = () => { clearTimeout(tPratinjau); tPratinjau = setTimeout(() => {
    const x = dariModel(m);
    try { renderSoal(pratinjau, x, x.kunci.jawaban, () => { }, { baca: true }); } catch { }
  }, 200); };
  const tutup = () => latar.remove();

  const teksIn = (obj, key, attrs = {}) => h(attrs.rows ? 'textarea' : 'input', { value: obj[key] ?? '', ...attrs, oninput: ev => { obj[key] = ev.target.value; segarkan(); } });
  const tombolHapus = (arr, i, min) => h('button.btn-ikon', { type: 'button', 'aria-label': 'Hapus baris', disabled: arr.length <= min, onclick: () => { arr.splice(i, 1); bangun(); } }, '✕');
  const gambarIn = (obj) => {
    const inp = teksIn(obj, 'gambar', { placeholder: 'URL gambar (opsional)', type: 'url' });
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
      const f = file.files[0]; if (!f) return;
      if (f.size > 2e6) return toast('Gambar maksimal 2 MB.', 'bahaya');
      const path = `soal/${crypto.randomUUID()}.${(f.name.split('.').pop() || 'png').toLowerCase()}`;
      const { error } = await sb.storage.from('gambar').upload(path, f, { contentType: f.type });
      if (error) return toast(error.message, 'bahaya');
      obj.gambar = sb.storage.from('gambar').getPublicUrl(path).data.publicUrl;
      inp.value = obj.gambar; segarkan();
    } });
    return h('div.input-grup', inp, file, h('button.btn.btn-garis.btn-kecil', { type: 'button', onclick: () => file.click() }, 'Unggah'));
  };

  function bangun() {
    const bagian = [];
    if (m.tipe === 'isian') {
      const ta = teksIn(m, 'teks', { rows: 4 });
      ta.addEventListener('input', () => { sinkronCelah(); });
      bagian.push(h('div.form-baris', h('label', 'Kalimat (gunakan {{c1}}, {{c2}}, … untuk bagian kosong)'), ta,
        h('button.btn.btn-garis.btn-kecil', { type: 'button', onclick: () => {
          let n = 1; while (m.teks.includes(`{{c${n}}}`) || m.celah['c' + n]) n++;
          const pos = ta.selectionStart ?? m.teks.length;
          m.teks = m.teks.slice(0, pos) + `{{c${n}}}` + m.teks.slice(pos);
          m.celah['c' + n] = [{ id: idBaru('o'), teks: '', benar: true }, { id: idBaru('o'), teks: '', benar: false }];
          bangun();
        } }, 'Sisipkan bagian kosong')));
    } else {
      bagian.push(h('div.form-baris', h('label', 'Teks soal'), teksIn(m, 'teks', { rows: 4 }),
        h('p.bantuan', 'Gunakan `kode` untuk teks kode dan **tebal** untuk penekanan.')));
    }
    bagian.push(h('div.form-baris', h('label', 'Gambar soal'), gambarIn(m)));

    if (m.tipe === 'pg' || m.tipe === 'pgk') {
      const nama = 'benar-' + Math.random().toString(36).slice(2);
      bagian.push(h('fieldset', h('legend', m.tipe === 'pg' ? 'Opsi (pilih satu jawaban benar)' : 'Opsi (centang semua yang benar)'),
        m.opsi.map((o, i) => h('div.editor-baris',
          h('input', { type: m.tipe === 'pg' ? 'radio' : 'checkbox', name: nama, checked: o.benar, 'aria-label': 'Jawaban benar',
            onchange: ev => { if (m.tipe === 'pg') m.opsi.forEach(x => (x.benar = false)); o.benar = ev.target.checked; segarkan(); } }),
          h('span.editor-huruf', 'ABCDEFGHIJ'[i]),
          teksIn(o, 'teks', { placeholder: 'Teks opsi' }), tombolHapus(m.opsi, i, 2))),
        h('div.baris-aksi',
          h('button.btn.btn-garis.btn-kecil', { type: 'button', disabled: m.opsi.length >= 10, onclick: () => { m.opsi.push({ id: idBaru('o'), teks: '', benar: false }); bangun(); } }, 'Tambah opsi'),
          h('label.centang', h('input', { type: 'checkbox', checked: m.acak, onchange: ev => { m.acak = ev.target.checked; } }), ' Boleh diacak (matikan untuk opsi seperti "semua benar")'))));
    }
    if (m.tipe === 'bs') {
      bagian.push(h('fieldset', h('legend', 'Pernyataan'),
        m.pernyataan.map((p, i) => h('div.editor-baris',
          teksIn(p, 'teks', { placeholder: 'Pernyataan ' + (i + 1) }),
          h('select', { onchange: ev => { p.nilai = ev.target.value === 'B'; segarkan(); } },
            h('option', { value: 'B', selected: p.nilai }, 'Benar'), h('option', { value: 'S', selected: !p.nilai }, 'Salah')),
          tombolHapus(m.pernyataan, i, 1))),
        h('button.btn.btn-garis.btn-kecil', { type: 'button', onclick: () => { m.pernyataan.push({ id: idBaru('p'), teks: '', nilai: true }); bangun(); } }, 'Tambah pernyataan')));
    }
    if (m.tipe === 'jodoh') {
      bagian.push(h('fieldset', h('legend', 'Pasangan yang benar'),
        m.pasangan.map((p, i) => h('div.editor-baris',
          teksIn(p.kiri, 'teks', { placeholder: 'Kiri ' + (i + 1) }), h('span.editor-panah', '↔'),
          teksIn(p.kanan, 'teks', { placeholder: 'Pasangannya' }), tombolHapus(m.pasangan, i, 2))),
        h('button.btn.btn-garis.btn-kecil', { type: 'button', onclick: () => { m.pasangan.push({ kiri: { id: idBaru('l'), teks: '' }, kanan: { id: idBaru('r'), teks: '' } }); bangun(); } }, 'Tambah pasangan')),
      h('fieldset', h('legend', 'Jawaban pengecoh (opsional)'),
        m.pengecoh.map((p, i) => h('div.editor-baris', teksIn(p, 'teks', { placeholder: 'Pengecoh' }), tombolHapus(m.pengecoh, i, 0))),
        h('button.btn.btn-garis.btn-kecil', { type: 'button', onclick: () => { m.pengecoh.push({ id: idBaru('r'), teks: '' }); bangun(); } }, 'Tambah pengecoh')));
    }
    if (m.tipe === 'urut') {
      bagian.push(h('fieldset', h('legend', 'Item dalam urutan yang BENAR (peserta melihatnya teracak)'),
        m.item.map((x, i) => h('div.editor-baris',
          h('span.editor-huruf', i + 1), teksIn(x, 'teks', { placeholder: 'Langkah ' + (i + 1) }),
          h('button.btn-ikon', { type: 'button', disabled: i === 0, 'aria-label': 'Naikkan', onclick: () => { [m.item[i - 1], m.item[i]] = [m.item[i], m.item[i - 1]]; bangun(); } }, '▲'),
          h('button.btn-ikon', { type: 'button', disabled: i === m.item.length - 1, 'aria-label': 'Turunkan', onclick: () => { [m.item[i + 1], m.item[i]] = [m.item[i], m.item[i + 1]]; bangun(); } }, '▼'),
          tombolHapus(m.item, i, 2))),
        h('button.btn.btn-garis.btn-kecil', { type: 'button', onclick: () => { m.item.push({ id: idBaru('i'), teks: '' }); bangun(); } }, 'Tambah item')));
    }
    if (m.tipe === 'kelompok') {
      bagian.push(h('fieldset', h('legend', 'Kelompok'),
        m.kategori.map((x, i) => h('div.editor-baris', teksIn(x, 'teks', { placeholder: 'Nama kelompok', onchange: bangun }), tombolHapus(m.kategori, i, 2))),
        h('button.btn.btn-garis.btn-kecil', { type: 'button', onclick: () => { m.kategori.push({ id: idBaru('k'), teks: '' }); bangun(); } }, 'Tambah kelompok')),
      h('fieldset', h('legend', 'Item dan kelompok yang benar'),
        m.item.map((x, i) => h('div.editor-baris', teksIn(x, 'teks', { placeholder: 'Item' }),
          h('select', { onchange: ev => { x.kat = ev.target.value; segarkan(); } }, h('option', { value: '' }, 'Pilih kelompok…'),
            m.kategori.map(k => h('option', { value: k.id, selected: x.kat === k.id }, k.teks || '(tanpa nama)'))),
          tombolHapus(m.item, i, 2))),
        h('button.btn.btn-garis.btn-kecil', { type: 'button', onclick: () => { m.item.push({ id: idBaru('x'), teks: '', kat: '' }); bangun(); } }, 'Tambah item')));
    }
    if (m.tipe === 'isian') {
      const ids = [...m.teks.matchAll(/\{\{([^}]+)\}\}/g)].map(x => x[1]);
      bagian.push(h('div.isian-celah', ids.length ? ids.map((id, n) => {
        m.celah[id] ||= [{ id: idBaru('o'), teks: '', benar: true }, { id: idBaru('o'), teks: '', benar: false }];
        const opsi = m.celah[id]; const nama = 'c-' + id + Math.random().toString(36).slice(2, 5);
        return h('fieldset', h('legend', `Bagian kosong ${n + 1} — {{${id}}}`),
          opsi.map((o, i) => h('div.editor-baris',
            h('input', { type: 'radio', name: nama, checked: o.benar, 'aria-label': 'Jawaban benar', onchange: () => { opsi.forEach(x => (x.benar = false)); o.benar = true; segarkan(); } }),
            teksIn(o, 'teks', { placeholder: 'Pilihan' }), tombolHapus(opsi, i, 2))),
          h('button.btn.btn-garis.btn-kecil', { type: 'button', onclick: () => { opsi.push({ id: idBaru('o'), teks: '', benar: false }); bangun(); } }, 'Tambah pilihan'));
      }) : h('p.redup', 'Belum ada bagian kosong di kalimat.')));
    }
    bagian.push(h('div.form-dua',
      h('div.form-baris', h('label', 'Bobot'), h('input', { type: 'number', min: 0.5, step: 0.5, value: m.bobot, oninput: ev => { m.bobot = +ev.target.value || 1; } })),
      m.tipe === 'pg' ? h('div') : h('label.centang', h('input', { type: 'checkbox', checked: m.parsial, onchange: ev => { m.parsial = ev.target.checked; } }), ' Nilai parsial (sebagian benar dapat sebagian nilai)')));
    formEl.replaceChildren(...bagian);
    segarkan();
  }
  let tSinkron;
  function sinkronCelah() { clearTimeout(tSinkron); tSinkron = setTimeout(() => {
    const ids = [...m.teks.matchAll(/\{\{([^}]+)\}\}/g)].map(x => x[1]).join(',');
    if (ids !== (formEl.dataset.celah || '')) { formEl.dataset.celah = ids; const pos = document.activeElement?.selectionStart; bangun(); const ta = formEl.querySelector('textarea'); ta.focus(); if (pos != null) ta.setSelectionRange(pos, pos); }
  }, 600); }

  const simpan = async () => {
    pesan.textContent = '';
    const x = dariModel(m);
    const kosong = JSON.stringify(x.konten).match(/"teks":""/);
    if (kosong) return (pesan.textContent = 'Masih ada isian teks yang kosong.');
    const jw = x.kunci.jawaban;
    const kurang =
      (m.tipe === 'pg' && !jw) ? 'Pilih satu jawaban yang benar.' :
      (m.tipe === 'pgk' && !jw.length) ? 'Centang minimal satu jawaban yang benar.' :
      (m.tipe === 'kelompok' && m.item.some(i => !m.kategori.some(k => k.id === i.kat))) ? 'Setiap item harus punya kelompok yang benar.' :
      (m.tipe === 'isian' && !x.konten.celah.length) ? 'Sisipkan minimal satu bagian kosong di kalimat.' :
      (m.tipe === 'isian' && x.konten.celah.some(c => !jw[c.id])) ? 'Pilih jawaban benar untuk setiap bagian kosong.' : null;
    if (kurang) return (pesan.textContent = kurang);
    try {
      await rpc('admin_soal_simpan', { p_exam: u.id, p_soal: s.id ? { ...x, id: s.id, urutan: s.urutan } : x });
      toast('Soal disimpan.', 'ok'); tutup(); await muatUjian(); gambar();
    } catch (e) { pesan.textContent = e.message; }
  };

  kotak.append(
    h('div.editor-kepala', h('h2.modal-judul', (s.id ? 'Ubah soal' : 'Soal baru') + ' — ' + NAMA_TIPE[m.tipe])),
    h('div.editor-badan', formEl, h('div.editor-pratinjau', h('p.redup.kecil', 'Pratinjau dengan kunci jawaban'), h('div.soal-lembar', pratinjau))),
    h('div.modal-aksi', pesan, h('button.btn', { type: 'button', onclick: tutup }, 'Batal'), h('button.btn.btn-utama', { type: 'button', onclick: simpan }, 'Simpan soal')));
  latar.append(kotak); document.body.append(latar);
  formEl.dataset.celah = m.tipe === 'isian' ? [...m.teks.matchAll(/\{\{([^}]+)\}\}/g)].map(x => x[1]).join(',') : '';
  bangun();
}

// ====================================================================== peserta (whitelist)
async function tabPeserta(isi, u) {
  if (u.id === 'baru') { isi.append(h('p.redup', 'Simpan ujian terlebih dahulu.')); return; }
  const { data: wl } = await sb.from('exam_whitelist').select('nim').eq('exam_id', u.id).order('nim');
  const nims = (wl || []).map(w => w.nim);
  const { data: prof } = nims.length ? await sb.from('profiles').select('nim,nama').in('nim', nims) : { data: [] };
  const nama = Object.fromEntries((prof || []).map(p => [p.nim, p.nama]));
  const masukan = h('textarea', { rows: 5, placeholder: 'Tempel daftar NIM, satu per baris (boleh dipisah koma atau spasi)' });

  isi.append(
    h('div.kartu',
      h('p', u.pakai_whitelist ? 'Pembatasan aktif: hanya NIM di bawah ini yang dapat melihat dan mengikuti ujian.' : 'Pembatasan belum aktif: semua akun dengan token dapat mengikuti ujian. Aktifkan "Batasi ke daftar NIM" di tab Pengaturan.'),
      h('div.form-kolom', masukan,
        h('div.baris-aksi',
          h('button.btn.btn-utama', { onclick: async () => {
            const baru = [...new Set(masukan.value.split(/[\s,;]+/).map(x => x.trim().toUpperCase()).filter(Boolean))];
            if (!baru.length) return;
            const { error } = await sb.from('exam_whitelist').upsert(baru.map(n => ({ exam_id: u.id, nim: n })), { onConflict: 'exam_id,nim', ignoreDuplicates: true });
            if (error) return toast(error.message, 'bahaya');
            toast(baru.length + ' NIM ditambahkan.', 'ok'); gambar();
          } }, 'Tambahkan NIM'),
          nims.length ? h('button.btn.btn-bahaya-garis', { onclick: async () => {
            if (!await konfirmasi('Kosongkan daftar NIM?', `${nims.length} NIM akan dihapus dari daftar ujian ini.`, 'Kosongkan', 'bahaya')) return;
            await sb.from('exam_whitelist').delete().eq('exam_id', u.id); gambar();
          } }, 'Kosongkan daftar') : null))),
    h('p.redup', `${nims.length} NIM terdaftar · ${Object.keys(nama).length} sudah memiliki akun`),
    h('table.tabel', h('thead', h('tr', h('th', 'NIM'), h('th', 'Nama di akun'), h('th', ''))),
      h('tbody', nims.map(n => h('tr', h('td', n), h('td', nama[n] || h('span.redup', 'belum mendaftar')),
        h('td.kanan', h('button.btn-ikon', { 'aria-label': 'Hapus ' + n, onclick: async () => { await sb.from('exam_whitelist').delete().eq('exam_id', u.id).eq('nim', n); gambar(); } }, '✕')))))));
}

// ====================================================================== pemantauan
async function tabPantau(isi, u) {
  if (u.id === 'baru') { isi.append(h('p.redup', 'Simpan ujian terlebih dahulu.')); return; }
  const sesi = new Map();
  let pelanggaran = [];
  const foto = {}; // session_id -> signed url kamera terbaru
  let selisih = 0;
  const ringkas = h('div.ringkas');
  const tbody = h('tbody');
  const umpan = h('ol.umpan');
  const filter = h('select', { 'aria-label': 'Saring status', onchange: () => gambarTabel() },
    h('option', { value: '' }, 'Semua status'), h('option', { value: 'aktif' }, 'Aktif'), h('option', { value: 'terkunci' }, 'Terkunci'),
    h('option', { value: 'offline' }, 'Offline'), h('option', { value: 'selesai' }, 'Selesai'));

  isi.append(
    h('div.alat', ringkas, h('div.alat-kanan', filter,
      h('button.btn.btn-garis', { onclick: async () => { const n = await rpc('admin_rapikan'); toast(n ? n + ' sesi kedaluwarsa dikumpulkan.' : 'Tidak ada sesi kedaluwarsa.'); muat(); } }, 'Kumpulkan sesi kedaluwarsa'))),
    h('div.pantau',
      h('div.pantau-tabel', h('table.tabel.tabel-pantau',
        h('thead', h('tr', h('th', 'Kamera'), h('th', 'Peserta'), h('th', 'Status'), h('th', 'Progres'), h('th', 'Sisa'), h('th', 'Pelanggaran'), h('th', 'Kondisi'), h('th', ''))),
        tbody)),
      h('aside.kartu.pantau-umpan', h('h2', 'Kejadian terbaru'), umpan)));

  const online = s => s.last_heartbeat && (Date.now() + selisih - new Date(s.last_heartbeat)) / 1000 < 50;
  const statusTampil = s => s.status !== 'aktif' ? s.status : online(s) ? 'aktif' : 'offline';

  async function muat() {
    const [{ data: ss, error }, { data: vv }] = await Promise.all([
      sb.from('sessions').select('*, profiles(nim,nama)').eq('exam_id', u.id),
      sb.from('violations').select('*').eq('exam_id', u.id).order('waktu', { ascending: false }).limit(60),
    ]);
    if (error) return toast(error.message, 'bahaya');
    const t0 = Date.now();
    const ws = await rpc('waktu_server').catch(() => null);
    if (ws) selisih = new Date(ws) - (t0 + Date.now()) / 2;
    sesi.clear(); ss.forEach(s => sesi.set(s.id, s));
    pelanggaran = vv || [];
    gambarTabel(); gambarUmpan();
    muatFoto();
  }
  async function muatFoto() {
    const { data } = await sb.from('bukti').select('session_id,path,waktu').eq('exam_id', u.id).eq('jenis', 'kamera').order('waktu', { ascending: false }).limit(400);
    const terbaru = {};
    (data || []).forEach(b => { if (!terbaru[b.session_id]) terbaru[b.session_id] = b.path; });
    const paths = Object.values(terbaru);
    if (!paths.length) return;
    const { data: urls } = await sb.storage.from('bukti').createSignedUrls(paths, 600);
    const byPath = Object.fromEntries((urls || []).map(x => [x.path, x.signedUrl]));
    for (const [sid, p] of Object.entries(terbaru)) foto[sid] = byPath[p];
    gambarTabel();
  }

  function gambarTabel() {
    const arr = [...sesi.values()].sort((a, b) => (a.profiles?.nama || '').localeCompare(b.profiles?.nama || ''));
    const hitung = { aktif: 0, terkunci: 0, offline: 0, selesai: 0 };
    arr.forEach(s => hitung[statusTampil(s)]++);
    ringkas.replaceChildren(
      ...[['aktif', 'aktif', 'aman'], ['offline', 'offline', 'awas'], ['terkunci', 'terkunci', 'bahaya'], ['selesai', 'selesai', '']].map(([k, l, g]) =>
        h('span.ringkas-butir', h('strong' + (g ? '.teks-' + g : ''), hitung[k]), ' ' + l)));
    const f = filter.value;
    tbody.replaceChildren(...arr.filter(s => !f || statusTampil(s) === f).map(s => {
      const st = statusTampil(s);
      const sisa = s.status === 'selesai' ? null : (new Date(s.deadline) - (Date.now() + selisih)) / 1000;
      const k = s.status_klien || {};
      const kondisi = s.status === 'selesai' ? h('span.redup', '—') : h('span.kondisi',
        bendera(k.fs, 'Layar penuh'), u.wajib_kamera ? bendera(k.kam, 'Kamera') : null, u.wajib_layar ? bendera(k.lyr, 'Layar') : null, bendera(k.mon !== false, '1 monitor'));
      const vTerakhir = pelanggaran.find(v => v.session_id === s.id && v.dihitung);
      return h('tr' + (st === 'terkunci' ? '.baris-bahaya' : st === 'offline' ? '.baris-awas' : ''), { 'data-sesi': s.id },
        h('td', foto[s.id] ? h('img.foto-mini', { src: foto[s.id], alt: 'Kamera ' + (s.profiles?.nama || ''), onclick: () => detailSesi(u, s) }) : h('span.foto-mini.foto-kosong')),
        h('td', h('strong', s.profiles?.nama || '—'), h('br'), h('span.redup.kecil', s.profiles?.nim || '')),
        h('td', h('span.lencana.' + ({ aktif: 'lencana-aman', offline: 'lencana-awas', terkunci: 'lencana-bahaya', selesai: '' }[st] || ''), st),
          st === 'offline' ? h('div.redup.kecil', relatif((Date.now() + selisih - new Date(s.last_heartbeat)) / 1000)) : null),
        h('td', h('div.progres', h('div.progres-isi', { style: { width: (s.jumlah_soal ? 100 * s.terjawab / s.jumlah_soal : 0) + '%' } })), h('span.kecil', `${s.terjawab}/${s.jumlah_soal}`)),
        h('td.angka', sisa == null ? (s.skor != null ? 'Nilai ' + Number(s.skor) : '—') : durasi(sisa)),
        h('td', h('strong' + (s.pelanggaran >= u.batas_pelanggaran ? '.teks-bahaya' : s.pelanggaran ? '.teks-awas' : ''), s.pelanggaran),
          vTerakhir ? h('div.redup.kecil', NAMA_PELANGGARAN[vTerakhir.jenis] || vTerakhir.jenis) : null),
        h('td', kondisi),
        h('td.kanan', menuSesi(u, s, muat)));
    }));
    if (!arr.length) tbody.append(h('tr', h('td', { colSpan: 8 }, h('p.redup', 'Belum ada peserta yang memulai ujian.'))));
  }
  function gambarUmpan() {
    umpan.replaceChildren(...pelanggaran.slice(0, 40).map(v => {
      const s = sesi.get(v.session_id);
      return h('li' + (v.dihitung ? '.umpan-hitung' : ''), h('span.redup.kecil', jam(v.waktu)), ' ',
        h('strong', s?.profiles?.nama || '—'), h('br'), NAMA_PELANGGARAN[v.jenis] || v.jenis, v.detail ? h('span.redup', ' (' + v.detail + ')') : null);
    }));
    if (!pelanggaran.length) umpan.append(h('li.redup', 'Belum ada kejadian.'));
  }

  // realtime
  const kanal = sb.channel('pantau-' + u.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `exam_id=eq.${u.id}` }, p => {
      if (p.eventType === 'DELETE') { sesi.delete(p.old.id); return gambarTabel(); }
      const lama = sesi.get(p.new.id);
      if (!lama) return muat();
      sesi.set(p.new.id, { ...p.new, profiles: lama.profiles });
      gambarTabel();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'violations', filter: `exam_id=eq.${u.id}` }, p => {
      pelanggaran.unshift(p.new); gambarUmpan();
      if (p.new.dihitung) {
        const s = sesi.get(p.new.session_id);
        toast(`${s?.profiles?.nama || 'Peserta'}: ${NAMA_PELANGGARAN[p.new.jenis] || p.new.jenis}`, 'awas', 5000);
      }
    })
    .subscribe();
  const tSegar = setInterval(gambarTabel, 5000);
  const tFoto = setInterval(muatFoto, 30000);
  const tMuat = setInterval(muat, 60000);
  bersihkan.push(() => { sb.removeChannel(kanal); clearInterval(tSegar); clearInterval(tFoto); clearInterval(tMuat); });
  muat();
}

const bendera = (ok, label) => h('span.bendera' + (ok ? '.bendera-ok' : '.bendera-gagal'), { title: label + (ok ? ' aktif' : ' TIDAK aktif') }, label);

function menuSesi(u, s, segarkan) {
  const aksi = async (nama, args = {}, pesanOk) => {
    try { await rpc('admin_aksi_sesi', { p_session: s.id, p_aksi: nama, ...args }); toast(pesanOk, 'ok'); segarkan?.(); }
    catch (e) { toast(e.message, 'bahaya'); }
  };
  const minta = async (judul, keterangan, denganReset) => {
    const menit = h('input', { type: 'number', min: 0, max: 300, value: denganReset ? 0 : 10 });
    const reset = h('input', { type: 'checkbox', checked: true });
    const ok = await dialog({ judul, isi: h('div.form-kolom', h('p', keterangan), h('label', 'Tambahan waktu (menit)'), menit,
      denganReset ? h('label.centang', reset, ' Nolkan hitungan pelanggaran') : null),
      tombol: [{ teks: 'Batal', nilai: false }, { teks: 'Lanjutkan', gaya: 'utama', nilai: true }] });
    return ok ? { menit: +menit.value || 0, reset: reset.checked } : null;
  };
  const pilihan = [
    s.status === 'terkunci' && ['Buka kunci', async () => { const r = await minta('Buka kunci sesi', `${s.profiles?.nama} dapat melanjutkan ujian.`, true); if (r) aksi('buka_kunci', { p_menit: r.menit, p_reset_pelanggaran: r.reset }, 'Sesi dibuka.'); }],
    s.status !== 'selesai' && ['Tambah waktu', async () => { const r = await minta('Tambah waktu', `Untuk ${s.profiles?.nama}.`); if (r?.menit) aksi('tambah_waktu', { p_menit: r.menit }, 'Waktu ditambah.'); }],
    s.status !== 'selesai' && ['Izinkan pindah perangkat', async () => { if (await konfirmasi('Izinkan pindah perangkat?', 'Peserta dapat melanjutkan dari perangkat/peramban lain. Perangkat berikutnya yang membuka sesi ini akan terikat.', 'Izinkan')) aksi('izinkan_perangkat', {}, 'Izin pindah perangkat diberikan.'); }],
    s.status !== 'selesai' && ['Kumpulkan sekarang', async () => { if (await konfirmasi('Kumpulkan sekarang?', `Jawaban ${s.profiles?.nama} dikumpulkan dan dinilai.`, 'Kumpulkan', 'bahaya')) aksi('kumpulkan', {}, 'Sesi dikumpulkan.'); }],
    s.status === 'selesai' && ['Buka ulang sesi', async () => { const r = await minta('Buka ulang sesi', 'Sesi yang sudah selesai dibuka kembali (mis. karena gangguan teknis). Nilai dihitung ulang saat dikumpulkan.'); if (r) aksi('buka_ulang', { p_menit: r.menit }, 'Sesi dibuka ulang.'); }],
    ['Lihat detail', () => detailSesi(u, s)],
    ['Hapus sesi', async () => { if (await konfirmasi('Hapus sesi?', 'Jawaban dan catatan sesi ini terhapus dan peserta dapat memulai dari awal.', 'Hapus', 'bahaya')) aksi('hapus', {}, 'Sesi dihapus.'); }],
  ].filter(Boolean);
  const menu = h('div.menu', { hidden: true }, pilihan.map(([l, f]) => h('button', { type: 'button', onclick: () => { menu.hidden = true; f(); } }, l)));
  const tombol = h('button.btn.btn-garis.btn-kecil', { type: 'button', 'aria-haspopup': 'true', onclick: ev => {
    ev.stopPropagation();
    document.querySelectorAll('.menu').forEach(m => m !== menu && (m.hidden = true));
    menu.hidden = !menu.hidden;
  } }, 'Aksi');
  return h('div.menu-wadah', tombol, menu);
}
document.addEventListener('click', () => document.querySelectorAll('.menu').forEach(m => (m.hidden = true)));

// ====================================================================== hasil
async function tabHasil(isi, u) {
  if (u.id === 'baru') { isi.append(h('p.redup', 'Simpan ujian terlebih dahulu.')); return; }
  const { data: ss, error } = await sb.from('sessions').select('*, profiles(nim,nama)').eq('exam_id', u.id);
  if (error) return isi.append(h('p.teks-bahaya', error.message));
  ss.sort((a, b) => (a.profiles?.nim || '').localeCompare(b.profiles?.nim || ''));
  const selesai = ss.filter(s => s.status === 'selesai' && s.skor != null);
  const nilai = selesai.map(s => Number(s.skor));
  const rata = nilai.length ? nilai.reduce((a, b) => a + b, 0) / nilai.length : null;

  isi.append(
    h('div.alat',
      h('div.ringkas',
        h('span.ringkas-butir', h('strong', ss.length), ' peserta'),
        h('span.ringkas-butir', h('strong', selesai.length), ' dinilai'),
        h('span.ringkas-butir', h('strong', rata == null ? '—' : rata.toFixed(1)), ' rata-rata'),
        h('span.ringkas-butir', h('strong', nilai.length ? Math.max(...nilai) : '—'), ' tertinggi'),
        h('span.ringkas-butir', h('strong', nilai.length ? Math.min(...nilai) : '—'), ' terendah')),
      h('div.alat-kanan',
        h('button.btn.btn-garis', { onclick: async () => { const n = await rpc('admin_nilai_ulang', { p_exam: u.id }); toast(n + ' sesi dinilai ulang.', 'ok'); gambar(); } }, 'Nilai ulang'),
        h('button.btn.btn-utama', { onclick: () => eksporExcel(u, ss) }, 'Unduh Excel'),
        h('button.btn.btn-bahaya-garis', { onclick: () => hapusBukti(u) }, 'Hapus berkas bukti'))),
    h('table.tabel',
      h('thead', h('tr', h('th', 'NIM'), h('th', 'Nama'), h('th', 'Status'), h('th.angka', 'Nilai'), h('th.angka', 'Terjawab'),
        h('th.angka', 'Pelanggaran'), h('th', 'Mulai'), h('th', 'Dikumpulkan'), h('th', ''))),
      h('tbody', ss.length ? ss.map(s => h('tr',
        h('td', s.profiles?.nim), h('td', s.profiles?.nama),
        h('td', s.status, s.alasan_selesai ? h('span.redup.kecil', ' (' + ({ manual: 'oleh peserta', waktu: 'waktu habis', pelanggaran: 'batas pelanggaran', admin: 'oleh admin' }[s.alasan_selesai] || s.alasan_selesai) + ')') : null),
        h('td.angka', h('strong', s.skor != null ? Number(s.skor).toLocaleString('id-ID') : '—')),
        h('td.angka', `${s.terjawab}/${s.jumlah_soal}`),
        h('td.angka', s.pelanggaran),
        h('td.kecil', jam(s.started_at)), h('td.kecil', jam(s.submitted_at)),
        h('td.kanan', h('button.btn.btn-garis.btn-kecil', { onclick: () => detailSesi(u, s) }, 'Detail'))))
        : h('tr', h('td', { colSpan: 9 }, h('p.redup', 'Belum ada peserta.'))))));
}

async function detailSesi(u, s) {
  const isi = h('div.detail', h('p.redup', 'Memuat…'));
  dialog({ judul: `${s.profiles?.nama} — ${s.profiles?.nim}`, isi, lebar: '980px' });
  const [det, { data: vv }, { data: bb }] = await Promise.all([
    rpc('admin_detail_sesi', { p_session: s.id }).catch(() => []),
    sb.from('violations').select('*').eq('session_id', s.id).order('waktu'),
    sb.from('bukti').select('*').eq('session_id', s.id).order('waktu'),
  ]);
  const paths = (bb || []).map(b => b.path);
  const url = {};
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await sb.storage.from('bukti').createSignedUrls(paths.slice(i, i + 100), 3600);
    (data || []).forEach(x => (url[x.path] = x.signedUrl));
  }
  const tabs = { jawaban: 'Jawaban', pelanggaran: `Pelanggaran (${(vv || []).filter(v => v.dihitung).length})`, bukti: `Bukti (${paths.length})` };
  let aktif = 'jawaban';
  const badan = h('div');
  const kepala = h('div.tab-baris');
  const gambarTab = () => {
    kepala.replaceChildren(...Object.entries(tabs).map(([k, l]) => h('button.tab' + (k === aktif ? '.aktif' : ''), { type: 'button', onclick: () => { aktif = k; gambarTab(); } }, l)));
    if (aktif === 'jawaban') {
      badan.replaceChildren(h('table.tabel.tabel-jawaban',
        h('thead', h('tr', h('th', 'No'), h('th', 'Soal'), h('th', 'Jawaban peserta'), h('th', 'Kunci'), h('th.angka', 'Skor'))),
        h('tbody', det.map(d => {
          const fr = d.skor == null ? null : Number(d.skor);
          return h('tr' + (fr === 1 ? '.baris-benar' : fr === 0 || fr == null ? '.baris-salah' : '.baris-sebagian'),
            h('td', d.no), h('td', h('span.lencana', NAMA_TIPE[d.tipe]), h('div.kecil', ringkasTeks(d.konten.teks))),
            h('td', ringkasJawaban(d, d.jawaban)), h('td', ringkasJawaban(d, d.kunci.jawaban)),
            h('td.angka', fr == null ? '—' : `${(fr * Number(d.bobot)).toFixed(2)}/${Number(d.bobot)}`));
        }))));
    } else if (aktif === 'pelanggaran') {
      badan.replaceChildren(vv?.length ? h('ol.linimasa', vv.map(v => h('li' + (v.dihitung ? '.umpan-hitung' : ''),
        h('span.redup', jam(v.waktu)), ' ', h('strong', NAMA_PELANGGARAN[v.jenis] || v.jenis), v.detail ? h('span.redup', ' — ' + v.detail) : null,
        v.dihitung ? null : h('span.redup.kecil', ' (tidak dihitung)'),
        (v.bukti_kamera || v.bukti_layar) ? h('div.bukti-baris', [v.bukti_kamera, v.bukti_layar].filter(Boolean).map(p => url[p] ? h('a', { href: url[p], target: '_blank', rel: 'noopener' }, h('img.bukti-gambar', { src: url[p], alt: 'Bukti' })) : null)) : null)))
        : h('p.redup', 'Tidak ada pelanggaran.'));
    } else {
      badan.replaceChildren(bb?.length ? h('div.galeri', bb.map(b => url[b.path] ? h('figure', h('a', { href: url[b.path], target: '_blank', rel: 'noopener' }, h('img', { src: url[b.path], alt: b.jenis, loading: 'lazy' })),
        h('figcaption', jam(b.waktu) + ' · ' + b.jenis + (b.violation_id ? ' · saat pelanggaran' : ''))) : null)) : h('p.redup', 'Belum ada bukti.'));
    }
  };
  isi.replaceChildren(
    h('dl.ujian-meta',
      h('div', h('dt', 'Nilai'), h('dd', s.skor != null ? Number(s.skor) : '—')),
      h('div', h('dt', 'Status'), h('dd', s.status)),
      h('div', h('dt', 'Mulai'), h('dd', tanggal(s.started_at))),
      h('div', h('dt', 'Dikumpulkan'), h('dd', tanggal(s.submitted_at))),
      h('div', h('dt', 'IP'), h('dd', s.ip || '—')),
      h('div', h('dt', 'Peramban'), h('dd.kecil', (s.user_agent || '—').slice(0, 80)))),
    kepala, badan);
  gambarTab();
}

async function eksporExcel(u, ss) {
  toast('Menyiapkan berkas…');
  const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  const soal = await rpc('admin_soal_list', { p_exam: u.id });
  const noSoal = Object.fromEntries(soal.map((s, i) => [s.id, i + 1]));
  const nilai = ss.map(s => ({
    NIM: s.profiles?.nim, Nama: s.profiles?.nama, Status: s.status, Alasan: s.alasan_selesai || '',
    Nilai: s.skor != null ? Number(s.skor) : '', Terjawab: s.terjawab, 'Jumlah soal': s.jumlah_soal, Pelanggaran: s.pelanggaran,
    Mulai: s.started_at ? new Date(s.started_at) : '', Dikumpulkan: s.submitted_at ? new Date(s.submitted_at) : '', IP: s.ip || '',
  }));
  const perSoal = [];
  for (const s of ss) {
    const det = await rpc('admin_detail_sesi', { p_session: s.id }).catch(() => []);
    const baris = { NIM: s.profiles?.nim, Nama: s.profiles?.nama };
    soal.forEach((q, i) => (baris['S' + (i + 1)] = ''));
    det.forEach(d => { if (noSoal[d.id]) baris['S' + noSoal[d.id]] = d.skor == null ? 0 : +(Number(d.skor) * Number(d.bobot)).toFixed(2); });
    perSoal.push(baris);
  }
  const { data: vv } = await sb.from('violations').select('*').eq('exam_id', u.id).order('waktu');
  const nama = Object.fromEntries(ss.map(s => [s.id, s.profiles]));
  const pel = (vv || []).map(v => ({ Waktu: new Date(v.waktu), NIM: nama[v.session_id]?.nim, Nama: nama[v.session_id]?.nama,
    Jenis: NAMA_PELANGGARAN[v.jenis] || v.jenis, Detail: v.detail || '', Dihitung: v.dihitung ? 'ya' : 'tidak' }));
  const bs = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(bs, XLSX.utils.json_to_sheet(nilai, { cellDates: true }), 'Nilai');
  XLSX.utils.book_append_sheet(bs, XLSX.utils.json_to_sheet(perSoal), 'Skor per soal');
  XLSX.utils.book_append_sheet(bs, XLSX.utils.json_to_sheet(pel, { cellDates: true }), 'Pelanggaran');
  XLSX.utils.book_append_sheet(bs, XLSX.utils.json_to_sheet(soal.map((s, i) => ({ No: i + 1, Tipe: NAMA_TIPE[s.tipe], Bobot: Number(s.bobot), Soal: ringkasTeks(s.konten.teks) }))), 'Daftar soal');
  XLSX.writeFile(bs, `hasil-${slug(u.judul)}.xlsx`);
}

async function hapusBukti(u) {
  const { data } = await sb.from('bukti').select('path').eq('exam_id', u.id);
  const paths = (data || []).map(b => b.path);
  if (!paths.length) return toast('Tidak ada berkas bukti untuk ujian ini.');
  if (!await konfirmasi('Hapus semua berkas bukti?', `${paths.length} foto kamera dan tangkapan layar ujian ini akan dihapus permanen dari Storage. Nilai dan catatan pelanggaran tetap tersimpan.`, 'Hapus berkas', 'bahaya')) return;
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await sb.storage.from('bukti').remove(paths.slice(i, i + 100));
    if (error) return toast(error.message, 'bahaya');
  }
  await rpc('admin_hapus_catatan_bukti', { p_exam: u.id });
  toast(paths.length + ' berkas dihapus.', 'ok');
}

// ====================================================================== akun
async function halamanAkun(utama) {
  const { data, error } = await sb.from('profiles').select('*').order('nim');
  if (error) return utama.append(h('p.teks-bahaya', error.message));
  const cari = h('input', { type: 'search', placeholder: 'Cari NIM atau nama', 'aria-label': 'Cari akun' });
  const tbody = h('tbody');
  const isiTabel = () => {
    const q = cari.value.toLowerCase();
    tbody.replaceChildren(...data.filter(p => !q || p.nim.toLowerCase().includes(q) || p.nama.toLowerCase().includes(q)).map(p => h('tr',
      h('td', p.nim), h('td', p.nama), h('td', p.role === 'admin' ? h('span.lencana.lencana-tinta', 'admin') : 'peserta'), h('td.kecil', tanggal(p.dibuat)),
      h('td.kanan', h('button.btn.btn-garis.btn-kecil', { onclick: () => ubahAkun(p) }, 'Ubah')))));
  };
  cari.oninput = isiTabel;
  utama.append(h('div.halaman-judul', h('h1', 'Akun peserta')),
    h('p.redup', 'Peserta mengisi NIM dan nama sendiri saat pertama masuk dan tidak dapat mengubahnya. Perbaiki di sini bila ada yang salah.'),
    h('div.alat', cari, h('span.redup', data.length + ' akun')),
    h('table.tabel', h('thead', h('tr', h('th', 'NIM'), h('th', 'Nama'), h('th', 'Peran'), h('th', 'Terdaftar'), h('th', ''))), tbody));
  isiTabel();
}

async function ubahAkun(p) {
  const nim = h('input', { value: p.nim }); const nama = h('input', { value: p.nama });
  const role = h('select', h('option', { value: 'peserta', selected: p.role === 'peserta' }, 'Peserta'), h('option', { value: 'admin', selected: p.role === 'admin' }, 'Admin'));
  const ok = await dialog({ judul: 'Ubah akun', isi: h('div.form-kolom', h('label', 'NIM'), nim, h('label', 'Nama'), nama, h('label', 'Peran'), role),
    tombol: [{ teks: 'Batal', nilai: false }, { teks: 'Simpan', gaya: 'utama', nilai: true }] });
  if (!ok) return;
  try { await rpc('admin_ubah_profil', { p_id: p.id, p_nim: nim.value, p_nama: nama.value, p_role: role.value }); toast('Akun diperbarui.', 'ok'); gambar(); }
  catch (e) { toast(e.message, 'bahaya'); }
}

mulai();
