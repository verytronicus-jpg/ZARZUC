import './styles.css';
import { CFG, speciesById, type SpeciesId } from '../config';
import { fmt, fmtWeight } from '../core/math';
import type { Caption } from '../cutscene/Timeline';
import type { CatchLog } from '../fishing/CatchLog';
import type { Objective } from '../player/Preparation';
import type { MsgKind } from '../fishing/FishingController';

const WORM_SVG = `<svg viewBox="0 0 52 30"><path d="M4 20c6-12 12 4 18-6s12 6 18-4 8 2 8 2" fill="none" stroke="#d9707a" stroke-width="6" stroke-linecap="round"/><circle cx="47" cy="11" r="1.2" fill="#3a1c1c"/></svg>`;

/** Ilustracja gatunku (reference/02-postacie-i-obiekty/04–08 z wyciętym tłem → public/ui/fish). */
export function fishArtUrl(id: SpeciesId): string {
  return `ui/fish/${id}.webp`;
}

/** Zapis tekstu/stylu tylko przy zmianie – HUD aktualizowany co klatkę nie wymusza ciągłego przeliczania układu. */
function txt(e: HTMLElement, v: string): void {
  if (e.textContent !== v) e.textContent = v;
}
function css(e: HTMLElement, prop: 'width' | 'left' | 'top', v: string): void {
  if (e.style[prop] !== v) e.style[prop] = v;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}

interface FightView {
  species: string;
  tensionRatio: number;
  dragRatio: number;
  dragKgf: number;
  line: number;
  fatigue: number;
  slipping: boolean;
  rodSide: number;
  rodUp: number;
}

/** Nakładka HTML/CSS nad canvasem. */
export class UI {
  private fade: HTMLElement;
  private caption: HTMLElement;
  private skip: HTMLElement;
  private skipCircle: SVGCircleElement;
  private hud: HTMLElement;
  private objectives: HTMLElement;
  private objList: HTMLOListElement;
  private status: HTMLElement;
  private wormItem: HTMLElement;
  private dragVal: HTMLElement;
  private lineVal: HTMLElement;
  private hint: HTMLElement;
  private messages: HTMLElement;
  private crosshair: HTMLElement;
  private power: HTMLElement;
  private powerFill: HTMLElement;
  private powerRange: HTMLElement;
  private hold: HTMLElement;
  private holdFill: HTMLElement;
  private fight: HTMLElement;
  private fightEls: Record<string, HTMLElement> = {};
  private floatCam: HTMLElement;
  private floatMarker: HTMLElement;
  readonly pause: HTMLElement;
  readonly resumeBtn: HTMLButtonElement;
  readonly catchScreen: HTMLElement;
  private catchArt: HTMLImageElement;
  readonly releaseBtn: HTMLButtonElement;
  private catchInfo: HTMLElement;
  readonly logScreen: HTMLElement;
  private logBody: HTMLElement;
  readonly debugText: HTMLElement;
  private loading: HTMLElement;
  private lastObjKey = '';

