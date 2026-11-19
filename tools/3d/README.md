# 3D data pipeline

`python3 tools/3d/prepare_world.py` regenerates `app3d/public/data/` (committed; deploy builds have no network).

Inputs: `app2d/map-county.json`, `spike/3d-naepo/data/{county,naepo}-buildings.geojson`, Terrarium tiles
(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/{x}/{y}.png`, cached in `build/dem-cache/`, gitignored).
Needs Python 3, Pillow, numpy, curl.

Outputs (game frame: x east, y south, metres from origin `[126.4, 36.69]`):

- `world.json`: bounds, origin, centre, start, height grid `{w,h,cell:25}`, `heightRange`, districts, county outline, terrain labels (x,y), credits.
- `features.json`: `{q, items:[{k,t,p,h?}]}`; `p` is delta-encoded integer decimetres (first pair absolute); kinds `road|water|waterway|rail|landuse|other`. Buildings excluded.
- `buildings.json`: game-map + county export + Naepo export buildings, deduplicated by OSM way id; the first source keeps the geometry and later sources fill in tags it lacks (`levels`, `height`, `name`, a specific `building` type over `yes`).
- `heights.png`: Terrarium-encoded RGB (`h = R*256 + G + B/256 - 32768`), row 0 = north edge, column 0 = west edge, 25 m cells, ocean keeps bathymetry.

Decode in JS with `app3d/src/data/decode.js`.
