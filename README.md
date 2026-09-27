# Zarzuć 🎣

**Spokojne jezioro. Niespokojne ryby.** · [zarzuc.com](https://zarzuc.com)

Gra wędkarska 3D w przeglądarce (MVP). **Three.js + TypeScript + Vite**, bez silnika fizyki — cała fizyka
(rzut, spławik, żyłka, napięcie, ryba) jest napisana ręcznie, prosta i stabilna, a każda liczba do strojenia
siedzi w jednym pliku: [`src/config.ts`](src/config.ts).

Jednostki: metry, kilogramy, sekundy, niutony. Oś Y w górę.

> **Stan:** przebudowa v2 w toku (stary koncept garaż → auto → parking usunięty).
> **Trwa przebudowa v2 „Chatka nad jeziorem”** – specyfikacja: [`docs/ZADANIE-v2-chatka.md`](docs/ZADANIE-v2-chatka.md).

## Dokumentacja

| Plik | Po co |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | mapa repozytorium, jak działa gra, zasady, debugowanie (czyta go agent Claude Code) |
| [`docs/ZADANIE-v2-chatka.md`](docs/ZADANIE-v2-chatka.md) | aktualne zadanie: przebudowa na koncept z chatką |
| [`docs/PROMPT-START.md`](docs/PROMPT-START.md) | tekst do wklejenia na start sesji Claude Code |
| [`docs/PROMPTY-OBRAZY.md`](docs/PROMPTY-OBRAZY.md) | prompty do ChatGPT na obrazy referencyjne |
| [`reference/README.md`](reference/README.md) | gdzie i pod jakimi nazwami zapisać obrazy |
| [`docs/PROMPT-grafika.md`](docs/PROMPT-grafika.md) | długofalowy plan podniesienia grafiki (po v2) |

---

## Ekran startowy

2D-scena na canvasie (pomost, wędkarz, pory dnia, deski-przyciski) w `src/ui/startscreen/`
(`startscreen.js` + style ograniczone do `#startscreen`). „Zacznij łowić” → animacja zarzucenia → pasek
ładowania → intro. Nazwa gry i hasło są w `CFG.game` (`src/config.ts`) — zmiana tam podmienia napis
z animowanymi literami, ekran ładowania i tytuł karty. „Kolekcja ryb” odkrywa gatunki z dziennika połowów.
Opcje „Odgłosy natury”, „Efekty dźwiękowe” i „Jakość grafiki” działają też w grze; „Pora dnia” i „Muzyka”
dotyczą na razie tylko menu (pora dnia jest poza zakresem MVP).

## Tryb testowy: szybkie brania

`CFG.bite.fastMode: true` (domyślnie w tej wersji) skraca czekanie na branie do ~3–7 s (mnożnik `fastMultiplier`),
żeby szybko przechodzić całą pętlę. Na wersję finalną ustaw `fastMode: false` – wtedy średnio 10–40 s.

## Uruchomienie

```bash
npm install
npm run dev        # serwer deweloperski (http://localhost:5173)
npm run build      # typecheck + build → statyczny folder dist/
npm run preview    # podgląd zbudowanego dist/
npm test           # testy jednostkowe (Vitest)
```

`dist/` używa ścieżek względnych — można go wrzucić na dowolny serwer statyczny (albo otworzyć przez `npm run preview`).
Wymagana przeglądarka z WebGL 2.

## Sterowanie

| Klawisz | Akcja |
|---|---|
| **WASD**, **Shift** | ruch, bieg |
| **Mysz** | kamera (kliknij w obraz, aby przechwycić kursor; gdy przeglądarka/ramka blokuje pointer lock, gra przechodzi w tryb wolnego kursora) |
| **E** | wyciągnięcie ryby (gdy zmęczona i blisko) |
| **F** (przytrzymaj 1,5 s) | nabicie robaka |
| **LPM** (przytrzymaj) | rzut — pasek siły waha się 0→100%→0 · w wodzie: zwijanie (pusty zestaw ~3 m/s, w holu 0,8 m/s) |
| **PPM** | zacięcie (albo szybkie szarpnięcie myszą w dół) |
| **Kółko** | hamulec kołowrotka 0,5–6 kgf co 0,25 |
| **Mysz w holu** | kąt wędki: lewo/prawo i w górę |
| **Tab** | dziennik połowów i rekordy |
| **Esc** | pauza · w intro: przytrzymaj 1 s, aby pominąć |
| **F1** | debug: nakładka + panel lil-gui; wtedy **B** wymusza branie, **1/2/3** = tempo ×0,25/×1/×4 |

## Jak się łowi (skrót)

1. Zejdź nad jezioro (wędka jest w ręce, robaki w kieszeni), nabij robaka – lista celów w lewym górnym rogu prowadzi krok po kroku.
2. Wejdź na pomost albo stań nad brzegiem, patrz na wodę, przytrzymaj LPM i puść przy właściwej sile.
3. Obserwuj spławik (podgląd w lewym dolnym rogu). Każdy gatunek bierze inaczej:
   * **płoć** – 2–4 drobne podskoki, potem szybkie zanurzenie pod kątem (okno 0,5 s),
   * **okoń** – zdecydowane zatopienie i odjazd w bok (0,8 s),
   * **karaś** – delikatne drżenie, spławik powoli sunie w bok (1,0 s),
   * **leszcz** – spławik **unosi się i kładzie płasko** (ryba podnosi śrucinę), potem odjeżdża (1,2 s),
   * **karp** – kilka drgnięć, potem spławik znika i żyłka ucieka (1,5 s).
4. Zatnij w oknie brania. Za wcześnie → spłoszona ryba; za późno → robak zjedzony.
5. Hol: kręć (LPM), gdy napięcie jest bezpieczne; ustaw hamulec kółkiem; prowadź wędkę w bok **przeciwnie** do
   ucieczki ryby (męczy się 2× szybciej). Duży karp (5 kg) ciągnie ~78 N przy żyłce 54 N — bez hamulca pęknie.
6. Gdy ryba jest zmęczona (< 20%) i blisko szczytówki (< 2,5 m w poziomie): **[E] Wyciągnij**.

Miejsce ma znaczenie: płytko/przy trzcinach → płoć, karaś; przy pomoście → okoń; głęboko (> 2,5 m, środek jeziora
i dołek na wschodzie) → leszcz i karp.

---

## Architektura

```
src/
  config.ts        WSZYSTKIE liczby do strojenia (edytowalne na żywo w F1 / lil-gui)
  main.ts          punkt wejścia
  core/            Game (globalna FSM), Loop (stały krok 1/60 + interpolacja), StateMachine, Input,
                   Rng (seedowany mulberry32), Events, math
  render/          RenderContext (ACES, sRGB, słońce z cieniami 2048, Hemisphere, Sky, mgła),
                   CameraRig (orbita + ramię sprężynowe z kolizją, kamera holu), WaterEffects (plusk, kręgi)
  world/           terrainMath (kształt jeziora, MAPA GŁĘBOKOŚCI, teren, droga, pomost), Heightmap,
                   waves (Gerstner – wspólny dla CPU i GPU), Water (shader), World (instancje drzew/trzcin/trawy)
  assets/          AssetRegistry (fabryki + loadGLB), procedural/* (postać, wędka, spławik, ryby…)
  player/          Player (kontroler), CharacterAnimator (proceduralny chód i pozy), collision,
                   Interaction (zasięg 2 m + stożek), Preparation (cele tutorialu, ekwipunek startowy, nabijanie)
  fishing/         FishingController (FSM łowienia), cast, Bobber, VerletLine, RodController,
                   tension (skalarny model napięcia), FightFish, bitePatterns, strike (Poisson + okna),
                   species, CatchLog
  cutscene/        Timeline (dane: ujęcia CatmullRom, akcje, napisy, fade)
  ui/              UI (nakładka HTML/CSS), CatchPreview, styles.css
  audio/           GameAudio (proceduralny WebAudio)
  debug/           DebugPanel (lil-gui z każdym parametrem configu)
tests/             Vitest: gatunki, napięcie/hamulec/zerwanie, okna zacięcia/Poisson, fizyka, balans holu
```

**Pętla gry** — `Loop` akumuluje czas i woła logikę w stałym kroku `CFG.loop.step` (1/60 s); render dostaje
`alpha` i interpoluje pozycje postaci, spławika i ryby. Czas fal w shaderze to ten sam (interpolowany) czas
symulacji, więc woda na GPU i wyporność na CPU są zgodne.

**Globalna maszyna stanów**: `BOOT → START_SCREEN → INTRO → GAMEPLAY ⇄ PAUSE` (`core/Game.ts`).

**Maszyna stanów łowienia** (`fishing/FishingController.ts`):
`IDLE → AIMING → CHARGING → CASTING → SETTLING → WAITING → NIBBLE → BITE → FIGHT → LANDING → CAUGHT → IDLE`,
porażki: `MISSED_EARLY`, `BAIT_STOLEN`, `LINE_SNAPPED`, `FISH_ESCAPED`. Każdy stan ma timeout i komunikat w HUD.

### Fizyka w skrócie

* **Rzut** – pocisk z `v0 = lerp(6, 20, siła)` pod kątem 35°, grawitacja + opór `a = −k|v|v`
  (`k` dostrojone tak, że maks. zasięg ≈ 30 m; test to pilnuje). Żyłka schodzi ze szpuli = przebyta droga.
* **Spławik** – pionowo `F = ρ·g·V_zanurzona(h)` (korpus + antenka), tłumienie liniowe i kwadratowe,
  zanurzenie liczone od wysokości fali Gerstnera w tym punkcie. Śrucina opada 0,5–1 s — do tego czasu spławik
  leży płasko; gdy dno jest płycej niż grunt (1,2 m), zostaje przechylony (a brania są rzadsze).
  Wzory brań nie „animują” spławika — dokładają siłę (gramy), podnoszą śrucinę albo znoszą zestaw w bok,
  a resztę robi fizyka.
* **Żyłka** – lina Verleta (40 punktów, 10 iteracji), pod wodą większy opór. **Tylko wizualna.**
* **Napięcie** (`fishing/tension.ts`) – `s = d − L`, `T = k_eff·s + c·ds/dt` (`k_eff` = wędka i żyłka szeregowo,
  `k_żyłki = EA/L`). Hamulec oddaje żyłkę, gdy `T > hamulec` (z małą bezwładnością szpuli — ostre zrywy potrafią
  go przebić). Zerwanie: `T > 54 N` dłużej niż 0,1 s. Luźna żyłka > 1,5 s → 35%/s szans na spięcie ryby.
* **Ryba w holu** – `m·a = F_ryby − T·kierunek_do_wędki − opór`, `F_ryby = siła·waga·g·(0,3+0,7·wytrzymałość)·zryw`;
  zrywy o charakterze gatunku, dążenie do głębi/trzcin, wytrzymałość maleje ∝ `T·dt`.
* **Wędka** – szczytówka to łańcuch 6 segmentów; ugięcie `T/k_rod` przez sprężynę z tłumieniem. Model napięcia
  liczy `d` od nieugiętej szczytówki (ugięcie jest już w `k_eff`), a lina Verleta jest przypięta do ugiętej.

---

## Modele z Blendera (podmiana na GLB)

Każdy model powstaje przez `AssetRegistry` (`src/assets/AssetRegistry.ts`) — jeden interfejs
`create(opts) → Object3D`. Dziś fabryki są proceduralne; podmiana to jedna linia **przed** utworzeniem gry, np. w
`src/assets/index.ts`:

```ts
const r = createDefaultRegistry();
await r.loadGLB('rod', 'models/rod.glb');          // pliki GLB wrzuć do public/models/
await r.loadGLB('character', 'models/angler.glb');
```

(`Game` tworzy rejestr w konstruktorze — przy przejściu na GLB wystarczy zrobić ładowanie asynchronicznie w stanie
`BOOT` przed budową świata.) Reszta gry odwołuje się wyłącznie do **nazw pivotów/kości**, więc nie zauważy różnicy,
jeśli GLB je zawiera:

| Model | Wymagane obiekty (nazwy w Blenderze) |
|---|---|
| postać | `hips`, `spine`, `neck`, `head`, `upperarm_L/R`, `forearm_L/R`, **`hand_L`**, **`hand_R`**, `thigh_L/R`, `shin_L/R`, `foot_L/R` |
| wędka | `rod_seg_0` … `rod_seg_5` (łańcuch szczytówki), **`rod_tip`**, **`reel`**, `reel_handle` |
| spławik | `float_top` (origin = dół korpusu, oś +Y) |
| ryba | **`mouth`**, siatka `fish_body` (materiał z `fishMaterial()` daje falowanie i zanik pod wodą) |

Konwencje: 1 jednostka = 1 m; origin postaci między stopami; przód modelu = **+Z w three.js** (w Blenderze
model patrzy w **−Y**, eksport glTF z „+Y Up”); ryba ma długość 1 (skalowana do rozmiaru), pysk na +Z;
wędka: origin w chwycie, blank wzdłuż +Z. Jeśli jakiegoś pivota brakuje, `pivot()` rzuci czytelny błąd z nazwą.

---

## Debug i strojenie

* **F1** – nakładka (stan gry i łowienia, `T [N]`, `L`, `d`, wytrzymałość ryby, gatunek, FPS, draw calls) i panel
  **lil-gui z każdym parametrem `config.ts`** (zmiany na żywo; fale, słońce i model napięcia odświeżają się od razu).
* `window.__game` w konsoli daje dostęp do wszystkiego (np. `__game.fishing.forceBite('karp', 70)`).
* `tests/balance.test.ts` symuluje hol bez grafiki (ten sam model co w grze) i wypisuje czasy dla gatunków —
  wygodne przy strojeniu `species[].fight` i `line.*`.

Budżet wydajności: < 200 draw calli (drzewa/trzciny/trawa/kamienie jako `InstancedMesh`, statyczne części modeli
scalane per materiał), cienie 2048, woda jako jedna siatka.

## Znane ograniczenia MVP

* Poza zakresem: sklep, ekwipunek, inne wędki/przynęty, pora dnia i pogoda, łódź, multiplayer.
* Ustawienia na ekranie startowym są celowo wyszarzone.
* Wyciągnięcie ryby uruchamia się przy odległości poziomej szczytówka–ryba < 2,5 m (a nie przy długości żyłki), bo
  szczytówka 3,6-metrowej wędki wisi ~2,5–3 m nad wodą.
