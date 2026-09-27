# Prompt startowy dla sesji Claude Code

Wklej poniższy tekst jako pierwszą wiadomość w sesji Claude Code otwartej na tym repozytorium.

---

```
Pracujesz w repozytorium gry przeglądarkowej „Zarzuć” (zarzuc.com) – gra wędkarska 3D w Three.js + TypeScript + Vite, cała fizyka napisana ręcznie. Gra działa (wersja MVP v0.2): ekran startowy z animowanym logo, łowienie ze spławikiem, 5 gatunków ryb, hol z modelem napięcia żyłki, dziennik połowów, testy Vitest.

ZADANIE: przebudowa gry na nowy koncept „Chatka nad jeziorem”. Wycinamy starą cutscenkę (garaż → auto → parking). Po „Zacznij łowić” jest krótkie intro z oczu wędkarza: otwiera drzwi swojej drewnianej chatki, wychodzi na ganek, kamera płynnie odjeżdża za jego plecy i gracz od razu steruje postacią z 3. osoby – z wędką i robakami w ekwipunku. Chatka stoi około 50 m od górskiego jeziora, prowadzi do niego ścieżka do pomostu; dookoła świerki i góry. Mechanika łowienia zostaje bez zmian.

Zanim cokolwiek zmienisz:
1. Przeczytaj CLAUDE.md (mapa repozytorium, jak działa gra, zasady nienaruszalne, debugowanie).
2. Przeczytaj docs/ZADANIE-v2-chatka.md – pełna specyfikacja: co zostaje, co usunąć, układ lokacji, intro „otwierane drzwi” krok po kroku, ekwipunek i cele, użycie obrazów, kamienie milowe K0–K6, definicja „gotowe”.
3. Obejrzyj obrazy w reference/ (opis w reference/README.md). To wygenerowane w ChatGPT wzorce stylu, lokacji, chatki, bohatera, ryb, roślinności i tekstury. Część wchodzi do gry bezpośrednio (tekstury, panorama gór, ilustracje ryb), reszta to wzorzec dla modeli. Jeśli jakiegoś obrazu brakuje, pracuj według opisu w specyfikacji.
4. Uruchom npm install, npm test i npm run build, żeby potwierdzić punkt wyjścia.

Sposób pracy:
- Realizuj kamienie milowe K1 → K6 po kolei. Po każdym: npm test i npm run build przechodzą, brak błędów w konsoli, gra się uruchamia, zrzut ekranu jeśli masz przeglądarkę (instrukcja w CLAUDE.md, sekcja 6), krótkie podsumowanie po polsku, osobny commit.
- Nie zmieniaj zachowania łowienia (src/fishing/) poza tym, co wymaga specyfikacja (uogólnienie „odległości od pomostu” do „odległości od struktury”). Wszystkie nowe liczby do src/config.ts. Teksty w grze po polsku.
- Jeśli coś w specyfikacji jest niejasne albo sprzeczne z kodem, wybierz rozsądne rozwiązanie, zapisz decyzję w podsumowaniu i jedź dalej. Zatrzymaj się i zapytaj tylko przy decyzjach nieodwracalnych.
- Na końcu zaktualizuj README.md i CLAUDE.md do nowego stanu gry.

Zacznij od K0 (rozpoznanie + plan zmian plików), pokaż mi plan w kilku punktach i przejdź od razu do K1.
```
