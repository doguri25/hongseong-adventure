// Outfit tint: the 2D game colours its explorer with CSS filters (dist/wardrobe.js OUTFIT_FILTERS). This composes the same
// hue-rotate / saturate / sepia filters (W3C filter-effects matrices) into one RGB 3x3 row-major matrix.
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// a * b for row-major 3x3 (apply b first, then a)
function mul(a, b) {
  const o = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
}

export function hueRotate(deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}
export function saturate(v) {
  return [
    0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v,
    0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v,
    0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v,
  ];
}
export function sepia(amount) {
  const k = 1 - Math.max(0, Math.min(1, amount));
  return [
    0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k,
    0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k,
    0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k,
  ];
}

function arg(raw, unit) {
  const m = /^\s*(-?\d*\.?\d+)\s*(deg|rad|turn|%)?\s*$/.exec(raw);
  if (!m) return null;
  const n = parseFloat(m[1]), u = m[2];
  if (unit === 'angle') return u === 'rad' ? (n * 180) / Math.PI : u === 'turn' ? n * 360 : n;
  return u === '%' ? n / 100 : n;
}

// 'hue-rotate(120deg) saturate(1.2)' -> [r0 r1 r2, g0 g1 g2, b0 b1 b2] (row-major). 'none' / unknown -> identity.
export function outfitMatrix(filter) {
  let m = IDENTITY;
  if (!filter || filter === 'none') return [...m];
  const re = /([a-z-]+)\(([^)]*)\)/g;
  let hit;
  while ((hit = re.exec(filter))) {
    const [, name, raw] = hit;
    let f = null;
    if (name === 'hue-rotate') { const a = arg(raw || '0', 'angle'); if (a !== null) f = hueRotate(a); }
    else if (name === 'saturate') { const v = arg(raw || '1'); if (v !== null) f = saturate(Math.max(0, v)); }
    else if (name === 'sepia') { const v = arg(raw || '1'); if (v !== null) f = sepia(v); }
    if (f) m = mul(f, m);
  }
  return [...m];
}

export const applyMatrix = (m, [r, g, b]) => [
  m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b,
];

// Patch a SpriteMaterial so its texture colour goes through `matrix` (a THREE.Matrix3 kept up to date by the caller).
// The CSS filters act on sRGB values, so the maths happens in sRGB space.
export function applyOutfit(material, matrix, key = 'outfit') {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.outfitMatrix = { value: matrix };
    shader.fragmentShader = 'uniform mat3 outfitMatrix;\n' + shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      {
        vec3 s = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));
        s = clamp(outfitMatrix * s, 0.0, 1.0);
        diffuseColor.rgb = pow(s, vec3(2.2));
      }`,
    );
  };
  material.customProgramCacheKey = () => key;
  return material;
}
