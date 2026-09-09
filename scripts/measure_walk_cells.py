"""Read unmodified generated PNGs and record frame bounds for the game renderer.

The artwork's row spacing differs slightly from an exact grid. Find the quietest
horizontal split in each column near those observed gaps, then measure the
visible silhouette and head center. This writes metadata only, never PNGs.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
result = {}
for mode, name in [('walk', 'explorer'), ('boy', 'boy'), ('raccoon', 'raccoon')]:
    a = np.asarray(Image.open(root / f'dist/assets/walk-cycle-{name}.png').convert('RGB')).astype(int)
    height, width = a.shape[:2]
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mask = ~((r > 160) & (b > 160) & (g < 120) & (r-g > 80) & (b-g > 80))
    frames = []
    cuts = []
    for col in range(8):
        x0, x1 = round(col*width/8), round((col+1)*width/8)
        bounds = [0]
        for middle in [228, 445, 659]:
            lo, hi = middle-6, middle+7
            counts = mask[lo:hi, x0:x1].sum(axis=1)
            candidates = np.flatnonzero(counts == counts.min()) + lo
            bounds.append(int(candidates[len(candidates)//2]))
        cuts.append(bounds + [height])
    for row in range(4):
        for col in range(8):
            x0, x1 = round(col*width/8), round((col+1)*width/8)
            y0, y1 = cuts[col][row:row+2]
            ys, xs = np.nonzero(mask[y0:y1, x0:x1])
            left, right = int(xs.min()+x0), int(xs.max()+x0+1)
            top, bottom = int(ys.min()+y0), int(ys.max()+y0+1)
            # Hat/ears form a stable body anchor; a raccoon's tail must not move it.
            hy, hx = np.nonzero(mask[top:top+round((bottom-top)*.3), left:right])
            head_x = float((hx.min()+hx.max()+1)/2+left)
            frames.append({'rect': [left, top, right-left, bottom-top],
                           'pivot': [head_x, bottom], 'cellHeight': height/4})
    result[mode] = frames
(root / 'dist/walk-cells.js').write_text('// Measured source rectangles and foot baselines; original PNGs stay unchanged.\nexport const WALK_CELLS=' + json.dumps(result, separators=(',', ':')) + ';\n')
print(json.dumps({mode: len(frames) for mode, frames in result.items()}))
