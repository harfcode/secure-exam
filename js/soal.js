// Perender 7 tipe soal (dipakai halaman peserta & pratinjau admin)
import { h, teksKaya } from './common.js';

export const NAMA_TIPE = {
  pg: 'Pilihan ganda',
  pgk: 'Pilihan ganda kompleks',
  bs: 'Benar / salah',
  jodoh: 'Menjodohkan',
  urut: 'Mengurutkan',
  kelompok: 'Mengelompokkan',
  isian: 'Isian pilihan',
};

export const PETUNJUK = {
  pg: 'Pilih satu jawaban.',
  pgk: 'Pilih semua jawaban yang benar. Jawaban salah yang dipilih mengurangi nilai soal ini.',
  bs: 'Tentukan benar atau salah untuk setiap pernyataan.',
  jodoh: 'Seret jawaban dari bank ke pasangannya, atau klik jawaban lalu klik tempatnya.',
  urut: 'Susun dengan menyeret atau tombol panah. Urutan baru tersimpan setelah Anda mengubahnya atau menekan "Tetapkan urutan ini".',
  kelompok: 'Seret setiap item ke kelompok yang tepat, atau klik item lalu klik kelompoknya.',
  isian: 'Pilih kata yang tepat untuk setiap bagian yang kosong.',
};

const HURUF = 'ABCDEFGHIJ';

const gambar = (src, alt) => src ? h('img.soal-gambar', { src, alt: alt || 'Gambar soal', loading: 'lazy', draggable: false }) : null;
const teks = s => h('span', { html: teksKaya(s || '') });

/** Apakah jawaban dianggap terisi */
export function terisi(j) {
  if (j == null || j === '') return false;
  if (Array.isArray(j)) return j.length > 0;
  if (typeof j === 'object') return Object.keys(j).length > 0;
  return true;
}

/**
 * @param wadah   elemen tujuan
 * @param soal    {id, tipe, konten}
 * @param jawaban nilai jawaban saat ini (format ID pada konten)
 * @param onUbah  fungsi(jawabanBaru)
 * @param opsi    {baca: boolean}  baca = tampilan saja
 */
export function renderSoal(wadah, soal, jawaban, onUbah, opsi = {}) {
  const k = soal.konten || {};
  const baca = !!opsi.baca;
  const ubah = v => { if (!baca) onUbah?.(v); };
  const isi = h('div.soal-isi');
  wadah.replaceChildren(isi);

  if (soal.tipe !== 'isian') {
    isi.append(...[h('div.soal-teks', teks(k.teks)), gambar(k.gambar)].filter(Boolean));
  }
  if (!opsi.tanpaPetunjuk) isi.append(h('p.soal-petunjuk', PETUNJUK[soal.tipe]));

  const R = { pg: pilihan, pgk: pilihan, bs: benarSalah, jodoh, urut, kelompok, isian }[soal.tipe];
  if (!R) { isi.append(h('p', 'Tipe soal tidak dikenal.')); return; }
  R(isi, soal, k, jawaban, ubah, baca);
}

// ---------------------------------------------------------------- pg & pgk
function pilihan(isi, soal, k, jawaban, ubah, baca) {
  const ganda = soal.tipe === 'pgk';
  const dipilih = new Set(ganda ? (jawaban || []) : (jawaban ? [jawaban] : []));
  const daftar = h('div.opsi-daftar', { role: ganda ? 'group' : 'radiogroup', 'aria-label': 'Pilihan jawaban' });
  (k.opsi || []).forEach((o, i) => {
    const aktif = dipilih.has(o.id);
    const b = h('button.opsi' + (aktif ? '.terpilih' : '') + (ganda ? '.opsi-ganda' : ''), {
      type: 'button', role: ganda ? 'checkbox' : 'radio', 'aria-checked': String(aktif), disabled: baca,
      onclick: () => {
        if (ganda) {
          aktif ? dipilih.delete(o.id) : dipilih.add(o.id);
          ubah([...dipilih]);
        } else ubah(aktif ? null : o.id);
      },
    }, h('span.bulatan', { 'aria-hidden': 'true' }, HURUF[i] || i + 1),
       h('span.opsi-teks', teks(o.teks), gambar(o.gambar)));
    daftar.append(b);
  });
  isi.append(daftar);
}