  constructor(root: HTMLElement) {
    this.loading = el('div', { id: 'loading' }, 'Ładowanie…');

    // --- HUD ---
    this.hud = el('div', { id: 'hud' });
    this.objectives = el('div', { id: 'objectives', class: 'panel' }, '<h3>Przygotowanie</h3>');
    this.objList = el('ol');
    this.objectives.append(this.objList);
    this.status = el('div', { id: 'status', class: 'panel' });
    this.wormItem = el('div', { class: 'item worm off' }, `${WORM_SVG}<span>Przynęta: <b>brak</b></span>`);
    const dragItem = el('div', { class: 'item' }, 'Hamulec: <b>3,00 kgf</b>');
    const lineItem = el('div', { class: 'item' }, 'Żyłka: <b>0,7 m</b>');
    this.status.append(this.wormItem, el('div', { class: 'sep' }), dragItem, el('div', { class: 'sep' }), lineItem);
    this.dragVal = dragItem.querySelector('b')!;
    this.lineVal = lineItem.querySelector('b')!;
    this.hint = el('div', { id: 'hint', class: 'panel' });
    this.messages = el('div', { id: 'messages' });
    this.crosshair = el('div', { id: 'crosshair' });
    this.power = el(
      'div',
      { id: 'power', class: 'panel hidden' },
      '<div class="row"><span>Siła rzutu</span><span class="rng">~0 m</span></div><div class="bar"><div class="fill"></div><div class="mark"></div></div>',
    );
    this.powerFill = this.power.querySelector('.fill')!;
    this.powerRange = this.power.querySelector('.rng')!;
    this.hold = el('div', { id: 'hold', class: 'panel hidden' }, 'Nabijanie robaka…<div class="bar"><div class="fill"></div></div>');
    this.holdFill = this.hold.querySelector('.fill')!;
    this.fight = el(
      'div',
      { id: 'fight', class: 'panel hidden' },
      `<h4><span>Hol</span><span class="sp"></span></h4>
       <div class="lbl"><span>Napięcie żyłki</span><b class="tv">0 %</b></div>
       <div class="tbar"><div class="fill"></div><div class="tick" style="left:70%"></div><div class="tick" style="left:90%"></div><div class="drag"></div></div>
       <div class="lbl"><span>Siły ryby (szacunek)</span><b class="fv">100 %</b></div>
       <div class="sbar"><div class="fill"></div></div>
       <div class="row2"><div class="chip">Hamulec<b class="dv">3,00 kgf</b></div><div class="chip">Żyłka<b class="lv">0 m</b></div></div>
       <div class="rodpad"><span class="lab" style="left:6px;top:3px">wędka ↑</span><span class="lab" style="right:6px;bottom:3px">← → kąt</span><div class="dot"></div></div>
       <div class="lbl" style="justify-content:center;margin-top:8px"><span class="slip">▲ HAMULEC ODDAJE ŻYŁKĘ ▲</span></div>`,
    );
    for (const k of ['sp', 'tv', 'fv', 'dv', 'lv', 'slip']) this.fightEls[k] = this.fight.querySelector('.' + k)!;
    this.fightEls.tfill = this.fight.querySelector('.tbar .fill')!;
    this.fightEls.tdrag = this.fight.querySelector('.tbar .drag')!;
    this.fightEls.sfill = this.fight.querySelector('.sbar .fill')!;
    this.fightEls.dot = this.fight.querySelector('.rodpad .dot')!;
    this.floatCam = el('div', { id: 'floatcam', class: 'hidden' }, '<span>Spławik</span><b class="alert">BIERZE!</b>');
    this.floatMarker = el('div', { id: 'floatmarker', class: 'hidden' }, '<i></i><b>!</b>');
    this.hud.append(this.floatMarker, this.floatCam, this.objectives, this.status, this.hint, this.messages, this.crosshair, this.power, this.hold, this.fight);

    // --- intro ---
    this.caption = el('div', { id: 'caption' }, '<div class="t"></div><div class="s"></div>');
    this.skip = el(
      'div',
      { id: 'skip' },
      '<span>Przytrzymaj <kbd>Esc</kbd>, aby pominąć</span><svg viewBox="0 0 36 36"><circle class="bg" cx="18" cy="18" r="15"/><circle class="fg" cx="18" cy="18" r="15" stroke-dasharray="94.25" stroke-dashoffset="94.25"/></svg>',
    );
    this.skipCircle = this.skip.querySelector('.fg') as SVGCircleElement;

    // --- pauza ---
    this.pause = el(
      'div',
      { id: 'pause', class: 'screen interactive hidden' },
      `<div class="card"><h2>Pauza</h2><div class="sub">Jezioro poczeka.</div>
        <div class="menu"><button class="btn" id="btnResume">Wznów</button></div>
        <div id="controls">
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>ruch, <kbd>Shift</kbd> bieg</span>
          <span><kbd>E</kbd></span><span>wyciągnij rybę (gdy zmęczona i blisko)</span>
          <span><kbd>F</kbd> (przytrzymaj)</span><span>nabij robaka</span>
          <span><kbd>LPM</kbd> (przytrzymaj)</span><span>rzut (siła) / zwijanie</span>
          <span><kbd>PPM</kbd></span><span>zacięcie (lub szybkie szarpnięcie myszą w dół)</span>
          <span>Kółko</span><span>hamulec kołowrotka</span>
          <span>Mysz w holu</span><span>kąt wędki (bok / góra)</span>
          <span><kbd>Tab</kbd></span><span>dziennik połowów</span>
          <span><kbd>F1</kbd></span><span>debug</span>
        </div></div>`,
    );
    this.resumeBtn = this.pause.querySelector('#btnResume') as HTMLButtonElement;

    // --- złowienie ---
    this.catchScreen = el(
      'div',
      { id: 'catch', class: 'screen interactive hidden' },
      `<div class="card"><div class="fishart"><div class="drops"></div><img alt=""></div><div class="info"></div></div>`,
    );
    this.catchArt = this.catchScreen.querySelector('.fishart img')!;
    this.catchInfo = this.catchScreen.querySelector('.info')!;
    this.releaseBtn = el('button', { class: 'btn', id: 'btnRelease' }, 'Wypuść');

    // --- dziennik ---
    this.logScreen = el('div', { id: 'log', class: 'screen hidden' }, '<div class="card"><h2>Dziennik połowów</h2><div class="sub">[Tab] zamknij</div><div class="body"></div></div>');
    this.logBody = this.logScreen.querySelector('.body')!;

    this.debugText = el('div', { id: 'debugText', class: 'hidden' });
    this.fade = el('div', { id: 'fade' });

    root.append(this.hud, this.caption, this.skip, this.pause, this.catchScreen, this.logScreen, this.debugText, this.fade, this.loading);
  }

