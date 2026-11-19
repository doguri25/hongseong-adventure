"""Prepare data for the throwaway 3D Naepo spike.

Reads the game's own map (dist/map-county.json) and places, downloads Terrarium
DEM tiles (same source the game already credits), and writes spike/3d-naepo/build/data.json.
Run: python3 spike/3d-naepo/tools/prepare.py  (optional: buildings from an Overpass JSON at OSM_BUILDINGS)
"""
import json, math, os, io, base64, struct, subprocess, sys, urllib.request
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'spike', '3d-naepo', 'build')
CACHE = os.environ.get('DEM_CACHE', os.path.join(OUT, 'dem-cache'))
BBOX = (126.625, 36.618, 126.705, 36.675)          # lon0, lat0, lon1, lat1  (Naepo new town + Yongbongsan)
ZOOM = 14
GRID = (321, 285)                                  # height samples (x, y) ~25 m spacing

game = json.load(open(os.path.join(ROOT, 'dist', 'map-county.json')))
ORIGIN = game['origin']                            # same local metres as the game: x east, y south
M_LON = 111320 * math.cos(ORIGIN[1] * math.pi / 180); M_LAT = 111320
def project(p): return [round((p[0] - ORIGIN[0]) * M_LON, 1), round((ORIGIN[1] - p[1]) * M_LAT, 1)]
def inside(p, pad=0.002): return BBOX[0] - pad <= p[0] <= BBOX[2] + pad and BBOX[1] - pad <= p[1] <= BBOX[3] + pad

