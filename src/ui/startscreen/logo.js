/* =====================================================================
   LOGO „ZARZUĆ” – animowany znak na canvasie.

   Historia w 3 sekundach:
   1. Litery spadają z nieba do jeziora (chlapnięcie, kręgi, sprężyste lądowanie).
   2. Z prawej góry przylatuje zestaw – spławik ląduje nad „C” i STAJE SIĘ KRESKĄ „Ć”.
      Słowo dopełnia się dopiero w chwili zarzucenia.
   3. Na biegu jałowym: w literach faluje woda (poziom stały, litery bujają się przez nią),
      po sekcji nieba przelatuje połysk, pod spodem drga odbicie w wodzie, a co kilka sekund
      spławik ma branie (drgnięcie, krąg na wodzie, „C” się wzdryga). Klik w logo = chlupnięcie.
   ===================================================================== */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const rand = (a, b) => a + Math.random() * (b - a);

const INK = '#0a1c30';
const INK_DEEP = '#050f1c';
const FONT = "'Lilita One', 'Arial Black', Impact, sans-serif";

/** litery z kreską → litera bazowa (kreskę rysuje spławik) */
const ACUTE = { 'Ć': 'C', 'Ś': 'S', 'Ń': 'N', 'Ó': 'O', 'Ź': 'Z' };

