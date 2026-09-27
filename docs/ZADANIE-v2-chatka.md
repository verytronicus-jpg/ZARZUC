# ZADANIE v2 – „Chatka nad jeziorem”

Przebudowa gry **Zarzuć** z konceptu MVP (garaż → auto → parking) na nowy, prostszy i ładniejszy koncept.
Przeczytaj najpierw `CLAUDE.md` (mapa repozytorium i zasady). Obrazy referencyjne są w `reference/`
(opis w `reference/README.md`).

---

## 1. Nowy koncept (co gracz przeżywa)

1. **Ekran startowy** (zostaje bez zmian): „Zacznij łowić” → animacja zarzucenia w menu → pasek ładowania.
2. **Intro „otwierane drzwi” (około 5 s, z oczu wędkarza):** jesteśmy w ciemnym wnętrzu drewnianej chatki,
   ręka na zasuwie drzwi. Zasuwa klika, drzwi skrzypią i otwierają się, do środka wlewa się poranne światło.
   Robimy krok na ganek, widać ścieżkę w dół do jeziora, pomost, świerki i góry. Kamera płynnie odjeżdża
   za plecy bohatera – **bez cięcia**.
3. **Gra od razu:** sterujemy postacią z 3. osoby. **Wędka jest w ręce, robaki w ekwipunku** – nic nie trzeba
   zbierać. Do jeziora prowadzi ścieżka około **50 m** w dół zbocza.
4. Nad wodą: nabij robaka, zarzuć, branie, hol, ryba – **cała mechanika łowienia bez zmian**.

Klimat: odludne górskie jezioro (Tatry/Beskidy), wczesny letni poranek, mgiełka nad wodą, gęsty las świerkowy,
skaliste szczyty za jeziorem. Styl: stylizowany, ciepły, „malowany” – spójny z ekranem startowym i logo.

## 2. Co zostaje, co znika

**Zostaje bez zmian:** cały `src/fishing/` (rzut, spławik, brania, sygnalizacja brania, hol, hamulec, ryby, dziennik),
`src/player/Player.ts` i `CharacterAnimator.ts`, `src/render/`, woda (`waves.ts`, `Water.ts`), UI i HUD,
ekran startowy i logo, audio, debug, testy.

**Do usunięcia** (razem z konfiguracją, zdarzeniami i dźwiękami, których już nic nie używa):
- `src/cutscene/introScript.ts`, `src/cutscene/IntroCutscene.ts` (stara cutscenka garaż/auto). **`Timeline.ts` zostaje.**
- `src/assets/procedural/car.ts`, dom z garażem i stojak z `src/assets/procedural/props.ts`.
- W `World.ts`: `buildHouseArea`, `buildParking`, auto (`car`, `carCollider`, `placeCar`).
- W `terrainMath.ts`: `ROAD`, `parkingMask`, wypłaszczenia domu i parkingu.
- W `config.ts`: `world.parking*`, `world.house*`, sekcja `cutscene` (zastąpiona przez `intro`), niepotrzebne `prep`.
- W `Preparation.ts`: bagażnik i zbieranie wędki/robaków (`trunk`, `rod`, `worms`).
- W `Events.ts`/`GameAudio.ts`: `carDoor`, `engine`, `trunk` (zastąp dźwiękami drzwi chatki).
- W `PIVOTS`: `chassis`, `trunk_lid`, `trunk_slot_*`, `door_L`, `wheel_*`, `rack_slot`, `shelf_slot`.
- W README/sterowaniu: wzmianki o bagażniku i cutscence.

## 3. Nowa lokacja (układ poziomu)

Wzorzec: `reference/01-swiat/05-mapa.png` i `01-key-art.png`. Jeśli obrazów jeszcze nie ma – użyj opisu poniżej.

- **Jezioro:** zostaje w środku mapy (środek 0,0, obecny rozmiar około 120 × 80 m) z **mapą głębokości**
  (`lakeDepth`): płycizny przy brzegu, środek około 4 m, dołek z karpiami. Możesz zmienić kształt brzegu, ale
  zachowaj strefy:
  - **dwie płytkie zatoczki z trzcinami** (płoć, karaś),
  - **pomost** (okoń),
  - **głęboki środek i dołek > 2,5 m** (leszcz, karp),
  - NOWE: **skalisty cypelek** wchodzący w wodę (kamienie w wodzie),
  - NOWE: **zwalone drzewo** leżące w wodzie przy brzegu.
- **Struktury dla ryb:** uogólnij „odległość od pomostu” do „odległości od struktury” (pomost, zwalone drzewo,
  kamienie cypla), np. `World.structureDistance()`. Okoń ma brać przy każdej z nich. Zaktualizuj `species.ts`
  i testy (`tests/species.test.ts`), żeby dalej było to sprawdzane.
- **Chatka:** na polanie na łagodnym zboczu, drzwiami w stronę jeziora, około **50 m** (± 5 m) ścieżką od nasady
  pomostu, polana około 4–6 m wyżej niż lustro wody. Ganek z dwoma stopniami, ławka, stos drewna, latarnia,
  komin z dymem (proste cząsteczki).
