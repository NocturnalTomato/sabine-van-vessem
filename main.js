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
     Audio: Groove Machine — gebouwd op haar eigen set
     Analyse van de filmpjes: ~128 BPM, toonsoort rond A (mineur, frygisch),
     een hypnotische riff die op één toon blijft hangen en veel energie
     tussen 2 en 6 kHz. De loops in assets/audio zijn 4 maten op 128 BPM,
     uit de filmpjes gesneden en beginnend op de eerste tel.
     ========================================================= */
  const LOOP_BPM = 128;
  const LOOP_STEPS = 64;
  const SOURCES = {
    0: { key: 'Am', root: 0 },
    1: { url: 'assets/audio/loop-1.wav', key: 'Am', root: 0 },
    2: { url: 'assets/audio/loop-2.wav', key: 'Bm', root: 2 },
    3: { url: 'assets/audio/loop-3.wav', key: 'Am', root: 0 },
  };
  const TRACKS = ['Kick', 'Hats', 'Bas', 'Riff', 'Sabine'];

  let ctx, master, buildHP, djHigh, djLow, comp, analyser, freqData, timeData;
  let drumBus, musicBus, duck, sampleBus, sampleLevel, reverbSend, reverbOut, delaySend, delayL, delayR, delayFb, delayOut;
  let noiseBuf, distCurve, loopSrc = null;
  let playing = false, step = 0, nextTime = 0, timer = null;
  let groove = 0.8, bpm = 128, volume = 0.7, filterV = 0, chop = 0, mix = 0.7, echo = 0.35, src = 1;
  let buildStart = -1, dropStep = -1, lastSlice = 0;
  let shownPos = 0, shownTime = 0;
  const buffers = {}, peaks = {}, loading = {};

  const playBtn = $('#play'), topPlay = $('#topPlay'), dropBtn = $('#drop');
  const grooveIn = $('#groove'), bpmIn = $('#bpm'), volIn = $('#vol');
  const filterIn = $('#filter'), chopIn = $('#chop'), mixIn = $('#mix'), echoIn = $('#echo');
  const modeOut = $('#modeOut'), bpmOut = $('#bpmOut'), stepOut = $('#stepOut'), keyOut = $('#keyOut');
  const grooveFill = $('#grooveFill'), deckStatus = $('#deckStatus');

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
  const keyRoot = () => SOURCES[src].root;

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

    master = ctx.createGain(); master.gain.value = volume;
    buildHP = ctx.createBiquadFilter(); buildHP.type = 'highpass'; buildHP.frequency.value = 20;
    djHigh = ctx.createBiquadFilter(); djHigh.type = 'highpass'; djHigh.frequency.value = 20; djHigh.Q.value = 0.7;
    djLow = ctx.createBiquadFilter(); djLow.type = 'lowpass'; djLow.frequency.value = 20000; djLow.Q.value = 0.7;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18; comp.knee.value = 8;
    analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.78;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    timeData = new Uint8Array(analyser.fftSize);
    master.connect(buildHP).connect(djHigh).connect(djLow).connect(comp).connect(analyser).connect(ctx.destination);

    drumBus = ctx.createGain(); drumBus.connect(master);
    // alles behalve de drums pompt mee met de kick
    duck = ctx.createGain(); duck.connect(master);
    musicBus = ctx.createGain(); musicBus.connect(duck);

    // haar set: telefoon-opname, dus laag weg (de synth-kick levert het fundament) en wat lucht erbij
    sampleBus = ctx.createGain();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140; hp.Q.value = 0.8;
    const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 6000; air.gain.value = 3;
    const mud = ctx.createBiquadFilter(); mud.type = 'peaking'; mud.frequency.value = 350; mud.Q.value = 1; mud.gain.value = -4;
    sampleLevel = ctx.createGain(); sampleLevel.gain.value = 0;
    sampleBus.connect(hp).connect(mud).connect(air).connect(sampleLevel).connect(duck);

    // galm
    const conv = ctx.createConvolver(); conv.buffer = impulse(2.6, 3.2);
    reverbSend = ctx.createGain();
    const pre = ctx.createDelay(0.1); pre.delayTime.value = 0.02;
    reverbOut = ctx.createGain(); reverbOut.gain.value = 0.5;
    reverbSend.connect(pre).connect(conv).connect(reverbOut).connect(master);

    // ping-pong echo op een gestippelde achtste
    delaySend = ctx.createGain();
    delayL = ctx.createDelay(2); delayR = ctx.createDelay(2);
    delayFb = ctx.createGain(); delayFb.gain.value = 0.45;
    const dTone = ctx.createBiquadFilter(); dTone.type = 'bandpass'; dTone.frequency.value = 1800; dTone.Q.value = 0.5;
    const merger = ctx.createChannelMerger(2);
    delayOut = ctx.createGain(); delayOut.gain.value = 0.5;
    delaySend.connect(dTone).connect(delayL);
    delayL.connect(merger, 0, 0); delayL.connect(delayR);
    delayR.connect(merger, 0, 1); delayR.connect(delayFb).connect(delayL);
    merger.connect(delayOut).connect(musicBus);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const n = 1024; distCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; distCurve[i] = Math.tanh(x * 9); }

    applyTempo(); applyFilter(); applyEcho(); applyMix();
  }

  async function loadSource(id) {
    if (!SOURCES[id].url || buffers[id] || loading[id]) return;
    loading[id] = true;
    if (id === src) deckStatus.textContent = 'Haar set laden…';
    try {
      const res = await fetch(SOURCES[id].url);
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      buffers[id] = buf;
      const d = buf.getChannelData(0), P = 400, size = Math.floor(d.length / P);
      peaks[id] = Array.from({ length: P }, (_, i) => {
        let m = 0;
        for (let j = i * size; j < (i + 1) * size; j += 8) m = Math.max(m, Math.abs(d[j]));
        return m;
      });
      if (id === src) deckStatus.textContent = '';
    } catch (_) {
      if (id === src) deckStatus.textContent = 'Kon haar set niet laden, alleen synth';
    }
    loading[id] = false;
  }

  /* ---------- instrumenten ---------- */
  function kick(t, big = 0) {
    const boem = 1 - groove;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(165 + boem * 60 + big * 40, t);
    // gestemd op de grondtoon van haar set (A1 = 55 Hz)
    const tune = hz(keyRoot(), 55);
    o.frequency.exponentialRampToValueAtTime(tune, t + 0.09 + boem * 0.06);
    o.frequency.exponentialRampToValueAtTime(tune * 0.94, t + 0.4);
    const len = 0.34 + boem * 0.3 + big * 0.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.003);
    g.gain.setTargetAtTime(0.0001, t + 0.06 + big * 0.2, len / 4);
    o.connect(g);
    const clean = ctx.createGain(); clean.gain.value = 0.58 + groove * 0.3;
    g.connect(clean).connect(drumBus);
    if (boem > 0.05) {
      const ws = ctx.createWaveShaper(); ws.curve = distCurve; ws.oversample = '2x';
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      const dg = ctx.createGain(); dg.gain.value = boem * 0.55;
      g.connect(ws).connect(lp).connect(dg).connect(drumBus);
    }
    o.start(t); o.stop(t + len + 0.6);
    // klik voor de punch
    noise(t, { freq: 3500, q: 0.8, type: 'bandpass', len: 0.008, gain: 0.35 });
    // sidechain: de rest pompt mee
    const depth = 0.3 + groove * 0.4;
    duck.gain.setTargetAtTime(1 - depth, t, 0.004);
    duck.gain.setTargetAtTime(1, t + 0.04, 0.07 + spb() * 0.2);
  }

  function noise(t, { type = 'highpass', freq = 7000, q = 0.7, len = 0.05, gain = 0.2, dest = drumBus, send = 0, rate = 1 }) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(dest);
    if (send) { const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg).connect(reverbSend); }
    s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  }

  // metalen hihat zoals een 808: zes blokgolven door een bandpass
  const HAT_RATIOS = [2, 3, 4.16, 5.43, 6.79, 8.21];
  function hat(t, open, vel) {
    const g = ctx.createGain(), bp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 10000; bp.Q.value = 0.8;
    hp.type = 'highpass'; hp.frequency.value = 7000;
    const len = open ? 0.26 : 0.045;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    bp.connect(hp).connect(g).connect(drumBus);
    HAT_RATIOS.forEach((r) => {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 40 * r;
      o.connect(bp); o.start(t); o.stop(t + len + 0.02);
    });
  }

  function perc(t, f, vel) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.02);
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(musicBus);
    const s = ctx.createGain(); s.gain.value = 0.4; g.connect(s).connect(delaySend);
    o.start(t); o.stop(t + 0.12);
  }

  function bass(t, f, len, lvl) {
    const o = ctx.createOscillator(), sub = ctx.createOscillator();
    o.type = 'sawtooth'; sub.type = 'sine';
    o.frequency.value = f; sub.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 7;
    const cut = 160 + groove * 520;
    lp.frequency.setValueAtTime(cut * 3, t);
    lp.frequency.exponentialRampToValueAtTime(cut, t + len * 0.8);
    const g = ctx.createGain(), sg = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(lvl, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    sg.gain.value = 0.9;
    o.connect(lp).connect(g); sub.connect(sg).connect(g); g.connect(musicBus);
    o.start(t); sub.start(t); o.stop(t + len + 0.05); sub.stop(t + len + 0.05);
  }

  // hypnotische riff: één toon, zaagtand door een resonerend filter dat langzaam ademt
  function riff(t, f, accent, lvl, lfo) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = f; o2.frequency.value = f; o2.detune.value = 9;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 11 + accent * 6;
    const base = 260 + lfo * 2600 * (0.4 + groove * 0.6);
    lp.frequency.setValueAtTime(base * (1.6 + accent * 1.8), t);
    lp.frequency.exponentialRampToValueAtTime(base, t + 0.12);
    const g = ctx.createGain();
    const len = spb() * (accent ? 0.95 : 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(lvl * (0.7 + accent * 0.5), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const m = ctx.createGain(); m.gain.value = 0.45;
    o.connect(lp); o2.connect(m).connect(lp); lp.connect(g).connect(musicBus);
    const ds = ctx.createGain(); ds.gain.value = 0.55; g.connect(ds).connect(delaySend);
    o.start(t); o2.start(t); o.stop(t + len + 0.05); o2.stop(t + len + 0.05);
  }

  function stab(t, root, lvl) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(lvl, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    lp.connect(g).connect(musicBus);
    const rs = ctx.createGain(); rs.gain.value = 0.8; g.connect(rs).connect(reverbSend);
    const ds = ctx.createGain(); ds.gain.value = 0.5; g.connect(ds).connect(delaySend);
    [0, 3, 7, 10].forEach((iv) => [-8, 8].forEach((det) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(root + iv, 440); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + 0.35);
    }));
  }

  function pad(t, notes, len, lvl) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(lvl, t + len * 0.45);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    lp.connect(g).connect(musicBus);
    const rs = ctx.createGain(); rs.gain.value = 1; g.connect(rs).connect(reverbSend);
    notes.forEach((n) => [-10, 0, 10].forEach((det) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n, 220); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + len + 0.05);
    }));
  }

  function riser(t, len) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(9000, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + len * 0.95); g.gain.linearRampToValueAtTime(0, t + len + 0.02);
    s.connect(bp).connect(g).connect(master);
    const rs = ctx.createGain(); rs.gain.value = 0.5; g.connect(rs).connect(reverbSend);
    s.start(t); s.stop(t + len + 0.05);
    // filter op de hele mix trekt omhoog, en bij de drop weer open
    buildHP.frequency.cancelScheduledValues(t);
    buildHP.frequency.setValueAtTime(20, t);
    buildHP.frequency.exponentialRampToValueAtTime(900, t + len);
    buildHP.frequency.setValueAtTime(20, t + len);
  }

  /* ---------- haar set ---------- */
  function stopLoop(t) {
    if (loopSrc) { try { loopSrc.stop(t || 0); } catch (_) {} loopSrc = null; }
  }
  function startLoop(t, pos) {
    const buf = buffers[src];
    stopLoop(t);
    loopSrc = ctx.createBufferSource();
    loopSrc.buffer = buf; loopSrc.loop = true; loopSrc.loopStart = 0; loopSrc.loopEnd = buf.duration;
    loopSrc.playbackRate.value = bpm / LOOP_BPM;
    loopSrc.connect(sampleBus);
    loopSrc.start(t, (pos / LOOP_STEPS) * buf.duration);
    loopSrc._src = src;
  }
  function slice(t, idx, len16 = 1) {
    const buf = buffers[src];
    const sl = buf.duration / LOOP_STEPS, rate = bpm / LOOP_BPM;
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = ctx.createGain(), dur = (sl * len16) / rate;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.003);
    g.gain.setValueAtTime(1, t + dur - 0.004); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(g).connect(sampleBus);
    s.start(t, idx * sl, sl * len16 + 0.01); s.stop(t + dur + 0.02);
  }
  // geeft terug of haar set op deze stap klinkt
  function sampleStep(t, s, building) {
    const buf = buffers[src];
    if (!buf || mix === 0) { stopLoop(t); return false; }
    const pos = s % LOOP_STEPS;
    let c = chop;
    if (building) c = Math.max(c, (s - buildStart) / (dropStep - buildStart));
    if (c < 0.02) {
      if (!loopSrc || loopSrc._src !== src) startLoop(t, pos);
      return true;
    }
    stopLoop(t);
    let idx = pos;
    const r = Math.random();
    if (building && dropStep - s <= 4) idx = lastSlice; // stotteren vlak voor de drop
    else if (r < c * 0.35) idx = lastSlice; // herhaal
    else if (r < c * 0.6) idx = (pos - 4 + LOOP_STEPS) % LOOP_STEPS; // tel terug
    else if (r < c * 0.75) idx = (Math.floor(pos / 16) * 16 + Math.floor(Math.random() * 16)) % LOOP_STEPS; // husselen binnen de maat
    if (c > 0.6 && (s % 16) >= 14 && Math.random() < c) {
      slice(t, idx, 0.5); slice(t + spb() / 2, idx, 0.5); // 32e-roll
    } else slice(t, idx);
    lastSlice = idx;
    return true;
  }

  /* ---------- patronen (uit de analyse: 4/4, rollende bas na de kick, riff op één toon) ---------- */
  const BASS = [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1];
  const RIFF_NOTE = [0, 0, 12, 0, 0, 0, 1, 0, 0, 12, 0, 3, 0, 0, 12, 1];
  const RIFF_GATE = [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0];
  const RIFF_ACC = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  const HAT_VEL = [0.05, 0.03, 0, 0.04, 0.06, 0.03, 0, 0.05, 0.05, 0.03, 0, 0.04, 0.06, 0.03, 0, 0.07];

  function schedule(s, t) {
    const i = s % 16, bar = Math.floor(s / 16) % 4, R = keyRoot();
    const building = buildStart >= 0 && s >= buildStart && s < dropStep;
    const isDrop = s === dropStep;
    const bp = building ? (s - buildStart) / (dropStep - buildStart) : 0;
    const swing = i % 2 ? spb() * 0.07 : 0;
    const lfo = 0.5 + 0.5 * Math.sin((s / (16 * 8)) * Math.PI * 2 - Math.PI / 2); // ademt over 8 maten
    const hit = [0, 0, 0, 0, 0];

    if (isDrop) {
      kick(t, 1);
      noise(t, { freq: 3000, len: 2.2, gain: 0.22, send: 0.9 }); // crash
      buildStart = dropStep = -1;
      dropBtn.disabled = false; dropBtn.textContent = 'Drop'; dropBtn.classList.remove('armed');
      hit[0] = 1;
    } else if (i % 4 === 0 && !(building && bp >= 0.5)) {
      kick(t); hit[0] = 1;
    }
    if (!building && groove < 0.2 && (i === 10 || i === 14 || i === 7)) { kick(t); hit[0] = 1; }

    // snareroll tijdens de opbouw
    if (building) {
      const every = bp < 0.5 ? 4 : bp < 0.75 ? 2 : 1;
      if (i % every === 0) noise(t, { type: 'bandpass', freq: 1400 + bp * 2600, q: 1, len: 0.1, gain: 0.08 + bp * 0.22, send: 0.4 });
    }

    if (groove > 0.3 && !building && (i === 4 || i === 12)) {
      noise(t, { type: 'bandpass', freq: 1500, q: 0.9, len: 0.17, gain: 0.3 * groove, send: 0.35 });
      noise(t + 0.011, { type: 'bandpass', freq: 1150, q: 0.9, len: 0.12, gain: 0.18 * groove });
      noise(t + 0.022, { type: 'bandpass', freq: 1300, q: 0.9, len: 0.2, gain: 0.14 * groove, send: 0.3 });
    }

    if (groove > 0.15 && i % 4 === 2) { hat(t + swing, true, 0.07 + groove * 0.09); hit[1] = 1; }
    if (groove > 0.45 && HAT_VEL[i]) { hat(t + swing, false, HAT_VEL[i] * (0.6 + groove)); hit[1] = 1; }
    if (groove > 0.6 && (i === 3 || i === 7 || i === 11 || (bar % 2 && i === 13))) perc(t + swing, hz(R + 12, 220), 0.06 * groove);

    if (groove > 0.2 && BASS[i] && !(building && bp >= 0.5)) {
      const n = bar === 3 && i >= 13 ? R + 1 : R; // frygische b2 aan het eind van de frase
      bass(t + swing * 0.5, hz(n, 55), spb() * 0.9, 0.26 * smooth(0.2, 0.5, groove));
      hit[2] = 1;
    }

    if (groove > 0.45 && RIFF_GATE[i]) {
      riff(t + swing, hz(R + RIFF_NOTE[i], 220), RIFF_ACC[i], 0.075 * smooth(0.45, 0.75, groove), building ? Math.max(lfo, bp) : lfo);
      hit[3] = 1;
    }

    if (groove > 0.65 && !building && bar % 2 === 1 && (i === 6 || i === 14)) stab(t, R, 0.035 * smooth(0.65, 0.9, groove));
    if (groove > 0.8 && !building && i === 0 && bar % 2 === 0) {
      const chord = bar === 0 ? [R, R + 3, R + 7] : [R + 1, R + 5, R + 8];
      pad(t, chord, spb() * 32, 0.022 * smooth(0.8, 1, groove));
    }

    if (sampleStep(t, s, building)) hit[4] = 1;

    const delayMs = Math.max(0, (t - ctx.currentTime) * 1000);
    setTimeout(() => {
      shownPos = s % LOOP_STEPS; shownTime = t;
      cells.forEach((row, k) => row.forEach((c, j) => {
        if (j === i) c.classList.toggle('on', !!hit[k]);
        c.classList.toggle('now', j === i);
      }));
      stepOut.textContent = `${bar + 1}.${Math.floor(i / 4) + 1}`;
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
    if (loopSrc) loopSrc.playbackRate.setTargetAtTime(bpm / LOOP_BPM, t, 0.02);
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
    delayFb.gain.setTargetAtTime(0.25 + echo * 0.4, t, 0.05);
    reverbOut.gain.setTargetAtTime(0.25 + echo * 0.9, t, 0.05);
  }
  function applyMix() {
    if (!ctx) return;
    const lvl = mix * 1.1 * (0.25 + 0.75 * smooth(0.1, 0.55, groove));
    sampleLevel.gain.setTargetAtTime(lvl, ctx.currentTime, 0.05);
  }

  function setGroove(v) {
    groove = v / 100;
    grooveFill.style.width = v + '%';
    modeOut.textContent = groove < 0.2 ? 'BOEM!!!' : groove < 0.5 ? 'OPBOUW' : groove < 0.9 ? 'GROOVE' : 'DIEP';
    $$('.presets button').forEach((b) => b.classList.toggle('active', +b.dataset.preset === +v));
    applyMix();
  }

  async function start() {
    initAudio();
    await ctx.resume();
    pauseReels();
    loadSource(src);
    [1, 2, 3].forEach((id) => id !== src && setTimeout(() => loadSource(id), 1500));
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
    if (ctx) {
      stopLoop();
      buildHP.frequency.cancelScheduledValues(0); buildHP.frequency.value = 20;
    }
    buildStart = dropStep = -1;
    [playBtn, topPlay].forEach((b) => b.setAttribute('aria-pressed', 'false'));
    playBtn.querySelector('.bigplay__lbl').textContent = 'Play';
    topPlay.querySelector('.lbl').textContent = 'Play';
    dropBtn.disabled = true; dropBtn.textContent = 'Drop'; dropBtn.classList.remove('armed');
    cells.forEach((row) => row.forEach((c) => c.classList.remove('now', 'on')));
    stepOut.textContent = '--';
  }
  const toggle = () => (playing ? stop() : start());
  playBtn.addEventListener('click', toggle);
  topPlay.addEventListener('click', toggle);

  dropBtn.addEventListener('click', () => {
    if (!playing || buildStart >= 0) return;
    buildStart = Math.ceil((step + 1) / 16) * 16; // vanaf de volgende maat
    dropStep = buildStart + 32; // twee maten opbouw
    const t = nextTime + (buildStart - step) * spb();
    riser(t, 32 * spb());
    dropBtn.disabled = true; dropBtn.textContent = 'Opbouw…'; dropBtn.classList.add('armed');
  });

  $$('.sources button').forEach((b) => b.addEventListener('click', () => {
    src = +b.dataset.src;
    $$('.sources button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    keyOut.textContent = SOURCES[src].key;
    if (ctx) { stopLoop(nextTime); loadSource(src); }
    if (!playing) start();
  }));

  const bind = (input, out, fn) => { input.addEventListener('input', () => { fn(+input.value); }); fn(+input.value); };
  bind(grooveIn, null, setGroove);
  bind(bpmIn, null, (v) => {
    bpm = v; bpmOut.textContent = v; $('#bpmKnobOut').textContent = v;
    root.style.setProperty('--bpm', v); applyTempo();
  });
  bind(volIn, null, (v) => {
    volume = v / 100; $('#volOut').textContent = v + '%';
    if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.03);
  });
  bind(filterIn, null, (v) => {
    if (Math.abs(v) < 4) v = 0;
    filterV = v / 100;
    $('#filterOut').textContent = v === 0 ? 'open' : v < 0 ? 'LP ' + -v + '%' : 'HP ' + v + '%';
    applyFilter();
  });
  filterIn.addEventListener('dblclick', () => { filterIn.value = 0; filterIn.dispatchEvent(new Event('input')); });
  bind(chopIn, null, (v) => { chop = v / 100; $('#chopOut').textContent = v + '%'; });
  bind(mixIn, null, (v) => { mix = v / 100; $('#mixOut').textContent = v + '%'; applyMix(); });
  bind(echoIn, null, (v) => { echo = v / 100; $('#echoOut').textContent = v + '%'; applyEcho(); });

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
    // haar set: golfvorm van de loop met afspeelkop
    const pk = peaks[src];
    if (pk) {
      const midY = SH * 0.42, amp = SH * 0.22;
      const head = playing ? ((shownPos + Math.max(0, ctx.currentTime - shownTime) / spb()) % LOOP_STEPS) / LOOP_STEPS : -1;
      const bw2 = SW / pk.length;
      for (let k = 0; k < pk.length; k++) {
        const x = k * bw2, past = head >= 0 && k / pk.length <= head;
        sctx.fillStyle = past ? 'rgba(255,42,61,0.22)' : 'rgba(255,255,255,0.07)';
        const h = pk[k] * amp;
        sctx.fillRect(x, midY - h, Math.max(1, bw2 - 1), h * 2);
      }
      if (head >= 0) {
        sctx.fillStyle = 'rgba(243,238,111,0.9)';
        sctx.fillRect(head * SW - dpr, 0, 2 * dpr, SH);
      }
      for (let b = 1; b < 4; b++) { sctx.fillStyle = 'rgba(255,255,255,0.08)'; sctx.fillRect((b / 4) * SW, 0, dpr, SH); }
    }
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
