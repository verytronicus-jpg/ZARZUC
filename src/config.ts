/**
 * ZARZUĆ – jedyne miejsce z liczbami do strojenia.
 * Jednostki: metry, kilogramy, sekundy, niutony (chyba że nazwa mówi inaczej: *Kgf, *Gf, *Deg, *Cm).
 * Obiekt jest mutowalny – panel lil-gui (F1) zmienia wartości na żywo.
 */

export const G = 9.81;
export const KGF = G; // 1 kgf w niutonach

export type SpeciesId = 'ploc' | 'okon' | 'karas' | 'leszcz' | 'karp';

export interface SpeciesConfig {
  id: SpeciesId;
  name: string;
  /** bazowa szansa (0..1) */
  chance: number;
  minCm: number;
  maxCm: number;
  /** W[g] = a * L[cm]^b */
  a: number;
  b: number;
  /** mnożnik siły w holu */
  strength: number;
  /** wykładnik rozkładu długości (>1 = przesunięcie w stronę małych) */
  lengthSkew: number;
  /** poniżej tej długości ryba może obskubać robaka */
  nibblerMaxCm: number;
  zone: {
    /** preferowany zakres głębokości [m] – poza nim dopasowanie spada do `outside` */
    depthMin: number;
    depthMax: number;
    /** szerokość rampy przejścia na granicach zakresu [m] */
    depthRamp: number;
    /** premia za bliskość trzcin i struktur (pomost, zwalone drzewo, kamienie cypla) */
    reedBonus: number;
    structureBonus: number;
    /** odległość [m], na której premia za strukturę spada do zera */
    structureRange: number;
    /** dopasowanie poza preferowaną głębokością */
    outside: number;
    /** dopasowanie w preferowanej głębokości (koncentracja ryb) */
    inside: number;
  };
  bite: {
    /** okno zacięcia [s] */
    window: number;
  };
  fight: {
    /** poziom siły poza zrywem (ułamek maks.) */
    cruise: number;
    /** poziom siły w zrywie */
    peak: number;
    surgeMin: number;
    surgeMax: number;
    /** przerwa między zrywami [s] */
    pauseMin: number;
    pauseMax: number;
    /** szarpanie łbem: amplituda (0..1) i częstotliwość [Hz] */
    headshake: number;
    headshakeHz: number;
    /** mnożnik oporu wody (leszcz płaski = duży) */
    dragMul: number;
    /** czas [s] ciągnięcia z pełną siłą do całkowitego zmęczenia */
    endurance: number;
    /** jak mocno ryba dąży do głębi (0..1) vs trzcin */
    seekDeep: number;
    seekReeds: number;
    /** skłonność do krążenia (karaś) */
    circling: number;
  };
}

