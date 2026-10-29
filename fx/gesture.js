  /* ================= GESTUR TANGAN — runtime resmi Teachable Machine (@teachablemachine/image) ================= */
  var GEST_STORE = 'microbitGesture2';
  var GEST_DEFAULTS = {
    url: 'https://teachablemachine.withgoogle.com/models/dLWidtkCQ/',
    mirror: true, send: true,
    conf: 0.65, holdMs: 150, cooldownMs: 900,
    map: {}
  };
  var GEST_ACTIONS = {
    none:    { text: '— (tanpa aksi)', mode: 'idle' },
    atas:    { text: 'Gerak: naik ▲',  mode: 'hold', dir: 'atas' },
    bawah:   { text: 'Gerak: turun ▼', mode: 'hold', dir: 'bawah' },
    kiri:    { text: 'Gerak: kiri ◀',  mode: 'hold', dir: 'kiri' },
    kanan:   { text: 'Gerak: kanan ▶', mode: 'hold', dir: 'kanan' },
    stop:    { text: 'Berhenti ■',     mode: 'once' },
    lampu:   { text: 'Lampu: nyalakan/matikan', mode: 'once' },
    fanup:   { text: 'Kipas: +15%',    mode: 'once' },
    fandown: { text: 'Kipas: −15%',    mode: 'once' }
  };
  var GEST_MIN_MS = 80;        // jarak antar prediksi (~12 fps)
  var GEST_RELEASE_GRACE = 260; // ms sebelum dianggap "lepas" (anti-kedip)

  function gestReadCfg() {
    try {
      var raw = localStorage.getItem(GEST_STORE);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          var c = Object.assign({}, GEST_DEFAULTS, p);
          c.map = (p.map && typeof p.map === 'object') ? p.map : {};
          return c;
        }
      }
    } catch (e) { /* abaikan */ }
    return JSON.parse(JSON.stringify(GEST_DEFAULTS));
  }

  var gest = {
    cfg: gestReadCfg(),
    model: null, modelUrl: null, labels: [],
    stream: null, running: false, loading: false, inFlight: false,
    rafId: 0, lastAt: 0, lastRateAt: 0, startedAt: 0, predCount: 0,
    frameErrors: 0, errShown: false, videoWarned: false,
    ema: {}, candidate: null, candidateSince: 0,
    accepted: null, unstableSince: 0, lastActionAt: {}, sendWarned: false
  };
  function gestSaveCfg() { try { localStorage.setItem(GEST_STORE, JSON.stringify(gest.cfg)); } catch (e) { /* abaikan */ } }

  var G = {
    stage: $('gestStage'), video: $('gestVideo'), badge: $('gestBadge'),
    startBtn: $('gestStartBtn'), stopBtn: $('gestStopBtn'),
    urlIn: $('gestUrlInput'), loadBtn: $('gestLoadBtn'),
    mirror: $('gestMirror'), status: $('gestStatus'),
    top: $('gestTop'), topLabel: $('gestTopLabel'), topConf: $('gestTopConf'),
    rate: $('gestRate'), stateLbl: $('gestState'), bars: $('gestBars'),
    conf: $('gestConf'), confVal: $('gestConfVal'),
    hold: $('gestHold'), holdVal: $('gestHoldVal'),
    cd: $('gestCd'), cdVal: $('gestCdVal'),
    mapWrap: $('gestMap'), send: $('gestSend')
  };
  G.urlIn.value = gest.cfg.url;

  function gestSetStatus(msg, isError) {
    G.status.textContent = msg;
    G.status.classList.toggle('err', !!isError);
  }
  function gestMapOf(label) {
    var k = gest.cfg.map[label];
    return GEST_ACTIONS[k] || GEST_ACTIONS[gestAutoMap(label)];
  }
  function gestAutoMap(label) {
    var s = String(label).toLowerCase();
    if (/stop|berhenti|diam|rest/.test(s)) return 'stop';
    if (/(^|[^a-z])(up|atas|naik|↑)([^a-z]|$)/.test(s)) return 'atas';
    if (/(^|[^a-z])(down|bawah|turun|↓)([^a-z]|$)/.test(s)) return 'bawah';
    if (/(^|[^a-z])(left|kiri|←)([^a-z]|$)/.test(s)) return 'kiri';
    if (/(^|[^a-z])(right|kanan|→)([^a-z]|$)/.test(s)) return 'kanan';
    if (/lampu|light|led/.test(s)) return 'lampu';
    if (/kipas|fan/.test(s)) return 'fanup';
    return 'none';
  }
  function gestNormalizeUrl(u) {
    u = String(u || '').trim();
    u = u.replace(/\/?model\.json\/?$/i, '');
    if (u && !/\/$/.test(u)) u += '/';
    return u;
  }

  /* --- pemuat runtime resmi TM dengan fallback CDN (lazy: tidak memperlambat halaman) --- */
  var tmPromise = null;
  function ensureTM() {
    if (window.tmImage) return Promise.resolve();
    if (tmPromise) return tmPromise;
    var sources = [
      'https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.5/dist/teachablemachine-image.min.js',
      'https://unpkg.com/@teachablemachine/image@0.8.5/dist/teachablemachine-image.min.js'
    ];
    tmPromise = new Promise(function (resolve, reject) {
      (function tryNext(i) {
        if (i >= sources.length) { reject(new Error('Gagal mengunduh runtime Teachable Machine — butuh internet.')); return; }
        var s = document.createElement('script');
        s.src = sources[i]; s.async = true;
        s.onload = function () { window.tmImage ? resolve() : tryNext(i + 1); };
        s.onerror = function () { tryNext(i + 1); };
        document.head.appendChild(s);
      })(0);
    });
    tmPromise = tmPromise.catch(function (e) { tmPromise = null; throw e; });
    return tmPromise;
  }
  function gestFetchLabels(url) {
    return fetch(url + 'metadata.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { return m && (m.labels || m.wordLabels) || null; })
      .catch(function () { return null; });
  }

  function gestAfterLoad(model, labels) {
    gest.model = model;
    var lb = (Array.isArray(labels) && labels.length) ? labels : (model.getClasses ? [] : []);
    try { if (!lb.length && typeof model.getClasses === 'function') lb = model.getClasses() || []; } catch (e) { lb = []; }
    if (!lb.length) lb = ['Kelas 1']; // akan diselaraskan otomatis dari prediksi pertama
    gest.labels = lb.slice();
    gest.ema = {};
    gestRenderBars();
    gestRenderMap();
    G.urlIn.value = gest.modelUrl;
    gest.cfg.url = gest.modelUrl; gestSaveCfg();
    var n = (model.getTotalClasses && model.getTotalClasses()) || lb.length;
    G.loadBtn.textContent = 'Muat ulang';
    G.loadBtn.disabled = false;
    gest.loading = false;
    if (n && gest.labels[0] !== 'Kelas 1' && n !== gest.labels.length) {
      gestSetStatus('Model siap — kelas akan disinkronkan pada prediksi pertama.', false);
    } else {
      gestSetStatus('Model siap — ' + gest.labels.length + ' kelas: ' + gest.labels.join(', ') + '.', false);
    }
    return true;
  }

  function gestLoadModel() {
    if (gest.loading) return Promise.resolve(false);
    var url = gestNormalizeUrl(G.urlIn.value);
    if (!/^https:\/\/teachablemachine\.withgoogle\.com\/models\/[A-Za-z0-9_-]+\/$/.test(url)) {
      toast('Tautan tidak dikenali. Contoh: https://teachablemachine.withgoogle.com/models/XXXXX/', 'error');
      return Promise.resolve(false);
    }
    gest.loading = true;
    G.loadBtn.disabled = true;
    G.loadBtn.textContent = 'Memuat…';
    gestSetStatus('Mengunduh model Teachable Machine… (± 15 MB, sekali lalu cache browser)', false);
    return ensureTM()
      .then(function () { return gestFetchLabels(url); })
      .then(function (labels) {
        gest.pendingLabels = labels;
        return window.tmImage.load(url + 'model.json', url + 'metadata.json');
      })
      .then(function (model) {
        gest.modelUrl = url;
        return gestAfterLoad(model, gest.pendingLabels || []);
      })
      .catch(function (err) {
        gest.loading = false;
        G.loadBtn.disabled = false;
        G.loadBtn.textContent = 'Muat model';
        var m = err && err.message ? err.message : String(err);
        gestSetStatus('Gagal memuat model: ' + m, true);
        toast('Gagal memuat model — periksa tautan & koneksi internet.', 'error');
        return false;
      });
  }

  /* --- kamera --- */
  function gestStartCam() {
    if (gest.stream) return Promise.resolve(true);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      gestSetStatus('Kamera tidak tersedia di konteks ini — butuh HTTPS atau localhost.', true);
      toast('Kamera butuh izin & halaman HTTPS/localhost.', 'error');
      return Promise.resolve(false);
    }
    return navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false
    }).then(function (st) {
      gest.stream = st;
      G.video.srcObject = st;
      return G.video.play().then(function () { return true; }, function () { return true; });
    }).catch(function (err) {
      gestSetStatus('Izin kamera ditolak: ' + (err && err.name ? err.name : 'unknown'), true);
      toast('Kamera ditolak browser — izinkan lalu coba lagi.', 'error');
      return false;
    });
  }
  function gestStopCam() {
    if (gest.stream) { gest.stream.getTracks().forEach(function (t) { t.stop(); }); gest.stream = null; }
    G.video.srcObject = null;
  }

  /* --- selaras label otomatis dari output model (jaga-jaga metadata tak terbaca) --- */
  function gestSyncLabels(preds) {
    var want = preds.map(function (x) { return x.className; });
    var ok = want.length === gest.labels.length && want.every(function (c, i) { return gest.labels[i] === c; });
    if (ok) return;
    gest.labels = want;
    gest.ema = {};
    gestRenderBars();
    gestRenderMap();
  }

  /* --- loop deteksi --- */
  function gestLoop() {
    if (!gest.running) return;
    var now = performance.now();
    if (!gest.inFlight && gest.model && now - gest.lastAt >= GEST_MIN_MS) {
      if (G.video.videoWidth) {
        gest.lastAt = now;
        gest.inFlight = true;
        gest.model.predict(G.video, !!gest.cfg.mirror).then(function (preds) {
          if (Array.isArray(preds) && preds.length) {
            gest.frameErrors = 0;
            gestSyncLabels(preds);
            gestHandle(preds, performance.now());
          }
        }).catch(function (err) {
          gest.frameErrors++;
          if (gest.frameErrors === 1 || gest.frameErrors % 60 === 0) {
            var m = 'Predict error: ' + (err && err.message ? err.message : err);
            gestSetStatus(m, true);
            if (!gest.errShown) {
              gest.errShown = true;
              toast('Mesin deteksi error — buka halaman Gestur untuk detail.', 'error');
              logActivity(m, 'err');
            }
          }
        }).then(function () { gest.inFlight = false; });
      } else if (!gest.videoWarned && now - gest.startedAt > 2500) {
        gest.videoWarned = true;
        gestSetStatus('Video kamera belum mengalir — muat ulang halaman lalu izinkan kamera.', true);
      }
    }
    if (now - gest.lastRateAt >= 1000) {
      G.rate.textContent = gest.predCount + ' pred/dtk';
      gest.predCount = 0; gest.lastRateAt = now;
    }
    gest.rafId = requestAnimationFrame(gestLoop);
  }

  /* --- inti akurasi: ambang + voting streak + histeresis + cooldown --- */
  function gestHandle(preds, now) {
    var conf = gest.cfg.conf;
    var top = preds[0];
    var label = (top && top.probability >= conf) ? top.className : null;
    gest.predCount++;

    var byLabel = {};
    for (var i = 0; i < preds.length; i++) byLabel[preds[i].className] = preds[i].probability;
    for (var j = 0; j < gest.labels.length; j++) {
      var lb = gest.labels[j];
      var raw = byLabel[lb] || 0;
      gest.ema[lb] = (gest.ema[lb] == null) ? raw : gest.ema[lb] * 0.6 + raw * 0.4;
    }
    gestUpdateBars(byLabel, top ? top.className : null);

    // umpan balik langsung: readout besar SELALU menampilkan prediksi mentah teratas
    G.topLabel.textContent = top ? top.className : '—';
    G.topConf.textContent = top ? Math.round(top.probability * 100) + '%' : '0%';

    if (label) {
      if (gest.candidate !== label) { gest.candidate = label; gest.candidateSince = now; }
      else if (!gest.accepted && now - gest.candidateSince >= gest.cfg.holdMs) {
        var last = gest.lastActionAt[label] || 0;
        if (now - last >= gest.cfg.cooldownMs) gestAccept(label, top.probability);
      }
      gest.unstableSince = 0;
    } else if (!gest.accepted) {
      gest.candidate = null;
    }

    if (gest.accepted) {
      var still = top && top.className === gest.accepted && top.probability >= conf - 0.06;
      if (!still) {
        if (!gest.unstableSince) gest.unstableSince = now;
        else if (now - gest.unstableSince > GEST_RELEASE_GRACE) gestRelease(true);
      } else gest.unstableSince = 0;
    }

    G.stateLbl.textContent = gest.accepted ? 'AKTIF: ' + gest.accepted
      : (gest.candidate ? 'menahan… ' + Math.round((top ? top.probability : 0) * 100) + '%'
      : (top ? 'belum yakin ' + Math.round(top.probability * 100) + '%' : 'mencari…'));
    G.stateLbl.classList.toggle('hot', !!gest.accepted);
  }

  function gestAccept(label, probability) {
    var act = gestMapOf(label);
    gest.accepted = label;
    gest.lastActionAt[label] = performance.now();
    G.badge.textContent = label + (act.mode === 'idle' ? '' : ' ✓');
    G.badge.hidden = false;
    G.top.classList.add('stable');
    var canCtrl = canControl();
    if (act.mode === 'hold' && canCtrl) {
      dpadPress(act.dir);            // D-pad di layar ikut menyala; perintah arah terkirim
    } else if (act.mode === 'once') {
      gestDoOnce(act, label);
    }
    logActivity('Gerakan ' + label + ' (' + Math.round(probability * 100) + '%) → ' + act.text, act.mode === 'idle' ? 'info' : 'sys');
    var dot = G._dots && G._dots[label];
    if (dot) { dot.classList.add('fire'); setTimeout(function () { dot.classList.remove('fire'); }, 500); }
  }

  function gestRelease(sendStop) {
    if (!gest.accepted) return;
    var act = gestMapOf(gest.accepted);
    if (sendStop && act.mode === 'hold' && canControl()) dpadRelease(); // "stop" sekali, seperti melepas tombol
    gest.accepted = null;
    gest.unstableSince = 0;
    G.top.classList.remove('stable');
    G.badge.hidden = true;
  }

  function gestOfflineWarn() {
    if (gest.cfg.send) {
      if (!gest.sendWarned) {
        gest.sendWarned = true;
        toast('Gerakan terbaca — tapi micro:bit belum terhubung (hasil hanya ditampilkan).', 'warn');
      }
      logActivity('Gerakan ' + gest.accepted + ' tidak dikirim: belum terhubung.', 'warn');
    }
  }

  function gestDoOnce(act, label) {
    if (!canControl()) { gestOfflineWarn(); return; }
    if (act === GEST_ACTIONS.stop) {
      dpadRelease();
    } else if (act === GEST_ACTIONS.lampu) {
      var on = !els.lampuSwitch.checked;
      setLampuUI(on);
      sendData('lampu:' + (on ? 1 : 0));
    } else if (act === GEST_ACTIONS.fanup || act === GEST_ACTIONS.fandown) {
      var cur = Number(els.kipasSlider.value) || 0;
      var v = Math.max(0, Math.min(1023, cur + (act === GEST_ACTIONS.fanup ? 154 : -154)));
      if (state.fan.enabled) setFanAuto(false, true);
      els.kipasSlider.value = v;
      setKipasUI(v);
      sendData('kipas:' + v);
    }
  }

  /* --- rendering UI --- */
  function gestRenderBars() {
    G.bars.innerHTML = '';
    G._bars = {};
    if (!gest.labels.length) { G.bars.innerHTML = '<div class="gbar-top">Muat model untuk melihat kelas.</div>'; return; }
    gest.labels.forEach(function (lb) {
      var row = document.createElement('div'); row.className = 'gbar';
      var topRow = document.createElement('div'); topRow.className = 'gbar-top';
      var name = document.createElement('span'); name.textContent = lb;
      var val = document.createElement('span'); val.className = 'gbar-val'; val.textContent = '0%';
      topRow.appendChild(name); topRow.appendChild(val);
      var track = document.createElement('div'); track.className = 'gbar-track';
      var fill = document.createElement('div'); fill.className = 'gbar-fill';
      track.appendChild(fill);
      row.appendChild(topRow); row.appendChild(track);
      G.bars.appendChild(row);
      G._bars[lb] = { row: row, fill: fill, val: val };
    });
  }
  function gestUpdateBars(byLabel, topName) {
    for (var lb in G._bars) {
      var r = G._bars[lb];
      var sm = Math.max(0, Math.min(1, gest.ema[lb] || 0));
      r.fill.style.width = (sm * 100).toFixed(1) + '%';
      r.val.textContent = Math.round((byLabel[lb] || 0) * 100) + '%';
      r.row.classList.toggle('on', lb === topName);
    }
  }
  function gestRenderMap() {
    G.mapWrap.innerHTML = '';
    G._dots = {};
    if (!gest.labels.length) {
      G.mapWrap.textContent = 'Muat model dulu untuk melihat kelas-kelasnya.';
      return;
    }
    gest.labels.forEach(function (lb) {
      var row = document.createElement('div'); row.className = 'gmap-row'; row.dataset.label = lb;
      var dot = document.createElement('span'); dot.className = 'gmap-dot';
      var name = document.createElement('span'); name.className = 'gmap-label'; name.textContent = lb; name.title = lb;
      var sel = document.createElement('select');
      Object.keys(GEST_ACTIONS).forEach(function (k) {
        var o = document.createElement('option');
        o.value = k; o.textContent = GEST_ACTIONS[k].text;
        sel.appendChild(o);
      });
      if (gest.cfg.map[lb] == null) gest.cfg.map[lb] = gestAutoMap(lb);
      sel.value = gest.cfg.map[lb];
      sel.addEventListener('change', function () {
        gest.cfg.map[lb] = sel.value;
        gestSaveCfg();
        logActivity('Peta gestur: ' + lb + ' → ' + GEST_ACTIONS[sel.value].text, 'sys');
      });
      row.appendChild(dot); row.appendChild(name); row.appendChild(sel);
      G.mapWrap.appendChild(row);
      G._dots[lb] = dot;
    });
    gestSaveCfg();
  }

  /* --- kontrol start/stop --- */
  function gestStart() {
    if (gest.running) return;
    var modelP = gest.model ? Promise.resolve(true) : gestLoadModel();
    var camP = gestStartCam();
    Promise.all([modelP, camP]).then(function (res) {
      if (res[0] === false || res[1] === false) { return; }
      gest.running = true;
      gest.startedAt = performance.now();
      gest.lastRateAt = gest.startedAt;
      gest.videoWarned = false; gest.errShown = false; gest.frameErrors = 0;
      G.stage.classList.add('live');
      G.startBtn.disabled = true;
      G.stopBtn.disabled = false;
      logActivity('Deteksi gestur dimulai (' + gest.labels.join('/') + ').', 'sys');
      gestSetStatus('Mendeteksi… angkat tangan ke kamera dan TAHAN ±0,3 detik.', false);
      gest.rafId = requestAnimationFrame(gestLoop);
    });
  }
  function gestStop() {
    if (!gest.running) return;
    gest.running = false;
    cancelAnimationFrame(gest.rafId);
    gestRelease(false);
    G.stage.classList.remove('live');
    G.startBtn.disabled = false;
    G.stopBtn.disabled = true;
    G.rate.textContent = '0 pred/dtk';
    G.stateLbl.textContent = 'Siaga';
    gestStopCam();
    gestSetStatus(gest.model ? 'Berhenti. Model masih termuat — Mulai lagi tanpa unduh ulang.' : 'Model belum dimuat.', false);
    logActivity('Deteksi gestur dihentikan.', 'sys');
  }

  /* --- wiring UI --- */
  G.startBtn.addEventListener('click', gestStart);
  G.stopBtn.addEventListener('click', gestStop);
  G.loadBtn.addEventListener('click', function () { gestLoadModel(); });
  G.mirror.addEventListener('change', function () {
    gest.cfg.mirror = G.mirror.checked;
    G.stage.classList.toggle('no-mirror', !G.mirror.checked);
    gestSaveCfg();
  });
  G.send.addEventListener('change', function () {
    gest.cfg.send = G.send.checked; gestSaveCfg();
  });
  function bindRange(input, out, fmt, setter) {
    var apply = function (save) {
      setter(Number(input.value));
      out.textContent = fmt(Number(input.value));
      if (save) gestSaveCfg();
    };
    input.addEventListener('input', function () { apply(false); });
    input.addEventListener('change', function () { apply(true); });
  }
  G.conf.value = Math.round(gest.cfg.conf * 100);
  G.hold.value = gest.cfg.holdMs;
  G.cd.value = gest.cfg.cooldownMs;
  bindRange(G.conf, G.confVal, function (v) { return v + '%'; }, function (v) { gest.cfg.conf = v / 100; });
  bindRange(G.hold, G.holdVal, function (v) { return (v / 1000).toFixed(2) + ' dtk'; }, function (v) { gest.cfg.holdMs = v; });
  bindRange(G.cd, G.cdVal, function (v) { return (v / 1000).toFixed(1) + ' dtk'; }, function (v) { gest.cfg.cooldownMs = v; });
  G.confVal.textContent = Math.round(gest.cfg.conf * 100) + '%';
  G.holdVal.textContent = (gest.cfg.holdMs / 1000).toFixed(2) + ' dtk';
  G.cdVal.textContent = (gest.cfg.cooldownMs / 1000).toFixed(1) + ' dtk';
  G.stage.classList.toggle('no-mirror', !gest.cfg.mirror);
  G.mirror.checked = !!gest.cfg.mirror;
  G.send.checked = !!gest.cfg.send;

  // pengaman: tab tersembunyi / fokus hilang → lepas gesture (stop terkirim bila sedang gerak)
  document.addEventListener('visibilitychange', function () { if (document.hidden && gest.accepted) gestRelease(true); });
  window.addEventListener('blur', function () { if (gest.accepted) gestRelease(true); });
