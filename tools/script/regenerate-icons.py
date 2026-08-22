#!/usr/bin/env python3
"""Regenerate all Tiancode icons and logo assets from the brand emblem.

Generates:
- Desktop app icons for all channels (prod, beta, dev, resources):
  PNGs (all sizes), multi-frame ICO (16-256px), ICNS (macOS), Store logos, tray icons.
- Web and UI logo assets (tian-white.png, tian-black.png for dark/light themes).
- Web favicons, apple-touch-icons, and manifest icons across all frontend/backend public directories.

Usage: python tools/script/regenerate-icons.py
"""

import io
import os
import shutil
import struct
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DESKTOP = os.path.join(ROOT, "frontend", "desktop")

# Solo emblemas originales: las salidas compuestas (logo.png, icon-512.png) se
# excluyen porque este script las sobrescribe; usarlas como fuente anidaría el
# ícono squircle dentro de otro en la segunda ejecución.
SOURCE_CANDIDATES = [
    r"D:\3. Imagenes y videos\ICONOS Y LOGOS\tian.png",
    r"D:\3. Imagenes y videos\ICONOS Y LOGOS\tiancode.png",
    os.path.join(DESKTOP, "icons", "original-white-icon.png"),
]

TARGET_DIRS = [
    os.path.join(DESKTOP, "resources", "icons"),
    os.path.join(DESKTOP, "icons", "prod"),
    os.path.join(DESKTOP, "icons", "beta"),
    os.path.join(DESKTOP, "icons", "dev"),
]

MAIN_SIZES = [
    ("icon.png", 512),
    ("128x128.png", 128),
    ("128x128@2x.png", 256),
    ("64x64.png", 64),
    ("32x32.png", 32),
    ("dock.png", 512),
    ("StoreLogo.png", 50),
    ("icon-tray.png", 32),
]
STORE_SIZES = [30, 44, 71, 89, 107, 142, 150, 284, 310]
ICO_SIZES = [256, 128, 64, 48, 32, 24, 16]
ICNS_TYPES = {"ic11": 32, "ic12": 64, "ic07": 128, "ic08": 256, "ic13": 256, "ic09": 512, "ic14": 512}


def resolve_source():
    for candidate in SOURCE_CANDIDATES:
        if os.path.exists(candidate):
            return candidate
    raise FileNotFoundError("Could not find any source logo image")


def get_source_emblem(source_path):
    img = Image.open(source_path).convert("RGBA")
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    return img


def make_standalone_emblem(src_img, color_rgb):
    """Create a transparent PNG of the emblem in the given color."""
    arr = np.array(src_img)
    alpha = arr[..., 3].copy()
    out = np.zeros((src_img.height, src_img.width, 4), dtype=np.uint8)
    out[..., 0] = color_rgb[0]
    out[..., 1] = color_rgb[1]
    out[..., 2] = color_rgb[2]
    out[..., 3] = alpha
    return Image.fromarray(out, "RGBA")


def make_master_app_icon(src_img):
    """Generate the official dark squircle app icon with cyan border & glowing emblem."""
    size = 1024
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(bg)

    radius = 220
    margin = 40

    # Base dark container with deep luxury obsidian
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=(15, 23, 42, 255),
        outline=(56, 189, 248, 120),
        width=8,
    )

    # Inner dark layer
    inner_margin = margin + 12
    draw.rounded_rectangle(
        [inner_margin, inner_margin, size - inner_margin, size - inner_margin],
        radius=radius - 8,
        fill=(10, 15, 29, 255),
        outline=(255, 255, 255, 35),
        width=3,
    )

    # White emblem for dark icon container
    white_emblem = make_standalone_emblem(src_img, (255, 255, 255))
    emblem_w = int((size - 2 * margin) * 0.76)
    aspect = white_emblem.height / white_emblem.width
    emblem_h = int(emblem_w * aspect)

    resized_emblem = white_emblem.resize((emblem_w, emblem_h), Image.Resampling.LANCZOS)
    pos_x = (size - emblem_w) // 2
    pos_y = (size - emblem_h) // 2

    bg.paste(resized_emblem, (pos_x, pos_y), resized_emblem)
    return bg


def png_bytes(img):
    buffer = io.BytesIO()
    img.save(buffer, "PNG")
    return buffer.getvalue()


