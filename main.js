(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- Loader ---------------- */
  document.body.classList.add('loading');
  const loader = $('#loader');
  const finishLoader = () => {
    loader.classList.add('done');
    document.body.classList.remove('loading');
    document.body.classList.add('ready');
  };
  if (reduced) finishLoader();
  else {
    setTimeout(() => loader.classList.add('go'), 1450);
    setTimeout(finishLoader, 2700);
    loader.addEventListener('click', finishLoader);
  }

  /* ---------------- Hero video ---------------- */
  const heroVideo = $('#heroVideo');
  if (heroVideo && !reduced) {
    heroVideo.addEventListener('playing', () => heroVideo.classList.add('playing'));
    const tryPlay = () => heroVideo.play().catch(() => {});
    setTimeout(tryPlay, 1800);
  }

  /* ---------------- Topbar ---------------- */
  const topbar = $('.topbar');
  const onScroll = () => topbar.classList.toggle('scrolled', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------------- Reveal ---------------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.18 });
  $$('.reveal').forEach((el) => io.observe(el));

  /* ---------------- Build-up meter ---------------- */
  const buildBars = $('#buildBars');
  const buildPct = $('#buildPct');
  const N = innerWidth < 640 ? 28 : 56;
  for (let i = 0; i < N; i++) buildBars.appendChild(document.createElement('i'));
  const bars = $$('i', buildBars);
  const buildIo = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    buildIo.disconnect();
    bars.forEach((b, i) => {
      const x = i / (N - 1);
      const h = 0.06 + Math.pow(x, 2.2) * 0.94 + Math.sin(i * 1.7) * 0.03;
      setTimeout(() => {
        b.style.transform = `scaleY(${Math.min(1, Math.max(0.04, h))})`;
        b.classList.add('on');
        buildPct.textContent = Math.round(((i + 1) / N) * 100) + '%';
      }, reduced ? 0 : i * 55);
    });
  }, { threshold: 0.5 });
  buildIo.observe(buildBars);

  /* ---------------- Cursor, tilt, eyes ---------------- */
  const cursor = $('#cursor');
  let mx = innerWidth / 2, my = innerHeight / 2;
  addEventListener('pointermove', (e) => {
    mx = e.clientX; my = e.clientY;
    cursor.classList.add('on');
    cursor.style.setProperty('--x', mx + 'px');
    cursor.style.setProperty('--y', my + 'px');
  }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    cursor.classList.toggle('big', !!e.target.closest('a, button, .reel, input'));
  });

  if (!reduced && matchMedia('(hover: hover)').matches) {
    $$('[data-tilt]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.transform = `perspective(900px) rotateY(${(px - 0.5) * 8}deg) rotateX(${(0.5 - py) * 8}deg)`;
        el.style.setProperty('--mx', px * 100 + '%');
        el.style.setProperty('--my', py * 100 + '%');
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  const pupils = $$('.pupil');
  const moveEyes = () => {
    pupils.forEach((p) => {
      const eye = p.parentElement.getBoundingClientRect();
      const cx = eye.left + eye.width / 2, cy = eye.top + eye.height / 2;
      const a = Math.atan2(my - cy, mx - cx);
      const d = Math.min(eye.width * 0.22, Math.hypot(mx - cx, my - cy) / 6);
      p.style.setProperty('--px', Math.cos(a) * d + 'px');
      p.style.setProperty('--py', Math.sin(a) * d + 'px');
    });
  };

  /* ---------------- Share ---------------- */
  const shareBtn = $('#shareBtn'), shareMsg = $('#shareMsg');
  shareBtn.addEventListener('click', async () => {
    const data = { title: 'Sabine van Vessem', text: 'Minder boem boem boem, meer groove. Een naam om in de gaten te houden.', url: location.href };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(location.href);
      shareMsg.textContent = 'Link gekopieerd ✦';
    } catch (_) {
      shareMsg.textContent = location.href;
    }
  });

  /* =========================================================
     Audio: Groove Machine — volledig gesynthetiseerd
     Afgeleid uit de analyse van haar set: 128 BPM, A mineur (frygisch),
     strakke korte kick, korte offbeat-hats (~65 ms), clap op 2 en 4,
     een hypnotische riff op één toon en een vrij donkere mix.
     ========================================================= */
  const ROOT = 0; // A
  const TRACKS = ['Kick', 'Clap', 'Hats', 'Bas', 'Melodie'];

  let ctx, master, buildHP, djHigh, djLow, glue, limiter, analyser, freqData, timeData;
  let drumBus, musicBus, duck, reverbSend, reverbOut, delaySend, delayL, delayR, delayFb, delayOut;
  let noiseBuf, softClip, hardClip;
  let playing = false, step = 0, nextTime = 0, timer = null;
  let groove = 0.8, bpm = 128, volume = 0.7, filterV = 0, swingAmt = 0.12, echo = 0.3, bassLvl = 0.75;
  let buildStart = -1, dropStep = -1;

  const playBtn = $('#play'), topPlay = $('#topPlay'), dropBtn = $('#drop');
  const grooveIn = $('#groove'), bpmIn = $('#bpm'), volIn = $('#vol');
  const filterIn = $('#filter'), swingIn = $('#swing'), echoIn = $('#echo'), bassIn = $('#bassLvl');
  const modeOut = $('#modeOut'), bpmOut = $('#bpmOut'), stepOut = $('#stepOut');
  const grooveFill = $('#grooveFill');

  // matrix: 5 sporen x 16 stappen
  const tracksEl = $('#tracks');
  const cells = TRACKS.map((name) => {
    const row = document.createElement('div'); row.className = 'trk';
    const lbl = document.createElement('span'); lbl.textContent = name; row.appendChild(lbl);
    const cs = [];
    for (let i = 0; i < 16; i++) { const c = document.createElement('i'); row.appendChild(c); cs.push(c); }
    tracksEl.appendChild(row);
    return cs;
  });

  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hz = (semis, base = 440) => base * Math.pow(2, semis / 12);
  const spb = () => 60 / bpm / 4; // seconden per 16e

  function curve(drive) {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); }
    return c;
  }
  function impulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function initAudio() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    // masterketen: build-filter → DJ-filter → glue-compressor → limiter
    master = ctx.createGain(); master.gain.value = volume;
    buildHP = ctx.createBiquadFilter(); buildHP.type = 'highpass'; buildHP.frequency.value = 20;
    djHigh = ctx.createBiquadFilter(); djHigh.type = 'highpass'; djHigh.frequency.value = 20; djHigh.Q.value = 0.7;
    djLow = ctx.createBiquadFilter(); djLow.type = 'lowpass'; djLow.frequency.value = 20000; djLow.Q.value = 0.7;
    glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16; glue.ratio.value = 2.5; glue.attack.value = 0.01; glue.release.value = 0.12; glue.knee.value = 6;
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.06; limiter.knee.value = 0;
    analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.78;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    timeData = new Uint8Array(analyser.fftSize);
    master.connect(buildHP).connect(djHigh).connect(djLow).connect(glue).connect(limiter).connect(analyser).connect(ctx.destination);

    drumBus = ctx.createGain(); drumBus.connect(master);
    // alles behalve de drums pompt mee met de kick
    duck = ctx.createGain(); duck.connect(master);
    musicBus = ctx.createGain(); musicBus.connect(duck);

    // korte, heldere galm
    const conv = ctx.createConvolver(); conv.buffer = impulse(1.8, 3.5);
    reverbSend = ctx.createGain();
    const pre = ctx.createDelay(0.1); pre.delayTime.value = 0.018;
    const rvTone = ctx.createBiquadFilter(); rvTone.type = 'highpass'; rvTone.frequency.value = 350;
    reverbOut = ctx.createGain(); reverbOut.gain.value = 0.35;
    reverbSend.connect(rvTone).connect(pre).connect(conv).connect(reverbOut).connect(master);

    // ping-pong echo op een gestippelde achtste
    delaySend = ctx.createGain();
    delayL = ctx.createDelay(2); delayR = ctx.createDelay(2);
    delayFb = ctx.createGain(); delayFb.gain.value = 0.4;
    const dTone = ctx.createBiquadFilter(); dTone.type = 'bandpass'; dTone.frequency.value = 1800; dTone.Q.value = 0.5;
    const merger = ctx.createChannelMerger(2);
    delayOut = ctx.createGain(); delayOut.gain.value = 0.45;
    delaySend.connect(dTone).connect(delayL);
    delayL.connect(merger, 0, 0); delayL.connect(delayR);
    delayR.connect(merger, 0, 1); delayR.connect(delayFb).connect(delayL);
    merger.connect(delayOut).connect(musicBus);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    softClip = curve(1.6);
    hardClip = curve(9);

    applyTempo(); applyFilter(); applyEcho();
  }

  /* ---------- drums ---------- */
  // kick: kort en strak zoals in haar set, gestemd op A1 (55 Hz)
  function kick(t, big = 0) {
    const boem = 1 - groove;
    const tune = hz(ROOT, 55);
    const o = ctx.createOscillator(), g = ctx.createGain(), sh = ctx.createWaveShaper();
    o.type = 'sine';
    // snelle pitch-val, daarna staat de body precies op de grondtoon
    o.frequency.setValueAtTime(tune * 4.5, t);
    o.frequency.exponentialRampToValueAtTime(tune * 1.06, t + 0.03);
    o.frequency.exponentialRampToValueAtTime(tune, t + 0.055);
    const decay = 0.22 + boem * 0.35 + big * 0.5;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.0015);
    g.gain.setValueAtTime(1, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    sh.curve = softClip;
    const out = ctx.createGain(); out.gain.value = 0.85;
    o.connect(g).connect(sh).connect(out).connect(drumBus);
    if (boem > 0.05) {
      const ws = ctx.createWaveShaper(); ws.curve = hardClip; ws.oversample = '4x';
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
      const dg = ctx.createGain(); dg.gain.value = boem * 0.5;
      g.connect(ws).connect(lp).connect(dg).connect(drumBus);
    }
    o.start(t); o.stop(t + decay + 0.05);

    // klik: een heel korte tik voor de definitie
    const c = ctx.createOscillator(), cg = ctx.createGain();
    c.type = 'triangle'; c.frequency.setValueAtTime(1800, t); c.frequency.exponentialRampToValueAtTime(400, t + 0.006);
    cg.gain.setValueAtTime(0.35, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.008);
    c.connect(cg).connect(drumBus); c.start(t); c.stop(t + 0.02);
    burst(t, { type: 'highpass', freq: 4000, len: 0.004, gain: 0.12 });

    // sidechain
    const depth = 0.3 + groove * 0.35;
    duck.gain.setTargetAtTime(1 - depth, t, 0.003);
    duck.gain.setTargetAtTime(1, t + 0.035, 0.06 + spb() * 0.15);
  }

  function burst(t, { type = 'highpass', freq = 7000, q = 0.7, len = 0.05, gain = 0.2, attack = 0.0008, dest = drumBus, send = 0, freqEnd = 0 }) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t + len);
    s.connect(f).connect(g).connect(dest);
    if (send) { const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg).connect(reverbSend); }
    s.start(t, Math.random() * 0.8); s.stop(t + len + 0.02);
  }

  // clap: drie snelle tikken en een korte staart, met een vleugje ruimte
  function clap(t, vel) {
    const spread = [0, 0.009, 0.018];
    spread.forEach((d, k) => burst(t + d, { type: 'bandpass', freq: 1250, q: 1.4, len: 0.012, gain: vel * (k === 2 ? 1 : 0.75) }));
    burst(t + 0.02, { type: 'bandpass', freq: 1100, q: 1.1, len: 0.16, gain: vel * 0.6, send: 0.25 });
    burst(t + 0.02, { type: 'highpass', freq: 5000, len: 0.05, gain: vel * 0.18 });
  }

  // hats: gefilterde ruis met een dun metalen randje, kort en helder
  const HAT_RATIOS = [2, 3, 4.16, 5.43, 6.79, 8.21];
  function hat(t, open, vel) {
    const len = open ? 0.085 : 0.032;
    burst(t, { type: 'highpass', freq: open ? 7500 : 9000, len, gain: vel, attack: 0.0005 });
    const g = ctx.createGain(), bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 10500; bp.Q.value = 1.2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.25, t + 0.0005); g.gain.exponentialRampToValueAtTime(0.0005, t + len * 0.8);
    bp.connect(g).connect(drumBus);
    HAT_RATIOS.forEach((r) => {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 40 * r;
      o.connect(bp); o.start(t); o.stop(t + len);
    });
  }

  function rim(t, vel) {
    const o = ctx.createOscillator(), g = ctx.createGain(), bp = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = 1700;
    bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 3;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.0005); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.03);
    o.connect(bp).connect(g).connect(drumBus);
    const ds = ctx.createGain(); ds.gain.value = 0.35; g.connect(ds).connect(delaySend);
    o.start(t); o.stop(t + 0.05);
  }

  function shaker(t, vel) {
    burst(t, { type: 'bandpass', freq: 6500, q: 1.5, len: 0.045, gain: vel, attack: 0.008 });
  }

  /* ---------- tonaal ---------- */
  function bass(t, f, len, lvl) {
    const o = ctx.createOscillator(), sub = ctx.createOscillator();
    o.type = 'sawtooth'; sub.type = 'sine';
    o.frequency.value = f; sub.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5;
    const cut = 180 + groove * 450;
    lp.frequency.setValueAtTime(cut * 3.2, t);
    lp.frequency.exponentialRampToValueAtTime(cut, t + len * 0.7);
    const g = ctx.createGain(), sg = ctx.createGain(), og = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl, t + 0.004);
    g.gain.setValueAtTime(lvl, t + len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0005, t + len);
    sg.gain.value = 0.85; og.gain.value = 0.55;
    o.connect(og).connect(lp).connect(g); sub.connect(sg).connect(g); g.connect(musicBus);
    o.start(t); sub.start(t); o.stop(t + len + 0.02); sub.stop(t + len + 0.02);
  }

  // hypnotische riff: zaagtand door een resonerend filter dat langzaam ademt
  function riff(t, f, accent, lvl, lfo) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = f; o2.frequency.value = f; o2.detune.value = 7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 9 + accent * 6;
    const base = 280 + lfo * 2200 * (0.4 + groove * 0.6);
    lp.frequency.setValueAtTime(base * (1.6 + accent * 1.8), t);
    lp.frequency.exponentialRampToValueAtTime(base, t + 0.11);
    const g = ctx.createGain();
    const len = spb() * (accent ? 0.95 : 0.6);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl * (0.7 + accent * 0.5), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0005, t + len);
    const m = ctx.createGain(); m.gain.value = 0.4;
    o.connect(lp); o2.connect(m).connect(lp); lp.connect(g).connect(musicBus);
    const ds = ctx.createGain(); ds.gain.value = 0.5; g.connect(ds).connect(delaySend);
    o.start(t); o2.start(t); o.stop(t + len + 0.03); o2.stop(t + len + 0.03);
  }

  function pluck(t, f, accent, lvl) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.005;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4000 + accent * 3000, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.25);
    const g = ctx.createGain(), len = 0.3 + accent * 0.2;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl * (0.75 + accent * 0.5), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0005, t + len);
    const m = ctx.createGain(); m.gain.value = 0.35;
    o.connect(lp); o2.connect(m).connect(lp); lp.connect(g).connect(musicBus);
    const ds = ctx.createGain(); ds.gain.value = 0.8; g.connect(ds).connect(delaySend);
    const rs = ctx.createGain(); rs.gain.value = 0.3; g.connect(rs).connect(reverbSend);
    o.start(t); o2.start(t); o.stop(t + len + 0.05); o2.stop(t + len + 0.05);
  }

  // FM-bel: glazig, met galm
  function bell(t, f, accent, lvl) {
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain();
    car.type = 'sine'; mod.type = 'sine';
    car.frequency.value = f; mod.frequency.value = f * 3.5;
    mg.gain.setValueAtTime(f * (1.4 + accent), t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.6);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain(), len = 1.1 + accent * 0.6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl * (0.75 + accent * 0.5), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0005, t + len);
    car.connect(g).connect(musicBus);
    const rs = ctx.createGain(); rs.gain.value = 0.7; g.connect(rs).connect(reverbSend);
    const ds = ctx.createGain(); ds.gain.value = 0.4; g.connect(ds).connect(delaySend);
    car.start(t); mod.start(t); car.stop(t + len + 0.05); mod.stop(t + len + 0.05);
  }

  function stab(t, root, lvl) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.28);
    lp.connect(g).connect(musicBus);
    const rs = ctx.createGain(); rs.gain.value = 0.7; g.connect(rs).connect(reverbSend);
    const ds = ctx.createGain(); ds.gain.value = 0.45; g.connect(ds).connect(delaySend);
    [0, 3, 7, 10].forEach((iv) => [-7, 7].forEach((det) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(root + iv, 440); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + 0.32);
    }));
  }

  function pad(t, notes, len, lvl) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1000; lp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(lvl, t + len * 0.45);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    lp.connect(g).connect(musicBus);
    const rs = ctx.createGain(); rs.gain.value = 0.9; g.connect(rs).connect(reverbSend);
    notes.forEach((n) => [-9, 0, 9].forEach((det) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n, 220); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + len + 0.05);
    }));
  }

  function riser(t, len) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(9000, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + len * 0.95); g.gain.linearRampToValueAtTime(0, t + len + 0.02);
    s.connect(bp).connect(g).connect(master);
    const rs = ctx.createGain(); rs.gain.value = 0.4; g.connect(rs).connect(reverbSend);
    s.start(t); s.stop(t + len + 0.05);
    buildHP.frequency.cancelScheduledValues(t);
    buildHP.frequency.setValueAtTime(20, t);
    buildHP.frequency.exponentialRampToValueAtTime(800, t + len);
    buildHP.frequency.setValueAtTime(20, t + len);
  }

  /* ---------- patronen (uit de analyse: 4/4, offbeat-hats, clap op 2 en 4, rollende bas na de kick) ---------- */
  const BASS = [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1];
  const RIFF_NOTE = [0, 0, 12, 0, 0, 0, 1, 0, 0, 12, 0, 3, 0, 0, 12, 1];
  const RIFF_GATE = [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0];
  const RIFF_ACC = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  const HAT_VEL = [0.10, 0.05, 0, 0.07, 0.11, 0.05, 0, 0.08, 0.10, 0.05, 0, 0.07, 0.11, 0.05, 0, 0.09];
  const SHAKER = [0.6, 0.3, 0.8, 0.35, 0.6, 0.3, 0.8, 0.4, 0.6, 0.3, 0.8, 0.35, 0.6, 0.3, 0.8, 0.45];

  /* ---------- jouw melodie ---------- */
  const SCALE = [0, 1, 3, 5, 7, 8, 10, 12]; // frygisch, van grondtoon tot octaaf
  const NAMES = ['A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab'];
  const SABINE_RIFF = RIFF_GATE.map((g, i) => (g ? { d: SCALE.indexOf(RIFF_NOTE[i]), a: RIFF_ACC[i] } : null));
  let melody = SABINE_RIFF.map((x) => x && { ...x });
  let sound = 'acid', octave = 0;

  const encodeMelody = () => melody.map((m) => (m ? (m.a ? 'abcdefgh' : '01234567')[m.d] : '-')).join('') + '.' + sound + '.' + octave;
  function decodeMelody(str) {
    const [notes, snd, oct] = String(str).split('.');
    if (!/^[-0-7a-h]{16}$/.test(notes || '')) return false;
    melody = [...notes].map((c) => {
      if (c === '-') return null;
      const acc = c >= 'a';
      return { d: acc ? c.charCodeAt(0) - 97 : +c, a: acc ? 1 : 0 };
    });
    if (['acid', 'pluk', 'bel'].includes(snd)) sound = snd;
    if (['-1', '0', '1'].includes(oct)) octave = +oct;
    return true;
  }
  const saveMelody = () => { try { localStorage.setItem('svv-melodie', encodeMelody()); } catch (_) {} };
  {
    const fromHash = (location.hash.match(/[#&]m=([^&]+)/) || [])[1];
    let stored = null;
    try { stored = localStorage.getItem('svv-melodie'); } catch (_) {}
    if (!(fromHash && decodeMelody(decodeURIComponent(fromHash))) && stored) decodeMelody(stored);
  }

  const noteFreq = (d) => hz(ROOT + SCALE[d] + octave * 12, 220);
  function playNote(t, f, acc, lvl, lfo) {
    if (sound === 'pluk') pluck(t, f * 2, acc, 0.1 * lvl);
    else if (sound === 'bel') bell(t, f * 2, acc, 0.08 * lvl);
    else riff(t, f, acc, 0.075 * lvl, lfo);
  }

  const rollEl = $('#roll'), melodyMsg = $('#melodyMsg');
  const rollCells = []; // [rij][stap], rij 0 = hoogste noot, laatste rij = accent
  for (let r = 0; r <= SCALE.length; r++) {
    const isAcc = r === SCALE.length, d = SCALE.length - 1 - r;
    const lbl = document.createElement('span');
    lbl.className = 'roll__lbl' + (isAcc ? ' roll__lbl--acc' : '') + (d === 0 || d === 7 ? ' root' : '');
    lbl.textContent = isAcc ? 'Accent' : NAMES[(ROOT + SCALE[d]) % 12];
    rollEl.appendChild(lbl);
    const row = [];
    for (let i = 0; i < 16; i++) {
      const b = document.createElement('button');
      b.className = 'roll__cell' + (isAcc ? ' roll__cell--acc' : '') + (i % 4 === 0 ? ' beat' : '');
      b.type = 'button';
      b.setAttribute('aria-label', isAcc ? `Accent op stap ${i + 1}` : `Stap ${i + 1}, ${lbl.textContent}`);
      b.addEventListener('click', () => (isAcc ? toggleAccent(i) : setNote(i, d)));
      rollEl.appendChild(b); row.push(b);
    }
    rollCells.push(row);
  }
  function renderRoll() {
    for (let r = 0; r < SCALE.length; r++) {
      const d = SCALE.length - 1 - r;
      rollCells[r].forEach((c, i) => {
        const on = !!melody[i] && melody[i].d === d;
        c.classList.toggle('on', on);
        c.classList.toggle('acc', on && !!melody[i].a);
        c.setAttribute('aria-pressed', String(on));
      });
    }
    rollCells[SCALE.length].forEach((c, i) => {
      const on = !!(melody[i] && melody[i].a);
      c.classList.toggle('on', on);
      c.disabled = !melody[i];
      c.setAttribute('aria-pressed', String(on));
    });
    $$('[data-sound]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.sound === sound)));
    $$('[data-oct]').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.oct === octave)));
  }
  function markRoll(i) {
    rollCells.forEach((row) => row.forEach((c, j) => c.classList.toggle('now', j === i)));
  }
  async function preview(i) {
    const m = melody[i];
    if (!m) return;
    initAudio();
    await ctx.resume();
    playNote(ctx.currentTime + 0.01, noteFreq(m.d), m.a, 0.9, 0.6);
  }
  function setNote(i, d) {
    melody[i] = melody[i] && melody[i].d === d ? null : { d, a: melody[i] ? melody[i].a : 0 };
    renderRoll(); saveMelody(); preview(i);
  }
  function toggleAccent(i) {
    if (!melody[i]) return;
    melody[i].a = melody[i].a ? 0 : 1;
    renderRoll(); saveMelody(); preview(i);
  }
  const previewFirst = () => { const first = melody.findIndex(Boolean); if (first >= 0) preview(first); };
  $$('[data-sound]').forEach((b) => b.addEventListener('click', () => { sound = b.dataset.sound; renderRoll(); saveMelody(); previewFirst(); }));
  $$('[data-oct]').forEach((b) => b.addEventListener('click', () => { octave = +b.dataset.oct; renderRoll(); saveMelody(); previewFirst(); }));
  $$('.melody__actions [data-act]').forEach((b) => b.addEventListener('click', async () => {
    const act = b.dataset.act;
    melodyMsg.textContent = '';
    if (act === 'sabine') melody = SABINE_RIFF.map((x) => x && { ...x });
    if (act === 'clear') melody = Array(16).fill(null);
    if (act === 'random') {
      // hypnotisch: vooral de grondtoon, met af en toe het octaaf of de donkere b2
      const pick = () => { const r = Math.random(); return r < 0.45 ? 0 : r < 0.62 ? 7 : r < 0.77 ? 1 : 2 + Math.floor(Math.random() * 5); };
      melody = Array.from({ length: 16 }, (_, i) => (i === 0 || Math.random() < 0.55 ? { d: i === 0 ? 0 : pick(), a: i === 0 || Math.random() < 0.25 ? 1 : 0 } : null));
    }
    if (act === 'share') {
      const url = location.href.split('#')[0] + '#m=' + encodeURIComponent(encodeMelody());
      try {
        if (navigator.share) await navigator.share({ title: 'Mijn melodie op de Groove Machine van Sabine van Vessem', url });
        else { await navigator.clipboard.writeText(url); melodyMsg.textContent = 'Link gekopieerd ✦'; }
      } catch (_) { melodyMsg.textContent = url; }
      return;
    }
    renderRoll(); saveMelody();
    if (!playing && act !== 'clear') start();
  }));
  renderRoll();

  /* ---------- sequencer ---------- */
  function schedule(s, t) {
    const i = s % 16, bar = Math.floor(s / 16) % 4, R = ROOT;
    const building = buildStart >= 0 && s >= buildStart && s < dropStep;
    const isDrop = s === dropStep;
    const bp = building ? (s - buildStart) / (dropStep - buildStart) : 0;
    const sw = i % 2 ? spb() * swingAmt * 0.5 : 0; // swing op de oneven 16en
    const lfo = 0.5 + 0.5 * Math.sin((s / (16 * 8)) * Math.PI * 2 - Math.PI / 2); // ademt over 8 maten
    const hit = [0, 0, 0, 0, 0];

    // kick
    if (isDrop) {
      kick(t, 1);
      burst(t, { type: 'highpass', freq: 5000, len: 1.8, gain: 0.16, send: 0.8 }); // crash
      buildStart = dropStep = -1;
      dropBtn.disabled = false; dropBtn.textContent = 'Drop'; dropBtn.classList.remove('armed');
      hit[0] = 1;
    } else if (i % 4 === 0 && !(building && bp >= 0.5)) {
      kick(t); hit[0] = 1;
    }
    if (!building && groove < 0.2 && (i === 7 || i === 10 || i === 14)) { kick(t); hit[0] = 1; }

    // clap op 2 en 4, snareroll tijdens de opbouw
    if (building) {
      const every = bp < 0.5 ? 4 : bp < 0.75 ? 2 : 1;
      if (i % every === 0) { clap(t, 0.15 + bp * 0.35); hit[1] = 1; }
    } else if (groove > 0.25 && (i === 4 || i === 12)) {
      clap(t, 0.55 * (0.5 + groove * 0.5)); hit[1] = 1;
    }

    // hats: offbeat open, 16en dicht, shaker en rim bij meer groove
    if (groove > 0.15 && i % 4 === 2) { hat(t + sw, true, 0.16 + groove * 0.1); hit[2] = 1; }
    if (groove > 0.45 && HAT_VEL[i]) { hat(t + sw, false, HAT_VEL[i] * (0.7 + groove * 0.6)); hit[2] = 1; }
    if (groove > 0.7) shaker(t + sw, SHAKER[i] * 0.06 * smooth(0.7, 1, groove));
    if (groove > 0.6 && (i === 3 || i === 11 || (bar % 2 && i === 14))) rim(t + sw, 0.09 * groove);

    // rollende bas
    if (groove > 0.2 && BASS[i] && !(building && bp >= 0.5)) {
      const n = bar === 3 && i >= 13 ? R + 1 : R; // frygische b2 aan het eind van de frase
      bass(t + sw * 0.5, hz(n, 55), spb() * 0.85, 0.32 * bassLvl * smooth(0.2, 0.5, groove));
      hit[3] = 1;
    }

    // jouw melodie
    const m = melody[i];
    if (m && groove > 0.2) {
      playNote(t + sw, noteFreq(m.d), m.a, smooth(0.2, 0.6, groove), building ? Math.max(lfo, bp) : lfo);
      hit[4] = 1;
    }

    if (groove > 0.65 && !building && bar % 2 === 1 && (i === 6 || i === 14)) stab(t, R, 0.03 * smooth(0.65, 0.9, groove));
    if (groove > 0.8 && !building && i === 0 && bar % 2 === 0) {
      const chord = bar === 0 ? [R, R + 3, R + 7] : [R + 1, R + 5, R + 8];
      pad(t, chord, spb() * 32, 0.02 * smooth(0.8, 1, groove));
    }

    const delayMs = Math.max(0, (t - ctx.currentTime) * 1000);
    setTimeout(() => {
      cells.forEach((row, k) => row.forEach((c, j) => {
        if (j === i) c.classList.toggle('on', !!hit[k]);
        c.classList.toggle('now', j === i);
      }));
      stepOut.textContent = `${bar + 1}.${Math.floor(i / 4) + 1}`;
      markRoll(i);
    }, delayMs);
  }

  function scheduler() {
    while (nextTime < ctx.currentTime + 0.12) {
      schedule(step, nextTime);
      nextTime += spb();
      step++;
    }
  }

  /* ---------- bediening ---------- */
  function applyTempo() {
    if (!ctx) return;
    const t = ctx.currentTime;
    delayL.delayTime.setTargetAtTime(spb() * 3, t, 0.05);
    delayR.delayTime.setTargetAtTime(spb() * 3, t, 0.05);
  }
  function applyFilter() {
    if (!ctx) return;
    const t = ctx.currentTime, v = filterV;
    const lpF = v < 0 ? 20000 * Math.pow(180 / 20000, -v) : 20000;
    const hpF = v > 0 ? 20 * Math.pow(2800 / 20, v) : 20;
    djLow.frequency.setTargetAtTime(lpF, t, 0.03);
    djHigh.frequency.setTargetAtTime(hpF, t, 0.03);
    const q = 0.7 + Math.abs(v) * 7;
    djLow.Q.setTargetAtTime(v < 0 ? q : 0.7, t, 0.03);
    djHigh.Q.setTargetAtTime(v > 0 ? q : 0.7, t, 0.03);
  }
  function applyEcho() {
    if (!ctx) return;
    const t = ctx.currentTime;
    delaySend.gain.setTargetAtTime(echo, t, 0.05);
    delayFb.gain.setTargetAtTime(0.25 + echo * 0.35, t, 0.05);
    reverbOut.gain.setTargetAtTime(0.2 + echo * 0.6, t, 0.05);
  }

  function setGroove(v) {
    groove = v / 100;
    grooveFill.style.width = v + '%';
    modeOut.textContent = groove < 0.2 ? 'BOEM!!!' : groove < 0.5 ? 'OPBOUW' : groove < 0.9 ? 'GROOVE' : 'DIEP';
    $$('.presets button').forEach((b) => b.classList.toggle('active', +b.dataset.preset === +v));
  }

  async function start() {
    initAudio();
    await ctx.resume();
    pauseReels();
    playing = true;
    step = 0;
    nextTime = ctx.currentTime + 0.08;
    duck.gain.cancelScheduledValues(0); duck.gain.value = 1;
    timer = setInterval(scheduler, 25);
    scheduler();
    [playBtn, topPlay].forEach((b) => b.setAttribute('aria-pressed', 'true'));
    playBtn.querySelector('.bigplay__lbl').textContent = 'Stop';
    topPlay.querySelector('.lbl').textContent = 'Stop';
    dropBtn.disabled = false;
  }
  function stop() {
    playing = false;
    clearInterval(timer);
    if (ctx) { buildHP.frequency.cancelScheduledValues(0); buildHP.frequency.value = 20; }
    buildStart = dropStep = -1;
    [playBtn, topPlay].forEach((b) => b.setAttribute('aria-pressed', 'false'));
    playBtn.querySelector('.bigplay__lbl').textContent = 'Play';
    topPlay.querySelector('.lbl').textContent = 'Play';
    dropBtn.disabled = true; dropBtn.textContent = 'Drop'; dropBtn.classList.remove('armed');
    cells.forEach((row) => row.forEach((c) => c.classList.remove('now', 'on')));
    markRoll(-1);
    stepOut.textContent = '--';
  }
  const toggle = () => (playing ? stop() : start());
  playBtn.addEventListener('click', toggle);
  topPlay.addEventListener('click', toggle);

  dropBtn.addEventListener('click', () => {
    if (!playing || buildStart >= 0) return;
    buildStart = Math.ceil((step + 1) / 16) * 16; // vanaf de volgende maat
    dropStep = buildStart + 32; // twee maten opbouw
    riser(nextTime + (buildStart - step) * spb(), 32 * spb());
    dropBtn.disabled = true; dropBtn.textContent = 'Opbouw…'; dropBtn.classList.add('armed');
  });

  const bind = (input, fn) => { input.addEventListener('input', () => fn(+input.value)); fn(+input.value); };
  bind(grooveIn, setGroove);
  bind(bpmIn, (v) => {
    bpm = v; bpmOut.textContent = v; $('#bpmKnobOut').textContent = v;
    root.style.setProperty('--bpm', v); applyTempo();
  });
  bind(volIn, (v) => {
    volume = v / 100; $('#volOut').textContent = v + '%';
    if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.03);
  });
  bind(filterIn, (v) => {
    if (Math.abs(v) < 4) v = 0;
    filterV = v / 100;
    $('#filterOut').textContent = v === 0 ? 'open' : v < 0 ? 'LP ' + -v + '%' : 'HP ' + v + '%';
    applyFilter();
  });
  filterIn.addEventListener('dblclick', () => { filterIn.value = 0; filterIn.dispatchEvent(new Event('input')); });
  bind(swingIn, (v) => { swingAmt = v / 100; $('#swingOut').textContent = v + '%'; });
  bind(echoIn, (v) => { echo = v / 100; $('#echoOut').textContent = v + '%'; applyEcho(); });
  bind(bassIn, (v) => { bassLvl = v / 100; $('#bassOut').textContent = v + '%'; });

  $$('.presets button').forEach((b) => b.addEventListener('click', () => {
    grooveIn.value = b.dataset.preset;
    setGroove(+b.dataset.preset);
    if (!playing) start();
  }));

  /* ---------------- Live reels ---------------- */
  const reels = $$('.reel');
  const mediaSources = new WeakMap();
  function pauseReels(except) {
    reels.forEach((r) => {
      const v = $('video', r);
      if (r !== except && !v.paused) v.pause();
    });
  }
  reels.forEach((reel) => {
    const v = $('video', reel);
    const bar = $('.reel__bar i', reel);
    const toggleReel = async (e) => {
      e.preventDefault();
      if (v.paused) {
        if (playing) stop();
        pauseReels(reel);
        // route the real set through the analyser so the visuals react to it
        try {
          initAudio();
          await ctx.resume();
          if (!mediaSources.has(v)) {
            const src = ctx.createMediaElementSource(v);
            src.connect(analyser);
            mediaSources.set(v, src);
          }
        } catch (_) { /* visuals just won't react */ }
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    };
    reel.addEventListener('click', toggleReel);
    v.addEventListener('play', () => reel.classList.add('playing'));
    v.addEventListener('pause', () => reel.classList.remove('playing'));
    v.addEventListener('ended', () => { reel.classList.remove('playing'); bar.style.width = '0'; });
    v.addEventListener('timeupdate', () => { bar.style.width = (v.currentTime / v.duration) * 100 + '%'; });
  });

  /* ---------------- Visuals loop ---------------- */
  const heroEq = $('#heroEq'), scope = $('#scope');
  const hctx = heroEq.getContext('2d'), sctx = scope.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  function fit(c) {
    const r = c.getBoundingClientRect();
    c.width = Math.max(1, r.width * dpr); c.height = Math.max(1, r.height * dpr);
  }
  const resize = () => { fit(heroEq); fit(scope); };
  addEventListener('resize', resize);
  resize();

  let beat = 0, t0 = performance.now();
  const anyReelPlaying = () => reels.some((r) => !$('video', r).paused);

  function frame(now) {
    const live = ctx && (playing || anyReelPlaying());
    const time = (now - t0) / 1000;

    if (live) {
      analyser.getByteFrequencyData(freqData);
      analyser.getByteTimeDomainData(timeData);
      let low = 0;
      for (let i = 1; i < 8; i++) low += freqData[i];
      low /= 7 * 255;
      const target = Math.max(0, (low - 0.45) / 0.55);
      beat = Math.max(target, beat * 0.86);
    } else {
      beat *= 0.9;
    }
    root.style.setProperty('--beat', beat.toFixed(3));

    // hero equalizer
    const W = heroEq.width, H = heroEq.height;
    hctx.clearRect(0, 0, W, H);
    const nb = Math.floor(W / (14 * dpr));
    const bw = W / nb;
    for (let i = 0; i < nb; i++) {
      let v;
      if (live) {
        const idx = Math.floor(Math.pow(i / nb, 1.7) * freqData.length * 0.55) + 1;
        v = freqData[idx] / 255;
      } else {
        v = 0.08 + 0.06 * Math.sin(time * 1.6 + i * 0.35) + 0.04 * Math.sin(time * 2.7 + i * 0.9);
      }
      const h = v * H * 0.95;
      const grad = hctx.createLinearGradient(0, H, 0, H - h);
      grad.addColorStop(0, 'rgba(255,42,61,0.9)');
      grad.addColorStop(0.6, 'rgba(255,61,139,0.6)');
      grad.addColorStop(1, 'rgba(243,238,111,0.9)');
      hctx.fillStyle = grad;
      hctx.fillRect(i * bw + bw * 0.2, H - h, bw * 0.6, h);
    }

    // machine scope
    const SW = scope.width, SH = scope.height;
    sctx.fillStyle = 'rgba(5,5,7,0.35)';
    sctx.fillRect(0, 0, SW, SH);
    // grid
    sctx.strokeStyle = 'rgba(255,255,255,0.04)';
    sctx.lineWidth = 1;
    for (let x = 0; x < SW; x += 40 * dpr) { sctx.beginPath(); sctx.moveTo(x, 0); sctx.lineTo(x, SH); sctx.stroke(); }
    // spectrum
    const sb = 64;
    for (let i = 0; i < sb; i++) {
      const v = live ? freqData[Math.floor(Math.pow(i / sb, 1.6) * freqData.length * 0.6) + 1] / 255 : 0.03;
      const h = v * SH * 0.3;
      sctx.fillStyle = `hsla(${355 + (i / sb) * 65}, 100%, 60%, 0.22)`;
      sctx.fillRect((i / sb) * SW, SH - h - 110 * dpr, SW / sb - 2 * dpr, h);
    }
    // waveform
    sctx.beginPath();
    sctx.lineWidth = 2 * dpr;
    sctx.strokeStyle = groove < 0.3 ? '#ff2a3d' : '#f3ee6f';
    sctx.shadowColor = sctx.strokeStyle;
    sctx.shadowBlur = 10 * dpr;
    for (let x = 0; x < SW; x++) {
      let v;
      if (live) v = (timeData[Math.floor((x / SW) * timeData.length)] - 128) / 128;
      else v = Math.sin(x * 0.02 + time * 2) * 0.04;
      const y = SH * 0.42 + v * SH * 0.2;
      x ? sctx.lineTo(x, y) : sctx.moveTo(x, y);
    }
    sctx.stroke();
    sctx.shadowBlur = 0;

    moveEyes();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* =========================================================
     Subtiele effecten
     ========================================================= */
  // koppen letter voor letter
  function splitText(el) {
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span'); w.className = 'w';
            [...part].forEach((c) => {
              const ch = document.createElement('span'); ch.className = 'ch';
              ch.style.setProperty('--i', i++); ch.textContent = c; w.appendChild(ch);
            });
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    walk(el);
    el.classList.add('split');
  }
  if (!reduced) $$('.section-head h2, .watch__big').forEach(splitText);

  const spotlight = $('#spotlight');
  const progress = $('.progress');
  const heroEl = $('.hero'), heroMedia = $('.hero__media'), heroContent = $('.hero__content');
  const marquee = $('.marquee');
  let lastY = scrollY, skew = 0, hx = 0, hy = 0;

  // magnetische knoppen
  if (!reduced && matchMedia('(hover: hover)').matches) {
    spotlight.classList.add('on');
    $$('.btn, .topbar__play, .bigplay__icon, .presets button').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.22;
        const y = (e.clientY - r.top - r.height / 2) * 0.3;
        el.style.translate = `${x}px ${y}px`;
      });
      el.addEventListener('pointerleave', () => { el.style.translate = ''; });
    });
  }

  // actieve sectie in de navigatie
  const navLinks = $$('.topbar__nav a');
  const navIo = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  navLinks.forEach((a) => { const t = $(a.getAttribute('href')); if (t) navIo.observe(t); });

  // stofdeeltjes in het neonlicht
  const dust = $('#heroDust');
  const dctx = dust.getContext('2d');
  const motes = Array.from({ length: innerWidth < 640 ? 28 : 60 }, () => ({
    x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.8,
    vx: (Math.random() - 0.5) * 0.00012, vy: -0.00008 - Math.random() * 0.00022,
    tw: Math.random() * Math.PI * 2, hue: Math.random() < 0.6 ? 355 : 55,
  }));
  const fitDust = () => { const r = dust.getBoundingClientRect(); dust.width = r.width * dpr; dust.height = r.height * dpr; };
  addEventListener('resize', fitDust); fitDust();

  function effects(now) {
    const y = scrollY;
    const docH = document.documentElement.scrollHeight - innerHeight;
    progress.style.setProperty('--p', docH > 0 ? (y / docH).toFixed(4) : 0);

    if (!reduced) {
      // hero: parallax + vervagen bij scrollen, licht meebewegen met de muis
      const hh = heroEl.offsetHeight;
      if (y < hh) {
        const k = y / hh;
        hx += ((mx / innerWidth - 0.5) * -14 - hx) * 0.05;
        hy += ((my / innerHeight - 0.5) * -10 - hy) * 0.05;
        heroMedia.style.transform = `translate3d(${hx}px, ${y * 0.35 + hy}px, 0)`;
        heroContent.style.transform = `translate3d(0, ${y * -0.12}px, 0)`;
        heroContent.style.opacity = Math.max(0, 1 - k * 1.3);
        heroContent.style.filter = k > 0.02 ? `blur(${(k * 4).toFixed(2)}px)` : '';

        // stof
        const W = dust.width, H = dust.height;
        dctx.clearRect(0, 0, W, H);
        motes.forEach((m) => {
          m.x += m.vx; m.y += m.vy; m.tw += 0.02;
          if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
          if (m.x < -0.02) m.x = 1.02; else if (m.x > 1.02) m.x = -0.02;
          const a = (0.25 + 0.35 * Math.sin(m.tw)) * (0.7 + beat * 0.8);
          dctx.beginPath();
          dctx.fillStyle = `hsla(${m.hue}, 100%, 75%, ${Math.max(0, a).toFixed(3)})`;
          dctx.shadowColor = `hsla(${m.hue}, 100%, 60%, .8)`;
          dctx.shadowBlur = 6 * dpr;
          dctx.arc(m.x * W + hx * dpr * 2, m.y * H, m.r * dpr * (1 + beat * 0.4), 0, Math.PI * 2);
          dctx.fill();
        });
      }

      // lichtkrant buigt mee met de scrollsnelheid
      const v = y - lastY;
      skew += (Math.max(-6, Math.min(6, v * 0.12)) - skew) * 0.12;
      marquee.style.setProperty('--skew', skew.toFixed(2) + 'deg');

      spotlight.style.setProperty('--sx', mx + 'px');
      spotlight.style.setProperty('--sy', my + 'px');
    }
    lastY = y;
    requestAnimationFrame(effects);
  }
  requestAnimationFrame(effects);

  // keyboard: space toggles the machine when it's on screen
  addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || /INPUT|BUTTON|TEXTAREA/.test(document.activeElement.tagName)) return;
    const r = $('#machine').getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) { e.preventDefault(); toggle(); }
  });
})();