- **Ścieżka:** udeptana ziemia około 1,5 m szerokości, lekko kręta, od ganku do pomostu. Teren wypłaszczony
  wzdłuż ścieżki (zastąp mechanizm `ROAD` nowym `PATH`).
- **Las:** gęste świerki (kilka wariantów wielkości) dookoła, brzozy i pojedyncza wierzba przy brzegu, krzaki,
  paprocie, kamienie z mchem, pniaki. Wolna polana przy chatce, korytarz ścieżki i brzeg bez drzew przy pomoście.
  Wszystko jako `InstancedMesh`.
- **Góry:** tło za jeziorem po przeciwnej stronie niż chatka, tak żeby z drzwi było widać
  „jezioro → pomost → góry”. Warstwy: zalesione zbocza bliżej, skaliste szczyty dalej, mgła atmosferyczna.
  Mogą to być siatki low-poly poza granicami gry albo panorama z `reference/01-swiat/09-panorama-gor.png`
  na cylindrze lub kopule tła.
- **Granice:** gracz nie wyjdzie poza polanę, las przy ścieżce i brzeg (niewidzialne granice jak dziś
  + gęstszy las jako granica wizualna). Nie wejdzie do wody głębiej niż po kostki.
- **Światło:** poranek; słońce nisko nad górami za jeziorem albo z boku, żeby na wodzie był odblask (dostrój do
  key artu). Paleta i mgła według `01-key-art.png`.

Wszystkie pozycje (chatka, ścieżka, cypel, zwalone drzewo, góry) jako liczby w `config.ts` → `world`.

## 4. Intro „otwierane drzwi” – specyfikacja

Nowy stan globalnej FSM: `BOOT → START_SCREEN → INTRO → GAMEPLAY ⇄ PAUSE` (INTRO zastępuje CUTSCENE).
Zbuduj na istniejącym `src/cutscene/Timeline.ts` (dane: ujęcia, akcje, fade). Nowe pliki np.
`src/cutscene/doorIntroScript.ts` + `src/cutscene/DoorIntro.ts`. Liczby w `config.ts` → `intro`.

Wnętrze chatki wystarczy **tylko przy drzwiach** (ściana z drzwiami, kawałek podłogi, wieszak, półka – według
`reference/01-swiat/07-chatka-wnetrze.png`), bo kamera patrzy tylko na drzwi.

Przebieg (czasy orientacyjne):

| t [s] | Co się dzieje |
|---|---|
| 0,0–0,6 | Rozjaśnienie z czerni. Ciemne wnętrze, światło przez szpary wokół drzwi. Kamera POV na wysokości oczu (około 1,65 m), około 1 m przed drzwiami. |
| 0,6–1,2 | Ręka wędkarza (osobna prosta siatka ręki w kadrze POV) sięga do zasuwy. |
| 1,2 | Klik zasuwy (dźwięk). |
| 1,2–2,6 | Drzwi otwierają się na zawiasie (pivot `door_front`) do około 100°, ease-out, skrzypnięcie. Ekspozycja spada z „oślepienia” do normy, bo oko przyzwyczaja się do światła. Ptaki i woda narastają. |
| 2,6–3,6 | Krok przez próg na ganek (lekkie bujanie głowy). Widok: ścieżka → pomost → jezioro → góry. |
| 3,6–4,8 | Kamera płynnie odjeżdża za plecy bohatera do pozycji kamery 3. osoby (`CameraRig.startBlend`). Postać, ukryta w trakcie POV, pojawia się zanim wejdzie w kadr. Postać stoi na ganku, przodem do jeziora, z wędką. |
| 4,8 | HUD się pojawia, gracz przejmuje sterowanie. |

- Pominięcie: przytrzymaj **Esc** 1 s (kółko postępu – jak dziś), od razu stan końcowy.
- Bez pasów letterbox (POV ma być immersyjne).
- Drzwi mogą zostać otwarte.
- Na końcu brak teleportu postaci i brak cięcia kamery.

## 5. Ekwipunek i cele

- Start: wędka w `hand_R` (`FishingController.attachRod`), `gear.hasWorms = true`, zestaw pod szczytówką.
- Robaki: nieograniczone w v2 (licznik możesz dodać później).
- Nowe cele w lewym górnym rogu (zastępują stare 6):
  1. „Zejdź nad jezioro” – spełniony, gdy `fishing.canCastHere` pierwszy raz jest prawdą.
  2. „Nabij robaka (przytrzymaj F)”.
  3. „Zarzuć”.
- Nabijanie robaka (F), komunikat „Najpierw nabij przynętę” i cała reszta zostają jak dziś.
- `InteractionSystem` zostaje (przyda się później), ale bez obiektów bagażnika.

## 6. Obrazy referencyjne – jak ich użyć

Szczegółowa lista plików: `reference/README.md`. Zasada: **bezpośrednio w grze** tylko tam, gdzie obraz 2D
naprawdę pasuje; resztę traktuj jako **wzorzec** kształtu, koloru i proporcji dla modeli.

