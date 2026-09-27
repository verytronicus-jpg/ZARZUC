# CLAUDE.md – przewodnik po repozytorium gry „Zarzuć”

Ten plik czytasz jako pierwszy. Opisuje, czym jest projekt, gdzie co leży, jak to działa i czego nie wolno zepsuć.
**Aktualne zadanie** jest w [`docs/ZADANIE-v2-chatka.md`](docs/ZADANIE-v2-chatka.md).

---

## 1. Projekt w skrócie

**Zarzuć** (domena: zarzuc.com) to gra wędkarska 3D w przeglądarce. Hasło: „Spokojne jezioro. Niespokojne ryby.”

- Stack: **Three.js + TypeScript + Vite**. Testy: **Vitest**. Brak silnika fizyki – cała fizyka jest ręczna.
- Jednostki: metry, kilogramy, sekundy, niutony. Oś Y w górę.
- Język gry i UI: **polski**. Komentarze w kodzie: po polsku. Identyfikatory: po angielsku.
- Stan: **MVP v0.2** (stary koncept: garaż → auto → parking nad jeziorem). Trwa **przebudowa v2** (chatka nad jeziorem
  w górach, intro „otwierane drzwi” z perspektywy pierwszej osoby). Szczegóły w `docs/ZADANIE-v2-chatka.md`.

## 2. Komendy

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest – musi przechodzić po każdej zmianie
npm run build      # tsc --noEmit + vite build → dist/ (ścieżki względne, hosting statyczny)
npm run typecheck
```

## 3. Mapa repozytorium

```
index.html                  strona: canvas#game + div#ui, meta/og pod zarzuc.com, fonty Lilita One + Nunito
src/main.ts                 punkt wejścia – tworzy Game i start()
src/config.ts               ★ WSZYSTKIE liczby do strojenia (edytowalne na żywo w panelu F1). Sekcje niżej.
src/core/                   szkielet gry
  Game.ts                   ★ globalna maszyna stanów BOOT → START_SCREEN → CUTSCENE → GAMEPLAY ⇄ PAUSE,
                            spina wszystkie systemy, pętla fixedUpdate/render, HUD, podgląd spławika (PiP)
  Loop.ts                   stały krok fizyki 1/60 s (akumulator) + render z interpolacją alpha
  StateMachine.ts           generyczna FSM: enter/exit/update, czas w stanie, timeout/onTimeout
  Input.ts                  klawiatura/mysz/pointer lock; krawędzie (consumePress) konsumowane w kroku fizyki,
                            simulateKey/simulateMouse do testów, recentDownMotion (szarpnięcie myszą)
  Rng.ts                    seedowany RNG (mulberry32) – powtarzalność
  Events.ts                 typowany emiter zdarzeń (audio, efekty, HUD)
  math.ts                   clamp/lerp/damp/smoothstep/fmt (przecinek dziesiętny)
src/world/                  świat
  terrainMath.ts            ★ czysta matematyka: kształt jeziora, MAPA GŁĘBOKOŚCI (lakeDepth), łuki trzcin,
                            wysokość terenu, droga (ROAD), parking, prostokąt pomostu, granice mapy
  Heightmap.ts              siatka próbek terenu; heightAt() interpoluje po tych samych trójkątach co mesh
  waves.ts                  ★ fale Gerstnera – JEDNA definicja dla CPU i GPU (GLSL w tym samym pliku)
  Water.ts                  shader wody (fale, fresnel, kolor z tekstury głębokości)
  World.ts                  buduje teren, wodę, pomost, instancje (trzciny, drzewa, kamienie, trawa), dom, auto,
                            parking; zapytania: groundAt, depthAt, waterY, reedDistance, pierDistance, colliders
src/render/
  RenderContext.ts          renderer (ACES, sRGB), słońce z cieniami, Hemisphere, Sky, mgła, setQuality()
  CameraRig.ts              kamera 3. osoby: orbita, ramię sprężynowe z kolizją, tryb holu, startBlend()
  WaterEffects.ts           plusk (cząsteczki) i kręgi na wodzie – słucha zdarzeń splash/ripple/fishSplash
src/assets/
  AssetRegistry.ts          ★ fabryki modeli + loadGLB(); tabela PIVOTS (nazwy kości/pivotów jak w Blenderze)
  index.ts                  rejestr z fabrykami proceduralnymi
  materials.ts              cache materiałów, mergeStaticChildren (mniej draw calli)
  procedural/character.ts   postać z brył ze stawami (hips, spine, hand_R …)
  procedural/tackle.ts      wędka (łańcuch rod_seg_0..5, rod_tip, reel), spławik, haczyk+robak, pudełko robaków
  procedural/fish.ts        5 gatunków (jedna siatka + kolory wierzchołków), shader pływania i zanik pod wodą
  procedural/car.ts         auto (klapa trunk_lid, drzwi, koła)            ← do usunięcia w v2
  procedural/props.ts       dom z garażem, stojak na wędki                  ← do usunięcia/zamiany w v2
