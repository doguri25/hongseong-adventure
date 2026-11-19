"""County data pipeline for the Three.js version (app3d/).

Inputs : app2d/map-county.json, spike/3d-naepo/data/{county,naepo}-buildings.geojson,
         Terrarium DEM tiles (downloaded once into build/dem-cache/).
Outputs: app3d/public/data/{world.json,features.json,buildings.json,heights.png}  (committed).
Run    : python3 tools/3d/prepare_world.py
Needs  : Python 3, Pillow, numpy, curl (only when tiles are not cached).
"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'app3d', 'public', 'data')
CACHE = os.environ.get('DEM_CACHE', os.path.join(ROOT, 'build', 'dem-cache'))
SPIKE = os.path.join(ROOT, 'spike', '3d-naepo', 'data')
ZOOM = 13
CELL = 25
Q = 10  # integer units per metre (decimetres)

game = json.load(open(os.path.join(ROOT, 'app2d', 'map-county.json')))
BOUNDS = game['bounds']           # lon0, lat0, lon1, lat1
ORIGIN = game['origin']
M_LON = 111320 * math.cos(ORIGIN[1] * math.pi / 180)
M_LAT = 111320


def project(p):
    return ((p[0] - ORIGIN[0]) * M_LON, (ORIGIN[1] - p[1]) * M_LAT)


X0, Y0 = project((BOUNDS[0], BOUNDS[3]))
X1, Y1 = project((BOUNDS[2], BOUNDS[1]))
CX, CY = (X0 + X1) / 2, (Y0 + Y1) / 2
WIDTH, HEIGHT = X1 - X0, Y1 - Y0


def delta(pts):
    """[[lon,lat]..] -> flat delta-encoded integer decimetres in the game frame (first pair absolute)."""
    flat, px, py = [], 0, 0
    for p in pts:
        x, y = project(p)
        ix, iy = round(x * Q), round(y * Q)
        flat += [ix - px, iy - py]
        px, py = ix, iy
    return flat


# ---------- features (everything except buildings)
KEEP = ('highway', 'oneway', 'bridge', 'name', 'natural', 'water', 'waterway', 'landuse', 'leisure',
        'railway', 'amenity', 'building', 'area', 'foot', 'access', 'layer')


def kind_of(t):
    if 'highway' in t: return 'road'
    if 'railway' in t: return 'rail'
    if 'waterway' in t: return 'waterway'
    if t.get('natural') == 'water' or 'water' in t: return 'water'
    if 'landuse' in t or 'leisure' in t or 'natural' in t: return 'landuse'
    return 'other'


items, game_buildings = [], []
for f in game['features']:
    if 'building' in f['tags']:
        game_buildings.append(f)
        continue
    it = {'k': kind_of(f['tags']), 't': {k: v for k, v in f['tags'].items() if k in KEEP}, 'p': delta(f['points'])}
    if f.get('holes'):
        it['h'] = [delta(h) for h in f['holes']]
    items.append(it)
feat_json = json.dumps({'q': 1 / Q, 'items': items}, ensure_ascii=False, separators=(',', ':'))
print('features', len(items), 'game buildings', len(game_buildings))

# ---------- buildings: game map + county export + Naepo export, deduplicated by OSM way id
BKEEP = {'building': 'building', 'building:levels': 'levels', 'height': 'height', 'name': 'name'}


def btags(tags):
    t = {}
    for src, dst in BKEEP.items():
        if src in tags and tags[src] not in ('', None):
            t[dst] = tags[src]
    return t


def in_bounds(ring):
    lon = sum(p[0] for p in ring) / len(ring); lat = sum(p[1] for p in ring) / len(ring)
    return BOUNDS[0] <= lon <= BOUNDS[2] and BOUNDS[1] <= lat <= BOUNDS[3]


bld, seen = [], {}
merged = {'levels': 0, 'height': 0, 'name': 0, 'building': 0}
def add(wid, tags, ring):
    """First source wins the geometry; later sources of the same way only fill in tags it lacks (M2/R6: the
    county and Naepo exports carry building:levels and height that the game map dropped)."""
    wid = str(wid)
    if len(ring) < 4:
        return False
    t = btags(tags)
    if wid in seen:
        have = seen[wid]['t']
        for k, v in t.items():
            if k == 'building' and have.get('building', 'yes') == 'yes' and v != 'yes':
                have['building'] = v; merged[k] += 1   # a specific type beats the bare "yes"
            elif k not in have:
                have[k] = v; merged[k] += 1
        return False
    t.setdefault('building', 'yes')
    b = {'id': wid, 't': t, 'p': delta(ring)}
    seen[wid] = b
    bld.append(b)
    return True

n_game = sum(add(f['id'], f['tags'], f['points']) for f in game_buildings)
for fn in ('county-buildings.geojson', 'naepo-buildings.geojson'):
    n = 0
    for f in json.load(open(os.path.join(SPIKE, fn)))['features']:
        g = f.get('geometry') or {}
        rings = [g['coordinates'][0]] if g.get('type') == 'Polygon' else [p[0] for p in g['coordinates']] if g.get('type') == 'MultiPolygon' else []
        props = f.get('properties', {})
        wid = str(f.get('id') or props.get('@id', '')).split('/')[-1]
        for k, ring in enumerate(rings):
            if in_bounds(ring):
                n += add(wid if k == 0 else f'{wid}_{k}', props, ring)
    print('buildings added from', fn, n)
print('buildings total', len(bld), '(game map', n_game, ')', 'tags merged from later sources', merged,
      'with levels', sum('levels' in b['t'] for b in bld), 'with height', sum('height' in b['t'] for b in bld))
bld_json = json.dumps({'q': 1 / Q, 'items': bld}, ensure_ascii=False, separators=(',', ':'))

# ---------- Terrarium DEM
def tile_xy(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


tx_a, ty_a = tile_xy(BOUNDS[0], BOUNDS[3], ZOOM)
tx_b, ty_b = tile_xy(BOUNDS[2], BOUNDS[1], ZOOM)
tx0, ty0, tx1, ty1 = int(tx_a) - 1, int(ty_a) - 1, int(tx_b) + 1, int(ty_b) + 1
os.makedirs(CACHE, exist_ok=True)
mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), dtype=np.float32)
for tx in range(tx0, tx1 + 1):
    for ty in range(ty0, ty1 + 1):
        fn = os.path.join(CACHE, f'{ZOOM}_{tx}_{ty}.png')
        if not os.path.exists(fn) or os.path.getsize(fn) < 200:
            url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{tx}/{ty}.png'
            subprocess.run(['curl', '-sSf', '-m', '60', '--retry', '3', '-o', fn, url], check=True)
        a = np.asarray(Image.open(fn).convert('RGB')).astype(np.float32)
        mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
print('dem tiles', (tx1 - tx0 + 1) * (ty1 - ty0 + 1), 'mosaic', mosaic.shape)

GW, GH = math.ceil(WIDTH / CELL) + 1, math.ceil(HEIGHT / CELL) + 1
ii, jj = np.meshgrid(np.arange(GW), np.arange(GH))
lon = ORIGIN[0] + (X0 + ii * CELL) / M_LON
lat = ORIGIN[1] - (Y0 + jj * CELL) / M_LAT
n = 2 ** ZOOM
px = ((lon + 180) / 360 * n - tx0) * 256 - 0.5
latr = np.radians(lat)
py = ((1 - np.log(np.tan(latr) + 1 / np.cos(latr)) / math.pi) / 2 * n - ty0) * 256 - 0.5
px = np.clip(px, 0, mosaic.shape[1] - 1.001); py = np.clip(py, 0, mosaic.shape[0] - 1.001)
ix, iy = px.astype(int), py.astype(int); fx, fy = px - ix, py - iy
H = ((mosaic[iy, ix] * (1 - fx) + mosaic[iy, ix + 1] * fx) * (1 - fy) + (mosaic[iy + 1, ix] * (1 - fx) + mosaic[iy + 1, ix + 1] * fx) * fy)

# no-data (far below the sea floor values seen here): fill from valid 4-neighbours, repeating
bad = H < -60
print('no-data cells', int(bad.sum()))
for _ in range(200):
    if not bad.any(): break
    P = np.pad(H, 1, constant_values=0); V = np.pad(~bad, 1, constant_values=False)
    s = sum(np.where(V[1 + dy:GH + 1 + dy, 1 + dx:GW + 1 + dx], P[1 + dy:GH + 1 + dy, 1 + dx:GW + 1 + dx], 0) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    c = sum(V[1 + dy:GH + 1 + dy, 1 + dx:GW + 1 + dx].astype(int) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    fill = bad & (c > 0)
    H[fill] = s[fill] / c[fill]
    bad = bad & ~fill
assert not bad.any()
hmin, hmax = float(H.min()), float(H.max())
print('height range', round(hmin, 1), round(hmax, 1), 'grid', GW, GH)

v = np.round((H + 32768) * 256).astype(np.uint32)
rgb = np.stack([(v >> 16) & 255, (v >> 8) & 255, v & 255], axis=-1).astype(np.uint8)
os.makedirs(OUT, exist_ok=True)
Image.fromarray(rgb, 'RGB').save(os.path.join(OUT, 'heights.png'), optimize=True)

# ---------- world.json
labels = [{'name': l['name'], 'x': round(project((l['lon'], l['lat']))[0], 1), 'y': round(project((l['lon'], l['lat']))[1], 1),
           'elevation': float(l['elevation'])} for l in game['terrainLabels']]
ts, bs = game['terrainSource'], game['boundarySource']
credits = [
    f"지도 데이터 © OpenStreetMap contributors ({game['license']}) {game['source']}",
    f"지형 {ts['attribution']} ({ts['source']})",
    bs['attribution'],
    '건물·나무·가로등 등 장식 오브젝트는 실제 위치를 나타내지 않는 임의 배치이며 이름표가 없습니다.',
]
world = {
    'bounds': BOUNDS, 'origin': ORIGIN, 'center': [round(CX, 2), round(CY, 2)],
    'start': [round(c, 1) for c in project(game['start'])],
    'grid': {'w': GW, 'h': GH, 'cell': CELL}, 'heightRange': [round(hmin, 2), round(hmax, 2)],
    'districts': [{'name': d['name'], 'county': d['county'], 'bounds': d['bounds'], 'geometry': d['geometry']} for d in game['districts']],
    'countyGeometry': game['countyGeometry'], 'terrainLabels': labels, 'credits': credits,
}
open(os.path.join(OUT, 'features.json'), 'w').write(feat_json)
open(os.path.join(OUT, 'buildings.json'), 'w').write(bld_json)
json.dump(world, open(os.path.join(OUT, 'world.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
for fn in ('world.json', 'features.json', 'buildings.json', 'heights.png'):
    print(f'{fn:15s} {os.path.getsize(os.path.join(OUT, fn)):>10,d} bytes')
if os.path.getsize(os.path.join(OUT, 'features.json')) > 3.5e6:
    sys.exit('features.json exceeds 3.5 MB')
