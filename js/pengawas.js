// Pengawasan di sisi browser: cek sistem, kamera, berbagi layar, layar penuh,
// deteksi pindah tab/jendela, blokir salin-tempel, dan pengambilan bukti.
// Catatan: lapisan ini mendeteksi & mencatat. Keamanan inti tetap di database.

export const NAMA_PELANGGARAN = {
  pindah_tab: 'Pindah tab / meminimalkan',
  fokus_hilang: 'Pindah ke aplikasi atau jendela lain',
  keluar_layar_penuh: 'Keluar dari layar penuh',
  jendela_kecil: 'Ukuran jendela diperkecil',
  layar_ganda: 'Monitor tambahan terdeteksi',
  berbagi_layar_berhenti: 'Berbagi layar dihentikan',
  kamera_mati: 'Kamera mati atau terputus',
  tab_ganda: 'Ujian dibuka di tab lain',
  perangkat_lain: 'Mencoba masuk dari perangkat lain',
  shortcut: 'Menekan tombol pintas terlarang',
  salin_tempel: 'Mencoba menyalin/menempel',
  klik_kanan: 'Klik kanan',
  offline: 'Koneksi terputus',
  wajah: 'Wajah tidak terdeteksi',
  lainnya: 'Catatan lain',
};

export function cekPeramban() {
  const ua = navigator.userAgent;
  const brands = navigator.userAgentData?.brands?.map(b => b.brand) || [];
  const chromium = brands.some(b => /Chromium|Google Chrome|Microsoft Edge/.test(b)) || /Chrome\/\d+/.test(ua) && !/OPR|Firefox/.test(ua);
  const mobile = navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(ua);
  const tanpaMouse = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  return {
    peramban: { ok: chromium, pesan: chromium ? 'Google Chrome / Microsoft Edge' : 'Gunakan Google Chrome atau Microsoft Edge versi terbaru di laptop/PC.' },
    perangkat: { ok: !mobile && !tanpaMouse, pesan: !mobile && !tanpaMouse ? 'Laptop / PC' : 'Ujian hanya bisa dikerjakan dari laptop atau PC, bukan HP/tablet.' },
    layarTunggal: cekLayarTunggal(),
  };
}

export function cekLayarTunggal() {
  if (!('isExtended' in screen)) return { ok: true, pesan: 'Tidak dapat diperiksa di peramban ini' };
  return screen.isExtended
    ? { ok: false, pesan: 'Terdeteksi lebih dari satu monitor. Cabut monitor tambahan, lalu periksa ulang.' }
    : { ok: true, pesan: 'Satu monitor' };
}

export class Pengawas {
  /**
   * @param {object} p
   * @param {object} p.ujian   {wajib_kamera, wajib_layar, interval_bukti_detik}
   * @param {function} p.lapor (jenis, detail) => Promise<{violation_id?}>
   * @param {function} p.unggah (jenis, blob, violationId) => Promise
   * @param {function} p.onHalangan (daftarHalangan[]) dipanggil saat kondisi wajib berubah
   * @param {string} p.kanal   nama BroadcastChannel (deteksi tab ganda)
   */
  constructor(p) {
    Object.assign(this, p);
    this.kamera = null; this.layar = null;
    this.vKamera = document.createElement('video');
    this.vLayar = document.createElement('video');
    for (const v of [this.vKamera, this.vLayar]) { v.muted = true; v.playsInline = true; }
    this.aktif = false;
    this.sedangMeminta = false;
    this.terakhirLapor = {};
    this.lepas = [];
    this.tabGanda = false;
  }

