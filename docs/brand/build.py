"""Rebuild the owned Aegis brand assets. Requires Python, Pillow, Node and Playwright."""
from pathlib import Path
from PIL import Image, PngImagePlugin
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / 'docs/brand'
ICONS = ROOT / 'src-tauri/icons'
BUILD = BRAND / '.build'
SIZES = (16, 32, 64, 128, 512, 1024)
BUILD.mkdir(exist_ok=True)

jobs = []
for source in sorted((BRAND / 'concepts').glob('*.svg')):
    for size in SIZES:
        jobs.append(dict(source=str(source), output=str(BRAND / 'previews' / source.stem / f'{size}.png'), size=size))
for size in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
    jobs.append(dict(source=str(ICONS / 'aegis.svg'), output=str(BUILD / 'final' / f'{size}.png'), size=size))
for size in (16, 32, 64, 128):
    jobs.append(dict(source=str(ROOT / 'app/src/assets/aegis-mark.svg'), output=str(BRAND / 'previews' / 'mark' / f'{size}.png'), size=size))
manifest = BUILD / 'render-jobs.json'
manifest.write_text(json.dumps(jobs))
subprocess.run(['node', str(BRAND / 'render.mjs'), str(manifest)], check=True, cwd=ROOT)

def owned_png(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    meta = PngImagePlugin.PngInfo()
    meta.add_text('Origin', 'Original Aegis vector artwork. Rendered from the SVG in this repository.')
    with Image.open(source) as image:
        image.convert('RGBA').save(target, pnginfo=meta)

for size, name in [(32, '32x32.png'), (64, '64x64.png'), (128, '128x128.png'), (256, '128x128@2x.png'), (1024, 'icon.png')]:
    owned_png(BUILD / 'final' / f'{size}.png', ICONS / name)
for size in SIZES:
    owned_png(BUILD / 'final' / f'{size}.png', BRAND / 'previews/final' / f'{size}.png')

iconset = ICONS / 'aegis.iconset'
for nominal in (16, 32, 128, 256, 512):
    for scale in (1, 2):
        suffix = '@2x' if scale == 2 else ''
        owned_png(BUILD / 'final' / f'{nominal * scale}.png', iconset / f'icon_{nominal}x{nominal}{suffix}.png')
# iconutil's legacy 1x slots expect premultiplied RGB at translucent pixels.
# Keep the editable iconset straight-alpha and compensate only the compiler copy.
compiler_iconset = BUILD / 'compiler.iconset'
shutil.copytree(iconset, compiler_iconset, dirs_exist_ok=True)
for size in (16, 32):
    path = compiler_iconset / f'icon_{size}x{size}.png'
    with Image.open(path) as source:
        image = source.convert('RGBA')
    image.putdata([(round(r * a / 255), round(g * a / 255), round(b * a / 255), a)
                   for r, g, b, a in image.get_flattened_data()])
    image.save(path)
subprocess.run(['iconutil', '-c', 'icns', str(compiler_iconset), '-o', str(ICONS / 'icon.icns')], check=True)

# Use the independent small-size SVG renders for the matching ICO frames.
ico_sizes = (16, 24, 32, 48, 64, 128, 256)
frames = [Image.open(BUILD / 'final' / f'{size}.png').convert('RGBA') for size in ico_sizes]
frames[-1].save(ICONS / 'icon.ico', sizes=[(size, size) for size in ico_sizes], append_images=frames[:-1])
for frame in frames:
    frame.close()

subprocess.run(['python3', str(BRAND / 'compose.py')], check=True, cwd=ROOT)
subprocess.run(['python3', str(BRAND / 'verify.py')], check=True, cwd=ROOT)
print('Built concepts, icon set, app mark previews, Dock row, size proofs and social preview.')
