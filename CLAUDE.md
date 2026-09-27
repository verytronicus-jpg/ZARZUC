# CLAUDE.md – przewodnik po repozytorium gry „Zarzuć”

Ten plik czytasz jako pierwszy. Opisuje, czym jest projekt, gdzie co leży, jak to działa i czego nie wolno zepsuć.
Specyfikacja obecnej wersji (v2 „Chatka nad jeziorem”): [`docs/ZADANIE-v2-chatka.md`](docs/ZADANIE-v2-chatka.md).

---

## 1. Projekt w skrócie

**Zarzuć** (domena: zarzuc.com) to gra wędkarska 3D w przeglądarce. Hasło: „Spokojne jezioro. Niespokojne ryby.”

- Stack: **Three.js + TypeScript + Vite**. Testy: **Vitest**. Brak silnika fizyki – cała fizyka jest ręczna.
- Jednostki: metry, kilogramy, sekundy, niutony. Oś Y w górę.
- Język gry i UI: **polski**. Komentarze w kodzie: po polsku. Identyfikatory: po angielsku.
- Stan: **v2 „Chatka nad jeziorem”**: chatka z bali na polanie nad górskim jeziorem, intro „otwierane drzwi”
  z perspektywy pierwszej osoby płynnie przechodzące w 3. osobę, grafika na poziomie obrazów z `reference/`
  (post-processing, odbicia, refrakcja, panorama gór, drzewa z kart, bohater ze szkieletem, ryby z ilustracji).

## 2. Komendy

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest – musi przechodzić po każdej zmianie
npm run build      # tsc --noEmit + vite build → dist/ (ścieżki względne, hosting statyczny)
npm run typecheck
python3 scripts/prepare_images.py [panorama|textures|foliage|fish|og]   # obrazy z reference/ → public/
```

## 3. Mapa repozytorium

```
index.html                  strona: canvas#game + div#ui, meta/og (og-image.jpg) pod zarzuc.com, fonty
src/main.ts                 punkt wejścia: rejestr modeli + applyModelManifest (GLB) → new Game → start()
src/config.ts               ★ WSZYSTKIE liczby do strojenia (edytowalne na żywo w panelu F1)
src/core/
  Game.ts                   ★ globalna FSM BOOT → START_SCREEN → INTRO → GAMEPLAY ⇄ PAUSE, spina systemy,
                            fixedUpdate/render, HUD, podgląd spławika (PiP), setQuality, debug window.__game
  Loop.ts                   stały krok 1/60 s (akumulator) + render z interpolacją alpha
  StateMachine.ts, Input.ts, Rng.ts, Events.ts, math.ts
src/world/
  terrainMath.ts            ★ czysta matematyka: kształt jeziora (zatoczki, cypel), MAPA GŁĘBOKOŚCI (lakeDepth),
                            polana i układ chatki (cabinFrame/cabinToWorld), ścieżka, pomost, zwalone drzewo,
                            granice, structureDistance; testy w tests/world.test.ts
  Heightmap.ts              niejednorodna siatka próbek (gęsto w obszarze gry); heightAt po tych samych trójkątach
  waves.ts                  ★ fale Gerstnera – JEDNA definicja dla CPU i GPU
  Water.ts                  shader wody: refrakcja z głębią, pochłanianie, odbicie planarne/panorama, piana, iskrzenie
  World.ts                  teren (splatting), woda, pomost, łódka, chatka (+wnętrze, lampa, dym), płotek, las
                            (bliskie/średnie/dalekie drzewa), trzciny, pałki, grążele, kamienie, podszyt, trawa;
                            instancje + proxy cieni; zapytania: groundAt, depthAt, reedDistance, structureDistance…
  GrassField.ts             trawa na wietrze wokół gracza (jeden InstancedMesh, podmuchy, uginanie, zanik)
  ChimneySmoke.ts, wind.ts  dym z komina, wspólne uniformy wiatru
src/render/
  RenderContext.ts          ★ potok renderu (odbicie → scena HDR → refrakcja → woda/FX → PostFX), SunLight
                            (kaskady cieni), PMREM z nieba, presety jakości, dynamiczna rozdzielczość, PiP
  PostFX.ts                 bloom, AO, promienie słońca, mgła wysokościowa, mgiełka nad wodą, ACES, grading
  PlanarReflection.ts       odbicie tafli (kamera lustrzana z płaszczyzną przycinania)
  SkyDome.ts                kopuła z panoramą gór (public/textures/panorama.jpg)
  materialsFx.ts            splatting terenu (6 tekstur, mokry brzeg, las z daleka), detal trójplanarny
  textures.ts               wszystkie tekstury (preload w BOOT)
  layers.ts                 warstwy: SHADOW(1) proxy cieni, WATER(2), REFLECT(3), FX(4), PIP(5) podgląd spławika
  CameraRig.ts              kamera 3. osoby: orbita, ramię z kolizją (teren + chatka), tryb holu
  WaterEffects.ts           plusk i kręgi na wodzie
