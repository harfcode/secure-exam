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

/** Layar login/daftar bersama (peserta & admin) */
export function layarLogin(wadah, { judul, sub, onMasuk }) {
  let mode = 'masuk';
  const pesan = h('p.form-pesan', { role: 'alert' });
  const email = h('input', { type: 'email', id: 'f-email', autocomplete: 'email', required: true });
  const sandi = h('input', { type: 'password', id: 'f-sandi', autocomplete: 'current-password', required: true, minLength: 8 });
  const tombol = h('button.btn.btn-utama.btn-penuh', { type: 'submit' }, 'Masuk');
  const ganti = h('button.tautan', { type: 'button' }, 'Belum punya akun? Daftar');
  const lupa = h('button.tautan', { type: 'button' }, 'Lupa kata sandi');
  const form = h('form.kartu.form-login', { novalidate: true },
    h('h1.login-judul', judul), sub ? h('p.redup', sub) : null,
    h('label', { for: 'f-email' }, 'Email'), email,
    h('label', { for: 'f-sandi' }, 'Kata sandi'), sandi,
    pesan, tombol, h('div.login-tautan', ganti, lupa));

  ganti.onclick = () => {
    mode = mode === 'masuk' ? 'daftar' : 'masuk';
    tombol.textContent = mode === 'masuk' ? 'Masuk' : 'Buat akun';
    ganti.textContent = mode === 'masuk' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk';
    sandi.autocomplete = mode === 'masuk' ? 'current-password' : 'new-password';
    pesan.textContent = '';
  };
  lupa.onclick = async () => {
    if (!email.value) { pesan.textContent = 'Isi email Anda dulu, lalu klik "Lupa kata sandi".'; return; }
    const { error } = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.href.split('#')[0] });
    pesan.className = 'form-pesan ' + (error ? '' : 'ok');
    pesan.textContent = error ? error.message : 'Tautan atur ulang kata sandi sudah dikirim ke email Anda.';
  };
  form.onsubmit = async ev => {
    ev.preventDefault();
    pesan.className = 'form-pesan'; pesan.textContent = '';
    if (!email.value || sandi.value.length < 8) { pesan.textContent = 'Isi email dan kata sandi (minimal 8 karakter).'; return; }
    tombol.disabled = true;
    try {
      if (mode === 'masuk') {
        const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: sandi.value });
        if (error) throw error;
        onMasuk();
      } else {
        const { data, error } = await sb.auth.signUp({ email: email.value.trim(), password: sandi.value,
          options: { emailRedirectTo: location.href.split('#')[0] } });
        if (error) throw error;
        if (data.session) onMasuk();
        else { pesan.className = 'form-pesan ok'; pesan.textContent = 'Akun dibuat. Buka email Anda untuk konfirmasi, lalu masuk.'; ganti.click(); }
      }
    } catch (e) {
      pesan.textContent = /Invalid login/i.test(e.message) ? 'Email atau kata sandi salah.'
        : /confirm/i.test(e.message) ? 'Email belum dikonfirmasi. Buka tautan di email Anda.' : e.message;
    } finally { tombol.disabled = false; }
  };
  wadah.replaceChildren(h('div.halaman-tengah', form));
  email.focus();
}

export function layarKonfigKosong(wadah) {
  wadah.replaceChildren(h('div.halaman-tengah', h('div.kartu',
    h('h1', 'Konfigurasi belum diisi'),
    h('p', 'Buka berkas ', h('code', 'js/config.js'), ' lalu isi SUPABASE_URL dan SUPABASE_ANON_KEY dari project Supabase Anda.'))));
}
