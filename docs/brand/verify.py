"""Validate the shipping assets and native container frames, without running Aegis."""
from pathlib import Path
from PIL import Image, ImageChops
import json
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
ICONS = ROOT / 'src-tauri/icons'
BRAND = ROOT / 'docs/brand'
expected = {'32x32.png': 32, '64x64.png': 64, '128x128.png': 128, '128x128@2x.png': 256, 'icon.png': 1024}
for name, size in expected.items():
    with Image.open(ICONS / name) as image:
        assert image.size == (size, size), name
        assert image.mode == 'RGBA', name
        assert image.getpixel((0, 0))[3] == 0, name
        assert image.getpixel((size // 2, size // 2))[3] == 255, name
        # A sample well inside the blue cap must keep the exact brand colour.
        assert image.getpixel((round(size * .6), round(size * .32)))[:3] == (63, 141, 253), name

conf = json.loads((ROOT / 'src-tauri/tauri.conf.json').read_text())
for name in conf['bundle']['icon']:
    assert (ROOT / 'src-tauri' / name).is_file(), name
assert {f'icons/{name}' for name in expected} <= set(conf['bundle']['icon'])
assert {'icons/icon.icns', 'icons/icon.ico'} <= set(conf['bundle']['icon'])

roundtrip = BRAND / '.build/roundtrip.iconset'
roundtrip.parent.mkdir(exist_ok=True)
subprocess.run(['iconutil', '-c', 'iconset', str(ICONS / 'icon.icns'), '-o', str(roundtrip)], check=True)
for nominal in (16, 32, 128, 256, 512):
    for scale in (1, 2):
        suffix = '@2x' if scale == 2 else ''
        name = f'icon_{nominal}x{nominal}{suffix}.png'
        with Image.open(ICONS / 'aegis.iconset' / name) as original, Image.open(roundtrip / name) as restored:
            assert original.size == restored.size == (nominal * scale,) * 2, name
            a, b = original.convert('RGBA'), restored.convert('RGBA')
            assert a.getchannel('A').tobytes() == b.getchannel('A').tobytes(), name
            if nominal in (16, 32) and scale == 1:
                # Legacy 1x slots quantise premultiplied RGB. Check visible output
                # on dark, mid-grey and light Dock backgrounds, not hidden RGB.
                for background in ('#000000', '#808080', '#ffffff'):
                    matte = Image.new('RGBA', a.size, background)
                    delta = ImageChops.difference(Image.alpha_composite(matte, a), Image.alpha_composite(matte, b))
                    assert max(high for low, high in delta.getextrema()) <= 2, (name, background)
            else:
                assert a.tobytes() == b.tobytes(), name

with Image.open(ICONS / 'icon.ico') as ico:
    sizes = {16, 24, 32, 48, 64, 128, 256}
    assert ico.ico.sizes() == {(s, s) for s in sizes}
    for size in sizes:
        frame = ico.ico.getimage((size, size)).convert('RGBA')
        source = Image.open(BRAND / '.build/final' / f'{size}.png').convert('RGBA')
        assert frame.tobytes() == source.tobytes(), f'ICO {size}'

for name in ('16', '32', '64', '128', '512', '1024'):
    for concept in (BRAND / 'concepts').glob('*.svg'):
        with Image.open(BRAND / 'previews' / concept.stem / f'{name}.png') as image:
            assert image.size == (int(name), int(name))
    with Image.open(BRAND / 'previews/final' / f'{name}.png') as image:
        assert image.size == (int(name), int(name))

ns = {'svg': 'http://www.w3.org/2000/svg'}
master = ET.parse(ICONS / 'aegis.svg').getroot()
mark = ET.parse(ROOT / 'app/src/assets/aegis-mark.svg').getroot()
master_paths = {p.attrib['id']: p.attrib['d'] for p in master.findall('.//svg:path', ns) if 'id' in p.attrib}
assert [p.attrib['d'] for p in mark.findall('svg:path', ns)] == [master_paths['left'], master_paths['right']]
for path in [ICONS / 'aegis.svg', ROOT / 'app/src/assets/aegis-mark.svg', *(BRAND / 'concepts').glob('*.svg')]:
    svg = ET.parse(path).getroot()
    assert not svg.findall('.//svg:image', ns), path
    assert not svg.findall('.//svg:script', ns), path
    assert not svg.findall('.//svg:text', ns), path
for path in [BRAND / 'README.md', ROOT / 'README.md']:
    assert '\u2014' not in path.read_text(), path
print('Verified RGBA exports, transparency, exact blue, bundle paths, 10 ICNS frames with exact alpha and bounded legacy colour conversion, 7 exact ICO frames, all concept sizes and shared mark geometry.')
