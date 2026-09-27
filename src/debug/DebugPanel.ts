import type GUI from 'lil-gui';
import { CFG } from '../config';

type Obj = Record<string, unknown>;

/**
 * Panel lil-gui z KAŻDYM parametrem z config.ts (edycja na żywo). Biblioteka ładuje się dopiero przy pierwszym
 * otwarciu (F1) – nie obciąża startu gry.
 */
export class DebugPanel {
  gui: GUI | null = null;
  visible = false;
  private loading = false;

  constructor(private onChange: (path: string) => void) {}

  private build(GUIClass: typeof GUI): GUI {
    const gui = new GUIClass({ title: 'Zarzuć – config.ts' });
    gui.domElement.style.zIndex = '20';
    const add = (folder: GUI, obj: Obj, path: string) => {
      for (const [k, v] of Object.entries(obj)) {
        const p = path ? `${path}.${k}` : k;
        if (typeof v === 'number') {
          const isColor = /color|Color|hemiSky|hemiGround/.test(k) && Number.isInteger(v) && v > 0xff;
          if (isColor) folder.addColor(obj, k).onChange(() => this.onChange(p));
          else {
            const mag = Math.abs(v);
            const max = mag === 0 ? 1 : mag * 4;
            const min = v < 0 ? -max : 0;
            const step = mag >= 10 ? 0.1 : mag >= 1 ? 0.01 : 0.0001;
            folder.add(obj, k, min, max, step).onChange(() => this.onChange(p));
          }
        } else if (typeof v === 'boolean') {
          folder.add(obj, k).onChange(() => this.onChange(p));
        } else if (typeof v === 'string') {
          folder.add(obj, k).onChange(() => this.onChange(p));
        } else if (Array.isArray(v)) {
          const f = folder.addFolder(k);
          v.forEach((item, i) => {
            if (item && typeof item === 'object') {
              const name = (item as Obj).name ?? (item as Obj).id ?? String(i);
              const sub = f.addFolder(String(name));
              add(sub, item as Obj, `${p}.${i}`);
              sub.close();
            }
          });
          f.close();
        } else if (v && typeof v === 'object') {
          const f = folder.addFolder(k);
          add(f, v as Obj, p);
          f.close();
        }
      }
    };
    add(gui, CFG as unknown as Obj, '');
    return gui;
  }

  toggle(v = !this.visible): void {
    this.visible = v;
    if (v && !this.gui && !this.loading) {
      this.loading = true;
      void import('lil-gui').then(({ default: GUIClass }) => {
        this.gui = this.build(GUIClass);
        this.gui.domElement.style.display = this.visible ? '' : 'none';
      });
    }
    if (this.gui) this.gui.domElement.style.display = v ? '' : 'none';
  }
}
