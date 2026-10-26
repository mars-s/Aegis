"""Compose review PNGs from the SVG renders, using Pillow's bundled font."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / 'docs/brand'
CONCEPTS = [
    ('01-folded-shield', 'Folded shield', 'Two protective planes. One open seam.'),
    ('02-orbital-table', 'Orbital table', 'A working plane. An intelligence point above it.'),
    ('03-canvas-a', 'Canvas A', 'An architectural initial. A blue window at its joint.'),
    ('04-card-aperture', 'Card aperture', 'Four interlocking planes. A clear centre.')
]
BG = '#101215'
FG = '#edf0f4'
MUTED = '#99a3af'

def font(size):
    return ImageFont.load_default(size=size)

def paste(base, path, xy):
    im = Image.open(path).convert('RGBA')
    base.paste(im, xy, im)

sheet = Image.new('RGB', (1760, 1580), BG)
draw = ImageDraw.Draw(sheet)
draw.text((64, 40), 'Aegis', font=font(49), fill=FG)
draw.text((64, 104), 'Four studies in protection and spatial intelligence', font=font(24), fill=MUTED)
for i, (name, title, description) in enumerate(CONCEPTS):
    x, y = 48 + (i % 2) * 880, 184 + (i // 2) * 684
    draw.text((x + 18, y), title, font=font(30), fill=FG)
    draw.text((x + 18, y + 44), description, font=font(19), fill=MUTED)
    paste(sheet, BRAND / 'previews' / name / '512.png', (x, y + 84))
    for size, offset in [(16, 90), (32, 150), (64, 228), (128, 344)]:
        draw.text((x + 576, y + offset), f'{size} px', font=font(18), fill=MUTED)
        paste(sheet, BRAND / 'previews' / name / f'{size}.png', (x + 680 - size // 2, y + offset + 30))
    draw.line((x + 18, y + 632, x + 806, y + 632), fill='#292e35', width=1)
draw.text((64, 1524), 'Original vector studies. Black, platinum and #3f8dfd. Shared 824 / 1024 body grid.', font=font(20), fill=MUTED)
sheet.save(BRAND / 'contact-sheet.png')

# Nearest-neighbour enlargement exposes the actual pixels at the smallest sizes.
pixels = Image.new('RGB', (1440, 500), BG)
draw = ImageDraw.Draw(pixels)
draw.text((40, 24), 'Small-size inspection', font=font(32), fill=FG)
for i, (name, title, _) in enumerate(CONCEPTS):
    x = 32 + i * 356
    draw.text((x, 84), title, font=font(23), fill=FG)
    for size, y, factor in [(16, 130, 8), (32, 318, 4)]:
        im = Image.open(BRAND / 'previews' / name / f'{size}.png').convert('RGBA')
        im = im.resize((size * factor, size * factor), Image.Resampling.NEAREST)
        pixels.paste(im, (x, y), im)
        draw.text((x + 154, y + 52), f'{size} px', font=font(22), fill=MUTED)
pixels.save(BRAND / 'previews' / 'concept-pixels.png')

final = BRAND / 'previews/final'
proof = Image.new('RGB', (1744, 1440), BG)
draw = ImageDraw.Draw(proof)
draw.text((48, 32), 'Folded shield', font=font(44), fill=FG)
draw.text((48, 92), 'Final master and independent renders at actual pixel sizes', font=font(23), fill=MUTED)
paste(proof, final / '1024.png', (0, 172))
paste(proof, final / '512.png', (1112, 172))
draw.text((1176, 704), '512 px', font=font(21), fill=MUTED)
for size, x in [(16, 1128), (32, 1256), (64, 1400), (128, 1552)]:
    paste(proof, final / f'{size}.png', (x, 804))
    draw.text((x, 956), f'{size} px', font=font(20), fill=MUTED)
for size, x, factor in [(16, 1128, 8), (32, 1384, 4)]:
    im = Image.open(final / f'{size}.png').convert('RGBA').resize((128, 128), Image.Resampling.NEAREST)
    proof.paste(im, (x, 1080), im)
    draw.text((x, 1230), f'{size} px, enlarged', font=font(19), fill=MUTED)
draw.text((100, 1240), '1024 px', font=font(21), fill=MUTED)
draw.text((48, 1370), 'Same silhouette at every size. 64-unit open seam. 96-unit cap and side thickness.', font=font(22), fill=MUTED)
proof.save(BRAND / 'size-proof.png')

# A simulated Dock with neutral placeholders. These are not other apps' artwork.
dock = Image.new('RGB', (1440, 520), '#090d14')
draw = ImageDraw.Draw(dock)
draw.text((56, 36), 'Aegis in the Dock', font=font(38), fill=FG)
draw.text((56, 94), 'Simulated 128 px slots, with plain placeholder icons for scale', font=font(22), fill=MUTED)
draw.rounded_rectangle((126, 202, 1314, 388), radius=36, fill='#20252d', outline='#343b45', width=1)
xs = [178 + i * 160 for i in range(7)]
colours = ['#6c849c', '#d7dce2', '#c1a68b', None, '#b0bcc6', '#596b83', '#d2d7dc']
for i, (x, colour) in enumerate(zip(xs, colours)):
    if colour:
        draw.rounded_rectangle((x + 13, 228, x + 115, 330), radius=26, fill=colour)
    else:
        paste(dock, final / '128.png', (x, 215))
        draw.ellipse((x + 61, 355, x + 67, 361), fill='#e5eaf0')
        draw.text((x + 34, 410), 'Aegis', font=font(24), fill=FG)
dock.save(BRAND / 'dock-row.png')

social = Image.new('RGB', (1280, 640), '#030405')
paste(social, final / '512.png', (704, 64))
draw = ImageDraw.Draw(social)
draw.text((94, 222), 'Aegis', font=font(88), fill=FG)
draw.text((99, 350), 'A canvas for you and your agents.', font=font(28), fill='#b6c0cc')
social.save(BRAND / 'social.png')

# The flat mark sits beside an illustrative orb, not a replacement orb asset.
lockup = Image.new('RGB', (1000, 360), '#030405')
draw = ImageDraw.Draw(lockup)
draw.text((40, 28), 'Brand mark and agent orb', font=font(28), fill=FG)
draw.text((40, 74), 'Static identity beside an illustrative agent presence', font=font(20), fill=MUTED)
paste(lockup, BRAND / 'previews/mark/128.png', (220, 152))
draw.line((475, 154, 475, 284), fill='#2b3139', width=1)
draw.ellipse((620, 176, 700, 256), fill='#3f8dfd')
draw.text((205, 300), 'Aegis mark', font=font(18), fill=MUTED)
draw.text((602, 300), 'Orb placeholder', font=font(18), fill=MUTED)
lockup.save(BRAND / 'mark-and-orb.png')