  hideLoading(): void {
    this.loading.style.opacity = '0';
    setTimeout(() => this.loading.remove(), 700);
  }

  setFade(a: number): void {
    this.fade.style.opacity = String(a);
  }

  setCaption(c: Caption | null, alpha: number): void {
    this.caption.style.opacity = c ? String(alpha) : '0';
    if (c) {
      (this.caption.querySelector('.t') as HTMLElement).textContent = c.text;
      (this.caption.querySelector('.s') as HTMLElement).textContent = c.sub ?? '';
    }
  }

  setSkip(visible: boolean, progress: number): void {
    this.skip.classList.toggle('on', visible);
    this.skipCircle.style.strokeDashoffset = String(94.25 * (1 - progress));
  }

  showHud(v: boolean): void {
    this.hud.classList.toggle('on', v);
  }

  // ---------------- HUD ----------------
  setObjectives(list: Objective[], visible: boolean): void {
    const cur = list.find((o) => !o.done);
    const key = list.map((o) => (o.done ? '1' : '0')).join('') + visible;
    this.objectives.style.opacity = visible ? '1' : '0';
    if (key === this.lastObjKey) return;
    this.lastObjKey = key;
    this.objList.innerHTML = '';
    for (const o of list) {
      const li = el('li', { class: o.done ? 'done' : o === cur ? 'current' : '' });
      li.textContent = o.text;
      this.objList.append(li);
    }
  }

  setStatus(baitOn: boolean, dragKgf: number, lineM: number, hasRod: boolean): void {
    this.wormItem.classList.toggle('off', !baitOn);
    txt(this.wormItem.querySelector('b') as HTMLElement, baitOn ? 'jest' : 'brak');
    txt(this.dragVal, `${fmt(dragKgf, 2)} kgf`);
    txt(this.lineVal, `${fmt(lineM, 1)} m`);
    this.status.style.opacity = hasRod ? '1' : '0.55';
  }

