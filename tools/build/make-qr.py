"""Makes app3d/src/assets/qr-pages.png, the 3D game's QR picture (app3d/src/ui/qr.js), once; the PNG is committed and
the game draws no QR code at run time.

The picture holds the GitHub Pages address (qr.js QR_URL) as a version 4 QR code at error level M, 10 px per module
with the standard 4-module quiet zone: 410 x 410 px, black modules on white, the size and level of the 2D game's own
picture (app2d/assets/demo-qr.png, which keeps its own address). segno is pinned exactly and lives only in a
throwaway venv, never in the repo. From the repo root:

    python3 -m venv /tmp/qr-venv && /tmp/qr-venv/bin/pip install segno==1.6.6
    /tmp/qr-venv/bin/python tools/build/make-qr.py
"""
from pathlib import Path

import segno

URL = 'https://doguri25.github.io/hongseong-adventure/'
REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'app3d' / 'src' / 'assets' / 'qr-pages.png'

assert segno.__version__ == '1.6.6', segno.__version__
qr = segno.make_qr(URL, error='m', version=4, mode='byte', boost_error=False)
OUT.parent.mkdir(parents=True, exist_ok=True)
qr.save(str(OUT), kind='png', scale=10, border=4, dark='#000', light='#fff')
print(f'{OUT.relative_to(REPO)}: {qr.designator}, {qr.symbol_size(scale=10, border=4)} px, {URL}')