  // ------------------------------------------------------------ izin media
  async mintaKamera() {
    this.kamera?.getTracks().forEach(t => t.stop());
    this.sedangMeminta = true;
    try {
      this.kamera = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
    } finally { this.sedangMeminta = false; }
    this.vKamera.srcObject = this.kamera;
    await this.vKamera.play().catch(() => { });
    const t = this.kamera.getVideoTracks()[0];
    t.addEventListener('ended', () => this.#mediaPutus('kamera'));
    t.addEventListener('mute', () => setTimeout(() => t.muted && this.#mediaPutus('kamera'), 3000));
    this.#periksaHalangan();
    return this.kamera;
  }

  async mintaLayar() {
    this.layar?.getTracks().forEach(t => t.stop());
    this.sedangMeminta = true;
    let s;
    try {
      s = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor', frameRate: { max: 5 } }, audio: false,
        monitorTypeSurfaces: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'exclude', systemAudio: 'exclude',
      });
    } finally { this.sedangMeminta = false; }
    const t = s.getVideoTracks()[0];
    const jenis = t.getSettings().displaySurface;
    if (jenis && jenis !== 'monitor') {
      s.getTracks().forEach(x => x.stop());
      throw new Error('Pilih "Seluruh layar" (Entire screen), bukan tab atau jendela.');
    }
    this.layar = s;
    this.vLayar.srcObject = s;
    await this.vLayar.play().catch(() => { });
    t.addEventListener('ended', () => this.#mediaPutus('layar'));
    this.#periksaHalangan();
    return s;
  }

  async masukLayarPenuh() {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    try { await navigator.keyboard?.lock?.(['Escape', 'MetaLeft', 'MetaRight', 'AltLeft', 'Tab']); } catch { }
    this.#periksaHalangan();
  }

  kameraHidup() { return !!this.kamera && this.kamera.getVideoTracks().some(t => t.readyState === 'live'); }
  layarHidup() { return !!this.layar && this.layar.getVideoTracks().some(t => t.readyState === 'live'); }

  /** Kondisi wajib yang belum terpenuhi */
  halangan() {
    const h = [];
    if (!document.fullscreenElement) h.push('layar_penuh');
    if (this.ujian.wajib_kamera && !this.kameraHidup()) h.push('kamera');
    if (this.ujian.wajib_layar && !this.layarHidup()) h.push('layar');
    if (!cekLayarTunggal().ok) h.push('layar_ganda');
    if (this.tabGanda) h.push('tab_ganda');
    return h;
  }

  statusKlien() {
    return {
      fs: !!document.fullscreenElement, vis: document.visibilityState === 'visible', fokus: document.hasFocus(),
      kam: this.kameraHidup(), lyr: this.layarHidup(), mon: cekLayarTunggal().ok,
      w: innerWidth, sw: screen.width,
    };
  }

  // ------------------------------------------------------------ mulai/berhenti
  mulai() {
    if (this.aktif) return;
    this.aktif = true;
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); this.lepas.push(() => t.removeEventListener(ev, fn, o)); };

    on(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') this.#catat('pindah_tab'); });
    on(window, 'blur', () => {
      setTimeout(() => {
        if (this.sedangMeminta || document.visibilityState === 'hidden' || document.hasFocus()) return;
        this.#catat('fokus_hilang');
      }, 300);
    });
    on(document, 'fullscreenchange', () => {
      if (!document.fullscreenElement) this.#catat('keluar_layar_penuh');
      this.#periksaHalangan();
    });
    on(window, 'resize', () => {
      clearTimeout(this._rt);
      this._rt = setTimeout(() => {
        if (document.fullscreenElement && innerWidth < screen.width * 0.9) this.#catat('jendela_kecil', `${innerWidth}px dari ${screen.width}px`);
      }, 800);
    });
    if ('onchange' in screen) on(screen, 'change', () => {
      if (!cekLayarTunggal().ok) this.#catat('layar_ganda');
      this.#periksaHalangan();
    });

    // blokir salin, tempel, klik kanan, seret teks, cetak, tombol pintas
    const tolak = (jenis) => ev => { ev.preventDefault(); this.#catat(jenis, ev.type, true); };
    on(document, 'copy', tolak('salin_tempel'), true);
    on(document, 'cut', tolak('salin_tempel'), true);
    on(document, 'paste', tolak('salin_tempel'), true);
    on(document, 'contextmenu', tolak('klik_kanan'), true);
    on(document, 'selectstart', ev => { if (!ev.target.closest?.('input, textarea')) ev.preventDefault(); }, true);
    on(document, 'dragstart', ev => { if (!ev.target.closest?.('[draggable="true"]')) ev.preventDefault(); }, true);
    on(window, 'beforeprint', () => this.#catat('shortcut', 'cetak', true));
    on(document, 'keydown', ev => {
      const k = ev.key?.toLowerCase();
      const ctrl = ev.ctrlKey || ev.metaKey;
      const terlarang = k === 'f12' || k === 'printscreen'
        || (ctrl && ev.shiftKey && ['i', 'j', 'c', 'k', 's'].includes(k))
        || (ctrl && ['c', 'x', 'v', 'a', 'p', 's', 'u', 'f', 'g', 'h', 'j', 'o', 'n', 't', 'w', 'r'].includes(k))
        || (ev.altKey && ['arrowleft', 'arrowright', 'home', 'f4'].includes(k))
        || k === 'f5' || k === 'f11' || k === 'f3';
      if (terlarang) {
        ev.preventDefault(); ev.stopPropagation();
        this.#catat('shortcut', (ctrl ? 'Ctrl+' : '') + (ev.shiftKey ? 'Shift+' : '') + (ev.altKey ? 'Alt+' : '') + ev.key, true);
      }
    }, true);

    // deteksi tab ganda
    if ('BroadcastChannel' in window && this.kanal) {
      const bc = new BroadcastChannel(this.kanal);
      const sayaId = Math.random().toString(36).slice(2);
      const mulaiPada = Date.now();
      bc.onmessage = ev => {
        const m = ev.data || {};
        if (m.dari === sayaId) return;
        if (m.t === 'halo') bc.postMessage({ t: 'ada', dari: sayaId, sejak: mulaiPada });
        if (m.t === 'ada' && m.sejak < mulaiPada) { this.tabGanda = true; this.#catat('tab_ganda'); this.#periksaHalangan(); }
      };
      bc.postMessage({ t: 'halo', dari: sayaId });
      this.lepas.push(() => bc.close());
    }

    // bukti berkala (dengan sedikit jitter agar tidak bisa ditebak)
    const jadwal = () => {
      const dasar = (this.ujian.interval_bukti_detik || 60) * 1000;
      this._bt = setTimeout(async () => { await this.ambilBukti(null); if (this.aktif) jadwal(); }, dasar * (0.7 + Math.random() * 0.6));
    };
    setTimeout(() => this.ambilBukti(null), 4000);
    jadwal();
    this.#periksaHalangan();
  }

  berhenti() {
    this.aktif = false;
    clearTimeout(this._bt);
    this.lepas.forEach(f => f()); this.lepas = [];
    this.kamera?.getTracks().forEach(t => t.stop());
    this.layar?.getTracks().forEach(t => t.stop());
    try { navigator.keyboard?.unlock?.(); } catch { }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  }

  // ------------------------------------------------------------ bukti
  async #frame(video, lebarMaks, kualitas) {
    if (!video.srcObject || video.readyState < 2 || !video.videoWidth) return null;
    const skala = Math.min(1, lebarMaks / video.videoWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(video.videoWidth * skala); c.height = Math.round(video.videoHeight * skala);
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', kualitas));
  }

  async ambilBukti(violationId) {
    const tugas = [];
    if (this.kameraHidup()) tugas.push(this.#frame(this.vKamera, 360, 0.6).then(b => b && this.unggah('kamera', b, violationId)));
    if (this.layarHidup()) tugas.push(this.#frame(this.vLayar, 1280, 0.5).then(b => b && this.unggah('layar', b, violationId)));
    await Promise.allSettled(tugas);
  }

  /** Pratinjau kamera kecil untuk peserta */
  pasangPratinjau(videoEl) { if (this.kamera) { videoEl.srcObject = this.kamera; videoEl.play().catch(() => { }); } }

  // ------------------------------------------------------------ internal
  #mediaPutus(jenis) {
    if (!this.aktif) { this.#periksaHalangan(); return; }
    this.#catat(jenis === 'kamera' ? 'kamera_mati' : 'berbagi_layar_berhenti');
    this.#periksaHalangan();
  }

  #periksaHalangan() { this.onHalangan?.(this.halangan()); }

  async #catat(jenis, detail = null, info = false) {
    if (!this.aktif) return;
    // throttle lokal: kejadian yang sama dalam 2 detik dianggap satu; info maks 1 per 20 detik
    const now = Date.now();
    const jeda = info ? 20000 : 2000;
    if (now - (this.terakhirLapor[jenis] || 0) < jeda) return;
    this.terakhirLapor[jenis] = now;
    try {
      const r = await this.lapor(jenis, detail);
      if (r?.dihitung && r.violation_id) this.ambilBukti(r.violation_id);
    } catch { }
  }
}
