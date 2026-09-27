"""
Przygotowanie obrazów z reference/ do gry (public/…). Uruchom z katalogu repo:
    python3 scripts/prepare_images.py            # wszystko
    python3 scripts/prepare_images.py panorama   # tylko wybrane: panorama | fish | og | textures
Wymaga: Pillow, numpy (pip install pillow numpy). Oryginały zostają w reference/.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / 'reference'
PUB = ROOT / 'public'


def save_jpg(img: Image.Image, path: Path, q=86):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert('RGB').save(path, 'JPEG', quality=q, optimize=True, progressive=True)
    print(f'  {path.relative_to(ROOT)}  {img.size[0]}×{img.size[1]}  {path.stat().st_size // 1024} KB')


# ---------------------------------------------------------------------------
# panorama gór: 09-panorama-gor → 360° (oryginał + lustro bez słońca)
# ---------------------------------------------------------------------------
PANO_ARC_DEG = 150  # musi się zgadzać z CFG.sky.panoramaArcDeg
PANO_SUN = (0.535, 0.6456)  # położenie słońca na obrazie (u, v)


def remove_sun(a: np.ndarray, cx: float, cy: float, r: float, shift: float) -> np.ndarray:
    """Zasłania słońce łatą z innego fragmentu obrazu (ta sama wysokość, przesunięta w poziomie), miękka maska."""
    h, w, _ = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.hypot(xx - cx, (yy - cy) * 1.3)
    k = np.clip(1 - (d - r * 0.55) / (r * 0.45), 0, 1)[..., None]
    src = np.roll(a, -int(shift), axis=1)
    return a * (1 - k) + src * k


def panorama():
    src = Image.open(REF / '01-swiat' / '09-panorama-gor.jpg').convert('RGB')
    w0, h0 = src.size
    total_w = 4096
    a_w = round(total_w * PANO_ARC_DEG / 360)
    b_w = total_w - a_w
    scale = a_w / w0
    h = round(h0 * scale)
    a = src.resize((a_w, h), Image.LANCZOS)
    arr = np.asarray(src).astype(np.float32)
    sx, sy = PANO_SUN[0] * w0, PANO_SUN[1] * h0
    nosun = remove_sun(arr, sx, sy, r=260, shift=-430)
    mirror = Image.fromarray(np.clip(nosun, 0, 255).astype(np.uint8)).transpose(Image.FLIP_LEFT_RIGHT)
    # delikatne rozmycie tylnej części (mniej widoczne powtórzenie)
    mirror = mirror.filter(ImageFilter.GaussianBlur(1.2)).resize((b_w, h), Image.LANCZOS)
    out = Image.new('RGB', (total_w, h))
    out.paste(a, (0, 0))
    out.paste(mirror, (a_w, 0))
    save_jpg(out, PUB / 'textures' / 'panorama.jpg', q=88)


# ---------------------------------------------------------------------------
# tekstury proceduralne (bezszwowe) w kolorach key artu – gdy reference/03-tekstury jest puste
# ---------------------------------------------------------------------------
RNG = np.random.default_rng(20260927)


def fft_noise(n: int, beta: float, seed: int) -> np.ndarray:
    """Szum fraktalny 1/f^beta z losowymi fazami – z natury bezszwowy (okresowy)."""
    r = np.random.default_rng(seed)
    fx = np.fft.fftfreq(n)[:, None]
    fy = np.fft.fftfreq(n)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = f ** (-beta)
    amp[0, 0] = 0
    ph = r.uniform(0, 2 * np.pi, (n, n))
    img = np.real(np.fft.ifft2(amp * np.exp(1j * ph)))
    img = (img - img.min()) / (img.max() - img.min())
    return img


def worley(n: int, count: int, seed: int, jitter_size=(1.0, 1.0)) -> tuple:
    """Komórki Voronoi z zawijaniem krawędzi: (odległość do najbliższego, do drugiego, id komórki)."""
    r = np.random.default_rng(seed)
    pts = r.uniform(0, n, (count, 2))
    sz = r.uniform(*jitter_size, count)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    d1 = np.full((n, n), 1e9, np.float32)
    d2 = np.full((n, n), 1e9, np.float32)
    ids = np.zeros((n, n), np.int32)
    for i, (px, py) in enumerate(pts):
        dx = np.abs(xx - px)
        dx = np.minimum(dx, n - dx)
        dy = np.abs(yy - py)
        dy = np.minimum(dy, n - dy)
        d = np.sqrt(dx * dx + dy * dy) / sz[i]
        closer = d < d1
        d2 = np.where(closer, d1, np.minimum(d2, d))
        ids = np.where(closer, i, ids)
        d1 = np.where(closer, d, d1)
    return d1, d2, ids


def colorize(t: np.ndarray, stops) -> np.ndarray:
    """Mapa kolorów: t (0..1) → RGB z listy (pozycja, (r,g,b))."""
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,), np.float32)
    for (p0, c0), (p1, c1) in zip(stops[:-1], stops[1:]):
        m = (t >= p0) & (t <= p1)
        k = ((t - p0) / max(p1 - p0, 1e-6))[..., None]
        out = np.where(m[..., None], np.array(c0) * (1 - k) + np.array(c1) * k, out)
    return out


def strokes(n: int, count: int, seed: int, length=(6, 18), width=(1, 3), angle=None, colors=None, base=None, alpha=0.5):
    """Pociągnięcia pędzla (bezszwowe: rysowane na płótnie 3×3 i przycinane)."""
    from PIL import ImageDraw
    r = np.random.default_rng(seed)
    big = Image.fromarray((np.clip(base, 0, 1) * 255).astype(np.uint8)) if base is not None else Image.new('RGB', (n, n))
    big = Image.fromarray(np.tile(np.asarray(big), (3, 3, 1)))
    layer = Image.new('RGBA', big.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(count):
        x, y = r.uniform(n, 2 * n, 2)
        a = r.uniform(0, np.pi) if angle is None else angle + r.normal(0, 0.35)
        L = r.uniform(*length)
        w = int(r.uniform(*width))
        c = colors[r.integers(0, len(colors))]
        col = tuple(int(v * 255) for v in c) + (int(255 * alpha * r.uniform(0.6, 1.0)),)
        x2, y2 = x + np.cos(a) * L, y - np.sin(a) * L
        for ox in (-n, 0, n):
            for oy in (-n, 0, n):
                d.line([(x + ox, y + oy), (x2 + ox, y2 + oy)], fill=col, width=w)
    big = Image.alpha_composite(big.convert('RGBA'), layer).convert('RGB')
    return np.asarray(big.crop((n, n, 2 * n, 2 * n))).astype(np.float32) / 255


def save_tex(a: np.ndarray, name: str, q=88):
    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    save_jpg(img, PUB / 'textures' / name, q=q)


def tex_grass(n=512):
    macro = fft_noise(n, 1.6, 1)
    fine = fft_noise(n, 0.9, 2)
    base = colorize(macro * 0.7 + fine * 0.3, [(0, (0.33, 0.42, 0.14)), (0.5, (0.52, 0.58, 0.2)), (0.8, (0.7, 0.66, 0.26)), (1, (0.78, 0.7, 0.33))])
    a = strokes(n, 2600, 3, length=(5, 14), width=(1, 3), angle=np.pi / 2,
                colors=[(0.28, 0.38, 0.12), (0.6, 0.64, 0.22), (0.8, 0.74, 0.34), (0.42, 0.5, 0.16)], base=base, alpha=0.55)
    return a


def tex_forest(n=512):
    macro = fft_noise(n, 1.5, 11)
    base = colorize(macro, [(0, (0.2, 0.16, 0.08)), (0.45, (0.32, 0.25, 0.13)), (0.7, (0.36, 0.36, 0.16)), (1, (0.42, 0.44, 0.18))])
    a = strokes(n, 3500, 12, length=(4, 10), width=(1, 2), colors=[(0.5, 0.34, 0.16), (0.24, 0.18, 0.1), (0.62, 0.44, 0.22)], base=base, alpha=0.6)
    moss = fft_noise(n, 1.8, 13)
    m = np.clip((moss - 0.6) * 4, 0, 1)[..., None]
    return a * (1 - m * 0.6) + np.array([0.3, 0.4, 0.14]) * m * 0.6


def pebbles(n, count, seed, stone_cols, gap_col, size=(1.0, 1.0), relief=0.5, roundness=1.0):
    """Zaokrąglone kamienie: Voronoi → mapa wysokości (kopułki) → cieniowanie światłem z lewej-góry."""
    d1, d2, ids = worley(n, count, seed, size)
    cell = n / np.sqrt(count)
    edge = np.clip((d2 - d1) / (cell * 0.5), 0, 1)
    h = np.sin(np.clip(edge * 1.5, 0, 1) * np.pi / 2) ** (0.6 * roundness)
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    k = cell * 0.35
    nx, ny, nz = -gx * k, -gy * k, np.ones_like(h)
    L = np.sqrt(nx * nx + ny * ny + nz * nz)
    light = np.array([-0.5, -0.6, 0.62])
    light /= np.linalg.norm(light)
    lam = np.clip((nx * light[0] + ny * light[1] + nz * light[2]) / L, 0, 1)
    r = np.random.default_rng(seed + 1)
    cols = np.array(stone_cols)[r.integers(0, len(stone_cols), ids.max() + 1)]
    tone = r.uniform(0.82, 1.12, ids.max() + 1)
    c = cols[ids] * tone[ids][..., None]
    grain = fft_noise(n, 0.8, seed + 2)[..., None]
    c = c * (0.9 + 0.2 * grain)
    shade = (1 - relief) + relief * (lam * 1.25)
    c = c * shade[..., None]
    gap = np.clip(1 - h * 4, 0, 1)[..., None]
    return c * (1 - gap) + np.array(gap_col) * gap


def tex_path(n=512):
    macro = fft_noise(n, 1.4, 21)
    fine = fft_noise(n, 0.8, 25)
    base = colorize(macro * 0.75 + fine * 0.25, [(0, (0.48, 0.38, 0.26)), (0.5, (0.6, 0.49, 0.34)), (1, (0.72, 0.61, 0.45))])
    peb = pebbles(n, 700, 22, [(0.66, 0.6, 0.5), (0.54, 0.48, 0.4), (0.74, 0.68, 0.58)], (0.46, 0.34, 0.2), relief=0.45)
    mask = np.clip((fft_noise(n, 1.1, 23) - 0.58) * 6, 0, 1)[..., None] * (fft_noise(n, 0.5, 26) > 0.35)[..., None]
    a = base * (1 - mask) + peb * mask
    return strokes(n, 700, 24, length=(3, 8), width=(1, 2), colors=[(0.46, 0.32, 0.18), (0.8, 0.66, 0.44)], base=a, alpha=0.35)


def tex_sand(n=512):
    macro = fft_noise(n, 1.3, 31)
    base = colorize(macro, [(0, (0.62, 0.54, 0.4)), (1, (0.8, 0.72, 0.56))])
    peb = pebbles(n, 1400, 32, [(0.7, 0.66, 0.58), (0.58, 0.54, 0.48), (0.78, 0.72, 0.62), (0.52, 0.48, 0.42)], (0.52, 0.46, 0.36), relief=0.4)
    m = np.clip((fft_noise(n, 1.1, 33) - 0.4) * 4, 0, 1)[..., None]
    return base * (1 - m) + peb * m


def tex_bed(n=512):
    """Dno jeziora: zaokrąglone kamienie (widoczne przez krystaliczną wodę jak na 08-brzeg-pomost)."""
    a = pebbles(n, 60, 41, [(0.66, 0.62, 0.52), (0.54, 0.54, 0.46), (0.74, 0.68, 0.54), (0.48, 0.5, 0.42), (0.62, 0.56, 0.44)], (0.26, 0.28, 0.2), relief=0.6)
    small = pebbles(n, 600, 43, [(0.6, 0.58, 0.5), (0.5, 0.5, 0.44)], (0.3, 0.3, 0.24), relief=0.4)
    d1, d2, _ = worley(n, 60, 41)
    gapmask = np.clip(1 - (d2 - d1) / (n / np.sqrt(60) * 0.12), 0, 1)[..., None]
    a = a * (1 - gapmask) + small * gapmask
    algae = fft_noise(n, 1.6, 42)
    m = np.clip((algae - 0.55) * 3, 0, 1)[..., None]
    return a * (1 - m * 0.4) + np.array([0.32, 0.4, 0.22]) * m * 0.4


def tex_rock(n=512):
    macro = fft_noise(n, 1.7, 51)
    fine = fft_noise(n, 0.8, 52)
    base = colorize(macro * 0.8 + fine * 0.2, [(0, (0.4, 0.38, 0.34)), (0.5, (0.58, 0.55, 0.49)), (1, (0.72, 0.68, 0.6))])
    d1, d2, _ = worley(n, 26, 53)
    crack = np.clip(1 - (d2 - d1) / 3.0, 0, 1)[..., None]
    a = base * (1 - crack * 0.45)
    lichen = fft_noise(n, 1.4, 54)
    m = np.clip((lichen - 0.62) * 4, 0, 1)[..., None]
    return a * (1 - m * 0.5) + np.array([0.46, 0.5, 0.24]) * m * 0.5


def tex_wood(n=512):
    """Szczegół drewna (szary, mnożony przez kolor wierzchołka): słoje wzdłuż osi Y tekstury."""
    x = np.linspace(0, 1, n, endpoint=False)
    warp = fft_noise(n, 1.8, 61) * 0.25
    grain = 0.5 + 0.5 * np.sin((x[None, :] * 26 + warp * 6) * 2 * np.pi)
    fine = fft_noise(n, 0.7, 62)
    stretch = np.asarray(Image.fromarray((fine * 255).astype(np.uint8)).resize((n // 8, n)).resize((n, n))).astype(np.float32) / 255
    v = 0.78 + 0.14 * grain + 0.16 * (stretch - 0.5)
    return np.repeat(v[..., None], 3, axis=2)


def tex_bark(n=512):
    d1, d2, _ = worley(n, 90, 71)
    ridges = np.clip((d2 - d1) / (n / np.sqrt(90) * 0.4), 0, 1)
    stretch = np.asarray(Image.fromarray((ridges * 255).astype(np.uint8)).resize((n, n // 4)).resize((n, n), Image.BICUBIC)).astype(np.float32) / 255
    fine = fft_noise(n, 0.9, 72)
    v = 0.6 + 0.32 * stretch + 0.12 * (fine - 0.5)
    return np.repeat(v[..., None], 3, axis=2)


def tex_water_normal(n=512):
    h = fft_noise(n, 1.9, 81) * 0.7 + fft_noise(n, 1.3, 82) * 0.3
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * n * 0.02
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * n * 0.02
    nz = np.ones_like(h)
    L = np.sqrt(gx * gx + gy * gy + nz * nz)
    nm = np.stack([-gx / L, -gy / L, nz / L], -1) * 0.5 + 0.5
    img = Image.fromarray((nm * 255).astype(np.uint8))
    path = PUB / 'textures' / 'water_normal.png'
    img.save(path, optimize=True)
    print(f'  {path.relative_to(ROOT)}  {n}×{n}  {path.stat().st_size // 1024} KB')


def tex_noise(n=256):
    """RGBA: 4 niezależne kanały szumu (piana, mgiełka, wariacje)."""
    ch = [fft_noise(n, b, s) for b, s in ((1.2, 91), (1.6, 92), (0.9, 93), (2.0, 94))]
    a = np.stack(ch, -1)
    img = Image.fromarray((a * 255).astype(np.uint8), 'RGBA')
    path = PUB / 'textures' / 'noise.png'
    img.save(path, optimize=True)
    print(f'  {path.relative_to(ROOT)}  {n}×{n}  {path.stat().st_size // 1024} KB')


def textures():
    ref = REF / '03-tekstury'
    # jeśli autor dorzuci tekstury z ChatGPT – zmniejsz i użyj ich zamiast proceduralnych
    mapping = {'01-trawa': 'grass.jpg', '02-sciolka-lesna': 'forest.jpg', '03-sciezka': 'path.jpg', '04-piasek-brzeg': 'sand.jpg',
               '05-dno-jeziora': 'bed.jpg', '09-skala': 'rock.jpg'}
    gen = {'grass.jpg': tex_grass, 'forest.jpg': tex_forest, 'path.jpg': tex_path, 'sand.jpg': tex_sand, 'bed.jpg': tex_bed,
           'rock.jpg': tex_rock, 'wood.jpg': tex_wood, 'bark.jpg': tex_bark}
    for stem, name in mapping.items():
        found = [p for p in ref.glob(stem + '.*') if p.suffix.lower() in ('.jpg', '.jpeg', '.png')]
        if found:
            img = Image.open(found[0]).convert('RGB').resize((1024, 1024), Image.LANCZOS)
            save_jpg(img, PUB / 'textures' / name)
            gen.pop(name, None)
    for name, fn in gen.items():
        save_tex(fn(), name)
    tex_water_normal()
    tex_noise()


# ---------------------------------------------------------------------------
# ilustracje ryb: wycięcie jednolitego szarego tła (zalewanie od krawędzi obrazu) → WebP z przezroczystością
# ---------------------------------------------------------------------------
FISH = {'ploc': '04-ploc', 'okon': '05-okon', 'karas': '06-karas', 'leszcz': '07-leszcz', 'karp': '08-karp'}


def cutout(img: Image.Image, tol=26.0, soft=10.0) -> Image.Image:
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    # kolor tła: mediana brzegów obrazu
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    diff = np.sqrt(((a - bg) ** 2).sum(-1))
    # zalewanie od krawędzi po pikselach podobnych do tła (żeby nie wycinać szarych łusek w środku ryby)
    from collections import deque
    mask = np.zeros((h, w), bool)
    near = diff < tol + soft
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near[y, x] and not mask[y, x]:
                mask[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near[y, x] and not mask[y, x]:
                mask[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not mask[ny, nx] and near[ny, nx]:
                mask[ny, nx] = True
                q.append((ny, nx))
    # alfa: 0 w tle, miękkie przejście na krawędzi wg odległości koloru
    alpha = np.where(mask, np.clip((diff - tol) / soft, 0, 1), 1.0)
    alpha_img = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    # odbarwienie resztek szarego halo na krawędzi
    rgba = np.dstack([a, np.asarray(alpha_img).astype(np.float32)])
    out = Image.fromarray(rgba.astype(np.uint8), 'RGBA')
    bbox = out.getbbox()
    return out.crop(bbox) if bbox else out


def fish():
    for sid, stem in FISH.items():
        src = Image.open(REF / '02-postacie-i-obiekty' / f'{stem}.jpg')
        c = cutout(src)
        c.thumbnail((720, 480), Image.LANCZOS)
        path = PUB / 'ui' / 'fish' / f'{sid}.webp'
        path.parent.mkdir(parents=True, exist_ok=True)
        c.save(path, 'WEBP', quality=86, method=6)
        print(f'  {path.relative_to(ROOT)}  {c.size[0]}×{c.size[1]}  {path.stat().st_size // 1024} KB')


def og():
    """Podgląd linku (og:image 1200×630) z key artu."""
    src = Image.open(REF / '01-swiat' / '01-key-art.jpg').convert('RGB')
    w, h = src.size
    tw = w
    th = round(w * 630 / 1200)
    top = max(0, (h - th) // 2 - 40)
    crop = src.crop((0, top, tw, top + th)).resize((1200, 630), Image.LANCZOS)
    save_jpg(crop, PUB / 'og-image.jpg', q=84)


TASKS = {'panorama': panorama, 'textures': textures, 'fish': fish, 'og': og}

if __name__ == '__main__':
    which = sys.argv[1:] or list(TASKS)
    for t in which:
        print(t)
        TASKS[t]()
