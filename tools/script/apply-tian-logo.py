#!/usr/bin/env python3
import os
import io
import struct
from PIL import Image

SOURCE_ICON = r"D:\3. Imagenes y videos\ICONOS Y LOGOS\tian.png"
SOURCE_LOGO = r"D:\3. Imagenes y videos\ICONOS Y LOGOS\tiancode.png"

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DESKTOP = os.path.join(ROOT, "frontend", "desktop")

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

def make_master_icon():
    size = 1024
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    from PIL import ImageDraw
    draw = ImageDraw.Draw(bg)
    
    radius = 220
    margin = 40
    # Base dark container with deep luxury obsidian
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=(15, 23, 42, 255),
        outline=(56, 189, 248, 120),
        width=8
    )
    
    # Inner dark layer
    inner_margin = margin + 12
    draw.rounded_rectangle(
        [inner_margin, inner_margin, size - inner_margin, size - inner_margin],
        radius=radius - 8,
        fill=(10, 15, 29, 255),
        outline=(255, 255, 255, 35),
        width=3
    )
    
    # Load emblem
    tian_img = Image.open(SOURCE_ICON).convert("RGBA")
    bbox = tian_img.getbbox()
    if bbox:
        tian_img = tian_img.crop(bbox)
        
    emblem_w = int((size - 2 * margin) * 0.76)
    aspect = tian_img.height / tian_img.width
    emblem_h = int(emblem_w * aspect)
    
    tian_resized = tian_img.resize((emblem_w, emblem_h), Image.Resampling.LANCZOS)
    pos_x = (size - emblem_w) // 2
    pos_y = (size - emblem_h) // 2
    
    bg.paste(tian_resized, (pos_x, pos_y), tian_resized)
    return bg

def png_bytes(img):
    buffer = io.BytesIO()
    img.save(buffer, "PNG")
    return buffer.getvalue()

def bmp_entry(image):
    w, h = image.size
    data = image.convert("RGBA").tobytes("raw", "BGRA")
    rows = [data[i * w * 4:(i + 1) * w * 4] for i in range(h)]
    xor = b"".join(reversed(rows))
    and_mask = b"\x00" * (((w + 31) // 32) * 4 * h)
    header = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, len(xor) + len(and_mask), 0, 0, 0, 0)
    return header + xor + and_mask

def write_ico(path, images):
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
    if not os.path.exists(SOURCE_ICON):
        print(f"Error: {SOURCE_ICON} does not exist")
        return

    print(f"Loading master icon from: {SOURCE_ICON}")
    img = make_master_icon()

    for target_dir in TARGET_DIRS:
        os.makedirs(target_dir, exist_ok=True)
        # Main sizes including dock.png, StoreLogo.png, icon-tray.png
        for filename, size in MAIN_SIZES:
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(os.path.join(target_dir, filename), "PNG", optimize=True)

        # Store sizes
        for size in STORE_SIZES:
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(os.path.join(target_dir, f"Square{size}x{size}Logo.png"), "PNG", optimize=True)

        # Multi-size ICO with 256x256 first
        ico_images = [img.resize((s, s), Image.Resampling.LANCZOS) for s in ICO_SIZES]
        write_ico(os.path.join(target_dir, "icon.ico"), ico_images)

        # ICNS for macOS / multiplatform
        icns_images = {k: img.resize((s, s), Image.Resampling.LANCZOS) for k, s in ICNS_TYPES.items()}
        write_icns(os.path.join(target_dir, "icon.icns"), icns_images)

        print(f"Updated icon assets in: {target_dir}")

    # Website assets
    web_img_dir = os.path.join(ROOT, "tools", "website", "img")
    os.makedirs(web_img_dir, exist_ok=True)
    img.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(web_img_dir, "favicon.png"), "PNG")
    img.resize((180, 180), Image.Resampling.LANCZOS).save(os.path.join(web_img_dir, "apple-touch-icon.png"), "PNG")
    img.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(web_img_dir, "logo.png"), "PNG")
    print(f"Updated website icons in: {web_img_dir}")

    # UI Logo assets
    for dest in [
        os.path.join(ROOT, "frontend", "icons", "tian-black.png"),
        os.path.join(ROOT, "frontend", "icons", "tian-white.png"),
        os.path.join(ROOT, "frontend", "ui", "src", "assets", "logo", "tian-black.png"),
        os.path.join(ROOT, "frontend", "ui", "src", "assets", "logo", "tian-white.png"),
    ]:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        img.resize((128, 128), Image.Resampling.LANCZOS).save(dest, "PNG")

    print("All logos, tray icons, and exe resources successfully refreshed from tian.png!")

if __name__ == "__main__":
    main()