// ---------------------------------------------------------------- benar/salah
function benarSalah(isi, soal, k, jawaban, ubah, baca) {
  const nilai = { ...(jawaban || {}) };
  const tabel = h('div.bs-tabel', { role: 'table' },
    h('div.bs-baris.bs-kepala', { role: 'row' },
      h('span', { role: 'columnheader' }, 'Pernyataan'),
      h('span', { role: 'columnheader' }, 'Benar'),
      h('span', { role: 'columnheader' }, 'Salah')));
  (k.pernyataan || []).forEach((p, i) => {
    const sel = v => h('button.bulatan.bulatan-tombol' + (nilai[p.id] === v ? '.terisi' : ''), {
      type: 'button', role: 'radio', disabled: baca, 'aria-checked': String(nilai[p.id] === v),
      'aria-label': (v ? 'Benar' : 'Salah') + ' untuk pernyataan ' + (i + 1),
      onclick: () => {
        if (nilai[p.id] === v) delete nilai[p.id]; else nilai[p.id] = v;
        ubah(Object.keys(nilai).length ? { ...nilai } : null);
      },
    }, v ? 'B' : 'S');
    tabel.append(h('div.bs-baris', { role: 'row' },
      h('span.bs-pernyataan', { role: 'cell' }, teks(p.teks)),
      h('span', { role: 'cell' }, sel(true)),
      h('span', { role: 'cell' }, sel(false))));
  });
  isi.append(tabel);
}

// ---------------------------------------------------------------- penempatan (jodoh & kelompok)
function penempatan(isi, { chip, zona, satuPerZona, letak, onUbah, baca, kelasZona, labelBank }) {
  let terpilih = null;
  const wadah = h('div.tempat');
  const gambarUlang = () => {
    const zonaEl = zona.map(z => {
      const di = chip.filter(c => letak[c.id] === z.id);
      const el = h('div.zona' + (kelasZona ? '.' + kelasZona : '') + (di.length ? '.berisi' : ''), {
        'data-zona': z.id, tabindex: baca ? null : 0, role: 'button',
        'aria-label': 'Tempatkan di ' + (z.label || 'zona'),
        onclick: ev => { if (ev.target.closest('.chip')) return; taruh(z.id); },
        onkeydown: ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === el) { ev.preventDefault(); taruh(z.id); } },
      }, z.kepala, h('div.zona-isi', di.length ? di.map(buatChip) : h('span.zona-kosong', satuPerZona ? 'Letakkan jawaban di sini' : 'Kosong')));
      pasangDrop(el, z.id);
      return el;
    });
    const sisa = chip.filter(c => !letak[c.id]);
    const bank = h('div.bank', { 'data-zona': '', onclick: ev => { if (!ev.target.closest('.chip')) taruh(null); } },
      h('p.bank-judul', labelBank), h('div.bank-isi', sisa.length ? sisa.map(buatChip) : h('span.redup', 'Semua sudah ditempatkan.')));
    pasangDrop(bank, null);
    wadah.replaceChildren(h('div.zona-daftar' + (kelasZona ? '.' + kelasZona + '-daftar' : ''), zonaEl), bank);
  };
  const buatChip = c => {
    const el = h('button.chip' + (terpilih === c.id ? '.dipilih' : ''), {
      type: 'button', draggable: !baca, disabled: baca, 'aria-pressed': String(terpilih === c.id),
      onclick: ev => { ev.stopPropagation(); terpilih = terpilih === c.id ? null : c.id; gambarUlang(); },
      ondragstart: ev => { ev.dataTransfer.setData('text/x-chip', c.id); ev.dataTransfer.effectAllowed = 'move'; terpilih = c.id; },
    }, teks(c.teks), gambar(c.gambar));
    return el;
  };
  const pasangDrop = (el, zid) => {
    if (baca) return;
    el.addEventListener('dragover', ev => { ev.preventDefault(); el.classList.add('sasaran'); });
    el.addEventListener('dragleave', () => el.classList.remove('sasaran'));
    el.addEventListener('drop', ev => {
      ev.preventDefault(); el.classList.remove('sasaran');
      const id = ev.dataTransfer.getData('text/x-chip');
      if (id) { terpilih = id; taruh(zid); }
    });
  };
  const taruh = zid => {
    if (baca || !terpilih) return;
    if (zid && satuPerZona) {
      for (const [cid, z] of Object.entries(letak)) if (z === zid && cid !== terpilih) delete letak[cid];
    }
    if (zid) letak[terpilih] = zid; else delete letak[terpilih];
    terpilih = null;
    onUbah({ ...letak });
    gambarUlang();
  };
  gambarUlang();
  isi.append(wadah);
}

