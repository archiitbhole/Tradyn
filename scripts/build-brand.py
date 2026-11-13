#!/usr/bin/env python3
"""Builds every Tradyn logo and icon file from the two ORIGINAL artworks in brand-source/.

Nothing is redrawn. The script only does technical work:
  * lifts the artwork off its black background (so it can sit on any surface) with clean edges,
  * crops, centres and pads it,
  * resamples it for each size in linear light (thin neon strokes stay bright), with a little
    sharpening where small sizes go soft,
  * makes the light-background presentation by turning the white lettering dark
    (green, red and purple are left exactly as drawn),
  * puts the "T" emblem on a dark rounded tile for app / favicon / Chrome-extension icons.

Run:  python3 scripts/build-brand.py      (needs Pillow and NumPy)
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "brand-source"
BRAND = ROOT / "public" / "brand"                         # files the app shows
KIT = ROOT / "brand-kit"                                   # high-resolution copies for slides, print and docs
ICONS = ROOT / "public" / "icons"
APP = ROOT / "src" / "app"
INK = np.array([14, 20, 36], dtype=np.float32)          # lettering colour on light backgrounds
TILE_TOP, TILE_BOTTOM = (22, 31, 54), (7, 11, 22)        # icon tile: deep navy, slightly lit from above


def lift(path: Path) -> Image.Image:
    """Black background -> transparency. Alpha is the brightest channel, colour is un-multiplied,
    so glows and anti-aliased edges keep their exact colour on any background."""
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0
    a = rgb.max(axis=2)
    a = np.clip((a - 0.035) / (1 - 0.035), 0, 1)          # drop near-black compression noise
    a = np.where(a > 0.82, 1.0, a / 0.82)                 # solid artwork stays fully opaque
    colour = np.where(a[..., None] > 0, np.clip(rgb / np.maximum(rgb.max(axis=2, keepdims=True), 1e-4), 0, 1), 0)
    solid = np.clip(rgb, 0, 1)
    out_rgb = np.where(a[..., None] >= 1.0, solid, colour * np.clip(rgb.max(axis=2, keepdims=True) / np.maximum(a[..., None], 1e-4), 0, 1))
    a = despeckle(a)
    return Image.fromarray(np.dstack([np.clip(out_rgb, 0, 1) * 255, a * 255]).astype(np.uint8), "RGBA")


def despeckle(a: np.ndarray) -> np.ndarray:
    """Remove isolated specks (image-compression noise far from the artwork)."""
    from scipy import ndimage
    labels, n = ndimage.label(a > 0.06)
    if n:
        sizes = ndimage.sum(np.ones_like(a), labels, index=np.arange(1, n + 1))
        a = a * np.isin(labels, np.flatnonzero(sizes >= 60) + 1)
    return a


def bbox_crop(img: Image.Image, box=None, threshold=24) -> Image.Image:
    if box:
        img = img.crop(box)
    alpha = np.asarray(img)[..., 3]
    ys, xs = np.where(alpha > threshold)
    return img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def on_light(img: Image.Image) -> Image.Image:
    """White / grey lettering -> dark ink (shading kept); coloured strokes untouched."""
    px = np.asarray(img, dtype=np.float32)
    rgb, a = px[..., :3] / 255.0, px[..., 3:]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-4), 0)
    neutral = np.clip((0.30 - sat) / 0.14, 0, 1)[..., None]          # 1 = white/grey, 0 = coloured
    shade = np.clip((mx - 0.45) / 0.55, 0, 1)[..., None]              # darker greys of the "T" stay a soft slate
    ink = (np.array([120, 130, 150], dtype=np.float32) * (1 - shade) + INK * shade) / 255.0
    # the coloured strokes are a touch deeper on white so they keep their contrast
    deep = rgb * np.array([0.80, 0.86, 0.84], dtype=np.float32)
    out = ink * neutral + deep * (1 - neutral)
    return Image.fromarray(np.dstack([np.clip(out, 0, 1) * 255, a[..., 0]]).astype(np.uint8), "RGBA")


def _to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _to_srgb(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.clip(c, 0, None), 1 / 2.4) - 0.055)


def resize(img: Image.Image, w: int, h: int) -> Image.Image:
    """Downscale in linear light with premultiplied alpha. Ordinary resizing averages the stored
    (gamma-encoded) values, which turns thin bright strokes grey and fringes edges with dark halos;
    this keeps the neon strokes as bright and clean as drawn. Pure resampling: no colour is changed."""
    px = np.asarray(img.convert("RGBA"), dtype=np.float32) / 255.0
    a = px[..., 3]
    lin = _to_linear(px[..., :3]) * a[..., None]
    chans = [np.asarray(Image.fromarray(lin[..., i], "F").resize((w, h), Image.LANCZOS)) for i in range(3)]
    a2 = np.clip(np.asarray(Image.fromarray(a, "F").resize((w, h), Image.LANCZOS)), 0, 1)
    rgb = np.stack(chans, axis=-1) / np.maximum(a2[..., None], 1e-5)
    rgb = np.where(a2[..., None] > 1e-4, _to_srgb(np.clip(rgb, 0, 1)), 0)
    return Image.fromarray((np.dstack([rgb, a2]) * 255 + 0.5).clip(0, 255).astype(np.uint8), "RGBA")


def fit(img: Image.Image, size: int, pad: float) -> Image.Image:
    """Centre the artwork in a square canvas with `pad` (0..1) of the side left empty around it."""
    inner = round(size * (1 - 2 * pad))
    scale = inner / max(img.size)
    w, h = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    art = resize(img, w, h)
    if size <= 64:                                           # restore edge contrast lost in the reduction
        art = art.filter(ImageFilter.UnsharpMask(radius=0.6, percent=60 if size > 24 else 90, threshold=1))
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(art, ((size - w) // 2, (size - h) // 2))
    return canvas


def tile(size: int) -> Image.Image:
    """Dark rounded tile behind the emblem (drawn 4x and reduced for a smooth edge)."""
    s = size * 4
    grad = np.linspace(0, 1, s, dtype=np.float32)[:, None, None]
    body = (np.array(TILE_TOP, dtype=np.float32) * (1 - grad) + np.array(TILE_BOTTOM, dtype=np.float32) * grad)
    body = np.broadcast_to(body, (s, s, 3)).astype(np.uint8)
    radius = round(s * 0.225)
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, s - 1, s - 1), radius=radius, fill=255)
    img = Image.fromarray(body, "RGB").convert("RGBA")
    img.putalpha(mask)
    if size >= 48:                                           # hairline edge so the tile reads on dark toolbars too
        edge = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        ImageDraw.Draw(edge).rounded_rectangle((2, 2, s - 3, s - 3), radius=radius - 2, outline=(255, 255, 255, 34), width=max(2, s // 128))
        img.alpha_composite(edge)
    return img.resize((size, size), Image.LANCZOS)


def glow(art: Image.Image, strength: float) -> Image.Image:
    """Very soft halo in the artwork's own colours (no new colour is introduced)."""
    blur = art.filter(ImageFilter.GaussianBlur(max(1.0, art.width * 0.035)))
    px = np.asarray(blur, dtype=np.float32)
    px[..., 3] *= strength
    return Image.fromarray(px.astype(np.uint8), "RGBA")