src/assets/
  AssetRegistry.ts          ★ fabryki modeli + loadGLB(); tabela PIVOTS (nazwy kości/pivotów jak w Blenderze)
  manifest.ts               public/models/manifest.json → GLB zamiast fabryk (walidacja pivotów, zapas proceduralny)
  index.ts                  rejestr z fabrykami proceduralnymi
  materials.ts              cache materiałów, mergeStaticChildren
  procedural/character.ts   bohater (arkusze 01/01b): SkinnedMesh, kości = PIVOTS, kolory wierzchołków
  procedural/foliage.ts     drzewa i rośliny z kart (atlas foliage.webp): świerk (near/mid), sosna, brzoza,
                            wierzba, krzak, paproć
  procedural/nature.ts      daleki las, trzciny, pałki, grążele, głazy, pniak, zwalony pień
  procedural/cabin.ts       chatka (arkusz 06) z pivotami door_front/door_latch/chimney_top/lantern, łódka
  procedural/interior.ts    wnętrze chatki (arkusz 07) do intro; povHand.ts – dłoń z perspektywy 1. osoby
  procedural/tackle.ts      wędka, spławik, haczyk + robak, puszka z robakami (arkusz 03)
  procedural/fish.ts        5 gatunków: bryła z obrysu ilustracji + rzut ilustracji, płetwy z alfy, pływanie
  procedural/geo.ts         helpery geometrii (kolory wierzchołków, normalne, scalanie)
src/player/
  Player.ts                 kontroler: przyspieszenie, obrót, grawitacja, teren/ganek/pomost, kolizje, granice
  CharacterAnimator.ts      chód/bieg + pozy górne (UpperPose) i dolne (kucanie, rozkrok, wykrok)
  collision.ts, Interaction.ts
  Preparation.ts            cele (zejdź nad jezioro → nabij robaka → zarzuć), ekwipunek startowy, nabijanie (F)
src/fishing/                ★ serce gry – NIE ZMIENIAĆ ZACHOWANIA bez wyraźnej potrzeby
  FishingController.ts      FSM łowienia, celowanie, rzut, zestaw w wodzie, brania, zacięcie, hol, wyciągnięcie,
                            ryba w dłoniach po złowieniu; forceBite(species?, cm?) do debugowania
  cast.ts, Bobber.ts, VerletLine.ts, RodController.ts, tension.ts, FightFish.ts, bitePatterns.ts, strike.ts,
  species.ts (strefy: głębokość, trzciny, structureBonus), CatchLog.ts
src/cutscene/
  Timeline.ts               timeline oparty na danych (ujęcia, akcje, napisy, fade, układ lokalny, cameraEnabled)
  doorIntroScript.ts        ★ scenariusz intro (czasy w CFG.intro)
  DoorIntro.ts              aktorzy intro: drzwi, zasuwka, dłoń, światło w szparach, oddanie sterowania
src/ui/
  UI.ts                     nakładka HTML: cele, podpowiedzi, komunikaty, pasek siły, hol, PiP spławika, pauza,
                            ekran połowu z ilustracją ryby (public/ui/fish), dziennik, debug
  styles.css
  startscreen/              ekran startowy (2D canvas) – zwykły JS, NIE TypeScript (+ startscreen.d.ts)
src/audio/GameAudio.ts      dźwięk proceduralny (WebAudio): las, woda, kroki, zasuwka, skrzypienie drzwi…
src/debug/DebugPanel.ts     lil-gui z każdym parametrem config.ts
scripts/prepare_images.py   obrazy z reference/ → public/ (panorama 360°, tekstury, atlas liści, ryby, og)
tests/                      Vitest: species, tension, strike, physics, balance, world (układ mapy i łowisk)
docs/                       ZADANIE-v2-chatka.md (spec v2), PROMPT-grafika.md, PROMPTY-OBRAZY.md, PROMPT-START.md
reference/                  obrazy referencyjne (koncept, arkusze modeli, ryby, tekstury) – opis w reference/README.md
public/                     textures/ (panorama, teren, foliage, fish/), ui/fish/ (ilustracje), models/manifest.json,
                            og-image.jpg
