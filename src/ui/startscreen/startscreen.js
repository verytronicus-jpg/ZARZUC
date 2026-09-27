import { createLogo } from './logo.js';
/* =====================================================================
   EKRAN STARTOWY (2D canvas + UI z desek) – projekt użytkownika, podpięty do gry.
   mountStartScreen({ title, species, onCastStart, onStart, onOptions })
   ===================================================================== */
const MARKUP = "\n<svg width=\"0\" height=\"0\" style=\"position:absolute\" aria-hidden=\"true\">\n  <defs>\n    <symbol id=\"i-bob\" viewBox=\"0 0 24 40\">\n      <line x1=\"12\" y1=\"1\" x2=\"12\" y2=\"10\" stroke=\"#fff4dc\" stroke-width=\"2.2\" stroke-linecap=\"round\"/>\n      <path d=\"M12 8C19 8 21 16 21 22C21 30 17 36 12 38C7 36 3 30 3 22C3 16 5 8 12 8Z\" fill=\"#fff\"/>\n      <path d=\"M12 8C19 8 21 16 21 22H3C3 16 5 8 12 8Z\" fill=\"#ec4330\"/>\n      <ellipse cx=\"8.5\" cy=\"15\" rx=\"2\" ry=\"3.6\" fill=\"rgba(255,255,255,.55)\"/>\n      <path d=\"M3 22H21\" stroke=\"#0a1c30\" stroke-width=\"1.5\"/>\n      <path d=\"M12 8C19 8 21 16 21 22C21 30 17 36 12 38C7 36 3 30 3 22C3 16 5 8 12 8Z\" fill=\"none\" stroke=\"#0a1c30\" stroke-width=\"2\"/>\n    </symbol>\n  </defs>\n</svg>\n\n<canvas id=\"ss-scene\" aria-hidden=\"true\"></canvas>\n\n<main id=\"ss-ui\">\n  <header class=\"brand\">\n    <h1 class=\"title\" aria-label=\"__TITLE__\">\n      <span class=\"jump\" aria-hidden=\"true\"><i><svg viewBox=\"-14 -6 116 62\">\n        <defs><linearGradient id=\"jf\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#eaf7ff\"/><stop offset=\".5\" stop-color=\"#8fd0ec\"/><stop offset=\"1\" stop-color=\"#3a8fc0\"/></linearGradient></defs>\n        <g stroke=\"#0a1c30\" stroke-width=\"4\" stroke-linejoin=\"round\">\n          <path d=\"M12 25L-8 8Q-2 25-8 42Z\" fill=\"#5fb8e0\"/>\n          <path d=\"M34 11Q46-2 62 9Z\" fill=\"#5fb8e0\"/>\n          <path d=\"M4 25C18 6 58 2 82 16C90 20 95 23 96 25C95 27 90 30 82 34C58 48 18 44 4 25Z\" fill=\"url(#jf)\"/>\n        </g>\n        <circle cx=\"80\" cy=\"21\" r=\"3.2\" fill=\"#0a1c30\"/>\n        <path d=\"M68 16Q72 25 68 34\" stroke=\"#0a1c30\" stroke-width=\"2.5\" fill=\"none\" stroke-linecap=\"round\"/>\n      </svg></i></span>\n      __TITLE_LETTERS__\n    </h1>\n    <p class=\"tagline\">__TAGLINE__</p>\n  </header>\n\n  <nav class=\"menu\" aria-label=\"Menu g\u0142\u00f3wne\">\n    <button class=\"wood primary\" type=\"button\" data-act=\"start\" style=\"--i:0\">\n      <span class=\"bob\" aria-hidden=\"true\"><svg><use href=\"#i-bob\"/></svg></span>\n      <span class=\"lbl\">Zacznij \u0142owi\u0107</span>\n      <svg class=\"ico\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"3.6\" r=\"1.9\"/><path d=\"M12 5.5V15a4.5 4.5 0 0 1-9 0v-2.2l3 2.6\"/></svg>\n    </button>\n    <button class=\"wood\" type=\"button\" data-act=\"collection\" style=\"--i:1\">\n      <span class=\"bob\" aria-hidden=\"true\"><svg><use href=\"#i-bob\"/></svg></span>\n      <span class=\"lbl\">Kolekcja ryb</span><span class=\"badge\" id=\"ssFishCount\">0 / 5</span>\n    </button>\n    <button class=\"wood\" type=\"button\" data-act=\"time\" style=\"--i:2\">\n      <span class=\"bob\" aria-hidden=\"true\"><svg><use href=\"#i-bob\"/></svg></span>\n      <span class=\"lbl\">Pora dnia</span><span class=\"badge\" id=\"timeLabel\">Zach\u00f3d</span>\n    </button>\n    <button class=\"wood\" type=\"button\" data-act=\"options\" style=\"--i:3\">\n      <span class=\"bob\" aria-hidden=\"true\"><svg><use href=\"#i-bob\"/></svg></span>\n      <span class=\"lbl\">Opcje</span>\n    </button>\n  </nav>\n\n  <p class=\"hint\">Wci\u015bnij <kbd>Enter</kbd>, aby zarzuci\u0107 w\u0119dk\u0119</p>\n</main>\n\n<button id=\"soundBtn\" class=\"icon-btn muted\" type=\"button\" aria-label=\"W\u0142\u0105cz d\u017awi\u0119k\">\n  <svg class=\"on\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 9h4l5-4v14l-5-4H4z\" fill=\"currentColor\"/><path d=\"M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12\"/></svg>\n  <svg class=\"off\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 9h4l5-4v14l-5-4H4z\" fill=\"currentColor\"/><path d=\"M17 9l5 6M22 9l-5 6\"/></svg>\n</button>\n\n<footer class=\"foot\">\n  <span class=\"keys\"><kbd>\u2191</kbd> <kbd>\u2193</kbd> wyb\u00f3r &nbsp;\u00b7&nbsp; <kbd>Enter</kbd> zatwierd\u017a &nbsp;\u00b7&nbsp; <kbd>T</kbd> pora dnia &nbsp;\u00b7&nbsp; <kbd>M</kbd> d\u017awi\u0119k</span>\n  <span class=\"ver\">__DOMAIN__ \u00b7 v0.2 \u00b7 wczesny dost\u0119p</span>\n</footer>\n\n<div id=\"panelWrap\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"panelTitle\">\n  <div class=\"panel\">\n    <div class=\"panel-head\">\n      <h2 id=\"panelTitle\">Opcje</h2>\n      <button class=\"close\" id=\"closeBtn\" type=\"button\" aria-label=\"Zamknij\"><svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.6\" stroke-linecap=\"round\"><path d=\"M6 6l12 12M18 6L6 18\"/></svg></button>\n    </div>\n    <div class=\"panel-body\">\n      <section class=\"view\" data-view=\"collection\">\n        <div class=\"progress-row\"><span>Z\u0142owione gatunki</span><span>0 / 5</span></div>\n        <div class=\"pbar\"><i></i></div>\n        <div class=\"fish-grid\" id=\"fishGrid\"></div>\n        <p class=\"note\">Ka\u017cda z\u0142owiona ryba trafi do kolekcji. Rekord ka\u017cdego gatunku zapisuje si\u0119 w dzienniku (Tab w grze).</p>\n      </section>\n      <section class=\"view\" data-view=\"options\">\n        <div class=\"opt-row\"><label class=\"name\" for=\"optMusic\">Muzyka</label><input type=\"range\" id=\"optMusic\" min=\"0\" max=\"100\" value=\"60\" style=\"--p:60%\"><output>60</output></div>\n        <div class=\"opt-row\"><label class=\"name\" for=\"optNature\">Odg\u0142osy natury</label><input type=\"range\" id=\"optNature\" min=\"0\" max=\"100\" value=\"80\" style=\"--p:80%\"><output>80</output></div>\n        <div class=\"opt-row\"><span class=\"name\">Efekty d\u017awi\u0119kowe</span><label class=\"switch\"><input type=\"checkbox\" id=\"optSfx\" checked aria-label=\"Efekty d\u017awi\u0119kowe\"><i></i></label></div>\n        <div class=\"opt-row\"><span class=\"name\">Pora dnia</span><div class=\"seg\" id=\"segTime\"><button type=\"button\" data-v=\"dawn\">\u015awit</button><button type=\"button\" data-v=\"day\">Dzie\u0144</button><button type=\"button\" data-v=\"sunset\">Zach\u00f3d</button><button type=\"button\" data-v=\"night\">Noc</button></div></div>\n        <div class=\"opt-row\"><span class=\"name\">Jako\u015b\u0107 grafiki</span><div class=\"seg\" id=\"segQ\"><button type=\"button\" data-v=\"high\">Wysoka</button><button type=\"button\" data-v=\"low\">Niska</button></div></div>\n      </section>\n    </div>\n  </div>\n</div>\n\n<div id=\"ss-loading\" aria-live=\"polite\">\n  <div class=\"load-inner\">\n    <div class=\"load-logo\">__LOGO__</div>\n    <div class=\"load-text\" id=\"loadText\">Zarzucanie przyn\u0119ty\u2026</div>\n    <div class=\"track\"><div class=\"fill\" id=\"loadFill\"></div><div class=\"lbob\" id=\"loadBob\"><svg><use href=\"#i-bob\"/></svg></div></div>\n    <div class=\"load-tip\" id=\"loadTip\"></div>\n    <button class=\"wood\" id=\"backBtn\" type=\"button\"><span class=\"lbl\">Wr\u00f3\u0107 do menu</span></button>\n  </div>\n</div>\n\n<div id=\"ss-curtain\"></div>\n";

function titleLetters(title) {
  let i = 0;
  return [...title.toUpperCase()].map((ch) => ch === ' '
    ? '<span class="sp" aria-hidden="true"></span>'
    : `<span class="l" data-l="${ch}" style="--i:${i++}" aria-hidden="true">${ch}</span>`).join('');
}

