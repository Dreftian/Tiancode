#!/usr/bin/env python3
"""Regenera el set completo de iconos de Tiancode a partir del diseño original.

El diseño fuente es `frontend/desktop/icons/original-white-icon.png` (gato
line-art negro sobre fondo blanco). Este script produce la variante moderna:
fondo oscuro con gradiente vertical, el mismo gato en blanco, y esquinas
redondeadas con transparencia (estilo icono moderno de escritorio).

Genera y sobreescribe:
- resources/icons/** (iconos de build: png, ico multi-frame, icns, store logos)
- icons/{prod,beta,dev}/** (fuentes por canal que copy-icons.ts copia al build)

Uso: python tools/script/regenerate-icons.py
"""
import io
import os
import shutil
import struct

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DESKTOP = os.path.join(ROOT, "frontend", "desktop")
SOURCE = os.path.join(DESKTOP, "icons", "original-white-icon.png")
TARGETS = [os.path.join(DESKTOP, "resources", "icons"), *(os.path.join(DESKTOP, "icons", c) for c in ("prod", "beta", "dev"))]

MASTER = 2048  # tamaño de trabajo (4x) para bordes suaves
RADIUS_RATIO = 0.215
TOP = np.array([26, 26, 32], dtype=float)  # #1a1a20
BOTTOM = np.array([12, 12, 16], dtype=float)  # #0c0c10
LINE_THRESHOLD = 235

MAIN_SIZES = [("icon.png", 512), ("128x128.png", 128), ("128x128@2x.png", 256), ("64x64.png", 64), ("32x32.png", 32)]
STORE_SIZES = [30, 44, 71, 89, 107, 142, 150, 284, 310]
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
ICNS_TYPES = {"ic11": 32, "ic12": 64, "ic07": 128, "ic08": 256, "ic13": 256, "ic09": 512, "ic14": 512}


def build_master():
    """Devuelve (master redondeado RGBA 2048, full-bleed RGBA 2048)."""
    src = np.array(Image.open(SOURCE).convert("L").resize((MASTER, MASTER), Image.LANCZOS), dtype=float)
    t = np.linspace(0, 1, MASTER)[:, None, None]
    gradient = TOP[None, None, :] * (1 - t) + BOTTOM[None, None, :] * t
    art = np.where((src < LINE_THRESHOLD)[..., None], 255.0, gradient)
    alpha = Image.new("L", (MASTER, MASTER), 0)
    ImageDraw.Draw(alpha).rounded_rectangle(
        [0, 0, MASTER - 1, MASTER - 1], radius=int(MASTER * RADIUS_RATIO), fill=255
    )
    rounded = Image.fromarray(np.dstack([art, np.array(alpha)]).astype(np.uint8), "RGBA")
    full = Image.fromarray(np.dstack([art, np.full((MASTER, MASTER), 255, np.uint8)]).astype(np.uint8), "RGBA")
    return rounded, full


def boost_small(img, size):
    """Aclara los tonos medios en tamaños pequeños para que el gato se distinga."""
    if size > 32:
        return img
    a = np.array(img).astype(np.float32)
    lum = a[..., :3].mean(axis=2)
    mask = lum < 235
    # estira 40..255 -> 0..255
    stretched = np.clip((a[..., :3] - 40) * (255 / 215), 0, 255)
    a[..., :3] = np.where(mask[..., None], stretched, a[..., :3])
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def light_variant(img, size):
    """Variante clara para tamaños pequeños (ICO <=48 y tray): sustituye el
    fondo casi negro por un gris medio vertical para que el icono se distinga
    en la barra de tareas oscura de Windows (el fondo oscuro original se ve
    como un cuadrado negro a 16-32px)."""
    if size > 64:
        return img
    a = np.array(img).astype(np.float32)
    lum = a[..., :3].mean(axis=2)
    visible = a[..., 3] > 10
    cat = visible & (lum > 200)  # el gato es blanco
    bg = visible & ~cat
    # gradiente gris medio: #41414c arriba -> #33333d abajo
    light = np.linspace(0, 1, img.size[1])[:, None, None]
    t = np.array([65, 65, 76], dtype=float)
    b = np.array([51, 51, 61], dtype=float)
    a[..., :3] = np.where(bg[..., None], t * (1 - light) + b * light, a[..., :3])
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def bmp_entry(img):
    """Entrada ICO en BMP 32bpp (bottom-up) + máscara AND."""
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
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def write_ico(path, images):
    """ICO multi-frame: PNG para >=256, BMP para el resto (compatible Windows)."""
    entries, data = [], b""
    base = 6 + 16 * len(images)
    for im in images:
        raw = png_bytes(im) if im.size[0] >= 256 else bmp_entry(im)
        dim = 0 if im.size[0] >= 256 else im.size[0]
        entries.append(struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(raw), base + len(data)))
        data += raw
    with open(path, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, len(images)) + b"".join(entries) + data)


def write_icns(path, images):
    chunks = b""
    for typ, im in images.items():
        png = png_bytes(im)
        chunks += typ.encode() + struct.pack(">I", len(png) + 8) + png
    with open(path, "wb") as f:
        f.write(b"icns" + struct.pack(">I", len(chunks) + 8) + chunks)


def main():
    rounded, full = build_master()
    for target in TARGETS:
        os.makedirs(target, exist_ok=True)
        for name, size in MAIN_SIZES:
            rounded.resize((size, size), Image.LANCZOS).save(os.path.join(target, name))
        full.resize((256, 256), Image.LANCZOS).save(os.path.join(target, "dock.png"))
        for size in STORE_SIZES:
            full.resize((size, size), Image.LANCZOS).save(os.path.join(target, f"Square{size}x{size}Logo.png"))
        full.resize((50, 50), Image.LANCZOS).save(os.path.join(target, "StoreLogo.png"))
        write_ico(
            os.path.join(target, "icon.ico"),
            [light_variant(rounded.resize((s, s), Image.LANCZOS), s) if s <= 48 else rounded.resize((s, s), Image.LANCZOS) for s in ICO_SIZES],
        )
        # Tray: variante clara (la barra de tareas oscura vuelve invisible el
        # fondo casi negro original a tamaño 16px).
        light_variant(rounded.resize((64, 64), Image.LANCZOS), 64).save(os.path.join(target, "icon-tray.png"))
        write_icns(os.path.join(target, "icon.icns"), {typ: full.resize((s, s), Image.LANCZOS) for typ, s in ICNS_TYPES.items()})
        # iOS (full-bleed; iOS aplica su propia máscara)
        ios_dir = os.path.join(target, "ios")
        if os.path.isdir(ios_dir):
            for name in os.listdir(ios_dir):
                p = os.path.join(ios_dir, name)
                if name.lower().endswith(".png"):
                    size = Image.open(p).size
                    full.resize(size, Image.LANCZOS).save(p)
        # Android mipmaps (full-bleed)
        for mip in ("mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"):
            d = os.path.join(target, "android", mip)
            if os.path.isdir(d):
                for name in os.listdir(d):
                    p = os.path.join(d, name)
                    if name.lower().endswith(".png"):
                        size = Image.open(p).size
                        full.resize(size, Image.LANCZOS).save(p)
        print("ok", target)


if __name__ == "__main__":
    main()