def bmp_entry(image):
    w, h = image.size
    data = image.convert("RGBA").tobytes("raw", "BGRA")
    rows = [data[i * w * 4 : (i + 1) * w * 4] for i in range(h)]
    xor = b"".join(reversed(rows))
    and_mask = b"\x00" * (((w + 31) // 32) * 4 * h)
    header = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, len(xor) + len(and_mask), 0, 0, 0, 0)
    return header + xor + and_mask


def write_ico(path, images):
    sizes = [im.size for im in images]
    images[0].save(path, format="ICO", append_images=images[1:], sizes=sizes)


def write_icns(path, images):
    chunks = b""
    for kind, image in images.items():
        png = png_bytes(image)
        chunks += kind.encode() + struct.pack(">I", len(png) + 8) + png
    with open(path, "wb") as file:
        file.write(b"icns" + struct.pack(">I", len(chunks) + 8) + chunks)


def main():
    source_path = resolve_source()
    print(f"Loading source emblem from: {source_path}")
    src_img = get_source_emblem(source_path)

    # Save master original in desktop icons
    master_icon_path = os.path.join(DESKTOP, "icons", "original-white-icon.png")
    os.makedirs(os.path.dirname(master_icon_path), exist_ok=True)
    src_img.save(master_icon_path)

    # Generate master app icon
    app_icon = make_master_app_icon(src_img)

    # 1. Desktop app icons across channels
    for target_dir in TARGET_DIRS:
        os.makedirs(target_dir, exist_ok=True)
        for filename, size in MAIN_SIZES:
            resized = app_icon.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(os.path.join(target_dir, filename), "PNG", optimize=True)

        for size in STORE_SIZES:
            resized = app_icon.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(os.path.join(target_dir, f"Square{size}x{size}Logo.png"), "PNG", optimize=True)

        ico_images = [app_icon.resize((s, s), Image.Resampling.LANCZOS) for s in ICO_SIZES]
        write_ico(os.path.join(target_dir, "icon.ico"), ico_images)

        icns_images = {k: app_icon.resize((s, s), Image.Resampling.LANCZOS) for k, s in ICNS_TYPES.items()}
        write_icns(os.path.join(target_dir, "icon.icns"), icns_images)

        # iOS
        ios_dir = os.path.join(target_dir, "ios")
        if os.path.isdir(ios_dir):
            for name in os.listdir(ios_dir):
                f = os.path.join(ios_dir, name)
                if name.lower().endswith(".png"):
                    sz = Image.open(f).size
                    app_icon.resize(sz, Image.Resampling.LANCZOS).save(f)

        # Android mipmaps
        for mip in ("mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"):
            d = os.path.join(target_dir, "android", mip)
            if os.path.isdir(d):
                for name in os.listdir(d):
                    f = os.path.join(d, name)
                    if name.lower().endswith(".png"):
                        sz = Image.open(f).size
                        app_icon.resize(sz, Image.Resampling.LANCZOS).save(f)

        print(f"Updated desktop icons in: {target_dir}")

    # 2. Standalone logos for UI / web themes
    black_emblem = make_standalone_emblem(src_img, (20, 23, 34))
    white_emblem = make_standalone_emblem(src_img, (248, 250, 252))

    # Resize emblems keeping aspect ratio
    emblem_w = 512
    emblem_h = int(emblem_w * (src_img.height / src_img.width))
    b_resized = black_emblem.resize((emblem_w, emblem_h), Image.Resampling.LANCZOS)
    w_resized = white_emblem.resize((emblem_w, emblem_h), Image.Resampling.LANCZOS)

    for b_path, w_path in [
        (
            os.path.join(ROOT, "tools", "website", "img", "tian-black.png"),
            os.path.join(ROOT, "tools", "website", "img", "tian-white.png"),
        ),
        (
            os.path.join(ROOT, "frontend", "ui", "src", "assets", "logo", "tian-black.png"),
            os.path.join(ROOT, "frontend", "ui", "src", "assets", "logo", "tian-white.png"),
        ),
        (
            os.path.join(ROOT, "frontend", "icons", "tian-black.png"),
            os.path.join(ROOT, "frontend", "icons", "tian-white.png"),
        ),
    ]:
        os.makedirs(os.path.dirname(b_path), exist_ok=True)
        b_resized.save(b_path, "PNG", optimize=True)
        w_resized.save(w_path, "PNG", optimize=True)
        print(f"Updated theme logos: {b_path}, {w_path}")

    # 3. Website assets
    web_img_dir = os.path.join(ROOT, "tools", "website", "img")
    os.makedirs(web_img_dir, exist_ok=True)
    app_icon.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(web_img_dir, "logo.png"), "PNG")
    app_icon.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(web_img_dir, "icon-512.png"), "PNG")
    app_icon.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(web_img_dir, "icon-192.png"), "PNG")
    app_icon.resize((180, 180), Image.Resampling.LANCZOS).save(os.path.join(web_img_dir, "apple-touch-icon.png"), "PNG")
    app_icon.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(web_img_dir, "favicon.png"), "PNG")
    print(f"Updated website icons in: {web_img_dir}")

    # 4. Favicons across public folders
    public_dirs = [
        os.path.join(ROOT, "frontend", "app", "public"),
        os.path.join(ROOT, "frontend", "ui", "src", "assets", "favicon"),
        os.path.join(ROOT, "backend", "enterprise", "public"),
        os.path.join(ROOT, "frontend", "web", "public"),
    ]

    for pdir in public_dirs:
        if not os.path.isdir(pdir):
            continue
        app_icon.resize((180, 180), Image.Resampling.LANCZOS).save(os.path.join(pdir, "apple-touch-icon.png"), "PNG")
        app_icon.resize((180, 180), Image.Resampling.LANCZOS).save(os.path.join(pdir, "apple-touch-icon-v3.png"), "PNG")
        app_icon.resize((96, 96), Image.Resampling.LANCZOS).save(os.path.join(pdir, "favicon-96x96.png"), "PNG")
        app_icon.resize((96, 96), Image.Resampling.LANCZOS).save(os.path.join(pdir, "favicon-96x96-v3.png"), "PNG")
        fav_ico = [app_icon.resize((s, s), Image.Resampling.LANCZOS) for s in [48, 32, 16]]
        write_ico(os.path.join(pdir, "favicon.ico"), fav_ico)
        write_ico(os.path.join(pdir, "favicon-v3.ico"), fav_ico)

        manifest_192 = os.path.join(pdir, "web-app-manifest-192x192.png")
        if os.path.exists(manifest_192) or "ui" in pdir:
            app_icon.resize((192, 192), Image.Resampling.LANCZOS).save(manifest_192, "PNG")
        manifest_512 = os.path.join(pdir, "web-app-manifest-512x512.png")
        if os.path.exists(manifest_512) or "ui" in pdir:
            app_icon.resize((512, 512), Image.Resampling.LANCZOS).save(manifest_512, "PNG")
        print(f"Updated favicons in: {pdir}")

    print("\nAll brand icons, logos, desktop resources, and favicons successfully refreshed!")


if __name__ == "__main__":
    main()