export const CFG = {
  /** nazwa gry – zmiana tutaj podmienia napis na ekranie startowym i w tytule strony */
  game: {
    title: 'Zarzuć',
    domain: 'zarzuc.com',
    tagline: 'Spokojne jezioro. Niespokojne ryby.',
  },

  seed: 20260927,

  loop: {
    step: 1 / 60,
    maxFrame: 0.25,
    maxSubSteps: 10,
  },

  render: {
    /** ekspozycja tone mappingu renderera (podgląd spławika; obraz główny: CFG.post.exposure) */
    exposure: 0.78,
    /** bliska płaszczyzna kamery [m] – większa = dokładniejsza głębia w oddali (AO, refrakcja) */
    cameraNear: 0.1,
    cameraFar: 3000,
    /** maks. czas czekania na tekstury przed ekranem startowym [ms] */
    preloadTimeoutMs: 8000,
    /** dynamiczna rozdzielczość: przy wolnych klatkach renderujemy mniej pikseli (min. minScale), potem wracamy */
    dynamicRes: {
      enabled: true,
      /** docelowy czas klatki [ms] (60 FPS) */
      targetMs: 16.9,
      minScale: 0.6,
      step: 0.1,
      /** co ile sekund oceniać średni czas klatki */
      interval: 1.5,
      /** ile okien z rzędu „w celu”, zanim spróbujemy wyższej rozdzielczości */
      upWindows: 8,
      /** blokada podnoszenia po nieudanej próbie [s] */
      cooldown: 60,
      /** gdy nawet minScale nie wystarcza – przejście na preset „Niska” */
      autoLowPreset: true,
    },
    /** cienie roślinności i LOD drzew odświeżane co tyle metrów ruchu gracza (promienie w CFG.quality) */
    shadowProxyStep: 4,
  },

  /** słońce: nisko nad górami za jeziorem (północ = azymut 180°, wschód = 90°) */
  sun: {
    elevationDeg: 12,
    azimuthDeg: 150,
    intensity: 3.2,
    color: 0xffc38a,
    hemiSky: 0xbac6e4,
    hemiGround: 0x6a5a40,
    hemiIntensity: 0.75,
    /** mapa otoczenia z nieba (oświetlenie obrazem) */
    envIntensity: 0.4,
    /** ciepłe światło wypełniające od strony chatki (bez cieni) – malarskie doświetlenie frontów */
    fillColor: 0xffd2a8,
    fillIntensity: 0.5,
    fillAzimuthDeg: -20,
    fillElevationDeg: 25,
  },

  /** niebo i panorama gór (public/textures/panorama.jpg z scripts/prepare_images.py) */
  sky: {
    panoramaUrl: 'textures/panorama.jpg',
    /** łuk poziomy [°] zajmowany przez oryginalny obraz (reszta 360° to lustro bez słońca) */
    panoramaArcDeg: 150,
    /** proporcje oryginału (wysokość / szerokość) */
    panoramaAspect: 821 / 1916,
    /** ściśnięcie w pionie (góry niższe niż w proporcjach obrazu) */
    panoramaSquash: 1.5,
    /** położenie słońca na obrazie (u, v od lewego górnego rogu) */
    panoramaSunU: 0.535,
    panoramaSunV: 0.6456,
    /** górna część panoramy wtapia się w gradient */
    topFade: 0.14,
    zenith: 0x6d80bb,
    panoramaTop: 0x8a97c8,
    horizon: 0xf2b27a,
    bottom: 0xcfa88c,
    sunBoost: 3,
    brightness: 1.0,
  },

  world: {
    // ---------- jezioro: główna misa (tu się łowi) ----------
    /** półosie elipsy jeziora [m] (120 × 80), środek w (0,0); +z = południe (chatka), −z = północ (góry) */
    lakeRx: 60,
    lakeRz: 40,
    maxDepth: 4.2,
    /** zanikanie profilu głębokości (większe = łagodniej przy brzegu) */
    depthExponent: 1.3,
    /** jaka część promienia jest skarpą do maksymalnej głębi */
    depthSpan: 0.75,
    /** dołek (karpiowisko) – w zasięgu rzutu z końca pomostu */
    holeX: 10,
    holeZ: 5,
    holeRadius: 12,
    holeDepth: 0.8,
    /**
     * Kształt brzegu: wybrzuszenia (amount > 0 → zatoczka) i wcięcia (amount < 0 → cypel).
     * Kąt od środka jeziora: 0° = +x (wschód), 90° = +z (południe, pomost), −90° = północ.
     */
    shoreBumps: [
      { angleDeg: 52, amount: 0.17, widthDeg: 15 },
      { angleDeg: 172, amount: 0.15, widthDeg: 17 },
      { angleDeg: -14, amount: -0.34, widthDeg: 6.5 },
    ],
    /** łuki trzcin = dwie płytkie zatoczki (SE przy pomoście i zachodnia) */
    reedArcs: [
      { angleDeg: 52, halfWidthDeg: 21 },
      { angleDeg: 172, halfWidthDeg: 23 },
    ],
    /** spłycenie przy trzcinach (0..1) */
    reedShallowing: 0.72,
    /** skalisty cypel (środek pola kamieni w wodzie i na lądzie) */
    pointX: 42,
    pointZ: -7,
    pointRadius: 8,
    /** kamienie cypla (w wodzie i na brzegu) */
    pointRockCount: 34,
    /** podniesienie terenu cypla ponad lustro [m] */
    pointHeight: 1.3,
    /** zwalone drzewo: od korzeni (na lądzie) do czubka (w wodzie) */
    logX0: 63,
    logZ0: 5,
    logX1: 47,
    logZ1: 12,
    logRadius: 0.38,

    // ---------- przedłużenie jeziora na północ (tylko widok, w stronę gór) ----------
    farLakeX: -6,
    farLakeZ: -215,
    farLakeRx: 78,
    farLakeRz: 180,
    farLakeDepth: 5,
    /** miękkość połączenia misy z przedłużeniem (smooth-min) */
    lakeBlend: 0.14,
    /** zalesione wyspy / cyple w oddali (ląd w wodzie) */
    islands: [
      { x: -52, z: -118, r: 30 },
      { x: 40, z: -190, r: 20 },
      { x: -25, z: -300, r: 34 },
    ],

    // ---------- teren ----------
    bankHeight: 0.5,
    /** wznoszenie się terenu z odległością od brzegu d [m]: h = bank + a·d + b·d² */
    riseLinear: 0.1,
    riseQuad: 0.0006,
    /** pagórki (amplituda rośnie z odległością) */
    hillAmp: 0.9,
    hillAmpFar: 0.06,
    /** siatka terenu: gęsta w obszarze gry, rzadsza na zewnątrz (rośnie geometrycznie) */
    terrainStep: 1.0,
    terrainFineMinX: -115,
    terrainFineMaxX: 115,
    terrainFineMinZ: -70,
    terrainFineMaxZ: 140,
    terrainGrowth: 1.22,
    terrainMaxStep: 40,
    terrainExtent: 1100,

    // ---------- chatka i ścieżka ----------
    /** środek chatki (podstawa) i wysokość polany */
    cabinX: -20,
    cabinZ: 86,
    cabinGround: 5.2,
    /** polana: promień wypłaszczenia i przejścia [m] */
    clearingRadius: 10,
    clearingFade: 9,
    /** chatka: szerokość (front), głębokość, ganek */
    cabinWidth: 6.2,
    cabinDepth: 5.0,
    porchDepth: 2.6,
    floorHeight: 0.5,
    /** start gracza: odległość od ściany frontowej na ganku [m] */
    porchStartDepth: 1.05,
    /**
     * Ścieżka (punkty kontrolne, łamana wygładzana CatmullRom) od stopni ganku do nasady pomostu.
     * Pierwszy i ostatni punkt liczone z położenia chatki i pomostu.
     */
    pathPoints: [
      [-12.5, 74.5],
      [-6.5, 68],
      [-9, 60.5],
      [-3.5, 54],
      [-4.5, 47.5],
      [-0.5, 43.5],
    ] as Array<[number, number]>,
    pathWidth: 1.5,
    /** szerokość wypłaszczenia terenu w poprzek ścieżki [m] */
    pathFlatten: 3.2,
    /** płotek wzdłuż ścieżki: od–do [m drogi od ganku], odsunięcie w bok (ujemne = po prawej idąc w dół) */
    fenceStart: 12,
    fenceEnd: 34,
    fenceOffset: -1.35,
    /** duże głazy przy ścieżce (dx, dz względem stopni ganku, skala) */
    pathBoulders: [
      [-4.2, -7, 1.3],
      [3.8, -15, 1.0],
      [-4.6, -24, 1.5],
      [5.2, -33, 1.1],
      [-5.5, -40, 0.9],
    ] as Array<[number, number, number]>,

    // ---------- pomost ----------
    pierAngleDeg: 90,
    pierLengthWater: 12,
    pierLengthLand: 3,
    pierWidth: 2.2,
    pierDeckHeight: 0.45,
    /** łódka przy pomoście (przesunięcie od końca pomostu, zanurzenie) */
    boatOffsetX: 0.95,
    boatOffsetZ: 2.6,
    boatYawDeg: 6,
    boatDraft: 0.13,

    // ---------- roślinność ----------
    /** wierzba płacząca przy brzegu zachodniej zatoczki */
    willows: [[-63, 22]] as Array<[number, number]>,
    reedCount: 1200,
    cattailCount: 160,
    lilyCount: 90,
    spruceCount: 2400,
    spruceNearRadius: 88,
    pineCount: 40,
    birchCount: 26,
    bushCount: 260,
    fernCount: 360,
    rockCount: 90,
    stumpCount: 22,
    farTreeCount: 20000,

    // ---------- gracz ----------
    /** obszar, po którym chodzi gracz (wielokąt x,z); poza nim gęsty las */
    bounds: [
      [74, -26],
      [20, -30],
      [-40, -26],
      [-86, -12],
      [-88, 20],
      [-58, 46],
      [-36, 62],
      [-40, 84],
      [-32, 100],
      [-8, 100],
      [0, 84],
      [12, 60],
      [40, 52],
      [76, 26],
      [80, -6],
    ] as Array<[number, number]>,
    /** gracz nie wejdzie do wody głębszej niż to (po kostki) */
    maxWadeDepth: 0.25,
  },

  water: {
    level: 0,
    /** siatka wody: gęsta w misie (gridStep), rzadsza w przedłużeniu na północ */
    gridStep: 0.9,
    gridGrowth: 1.2,
    gridMaxStep: 12,
    fineMinX: -82,
    fineMaxX: 82,
    fineMinZ: -52,
    fineMaxZ: 52,
    extentX: 105,
    minZ: -420,
    maxZ: 60,
    waves: [
      { dirDeg: 20, wavelength: 7.5, amplitude: 0.028, steepness: 0.35 },
      { dirDeg: 65, wavelength: 4.4, amplitude: 0.018, steepness: 0.35 },
      { dirDeg: -15, wavelength: 2.7, amplitude: 0.011, steepness: 0.3 },
      { dirDeg: 110, wavelength: 1.6, amplitude: 0.006, steepness: 0.25 },
    ],
    /** kolor płycizny (rozproszenie przy małej grubości), głębi i rozproszenia w toni */
    shallowColor: 0x8fd6c4,
    deepColor: 0x145060,
    scatterColor: 0x1d6670,
    /** pochłanianie światła przez wodę [1/m] (r, g, b) – czerwień ginie najszybciej → turkus */
    absorb: [0.55, 0.19, 0.16] as [number, number, number],
    normalScale: 0.32,
    normalTiling: [0.085, 0.21] as [number, number],
    normalSpeed: 0.035,
    refractStrength: 0.035,
    reflectDistort: 0.004,
    /** mnożnik jasności odbić (panorama/planarne) */
    reflectStrength: 0.95,
    fresnelF0: 0.025,
    /** piana: grubość wody [m], przy której znika, siła */
    foamDepth: 0.09,
    foamStrength: 0.75,
    /** iskrzenie słońca na falach (wykładnik, siła HDR) */
    glitterPower: 700,
    glitterStrength: 14,
    /** widoczność ryby pod wodą: tempo zaniku koloru z głębokością [1/m] (woda sama też pochłania światło) */
    underwaterFade: 0.35,
    /** gęstość wody [kg/m³] */
    density: 1000,
  },

  player: {
    walkSpeed: 2.2,
    runSpeed: 5.0,
    accel: 12,
    decel: 16,
    turnRate: 10,
    gravity: G,
    radius: 0.35,
    maxStepUp: 0.45,
    stepLengthWalk: 0.75,
    stepLengthRun: 1.2,
  },

  camera: {
    fov: 60,
    distance: 4.6,
    minDistance: 0.8,
    height: 1.55,
    shoulder: 0.45,
    sensitivity: 0.0022,
    pitchMin: -0.9,
    pitchMax: 0.75,
    /** tempo sprężyny ramienia (dociąganie / oddalanie) */
    springIn: 25,
    springOut: 4,
    collisionPad: 0.35,
    baitZoomDistance: 2.4,
    fightDistance: 5.6,
    fightHeight: 2.2,
    shakeAmount: 0.06,
  },

  prep: {
    baitHoldTime: 1.5,
    /** jak długo lista celów zostaje na ekranie po wykonaniu wszystkich [s] */
    objectivesLinger: 4,
  },

  cast: {
    /** czas narastania paska siły 0→100% (potem spada) */
    chargeTime: 1.2,
    chargeTimeout: 10,
    spreadAbove: 0.9,
    spreadDeg: 8,
    vMin: 6,
    vMax: 20,
    angleDeg: 35,
    gravity: G,
    /** opór powietrza a = -k|v|v (dostrojone: maks. zasięg ~30 m) */
    airDragK: 0.016,
    swingTime: 0.14,
    flightTimeout: 6,
    /** zwis żyłki pod szczytówką gdy zestaw w ręce */
    hangLength: 0.7,
    /** kąt patrzenia w wodę wymagany do rzutu – dystans próbek [m] */
    lookSampleDist: 9,
    /** jak daleko od wody można stać, by zarzucić [m] */
    shoreReach: 3.5,
  },

  rig: {
    /** grunt: odległość spławik–haczyk */
    grunt: 1.2,
    /** spławik: korpus (cylinder) + antenka */
    bodyLength: 0.04,
    bodyRadius: 0.0058,
    antennaLength: 0.06,
    antennaRadius: 0.002,
    floatMassG: 1.5,
    shotMassG: 2.5,
    hookMassG: 0.3,
    addedMassG: 2.0,
    verticalDamping: 0.03,
    verticalQuadDamping: 0.6,
    horizontalDrag: 2.2,
    driftX: 0.012,
    driftZ: 0.006,
    /** czas opadania śruciny (losowo w zakresie) → spławik leży 0.5–1 s */
    settleMin: 0.5,
    settleMax: 1.0,
    standUpRate: 4,
    settleTimeout: 4,
    /** spławik przechylony gdy przynęta leży na dnie */
    lyingTilt: 0.62,
    maxSinkDepth: 0.6,
    rippleSpeedThreshold: 0.07,
  },

  rigVisual: {
    /** spławik/haczyk rysowane większe niż fizyczne, by były czytelne z 30 m */
    floatScale: 2.6,
    hookScale: 2.2,
  },

  line: {
    points: 40,
    iterations: 20,
    gravity: G,
    airDamping: 0.07,
    waterDamping: 0.3,
    /** wizualny luz: maks. długość = prosta · (1 + frac) + abs [m] (reszta luzu nie tworzy pętli) */
    visualSlackFrac: 0.06,
    visualSlackAbs: 0.35,
    /** przeskok szczytówki większy niż [m] (teleport) → żyłka układa się od nowa */
    resetJump: 4,
    /** wygląd: szerokość [px], podział krzywej, kolor */
    widthPx: 1.8,
    smoothSub: 3,
    waterBuoyancy: 0.85,
    /** wytrzymałość żyłki [kgf] (0,22 mm ≈ 5,5 kgf) */
    strengthKgf: 5.5,
    /** sztywność EA [N] – k_żyłki = EA / L */
    ea: 420,
    spoolCapacity: 100,
    /** zerwanie: T > wytrzymałość dłużej niż [s] */
    snapTime: 0.1,
    /** tłumienie c w T = k·s + c·ds/dt [N·s/m] */
    damping: 2.0,
  },

  rod: {
    length: 3.6,
    buttOffset: 0.35,
    tipSegments: 6,
    tipFraction: 0.42,
    /** sztywność wędki [N/m] (ugięcie = T / k_rod) */
    kRod: 55,
    /** wędka w górze: mnożnik sztywności i nacisku */
    upStiffnessMin: 0.75,
    upStiffnessMax: 1.45,
    upPressureMin: 0.8,
    upPressureMax: 1.35,
    bendSpring: 90,
    bendDamping: 9,
    maxBendRad: 1.5,
    /** kąty prowadzenia wędki */
    idlePitchDeg: 40,
    aimPitchDeg: 48,
    chargeBackPitchDeg: 118,
    waitPitchDeg: 18,
    fightPitchMinDeg: 12,
    fightPitchMaxDeg: 72,
    fightSideMaxDeg: 55,
    aimSensitivity: 0.0028,
  },

  reel: {
    /** zwijanie w holu [m/s] */
    speed: 1.2,
    /** zwijanie pustego zestawu (bez ryby) [m/s] i czas rozpędu korbki [s] */
    retrieveSpeed: 7,
    retrieveRamp: 0.15,
    dragDefaultKgf: 3,
    dragMinKgf: 0.5,
    dragMaxKgf: 6,
    dragStepKgf: 0.25,
    /** bezwładność szpuli: przyspieszenie oddawania żyłki [m/s²] i max prędkość */
    spoolAccel: 25,
    spoolMaxSpeed: 8,
    spoolFriction: 25,
    /** poniżej tej odległości poziomej zestaw wraca pod szczytówkę */
    retrieveDistance: 1.0,
    minLineAboveWater: 0.3,
  },

  bite: {
    /**
     * TRYB TESTOWY – szybkie brania (~3–5 s zamiast 10–40 s), żeby sprawnie testować całą pętlę.
     * Na wersję finalną: fastMode: false.
     */
    fastMode: true,
    fastMultiplier: 7,
    /** średni czas oczekiwania [s] przy typowym łowisku – ograniczony do [minWait, maxWait] */
    meanWait: 22,
    minWait: 10,
    maxWait: 40,
    /** narastanie intensywności (zapach przynęty) */
    rampTime: 5,
    rampStart: 0.25,
    lyingFloatFactor: 0.35,
    waitTimeout: 150,
    spookCooldown: 6,
    /** zacięcie podczas NIBBLE */
    earlyStrikeSpookChance: 0.35,
    /** przy skubaniu: zwijanie dłuższe niż [s] płoszy rybę (krótki klik nie) */
    reelSpookTime: 0.35,
    /** szansa zaczepienia na początku / końcu okna */
    hookChanceStart: 0.97,
    hookChanceEnd: 0.9,
    /** obskubanie robaka przez małe ryby (na każdy NIBBLE) */
    stealChance: 0.03,
    /** ryba odpuszcza po NIBBLE bez brania */
    abandonChance: 0.12,
    /** szarpnięcie myszą jako zacięcie: suma ruchu w dół [px] w oknie [ms] */
    jerkStrike: true,
    jerkPixels: 170,
    jerkWindowMs: 120,
    failStateTime: 2.2,
    escapedKeepBaitChance: 0.5,
  },

  fight: {
    substeps: 2,
    /** opór wody: c = dragCoef * W^(2/3) (kwadratowy) */
    dragCoef: 3.0,
    addedMass: 0.5,
    minMass: 0.06,
    /** regeneracja wytrzymałości przy T≈0 [1/s] */
    regen: 0.025,
    regenTensionBelow: 0.6,
    /** żyłka luźna dłużej niż… → szansa spięcia na sekundę */
    slackTime: 2.5,
    slackEscapePerSec: 0.2,
    /** mnożnik zmęczenia, gdy wędka prowadzona przeciwnie do ucieczki */
    oppositeRodFatigue: 2,
    sideSteer: 0.6,
    /** wskaźnik zmęczenia – niedokładność */
    fatigueNoise: 0.15,
    tiredThreshold: 0.02,
    recoverThreshold: 0.12,
    surfaceDepthTired: 0.06,
    fightTimeout: 600,
    headingTurnRate: 1.8,
    wanderStrength: 0.6,
    /** ryba unika płycizny */
    minDepth: 0.25,
    splashChancePerSec: 0.9,
  },

  landing: {
    /** odległość pozioma szczytówka→ryba */
    maxDistance: 3.2,
    maxStamina: 0.28,
    liftTime: 1.1,
  },

  ui: {
    tensionYellow: 0.7,
    tensionRed: 0.9,
    messageTime: 2.6,
  },

  /** intro „otwierane drzwi” (stan INTRO globalnej FSM) – czasy [s] i położenia kamery POV [m] */
  intro: {
    fadeIn: 0.6,
    reachStart: 0.6,
    latchAt: 1.2,
    doorOpenStart: 1.25,
    doorOpenEnd: 2.6,
    doorAngleDeg: 100,
    /** ręka trzyma drzwi przez tyle sekund od początku otwierania, potem puszcza */
    handRelease: 0.85,
    /** adaptacja oka do światła [s] */
    adaptTime: 1.6,
    stepStart: 2.6,
    handoff: 3.6,
    hudAt: 4.8,
    /** czas płynnego przejścia kamery do widoku 3. osoby [s] */
    blendTime: 1.2,
    /** przytrzymanie Esc do pominięcia [s] */
    skipHoldTime: 1.0,
    /** kamera POV: wysokość oczu nad podłogą, odległość od drzwi, przesunięcie w bok (− = w stronę klamki) */
    eyeHeight: 1.65,
    startBack: 2.0,
    startSide: -0.25,
    leanIn: 1.25,
    pullBack: 0.35,
    pullSide: -0.45,
    /** gdzie kończy się krok na ganku (od przedniej krawędzi ganku) */
    porchEdge: 0.45,
    fov: 68,
    headBob: 0.035,
    /** światło: wnętrze ciemne (mnożnik otoczenia i ekspozycji), „oślepienie” po otwarciu */
    ambientInside: 0.3,
    exposureInside: 1.7,
    exposureFlash: 2.4,
    /** głośność natury wewnątrz (0..1) */
    ambienceInside: 0.25,
    /** szpary w drzwiach (światło z zewnątrz) */
    gapColor: 0xffc070,
    gapIntensity: 5,
    gapWidth: 0.02,
    /** lampa we wnętrzu (światło punktowe) */
    lampColor: 0xffa860,
    lampIntensity: 5,
    lampDistance: 6,
    /** kamera gracza po intro */
    endPitch: 0.36,
    /** postać staje się widoczna, gdy kamera odjedzie od głowy na tyle [m] */
    revealDistance: 0.6,
  },

  /** presety jakości grafiki (Opcje → Jakość grafiki) */
  quality: {
    current: 'high' as 'high' | 'low',
    high: {
      /** maks. liczba pikseli renderu (reszta skalowana przez przeglądarkę) */
      pixelBudget: 2.6e6,
      pixelRatioMax: 1.5,
      msaa: 4,
      ao: true,
      rays: true,
      reflection: true,
      reflectionScale: 0.5,
      refractScale: 0.75,
      shadowMapSize: 2048,
      shadowFar: 110,
      shadowRadius: 3,
      shadowProxyRadius: 50,
      /** bliskie świerki w pełnym modelu tylko w tym promieniu [m], dalej lżejszy */
      treeLodRadius: 45,
      grassDensity: 1,
      grassRadius: 34,
    },
    low: {
      pixelBudget: 1.2e6,
      pixelRatioMax: 1,
      msaa: 0,
      ao: false,
      rays: false,
      reflection: false,
      reflectionScale: 0.35,
      refractScale: 0.5,
      shadowMapSize: 1024,
      shadowFar: 60,
      shadowRadius: 2,
      shadowProxyRadius: 40,
      treeLodRadius: 28,
      grassDensity: 0.45,
      grassRadius: 24,
    },
  },

  /** post-processing: mgła, mgiełka nad wodą, bloom, AO, promienie słońca, grading „ciepły poranek” */
  post: {
    exposure: 0.82,
    fogColor: 0xb0b4b8,
    fogSunColor: 0xffc48a,
    fogDensity: 0.0006,
    fogHeight: 0,
    fogFalloff: 0.012,
    fogStart: 45,
    mistColor: 0xeedcd0,
    mistDensity: 0.42,
    mistHeight: 1.7,
    mistNoise: 0.85,
    mistNear: 22,
    bloomThreshold: 1.1,
    bloomKnee: 0.6,
    bloomStrength: 0.22,
    aoRadius: 0.9,
    aoIntensity: 1.1,
    aoStrength: 0.65,
    raysStrength: 0.4,
    raysDecay: 0.965,
    raysDensity: 0.95,
    raysThreshold: 0.8,
    /** lift/gamma/gain (liniowo, r g b) */
    lift: [0.025, 0.018, 0.03] as [number, number, number],
    gamma: [1.0, 1.0, 0.97] as [number, number, number],
    gain: [1.02, 1.0, 0.96] as [number, number, number],
    /** podział tonów (0,5 = neutralnie): cienie chłodne, światła ciepłe */
    shadowTint: 0x7383a0,
    highlightTint: 0xf0bc90,
    splitTone: 0.07,
    saturation: 1.02,
    contrast: 1.05,
    vignette: 0.3,
    grain: 0.012,
  },

  /** trawa na wietrze (kępki źdźbeł wokół gracza) */
  grass: {
    clumpsPerM2: 3.2,
    bladesPerClump: 5,
    /** segmenty źdźbła (2 = 4 trójkąty) */
    segments: 2,
    height: 0.38,
    width: 0.042,
    maxInstances: 20000,
    /** co ile metrów ruchu gracza odświeżać zestaw kępek (wybór z takim zapasem promienia) */
    refreshStep: 5,
    /** jak mocno przerzedzać trawę na skraju pola (0 = wcale, 1 = do zera) */
    edgeThinning: 0.6,
    colorBase: 0x3a5a1c,
    colorMid: 0x6a8f2e,
    colorTip: 0xc2bb62,
    sway: 0.16,
    gust: 0.38,
    windDirX: 0.8,
    windDirZ: 0.6,
  },

  /** tekstury terenu: gęstość kafelków [1/m] i przejście w kolor wierzchołków w oddali */
  terrainTex: {
    grassTiling: 0.22,
    forestTiling: 0.2,
    pathTiling: 0.33,
    sandTiling: 0.35,
    bedTiling: 0.28,
    rockTiling: 0.22,
    fadeStart: 140,
    fadeEnd: 320,
    centerX: -5,
    centerZ: 30,
    /** udział koloru wierzchołka (odcienie) w teksturowanym albedo */
    tint: 0.6,
    /** pas mokrego brzegu nad linią wody [m] */
    wetAbove: 0.18,
  },

  /** dym z komina chatki */
  smoke: {
    count: 36,
    lifetime: 9,
    rise: 9,
    size: 1.6,
    opacity: 0.32,
    color: 0xe8ddd2,
    driftX: 0.6,
    driftZ: 0.35,
  },

  audio: {
    master: 0.8,
    ambient: 0.35,
    sfx: 0.9,
  },

  debug: {
    timeScale: 1,
    /** tylko do testów automatycznych: pomija render sceny (logika działa szybciej w SwiftShaderze) */
    skipRender: false,
  },

  species: [
    {
      id: 'ploc', name: 'Płoć', chance: 0.35, minCm: 12, maxCm: 32, a: 0.0103, b: 3.08, strength: 1.0,
      lengthSkew: 2.2, nibblerMaxCm: 18,
      zone: { depthMin: 0.4, depthMax: 2.6, depthRamp: 0.8, reedBonus: 0.15, structureBonus: 0.1, structureRange: 10, outside: 0.45, inside: 1 },
      bite: { window: 0.9 },
      fight: { cruise: 0.5, peak: 1.0, surgeMin: 1.0, surgeMax: 1.6, pauseMin: 1.5, pauseMax: 3.5, headshake: 0.15, headshakeHz: 5, dragMul: 0.8, endurance: 7, seekDeep: 0.3, seekReeds: 0.4, circling: 0.2 },
    },
    {
      id: 'okon', name: 'Okoń', chance: 0.25, minCm: 12, maxCm: 38, a: 0.0089, b: 3.13, strength: 1.2,
      lengthSkew: 2.0, nibblerMaxCm: 17,
      zone: { depthMin: 0.8, depthMax: 3.5, depthRamp: 0.8, reedBonus: 1.0, structureBonus: 1.3, structureRange: 11, outside: 0.45, inside: 1 },
      bite: { window: 1.2 },
      fight: { cruise: 0.45, peak: 1.0, surgeMin: 1.0, surgeMax: 1.5, pauseMin: 1.2, pauseMax: 2.8, headshake: 0.45, headshakeHz: 7, dragMul: 0.9, endurance: 9, seekDeep: 0.5, seekReeds: 0.6, circling: 0.15 },
    },
    {
      id: 'karas', name: 'Karaś', chance: 0.2, minCm: 10, maxCm: 30, a: 0.02, b: 3.0, strength: 0.9,
      lengthSkew: 1.8, nibblerMaxCm: 16,
      zone: { depthMin: 0.2, depthMax: 1.9, depthRamp: 0.6, reedBonus: 1.6, structureBonus: 0.1, structureRange: 14, outside: 0.15, inside: 1 },
      bite: { window: 1.4 },
      fight: { cruise: 0.5, peak: 0.9, surgeMin: 1.0, surgeMax: 2.0, pauseMin: 2.5, pauseMax: 5.0, headshake: 0.2, headshakeHz: 3, dragMul: 1.1, endurance: 11, seekDeep: 0.2, seekReeds: 0.9, circling: 0.8 },
    },
    {
      id: 'leszcz', name: 'Leszcz', chance: 0.13, minCm: 25, maxCm: 60, a: 0.0086, b: 3.13, strength: 0.8,
      lengthSkew: 1.9, nibblerMaxCm: 0,
      zone: { depthMin: 2.5, depthMax: 6, depthRamp: 0.7, reedBonus: 0, structureBonus: 0, structureRange: 8, outside: 0.06, inside: 1.5 },
      bite: { window: 1.6 },
      fight: { cruise: 0.62, peak: 0.78, surgeMin: 1.0, surgeMax: 2.0, pauseMin: 8, pauseMax: 16, headshake: 0.05, headshakeHz: 2, dragMul: 2.4, endurance: 13, seekDeep: 1.0, seekReeds: 0, circling: 0.1 },
    },
    {
      id: 'karp', name: 'Karp', chance: 0.07, minCm: 35, maxCm: 80, a: 0.013, b: 3.05, strength: 1.6,
      lengthSkew: 1.7, nibblerMaxCm: 0,
      zone: { depthMin: 2.5, depthMax: 6, depthRamp: 0.7, reedBonus: 0.3, structureBonus: 0, structureRange: 12, outside: 0.04, inside: 1.5 },
      bite: { window: 1.9 },
      fight: { cruise: 0.4, peak: 1.0, surgeMin: 2.0, surgeMax: 3.0, pauseMin: 3.0, pauseMax: 7.0, headshake: 0.12, headshakeHz: 2.5, dragMul: 1.0, endurance: 26, seekDeep: 0.7, seekReeds: 0.7, circling: 0.2 },
    },
  ] as SpeciesConfig[],
};

export function speciesById(id: SpeciesId): SpeciesConfig {
  const s = CFG.species.find((x) => x.id === id);
  if (!s) throw new Error(`Nieznany gatunek: ${id}`);
  return s;
}