# ---------- map features
keep = []
for f in game['features']:
    pts = f['points']
    if not any(inside(p) for p in pts[::max(1, len(pts) // 50)] + [pts[-1]]):
        continue
    if f['id'] == 'county-sea':
        continue
    item = {'t': f['tags'], 'p': [project(p) for p in pts], 'h': [[project(p) for p in r] for r in f.get('holes', [])]}
    if 'building' in f['tags']: item['id'] = str(f['id'])
    keep.append(item)
print('features', len(keep))

# ---------- extra OSM buildings (optional)
osm_path = os.environ.get('OSM_BUILDINGS') or os.path.join(ROOT, 'spike', '3d-naepo', 'data', 'naepo-buildings.geojson')
if osm_path and os.path.exists(osm_path):
    seen = {k.get('id') for k in keep if 'building' in k['t']}
    n = 0
    src = json.load(open(osm_path))
    shapes = []
    if 'elements' in src:   # Overpass JSON (out geom)
        shapes = [(e.get('tags', {}), [[g['lon'], g['lat']] for g in e['geometry']]) for e in src['elements'] if e.get('type') == 'way' and 'geometry' in e]
    else:                   # GeoJSON, e.g. an overpass-turbo export
        for f in src.get('features', []):
            g = f.get('geometry') or {}
            rings = [g['coordinates'][0]] if g.get('type') == 'Polygon' else [p[0] for p in g['coordinates']] if g.get('type') == 'MultiPolygon' else []
            props = f.get('properties', {}); props = props.get('tags', props)
            shapes += [(dict(props, **{'@id': f.get('id') or props.get('@id', '')}), r) for r in rings]
    if 'elements' in src: shapes = [(dict(t, **{'@id': 'way/%s' % e['id']}), r) for (t, r), e in zip(shapes, [e for e in src['elements'] if e.get('type') == 'way' and 'geometry' in e])]
    for tags0, ring in shapes:
        if 'building' not in tags0 or len(ring) < 4: continue
        pts = [project(p) for p in ring]
        wid = str(tags0.get('@id', '')).split('/')[-1]
        if wid and wid in seen: continue
        tags = {k: v for k, v in tags0.items() if k in ('building', 'building:levels', 'height', 'name', 'amenity')}
        keep.append({'t': tags, 'p': pts, 'h': [], 'id': wid}); seen.add(wid); n += 1
    print('osm buildings added', n)

# ---------- DEM (Terrarium, same tiles family the game credits)
def tile_xy(lon, lat, z):
    n = 2 ** z; x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y
x0, y0 = tile_xy(BBOX[0], BBOX[3], ZOOM); x1, y1 = tile_xy(BBOX[2], BBOX[1], ZOOM)
tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
os.makedirs(CACHE, exist_ok=True); os.makedirs(OUT, exist_ok=True)
mosaic = Image.new('RGB', ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
for tx in range(tx0, tx1 + 1):
    for ty in range(ty0, ty1 + 1):
        fn = os.path.join(CACHE, f'{ZOOM}_{tx}_{ty}.png')
        if not os.path.exists(fn):
            url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{tx}/{ty}.png'
            subprocess.run(['curl', '-sS', '-m', '60', '-o', fn, url], check=True)
        mosaic.paste(Image.open(fn).convert('RGB'), ((tx - tx0) * 256, (ty - ty0) * 256))
px = mosaic.load()
def elev(lon, lat):
    x, y = tile_xy(lon, lat, ZOOM); x = (x - tx0) * 256; y = (y - ty0) * 256
    ix, iy = int(x), int(y); fx, fy = x - ix, y - iy
    def h(a, b):
        r, g, bl = px[min(a, mosaic.width - 1), min(b, mosaic.height - 1)]
        return r * 256 + g + bl / 256 - 32768
    return (h(ix, iy) * (1 - fx) + h(ix + 1, iy) * fx) * (1 - fy) + (h(ix, iy + 1) * (1 - fx) + h(ix + 1, iy + 1) * fx) * fy
heights = []
for j in range(GRID[1]):
    lat = BBOX[3] - (BBOX[3] - BBOX[1]) * j / (GRID[1] - 1)
    for i in range(GRID[0]):
        lon = BBOX[0] + (BBOX[2] - BBOX[0]) * i / (GRID[0] - 1)
        heights.append(max(-50, elev(lon, lat)))
# a few Terrarium cells hold no-data values far below sea level: fill them from their neighbours
W_, H_ = GRID
for _ in range(4):
    for k, h in enumerate(heights):
        if h < -1:
            i, j = k % W_, k // W_
            n = [heights[jj * W_ + ii] for ii, jj in ((i - 1, j), (i + 1, j), (i, j - 1), (i, j + 1)) if 0 <= ii < W_ and 0 <= jj < H_ and heights[jj * W_ + ii] >= -1]
            if n: heights[k] = sum(n) / len(n)
print('height range', round(min(heights), 1), round(max(heights), 1))
raw = b''.join(struct.pack('<H', max(0, min(65535, round((h + 50) * 10)))) for h in heights)

# ---------- places inside the area
places = json.loads(subprocess.run(['node', os.path.join(ROOT, 'spike', '3d-naepo', 'tools', 'dump-places.mjs')], capture_output=True, text=True, check=True).stdout)
places = [dict(p, x=project([p['lon'], p['lat']])) for p in places if inside([p['lon'], p['lat']], 0)]
print('places', len(places))

# ---------- explorer walk sheet: key out the magenta chroma background once, keep the measured cells
DIST = os.path.join(ROOT, 'dist')
im = Image.open(os.path.join(DIST, 'assets', 'walk-cycle-explorer.png')).convert('RGBA')
pix = im.load()
for y in range(im.height):
    for x in range(im.width):
        r, g, bb, _ = pix[x, y]
        if r > 160 and bb > 160 and g < 120 and r - g > 80 and bb - g > 80: pix[x, y] = (0, 0, 0, 0)
im.save(os.path.join(OUT, 'walk-explorer.webp'), 'WEBP', quality=90, method=6)
cells_src = open(os.path.join(DIST, 'walk-cells.js')).read()
cells = json.loads(cells_src[cells_src.index('{'):cells_src.rindex('}') + 1])['walk']
json.dump({'size': im.size, 'cells': cells}, open(os.path.join(OUT, 'walk-cells.json'), 'w'))

a = project([BBOX[0], BBOX[3]]); b = project([BBOX[2], BBOX[1]])
os.makedirs(OUT, exist_ok=True)
county = [project([game['bounds'][0], game['bounds'][3]]), project([game['bounds'][2], game['bounds'][1]])]
json.dump({'bbox': BBOX, 'origin': ORIGIN, 'min': a, 'max': b, 'start': project(game['start']), 'county': county,
           'grid': GRID, 'heights': base64.b64encode(raw).decode(), 'features': keep, 'places': places},
          open(os.path.join(OUT, 'data.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('wrote', os.path.getsize(os.path.join(OUT, 'data.json')), 'bytes')
