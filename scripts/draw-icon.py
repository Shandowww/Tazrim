"""Generate the original Monthly Flow icon. Development-only dependency: Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw
import math

size = 1024
im = Image.new('RGB', (size, size))
pix = im.load()
for y in range(size):
    for x in range(size):
        glow = max(0, 1 - math.hypot(x-230, y-150)/1150)
        pix[x,y] = tuple(round(a+(b-a)*glow) for a,b in zip((199,184,228),(232,224,246)))
d = ImageDraw.Draw(im)
def box(coords, radius, fill):
    d.rounded_rectangle(tuple(int(v*2) for v in coords), radius=radius*2, fill=fill)
def ellipse(coords, fill, outline=None, width=1):
    d.ellipse(tuple(int(v*2) for v in coords), fill=fill, outline=outline, width=width*2)
# Grounding shadow, inset enough for circular and squircle icon masks.
ellipse((116,369,404,410), '#b8abd0')
# A cream card peeking out of the wallet.
card = Image.new('RGBA', (430,150))
ImageDraw.Draw(card).rounded_rectangle((0,0,429,149),radius=32,fill='#fff9ec')
card = card.rotate(9, resample=Image.Resampling.BICUBIC, expand=True)
im.paste(card,(254,376),card)
d = ImageDraw.Draw(im)
# Peach savings coin, with a flowing wave instead of a currency symbol.
ellipse((251,112,381,242),'#e6a578')
ellipse((251,105,381,235),'#f6c8a8')
ellipse((263,117,369,223),'#f6c8a8','#fff0da',3)
points=[]
for i in range(121):
    t=i/120
    x=286+61*t
    y=170-15*math.sin(t*2*math.pi)
    points.append((round(x*2),round(y*2)))
d.line(points, fill='#bd7e5e', width=10, joint='curve')
# Mint wallet and rounded fastening tab.
box((105,229,406,393),43,'#79aa91')
box((105,217,406,381),43,'#b1d8bf')
d.line([(136*2,240*2),(373*2,240*2)],fill='#d5ecda',width=6)
box((295,270,421,338),24,'#7aa88e')
box((295,266,421,328),24,'#8fbea2')
ellipse((317,286,338,307),'#fff9ec')
# Small four-point sparkle: cheerful without visual clutter.
star=[(139,116),(145,138),(166,144),(145,150),(139,172),(133,150),(112,144),(133,138)]
d.polygon([(x*2,y*2) for x,y in star],fill='#fff9ec')
root=Path(__file__).resolve().parents[1]/'public/icons'
root.mkdir(parents=True,exist_ok=True)
for name,n in [('app-icon-v1.png',512),('app-icon-192-v1.png',192),('apple-touch-icon-v1.png',180),('favicon-v1.png',32)]:
    im.resize((n,n),Image.Resampling.LANCZOS).save(root/name,optimize=True)
print('Original icon and home-screen sizes generated.')