export function createLogo(host, title) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.createElement('canvas');
  cv.className = 'logo-cv';
  cv.setAttribute('aria-hidden', 'true');
  host.appendChild(cv);
  const ctx = cv.getContext('2d');
  const fillCv = document.createElement('canvas');
  const fctx = fillCv.getContext('2d');
  const reflCv = document.createElement('canvas');
  const rctx = reflCv.getContext('2d');

  // --- litery ---
  const raw = [...title.toUpperCase()];
  let accentIndex = -1;
  const chars = [];
  raw.forEach((ch) => {
    if (ch === ' ') { chars.push(' '); return; }
    if (ACUTE[ch] && accentIndex < 0) { accentIndex = chars.length; chars.push(ACUTE[ch]); }
    else chars.push(ch);
  });
  if (accentIndex < 0) accentIndex = chars.length - 1; // bez polskiej litery – spławik nad ostatnią

  // --- stan ---
  let fs = 100, DPR = 1, W = 0, H = 0, B = 0, capH = 72, padL = 0, padT = 0, textW = 0;
  const L = []; // litery: {ch, x, w, ph, t0}
  const drops = [], rings = [], sparks = [];
  let time = 0, last = performance.now() / 1000, running = true, started = false, startAt = 0;
  let nextNibble = 7, nibbleAt = -99, nextShine = 2.6, shineAt = -99, nextGlint = 4, glint = null;
  const bob = { landed: false, castAt: 1.35, flight: 0.62, ang: 0, angV: 0, dip: 0, dipV: 0, jolt: 0 };

  function layout() {
    const cs = getComputedStyle(host);
    fs = parseFloat(cs.fontSize) || 100;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    ctx.font = `400 ${fs}px ${FONT}`;
    const m = ctx.measureText('Z');
    capH = m.actualBoundingBoxAscent || fs * 0.72;
    const spacing = fs * 0.035;
    let x = 0;
    L.length = 0;
    chars.forEach((ch, i) => {
      const w = ch === ' ' ? fs * 0.26 : ctx.measureText(ch).width;
      L.push({ ch, x, w, ph: i * 1.7 + 0.4, t0: 0.12 + i * 0.085, rot0: (i % 2 ? 1 : -1) * rand(0.12, 0.3), sq: 0, sqV: 0, landed: false });
      x += w + spacing;
    });
    textW = x - spacing;
    padL = fs * 0.3;
    padT = fs * 0.95;
    const padR = fs * 1.05, padB = fs * 0.62;
    W = Math.ceil(padL + textW + padR);
    H = Math.ceil(padT + capH + padB);
    B = padT + capH;
    for (const c of [cv, fillCv, reflCv]) {
      c.width = Math.round(W * DPR);
      c.height = Math.round(H * DPR);
    }
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    cv.style.left = `${-padL}px`;
    cv.style.top = `${-padT}px`;
    host.style.width = `${textW}px`;
    host.style.height = `${capH + fs * 0.16}px`;
    host.style.setProperty('--logo-fs', `${fs}px`);
  }

  // --- geometria ---
  const accentRest = () => {
    const a = L[accentIndex];
    return { x: padL + a.x + a.w * 0.58, y: B - capH - fs * 0.2 };
  };
  const anchor = () => {
    const r = accentRest();
    return { x: r.x + fs * 1.05, y: r.y - fs * 1.35 };
  };
  const waterLevel = (x) => B - capH * 0.47 + Math.sin(x / fs * 5.2 - time * 1.9) * fs * 0.028 + Math.sin(x / fs * 11.3 + time * 1.3) * fs * 0.012;

  /** przesunięcie/obrót/zgniecenie litery w czasie t (intro + bujanie) */
  function letterPose(l, i) {
    const t = time - l.t0;
    let dy = 0, rot = 0, alpha = 1;
    if (!reduce && t < 0.78) {
      if (t < 0) return { dy: -fs * 3, rot: 0, sx: 1, sy: 1, alpha: 0 };
      const fall = 0.42;
      if (t < fall) {
        const k = t / fall;
        dy = -fs * 1.55 * (1 - k * k);
        rot = l.rot0 * (1 - k);
        alpha = clamp(k * 3, 0, 1);
      } else {
        const k = (t - fall) / (0.78 - fall);
        dy = -Math.sin(k * Math.PI) * fs * 0.11 * (1 - k);
      }
    }
    // bujanie w wodzie
    const idle = reduce ? 0 : smoothIn(time - l.t0 - 0.8);
    dy += Math.sin(time * 1.35 + l.ph) * fs * 0.02 * idle;
    rot += Math.sin(time * 1.05 + l.ph * 1.3) * 0.022 * idle;
    // wstrząs „C” przy braniu
    if (i === accentIndex) rot += bob.jolt * 0.08 * Math.sin(time * 38);
    const sq = l.sq;
    return { dy, rot, sx: 1 + sq * 0.16, sy: 1 - sq * 0.2, alpha };
  }
  const smoothIn = (t) => clamp(t / 0.8, 0, 1);

  function withLetter(c, l, pose, fn) {
    c.save();
    const cx = padL + l.x + l.w / 2;
    c.translate(cx, B + pose.dy);
    c.rotate(pose.rot);
    c.scale(pose.sx, pose.sy);
    c.translate(-l.w / 2, 0);
    fn(c);
    c.restore();
  }

  // --- efekty ---
  function splash(x, strength) {
    const n = Math.round(10 + strength * 14);
    for (let i = 0; i < n; i++) {
      drops.push({ x: x + rand(-0.25, 0.25) * fs * 0.6, y: B, vx: rand(-1, 1) * fs * 1.1, vy: -rand(1.2, 3.1) * fs * (0.5 + strength * 0.5), r: rand(0.012, 0.03) * fs, age: 0, life: rand(0.45, 0.8) });
    }
    rings.push({ x, age: 0, life: 1.5, max: fs * (0.4 + strength * 0.3) });
    rings.push({ x, age: -0.18, life: 1.2, max: fs * (0.22 + strength * 0.15) });
  }
  function sparkle(x, y, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(0.4, 1.3) * fs;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: rand(0.35, 0.7) });
    }
  }

  function update(dt) {
    time += dt;
    // lądowanie liter
    L.forEach((l, i) => {
      if (l.ch === ' ') return;
      if (!l.landed && time - l.t0 >= 0.42) {
        l.landed = true;
        if (!reduce) {
          l.sqV = 9;
          splash(padL + l.x + l.w / 2, 0.6);
        }
      }
      // sprężyna zgniecenia
      const acc = -l.sq * 260 - l.sqV * 14;
      l.sqV += acc * dt;
      l.sq += l.sqV * dt;
    });
    // zarzucenie spławika
    if (!bob.landed && time >= bob.castAt + bob.flight) {
      bob.landed = true;
      const r = accentRest();
      bob.angV = -7;
      bob.dipV = fs * 2.2;
      const a = L[accentIndex];
      a.sqV = 7;
      if (!reduce) sparkle(r.x, r.y, 14);
    }
    // sprężyna kąta i ugięcia spławika
    bob.angV += (-bob.ang * 120 - bob.angV * 7) * dt;
    bob.ang += bob.angV * dt;
    bob.dipV += (-bob.dip * 140 - bob.dipV * 9) * dt;
    bob.dip += bob.dipV * dt;
    bob.jolt = Math.max(0, bob.jolt - dt * 2.2);
    // branie co kilka sekund
    if (!reduce && bob.landed && time > nextNibble) {
      nibbleAt = time;
      nextNibble = time + rand(6.5, 10);
    }
    const nt = time - nibbleAt;
    if (nt >= 0 && nt < 0.9) {
      const pulses = [0, 0.32, 0.55];
      pulses.forEach((p) => {
        if (nt >= p && nt - dt < p) {
          bob.dipV += fs * 3.2;
          bob.angV += rand(-4, 4);
          bob.jolt = 1;
          const a = L[accentIndex];
          rings.push({ x: padL + a.x + a.w / 2, age: 0, life: 1.4, max: fs * 0.45 });
        }
      });
    }
    // połysk i błysk
    if (!reduce && time > nextShine) { shineAt = time; nextShine = time + rand(4.5, 7); }
    if (!reduce && time > nextGlint && time > 2.5) {
      const l = L[Math.floor(rand(0, L.length))];
      if (l.ch !== ' ') glint = { x: padL + l.x + l.w * rand(0.2, 0.8), y: B - capH * rand(0.62, 0.95), age: 0 };
      nextGlint = time + rand(3, 6);
    }
    if (glint) { glint.age += dt; if (glint.age > 0.7) glint = null; }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.age += dt; d.vy += fs * 7 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.age > d.life || (d.vy > 0 && d.y > B + fs * 0.05)) drops.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].age += dt; if (rings[i].age > rings[i].life) rings.splice(i, 1); }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.9; s.vy *= 0.9;
      if (s.age > s.life) sparks.splice(i, 1);
    }
  }

  // --- rysowanie ---
  function drawReflection() {
    // odbicie liter w wodzie: lustro względem linii wody, pocięte na paski z falowaniem
    rctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    rctx.clearRect(0, 0, W, H);
    rctx.font = `400 ${fs}px ${FONT}`;
    const g = rctx.createLinearGradient(0, B - capH, 0, B);
    g.addColorStop(0, '#ffd27a');
    g.addColorStop(0.5, '#ff9a5a');
    g.addColorStop(0.53, '#4fc3e6');
    g.addColorStop(1, '#1f78ad');
    L.forEach((l, i) => {
      if (l.ch === ' ') return;
      const p = letterPose(l, i);
      if (p.alpha <= 0) return;
      withLetter(rctx, l, p, (c) => {
        c.fillStyle = INK;
        c.lineJoin = 'round';
        c.lineWidth = fs * 0.12;
        c.strokeStyle = INK;
        c.strokeText(l.ch, 0, 0);
        c.fillStyle = g;
        c.fillText(l.ch, 0, 0);
      });
    });
    const reflH = fs * 0.55;
    const strip = 2;
    for (let y = 0; y < reflH; y += strip) {
      const k = y / reflH;
      const off = Math.sin(y / fs * 34 - time * 3.2) * fs * 0.012 * (0.4 + k * 2);
      ctx.globalAlpha = 0.34 * (1 - k) * (1 - k);
      // wiersz (B - y) oryginału trafia na (B + y)
      const sy = (B - y - strip) * DPR;
      if (sy < 0) break;
      ctx.drawImage(reflCv, 0, sy, W * DPR, strip * DPR, off, B + y, W, strip);
    }
    ctx.globalAlpha = 1;
  }

  function drawWaterSurface() {
    // delikatne refleksy na tafli pod literami
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const y = B + fs * (0.04 + (i / 14) * 0.45);
      const x = padL + ((i * 0.37 + time * 0.015 * (i % 3 + 1)) % 1) * textW;
      const len = fs * (0.12 + (i % 4) * 0.06);
      const a = (0.5 + 0.5 * Math.sin(time * 1.7 + i * 2.1)) * 0.22 * (1 - i / 14);
      ctx.strokeStyle = `rgba(255,220,190,${a})`;
      ctx.lineWidth = Math.max(1, fs * 0.012);
      ctx.beginPath();
      ctx.moveTo(x - len / 2, y);
      ctx.lineTo(x + len / 2, y);
      ctx.stroke();
    }
    ctx.restore();
    for (const r of rings) {
      if (r.age < 0) continue;
      const k = r.age / r.life, rr = r.max * easeOut(k);
      ctx.strokeStyle = `rgba(255,236,210,${(1 - k) * 0.55})`;
      ctx.lineWidth = Math.max(1, fs * 0.014);
      ctx.beginPath();
      ctx.ellipse(r.x, B + fs * 0.03, rr, rr * 0.16, 0, 0, TAU);
      ctx.stroke();
    }
  }

  function drawLetters() {
    ctx.font = `400 ${fs}px ${FONT}`;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    const depth = fs * 0.085;
    // 1) bryła (wyciągnięcie w dół) + gruby kontur
    L.forEach((l, i) => {
      if (l.ch === ' ') return;
      const p = letterPose(l, i);
      if (p.alpha <= 0) return;
      ctx.globalAlpha = p.alpha;
      withLetter(ctx, l, p, (c) => {
        c.strokeStyle = INK_DEEP;
        c.fillStyle = INK_DEEP;
        c.lineWidth = fs * 0.13;
        for (let k = 6; k >= 1; k--) {
          const o = (depth * k) / 6;
          c.strokeText(l.ch, o * 0.18, o);
          c.fillText(l.ch, o * 0.18, o);
        }
        c.strokeStyle = INK;
        c.strokeText(l.ch, 0, 0);
      });
    });
    ctx.globalAlpha = 1;

    // 2) wypełnienie: niebo o świcie na górze, jezioro z falą na dole (poziom wody stały)
    fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    fctx.clearRect(0, 0, W, H);
    fctx.font = ctx.font;
    fctx.globalCompositeOperation = 'source-over';
    L.forEach((l, i) => {
      if (l.ch === ' ') return;
      const p = letterPose(l, i);
      if (p.alpha <= 0) return;
      fctx.globalAlpha = p.alpha;
      withLetter(fctx, l, p, (c) => {
        c.fillStyle = '#fff';
        c.fillText(l.ch, 0, 0);
      });
    });
    fctx.globalAlpha = 1;
    fctx.globalCompositeOperation = 'source-atop';
    const top = B - capH - fs * 0.1;
    const sky = fctx.createLinearGradient(0, top, 0, B);
    sky.addColorStop(0, '#fffdf1');
    sky.addColorStop(0.22, '#ffeaa0');
    sky.addColorStop(0.42, '#ffc553');
    sky.addColorStop(0.6, '#ff8f3c');
    sky.addColorStop(1, '#f2603a');
    fctx.fillStyle = sky;
    fctx.fillRect(0, 0, W, H);
    // jezioro pod falą
    const x0 = padL - fs * 0.3, x1 = padL + textW + fs * 0.3;
    fctx.beginPath();
    fctx.moveTo(x0, H);
    for (let x = x0; x <= x1; x += 4) fctx.lineTo(x, waterLevel(x));
    fctx.lineTo(x1, H);
    fctx.closePath();
    const wl = B - capH * 0.47;
    const water = fctx.createLinearGradient(0, wl - fs * 0.05, 0, B + fs * 0.1);
    water.addColorStop(0, '#8fe6fb');
    water.addColorStop(0.35, '#3fb4e2');
    water.addColorStop(1, '#155d97');
    fctx.fillStyle = water;
    fctx.fill();
    // kaustyki w wodzie
    fctx.save();
    fctx.clip();
    fctx.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 9; i++) {
      const cx = x0 + (((i * 0.29 + time * 0.035 * (1 + (i % 3))) % 1.2) - 0.1) * (x1 - x0);
      const cy = wl + fs * (0.08 + ((i * 0.41) % 1) * 0.3);
      const r = fs * (0.08 + (i % 3) * 0.04);
      const gg = fctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gg.addColorStop(0, 'rgba(220,250,255,.35)');
      gg.addColorStop(1, 'rgba(220,250,255,0)');
      fctx.fillStyle = gg;
      fctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    // bąbelki
    for (let i = 0; i < 7; i++) {
      const bx = padL + ((i * 0.173 + 0.05) % 1) * textW + Math.sin(time * 2 + i) * fs * 0.02;
      const life = (time * 0.45 + i * 0.37) % 1;
      const by = B - life * capH * 0.42;
      fctx.fillStyle = `rgba(235,252,255,${0.55 * (1 - life)})`;
      fctx.beginPath();
      fctx.arc(bx, by, fs * (0.012 + (i % 3) * 0.006), 0, TAU);
      fctx.fill();
    }
    fctx.restore();
    // piana na linii wody
    fctx.globalCompositeOperation = 'source-atop';
    fctx.strokeStyle = 'rgba(255,255,255,.95)';
    fctx.lineWidth = fs * 0.028;
    fctx.beginPath();
    for (let x = x0; x <= x1; x += 4) {
      const y = waterLevel(x);
      if (x === x0) fctx.moveTo(x, y);
      else fctx.lineTo(x, y);
    }
    fctx.stroke();
    fctx.strokeStyle = 'rgba(255,255,255,.35)';
    fctx.lineWidth = fs * 0.012;
    fctx.beginPath();
    for (let x = x0; x <= x1; x += 4) {
      const y = waterLevel(x) + fs * 0.055 + Math.sin(x / fs * 8 + time * 2.4) * fs * 0.008;
      if (x === x0) fctx.moveTo(x, y);
      else fctx.lineTo(x, y);
    }
    fctx.stroke();
    // połysk górnej krawędzi
    const gl = fctx.createLinearGradient(0, B - capH, 0, B - capH * 0.7);
    gl.addColorStop(0, 'rgba(255,255,255,.55)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    fctx.fillStyle = gl;
    fctx.fillRect(0, B - capH - fs * 0.2, W, capH * 0.35);
    // przelatujący błysk
    const st = time - shineAt;
    if (st >= 0 && st < 1.1) {
      const k = easeInOut(st / 1.1);
      const sx = lerp(padL - fs, padL + textW + fs, k);
      fctx.save();
      fctx.translate(sx, B - capH * 0.5);
      fctx.rotate(0.35);
      const sh = fctx.createLinearGradient(-fs * 0.25, 0, fs * 0.25, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0)');
      sh.addColorStop(0.5, 'rgba(255,255,255,.75)');
      sh.addColorStop(1, 'rgba(255,255,255,0)');
      fctx.fillStyle = sh;
      fctx.fillRect(-fs * 0.25, -fs, fs * 0.5, fs * 2);
      fctx.restore();
    }
    fctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(fillCv, 0, 0, W, H);
  }

  function drawBobber() {
    const rest = accentRest();
    const an = anchor();
    let x, y, ang;
    const tc = time - bob.castAt;
    if (!bob.landed) {
      if (tc < 0) return;
      // lot zestawu po łuku z prawej góry
      const k = easeOut(clamp(tc / bob.flight, 0, 1));
      const sx = W + fs * 0.4, sy = -fs * 0.3;
      const cx = rest.x + fs * 0.9, cy = rest.y - fs * 1.2;
      const u = 1 - k;
      x = u * u * sx + 2 * u * k * cx + k * k * rest.x;
      y = u * u * sy + 2 * u * k * cy + k * k * rest.y;
      ang = lerp(-1.2, 0, k) + Math.sin(k * 10) * 0.2 * (1 - k);
    } else {
      x = rest.x;
      y = rest.y + bob.dip * 0.35;
      ang = bob.ang * 0.1;
    }
    // oś spławika wzdłuż żyłki (naprężona) – to jest kreska nad „Ć”
    const dirX = an.x - x, dirY = an.y - y;
    const base = Math.atan2(dirX, -dirY); // kąt od pionu
    const a = base + ang;
    const h = fs * 0.56, w = fs * 0.2;
    // żyłka: od kotwicy (nad kadrem) do czubka antenki, znika ku górze
    const tipX = x + Math.sin(a) * h * 0.64, tipY = y - Math.cos(a) * h * 0.64;
    const sag = bob.landed ? bob.dip * 0.4 + Math.sin(time * 1.6) * fs * 0.015 : fs * 0.25 * (1 - clamp(tc / bob.flight, 0, 1));
    const lg = ctx.createLinearGradient(tipX, tipY, an.x, an.y);
    lg.addColorStop(0, 'rgba(255,248,230,.95)');
    lg.addColorStop(0.55, 'rgba(255,248,230,.55)');
    lg.addColorStop(1, 'rgba(255,248,230,0)');
    ctx.strokeStyle = lg;
    ctx.lineWidth = Math.max(1.3, fs * 0.014);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo((tipX + an.x) / 2 - sag * 0.4, (tipY + an.y) / 2 + sag, an.x, an.y);
    ctx.stroke();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const ol = fs * 0.03;
    // cień / kontur jak litery
    ctx.fillStyle = INK_DEEP;
    ctx.beginPath();
    ctx.ellipse(fs * 0.012, fs * 0.02, w / 2 + ol, h * 0.34 + ol, 0, 0, TAU);
    ctx.fill();
    // antenka
    ctx.strokeStyle = INK;
    ctx.lineWidth = fs * 0.05;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.3);
    ctx.lineTo(0, -h * 0.64);
    ctx.stroke();
    ctx.strokeStyle = '#fff4dc';
    ctx.lineWidth = fs * 0.022;
    ctx.stroke();
    // korpus: biały dół
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2 + ol * 0.7, h * 0.34 + ol * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h * 0.34, 0, 0, TAU);
    ctx.fill();
    // czerwona góra
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w, -h, w * 2, h);
    ctx.clip();
    const rg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    rg.addColorStop(0, '#ff6a4a');
    rg.addColorStop(1, '#d82f22');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h * 0.34, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    // pasek i połysk
    ctx.strokeStyle = INK;
    ctx.lineWidth = fs * 0.018;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(w / 2, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.beginPath();
    ctx.ellipse(-w * 0.2, -h * 0.13, w * 0.09, h * 0.08, -0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const d of drops) {
      const k = d.age / d.life;
      ctx.fillStyle = `rgba(230,248,255,${0.9 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of sparks) {
      const k = s.age / s.life;
      ctx.fillStyle = `rgba(255,236,170,${1 - k})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, fs * 0.018 * (1 - k * 0.6), 0, TAU);
      ctx.fill();
    }
    if (glint) {
      const k = glint.age / 0.7, sz = fs * 0.16 * Math.sin(k * Math.PI);
      ctx.translate(glint.x, glint.y);
      ctx.rotate(k * 1.2);
      ctx.fillStyle = 'rgba(255,255,240,.95)';
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i * TAU) / 4;
        ctx.lineTo(Math.cos(a) * sz, Math.sin(a) * sz);
        ctx.lineTo(Math.cos(a + TAU / 8) * sz * 0.18, Math.sin(a + TAU / 8) * sz * 0.18);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function frame(ms) {
    if (!running) return;
    const now = ms / 1000;
    const dt = Math.min(0.05, Math.max(0, now - last));
    last = now;
    if (started) {
      update(dt);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      drawReflection();
      drawWaterSurface();
      drawLetters();
      drawBobber();
      drawParticles();
    }
    requestAnimationFrame(frame);
  }

  // klik w logo – chlupnięcie i branie
  const onClick = (e) => {
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left;
    splash(clamp(x, padL, padL + textW), 0.9);
    L.forEach((l) => { if (Math.abs(padL + l.x + l.w / 2 - x) < fs * 0.8) l.sqV += 6; });
    nibbleAt = time;
  };
  host.addEventListener('pointerdown', onClick);
  const onResize = () => layout();
  window.addEventListener('resize', onResize);

  // start po załadowaniu kroju (z bezpiecznym limitem czasu)
  const fontReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load(`400 100px 'Lilita One'`), new Promise((r) => setTimeout(r, 1500))])
    : Promise.resolve();
  fontReady.then(() => {
    if (!running) return;
    layout();
    started = true;
    startAt = performance.now();
    // ?logoT=6 – podgląd stanu logo po intro (debug / zrzuty ekranu)
    const skipTo = parseFloat(new URLSearchParams(location.search).get('logoT') || '');
    if (reduce || skipTo > 0) {
      time = reduce ? 5 : skipTo;
      L.forEach((l) => (l.landed = true));
      if (time > bob.castAt + bob.flight) bob.landed = true;
    }
  });
  requestAnimationFrame(frame);

  return {
    destroy() {
      running = false;
      host.removeEventListener('pointerdown', onClick);
      window.removeEventListener('resize', onResize);
    },
  };
}
