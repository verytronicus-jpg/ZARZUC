# ZARZUĆ – prompt: przebudowa grafiki (MVP → wersja finalna)

> Wklej całość jako zadanie dla agenta programistycznego pracującego na tym repozytorium.
> Część „0. Decyzje” to kontekst dla Ciebie – agent też ją przeczyta, więc zostaw.

---

## 0. Decyzje (dlaczego tak, a nie inaczej)

**Sam kod nie wystarczy.** Proceduralne bryły z Three.js zawsze będą wyglądać jak MVP. Kod świetnie robi
oświetlenie, wodę, post-processing, trawę i wiatr – ale postaci, auta, domu i drzew nie wyrzeźbi.

**Sam Blender od zera to miesiące.** Modelowanie, UV, tekstury, rig i animacje postaci to osobny zawód.

**Wybór: hybryda.**
1. **Gotowe assety (CC0 / licencja na gry)** jako baza: drzewa, krzaki, kamienie, dom, auto, rekwizyty.
2. **Blender tylko do dopasowania**: skala, pivoty, łączenie, poprawki materiałów, eksport GLB, animacje wędki.
3. **Kod** do wszystkiego, co robi „wow” w silniku: woda, światło, mgła, post-processing, trawa, wiatr, IK rąk.

**Kierunek artystyczny: stylizowany, ciepły, „ilustracyjny”** – spójny z ekranem startowym i logo (Lilita One,
zachód słońca, drewniane deski). Nie fotorealizm (nie do utrzymania w przeglądarce i gryzie się z brandem).
Punkty odniesienia klimatu: *A Short Hike*, *Dredge* (tylko światło i mgła), *Firewatch* (paleta, kolory nieba),
*Alba: A Wildlife Adventure*. Czyste kształty, bogate światło, dużo drobnego życia w scenie.

**Gdzie szukać assetów (sprawdź licencję każdego pliku i wpisz go do `CREDITS.md`):**

| Źródło | Co | Licencja |
|---|---|---|
| Quaternius (quaternius.com) | stylizowana przyroda, postacie z rigiem i animacjami, pojazdy | CC0 |
| Kenney (kenney.nl) | rekwizyty, pojazdy, natura | CC0 |
| Poly Haven (polyhaven.com) | HDRI nieba, tekstury terenu/drewna, część modeli | CC0 |
| ambientCG | tekstury PBR (trawa, ziemia, piasek, deski) | CC0 |
| Poly Pizza | modele low-poly | mieszana (CC0 / CC-BY – podpisz autora) |
| Mixamo (Adobe) | animacje postaci (idle, chód, bieg, podnoszenie, sięganie; sprawdź też animacje wędkarskie) | darmowe do gier, konto Adobe |
| Synty POLYGON (płatne) | spójne paczki natury/miasta/postaci | płatna – **sprawdź warunki dla gier webowych**, bo pliki GLB da się wyciągnąć z przeglądarki |
| Generatory 3D z AI | szybkie rekwizyty (pudełko z robakami, wiadro) | zależnie od narzędzia; zwykle wymagają poprawy topologii – nie dla bohatera |

**Bohater** to najważniejszy asset. Rekomendacja: postać z rigiem humanoidalnym (Quaternius albo płatna paczka),
przebrana w Blenderze na wędkarza (kapelusz, kamizelka z kieszeniami, kalosze), animacje z Mixamo
+ własne w Blenderze tam, gdzie Mixamo nie ma (zamach wędką, hol, nabijanie robaka).

---

## 1. Zadanie

Przebuduj warstwę wizualną gry **Zarzuć** (Three.js + TypeScript + Vite) z poziomu MVP do jakości finalnej.
**Nie zmieniaj logiki rozgrywki ani fizyki** – maszyny stanów, model napięcia, spławik, brania, hol, testy
w `tests/` mają dalej przechodzić. Zmieniasz: modele, materiały, oświetlenie, wodę, teren, roślinność,
post-processing, animacje postaci, efekty, UI w grze.

Zanim zaczniesz: przeczytaj `README.md`, `src/config.ts`, `src/assets/AssetRegistry.ts` (tabela `PIVOTS`),
`src/world/`, `src/render/`, `src/player/CharacterAnimator.ts`.

## 2. Zasady nienaruszalne

- **Podmiana modeli wyłącznie przez `AssetRegistry`** (`loadGLB`). Każdy GLB musi mieć pivoty/kości o nazwach
  z `PIVOTS` (`hand_R`, `hand_L`, `rod_tip`, `rod_seg_0..5`, `reel`, `trunk_lid`, `door_L`, `wheel_*`, `mouth` …).
  Brak pivota = czytelny błąd, nie cicha awaria.
