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
     Audio: Groove Machine (Web Audio, generated live)
     ========================================================= */
  let ctx, master, comp, analyser, freqData, timeData, noiseBuf, delay, delayFb, distCurve;
  let playing = false, step = 0, nextTime = 0, timer = null;
  let groove = 0.8, bpm = 126, volume = 0.7;

  const playBtn = $('#play'), topPlay = $('#topPlay');
  const grooveIn = $('#groove'), bpmIn = $('#bpm'), volIn = $('#vol');
  const modeOut = $('#modeOut'), bpmOut = $('#bpmOut'), stepOut = $('#stepOut'), grooveFill = $('#grooveFill');
  const stepsEl = $('#steps');
  for (let i = 0; i < 16; i++) stepsEl.appendChild(document.createElement('i'));
  const stepCells = $$('i', stepsEl);

  function initAudio() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = volume;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.78;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    timeData = new Uint8Array(analyser.fftSize);
    master.connect(comp).connect(analyser).connect(ctx.destination);

    // noise buffer
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // dotted-eighth delay for melodies
    delay = ctx.createDelay(2);
    delayFb = ctx.createGain();
    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass'; delayFilter.frequency.value = 2400;
    delayFb.gain.value = 0.42;
    delay.connect(delayFilter).connect(delayFb).connect(delay);
    const delayOut = ctx.createGain(); delayOut.gain.value = 0.55;
    delayFilter.connect(delayOut).connect(master);

    // distortion curve for "boem"
    const n = 1024; distCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; distCurve[i] = Math.tanh(x * 9); }
  }

  const hz = (semis, base = 440) => base * Math.pow(2, semis / 12);
  const spb = () => 60 / bpm / 4; // seconds per 16th

  function kick(t) {
    const boem = 1 - groove;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150 + boem * 60, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.12 + boem * 0.05);
    const len = 0.38 + boem * 0.25;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g);

    const clean = ctx.createGain(); clean.gain.value = 0.55 + groove * 0.35;
    g.connect(clean).connect(master);
    if (boem > 0.05) {
      const ws = ctx.createWaveShaper(); ws.curve = distCurve; ws.oversample = '2x';
      const dg = ctx.createGain(); dg.gain.value = boem * 0.55;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      g.connect(ws).connect(lp).connect(dg).connect(master);
    }
    o.start(t); o.stop(t + len + 0.05);
  }

  function noise(t, { type = 'highpass', freq = 7000, q = 0.7, len = 0.05, gain = 0.2, dest = master }) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  }

  function bass(t, f, len) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.value = f; o2.frequency.value = f / 2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
    const cut = 180 + groove * 700;
    lp.frequency.setValueAtTime(cut * 2.4, t);
    lp.frequency.exponentialRampToValueAtTime(cut, t + len);
    const g = ctx.createGain();
    const lvl = 0.22 * Math.min(1, (groove - 0.15) * 2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(lvl, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(master);
    o.start(t); o2.start(t); o.stop(t + len + 0.05); o2.stop(t + len + 0.05);
  }

  function pluck(t, f, lvl) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = 'triangle'; o2.type = 'sine';
    o.frequency.value = f; o2.frequency.value = f * 2.005;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(lvl, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    o.connect(g); o2.connect(g2).connect(g);
    g.connect(master); g.connect(delay);
    o.start(t); o2.start(t); o.stop(t + 0.4); o2.stop(t + 0.4);
  }

  function pad(t, root, len, lvl) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(lvl, t + len * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    lp.connect(g).connect(master);
    [0, 3, 7, 10].forEach((iv) => {
      [-7, 7].forEach((det) => {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = hz(root + iv, 220); o.detune.value = det;
        o.connect(lp); o.start(t); o.stop(t + len + 0.05);
      });
    });
  }

  // A minor: A, F, C, G (semitones relative to A)
  const prog = [0, -4, 3, -2];
  const bassPat = [0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0];
  const melPat = [0, null, 7, null, 3, null, 10, null, 0, null, 7, 12, null, 5, null, 3];

  function schedule(s, t) {
    const bar = Math.floor(s / 16) % 4;
    const i = s % 16;
    const root = prog[bar];

    // kick: four on the floor; extra stomps when it's all boem
    if (i % 4 === 0) kick(t);
    if (groove < 0.2 && (i === 10 || i === 14)) kick(t);

    if (groove > 0.15 && i % 4 === 2) noise(t, { gain: 0.16 * groove + 0.04, len: 0.05 });
    if (groove > 0.55 && i % 2 === 1) noise(t, { gain: 0.05 * groove, len: 0.025, freq: 9000 });
    if (groove > 0.7 && i === 14) noise(t, { gain: 0.08, len: 0.22, freq: 6000 });
    if (groove > 0.35 && (i === 4 || i === 12)) {
      noise(t, { type: 'bandpass', freq: 1500, q: 0.9, len: 0.16, gain: 0.32 * groove });
      noise(t + 0.012, { type: 'bandpass', freq: 1200, q: 0.9, len: 0.12, gain: 0.18 * groove });
    }

    if (groove > 0.2 && bassPat[i]) bass(t, hz(root, 55), spb() * 1.6);

    if (groove > 0.5 && melPat[i] !== null) {
      const lvl = 0.07 * Math.min(1, (groove - 0.5) * 2.5);
      pluck(t, hz(root + melPat[i], 440), lvl);
    }
    if (groove > 0.7 && i === 0) pad(t, root, spb() * 16, 0.05 * (groove - 0.7) / 0.3);

    // visuals in sync
    const delayMs = Math.max(0, (t - ctx.currentTime) * 1000);
    setTimeout(() => {
      stepCells.forEach((c, k) => c.classList.toggle('now', k === i));
      stepOut.textContent = `${bar + 1}.${Math.floor(i / 4) + 1}.${(i % 4) + 1}`;
    }, delayMs);
  }

  function scheduler() {
    while (nextTime < ctx.currentTime + 0.12) {
      schedule(step, nextTime);
      nextTime += spb();
      step++;
    }
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
    nextTime = ctx.currentTime + 0.06;
    timer = setInterval(scheduler, 25);
    scheduler();
    [playBtn, topPlay].forEach((b) => b.setAttribute('aria-pressed', 'true'));
    playBtn.querySelector('.bigplay__lbl').textContent = 'Stop';
    topPlay.querySelector('.lbl').textContent = 'Stop';
  }
  function stop() {
    playing = false;
    clearInterval(timer);
    [playBtn, topPlay].forEach((b) => b.setAttribute('aria-pressed', 'false'));
    playBtn.querySelector('.bigplay__lbl').textContent = 'Play';
    topPlay.querySelector('.lbl').textContent = 'Play';
    stepCells.forEach((c) => c.classList.remove('now'));
    stepOut.textContent = '--';
  }
  const toggle = () => (playing ? stop() : start());
  playBtn.addEventListener('click', toggle);
  topPlay.addEventListener('click', toggle);

  grooveIn.addEventListener('input', () => setGroove(+grooveIn.value));
  bpmIn.addEventListener('input', () => {
    bpm = +bpmIn.value; bpmOut.textContent = bpm;
    root.style.setProperty('--bpm', bpm);
  });
  volIn.addEventListener('input', () => {
    volume = volIn.value / 100;
    if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.03);
  });
  $$('.presets button').forEach((b) => b.addEventListener('click', () => {
    grooveIn.value = b.dataset.preset;
    setGroove(+b.dataset.preset);
    if (!playing) start();
  }));
  setGroove(+grooveIn.value);

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
      const h = v * SH * 0.55;
      sctx.fillStyle = `hsla(${355 + (i / sb) * 65}, 100%, 60%, 0.5)`;
      sctx.fillRect((i / sb) * SW, SH - h - 40 * dpr, SW / sb - 2 * dpr, h);
    }
    // waveform
    sctx.beginPath();
    sctx.lineWidth = 2.5 * dpr;
    sctx.strokeStyle = groove < 0.3 ? '#ff2a3d' : '#f3ee6f';
    sctx.shadowColor = sctx.strokeStyle;
    sctx.shadowBlur = 14 * dpr;
    for (let x = 0; x < SW; x++) {
      let v;
      if (live) v = (timeData[Math.floor((x / SW) * timeData.length)] - 128) / 128;
      else v = Math.sin(x * 0.02 + time * 2) * 0.04;
      const y = SH * 0.45 + v * SH * 0.38;
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