src/player/
  Player.ts                 kontroler: przyspieszenie/hamowanie, obrót, grawitacja, teren, kolizje, granice
  CharacterAnimator.ts      proceduralne animacje: chód/bieg + pozy górnej części ciała (UpperPose)
  collision.ts              okrąg gracza vs okręgi/prostokąty obrócone
  Interaction.ts            najbliższy obiekt w zasięgu 2 m i w stożku widzenia („[E] …”)
  Preparation.ts            cele tutorialu, bagażnik, branie wędki/robaków, nabijanie (F)  ← do przebudowy w v2
src/fishing/                ★ serce gry – NIE ZMIENIAĆ ZACHOWANIA bez wyraźnej potrzeby
  FishingController.ts      FSM łowienia (niżej), celowanie, rzut, zestaw w wodzie, brania, zacięcie, hol,
                            wyciągnięcie; hint dla HUD; forceBite(species?, cm?) do debugowania
  cast.ts                   balistyka zestawu (grawitacja + opór a = −k|v|v), simulateRange
  Bobber.ts                 spławik: wyporność z wysokości fali, ustawianie się, leżenie na płyciźnie,
                            flaga submerged + zdarzenie floatUnder
  VerletLine.ts             żyłka WIZUALNA (lina Verleta 40 pkt, 10 iteracji)
  RodController.ts          orientacja wędki + ugięcie szczytówki (sprężyna, 6 segmentów)
  tension.ts                ★ skalarny model napięcia (k_eff szeregowo, hamulec z bezwładnością szpuli, zerwanie)
  FightFish.ts              ryba w holu: siły, zrywy gatunku, dążenie do głębi/trzcin, zmęczenie
  bitePatterns.ts           wzory brań 5 gatunków (siły na spławik, nie animacja)
  strike.ts                 okna zacięcia, szansa zaczepienia, proces Poissona brań
  species.ts                wzór długość–waga, losowanie długości/gatunku, dopasowanie do strefy
  CatchLog.ts               dziennik i rekordy w localStorage (klucz zarzuc.log.v1)
src/cutscene/
  Timeline.ts               ★ timeline oparty na danych (ujęcia CatmullRom, akcje, napisy, fade) – DO PONOWNEGO
                            UŻYCIA w intro v2
  introScript.ts            dane starej cutscenki (garaż/auto)               ← do usunięcia w v2
  IntroCutscene.ts          aktorzy starej cutscenki (auto, bagażnik)        ← do usunięcia w v2
src/ui/
  UI.ts                     nakładka HTML nad canvasem: cele, status, podpowiedzi, komunikaty, pasek siły,
                            panel holu, podgląd spławika + znacznik brania, pauza, ekran złowienia, dziennik, debug
  styles.css                style HUD
  CatchPreview.ts           obracający się model ryby na ekranie złowienia
  startscreen/              ekran startowy (2D canvas + deski-przyciski) – zwykły JS, NIE TypeScript
    startscreen.js          mountStartScreen({title, tagline, domain, species, onCastStart, onStart, onOptions})
    logo.js                 animowane logo „ZARZUĆ” (litery wpadają do wody, spławik = kreska nad „Ć”)
    startscreen.css         style ograniczone do #startscreen
    startscreen.d.ts        typy dla TS
src/audio/GameAudio.ts      cały dźwięk proceduralny (WebAudio) – reaguje na zdarzenia z Events
src/debug/DebugPanel.ts     lil-gui z każdym parametrem config.ts
tests/                      Vitest: species, tension, strike, physics (rzut/fale/spławik/FSM), balance (symulacja holu)
docs/
  ZADANIE-v2-chatka.md      ★ AKTUALNE ZADANIE: przebudowa na koncept „chatka nad jeziorem”
  PROMPTY-OBRAZY.md         prompty do ChatGPT, którymi wygenerowano obrazy referencyjne
  PROMPT-grafika.md         długofalowy plan podniesienia grafiki (V1–V8) – po v2
  PROMPT-START.md           tekst startowy dla sesji Claude Code