def app_icon(mark: Image.Image, size: int) -> Image.Image:
    # smaller icons get less padding so the emblem stays as large and readable as possible
    pad = 0.03 if size <= 16 else 0.05 if size <= 32 else 0.08 if size <= 48 else 0.11
    art = fit(mark, size, pad)
    if size <= 32:                                           # lift mid-tones slightly: thin strokes survive the reduction
        px = np.asarray(art, dtype=np.float32)
        px[..., 3] = np.clip(px[..., 3] * 1.12, 0, 255)
        art = Image.fromarray(px.astype(np.uint8), "RGBA")
    out = tile(size)
    if size >= 48:
        out.alpha_composite(glow(art, 0.35))
    out.alpha_composite(art)
    return out


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print(f"  {path.relative_to(ROOT)}  {img.width}x{img.height}  {path.stat().st_size // 1024 or 1} KB")


def main() -> None:
    emblem = lift(SRC / "tradyn-emblem-original.png")
    word_src = lift(SRC / "tradyn-wordmark-original.png")
    # the "T" with arrow, candles and swoosh: everything above the lettering, minus the small crown that
    # belongs to the lettering's "Y" (it sits beside the foot of the T)
    top = np.asarray(emblem).copy()
    top[776:, :, 3] = 0
    top[660:, 940:, 3] = 0
    mark = bbox_crop(Image.fromarray(top, "RGBA"))
    lockup = bbox_crop(emblem)                               # the complete emblem with its TRADYN lettering
    wordmark = bbox_crop(word_src)                           # the hand-drawn TRADYN wordmark

    print("brand kit (high resolution, for slides, print and documents)")
    for name, art, h in (("mark", mark, 512), ("wordmark", wordmark, 240), ("logo", lockup, 720)):
        scale = h / art.height
        dark = resize(art, round(art.width * scale), h)
        save(dark, KIT / f"tradyn-{name}-on-dark.png")
        save(on_light(dark), KIT / f"tradyn-{name}-on-light.png")

    # display-size copies for the interface (3x the largest size they are shown at), served as-is so
    # the browser never has to shrink a large file and the linear-light resampling above is kept
    print("interface sizes (public/brand)")
    for name, art, h in (("mark", mark, 96), ("wordmark", wordmark, 108), ("logo", lockup, 400)):
        dark = resize(art, round(art.width * h / art.height), h)
        save(dark, BRAND / f"tradyn-{name}-ui.png")
        if name != "mark":                                   # the emblem always sits on its own dark tile
            save(on_light(dark), BRAND / f"tradyn-{name}-light-ui.png")

    print("icons (emblem on its dark tile)")
    for size in (16, 32, 48, 128, 180, 192, 512):
        save(app_icon(mark, size), ICONS / f"icon-{size}.png")
    save(app_icon(mark, 512), APP / "icon.png")
    save(app_icon(mark, 180), APP / "apple-icon.png")
    ico = [app_icon(mark, s) for s in (16, 32, 48)]
    ico[2].save(APP / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])
    print("  src/app/favicon.ico  16/32/48")
    # maskable icon: full-bleed tile, artwork inside the safe zone
    full = Image.new("RGBA", (512, 512), TILE_BOTTOM + (255,))
    full.alpha_composite(tile(512).resize((640, 640), Image.LANCZOS).crop((64, 64, 576, 576)))
    art = fit(mark, 512, 0.2)
    full.alpha_composite(glow(art, 0.3))
    full.alpha_composite(art)
    save(full, ICONS / "icon-maskable-512.png")


if __name__ == "__main__":
    main()
