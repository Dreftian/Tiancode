#!/usr/bin/env python3
"""Regenerate Tiancode icons from a high-legibility cat-face design.

The previous source was a thin abstract smile. It lost its identity in the
Windows taskbar. This generator deliberately uses large ears, eyes, nose and
cheeks so the app is recognisable as a cat at 16 and 32 pixels.

It writes the desktop build assets for every channel and the transparent logo
assets consumed by the Solid interface.

Usage: python tools/script/regenerate-icons.py
"""

import io
import os
import struct

import numpy as np
from PIL import Image, ImageDraw


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DESKTOP = os.path.join(ROOT, "frontend", "desktop")
TARGETS = [
    os.path.join(DESKTOP, "resources", "icons"),
    *(os.path.join(DESKTOP, "icons", channel) for channel in ("prod", "beta", "dev")),
]
LOGO_TARGETS = [
    (os.path.join(ROOT, "frontend", "icons", "tian-black.png"), (20, 23, 34, 255)),
    (os.path.join(ROOT, "frontend", "icons", "tian-white.png"), (248, 250, 252, 255)),
    (os.path.join(ROOT, "frontend", "ui", "src", "assets", "logo", "tian-black.png"), (20, 23, 34, 255)),
    (os.path.join(ROOT, "frontend", "ui", "src", "assets", "logo", "tian-white.png"), (248, 250, 252, 255)),
]

MASTER = 2048
RADIUS_RATIO = 0.215
TOP = np.array([36, 36, 38], dtype=float)
BOTTOM = np.array([14, 14, 16], dtype=float)

MAIN_SIZES = [("icon.png", 512), ("128x128.png", 128), ("128x128@2x.png", 256), ("64x64.png", 64), ("32x32.png", 32)]
STORE_SIZES = [30, 44, 71, 89, 107, 142, 150, 284, 310]
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
ICNS_TYPES = {"ic11": 32, "ic12": 64, "ic07": 128, "ic08": 256, "ic13": 256, "ic09": 512, "ic14": 512}


def draw_cat(image, face, outline, eye, inner_ear, cutout=False):
    """Draw a cat face whose key features survive downscaling in high-contrast B&W."""
    draw = ImageDraw.Draw(image)
    size = image.size[0]
    point = lambda x, y: (round(size * x), round(size * y))
    box = lambda x0, y0, x1, y1: (round(size * x0), round(size * y0), round(size * x1), round(size * y1))
    thin = max(2, round(size * 0.022))

    # The outline keeps the ears and face joined on light and dark surfaces.
    draw.polygon([point(.17, .50), point(.28, .10), point(.50, .47)], fill=outline)
    draw.polygon([point(.83, .50), point(.72, .10), point(.50, .47)], fill=outline)
    draw.ellipse(box(.15, .29, .85, .89), fill=outline)
    draw.polygon([point(.23, .47), point(.29, .17), point(.47, .45)], fill=face)
    draw.polygon([point(.77, .47), point(.71, .17), point(.53, .45)], fill=face)
    draw.ellipse(box(.19, .33, .81, .85), fill=face)

    # Inner ears establish the cat silhouette before the smaller details do.
    draw.polygon([point(.285, .28), point(.305, .18), point(.405, .40)], fill=inner_ear)
    draw.polygon([point(.715, .28), point(.695, .18), point(.595, .40)], fill=inner_ear)

    # Large almond eyes are intentionally high contrast at 16 and 32 pixels.
    draw.polygon([point(.255, .54), point(.365, .455), point(.468, .535), point(.365, .61)], fill=eye)
    draw.polygon([point(.745, .54), point(.635, .455), point(.532, .535), point(.635, .61)], fill=eye)
    detail = (0, 0, 0, 0) if cutout else outline
    draw.ellipse(box(.342, .482, .392, .588), fill=detail)
    draw.ellipse(box(.608, .482, .658, .588), fill=detail)

    # A compact muzzle adds expression without relying on one-pixel strokes.
    draw.polygon([point(.455, .655), point(.545, .655), point(.5, .71)], fill=detail)
    draw.line([point(.5, .704), point(.5, .735)], fill=detail, width=thin)
    draw.arc(box(.41, .705, .50, .78), 0, 100, fill=detail, width=thin)
    draw.arc(box(.50, .705, .59, .78), 80, 180, fill=detail, width=thin)

    cheek = (0, 0, 0, 0) if cutout else (225, 225, 228, 180)
    draw.ellipse(box(.275, .645, .43, .76), fill=cheek)
    draw.ellipse(box(.57, .645, .725, .76), fill=cheek)
    for y, offset in ((.67, .0), (.72, .025), (.765, .05)):
        draw.line([point(.37, y), point(.12, y + offset)], fill=detail, width=thin)
        draw.line([point(.63, y), point(.88, y + offset)], fill=detail, width=thin)