export function mountStartScreen(opts) {
const root = document.createElement('div');
root.id = 'startscreen';
root.innerHTML = MARKUP.replace('__TITLE_LETTERS__', '').replace('__LOGO__', opts.title.toUpperCase()).replaceAll('__TITLE__', opts.title).replace('__TAGLINE__', opts.tagline).replace('__DOMAIN__', opts.domain || '');
document.body.appendChild(root);
const logo = createLogo(root.querySelector('.title'), opts.title);
const ctrl = new AbortController(), signal = ctrl.signal, timers = [];
let dead = false;


/* ---------- helpers ---------- */
const $ = s => root.querySelector(s);
const $$ = s => [...root.querySelectorAll(s)];
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.round(clamp(a, 0, 1) * 1000) / 1000})`;
const seeded = s => () => (s = (s * 16807) % 2147483647) / 2147483647;

/* ---------- pory dnia ---------- */
const THEMES = {
  dawn:   { label:'Świt',   sky:['#26356a','#7275ad','#eea7a2','#ffdcae'], sun:'#fff6de', glow:'#ffbe96', sunX:.30, sunY:.80, sunR:.042, moon:0,
            mFar:'#8a8bb8', mNear:'#58608f', trees:'#262f52', fog:'#ffd6c8', fogA:.5, wTop:'#7a82b4', wBot:'#161b3c', shine:'#fff1de',
            cloud:'#ffc8bb', cloudA:.8, fg:'#15182c', stars:.25, fire:.12, birds:.7, light:.5, lantern:.35, glit:.85, crick:.15 },
  day:    { label:'Dzień',  sky:['#2a78d0','#56a3ea','#9ccff5','#dcf1ff'], sun:'#ffffff', glow:'#fff4c4', sunX:.80, sunY:.22, sunR:.038, moon:0,
            mFar:'#93b6d2', mNear:'#5f8f8c', trees:'#2b5b44', fog:'#e6f5ff', fogA:.55, wTop:'#4596c8', wBot:'#0c3d62', shine:'#ffffff',
            cloud:'#ffffff', cloudA:.92, fg:'#1b3226', stars:0, fire:0, birds:1, light:.95, lantern:0, glit:.6, crick:0 },
  sunset: { label:'Zachód', sky:['#1b1640','#5e2a68','#df5f78','#ffb468'], sun:'#fff0c2', glow:'#ffae5c', sunX:.72, sunY:.74, sunR:.05, moon:0,
            mFar:'#8c4d7c', mNear:'#4c2b5a', trees:'#211431', fog:'#ffae96', fogA:.45, wTop:'#4f2d5c', wBot:'#120c24', shine:'#ffd49e',
            cloud:'#f7927f', cloudA:.7, fg:'#130b1b', stars:.12, fire:.7, birds:.35, light:.32, lantern:.75, glit:1, crick:.4 },
  night:  { label:'Noc',    sky:['#040716','#0a1534','#172a56','#27406f'], sun:'#f3f0de', glow:'#86a8ff', sunX:.24, sunY:.26, sunR:.03, moon:1,
            mFar:'#1a2848', mNear:'#101a34', trees:'#060b19', fog:'#34507f', fogA:.35, wTop:'#0f2141', wBot:'#02050d', shine:'#c2d6ff',
            cloud:'#2a3b68', cloudA:.45, fg:'#03050c', stars:1, fire:1, birds:0, light:.13, lantern:1, glit:.55, crick:1 }
};
const ORDER = ['dawn', 'day', 'sunset', 'night'];
function prep(t) { const o = {}; for (const k in t) { const v = t[k]; if (typeof v === 'string' && v[0] === '#') o[k] = hex(v); else if (Array.isArray(v)) o[k] = v.map(hex); else o[k] = v; } return o; }
const PREP = {}; for (const k in THEMES) PREP[k] = prep(THEMES[k]);
function mixTheme(a, b, t) {
  const o = {};
  for (const k in a) {
    const va = a[k], vb = b[k];
    if (typeof va === 'number') o[k] = lerp(va, vb, t);
    else if (Array.isArray(va) && Array.isArray(va[0])) o[k] = va.map((c, i) => mix(c, vb[i], t));
    else if (Array.isArray(va)) o[k] = mix(va, vb, t);
    else o[k] = t < .5 ? va : vb;
  }
  return o;
}
const C = {
  woodT:hex('#b07a45'), woodS:hex('#6e4524'), reed:hex('#56863a'), reed2:hex('#3d6a2c'), cat:hex('#6d3f1e'), pad:hex('#3f9150'), padH:hex('#7cc36a'),
  flower:hex('#ffb8d2'), yellow:hex('#ffd54a'), jacket:hex('#2f607f'), hat:hex('#caa04c'), skin:hex('#e3a67e'), beard:hex('#8d6a55'), pants:hex('#3a4254'),
  boot:hex('#2a1d16'), rod:hex('#71482a'), fish:hex('#cfdde6'), bucket:hex('#8aa2ad'), bobR:hex('#ec4330'), white:[255,255,255], metal:hex('#9aa1ab'), flame:hex('#ffd27a')
};

/* ---------- stan ---------- */
const cvs = $('#ss-scene'), ctx = cvs.getContext('2d');
const up = document.createElement('canvas'), uctx = up.getContext('2d');
let W = 0, H = 0, DPR = 1, HOR = 0, U = 1, narrow = false, quality = 'high';
let time = 0, last = performance.now() / 1000;
let themeKey = 'sunset', cur = PREP.sunset, from = cur, to = cur, trans = false, tStart = 0, tDur = 2.4;
const D = {}, world = {}, ripples = [], drops = [], fishes = [];
let nextFish = 2, nextBug = 1, nib = -10, nextNib = 7, nextBobRip = 0, shoot = null, nextShoot = 4;
let TIP = { x: 0, y: 0, a: 0 };
const bobber = { x: 0, y: 0, scale: 1, inAir: false, top: { x: 0, y: 0 } };
const cast = { active: false, t: 0, rel: null, landed: false, loading: false, target: null };
let hideSceneAt = Infinity;

const glow = document.createElement('canvas'); glow.width = glow.height = 64;
{ const g = glow.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(.12, 'rgba(255,240,150,.9)'); gr.addColorStop(.35, 'rgba(210,255,120,.28)'); gr.addColorStop(1, 'rgba(180,255,100,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }

const persp = y => clamp((y - HOR) / (H - HOR), 0, 1);
const bobScale = y => .35 + persp(y) * 1.05;

/* ---------- świat ---------- */
function resize() {
  DPR = quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(1, window.innerWidth); H = Math.max(1, window.innerHeight);
  HOR = Math.round(H * .56);
  cvs.width = Math.round(W * DPR); cvs.height = Math.round(H * DPR);
  up.width = Math.round(W * DPR); up.height = Math.max(1, Math.round(HOR * DPR));
  genWorld();
}
function ridge(r, base, amp, f0, env) {
  const comps = []; let n = 0;
  for (let i = 0; i < 5; i++) { const c = { f: f0 * Math.pow(2.07, i) * (.85 + r() * .3), p: r() * TAU, a: Math.pow(.5, i) }; n += c.a; comps.push(c); }
  const pts = [], step = Math.max(3, W / 400);
  for (let x = -step; x <= W + step; x += step) {
    let v = 0; for (const c of comps) v += Math.sin(x * c.f + c.p) * c.a;
    v = clamp(v / n * .8 + .5, 0, 1);
    pts.push(x, HOR - (base + v * amp) * env(x / W));
  }
  return pts;
}
function addTrees(r, arr, scale, densBase) {
  let x = -12;
  while (x < W + 12) {
    const d = x / W, edge = Math.pow(Math.min(1, Math.abs(d - .6) * 2.3), 1.3), dens = densBase + (1 - densBase) * edge;
    const h = H * scale * (.5 + dens * .7) * (.6 + r() * .6), w = h * (.3 + r() * .14);
    if (r() < .2 + dens * .8) arr.push({ x, h, w });
    x += w * (.4 + (1 - dens) * 1.9) + r() * 3;
  }
}
function mkReed(r, x, h, bend) { const blade = r() < .4; return { x, h, bend: bend * h, w: (1.4 + r() * 2.2) * Math.max(U, .7), ph: r() * TAU, cat: !blade && r() < .4, blade, depth: r() }; }

function genWorld() {
  const r = seeded(20260927);
  narrow = W < 820;
  U = Math.min(H / 800, W / (narrow ? 520 : 1000));
  world.far = ridge(r, H * .025, H * .15, 6 / W, x => .45 + .55 * Math.min(1, Math.abs(x - .66) * 2.4));
  world.near = ridge(r, H * .008, H * .06, 12 / W, x => .55 + .45 * Math.min(1, Math.abs(x - .55) * 2));
  world.treesBack = []; world.trees = [];
  addTrees(r, world.treesBack, .04, .4); addTrees(r, world.trees, .058, .12);

  world.stars = [];
  for (let i = 0; i < (narrow ? 120 : 210); i++) world.stars.push({ x: r() * W, y: Math.pow(r(), 1.5) * HOR * .92, s: .5 + r() * 1.4, sp: .8 + r() * 2.6, ph: r() * TAU });

  world.clouds = []; const cs = clamp(W / 1400, .6, 1.3);
  for (let i = 0; i < (narrow ? 5 : 8); i++) {
    const s = (.55 + r() * .85) * cs, n = 5 + (r() * 4 | 0);
    const cl = { x: r() * (W + 300) - 150, y: HOR * (.1 + r() * .42), s, v: 3 + r() * 7, a: .55 + r() * .45, w: 130 * s, blobs: [] };
    for (let k = 0; k < n; k++) { const t = k / (n - 1) - .5; cl.blobs.push({ dx: t * 120 * s + (r() - .5) * 16 * s, dy: -(1 - Math.abs(t) * 1.7) * 16 * s * (.5 + r() * .5) - 2 * s, r: (12 + (1 - Math.abs(t) * 1.5) * 20 + r() * 7) * s }); }
    world.clouds.push(cl);
  }
  world.birds = [];
  for (let i = 0; i < 6; i++) world.birds.push({ x: r() * W, y: HOR * (.2 + r() * .32), s: (4 + r() * 3) * Math.max(U, .6), v: (18 + r() * 22) * Math.max(U, .6), ph: r() * TAU, fl: 7 + r() * 3 });

  world.shimmer = []; const ns = quality === 'high' ? (narrow ? 110 : 180) : 80;
  for (let i = 0; i < ns; i++) world.shimmer.push({ x: r() * W, y: HOR + 3 + (H - HOR) * Math.pow(r(), 1.7), len: 10 + r() * 34, sp: .6 + r() * 1.6, ph: r() * TAU });
  world.glitter = []; const ng = quality === 'high' ? 130 : 60;
  for (let i = 0; i < ng; i++) world.glitter.push({ gx: (r() + r() + r() - 1.5) / 1.5, y: HOR + 2 + (H - HOR) * Math.pow(r(), 1.35), sp: 2 + r() * 4, ph: r() * TAU, len: .5 + r() });

  world.reeds = [];
  for (let i = 0; i < (narrow ? 24 : 40); i++) { const bx = -24 + r() * (W * (narrow ? .2 : .15) + 24), f = 1 - clamp(bx / (W * .18), 0, 1) * .45; world.reeds.push(mkReed(r, bx, H * (.1 + r() * .2) * f, r() * .55 - .12)); }
  for (let i = 0; i < (narrow ? 8 : 16); i++) { const bx = W * (narrow ? .9 : .93) + r() * (W * .1 + 20); world.reeds.push(mkReed(r, bx, H * (.07 + r() * .13), -r() * .4)); }
  world.reeds.sort((a, b) => a.depth - b.depth);

  world.pads = [];
  for (let i = 0; i < (narrow ? 4 : 6); i++) { const y = H * (.86 + r() * .1), x = W * (narrow ? .04 + r() * .42 : .12 + r() * .28); world.pads.push({ x, y, r: (16 + r() * 14) * (.5 + persp(y) * .7) * Math.max(U, .7), n: r() * TAU, ph: r() * TAU, flower: i % 3 === 0 }); }

  const P = world.pier = { x: W * (narrow ? .52 : .6), y: H * .8, top: 7 * U, side: 14 * U, post: 46 * U, postW: 9 * U };
  P.water = P.y + P.side + P.post;
  const F = world.fisher = { x: P.x + 32 * U }; F.seat = P.y - P.top; F.hand = { x: F.x - 21 * U, y: F.seat - 19 * U }; F.rodL = 240 * U;
  const a0 = -Math.PI + .62;
  world.bobRest = { x: F.hand.x + Math.cos(a0) * F.rodL - 14 * U, y: H * .745 };
  world.lantern = { x: P.x + 6 * U, y: F.seat - 78 * U };

  world.flies = [];
  for (let i = 0; i < (narrow ? 20 : 34); i++) world.flies.push({ x: r() * W, y: HOR - H * .03 + r() * (H - HOR + H * .02), sp: .15 + r() * .35, bs: 1 + r() * 2.2, ph: r() * TAU });
}

/* ---------- logika sceny ---------- */
function addRipple(x, y, max, life = 1.8, str = 1, delay = 0) { ripples.push({ x, y, max, life, str, age: -delay }); if (ripples.length > 70) ripples.shift(); }
function splashAt(x, y, s, n, pw) {
  for (let i = 0; i < n; i++) drops.push({ x: x + rand(-3, 3) * s, y, vx: rand(-55, 55) * s * pw, vy: -rand(70, 180) * s * pw, g: 520 * s, age: 0, life: rand(.35, .6), r: rand(.7, 1.7) * s });
  if (drops.length > 260) drops.splice(0, drops.length - 260);
}
function spawnFish() {
  const P = world.pier; let x = 0, y = 0, ok = false;
  for (let i = 0; i < 8 && !ok; i++) {
    y = HOR + (H - HOR) * (.05 + Math.pow(Math.random(), 1.4) * .55); x = rand(W * .04, W * .96);
    ok = !(x > P.x - 70 * U && y > P.y - 70 * U) && Math.hypot(x - world.bobRest.x, y - world.bobRest.y) > 40 * U;
  }
  if (!ok) return;
  const s = (.3 + persp(y) * 1.1) * Math.max(U, .6);
  fishes.push({ x, y, t: 0, dur: rand(.75, 1.05), dir: Math.random() < .5 ? -1 : 1, len: rand(38, 64) * s, h: rand(32, 56) * s, s });
  splashAt(x, y, s, 8, .7); addRipple(x, y, 24 * U, 1.6, .9);
}
function rodAngle() {
  const base = -Math.PI + .62 + Math.sin(time * .8) * .012;
  if (!cast.active) return base;
  const t = cast.t;
  if (t < .5) return base + 1.05 * easeInOut(t / .5);
  if (t < .7) return base + 1.05 - 1.45 * easeOut((t - .5) / .2);
  if (t < 1.4) return base - .4 + .4 * easeInOut((t - .7) / .7);
  return base;
}
function rodTip() { const a = rodAngle(), h = world.fisher.hand, L = world.fisher.rodL; return { x: h.x + Math.cos(a) * L, y: h.y + Math.sin(a) * L, a }; }

function updateBobber() {
  const rb = world.bobRest, u = U;
  if (!cast.active) {
    let dip = 0; const dn = time - nib;
    if (dn >= 0 && dn < .9) dip = Math.abs(Math.sin(dn / .45 * Math.PI)) * 5 * u * bobScale(rb.y);
    bobber.x = rb.x; bobber.y = rb.y + Math.sin(time * 2.1) * .8 * u + dip; bobber.scale = bobScale(rb.y); bobber.inAir = false;
    if (time > nextNib) { nib = time; nextNib = time + rand(6, 12); addRipple(rb.x, rb.y, 20 * u, 1.5, 1); addRipple(rb.x, rb.y, 12 * u, 1.2, .8, .3); Sound.nibble(); }
    if (time > nextBobRip) { addRipple(rb.x, rb.y, 11 * u, 2.2, .5); nextBobRip = time + rand(1.6, 2.6); }
    return;
  }
  const t = cast.t, hang = { x: TIP.x, y: TIP.y + 16 * u }, s0 = bobScale(rb.y);
  if (t < .5) { const k = easeInOut(t / .5); bobber.x = lerp(rb.x, hang.x, k); bobber.y = lerp(rb.y, hang.y, k); bobber.inAir = k > .08; bobber.scale = s0; }
  else if (t < .7) { bobber.x = hang.x; bobber.y = hang.y; bobber.inAir = true; bobber.scale = s0; }
  else {
    if (!cast.rel) { cast.rel = { x: hang.x, y: hang.y }; Sound.whoosh(); }
    const tg = cast.target, k = clamp((t - .7) / 1.1, 0, 1);
    bobber.x = lerp(cast.rel.x, tg.x, easeOut(k) * .15 + k * .85);
    bobber.y = lerp(cast.rel.y, tg.y, k) - Math.sin(k * Math.PI) * H * .2;
    bobber.scale = lerp(s0, bobScale(tg.y), k); bobber.inAir = k < 1;
    if (k >= 1) {
      if (!cast.landed) {
        cast.landed = true; const s = bobScale(tg.y) * u;
        splashAt(tg.x, tg.y, s * 1.3, 18, 1.1);
        addRipple(tg.x, tg.y, 40 * u, 2.4, 1.2); addRipple(tg.x, tg.y, 26 * u, 2, 1, .25); addRipple(tg.x, tg.y, 14 * u, 1.6, .8, .5);
        Sound.splash(1);
      }
      bobber.y = tg.y + Math.sin(time * 2.1) * .8 * u;
    }
  }
  if (t > 2.4 && !cast.loading) { cast.loading = true; showLoading(); }
}

function update(dt) {
  for (const cl of world.clouds) { cl.x += cl.v * dt; if (cl.x - cl.w > W + 40) cl.x = -cl.w - 40; }
  if (cur.birds > .02) for (const b of world.birds) { b.x += b.v * dt; if (b.x > W + 30) { b.x = -30; b.y = HOR * (.2 + Math.random() * .32); } }
  if (cur.stars > .5 && time > nextShoot) { const m = Math.max(U, .6); shoot = { x: rand(W * .25, W * .95), y: rand(HOR * .04, HOR * .3), vx: -rand(380, 560) * m, vy: rand(110, 190) * m, age: 0, life: .85 }; nextShoot = time + rand(5, 12); }
  if (shoot) { shoot.age += dt; shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt; if (shoot.age > shoot.life) shoot = null; }
  for (let i = ripples.length - 1; i >= 0; i--) { const r = ripples[i]; r.age += dt; if (r.age > r.life) ripples.splice(i, 1); }
  for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.age += dt; d.vy += d.g * dt; d.x += d.vx * dt; d.y += d.vy * dt; if (d.age > d.life) drops.splice(i, 1); }
  if (time > nextFish) { spawnFish(); nextFish = time + rand(2, 5); }
  for (let i = fishes.length - 1; i >= 0; i--) {
    const f = fishes[i]; f.t += dt;
    if (f.t >= f.dur) { const ex = f.x + f.dir * f.len; splashAt(ex, f.y, f.s, 9, .9); addRipple(ex, f.y, 30 * U, 1.8, 1); addRipple(ex, f.y, 18 * U, 1.4, .7, .2); Sound.fishSplash(persp(f.y)); fishes.splice(i, 1); }
  }
  if (time > nextBug) { addRipple(rand(0, W), rand(HOR + 6, H * .97), 16 * U, 1.8, .55); nextBug = time + rand(.5, 1.6); }
  if (cast.active) cast.t += dt;
  TIP = rodTip();
  updateBobber();
}
function derive() {
  const T = cur, L = T.light, f = T.fg;
  D.pierT = mix(f, C.woodT, L * .85 + .1); D.pierS = mix(f, C.woodS, L * .8 + .06);
  D.reed = mix(f, C.reed, L * .8 + .04); D.reed2 = mix(f, C.reed2, L * .55); D.cat = mix(f, C.cat, L * .8 + .05);
  D.pad = mix(f, C.pad, L * .8 + .1); D.padH = mix(f, C.padH, L * .85 + .12); D.flower = mix(f, C.flower, L * .75 + .2);
  D.jacket = mix(f, C.jacket, L * .7 + .06); D.hat = mix(f, C.hat, L * .75 + .1); D.skin = mix(f, C.skin, L * .7 + .1); D.beard = mix(f, C.beard, L * .7 + .08);
  D.pants = mix(f, C.pants, L * .6 + .04); D.boot = mix(f, C.boot, L * .6); D.rod = mix(f, C.rod, L * .7 + .1); D.fish = mix(f, C.fish, L * .7 + .25);
  D.bucket = mix(f, C.bucket, L * .7 + .08); D.bobR = mix(f, C.bobR, clamp(L + .5, 0, 1)); D.bobW = mix(f, C.white, clamp(L + .4, 0, 1));
}

/* ---------- rysowanie: niebo + góry (bufor do odbicia) ---------- */
function poly(c, pts) { c.beginPath(); c.moveTo(pts[0], HOR + 2); for (let i = 0; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.lineTo(pts[pts.length - 2], HOR + 2); c.closePath(); }
function pines(c, arr, base) {
  c.beginPath();
  for (const t of arr) {
    const top = base - t.h;
    for (let i = 0; i < 3; i++) { const ty = top + i * t.h * .22, by = ty + t.h * .42 + i * t.h * .04, hw = t.w * (.32 + i * .2); c.moveTo(t.x, ty); c.lineTo(t.x + hw, by); c.lineTo(t.x - hw, by); c.closePath(); }
    c.rect(t.x - t.w * .06, base - t.h * .25, t.w * .12, t.h * .25);
  }
  c.fill();
}
function cloudPath(c, cl, oy) {
  c.beginPath();
  for (const b of cl.blobs) { const x = cl.x + b.dx, y = cl.y + b.dy + oy; c.moveTo(x + b.r, y); c.arc(x, y, b.r, 0, TAU); }
  c.moveTo(cl.x + cl.w * .55, cl.y + oy + 3 * cl.s); c.ellipse(cl.x, cl.y + oy + 3 * cl.s, cl.w * .55, 11 * cl.s, 0, 0, TAU);
}
function drawUpper() {
  const c = uctx, T = cur;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  let g = c.createLinearGradient(0, 0, 0, HOR);
  g.addColorStop(0, rgba(T.sky[0])); g.addColorStop(.42, rgba(T.sky[1])); g.addColorStop(.78, rgba(T.sky[2])); g.addColorStop(1, rgba(T.sky[3]));
  c.fillStyle = g; c.fillRect(0, 0, W, HOR + 2);

  if (T.stars > .01) {
    c.fillStyle = '#fff';
    for (const s of world.stars) { const tw = .5 + .5 * Math.sin(time * s.sp + s.ph); c.globalAlpha = clamp(T.stars * (.25 + .75 * tw) * (1 - s.y / HOR * .7), 0, 1); c.beginPath(); c.arc(s.x, s.y, s.s * .6, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    if (shoot) {
      const k = 1 - shoot.age / shoot.life, tx = shoot.x - shoot.vx * .14, ty = shoot.y - shoot.vy * .14;
      const sg = c.createLinearGradient(shoot.x, shoot.y, tx, ty); sg.addColorStop(0, `rgba(255,255,255,${(.9 * k * T.stars).toFixed(3)})`); sg.addColorStop(1, 'rgba(255,255,255,0)');
      c.strokeStyle = sg; c.lineWidth = 1.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(shoot.x, shoot.y); c.lineTo(tx, ty); c.stroke();
    }
  }
  // słońce / księżyc
  const sx = W * T.sunX, sy = HOR * T.sunY, R = Math.min(W, H) * T.sunR;
  g = c.createRadialGradient(sx, sy, R * .4, sx, sy, Math.max(W, H) * .55);
  g.addColorStop(0, rgba(T.glow, .6)); g.addColorStop(.12, rgba(T.glow, .25)); g.addColorStop(.4, rgba(T.glow, .08)); g.addColorStop(1, rgba(T.glow, 0));
  c.fillStyle = g; c.fillRect(0, 0, W, HOR);
  g = c.createRadialGradient(sx, sy, R * .9, sx, sy, R * 2.4); g.addColorStop(0, rgba(T.sun, .5)); g.addColorStop(1, rgba(T.sun, 0));
  c.fillStyle = g; c.beginPath(); c.arc(sx, sy, R * 2.4, 0, TAU); c.fill();
  c.fillStyle = rgba(T.sun); c.beginPath(); c.arc(sx, sy, R, 0, TAU); c.fill();
  if (T.moon > .02) {
    c.fillStyle = rgba(mix(T.sun, T.sky[1], .35), T.moon * .35);
    for (const [dx, dy, rr] of [[-.3, -.2, .22], [.25, .1, .16], [-.05, .42, .12], [.3, -.38, .09]]) { c.beginPath(); c.arc(sx + dx * R, sy + dy * R, rr * R, 0, TAU); c.fill(); }
  }
  // chmury
  for (const cl of world.clouds) {
    const a = cl.a * T.cloudA;
    c.fillStyle = rgba(mix(T.cloud, T.sky[1], .5), a * .85); cloudPath(c, cl, 5 * cl.s); c.fill();
    c.fillStyle = rgba(T.cloud, a); cloudPath(c, cl, 0); c.fill();
  }
  // góry, las, mgła
  g = c.createLinearGradient(0, HOR - H * .2, 0, HOR); g.addColorStop(0, rgba(T.mFar)); g.addColorStop(1, rgba(mix(T.mFar, T.fog, .55)));
  c.fillStyle = g; poly(c, world.far); c.fill();
  g = c.createLinearGradient(0, HOR - H * .08, 0, HOR); g.addColorStop(0, rgba(T.mNear)); g.addColorStop(1, rgba(mix(T.mNear, T.fog, .3)));
  c.fillStyle = g; poly(c, world.near); c.fill();
  c.fillStyle = rgba(mix(T.mNear, T.trees, .55)); pines(c, world.treesBack, HOR + 1);
  c.fillStyle = rgba(T.trees); pines(c, world.trees, HOR + 1);
  g = c.createLinearGradient(0, HOR - H * .08, 0, HOR); g.addColorStop(0, rgba(T.fog, 0)); g.addColorStop(1, rgba(T.fog, T.fogA));
  c.fillStyle = g; c.fillRect(0, HOR - H * .08, W, H * .08 + 2);
  // ptaki
  if (T.birds > .02) {
    c.strokeStyle = rgba(mix(T.fg, T.sky[1], .25), T.birds * .85); c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath();
    for (const b of world.birds) {
      const f = Math.sin(time * b.fl + b.ph), y = b.y + Math.sin(time * .6 + b.ph) * 6, wy = -f * b.s * .7;
      c.moveTo(b.x - b.s, y + wy); c.quadraticCurveTo(b.x - b.s * .45, y - b.s * .35 + wy * .3, b.x, y);
      c.quadraticCurveTo(b.x + b.s * .45, y - b.s * .35 + wy * .3, b.x + b.s, y + wy);
    }
    c.stroke();
  }
}

/* ---------- rysowanie: pierwszy plan ---------- */
function drawFish(f) {
  const c = ctx, u = f.t / f.dur, x = f.x + f.dir * f.len * u, y = f.y - Math.sin(u * Math.PI) * f.h;
  const ang = Math.atan2(-Math.cos(u * Math.PI) * Math.PI * f.h, f.dir * f.len);
  const L = 16 * f.s, T = 5.2 * f.s, wag = Math.sin(time * 28) * T * .35;
  c.save(); c.translate(x, y); c.rotate(ang); if (f.dir < 0) c.scale(1, -1);
  c.fillStyle = rgba(D.fish);
  c.beginPath(); c.moveTo(L, 0); c.quadraticCurveTo(L * .25, -T * 1.7, -L * .62, -T * .15); c.lineTo(-L * .62, T * .15); c.quadraticCurveTo(L * .25, T * 1.7, L, 0); c.fill();
  c.beginPath(); c.moveTo(-L * .5, 0); c.lineTo(-L * 1.08, -T * 1.15 + wag); c.lineTo(-L * .9, wag * .5); c.lineTo(-L * 1.08, T * 1.15 + wag); c.closePath(); c.fill();
  c.strokeStyle = rgba(cur.shine, .55); c.lineWidth = Math.max(.6, f.s * .9);
  c.beginPath(); c.moveTo(L * .85, -T * .35); c.quadraticCurveTo(L * .2, -T * 1.35, -L * .45, -T * .3); c.stroke();
  c.restore();
}
function drawFlower(x, y, s) {
  const c = ctx, pc = D.flower, pw = mix(D.flower, C.white, .6);
  for (let k = 0; k < 7; k++) { const a = (k - 3) * .42; c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = rgba(k % 2 ? pc : pw); c.beginPath(); c.ellipse(0, -s * .55, s * .2, s * .55, 0, 0, TAU); c.fill(); c.restore(); }
  c.fillStyle = rgba(mix(cur.fg, C.yellow, cur.light * .8 + .2)); c.beginPath(); c.arc(x, y - s * .1, s * .16, 0, TAU); c.fill();
}
function drawPads() {
  const c = ctx;
  for (const p of world.pads) {
    const y = p.y + Math.sin(time * .9 + p.ph) * 1.2 * U, rx = p.r, ry = p.r * .38;
    c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(p.x + 1.5, y + 2, rx * 1.04, ry * 1.1, 0, 0, TAU); c.fill();
    c.fillStyle = rgba(D.pad); c.beginPath(); c.moveTo(p.x, y); c.ellipse(p.x, y, rx, ry, 0, p.n + .3, p.n - .3 + TAU); c.closePath(); c.fill();
    c.strokeStyle = rgba(D.padH, .55); c.lineWidth = 1; c.beginPath(); c.ellipse(p.x, y, rx * .96, ry * .9, 0, p.n + .35, p.n + TAU - .35); c.stroke();
    c.strokeStyle = rgba(D.padH, .25); c.beginPath();
    for (let k = 1; k < 6; k++) { const a = p.n + k / 6 * TAU; c.moveTo(p.x, y); c.lineTo(p.x + Math.cos(a) * rx * .85, y + Math.sin(a) * ry * .85); }
    c.stroke();
    if (p.flower) drawFlower(p.x + rx * .15, y - ry * .2, rx * .42);
  }
}
function drawReeds() {
  const c = ctx; c.lineCap = 'round';
  for (const rd of world.reeds) {
    const sway = Math.sin(time * 1.15 + rd.ph + rd.x * .008) * rd.h * .04 + Math.sin(time * 2.6 + rd.ph * 2) * rd.h * .008;
    const bx = rd.x, by = H + 8, tx = bx + rd.bend + sway, ty = by - rd.h, cx = bx + rd.bend * .3 + sway * .35, cy = by - rd.h * .55;
    const col = rd.depth < .5 ? D.reed2 : D.reed;
    if (rd.blade) {
      c.fillStyle = rgba(col); c.beginPath(); c.moveTo(bx - rd.w * 1.8, by);
      c.quadraticCurveTo(cx - rd.w * .8, cy, tx, ty); c.quadraticCurveTo(cx + rd.w * 1.4, cy, bx + rd.w * 1.8, by); c.closePath(); c.fill();
    } else {
      c.strokeStyle = rgba(col); c.lineWidth = rd.w; c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(cx, cy, tx, ty); c.stroke();
      if (rd.cat) {
        const u = .8, iu = 1 - u;
        const qx = iu * iu * bx + 2 * iu * u * cx + u * u * tx, qy = iu * iu * by + 2 * iu * u * cy + u * u * ty;
        const dx = 2 * iu * (cx - bx) + 2 * u * (tx - cx), dy = 2 * iu * (cy - by) + 2 * u * (ty - cy);
        c.save(); c.translate(qx, qy); c.rotate(Math.atan2(dy, dx)); c.fillStyle = rgba(D.cat);
        c.beginPath(); c.ellipse(0, 0, rd.h * .07, rd.w * 1.9, 0, 0, TAU); c.fill(); c.restore();
      }
    }
  }
}
function drawPier() {
  const c = ctx, P = world.pier, u = U, x0 = P.x, wl = P.water;
  for (let x = x0 + 5 * u; x < W + P.postW; x += 66 * u) {
    const wob = Math.sin(time * 1.7 + x * .05);
    const g = c.createLinearGradient(0, wl, 0, wl + P.post * 1.3); g.addColorStop(0, rgba(D.pierS, .5)); g.addColorStop(1, rgba(D.pierS, 0));
    c.fillStyle = g; c.fillRect(x + wob * 1.2, wl, P.postW, P.post * 1.3);
    c.fillStyle = rgba(D.pierS); c.fillRect(x, P.y, P.postW, P.side + P.post);
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x + P.postW * .62, P.y, P.postW * .38, P.side + P.post);
    c.strokeStyle = rgba(cur.shine, .28); c.lineWidth = 1; c.beginPath(); c.ellipse(x + P.postW / 2, wl, P.postW * (.9 + .15 * wob), P.postW * .28, 0, 0, TAU); c.stroke();
  }
  c.fillStyle = rgba(D.pierS); c.fillRect(x0, P.y, W - x0 + 10, P.side);
  c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(x0, P.y + P.side * .5, W - x0 + 10, Math.max(1, u));
  c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x0, P.y + P.side - 2 * u, W - x0 + 10, 2 * u);
  c.fillStyle = rgba(D.pierT); c.fillRect(x0 - 3 * u, P.y - P.top, W - x0 + 13, P.top);
  c.fillStyle = 'rgba(0,0,0,.3)'; for (let x = x0 + 15 * u; x < W; x += 15 * u) c.fillRect(x, P.y - P.top, Math.max(1, u * .8), P.top);
  c.fillStyle = rgba(cur.shine, .22 + cur.light * .2); c.fillRect(x0 - 3 * u, P.y - P.top, W - x0 + 13, Math.max(1, u * .8));
  // latarnia
  const L = world.lantern;
  c.fillStyle = rgba(D.pierS); c.fillRect(L.x - 2 * u, L.y, 4 * u, P.y - P.top - L.y); c.fillRect(L.x - 11 * u, L.y, 13 * u, 2.5 * u);
  const lx = L.x - 9 * u, ly = L.y + 2.5 * u;
  c.strokeStyle = rgba(D.pierS); c.lineWidth = 1.2 * u; c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx, ly + 3 * u); c.stroke();
  const fl = cur.lantern * (.88 + .12 * Math.sin(time * 11) * Math.sin(time * 6.3 + 1));
  c.fillStyle = rgba(mix(D.pierS, C.flame, clamp(fl * 1.1 + .1, 0, 1))); c.fillRect(lx - 4 * u, ly + 5 * u, 8 * u, 10 * u);
  c.fillStyle = rgba(mix(cur.fg, C.metal, cur.light * .6 + .1));
  c.beginPath(); c.moveTo(lx - 6 * u, ly + 5.5 * u); c.lineTo(lx, ly + 2.5 * u); c.lineTo(lx + 6 * u, ly + 5.5 * u); c.closePath(); c.fill();
  c.fillRect(lx - 5 * u, ly + 15 * u, 10 * u, 2 * u); c.fillRect(lx - .6 * u, ly + 5 * u, 1.2 * u, 10 * u);
  world.lanternGlow = { x: lx, y: ly + 10 * u, a: fl };
}
function drawFisher() {
  const c = ctx, u = U, F = world.fisher, P = world.pier, x = F.x, s = F.seat, br = Math.sin(time * 1.5) * .7 * u, h = F.hand;
  c.lineCap = 'round'; c.lineJoin = 'round';
  // wiadro
  const bx = x + 27 * u;
  c.fillStyle = rgba(D.bucket); c.beginPath(); c.moveTo(bx - 8 * u, s - 17 * u); c.lineTo(bx + 8 * u, s - 17 * u); c.lineTo(bx + 6 * u, s); c.lineTo(bx - 6 * u, s); c.closePath(); c.fill();
  c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(bx - 8 * u, s - 17 * u, 16 * u, 2.4 * u); c.fillRect(bx + 2 * u, s - 15 * u, 4 * u, 15 * u);
  c.strokeStyle = rgba(D.bucket); c.lineWidth = 1.3 * u; c.beginPath(); c.arc(bx, s - 17 * u, 7.5 * u, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  // nogi zwisające z pomostu
  for (let k = 1; k >= 0; k--) {
    const sw = Math.sin(time * 1.1 + k * 1.7) * 2.6 * u, kx = P.x - u + k * 4 * u, ky = s - 3.5 * u, fx = kx - 4 * u + sw, fy = s + 24 * u;
    c.strokeStyle = rgba(k ? mix(D.pants, cur.fg, .4) : D.pants); c.lineWidth = 8.5 * u;
    c.beginPath(); c.moveTo(x - 4 * u + k * 3 * u, s - 5 * u); c.lineTo(kx, ky); c.lineTo(fx, fy); c.stroke();
    c.fillStyle = rgba(D.boot); c.beginPath(); c.ellipse(fx - 3 * u, fy + 2.5 * u, 6.5 * u, 3.8 * u, 0, 0, TAU); c.fill();
  }
  // dalsza ręka
  c.strokeStyle = rgba(mix(D.jacket, cur.fg, .4)); c.lineWidth = 6 * u;
  c.beginPath(); c.moveTo(x + u, s - 28 * u + br); c.lineTo(x - 9 * u, s - 15 * u); c.lineTo(h.x + 3 * u, h.y + 2 * u); c.stroke();
  // tułów
  c.fillStyle = rgba(D.jacket); c.beginPath();
  c.moveTo(x - 13 * u, s); c.lineTo(x + 11 * u, s); c.quadraticCurveTo(x + 13 * u, s - 26 * u + br, x + 4 * u, s - 34 * u + br);
  c.lineTo(x - 6 * u, s - 34 * u + br); c.quadraticCurveTo(x - 15 * u, s - 21 * u + br, x - 13 * u, s); c.closePath(); c.fill();
  c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x - 12 * u, s - 9 * u, 23 * u, 2.2 * u);
  // głowa, broda, kapelusz
  const hx = x - 2 * u, hy = s - 41 * u + br;
  c.fillStyle = rgba(D.skin); c.beginPath(); c.arc(hx, hy, 7.3 * u, 0, TAU); c.fill();
  c.fillStyle = rgba(D.beard); c.beginPath(); c.ellipse(hx - 3.5 * u, hy + 3.8 * u, 5 * u, 4.2 * u, .3, 0, TAU); c.fill();
  c.fillStyle = rgba(D.hat); c.beginPath(); c.ellipse(hx, hy - 4.6 * u, 13.5 * u, 3.2 * u, -.05, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(hx - 8 * u, hy - 5.5 * u); c.quadraticCurveTo(hx - 8.5 * u, hy - 15 * u, hx, hy - 15 * u); c.quadraticCurveTo(hx + 8.5 * u, hy - 15 * u, hx + 8 * u, hy - 5.5 * u); c.closePath(); c.fill();
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(hx - 8.2 * u, hy - 8.6 * u, 16.4 * u, 2.4 * u);
  // wędka
  const a = TIP.a, ca = Math.cos(a), sa = Math.sin(a), L = F.rodL;
  const bt = { x: h.x - ca * 16 * u, y: h.y - sa * 16 * u }, md = { x: h.x + ca * L * .35, y: h.y + sa * L * .35 }, bend = L * .035;
  c.strokeStyle = rgba(D.rod); c.lineWidth = 3.2 * u; c.beginPath(); c.moveTo(bt.x, bt.y); c.lineTo(md.x, md.y); c.stroke();
  c.lineWidth = 1.5 * u; c.beginPath(); c.moveTo(md.x, md.y); c.quadraticCurveTo((md.x + TIP.x) / 2 + sa * bend, (md.y + TIP.y) / 2 - ca * bend, TIP.x, TIP.y); c.stroke();
  c.fillStyle = rgba(mix(cur.fg, C.metal, cur.light * .7 + .1)); c.beginPath(); c.arc(h.x + ca * 5 * u + sa * 4 * u, h.y + sa * 5 * u - ca * 4 * u, 3.4 * u, 0, TAU); c.fill();
  // bliższa ręka
  c.strokeStyle = rgba(D.jacket); c.lineWidth = 6.4 * u; c.beginPath(); c.moveTo(x - 5 * u, s - 28 * u + br); c.lineTo(x - 14 * u, s - 15 * u); c.lineTo(h.x, h.y); c.stroke();
  c.fillStyle = rgba(D.skin); c.beginPath(); c.arc(h.x, h.y, 3.3 * u, 0, TAU); c.fill();
}
function drawBobber() {
  const c = ctx, b = bobber, r = 5.5 * U * b.scale, x = b.x, y = b.y;
  if (!b.inAir) {
    c.fillStyle = rgba(D.bobW); c.beginPath(); c.arc(x, y, r, Math.PI, TAU); c.closePath(); c.fill();
    c.fillStyle = rgba(D.bobR); c.beginPath(); c.arc(x, y, r, Math.PI * 1.18, Math.PI * 1.82); c.closePath(); c.fill();
    c.strokeStyle = rgba(cur.shine, .5); c.lineWidth = 1; c.beginPath(); c.ellipse(x, y + .5, r * 1.6, r * .35, 0, 0, TAU); c.stroke();
  } else {
    c.fillStyle = rgba(D.bobW); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.fillStyle = rgba(D.bobR); c.beginPath(); c.arc(x, y, r, Math.PI, TAU); c.closePath(); c.fill();
  }
  c.strokeStyle = rgba(D.bobR); c.lineWidth = Math.max(1, r * .26); c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, y - r); c.lineTo(x, y - r * 2.2); c.stroke();
  b.top = { x, y: y - r * 2.2 };
  if (cur.lantern > .05) { const s = r * 7; c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = cur.lantern * .85; c.drawImage(glow, b.top.x - s / 2, b.top.y - s / 2, s, s); c.restore(); }
}
function drawLine() {
  const c = ctx, tp = bobber.top, dist = Math.hypot(tp.x - TIP.x, tp.y - TIP.y), sag = bobber.inAir ? dist * .04 : dist * .12;
  c.strokeStyle = rgba(cur.shine, .55); c.lineWidth = Math.max(.6, .75 * U);
  c.beginPath(); c.moveTo(TIP.x, TIP.y); c.quadraticCurveTo((TIP.x + tp.x) / 2, (TIP.y + tp.y) / 2 + sag, tp.x, tp.y); c.stroke();
}
function drawLanternGlow() {
  const g0 = world.lanternGlow; if (!g0 || g0.a < .02) return;
  const c = ctx, u = U; c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(g0.x, g0.y, 0, g0.x, g0.y, 130 * u);
  g.addColorStop(0, `rgba(255,205,120,${(.55 * g0.a).toFixed(3)})`); g.addColorStop(.25, `rgba(255,160,70,${(.18 * g0.a).toFixed(3)})`); g.addColorStop(1, 'rgba(255,140,60,0)');
  c.fillStyle = g; c.fillRect(g0.x - 130 * u, g0.y - 130 * u, 260 * u, 260 * u);
  const wl = world.pier.water, step = Math.max(2, 3 * u);
  for (let y = wl + 2; y < H; y += step) {
    const k = (y - wl) / (H - wl), a = g0.a * .32 * (1 - k) * (.5 + .5 * Math.sin(time * 2.3 + y * .7)); if (a < .01) continue;
    const w = (6 + k * 18) * u * (.6 + .4 * Math.sin(time * 3 + y * .3));
    c.fillStyle = `rgba(255,190,100,${a.toFixed(3)})`; c.fillRect(g0.x - w / 2 + Math.sin(time * 1.9 + y * .12) * 3 * u, y, w, 1.4 * u);
  }
  c.restore();
}
function drawMain() {
  const c = ctx, T = cur, WH = H - HOR;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.drawImage(up, 0, 0, W, HOR);
  // woda + odbicie
  let g = c.createLinearGradient(0, HOR, 0, H); g.addColorStop(0, rgba(T.wTop)); g.addColorStop(1, rgba(T.wBot));
  c.fillStyle = g; c.fillRect(0, HOR, W, WH);
  const S = quality === 'high' ? 2 : 4;
  for (let d = 0; d < WH; d += S) {
    const sy = HOR - d - S; if (sy < 0) break;
    const sh = Math.min(S * DPR, up.height - sy * DPR); if (sh <= 0) continue;
    const amp = .5 + d * .045, off = Math.sin(420 / (d + 10) - time * 1.7) * amp * .8 + Math.sin(d * .05 + time * 1.2) * amp;
    c.drawImage(up, 0, sy * DPR, up.width, sh, off - 14, HOR + d, W + 28, S + .5);
  }
  g = c.createLinearGradient(0, HOR, 0, H); g.addColorStop(0, rgba(T.wTop, .12)); g.addColorStop(.3, rgba(T.wTop, .42)); g.addColorStop(1, rgba(T.wBot, .86));
  c.fillStyle = g; c.fillRect(0, HOR, W, WH);
  g = c.createLinearGradient(0, HOR, 0, HOR + H * .06); g.addColorStop(0, rgba(T.fog, T.fogA * .6)); g.addColorStop(1, rgba(T.fog, 0));
  c.fillStyle = g; c.fillRect(0, HOR, W, H * .06);
  c.fillStyle = rgba(T.shine, .2); c.fillRect(0, HOR, W, 1);
  // ścieżka słońca, iskry, połysk
  const sx = W * T.sunX;
  c.save(); c.globalCompositeOperation = 'lighter';
  c.save(); c.translate(sx, HOR); c.scale(.2 + (1 - T.sunY) * .12, 1);
  g = c.createRadialGradient(0, 0, 0, 0, 0, WH); g.addColorStop(0, rgba(T.glow, .32 * T.glit)); g.addColorStop(.5, rgba(T.glow, .08 * T.glit)); g.addColorStop(1, rgba(T.glow, 0));
  c.fillStyle = g; c.fillRect(-WH, 0, WH * 2, WH); c.restore();
  c.lineCap = 'round';
  for (const gl of world.glitter) {
    const p = persp(gl.y), f = Math.pow(.5 + .5 * Math.sin(time * gl.sp + gl.ph), 6), a = f * T.glit * (1 - p * .45); if (a < .03) continue;
    const x = sx + gl.gx * (6 + p * W * .085) + Math.sin(time * .7 + gl.ph) * 3, len = (2 + p * 16) * gl.len;
    c.strokeStyle = rgba(T.shine, a); c.lineWidth = .7 + p * 1.8; c.beginPath(); c.moveTo(x - len / 2, gl.y); c.lineTo(x + len / 2, gl.y); c.stroke();
  }
  const shA = .12 + T.light * .12;
  for (const s of world.shimmer) {
    const p = persp(s.y), a = Math.pow(.5 + .5 * Math.sin(time * s.sp + s.ph), 3) * shA; if (a < .02) continue;
    const len = s.len * (.25 + p * 1.5), x = s.x + Math.sin(time * .25 + s.ph) * 12 * p;
    c.strokeStyle = rgba(T.shine, a); c.lineWidth = .5 + p * 1.4; c.beginPath(); c.moveTo(x - len / 2, s.y); c.lineTo(x + len / 2, s.y); c.stroke();
  }
  c.restore();
  // kręgi na wodzie
  for (const r of ripples) {
    if (r.age < 0) continue;
    const k = r.age / r.life, p = persp(r.y), sc = .22 + p * 1.2, rr = r.max * easeOut(k) * sc;
    c.strokeStyle = rgba(T.shine, (1 - k) * .42 * r.str); c.lineWidth = Math.max(.6, 1.3 * sc);
    c.beginPath(); c.ellipse(r.x, r.y, rr, rr * (.18 + .2 * p), 0, 0, TAU); c.stroke();
  }
  for (const f of fishes) drawFish(f);
  for (const d of drops) { c.fillStyle = rgba(T.shine, (1 - d.age / d.life) * .85); c.beginPath(); c.arc(d.x, d.y, d.r, 0, TAU); c.fill(); }
  drawPads();
  drawBobber();
  drawReeds();
  drawPier();
  drawFisher();
  drawLine();
  drawLanternGlow();
  // świetliki
  if (T.fire > .02) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const f of world.flies) {
      const x = f.x + Math.sin(time * f.sp + f.ph) * 40 * U + Math.sin(time * .31 + f.ph * 2) * 55 * U, y = f.y + Math.cos(time * f.sp * 1.3 + f.ph) * 18 * U;
      const b = Math.max(0, Math.sin(time * f.bs + f.ph * 3)), a = T.fire * b * b; if (a < .03) continue;
      const sz = (12 + persp(y) * 20) * Math.max(U, .7); c.globalAlpha = a; c.drawImage(glow, x - sz / 2, y - sz / 2, sz, sz);
    }
    c.restore();
  }
  // winieta + czytelność UI
  g = c.createRadialGradient(W * .5, H * .48, Math.min(W, H) * .35, W * .5, H * .48, Math.hypot(W, H) * .6);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(2,3,10,.55)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  if (!narrow) { g = c.createLinearGradient(0, 0, W * .5, 0); g.addColorStop(0, 'rgba(3,5,14,.34)'); g.addColorStop(1, 'rgba(3,5,14,0)'); c.fillStyle = g; c.fillRect(0, 0, W * .5, H); }
  else { g = c.createLinearGradient(0, 0, 0, H * .6); g.addColorStop(0, 'rgba(3,5,14,.3)'); g.addColorStop(1, 'rgba(3,5,14,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H * .6); }
}

function frame(ms) {
  if (dead) return;
  const now = ms / 1000, dt = Math.min(.05, Math.max(0, now - last)); last = now; time += dt;
  if (trans) { const p = clamp((time - tStart) / tDur, 0, 1); cur = mixTheme(from, to, easeInOut(p)); if (p >= 1) { trans = false; cur = to; } }
  derive(); update(dt);
  if (W > 1 && H > 1 && performance.now() < hideSceneAt) { drawUpper(); drawMain(); }
  requestAnimationFrame(frame);
}

/* ---------- dźwięk (generowany, bez plików) ---------- */
const CHORDS = [[110, 164.81, 196, 261.63], [87.31, 130.81, 174.61, 220], [98, 146.83, 196, 246.94], [82.41, 123.47, 164.81, 207.65]];
const SCALES = [[440, 523.25, 659.25, 783.99, 880], [349.23, 440, 523.25, 659.25, 698.46], [392, 493.88, 587.33, 783.99], [329.63, 415.3, 493.88, 659.25]];
const Sound = {
  ac: null, on: true, sfx: true, music: .6, nature: .8,
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    let ac; try { ac = new AC(); } catch (e) { return; }
    this.ac = ac; const t = ac.currentTime, sr = ac.sampleRate;
    const M = this.master = ac.createGain(); M.gain.setValueAtTime(0, t); M.gain.linearRampToValueAtTime(this.on ? .85 : 0, t + 2.5); M.connect(ac.destination);
    this.mus = ac.createGain(); this.mus.gain.value = this.music; this.mus.connect(M);
    this.nat = ac.createGain(); this.nat.gain.value = this.nature; this.nat.connect(M);
    this.fx = ac.createGain(); this.fx.gain.value = .9; this.fx.connect(M);
    const bb = ac.createBuffer(1, sr * 4, sr), bd = bb.getChannelData(0); let l = 0;
    for (let i = 0; i < bd.length; i++) { l = (l + .02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = l * 3.5; }
    const wb = ac.createBuffer(1, sr, sr), wd = wb.getChannelData(0); for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1; this.white = wb;
    // szum fal
    const src = ac.createBufferSource(); src.buffer = bb; src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = .3;
    const wg = ac.createGain(); wg.gain.value = .28;
    const o1 = ac.createOscillator(); o1.frequency.value = .17; const g1 = ac.createGain(); g1.gain.value = .16; o1.connect(g1); g1.connect(wg.gain);
    const o2 = ac.createOscillator(); o2.frequency.value = .06; const g2 = ac.createGain(); g2.gain.value = 170; o2.connect(g2); g2.connect(lp.frequency);
    src.connect(lp); lp.connect(wg); wg.connect(this.nat); src.start(); o1.start(); o2.start();
    // echo
    const dl = ac.createDelay(1); dl.delayTime.value = .42; const fb = ac.createGain(); fb.gain.value = .32;
    const df = ac.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 2000;
    dl.connect(df); df.connect(fb); fb.connect(dl); df.connect(this.mus); this.dl = dl;
    // pad
    const pf = ac.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 650; pf.Q.value = .5;
    const pg = ac.createGain(); pg.gain.value = .05; pf.connect(pg); pg.connect(this.mus);
    const o3 = ac.createOscillator(); o3.frequency.value = .09; const g3 = ac.createGain(); g3.gain.value = .015; o3.connect(g3); g3.connect(pg.gain); o3.start();
    this.pad = [];
    for (let v = 0; v < 4; v++) for (const det of [-6, 6]) {
      const o = ac.createOscillator(); o.type = v === 0 ? 'sine' : 'triangle'; o.frequency.value = CHORDS[0][v]; o.detune.value = det;
      const g = ac.createGain(); g.gain.value = v === 0 ? .55 : .26; o.connect(g); g.connect(pf); o.start(); this.pad.push({ o, v });
    }
    this.ci = 0; this.pi = 2;
    timers.push(setInterval(() => this.nextChord(), 8000));
    timers.push(setInterval(() => this.ambient(), 250));
    document.addEventListener('visibilitychange', () => { if (this.ac && !dead) document.hidden ? this.ac.suspend() : this.ac.resume(); }, { signal });
  },
  ok() { return this.ac && this.on && this.sfx; },
  live() { return this.ac && this.on && !document.hidden; },
  nextChord() { if (!this.ac) return; this.ci = (this.ci + 1) % 4; const t = this.ac.currentTime; for (const p of this.pad) p.o.frequency.setTargetAtTime(CHORDS[this.ci][p.v], t, .8); },
  ambient() {
    if (!this.live()) return;
    if (Math.random() < .085) this.pluck();
    if (cur.birds > .1 && Math.random() < .03 * cur.birds) this.bird();
    if (cur.crick > .1 && Math.random() < .16 * cur.crick) this.cricket();
  },
  pluck() {
    const ac = this.ac, t = ac.currentTime, sc = SCALES[this.ci];
    this.pi = clamp(this.pi + (Math.random() < .5 ? -1 : 1) * (Math.random() < .3 ? 2 : 1), 0, sc.length - 1);
    const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = sc[this.pi];
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1600;
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.045, t + .008); g.gain.exponentialRampToValueAtTime(.0004, t + 1.8);
    o.connect(f); f.connect(g); g.connect(this.mus); g.connect(this.dl); o.start(t); o.stop(t + 1.9);
  },
  pan() { const ac = this.ac; if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.random() * 1.6 - .8; p.connect(this.nat); return p; } return this.nat; },
  bird() {
    const ac = this.ac, t0 = ac.currentTime + .02, out = this.pan(), n = 2 + (Math.random() * 3 | 0), base = 2300 + Math.random() * 1500;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (.12 + Math.random() * .08), o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * 1.45, t + .045); o.frequency.exponentialRampToValueAtTime(base * 1.05, t + .1);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.03, t + .012); g.gain.exponentialRampToValueAtTime(.0005, t + .11);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + .13);
    }
  },
  cricket() {
    const ac = this.ac, t0 = ac.currentTime + .02, out = this.pan(), n = 3 + (Math.random() * 3 | 0);
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = 4200 + Math.random() * 700;
    const g = ac.createGain(); g.gain.setValueAtTime(0, t0);
    for (let i = 0; i < n; i++) { const t = t0 + i * .055; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.01, t + .01); g.gain.linearRampToValueAtTime(0, t + .04); }
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + n * .055 + .05);
  },
  noise(dur, freq, q, vol, bus, sweepTo) {
    const ac = this.ac, t = ac.currentTime, s = ac.createBufferSource(); s.buffer = this.white;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur * .8); f.Q.value = q;
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + .05);
  },
  blip(f0, f1, dur, vol, type, bus) {
    const ac = this.ac, t = ac.currentTime, o = ac.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * .8);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + .02);
  },
  tick() { if (this.ok()) this.blip(900, 1500, .08, .05, 'triangle', this.fx); },
  plop(v = 1) { if (this.ok()) this.blip(640, 150, .22, .22 * v, 'sine', this.fx); },
  splash(v = 1) { if (!this.ok()) return; this.noise(.6, 1300, .7, .4 * v, this.fx); this.blip(380, 90, .3, .25 * v, 'sine', this.fx); },
  whoosh() { if (this.ok()) this.noise(.45, 450, 1.4, .22, this.fx, 2800); },
  reel() {
    if (!this.ok()) return; const ac = this.ac, t0 = ac.currentTime;
    for (let i = 0; i < 10; i++) { const t = t0 + i * .045, o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = 2100 + Math.random() * 300; g.gain.setValueAtTime(.018, t); g.gain.exponentialRampToValueAtTime(.0005, t + .018); o.connect(g); g.connect(this.fx); o.start(t); o.stop(t + .03); }
  },
  nibble() { if (this.live()) this.blip(900, 380, .1, .05, 'sine', this.nat); },
  fishSplash(p) { if (!this.live()) return; this.noise(.45, 1500, .8, .08 + .2 * p, this.nat); this.blip(420, 110, .2, .06 + .12 * p, 'sine', this.nat); },
  toggle() {
    this.on = !this.on;
    if (this.ac) { const g = this.master.gain, t = this.ac.currentTime; if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); } g.setTargetAtTime(this.on ? .85 : 0, t, .12); }
    syncSoundBtn();
  },
  setMusic(v) { this.music = v; if (this.ac) this.mus.gain.setTargetAtTime(v, this.ac.currentTime, .08); },
  setNature(v) { this.nature = v; if (this.ac) this.nat.gain.setTargetAtTime(v, this.ac.currentTime, .08); }
};

/* ---------- UI ---------- */
const fc = $('#ssFishCount'); if (fc) fc.textContent = `${opts.species.filter(f => f.caught).length} / ${opts.species.length}`;
const ui = $('#ss-ui'), buttons = $$('.menu .wood'), soundBtn = $('#soundBtn'), wrap = $('#panelWrap'), loadEl = $('#ss-loading');
let sel = -1, lastAct = 0, panelOpen = false, loadingDone = false;

function syncSoundBtn() { const on = Sound.on && !!Sound.ac; soundBtn.classList.toggle('muted', !on); soundBtn.setAttribute('aria-label', on ? 'Wycisz dźwięk' : 'Włącz dźwięk'); }
function syncSeg() {
  $$('#segTime button').forEach(b => b.classList.toggle('on', b.dataset.v === themeKey));
  $$('#segQ button').forEach(b => b.classList.toggle('on', b.dataset.v === quality));
}
function setTheme(k, instant) {
  if (!PREP[k]) return;
  themeKey = k; from = cur; to = PREP[k]; tStart = time; tDur = instant ? .0001 : 2.4; trans = true;
  $('#timeLabel').textContent = THEMES[k].label;
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = THEMES[k].sky[0];
  syncSeg();
}
const cycleTheme = () => setTheme(ORDER[(ORDER.indexOf(themeKey) + 1) % ORDER.length]);

function setSel(i, silent) {
  i = (i + buttons.length) % buttons.length; if (i === sel) return;
  sel = i; buttons.forEach((b, k) => b.classList.toggle('active', k === i));
  if (!silent) Sound.tick();
}
const busy = () => cast.active || panelOpen;
function act(a) {
  const n = performance.now(); if (n - lastAct < 300 || busy()) return; lastAct = n;
  if (!Sound.ac) { Sound.init(); syncSoundBtn(); }
  if (a === 'start') { Sound.plop(); startCast(); }
  else if (a === 'time') { Sound.plop(.7); cycleTheme(); }
  else { Sound.plop(.8); openPanel(a); }
}
buttons.forEach((b, i) => {
  b.addEventListener('pointerenter', () => { if (!busy()) setSel(i); }, { signal });
  b.addEventListener('click', () => { setSel(i, true); act(b.dataset.act); }, { signal });
});
setTimeout(() => { if (sel < 0) setSel(0, true); }, 1800);

/* zarzucenie wędki -> ładowanie */
function startCast() {
  if (cast.active) return;
  Object.assign(cast, { active: true, t: 0, rel: null, landed: false, loading: false, target: { x: W * (narrow ? .42 : .36), y: HOR + (H - HOR) * .2 } });
  ui.classList.add('away'); root.classList.add('casting');
  if (document.activeElement) document.activeElement.blur();
  Sound.reel();
  try { opts.onCastStart && opts.onCastStart(); } catch (err) { console.error(err); }
}
function resetCast() {
  Object.assign(cast, { active: false, t: 0, rel: null, landed: false, loading: false });
  ui.classList.remove('away'); root.classList.remove('casting');
}
const STEPS = [[0, 'Zarzucanie przynęty…'], [.3, 'Rozplątywanie żyłki…'], [.58, 'Budzenie ryb…'], [.82, 'Liczenie kaczek…']];
const TIPS = [
  'Wskazówka: karasie trzymają się płycizny przy trzcinach.',
  'Wskazówka: leszcze i karpie żerują głęboko – rzucaj dalej, na środek jeziora.',
  'Wskazówka: okonie lubią pomost. Zacznij tuż przy deskach.',
  'Wskazówka: gdy spławik tylko drży – jeszcze nie zacinaj!',
  'Wskazówka: leszcz unosi spławik i kładzie go płasko. To jest branie.',
  'Wskazówka: duży karp zerwie żyłkę, jeśli dokręcisz hamulec. Męcz go.',
  'Wskazówka: prowadź wędkę w bok, przeciwnie do ucieczki ryby.'
];
function showLoading() {
  loadEl.classList.add('show'); loadEl.classList.remove('done'); loadingDone = false;
  hideSceneAt = performance.now() + 1200;
  $('#loadTip').textContent = TIPS[Math.random() * TIPS.length | 0];
  const fill = $('#loadFill'), lb = $('#loadBob'), txt = $('#loadText'), t0 = performance.now(), dur = 2600; let lastStep = -1;
  (function step() {
    if (!loadEl.classList.contains('show')) return;
    const k = clamp((performance.now() - t0) / dur, 0, 1), p = easeInOut(k);
    fill.style.width = (p * 100) + '%'; lb.style.left = (p * 100) + '%';
    let si = 0; for (let i = 0; i < STEPS.length; i++) if (p >= STEPS[i][0]) si = i;
    if (si !== lastStep) { lastStep = si; txt.textContent = STEPS[si][1]; }
    if (k < 1) requestAnimationFrame(step);
    else {
      txt.textContent = 'Łowisko gotowe!'; Sound.plop(.8);
      try { opts.onStart && opts.onStart(); } catch (err) { console.error(err); }
    }
  })();
}
function backToMenu() {
  loadEl.classList.remove('show', 'done'); loadingDone = false; hideSceneAt = Infinity;
  resetCast(); Sound.tick();
  if (document.activeElement) document.activeElement.blur();
}
$('#backBtn').addEventListener('click', backToMenu, { signal });

/* panele */
const FISH = opts.species;
function fishSVG(f) {
  const dorsal = f.spiky ? 'M30 11L34-1L38 9L42-3L46 8L50-2L54 8L58 1L62 10Z' : 'M34 11Q46-2 62 9Z';
  const wh = f.whisk ? '<path d="M95 27Q106 32 112 44M93 29Q99 40 100 50" fill="none" stroke="#0b1628" stroke-width="2.5" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' : '';
  return `<svg viewBox="-45 -25 190 100" aria-hidden="true"><g transform="translate(50 25) scale(${f.sx} ${f.sy}) translate(-50 -25)" fill="#0b1628" stroke="rgba(255,244,220,.16)" stroke-width="1.5" vector-effect="non-scaling-stroke">`
    + `<path d="M12 25L-8 8Q-2 25-8 42Z"/><path d="${dorsal}"/><path d="M46 38Q54 50 62 38Z"/>`
    + `<path d="M4 25C18 6 58 2 82 16C90 20 95 23 96 25C95 27 90 30 82 34C58 48 18 44 4 25Z"/>${wh}</g></svg>`;
}
function renderFish() {
  $('#fishGrid').innerHTML = FISH.map((f, i) =>
    `<div class="fish-card${f.caught ? ' caught' : ''}" style="--i:${i}"><div class="fimg">${fishSVG(f)}${f.caught ? '' : '<span class="q">?</span>'}</div><h3>${f.name}</h3><div class="lat">${f.lat}</div><span class="rar" style="color:${f.rc}">${f.caught ? f.record : f.rar}</span></div>`).join('');
  const n = FISH.filter(f => f.caught).length;
  const pr = $('.progress-row span:last-child'); if (pr) pr.textContent = `${n} / ${FISH.length}`;
  const pb = $('.pbar i'); if (pb) pb.style.width = `${Math.max(3, n / FISH.length * 100)}%`;
}
function openPanel(which) {
  panelOpen = true;
  $('#panelTitle').textContent = which === 'collection' ? 'Kolekcja ryb' : 'Opcje';
  $$('.view').forEach(v => v.classList.toggle('on', v.dataset.view === which));
  if (which === 'collection') renderFish();
  syncSeg(); wrap.classList.add('open');
  setTimeout(() => $('#closeBtn').focus({ preventScroll: true }), 60);
}
function closePanel() { if (!panelOpen) return; panelOpen = false; wrap.classList.remove('open'); Sound.tick(); if (document.activeElement) document.activeElement.blur(); }
$('#closeBtn').addEventListener('click', closePanel, { signal });
wrap.addEventListener('pointerdown', e => { if (e.target === wrap) closePanel(); }, { signal });

function bindRange(el, fn) { const out = el.nextElementSibling; el.addEventListener('input', () => { el.style.setProperty('--p', el.value + '%'); out.textContent = el.value; fn(el.value / 100); }, { signal }); }
bindRange($('#optMusic'), v => Sound.setMusic(v));
bindRange($('#optNature'), v => { Sound.setNature(v); opts.onOptions && opts.onOptions({ nature: v }); });
$('#optSfx').addEventListener('change', e => { Sound.sfx = e.target.checked; Sound.tick(); opts.onOptions && opts.onOptions({ sfx: e.target.checked }); }, { signal });
$$('#segTime button').forEach(b => b.addEventListener('click', () => { setTheme(b.dataset.v); Sound.tick(); }, { signal }));
$$('#segQ button').forEach(b => b.addEventListener('click', () => { if (quality === b.dataset.v) return; quality = b.dataset.v; syncSeg(); resize(); Sound.tick(); opts.onOptions && opts.onOptions({ quality }); }, { signal }));

/* dźwięk + klawiatura */
soundBtn.addEventListener('click', () => { if (!Sound.ac) { Sound.on = true; Sound.init(); syncSoundBtn(); } else Sound.toggle(); }, { signal });
addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('#soundBtn')) return; if (!Sound.ac) { Sound.init(); syncSoundBtn(); } }, { passive: true, signal });
addEventListener('keydown', e => {
  const k = e.key, fresh = !Sound.ac;
  if (fresh) { Sound.init(); syncSoundBtn(); }
  if (loadingDone && (k === 'Enter' || k === 'Escape' || k === ' ')) { e.preventDefault(); backToMenu(); return; }
  if (panelOpen) { if (k === 'Escape') closePanel(); return; }
  if (cast.active) return;
  if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); setSel(sel + 1); }
  else if (k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); setSel(sel < 0 ? 0 : sel - 1); }
  else if (k === 'Enter' || k === ' ') { e.preventDefault(); act(buttons[Math.max(0, sel)].dataset.act); }
  else if ((k === 'm' || k === 'M') && !fresh) Sound.toggle();
  else if (k === 't' || k === 'T') cycleTheme();
}, { signal });
addEventListener('resize', resize, { signal });

/* start */
resize(); syncSeg(); syncSoundBtn();
requestAnimationFrame(frame);

return {
  root,
  /** Zanikanie i sprzątanie (pętla, dźwięk, nasłuchy). */
  destroy() {
    root.classList.add('gone');
    setTimeout(() => {
      dead = true; ctrl.abort(); timers.forEach(clearInterval); logo.destroy();
      try { if (Sound.ac) Sound.ac.close(); } catch (e) { /* ignore */ }
      root.remove();
    }, 850);
  },
};
}
