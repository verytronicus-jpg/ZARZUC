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


TASKS = {'panorama': panorama}

if __name__ == '__main__':
    which = sys.argv[1:] or list(TASKS)
    for t in which:
        print(t)
        TASKS[t]()