reference/                  obrazy referencyjne (koncept, arkusze modeli, ryby, tekstury) – opis w reference/README.md
public/                     pliki serwowane 1:1 (tu trafią modele GLB, tekstury, obrazy UI)
```

## 4. Jak to działa

### Pętla i kolejność
`Loop` woła `Game.fixedUpdate(1/60)` w stałym kroku, a `Game.render(alpha)` raz na klatkę.

`fixedUpdate` (tylko w GAMEPLAY): klawisze debug → Tab (dziennik) → `player.update` → `fishing.update` →
`prep.update`. **FSM łowienia jest tykana na końcu `FishingController.update()`**.

`render`: interpolacja postaci → tryb kamery (follow/hol) → `camRig.update` → `fishing.render` → HUD →
efekty wody → cień → render sceny → podgląd spławika (drugi render w rogu, scissor) → audio.
`input.endFrame()` czyści krawędzie klawiszy po klatce, w której był krok fizyki.

### Globalna FSM (`core/Game.ts`)
`BOOT → START_SCREEN → CUTSCENE → GAMEPLAY ⇄ PAUSE`. Ekran startowy montuje `mountStartScreen`; jego `onStart`
przechodzi do CUTSCENE. Na START_SCREEN świat 3D nie jest renderowany. W v2 CUTSCENE zastępujemy stanem INTRO.

### FSM łowienia (`fishing/FishingController.ts`)
`IDLE → AIMING → CHARGING → CASTING → SETTLING → WAITING → NIBBLE → BITE → FIGHT → LANDING → CAUGHT → IDLE`.
Porażki z komunikatem: `MISSED_EARLY`, `BAIT_STOLEN`, `LINE_SNAPPED`, `FISH_ESCAPED`.
- Zarzucić można tylko w strefie brzegu/pomostu, patrząc na wodę (`updateCastZone`) i z robakiem na haczyku.
- Branie: proces Poissona (`strike.ts`), intensywność zależna od miejsca (`species.ts`). **`CFG.bite.fastMode`
  (teraz `true`) skraca czekanie do ~3–7 s na testy.**
- Zacięcie: PPM albo wyraźne szarpnięcie myszą w dół, liczone tylko w oknie BITE.
- Hol: `TensionModel` + `FightFish`; napięcie liczy model skalarny, lina Verleta jest tylko wizualna.

### Łowiska (ważne przy przebudowie mapy)
Gatunek zależy od **głębokości z mapy** (`terrainMath.lakeDepth`) i **odległości od trzcin i pomostu**
(`World.reedDistance`, `World.pierDistance`). Nowa mapa musi dalej dostarczać te dane, żeby płoć/karaś brały
płytko przy trzcinach, okoń przy pomoście/strukturach, a leszcz i karp głęboko (> 2,5 m).

### Modele
Każdy model powstaje przez `AssetRegistry.create(kind)`. Podmiana na GLB: `registry.loadGLB(kind, url)`.
Gra odwołuje się wyłącznie do **nazw pivotów z `PIVOTS`** (np. `hand_R`, `rod_tip`, `mouth`). Nowe modele muszą je mieć.

## 5. Zasady nienaruszalne

1. **Łowienie działa jak dziś.** Zmiany w `src/fishing/` tylko, gdy zadanie tego wymaga; `npm test` zawsze zielone.
2. **Wszystkie liczby do `src/config.ts`** – nic „magicznego” w kodzie. Nowe sekcje pojawią się w panelu F1 same.
3. **Fale: CPU = GPU.** Przemieszczenie wierzchołków wody zostaje wspólną funkcją z `world/waves.ts`.
4. **Logika w stałym kroku, render z interpolacją.** Nie przenoś logiki do `render()`.
5. **Brak błędów w konsoli**, każdy stan ma czytelny komunikat po polsku.
6. **Wydajność:** 60 FPS na średnim laptopie, < 300 draw calli (roślinność jako `InstancedMesh`).
7. **Po każdym kamieniu milowym:** gra się uruchamia, `npm test` i `npm run build` przechodzą, krótkie
   podsumowanie zmian, commit.

## 6. Debugowanie i weryfikacja

- `window.__game` – dostęp do wszystkiego w konsoli, np. `__game.fishing.forceBite('karp', 70)`,
  `__game.player.teleport(x, z, yaw)`, `__game.fsm.state`, `__game.loop.timeScale = 4`.
- **F1** – nakładka (stan gry i łowienia, T [N], L, d, FPS, draw calls) + panel lil-gui; wtedy **B** wymusza branie,
  **1/2/3** = tempo ×0,25/×1/×4.
- `?logoT=5` w adresie – logo na ekranie startowym od razu w stanie końcowym (zrzuty ekranu).
- Test w przeglądarce bez GPU (jeśli jest Playwright/Chromium): flagi `--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader`. Do wejścia/wyjścia używaj `__game.input.simulateKey/simulateMouse` i odmierzaj
  czas przez `__game.loop.simTime` (software rendering daje kilka FPS).
- `tests/balance.test.ts` symuluje hol bez grafiki i wypisuje czasy – przydatne przy strojeniu.

## 7. Pułapki

- Ekran startowy to **zwykły JS** (`startscreen.js`, `logo.js`) wygenerowany z projektu HTML autora – typy
  w `startscreen.d.ts`. Style muszą zostać ograniczone do `#startscreen`.
- `mergeStaticChildren` scala siatki o tym samym materiale – nie zakładaj, że dzieci modelu to pojedyncze bryły.
- Pointer lock może być zablokowany (np. w osadzonej ramce) – `Input.lockFailed` przełącza na wolny kursor.
- `Heightmap.heightAt` musi dzielić komórki na trójkąty tak samo jak siatka terenu w `World.buildTerrain`.
