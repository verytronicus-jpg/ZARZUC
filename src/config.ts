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
    /** premia za bliskość struktury (trzciny / pomost) */
    reedBonus: number;
    pierBonus: number;
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
    pixelRatioMax: 1.75,
    exposure: 0.72,
    shadowMapSize: 2048,
    shadowBox: 40,
    fogColor: 0xd4c6ae,
    fogNear: 60,
    fogFar: 290,
  },

  sun: {
    elevationDeg: 10,
    azimuthDeg: 115,
    intensity: 3.4,
    color: 0xffd2a0,
    hemiSky: 0xbcd3ec,
    hemiGround: 0x5a5140,
    hemiIntensity: 1.5,
    turbidity: 4,
    rayleigh: 1.6,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.86,
  },

  world: {
    /** półosie elipsy jeziora [m] (120 × 80) */
    lakeRx: 60,
    lakeRz: 40,
    maxDepth: 4.2,
    /** zanikanie profilu głębokości (większe = łagodniej przy brzegu) */
    depthExponent: 1.3,
    /** jaka część promienia jest skarpą do maksymalnej głębi */
    depthSpan: 0.75,
    /** dołek (karpiowisko) */
    holeX: 16,
    holeZ: -6,
    holeRadius: 14,
    holeDepth: 0.7,
    /** łuki trzcin (kąt od środka jeziora; 90° = +z = południe, pomost) */
    reedArcs: [
      { angleDeg: 180, halfWidthDeg: 30 },
      { angleDeg: -55, halfWidthDeg: 18 },
    ],
    /** spłycenie przy trzcinach (0..1) */
    reedShallowing: 0.62,
    reedCount: 1400,
    treeCount: 150,
    rockCount: 60,
    bankHeight: 0.55,
    terrainStep: 1.6,
    terrainMinX: -170,
    terrainMaxX: 170,
    terrainMinZ: -150,
    terrainMaxZ: 230,
    /** granice mapy dla gracza (elipsa) */
    boundsCx: 0,
    boundsCz: 12,
    boundsRx: 92,
    boundsRz: 78,
    /** gracz nie wejdzie do wody głębszej niż to */
    maxWadeDepth: 0.25,
    pierAngleDeg: 80,
    pierLengthWater: 12,
    pierLengthLand: 3,
    pierWidth: 2.2,
    pierDeckHeight: 0.45,
    /** start gracza (K1: przy nasadzie pomostu), yaw 0 = +Z */
    startX: 10.3,
    startZ: 44.5,
    startYaw: Math.PI,
  },

  water: {
    level: 0,
    gridStep: 0.9,
    margin: 14,
    waves: [
      { dirDeg: 20, wavelength: 7.5, amplitude: 0.028, steepness: 0.35 },
      { dirDeg: 65, wavelength: 4.4, amplitude: 0.018, steepness: 0.35 },
      { dirDeg: -15, wavelength: 2.7, amplitude: 0.011, steepness: 0.3 },
      { dirDeg: 110, wavelength: 1.6, amplitude: 0.006, steepness: 0.25 },
    ],
    shallowColor: 0x5f8a6e,
    deepColor: 0x163a3f,
    /** maks. głębokość w teksturze mapy głębokości */
    depthTexMax: 5,
    depthTexSize: 256,
    /** widoczność pod wodą: tempo zaniku koloru z głębokością [1/m] */
    underwaterFade: 0.9,
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
    height: 1.8,
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
    followLag: 12,
  },

  interaction: {
    range: 2,
    coneDeg: 70,
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
    iterations: 10,
    gravity: G,
    airDamping: 0.02,
    waterDamping: 0.22,
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
    speed: 0.8,
    /** zwijanie pustego zestawu (bez ryby) [m/s] i czas rozpędu korbki [s] */
    retrieveSpeed: 3.2,
    retrieveRamp: 0.5,
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
    noBaitFactor: 0,
    waitTimeout: 150,
    spookCooldown: 6,
    /** zacięcie podczas NIBBLE */
    earlyStrikeSpookChance: 0.6,
    /** szansa zaczepienia na początku / końcu okna */
    hookChanceStart: 0.95,
    hookChanceEnd: 0.85,
    /** obskubanie robaka przez małe ryby (na każdy NIBBLE) */
    stealChance: 0.05,
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
    slackTime: 1.5,
    slackEscapePerSec: 0.35,
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
    maxDistance: 2.5,
    maxStamina: 0.2,
    liftTime: 1.1,
  },

  ui: {
    tensionYellow: 0.7,
    tensionRed: 0.9,
    messageTime: 2.6,
  },

  /** intro „otwierane drzwi” (stan INTRO globalnej FSM) */
  intro: {
    /** czas płynnego przejścia kamery do widoku 3. osoby [s] */
    blendTime: 1.2,
    /** przytrzymanie Esc do pominięcia [s] */
    skipHoldTime: 1.0,
    /** pitch kamery gracza po intro [rad] */
    endPitch: 0.22,
  },

  audio: {
    master: 0.8,
    ambient: 0.35,
    sfx: 0.9,
  },

  debug: {
    timeScale: 1,
  },

  species: [
    {
      id: 'ploc', name: 'Płoć', chance: 0.35, minCm: 12, maxCm: 32, a: 0.0103, b: 3.08, strength: 1.0,
      lengthSkew: 2.2, nibblerMaxCm: 18,
      zone: { depthMin: 0.4, depthMax: 2.6, depthRamp: 0.8, reedBonus: 0.15, pierBonus: 0.1, structureRange: 10, outside: 0.45, inside: 1 },
      bite: { window: 0.5 },
      fight: { cruise: 0.5, peak: 1.0, surgeMin: 1.0, surgeMax: 1.6, pauseMin: 1.5, pauseMax: 3.5, headshake: 0.15, headshakeHz: 5, dragMul: 0.8, endurance: 7, seekDeep: 0.3, seekReeds: 0.4, circling: 0.2 },
    },
    {
      id: 'okon', name: 'Okoń', chance: 0.25, minCm: 12, maxCm: 38, a: 0.0089, b: 3.13, strength: 1.2,
      lengthSkew: 2.0, nibblerMaxCm: 17,
      zone: { depthMin: 0.8, depthMax: 3.5, depthRamp: 0.8, reedBonus: 1.0, pierBonus: 1.3, structureRange: 11, outside: 0.45, inside: 1 },
      bite: { window: 0.8 },
      fight: { cruise: 0.45, peak: 1.0, surgeMin: 1.0, surgeMax: 1.5, pauseMin: 1.2, pauseMax: 2.8, headshake: 0.45, headshakeHz: 7, dragMul: 0.9, endurance: 9, seekDeep: 0.5, seekReeds: 0.6, circling: 0.15 },
    },
    {
      id: 'karas', name: 'Karaś', chance: 0.2, minCm: 10, maxCm: 30, a: 0.02, b: 3.0, strength: 0.9,
      lengthSkew: 1.8, nibblerMaxCm: 16,
      zone: { depthMin: 0.2, depthMax: 1.9, depthRamp: 0.6, reedBonus: 1.6, pierBonus: 0.1, structureRange: 14, outside: 0.15, inside: 1 },
      bite: { window: 1.0 },
      fight: { cruise: 0.5, peak: 0.9, surgeMin: 1.0, surgeMax: 2.0, pauseMin: 2.5, pauseMax: 5.0, headshake: 0.2, headshakeHz: 3, dragMul: 1.1, endurance: 11, seekDeep: 0.2, seekReeds: 0.9, circling: 0.8 },
    },
    {
      id: 'leszcz', name: 'Leszcz', chance: 0.13, minCm: 25, maxCm: 60, a: 0.0086, b: 3.13, strength: 0.8,
      lengthSkew: 1.9, nibblerMaxCm: 0,
      zone: { depthMin: 2.5, depthMax: 6, depthRamp: 0.7, reedBonus: 0, pierBonus: 0, structureRange: 8, outside: 0.06, inside: 1.5 },
      bite: { window: 1.2 },
      fight: { cruise: 0.62, peak: 0.78, surgeMin: 1.0, surgeMax: 2.0, pauseMin: 8, pauseMax: 16, headshake: 0.05, headshakeHz: 2, dragMul: 2.4, endurance: 13, seekDeep: 1.0, seekReeds: 0, circling: 0.1 },
    },
    {
      id: 'karp', name: 'Karp', chance: 0.07, minCm: 35, maxCm: 80, a: 0.013, b: 3.05, strength: 1.6,
      lengthSkew: 1.7, nibblerMaxCm: 0,
      zone: { depthMin: 2.5, depthMax: 6, depthRamp: 0.7, reedBonus: 0.3, pierBonus: 0, structureRange: 12, outside: 0.04, inside: 1.5 },
      bite: { window: 1.5 },
      fight: { cruise: 0.4, peak: 1.0, surgeMin: 2.0, surgeMax: 3.0, pauseMin: 3.0, pauseMax: 7.0, headshake: 0.12, headshakeHz: 2.5, dragMul: 1.0, endurance: 26, seekDeep: 0.7, seekReeds: 0.7, circling: 0.2 },
    },
  ] as SpeciesConfig[],
};

export type Config = typeof CFG;

export function speciesById(id: SpeciesId): SpeciesConfig {
  const s = CFG.species.find((x) => x.id === id);
  if (!s) throw new Error(`Nieznany gatunek: ${id}`);
  return s;
}