| Obraz | Użycie |
|---|---|
| `01-swiat/01-key-art.png` | wzorzec kompozycji, palety, światła i mgły; `public/og-image.jpg` (podgląd linku) |
| `01-swiat/02,03-pov-drzwi-*.png` | wzorzec kadrów intro (pierwsza i ostatnia klatka) |
| `01-swiat/05-mapa.png` | wzorzec układu poziomu |
| `01-swiat/06-chatka-arkusz.png`, `07-chatka-wnetrze.png` | wzorzec modelu chatki i wnętrza przy drzwiach |
| `01-swiat/09-panorama-gor.png` | **bezpośrednio**: tło gór (cylinder/kopuła za jeziorem, bez oświetlenia, z mgłą) |
| `01-swiat/04, 08, 10` | wzorzec: gameplay, brzeg/pomost, woda |
| `02-postacie-i-obiekty/01,02-bohater-*.png` | wzorzec bohatera (strój: kapelusz, oliwkowa kamizelka, czerwona koszula w kratę, zielone kalosze) |
| `02-postacie-i-obiekty/03-sprzet.png` | wzorzec wędki, spławika, pudełka z robakami |
| `02-postacie-i-obiekty/04–08-*.png` (ryby) | **bezpośrednio**: ilustracje w „Kolekcji ryb” (ekran startowy) i na ekranie złowienia; wzorzec kolorów modeli ryb |
| `02-postacie-i-obiekty/09-drzewa.png`, `10-roslinnosc-kamienie.png` | wzorzec świerków, brzóz, krzaków, kamieni |
| `03-tekstury/*.png` | **bezpośrednio** jako tekstury (teren, ścieżka, piasek brzegu, dno, deski pomostu, bale chatki, gonty, skała, mech) – najpierw zrób z nich tekstury bezszwowe, jeśli nie są (np. skrypt z mieszaniem krawędzi), zmniejsz do 1024 px, zapisz w `public/textures/` |

Obrazy do wdrożenia kopiuj do `public/…` w zoptymalizowanej postaci (WebP/JPG, sensowne rozmiary).
Oryginały zostają w `reference/`.

**Modele 3D:** ChatGPT daje tylko obrazy. W v2 **zbuduj lepsze modele proceduralne** (chatka z bali z gontami,
gankiem i kominem; świerki warstwowe z opadającymi gałęziami; bohater w stroju z referencji) przez `AssetRegistry`.
Jeśli w `public/models/` pojawią się pliki `.glb` (np. z Meshy/Tripo), podepnij je przez `registry.loadGLB`
z fallbackiem na proceduralne. Tabela wymaganych pivotów jest w README.

## 7. Kamienie milowe

Po każdym: `npm test` i `npm run build` przechodzą, brak błędów w konsoli, zrzut ekranu (jeśli masz przeglądarkę),
krótkie podsumowanie, **commit**. Gra ma się uruchamiać po każdym kroku.

- **K0 – Rozpoznanie.** Przeczytaj `CLAUDE.md`, uruchom testy i build, obejrzyj `reference/`. Wypisz plan zmian plików.
- **K1 – Nowy przepływ bez nowej grafiki.** Usuń starą cutscenkę, auto, dom, drogę i parking. Dodaj stan INTRO
  (na razie natychmiastowy). Gracz startuje przy starym pomoście z wędką i robakami, nowe 3 cele. Łowienie działa.
- **K2 – Nowa lokacja (proceduralnie).** Chatka + polana, ścieżka około 50 m, przebudowany brzeg (zatoczki,
  cypel, zwalone drzewo), las świerkowy, góry w tle, granice, światło poranka. Struktury → `structureDistance`,
  testy zaktualizowane. Gracz startuje na ganku.
- **K3 – Intro „otwierane drzwi”.** Według tabeli z sekcji 4, z dźwiękami (zasuwa, skrzypienie, ptaki), pomijalne.
- **K4 – Obrazy w grze.** Tekstury z `03-tekstury`, panorama gór, ilustracje ryb w kolekcji i na ekranie złowienia,
  og-image, strojenie palety, mgły i światła pod key art.
- **K5 – Lepsze modele.** Chatka, bohater, świerki/brzozy/krzaki/kamienie, ryby – proceduralne według referencji
  (albo GLB, jeśli są). Pivoty jak w `PIVOTS`.
- **K6 – Szlif.** Wydajność (60 FPS, < 300 draw calli), README (sterowanie, przebieg, lokacja), `CLAUDE.md`
  zaktualizowany do nowej struktury, `CFG.bite.fastMode` zostaw `true` (autor sam wyłączy na finał).

## 8. Definicja „gotowe”

- Start → intro drzwi → gra z ekwipunkiem → zejście ścieżką → nabicie → rzut → branie → hol → ryba, w kółko,
  bez błędów w konsoli.
- Wszystkie 5 gatunków do złowienia w pasujących miejscach (płytko/trzciny, pomost/struktury, głęboko).
- Intro płynne, pomijalne, bez cięcia i teleportu na końcu.
- Kadr z drzwi i kadr z pomostu przypominają `01-key-art.png` pod względem kompozycji i klimatu.
- `npm test` i `npm run build` przechodzą; `CLAUDE.md` i README opisują nowy stan.