function jodoh(isi, soal, k, jawaban, ubah, baca) {
  // jawaban: {idKiri: idKanan}  → letak: {idKanan: idKiri}
  const letak = {};
  for (const [kiri, kanan] of Object.entries(jawaban || {})) letak[kanan] = kiri;
  penempatan(isi, {
    chip: k.kanan || [],
    zona: (k.kiri || []).map(z => ({ id: z.id, label: stripTeks(z.teks), kepala: h('div.zona-kepala', teks(z.teks), gambar(z.gambar)) })),
    satuPerZona: true, letak, baca, kelasZona: 'zona-jodoh', labelBank: 'Bank jawaban',
    onUbah: l => {
      const j = {};
      for (const [kanan, kiri] of Object.entries(l)) j[kiri] = kanan;
      ubah(Object.keys(j).length ? j : null);
    },
  });
}

function kelompok(isi, soal, k, jawaban, ubah, baca) {
  penempatan(isi, {
    chip: k.item || [],
    zona: (k.kategori || []).map(z => ({ id: z.id, label: stripTeks(z.teks), kepala: h('div.zona-kepala', teks(z.teks)) })),
    satuPerZona: false, letak: { ...(jawaban || {}) }, baca, kelasZona: 'zona-kelompok', labelBank: 'Item yang belum dikelompokkan',
    onUbah: l => ubah(Object.keys(l).length ? l : null),
  });
}