```

## 4. Jak to działa

### Pętla i kolejność
`Loop` woła `Game.fixedUpdate(1/60)` w stałym kroku, a `Game.render(alpha)` raz na klatkę.

`fixedUpdate` (tylko w GAMEPLAY): klawisze debug → Tab (dziennik) → `player.update` → `fishing.update` →
`prep.update`. **FSM łowienia jest tykana na końcu `FishingController.update()`**.

`render`: interpolacja postaci → tryb kamery (follow/hol/intro) → `camRig.update` → `fishing.render` → HUD →
efekty wody → trawa i proxy cieni wokół gracza → `ctx.render` (pełny potok) → podgląd spławika (PiP) → audio.
`input.endFrame()` czyści krawędzie klawiszy po klatce, w której był krok fizyki.

### Globalna FSM (`core/Game.ts`)
`BOOT → START_SCREEN → INTRO → GAMEPLAY ⇄ PAUSE`. BOOT wczytuje tekstury; ekran startowy montuje
`mountStartScreen`, jego `onStart` przechodzi do INTRO. INTRO (`DoorIntro`) prowadzi kamerę z oczu bohatera,
w `handoff` stawia postać w miejscu kamery i przekazuje sterowanie (Timeline przestaje sterować kamerą),
potem kamera 3. osoby płynnie przejmuje widok (`camRig.startBlend`). Esc (przytrzymaj) = pominięcie.

### FSM łowienia (`fishing/FishingController.ts`)
`IDLE → AIMING → CHARGING → CASTING → SETTLING → WAITING → NIBBLE → BITE → FIGHT → LANDING → CAUGHT → IDLE`.
Porażki z komunikatem: `MISSED_EARLY`, `BAIT_STOLEN`, `LINE_SNAPPED`, `FISH_ESCAPED`.
- Zarzucić można tylko w strefie brzegu/pomostu, patrząc na wodę (`updateCastZone`) i z robakiem na haczyku.
- Branie: proces Poissona (`strike.ts`), intensywność zależna od miejsca (`species.ts`). **`CFG.bite.fastMode`
  (teraz `true`) skraca czekanie do ~3–7 s na testy.**
- Zacięcie: LPM (klik albo trzymany) w chwili brania, PPM, Spacja albo szarpnięcie myszą w dół. W oknie BITE
  zwijanie nie płoszy ryby (LPM = zacięcie); przy NIBBLE płoszy dopiero zwijanie > `CFG.bite.reelSpookTime`.
  Duży napis „BIERZE!” / „Wyciągnij rybę” (`UI.setBiteAlert`). Wyciągnięcie: E albo Spacja.
- Hol: `TensionModel` + `FightFish`; napięcie liczy model skalarny, lina Verleta jest tylko wizualna.

### Łowiska
Gatunek zależy od **głębokości z mapy** (`terrainMath.lakeDepth`) i **odległości od trzcin i struktur**
(`World.reedDistance`, `World.structureDistance` = pomost, cypel, zwalone drzewo). Płoć/karaś biorą płytko przy
trzcinach, okoń przy strukturach, leszcz i karp głęboko (> 2,5 m). `tests/world.test.ts` pilnuje układu.

### Grafika
- Potok: `PlanarReflection` (warstwa REFLECT) → scena warstwy 0 do HDR z MSAA i DepthTexture → kopia koloru
  i liniowej głębi (refrakcja) → woda i efekty (warstwy WATER/FX) → `PostFX.finish`. Mgła jest w PostFX
  (`scene.fog = null`), więc nowe materiały nie potrzebują obsługi mgły.
- Cienie: `SunLight` (2 kaskady) + proxy roślinności na warstwie SHADOW odświeżane wokół gracza.
- Roślinność: `InstancedMesh` przez `World.instanced(kind, list, opts)` (sway, odbicie, detal, lżejszy model do
  cieni `shadowKind`); karty liści mają `alphaTest` i podbitą alfę w mipmapach (`vegMaterial`). Bliskie świerki
  mają LOD (`lodPair`: pełny model w promieniu `CFG.quality.*.treeLodRadius`, dalej średni) – podział razem
  z proxy cieni w `updateShadowProxies`.
- Podgląd spławika (`renderViewport`) rysuje tylko warstwę PIP (spławik, żyłka, niebo) + wodę – nie całą scenę.
- Żyłka: `VerletLine` (fizyka wizualna w kroku, luz ograniczony do zwisu, bez ryby leży na tafli) +
  `LineRenderer` (wstęga o stałej szerokości w px, Catmull-Rom); w renderze `renderInto` interpoluje i dociąga
  końce do wyrenderowanej szczytówki i spławika.
- Presety `CFG.quality.high/low` + `CFG.render.dynamicRes`; `?fixedres` wyłącza dynamiczną rozdzielczość.

### Modele
Każdy model powstaje przez `AssetRegistry.create(kind)`. Podmiana na GLB: wpis w `public/models/manifest.json`
(wczytywany w `main.ts` przed grą; brak pivotów/błąd → model proceduralny). Gra odwołuje się wyłącznie do
**nazw pivotów z `PIVOTS`** (np. `hand_R`, `rod_tip`, `mouth`, `door_front`). Bohater proceduralny to
`SkinnedMesh` z kośćmi o tych nazwach – animator obraca kości, wędka jest doczepiona do `hand_R`.

### Płynność (co trzymać w ryzach)
- **Zero alokacji w gorących ścieżkach** (krok fizyki, render): wektory robocze jako pola, wyniki przez parametr
  `out` (np. `resolveCollisions`, `Heightmap.locate`, `gerstnerInto`). Śmieci = pauzy GC = przycięcia.
- Kolizje gracza przez `CollisionGrid` (tylko pobliskie przeszkody).
- HUD: zapis do DOM tylko przy zmianie (`txt`/`css` w `UI.ts`); **bez `backdrop-filter`** nad płótnem WebGL.
- Shadery kompilowane zawczasu (`Game.warmUpShaders` w BOOT) – nowy typ materiału dodaj tak, by istniał w scenie
  w chwili rozgrzewki (albo dołóż go tam tymczasowo jak rybę).
- Dynamiczna rozdzielczość + automatyczny spadek na „Niska” (`RenderContext.onTooSlow`), gdy nawet 60% nie wystarcza.
- Pomiar: skrypty z `window.__game` – owinięcie `loop.frame`/`render` w `performance.now()` i `performance.memory`
  (Chromium z `--enable-precise-memory-info`), profil alokacji przez CDP `HeapProfiler.startSampling`.

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
- `?logoT=5` w adresie – logo na ekranie startowym od razu w stanie końcowym; `&fixedres` – stała rozdzielczość
  (zrzuty ekranu). `__cfg.debug.skipRender = true` wyłącza render (szybkie testy logiki w SwiftShaderze).
- Porównanie z referencjami: zrzuty z ujęć jak w `reference/01-swiat` (01 key art ze ścieżki, 04/08 z pomostu,
  06 chatka) – po zmianach grafiki zrób zrzut i porównaj światło, kolory wody i roślinności.
- Edytowanie plików przy włączonym `npm run dev` przeładowuje stronę (HMR) i przerywa trwający zrzut –
  do długich zrzutów użyj `npm run build` + `npm run preview`.
- Test w przeglądarce bez GPU (jeśli jest Playwright/Chromium): flagi `--use-gl=angle --use-angle=swiftshader
  --enable-unsafe-swiftshader`. Do wejścia/wyjścia używaj `__game.input.simulateKey/simulateMouse` i odmierzaj
  czas przez `__game.loop.simTime` (software rendering daje kilka FPS).
- `tests/balance.test.ts` symuluje hol bez grafiki i wypisuje czasy – przydatne przy strojeniu.

## 7. Pułapki

- Ekran startowy to **zwykły JS** (`startscreen.js`, `logo.js`) wygenerowany z projektu HTML autora – typy
  w `startscreen.d.ts`. Style muszą zostać ograniczone do `#startscreen`.
- Karty roślin i ryby używają `alphaTest` – przy nowych teksturach z alfą zadbaj o „rozlany” kolor w tle
  (`bleed` w `prepare_images.py`), inaczej na krawędziach pojawią się ciemne obwódki.
- `DoubleSide` dla liści usuwa odwracanie normalnych tylnych ścian (łatka `normal_fragment_begin`) – normalne
  kart ustawia fabryka (`axisNormals`, `puffNormals`).
- Tint `CFG.post.shadowTint/highlightTint` jest liniowy (`setHex(…, LinearSRGBColorSpace)`).
- `mergeStaticChildren` scala siatki o tym samym materiale – nie zakładaj, że dzieci modelu to pojedyncze bryły.
- Pointer lock może być zablokowany (np. w osadzonej ramce) – `Input.lockFailed` przełącza na wolny kursor.
- `Heightmap.heightAt` musi dzielić komórki na trójkąty tak samo jak siatka terenu w `World.buildTerrain`.