- **Woda: wysokość fal na CPU i GPU musi być identyczna** (`src/world/waves.ts`). Nowy shader może dodać
  normal mapy, odbicia, pianę – ale przemieszczenie wierzchołków zostaje wspólną funkcją Gerstnera.
- **Wszystkie nowe liczby do `config.ts`** (sekcja `visual`), widoczne w panelu F1.
- **Wydajność: 60 FPS na średnim laptopie** (zintegrowana grafika klasy Iris Xe / Apple M1) na presecie „Wysoka”,
  stabilne 60 na „Niska”. Budżet: < 300 draw calli, < 1,5 mln trójkątów w kadrze, tekstury łącznie < 60 MB w GPU.
- **Presety jakości** (menu ma już przełącznik „Jakość grafiki”): Niska / Wysoka – rozdzielczość, cienie,
  post-processing, gęstość trawy, odbicia.
- **Po każdym kroku gra ma się uruchamiać**, `npm test` i `npm run build` przechodzą, brak błędów w konsoli.
- **Licencje**: każdy zewnętrzny plik wpisz do `CREDITS.md` (autor, źródło, licencja, link).

## 3. Pipeline assetów

- Folder `public/models/`, `public/textures/`, `public/hdri/`.
- Skrypt `npm run assets` (gltf-transform): kompresja geometrii (meshopt lub Draco), tekstury do **KTX2/Basis**,
  deduplikacja, przycinanie. Loader w grze: `GLTFLoader` + `MeshoptDecoder` + `KTX2Loader`.
- Konwencje eksportu z Blendera (dopisz do README): 1 j. = 1 m, glTF „+Y Up”, przód modelu = −Y w Blenderze
  (+Z w grze), origin postaci między stopami, zastosowane transformacje, materiały Principled BSDF.
- Ekran ładowania (już jest na ekranie startowym) podpięty do **prawdziwego** postępu ładowania assetów.
- Fallback: jeśli GLB się nie załaduje, gra używa obecnych modeli proceduralnych i loguje ostrzeżenie.

## 4. Kamienie milowe (po każdym krótko podsumuj zmiany i zrób zrzuty przed/po)

**V1 – Światło i kolor (największy efekt najmniejszym kosztem)**
- Oświetlenie oparte na obrazie: HDRI poranka (Poly Haven) przez PMREM jako `scene.environment`;
  niebo spójne z HDRI (Sky albo sama kopuła HDRI + tarcza słońca z poświatą).
- Cienie kaskadowe (`CSM` z three/addons) zamiast jednego pudełka cienia; miękkie krawędzie.
- Post-processing (`pmndrs/postprocessing`): SMAA, ambient occlusion (N8AO lub SSAO), bloom na słońcu
  i odblaskach wody, grading kolorów przez LUT (ciepły poranek), winieta, delikatna aberracja tylko w cutscence,
  głębia ostrości w cutscence i na ekranie złowienia.
- Mgła wysokościowa + poranna mgiełka nad wodą (miękkie płaszczyzny/cząsteczki przy tafli, zanikające w słońcu).
- Promienie słońca (god rays) przez drzewa – tylko preset „Wysoka”.

**V2 – Woda**
- Tafla: odbicia (planarne `Reflector` na „Wysoka”, SSR-lite lub cubemapa na „Niska”), refrakcja dna
  przez bufor głębi, kolor zależny od głębokości (mapa głębokości już istnieje), przewijane normal mapy
  (2 warstwy), iskrzenie słońca, piana przy brzegu i wokół pali pomostu (z różnicy głębokości).
- Kaustyki na dnie przy brzegu, zarośnięte dno (wodorosty instancjonowane) w płyciznach.
- Kręgi od spławika i ryb jako dynamiczna mapa zaburzeń (render target) zamiast pierścieni-siatek.
- Pod wodą ryba widoczna coraz słabiej (zachowaj obecny zanik z głębokością).

**V3 – Teren i roślinność**
- Teren: splatting 4 warstw (trawa, ziemia, piasek, muł) z teksturami PBR, maska z wysokości/nachylenia/
  mapy głębokości; tekstury detalu z bliska; droga i parking z koleinami i żwirem.
- Trawa GPU: instancjonowane źdźbła (nie kępki-płaszczyzny), wiatr w shaderze, uginanie się pod graczem,
  LOD/zanik z odległością, gęsto przy brzegu.
- Drzewa: gotowe modele (sosny, brzozy, olchy, wierzby nad wodą) z wiatrem w shaderze (kolory wierzchołków jako
  maski wagi), imposter/billboard dla dalekich; krzaki, paprocie, pałki wodne, trzciny z kiściami, grążele
  i lilie wodne, powalony pień przy brzegu, kamienie z mchem.