def build_master():
    """Return rounded app art, full-bleed art, and a transparent tray mark in B&W."""
    t = np.linspace(0, 1, MASTER)[:, None, None]
    gradient = TOP[None, None, :] * (1 - t) + BOTTOM[None, None, :] * t
    coordinates = np.linspace(-1, 1, MASTER)
    x, y = np.meshgrid(coordinates, coordinates)
    glow = np.exp(-((x * .82) ** 2 + ((y + .08) * 1.05) ** 2) * 2.4)[..., None]
    art = np.clip(gradient + glow * np.array([22, 22, 24]), 0, 255)
    alpha = Image.new("L", (MASTER, MASTER), 0)
    ImageDraw.Draw(alpha).rounded_rectangle(
        [0, 0, MASTER - 1, MASTER - 1], radius=int(MASTER * RADIUS_RATIO), fill=255
    )
    rounded = Image.fromarray(np.dstack([art, np.array(alpha)]).astype(np.uint8), "RGBA")
    full = Image.fromarray(np.dstack([art, np.full((MASTER, MASTER), 255, np.uint8)]).astype(np.uint8), "RGBA")

    # High-contrast Black and White design for modern desktop experience
    draw_cat(rounded, (245, 246, 248, 255), (14, 14, 16, 255), (255, 255, 255, 255), (205, 208, 215, 255))
    draw_cat(full, (245, 246, 248, 255), (14, 14, 16, 255), (255, 255, 255, 255), (205, 208, 215, 255))

    # A transparent light cat for tray and notification area
    tray = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    draw_cat(tray, (245, 246, 248, 255), (32, 34, 38, 255), (14, 14, 16, 255), (205, 208, 215, 255))
    return rounded, full, tray


def build_logo(color):
    """Return a transparent 3:2 UI logo with a square cat centered in it."""
    logo = Image.new("RGBA", (1536, 1024), (0, 0, 0, 0))
    mark = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw_cat(mark, color, color, (0, 0, 0, 0), color, cutout=True)
    logo.alpha_composite(mark, (256, 0))
    return logo


def validate_small_icon(image):
    """Make a regeneration fail if the two readable eyes disappear at 32 px."""
    pixels = np.array(image.resize((32, 32), Image.LANCZOS))
    bright = (pixels[..., :3].mean(axis=2) > 210) & (pixels[..., 3] > 220)
    if bright[12:20, 7:15].sum() < 3 or bright[12:20, 17:25].sum() < 3:
        raise RuntimeError("The 32px icon lost the cat eyes")


def bmp_entry(img):
    """ICO BMP entry in 32 bpp (bottom-up) plus AND mask."""
    w, h = img.size
    rows = []
    for y in range(h - 1, -1, -1):
        row = bytearray()
        for x in range(w):
            r, g, b, a = img.getpixel((x, y))
            row += bytes([b, g, r, a])
        rows.append(bytes(row))
    xor = b"".join(rows)
    and_mask = b"\x00" * (((w + 31) // 32) * 4 * h)
    header = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, len(xor) + len(and_mask), 0, 0, 0, 0)
    return header + xor + and_mask


def png_bytes(img):
    buffer = io.BytesIO()
    img.save(buffer, "PNG")
    return buffer.getvalue()


def write_ico(path, images):
    """Write a broadly compatible multi-frame ICO file."""
    entries, data = [], b""
    base = 6 + 16 * len(images)
    for image in images:
        raw = png_bytes(image) if image.size[0] >= 256 else bmp_entry(image)
        dimension = 0 if image.size[0] >= 256 else image.size[0]
        entries.append(struct.pack("<BBBBHHII", dimension, dimension, 0, 0, 1, 32, len(raw), base + len(data)))
        data += raw
    with open(path, "wb") as file:
        file.write(struct.pack("<HHH", 0, 1, len(images)) + b"".join(entries) + data)


def write_icns(path, images):
    chunks = b""
    for kind, image in images.items():
        png = png_bytes(image)
        chunks += kind.encode() + struct.pack(">I", len(png) + 8) + png
    with open(path, "wb") as file:
        file.write(b"icns" + struct.pack(">I", len(chunks) + 8) + chunks)


def main():
    rounded, full, tray = build_master()
    validate_small_icon(rounded)

    for target in TARGETS:
        os.makedirs(target, exist_ok=True)
        for name, size in MAIN_SIZES:
            rounded.resize((size, size), Image.LANCZOS).save(os.path.join(target, name))
        full.resize((256, 256), Image.LANCZOS).save(os.path.join(target, "dock.png"))
        for size in STORE_SIZES:
            full.resize((size, size), Image.LANCZOS).save(os.path.join(target, f"Square{size}x{size}Logo.png"))
        full.resize((50, 50), Image.LANCZOS).save(os.path.join(target, "StoreLogo.png"))
        write_ico(os.path.join(target, "icon.ico"), [rounded.resize((size, size), Image.LANCZOS) for size in ICO_SIZES])
        tray.resize((64, 64), Image.LANCZOS).save(os.path.join(target, "icon-tray.png"))
        write_icns(os.path.join(target, "icon.icns"), {kind: full.resize((size, size), Image.LANCZOS) for kind, size in ICNS_TYPES.items()})

        ios = os.path.join(target, "ios")
        if os.path.isdir(ios):
            for name in os.listdir(ios):
                file = os.path.join(ios, name)
                if name.lower().endswith(".png"):
                    full.resize(Image.open(file).size, Image.LANCZOS).save(file)

        for mipmap in ("mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"):
            directory = os.path.join(target, "android", mipmap)
            if os.path.isdir(directory):
                for name in os.listdir(directory):
                    file = os.path.join(directory, name)
                    if name.lower().endswith(".png"):
                        full.resize(Image.open(file).size, Image.LANCZOS).save(file)
        print("ok", target)

    for path, color in LOGO_TARGETS:
        build_logo(color).save(path)
        print("ok", path)

    # Keep the legacy source filename useful for people who open the icon
    # folder manually: it now contains the current white cat mark.
    source = build_logo((255, 255, 255, 255)).crop((256, 0, 1280, 1024)).resize((512, 512), Image.LANCZOS)
    source.save(os.path.join(DESKTOP, "icons", "original-white-icon.png"))


if __name__ == "__main__":
    main()
