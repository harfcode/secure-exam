import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Galat dari RPC. kode: 'TOKEN' | 'SELESAI' | 'TERKUNCI' | 'PERANGKAT_LAIN' | 'JARINGAN' | 'SERVER' */
export class GalatUjian extends Error {
  constructor(kode, pesan) { super(pesan); this.kode = kode; }
}

/** Panggil fungsi RPC; melempar GalatUjian bila server mengembalikan galat. */
export async function rpc(nama, args = {}) {
  let res;
  try {
    res = await sb.rpc(nama, args);
  } catch (e) {
    throw new GalatUjian('JARINGAN', 'Koneksi ke server terputus. Periksa internet Anda.');
  }
  if (res.error) {
    const m = res.error.message || 'Terjadi kesalahan di server';
    if (/Failed to fetch|NetworkError|fetch/i.test(m)) throw new GalatUjian('JARINGAN', 'Koneksi ke server terputus. Periksa internet Anda.');
    if (/JWT|login/i.test(m)) throw new GalatUjian('LOGIN', 'Sesi login berakhir. Silakan login ulang.');
    throw new GalatUjian('SERVER', m.replace(/^[A-Z_]+: /, ''));
  }
  const d = res.data;
  if (d && typeof d === 'object' && !Array.isArray(d) && d.galat) throw new GalatUjian(d.galat, d.pesan);
  return d;
}

/** Pembuat elemen ringkas: h('div.kelas#id', {atribut}, ...anak) */
export function h(tag, attrs, ...anak) {
  const [, nama, sisa] = tag.match(/^([a-z0-9-]+)(.*)$/i);
  const el = document.createElement(nama);
  (sisa.match(/[.#][^.#]+/g) || []).forEach(t => t[0] === '.' ? el.classList.add(t.slice(1)) : (el.id = t.slice(1)));
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { anak.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && k !== 'list' && k !== 'form') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const a of anak.flat(Infinity)) {
    if (a == null || a === false) continue;
    el.append(a instanceof Node ? a : document.createTextNode(String(a)));
  }
  return el;
}

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Teks soal: aman (di-escape), baris baru, `kode`, **tebal** */
export function teksKaya(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

let toastWadah;
export function toast(pesan, jenis = 'info', ms = 3500) {
  if (!toastWadah) { toastWadah = h('div.toast-wadah', { role: 'status', 'aria-live': 'polite' }); document.body.append(toastWadah); }
  const t = h('div.toast.toast-' + jenis, pesan);
  toastWadah.append(t);
  setTimeout(() => t.classList.add('hilang'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

/** Dialog modal sederhana. tombol: [{teks, nilai, gaya}] → Promise<nilai> */
export function dialog({ judul, isi, tombol = [{ teks: 'Tutup', nilai: null }], lebar }) {
  return new Promise(resolve => {
    const latar = h('div.modal-latar');
    const kotak = h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': judul || 'Dialog' });
    if (lebar) kotak.style.maxWidth = lebar;
    const tutup = v => { latar.remove(); resolve(v); };
    kotak.append(
      judul ? h('h2.modal-judul', judul) : null,
      h('div.modal-isi', isi instanceof Node ? isi : h('p', isi)),
      h('div.modal-aksi', tombol.map(t => h('button.btn' + (t.gaya ? '.btn-' + t.gaya : ''), {
        type: 'button', onclick: () => tutup(typeof t.nilai === 'function' ? t.nilai() : t.nilai),
      }, t.teks))),
    );
    latar.append(kotak);
    document.body.append(latar);
    const pertama = kotak.querySelector('input, textarea, select') || kotak.querySelector('.modal-aksi .btn:last-child');
    pertama?.focus();
  });
}

export const konfirmasi = (judul, isi, teksYa = 'Ya', gaya = 'utama') =>
  dialog({ judul, isi, tombol: [{ teks: 'Batal', nilai: false }, { teks: teksYa, nilai: true, gaya }] });

export function idPerangkat() {
  const K = 'harfcode-ujian-perangkat';
  let v = null;
  try { v = localStorage.getItem(K); } catch { }
  if (!v || v.length < 16) {
    v = (crypto.randomUUID?.() || Math.random().toString(36).slice(2)) + '-' + Date.now().toString(36);
    try { localStorage.setItem(K, v); } catch { }
  }
  return v;
}

export const simpanLokal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
export const bacaLokal = (k, d = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

const fmtTgl = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtJam = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const tanggal = d => d ? fmtTgl.format(new Date(d)) : '–';
export const jam = d => d ? fmtJam.format(new Date(d)) : '–';

export function durasi(detik) {
  detik = Math.max(0, Math.floor(detik));
  const j = Math.floor(detik / 3600), m = Math.floor((detik % 3600) / 60), s = detik % 60;
  const dd = n => String(n).padStart(2, '0');
  return (j ? j + ':' : '') + dd(m) + ':' + dd(s);
}

export function relatif(detikLalu) {
  if (detikLalu == null) return 'belum pernah';
  if (detikLalu < 60) return Math.round(detikLalu) + ' dtk lalu';
  if (detikLalu < 3600) return Math.round(detikLalu / 60) + ' mnt lalu';
  return Math.round(detikLalu / 3600) + ' jam lalu';
}

export const tunda = ms => new Promise(r => setTimeout(r, ms));

export function konfigTerisi() {
  return !/XXXXXXXX|ISI_ANON_KEY/.test(SUPABASE_URL + SUPABASE_ANON_KEY);
}

/** Layar login bersama (peserta & admin) — masuk dengan akun Google */
export function layarLogin(wadah, { judul, sub }) {
  const pesan = h('p.form-pesan', { role: 'alert' });
  // galat dari Google/Supabase dikembalikan lewat URL
  const q = new URLSearchParams(location.search + '&' + location.hash.slice(1));
  if (q.get('error_description')) pesan.textContent = 'Gagal masuk: ' + q.get('error_description').replace(/\+/g, ' ');
  const tombol = h('button.btn.btn-google.btn-penuh', { type: 'button' },
    h('span.google-logo', { 'aria-hidden': 'true', html: LOGO_GOOGLE }), 'Masuk dengan Google');
  tombol.onclick = async () => {
    tombol.disabled = true; pesan.textContent = '';
    const kembali = location.origin + location.pathname;
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: kembali, queryParams: { prompt: 'select_account' } },
    });
    if (error) { pesan.textContent = error.message; tombol.disabled = false; }
  };
  wadah.replaceChildren(h('div.halaman-tengah', h('div.kartu.form-login',
    h('h1.login-judul', judul), sub ? h('p.redup', sub) : null,
    tombol, pesan,
    h('p.redup.kecil', 'Gunakan akun Google kampus Anda. Saat pertama masuk, Anda akan diminta mengisi NIM dan nama.'))));
  tombol.focus();
}

const LOGO_GOOGLE = '<svg viewBox="0 0 48 48" width="20" height="20"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

/** Bersihkan sisa token/galat OAuth dari bilah alamat */
export function rapikanUrl() {
  if (location.hash.includes('access_token') || location.hash.includes('error') || location.search.includes('code=') || location.search.includes('error')) {
    history.replaceState(null, '', location.origin + location.pathname);
  }
}

export function layarKonfigKosong(wadah) {
  wadah.replaceChildren(h('div.halaman-tengah', h('div.kartu',
    h('h1', 'Konfigurasi belum diisi'),
    h('p', 'Buka berkas ', h('code', 'js/config.js'), ' lalu isi SUPABASE_URL dan SUPABASE_ANON_KEY dari project Supabase Anda.'))));
}