  setHint(html: string): void {
    if (this.hint.innerHTML !== html) this.hint.innerHTML = html;
  }

  message(text: string, kind: MsgKind = 'info', time = CFG.ui.messageTime): void {
    // bez duplikatów obok siebie
    const last = this.messages.lastElementChild as HTMLElement | null;
    if (last && last.textContent === text && !last.classList.contains('out')) return;
    const m = el('div', { class: `msg ${kind}` });
    m.textContent = text;
    this.messages.append(m);
    while (this.messages.children.length > 3) this.messages.firstElementChild?.remove();
    setTimeout(() => m.classList.add('out'), time * 1000);
    setTimeout(() => m.remove(), time * 1000 + 450);
  }

  setCrosshair(on: boolean): void {
    this.crosshair.classList.toggle('on', on);
  }

  setPower(visible: boolean, power: number, rangeText: string): void {
    this.power.classList.toggle('hidden', !visible);
    if (visible) {
      css(this.powerFill, 'width', `${(power * 100).toFixed(1)}%`);
      txt(this.powerRange, rangeText);
    }
  }

  setHold(progress: number | null): void {
    this.hold.classList.toggle('hidden', progress === null);
    if (progress !== null) css(this.holdFill, 'width', `${progress * 100}%`);
  }

  setFight(v: FightView | null): void {
    this.fight.classList.toggle('hidden', !v);
    if (!v) return;
    const E = this.fightEls;
    txt(E.sp, v.species);
    const r = Math.min(1.2, v.tensionRatio);
    css(E.tfill, 'width', `${Math.min(100, r * 100)}%`);
    const cls = 'fill' + (r > CFG.ui.tensionRed ? ' r' : r > CFG.ui.tensionYellow ? ' y' : '');
    if (E.tfill.className !== cls) E.tfill.className = cls;
    css(E.tdrag, 'left', `${Math.min(100, v.dragRatio * 100)}%`);
    txt(E.tv, `${Math.round(v.tensionRatio * 100)} %`);
    txt(E.fv, `${Math.round(v.fatigue * 100)} %`);
    css(E.sfill, 'width', `${v.fatigue * 100}%`);
    txt(E.dv, `${fmt(v.dragKgf, 2)} kgf`);
    txt(E.lv, `${fmt(v.line, 1)} m`);
    E.slip.classList.toggle('on', v.slipping);
    css(E.dot, 'left', `${50 + v.rodSide * 44}%`);
    css(E.dot, 'top', `${88 - v.rodUp * 76}%`);
  }

  private floatCamKey = '';

