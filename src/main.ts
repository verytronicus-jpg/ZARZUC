import { Game } from './core/Game';
import { createDefaultRegistry } from './assets';
import { applyModelManifest } from './assets/manifest';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

async function boot(): Promise<void> {
  // modele proceduralne + ewentualne GLB z public/models/manifest.json (zapas: proceduralne)
  const assets = createDefaultRegistry();
  await applyModelManifest(assets);
  const game = new Game(canvas, ui, assets);
  game.start();
}

boot().catch((err) => {
  console.error(err);
  ui.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;color:#f4efe4;font-family:system-ui;background:#111">
    <div style="max-width:520px;text-align:center"><h2>Nie udało się uruchomić gry</h2>
    <p style="opacity:.75">Potrzebna jest przeglądarka z obsługą WebGL 2.</p><pre style="text-align:left;white-space:pre-wrap;opacity:.6;font-size:12px">${String(err)}</pre></div></div>`;
});