const stripTeks = s => String(s || '').replace(/[`*]/g, '').slice(0, 60);

// ---------------------------------------------------------------- urut
function urut(isi, soal, k, jawaban, ubah, baca) {
  const peta = Object.fromEntries((k.item || []).map(x => [x.id, x]));
  let susunan = Array.isArray(jawaban) && jawaban.every(id => peta[id]) && jawaban.length === (k.item || []).length
    ? [...jawaban] : (k.item || []).map(x => x.id);
  const sudah = Array.isArray(jawaban) && jawaban.length > 0;
  const daftar = h('ol.urut-daftar');
  let seret = null;
  const gambarUlang = () => {
    daftar.replaceChildren(...susunan.map((id, i) => {
      const li = h('li.urut-item', { draggable: !baca, 'data-id': id },
        h('span.urut-pegangan', { 'aria-hidden': 'true' }, '⋮⋮'),
        h('span.urut-no', i + 1),
        h('span.urut-teks', teks(peta[id].teks), gambar(peta[id].gambar)),
        baca ? null : h('span.urut-tombol',
          h('button.btn-ikon', { type: 'button', 'aria-label': 'Naikkan', disabled: i === 0, onclick: () => geser(i, i - 1) }, '▲'),
          h('button.btn-ikon', { type: 'button', 'aria-label': 'Turunkan', disabled: i === susunan.length - 1, onclick: () => geser(i, i + 1) }, '▼')));
      if (!baca) {
        li.addEventListener('dragstart', ev => { seret = i; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', ''); li.classList.add('diseret'); });
        li.addEventListener('dragend', () => li.classList.remove('diseret'));
        li.addEventListener('dragover', ev => { ev.preventDefault(); li.classList.add('sasaran'); });
        li.addEventListener('dragleave', () => li.classList.remove('sasaran'));
        li.addEventListener('drop', ev => { ev.preventDefault(); li.classList.remove('sasaran'); if (seret != null) geser(seret, i); seret = null; });
      }
      return li;
    }));
  };
  const geser = (dari, ke) => {
    if (ke < 0 || ke >= susunan.length || dari === ke) return;
    const [x] = susunan.splice(dari, 1); susunan.splice(ke, 0, x);
    gambarUlang(); ubah([...susunan]); tanda.replaceChildren();
  };
  const tanda = h('div.urut-tetap');
  if (!sudah && !baca) tanda.append(h('button.btn.btn-kecil', { type: 'button', onclick: () => { ubah([...susunan]); tanda.replaceChildren(); } }, 'Tetapkan urutan ini'));
  gambarUlang();
  isi.append(daftar, tanda);
}

// ---------------------------------------------------------------- isian dropdown
function isian(isi, soal, k, jawaban, ubah, baca) {
  const nilai = { ...(jawaban || {}) };
  const celah = Object.fromEntries((k.celah || []).map(c => [c.id, c]));
  const p = h('div.soal-teks.isian-teks');
  const bagian = String(k.teks || '').split(/(\{\{[^}]+\}\})/g);
  let no = 0;
  for (const b of bagian) {
    const m = b.match(/^\{\{([^}]+)\}\}$/);
    if (m && celah[m[1]]) {
      no++;
      const c = celah[m[1]];
      const s = h('select.isian-pilih' + (nilai[c.id] ? '.terisi' : ''), {
        disabled: baca, 'aria-label': 'Bagian kosong ' + no,
        onchange: ev => {
          if (ev.target.value) nilai[c.id] = ev.target.value; else delete nilai[c.id];
          ev.target.classList.toggle('terisi', !!ev.target.value);
          ubah(Object.keys(nilai).length ? { ...nilai } : null);
        },
      }, h('option', { value: '' }, '(' + no + ') pilih…'),
        (c.opsi || []).map(o => h('option', { value: o.id, selected: nilai[c.id] === o.id }, o.teks)));
      p.append(s);
    } else if (b) p.append(teks(b));
  }
  isi.prepend(...[p, gambar(k.gambar)].filter(Boolean));
}

/** Ringkasan jawaban dalam bentuk teks (dipakai di halaman hasil admin) */
export function ringkasJawaban(soal, j) {
  const k = soal.konten || {};
  const t = id => {
    const cari = arr => (arr || []).find(x => x.id === id);
    const x = cari(k.opsi) || cari(k.kanan) || cari(k.kiri) || cari(k.item) || cari(k.kategori) || cari(k.pernyataan)
      || (k.celah || []).flatMap(c => c.opsi || []).find(o => o.id === id);
    return x ? stripTeks(x.teks) : id;
  };
  if (!terisi(j)) return '— tidak dijawab —';
  switch (soal.tipe) {
    case 'pg': return t(j);
    case 'pgk': case 'urut': return j.map(t).join(soal.tipe === 'urut' ? ' → ' : '; ');
    case 'bs': return Object.entries(j).map(([p, v]) => `${t(p)}: ${v ? 'B' : 'S'}`).join('; ');
    case 'isian': return Object.entries(j).map(([c, o], i) => `(${i + 1}) ${t(o)}`).join('; ');
    default: return Object.entries(j).map(([a, b]) => `${t(a)} → ${t(b)}`).join('; ');
  }
}