  setFloatCam(v: boolean): void {
    this.floatCam.classList.toggle('hidden', !v);
    if (v) {
      const r = this.floatCamRect();
      const key = `${r.x},${r.y},${r.w},${r.h}`;
      if (key !== this.floatCamKey) {
        this.floatCamKey = key;
        Object.assign(this.floatCam.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      }
    }
  }

  /** stan spławika: idle | nibble | bite | under – kolor ramki podglądu i znacznika */
  setFloatState(state: string): void {
    this.floatCam.dataset.state = state;
    this.floatMarker.dataset.state = state;
  }

  /** znacznik nad spławikiem w głównym widoku (null = ukryj) */
  private biteAlert: HTMLElement | null = null;

  /** Duży napis na środku ekranu w chwili brania (łatwo przegapić sam spławik). */
  setBiteAlert(text: string | null, kind: 'bite' | 'land' = 'bite'): void {
    if (!this.biteAlert) {
      this.biteAlert = el('div', { id: 'bitealert', class: 'hidden' });
      this.hud.append(this.biteAlert);
    }
    this.biteAlert.classList.toggle('hidden', text === null);
    this.biteAlert.classList.toggle('land', kind === 'land');
    if (text !== null) {
      const html = text.replace(/\[(.+?)\]/g, '<kbd>$1</kbd>');
      if (this.biteAlert.innerHTML !== html) this.biteAlert.innerHTML = html;
    }
  }

  setFloatMarker(x: number | null, y = 0): void {
    this.floatMarker.classList.toggle('hidden', x === null);
    if (x !== null) {
      css(this.floatMarker, 'left', `${x}px`);
      css(this.floatMarker, 'top', `${y}px`);
    }
  }

  /** prostokąt podglądu spławika w pikselach CSS (od lewego górnego rogu) */
  floatCamRect(): { x: number; y: number; w: number; h: number } {
    const w = Math.round(Math.min(320, window.innerWidth * 0.26));
    const h = Math.round(w * 0.62);
    return { x: 20, y: window.innerHeight - h - 20, w, h };
  }

  // ---------------- ekrany ----------------
  showPause(v: boolean): void {
    this.pause.classList.toggle('hidden', !v);
  }

  showCatch(info: { id: SpeciesId; species: string; lengthCm: number; weightG: number; record: boolean; fightTime: number } | null): void {
    this.catchScreen.classList.toggle('hidden', !info);
    if (!info) return;
    this.catchArt.src = fishArtUrl(info.id);
    this.catchArt.alt = info.species;
    // ryba „w dłoniach”: większa dla dużych okazów
    const sp = speciesById(info.id);
    const k = (info.lengthCm - sp.minCm) / Math.max(1, sp.maxCm - sp.minCm);
    this.catchArt.style.setProperty('--size', `${(0.82 + 0.18 * k).toFixed(3)}`);
    this.catchInfo.innerHTML = `
      ${info.record ? '<div class="record">NOWY REKORD!</div>' : ''}
      <div class="species">${info.species}</div>
      <div class="stats">
        <span>Długość</span><b>${fmt(info.lengthCm, 1)} cm</b>
        <span>Waga</span><b>${fmtWeight(info.weightG)}</b>
        <span>Czas holu</span><b>${fmt(info.fightTime, 0)} s</b>
      </div>
      <div class="actions"></div>`;
    this.catchInfo.querySelector('.actions')!.append(this.releaseBtn);
  }

  showLog(v: boolean, log: CatchLog | null): void {
    this.logScreen.classList.toggle('hidden', !v);
    if (!v || !log) return;
    const recs = CFG.species
      .map((sp) => {
        const r = log.records[sp.id];
        return `<div class="rec"><b>${sp.name}</b>${r ? `${fmt(r.lengthCm, 1)} cm<br>${fmtWeight(r.weightG)}` : '—'}</div>`;
      })
      .join('');
    const rows = log.entries
      .slice()
      .reverse()
      .slice(0, 60)
      .map((e) => `<tr><td>${new Date(e.date).toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</td><td>${speciesById(e.species).name}</td><td>${fmt(e.lengthCm, 1)} cm</td><td>${fmtWeight(e.weightG)}</td><td>${fmt(e.fightTime, 0)} s</td></tr>`)
      .join('');
    this.logBody.innerHTML = `
      <div style="font-size:12px;color:var(--ink-dim);letter-spacing:.15em;text-transform:uppercase">Rekordy</div>
      <div class="records">${recs}</div>
      <div style="font-size:12px;color:var(--ink-dim);letter-spacing:.15em;text-transform:uppercase">Połowy (${log.entries.length})</div>
      ${rows ? `<table><thead><tr><th>Kiedy</th><th>Gatunek</th><th>Długość</th><th>Waga</th><th>Hol</th></tr></thead><tbody>${rows}</tbody></table>` : '<p style="color:var(--ink-dim)">Jeszcze nic… Jezioro czeka.</p>'}
      ${log.storageOk ? '' : '<p style="color:var(--warn)">Zapis w przeglądarce niedostępny – dziennik tylko na tę sesję.</p>'}`;
  }

  get logVisible(): boolean {
    return !this.logScreen.classList.contains('hidden');
  }

  setDebug(text: string | null): void {
    this.debugText.classList.toggle('hidden', text === null);
    if (text !== null) this.debugText.textContent = text;
  }
}