- Życie: ważki nad trzciną, ptaki (klucz na niebie + czapla przy trzcinach), wyskoki ryb na tafli, ćmy/pyłki
  w świetle, komary przy trzcinach o świcie.

**V4 – Bohater**
- Postać GLB z rigiem, wędkarz (kapelusz, kamizelka, kalosze), twarz z prostą mimiką (mruganie).
- `AnimationMixer` + maszyna stanów animacji: idle (kilka wariantów), chód, bieg, start/stop, skręt w miejscu,
  sięganie do bagażnika, branie przedmiotu, nabijanie robaka (pętla), celowanie, zamach i rzut (zsynchronizowany
  z `CHARGING`/`CASTING`), czekanie (siedzenie/kucanie przy dłuższym czekaniu), zacięcie, hol (warianty lewo/prawo/
  góra sterowane blend space z `rodSide`/`rodUp`), wyciągnięcie ryby, pokazanie ryby do kamery.
- **IK dwukostne** rąk: prawa dłoń trzyma rękojeść, lewa kręci korbką kołowrotka podczas zwijania;
  głowa patrzy na spławik / rybę (look-at z limitami).
- Kroki zsynchronizowane z animacją (zdarzenia animacji → dźwięk), ślady/rozbryzgi na płyciźnie.
- Zachowaj nazwy kości z `PIVOTS` albo zrób mapę nazw w jednym miejscu.

**V5 – Rekwizyty i sprzęt**
- Wędka: blank z przelotkami, korkowa rękojeść, kołowrotek z obracającym się kabłąkiem i korbką; szczytówka dalej
  jako łańcuch 6 segmentów (fizyka ugięcia bez zmian). Żyłka: cienka linia z antyaliasingiem (Line2/MeshLine),
  lekko widoczna pod światło.
- Spławik, śrucina, haczyk, robak (animowany, wijący się) – czytelne z bliska w podglądzie spławika.
- Auto (kombi z bagażnikiem na zawiasie, wnętrze bagażnika z matą), dom z garażem i ogródkiem, stojak na wędki,
  pudełko z robakami, wiadro, podbierak, krzesełko wędkarskie na pomoście.
- Ryby: 5 gatunków jako modele z teksturą (łuski, płetwy półprzezroczyste, połysk), pływanie w shaderze
  jak teraz; na ekranie złowienia ryba szarpie się w dłoni i kapie z niej woda.

**V6 – Cutscenka i kamera**
- Te same ujęcia, ale z nowymi modelami i animacjami (zdjęcie wędki ze stojaka, niesienie, bagażnik, jazda z
  bujaniem zawieszenia, parkowanie). Głębia ostrości, flara słońca, lekkie drganie „z ręki”.
- Kamera w grze: łagodny dynamiczny FOV przy biegu, subtelne podążanie za bohaterem, ujęcie „dramatyczne”
  przy dużej rybie (zoom + spowolnienie 0,5 s przy wyskoku).

**V7 – UI w grze spójne z ekranem startowym**
- HUD w stylu ekranu startowego (Lilita One + Nunito, drewniane panele, spławik jako wskaźnik).
- Pasek napięcia jako „żyłka” z kolorem i drganiem, hamulec jako tarcza kołowrotka, siła ryby jako ikona.
- Ekran złowienia: karta „trofeum” z ilustracją gatunku, łacińską nazwą, rekordem i konfetti z kropli wody.

**V8 – Szlif i wydajność**
- Profil na dwóch presetach, LOD-y, occlusion przez mgłę, pooling cząsteczek, kompresja tekstur.
- Zrzuty porównawcze przed/po dla 6 kadrów: ekran startowy → cutscenka (garaż) → parking → pomost o świcie →
  hol karpia → ekran złowienia.

## 5. Definicja „gotowe”

- Każdy z 6 kadrów wygląda jak ze zwiastuna gry indie, a nie jak demo silnika.
- Bohater ma płynne, zsynchronizowane animacje dla każdego stanu łowienia; dłonie trzymają wędkę (IK).
- 60 FPS na średnim laptopie (preset Wysoka), brak błędów w konsoli, testy i build przechodzą.
- `CREDITS.md` kompletne, README opisuje pipeline assetów i presety jakości.

---

### Jak z tym pracować (dla Ciebie)

1. Zacznij od **V1** – samo światło, HDRI i post-processing zmienią odbiór całej gry najbardziej.
2. Równolegle wybierz **bohatera** (to decyzja artystyczna – obejrzyj 3–4 kandydatów, zanim agent zacznie V4).
3. Rób kamienie milowe po kolei i oglądaj zrzuty przed/po; łatwo przesadzić z efektami – bloom i mgła mają
   podkreślać poranek, a nie go zasłaniać.
4. Szybkie brania do testów: `CFG.bite.fastMode` w `src/config.ts` (na finał ustaw `false`).
