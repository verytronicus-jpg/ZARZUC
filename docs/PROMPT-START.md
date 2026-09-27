# Prompt startowy dla sesji Claude Code

Wklej poniższy tekst jako pierwszą wiadomość w sesji Claude Code otwartej na tym repozytorium.

```
Pracujesz w repozytorium gry przeglądarkowej „Zarzuć” (zarzuc.com) – gra wędkarska 3D w Three.js + TypeScript + Vite, cała fizyka napisana ręcznie. Obecna wersja (MVP v0.2) działa: ekran startowy z animowanym logo, łowienie ze spławikiem, 5 gatunków ryb z własnymi wzorami brań, hol z modelem napięcia żyłki i hamulcem, dziennik połowów, 45 testów Vitest. Mechanika jest dobra – grafika i koncept wstępu są do wymiany.

CEL: zbudować pełną wersję gry w nowym koncepcie „Chatka nad jeziorem” i z grafiką na poziomie obrazów referencyjnych.

Nowy koncept:
- Po „Zacznij łowić” (ekran startowy zostaje) jest krótkie intro z oczu bohatera: ciemne wnętrze drewnianej chatki, ręka na zasuwie, drzwi skrzypią i się otwierają, wlewa się złote poranne światło, krok na ganek, widok na ścieżkę, pomost, jezioro i góry. Kamera płynnie odjeżdża za plecy bohatera – bez cięcia – i gracz od razu steruje z 3. osoby.
- Bohater ma od startu wędkę w ręce i robaki. Cele: zejdź nad jezioro → nabij robaka → zarzuć.
- Lokacja: chatka z bali na polanie około 50 m od górskiego jeziora, ścieżka w dół do pomostu z łódką, gęsty las świerkowy, dwie zatoczki z trzcinami, skalisty cypel, zwalone drzewo w wodzie, poszarpane szczyty Tatr za jeziorem, wschód słońca, mgła nad wodą, krystaliczna turkusowa woda z widocznymi kamieniami przy brzegu.
- Stara cutscenka (garaż → auto → parking), auto, dom przy drodze i bagażnik – do usunięcia.
- Łowienie (src/fishing/) działa dalej tak jak teraz.

Grafika: celem jest wygląd z obrazów w reference/ – stylizowana, ciepła, „malowana” gra 3D w złotym porannym świetle. Obowiązkowo:
- światło i niebo pod key art, miękkie cienie, post-processing (AO, bloom, grading w ciepły poranek), mgła atmosferyczna i mgiełka nad wodą,
- woda: odbicia gór i drzew, przejrzystość zależna od głębokości (dno i kamienie widoczne przy brzegu), piana przy brzegu, odblask słońca – z zachowaniem wspólnej funkcji fal CPU/GPU,
- panorama gór z reference/01-swiat/09-panorama-gor jako tło,
- tekstury terenu, ścieżki, pomostu, bali i gontów (z reference/03-tekstury, jeśli są; inaczej proceduralne w kolorach key artu),
- modele według arkuszy: chatka (06-chatka-arkusz), wnętrze przy drzwiach (07), świerki/sosna/brzoza/wierzba (09-drzewa), krzaki, paprocie, trzciny, pałki, grążele, kamienie z mchem, zwalony pień, pniaki (10-roslinnosc-kamienie), sprzęt (03-sprzet), 5 ryb według ilustracji 04–08,
- BOHATER według reference/02-postacie-i-obiekty/01-bohater-arkusz, 01b-bohater-detale i 02-bohater-pozy: młody wędkarz w rdzawej czapce beanie, kremowym T-shircie, granatowo-morskich ogrodniczkach z musztardowymi szelkami, z saszetką przy pasie, brelokiem ze spławikiem i w kaloszach. Animacje (chód, bieg, zamach, hol, ryba w dłoniach, nabijanie robaka) według póz z 02-bohater-pozy. Starszy wędkarz z kadrów 01-swiat/04* jest nieaktualny.
- ilustracje ryb (z wyciętym szarym tłem) w „Kolekcji ryb” i na ekranie złowienia,
- presety jakości Wysoka/Niska, 60 FPS na średnim laptopie, < 300 draw calli.
Modele buduj w kodzie (proceduralnie, jak najbliżej arkuszy) przez AssetRegistry; jeśli w public/models/ pojawią się pliki .glb, podepnij je z fallbackiem na proceduralne.

Zanim cokolwiek zmienisz:
1. Przeczytaj CLAUDE.md (mapa repozytorium, jak działa gra, zasady nienaruszalne, debugowanie).
2. Przeczytaj docs/ZADANIE-v2-chatka.md (pełna specyfikacja: co usunąć, układ lokacji, intro sekunda po sekundzie, ekwipunek, użycie każdego obrazu, kamienie milowe K0–K6) oraz docs/PROMPT-grafika.md (etapy V1–V8 podnoszenia grafiki – V1–V3 wchodzą w K4).
3. Obejrzyj wszystkie obrazy w reference/ (opis w reference/README.md).
4. Uruchom npm install, npm test i npm run build.

Sposób pracy:
- Kamienie milowe K1 → K6 po kolei. Po każdym: npm test i npm run build przechodzą, brak błędów w konsoli, gra się uruchamia, zrzut ekranu porównany z odpowiednim obrazem z reference/ (instrukcja zrzutów w CLAUDE.md, sekcja 6), krótkie podsumowanie po polsku, osobny commit.
- Nie zmieniaj zachowania łowienia poza tym, czego wymaga specyfikacja. Wszystkie nowe liczby do src/config.ts. Teksty w grze po polsku.
- Niejasności rozstrzygaj sam rozsądnie i zapisuj decyzje w podsumowaniu; pytaj tylko przy decyzjach nieodwracalnych.
- Na końcu zaktualizuj README.md i CLAUDE.md do nowego stanu gry.

Zacznij od K0: pokaż plan zmian w kilku punktach i od razu przejdź do K1.
```
