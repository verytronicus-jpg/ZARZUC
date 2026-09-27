# Zarzuć 🎣

**Spokojne jezioro. Niespokojne ryby.** · [zarzuc.com](https://zarzuc.com)

Gra wędkarska 3D w przeglądarce (MVP). **Three.js + TypeScript + Vite**, bez silnika fizyki — cała fizyka
(rzut, spławik, żyłka, napięcie, ryba) jest napisana ręcznie, prosta i stabilna, a każda liczba do strojenia
siedzi w jednym pliku: [`src/config.ts`](src/config.ts).

Jednostki: metry, kilogramy, sekundy, niutony. Oś Y w górę.

> **Stan: v2 „Chatka nad jeziorem”** – drewniana chatka na polanie nad górskim jeziorem, intro „otwierane drzwi”
> z oczu bohatera, grafika na poziomie obrazów z `reference/` (specyfikacja: [`docs/ZADANIE-v2-chatka.md`](docs/ZADANIE-v2-chatka.md)).

## Dokumentacja

| Plik | Po co |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | mapa repozytorium, jak działa gra, zasady, debugowanie (czyta go agent Claude Code) |
| [`docs/ZADANIE-v2-chatka.md`](docs/ZADANIE-v2-chatka.md) | specyfikacja v2 (koncept z chatką) – zrealizowana |
| [`docs/PROMPT-START.md`](docs/PROMPT-START.md) | tekst do wklejenia na start sesji Claude Code |
| [`docs/PROMPTY-OBRAZY.md`](docs/PROMPTY-OBRAZY.md) | prompty do ChatGPT na obrazy referencyjne |
| [`reference/README.md`](reference/README.md) | gdzie i pod jakimi nazwami zapisać obrazy |
| [`docs/PROMPT-grafika.md`](docs/PROMPT-grafika.md) | plan grafiki V1–V8 (V1–V3 weszły do v2) |

---

## Ekran startowy

2D-scena na canvasie (pomost, wędkarz, pory dnia, deski-przyciski) w `src/ui/startscreen/`
(`startscreen.js` + style ograniczone do `#startscreen`). „Zacznij łowić” → animacja zarzucenia → pasek
ładowania → intro. Nazwa gry i hasło są w `CFG.game` (`src/config.ts`) — zmiana tam podmienia napis
z animowanymi literami, ekran ładowania i tytuł karty. „Kolekcja ryb” odkrywa gatunki z dziennika połowów
(ilustracje z arkuszy `reference/02-postacie-i-obiekty/04–08`, złowione w kolorze, pozostałe jako sylwetki).
Opcje „Odgłosy natury”, „Efekty dźwiękowe” i „Jakość grafiki” działają też w grze; „Pora dnia” i „Muzyka”
dotyczą na razie tylko menu (pora dnia jest poza zakresem).

## Przebieg gry

1. **Ekran startowy** → „Zacznij łowić”.
2. **Intro z oczu bohatera** (~5 s, `src/cutscene/`): ciemne wnętrze chatki, dłoń na klamce, skrzypnięcie drzwi,
   oślepiające złote światło poranka, krok na ganek i widok na ścieżkę, pomost, jezioro i góry. Kamera płynnie,
   bez cięcia, odjeżdża za plecy bohatera i oddaje sterowanie (3. osoba). **Esc** (przytrzymaj 1 s) pomija intro.
3. **Cele** (lewy górny róg): *Zejdź nad jezioro* → *Nabij robaka (przytrzymaj F)* → *Zarzuć*. Wędka jest w ręce
   od początku, robaki w kieszeni.
4. **Łowienie** – jak w MVP (niżej). Po wyciągnięciu bohater trzyma rybę oburącz, a ekran połowu pokazuje jej ilustrację.

## Lokacja

Polana z chatką z bali ~50 m nad górskim jeziorem; ścieżka z płotkiem schodzi do pomostu z łódką. Gęsty las
świerkowy (sosny, brzozy, wierzba nad zatoczką), dwie zatoczki z trzcinami i pałkami, grążele, skalisty cypel,
zwalone drzewo w wodzie, poszarpane szczyty za jeziorem (panorama z `09-panorama-gor`), wschód słońca i mgiełka
nad wodą. Kształt jeziora, mapa głębokości i łowiska są w `src/world/terrainMath.ts` (czysta matematyka, testy
w `tests/world.test.ts`): płytko przy trzcinach → płoć, karaś; przy pomoście, cyplu i zwalonym drzewie → okoń;
głęboko (> 2,5 m, środek i dołek) → leszcz, karp.

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
npm run check      # typecheck (bez nieużywanego kodu) + testy – przed każdym commitem
```

`dist/` używa ścieżek względnych — można go wrzucić na dowolny serwer statyczny (albo otworzyć przez `npm run preview`).
Wymagana przeglądarka z WebGL 2.

## Sterowanie

| Klawisz | Akcja |
|---|---|
| **WASD**, **Shift** | ruch, bieg |
| **Mysz** | kamera (kliknij w obraz, aby przechwycić kursor; gdy przeglądarka/ramka blokuje pointer lock, gra przechodzi w tryb wolnego kursora) |
| **E** / **Spacja** | wyciągnięcie ryby (gdy zmęczona i blisko – na środku ekranu pojawi się „Wyciągnij rybę”) |
| **F** (przytrzymaj 1,5 s) | nabicie robaka |
| **LPM** (przytrzymaj) | rzut — pasek siły waha się 0→100%→0 · w wodzie: zwijanie (pusty zestaw ~3 m/s, w holu 0,8 m/s) |
| **LPM** (klik w chwili brania), **PPM**, **Spacja** | zacięcie (albo szybkie szarpnięcie myszą w dół) – na środku ekranu pojawia się „BIERZE!” |
| **Kółko** | hamulec kołowrotka 0,5–6 kgf co 0,25 |
| **Mysz w holu** | kąt wędki: lewo/prawo i w górę |
| **Tab** | dziennik połowów i rekordy |
| **Esc** | pauza · w intro: przytrzymaj 1 s, aby pominąć |
| **F1** | debug: nakładka + panel lil-gui; wtedy **B** wymusza branie, **1/2/3** = tempo ×0,25/×1/×4 |

## Jak się łowi (skrót)

1. Zejdź ścieżką nad jezioro (wędka jest w ręce, robaki w kieszeni), nabij robaka – lista celów w lewym górnym rogu prowadzi krok po kroku.
2. Wejdź na pomost albo stań nad brzegiem, patrz na wodę, przytrzymaj LPM i puść przy właściwej sile.
3. Obserwuj spławik (podgląd w lewym dolnym rogu). Każdy gatunek bierze inaczej:
   * **płoć** – 2–4 drobne podskoki, potem szybkie zanurzenie pod kątem (okno 0,5 s),
   * **okoń** – zdecydowane zatopienie i odjazd w bok (0,8 s),
   * **karaś** – delikatne drżenie, spławik powoli sunie w bok (1,0 s),
   * **leszcz** – spławik **unosi się i kładzie płasko** (ryba podnosi śrucinę), potem odjeżdża (1,2 s),
   * **karp** – kilka drgnięć, potem spławik znika i żyłka ucieka (1,5 s).
4. Gdy spławik zniknie pod wodą, na środku ekranu pojawi się **„BIERZE!”** – kliknij (LPM, PPM albo Spacja).
   Okna zacięcia: płoć 0,9 s, okoń 1,2 s, karaś 1,4 s, leszcz 1,6 s, karp 1,9 s. Za wcześnie (spławik tylko drga) →
   ryba może się spłoszyć (35%); za późno → robak zjedzony.
5. Hol: kręć (LPM), gdy napięcie jest bezpieczne; ustaw hamulec kółkiem; prowadź wędkę w bok **przeciwnie** do
   ucieczki ryby (męczy się 2× szybciej). Duży karp (5 kg) ciągnie ~78 N przy żyłce 54 N — bez hamulca pęknie.
6. Gdy ryba jest zmęczona (< 28%) i blisko szczytówki (< 3,2 m w poziomie): **[E] / [Spacja] Wyciągnij**.
   Wystarczy trzymać LPM – przy domyślnym hamulcu (3 kgf) żyłka nie pęknie; hamulec i prowadzenie wędki
   skracają hol i pomagają przy dużych karpiach.

Miejsce ma znaczenie: płytko/przy trzcinach → płoć, karaś; przy pomoście, cyplu i zwalonym drzewie → okoń;
głęboko (> 2,5 m, środek jeziora i dołek) → leszcz i karp.

---

## Architektura

```
src/
  config.ts        WSZYSTKIE liczby do strojenia (edytowalne na żywo w F1 / lil-gui)
  main.ts          punkt wejścia: rejestr modeli (+ GLB z public/models/manifest.json) → Game
  core/            Game (globalna FSM), Loop (stały krok 1/60 + interpolacja), StateMachine, Input,
                   Rng (seedowany mulberry32), Events, math
  render/          RenderContext (potok renderu, światła, presety jakości, dynamiczna rozdzielczość),
                   PostFX (bloom, AO, promienie, mgła, mgiełka nad wodą, grading), PlanarReflection,
                   SkyDome (panorama 360°), materialsFx (splatting terenu, detal trójplanarny), textures,
                   layers, CameraRig, WaterEffects
  world/           terrainMath (jezioro, MAPA GŁĘBOKOŚCI, polana, ścieżka, pomost, cypel, zwalone drzewo),
                   Heightmap, waves (Gerstner – wspólny dla CPU i GPU), Water (shader), World (składa świat
                   i odpowiada na zapytania), TerrainMesh (siatka terenu ze splattingiem), Vegetation (rozmieszczenie
                   lasu, trzcin i kamieni), VegetationInstancer (instancje, cienie i LOD wokół gracza),
                   GrassField (trawa na wietrze), ChimneySmoke, wind
  assets/          AssetRegistry (fabryki + loadGLB), manifest (GLB z public/models), procedural/*: bohater
                   (SkinnedMesh), chatka i wnętrze, dłoń do intro, drzewa i rośliny z kart (foliage), przyroda,
                   sprzęt, ryby z ilustracji
  player/          Player (kontroler), CharacterAnimator (chód/bieg, pozy górne i dolne), collision,
                   Preparation (cele, ekwipunek startowy, nabijanie)
  fishing/         FishingController (FSM łowienia), cast, Bobber, VerletLine, RodController,
                   tension (skalarny model napięcia), FightFish, bitePatterns, strike (Poisson + okna),
                   species, CatchLog
  cutscene/        Timeline (dane: ujęcia, akcje, napisy, fade, układ lokalny), DoorIntro + doorIntroScript
  ui/              UI (nakładka HTML/CSS, ekran połowu z ilustracją), startscreen/ (ekran startowy, JS)
  audio/           GameAudio (proceduralny WebAudio: las, woda, zasuwka, skrzypienie drzwi…)
  debug/           DebugPanel (lil-gui z każdym parametrem configu)
scripts/           prepare_images.py – obrazy z reference/ → public/ (panorama, tekstury, atlas liści, ryby, og)
tests/             Vitest: gatunki, napięcie/hamulec/zerwanie, okna zacięcia/Poisson, fizyka, balans holu, układ świata
```

**Pętla gry** — `Loop` akumuluje czas i woła logikę w stałym kroku `CFG.loop.step` (1/60 s); render dostaje
`alpha` i interpoluje pozycje postaci, spławika i ryby. Czas fal w shaderze to ten sam (interpolowany) czas
symulacji, więc woda na GPU i wyporność na CPU są zgodne.

**Globalna maszyna stanów**: `BOOT → START_SCREEN → INTRO → GAMEPLAY ⇄ PAUSE` (`core/Game.ts`). W BOOT wczytują
się tekstury (świat nie pokaże się z czarnym terenem).

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
* **Żyłka** – lina Verleta (40 punktów, 20 iteracji), pod wodą większy opór, bez ryby leży na tafli; luz wizualny
  ograniczony do naturalnego zwisu (bez pętli). Rysowana jako gładka wstęga o stałej grubości (Catmull-Rom),
  interpolowana między krokami fizyki i dociągnięta do wyrenderowanej szczytówki. **Tylko wizualna.**
* **Napięcie** (`fishing/tension.ts`) – `s = d − L`, `T = k_eff·s + c·ds/dt` (`k_eff` = wędka i żyłka szeregowo,
  `k_żyłki = EA/L`). Hamulec oddaje żyłkę, gdy `T > hamulec` (z małą bezwładnością szpuli — ostre zrywy potrafią
  go przebić). Zerwanie: `T > 54 N` dłużej niż 0,1 s. Luźna żyłka > 2,5 s → 20%/s szans na spięcie ryby.
* **Ryba w holu** – `m·a = F_ryby − T·kierunek_do_wędki − opór`, `F_ryby = siła·waga·g·(0,3+0,7·wytrzymałość)·zryw`;
  zrywy o charakterze gatunku, dążenie do głębi/trzcin, wytrzymałość maleje ∝ `T·dt`.
* **Wędka** – szczytówka to łańcuch 6 segmentów; ugięcie `T/k_rod` przez sprężynę z tłumieniem. Model napięcia
  liczy `d` od nieugiętej szczytówki (ugięcie jest już w `k_eff`), a lina Verleta jest przypięta do ugiętej.

---

## Grafika i obrazy (pipeline)

* **Potok renderu** (`render/RenderContext.ts`): odbicie planarne tafli → scena do HDR (MSAA) → kopia koloru
  i głębi → woda (refrakcja, pochłanianie zależne od głębokości, piana, iskrzenie) i efekty → PostFX
  (bloom, AO z głębi, promienie słońca, mgła wysokościowa, mgiełka nad wodą, ACES, ciepły grading, winieta).
* **Słońce** z kaskadowymi miękkimi cieniami (`SunLight`), światło wypełniające, oświetlenie z mapy otoczenia
  (PMREM z kopuły nieba). Roślinność rzuca cienie przez „proxy” – kopie instancji tylko w promieniu wokół gracza.
* **Obrazy z `reference/`** przygotowuje `python3 scripts/prepare_images.py [panorama|textures|foliage|fish|og]`
  (Pillow + numpy): panorama gór 360°, proceduralne tekstury w kolorach key artu (trawa, ściółka, ścieżka,
  piasek, dno, skała, drewno, kora, normalne wody, szum) – albo pliki z `reference/03-tekstury`, atlas liści
  i igliwia z alfą, ilustracje ryb z wyciętym tłem (UI + tekstury modeli 3D), obraz og.
* **Presety jakości** (`CFG.quality`, wybór na ekranie startowym): *Wysoka* – MSAA, AO, promienie, odbicie
  planarne, cienie 2048, gęsta trawa; *Niska* – bez nich, cienie 1024, mniejszy budżet pikseli. Dodatkowo
  **dynamiczna rozdzielczość** (`CFG.render.dynamicRes`): gdy średnia klatka > ~18 ms, obraz renderuje się
  w niższej rozdzielczości (do 60 %), a przy zapasie wraca do pełnej.
* Budżet: ~110–130 draw calli (drzewa, trzciny, trawa, kamienie jako `InstancedMesh`; bohater, ryba i każde
  drzewo to jedna siatka), cel < 300.

## Modele z Blendera (podmiana na GLB)

Każdy model powstaje przez `AssetRegistry` (`src/assets/AssetRegistry.ts`) — jeden interfejs
`create(opts) → Object3D`. Fabryki są proceduralne; podmiana nie wymaga zmian w kodzie – wystarczy wrzucić GLB
do `public/models/` i wpisać je do `public/models/manifest.json`:

```json
{ "models": {
    "character": { "url": "models/character.glb" },
    "rod": { "url": "models/rod.glb", "scale": 1 },
    "fish:okon": { "url": "models/okon.glb" }
} }
```

Klucz = rodzaj z `AssetKind` (`character`, `rod`, `float`, `cabin`, `boat`, `spruceNear`, `pine`…; ryby per
gatunek: `fish:<gatunek>`). Manifest wczytuje `src/assets/manifest.ts` przed utworzeniem gry. Model bez
wymaganych pivotów albo plik, którego nie da się wczytać → zostaje model proceduralny (ostrzeżenie w konsoli).
Reszta gry odwołuje się wyłącznie do **nazw pivotów/kości**:

| Model | Wymagane obiekty (nazwy w Blenderze) |
|---|---|
| postać | kości `hips`, `spine`, `neck`, `head`, `upperarm_L/R`, `forearm_L/R`, **`hand_L`**, **`hand_R`**, `thigh_L/R`, `shin_L/R`, `foot_L/R` |
| wędka | `rod_seg_0` … `rod_seg_5` (łańcuch szczytówki), **`rod_tip`**, **`reel`**, `reel_handle` |
| spławik | `float_top` (origin = dół korpusu, oś +Y) |
| ryba | **`mouth`**, siatka `fish_body` (falowanie ogona i zanik pod wodą ma model proceduralny; GLB – własna animacja) |
| chatka | `door_front` (zawias drzwi), `door_latch`, `chimney_top` |

Konwencje: 1 jednostka = 1 m; origin postaci między stopami; przód modelu = **+Z w three.js** (w Blenderze
model patrzy w **−Y**, eksport glTF z „+Y Up”); ryba ma długość 1 (skalowana do rozmiaru), pysk na +Z;
wędka: origin w chwycie, blank wzdłuż +Z. Proceduralny bohater to `SkinnedMesh` z tymi samymi kośćmi, więc
animator (`CharacterAnimator`) działa tak samo dla GLB.

---

## Debug i strojenie

* **F1** – nakładka (stan gry i łowienia, `T [N]`, `L`, `d`, wytrzymałość ryby, gatunek, FPS, draw calls) i panel
  **lil-gui z każdym parametrem `config.ts`** (zmiany na żywo; fale, słońce i model napięcia odświeżają się od razu).
* `window.__game` w konsoli daje dostęp do wszystkiego (np. `__game.fishing.forceBite('karp', 70)`).
* `tests/balance.test.ts` symuluje hol bez grafiki (ten sam model co w grze) i wypisuje czasy dla gatunków —
  wygodne przy strojeniu `species[].fight` i `line.*`.

* `?logoT=5&fixedres` w adresie – logo od razu w stanie końcowym i stała rozdzielczość (zrzuty ekranu).

## Znane ograniczenia MVP

* Poza zakresem: sklep, ekwipunek, inne wędki/przynęty, pora dnia i pogoda, pływanie łódką, wnętrze chatki poza intro, multiplayer.
* Ustawienia na ekranie startowym są celowo wyszarzone.
* Wyciągnięcie ryby uruchamia się przy odległości poziomej szczytówka–ryba < 2,5 m (a nie przy długości żyłki), bo
  szczytówka 3,6-metrowej wędki wisi ~2,5–3 m nad wodą.
