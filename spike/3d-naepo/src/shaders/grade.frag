// Final look (learning edition graphics upgrade), before ACES tone mapping in OutputPass:
// chromatic aberration and radial blur at the edges when the car is very fast (nitro), a cool cast in the shadows at night
// and a warm one at dusk, a light vignette, a green or red flash on right and wrong answers, and fine grain.
// In the rain, drops gather on the lens, bend the picture behind them and dry away again (graphics upgrade 2).
uniform sampler2D tDiffuse;
uniform float uTime, uSpeed, uFlash, uNight, uDusk, uRain, uAspect;
uniform vec3 uFlashColor;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// one layer of drops: a grid of cells, some holding a drop that swells, slips a little and fades; returns the bend and a rim highlight
vec3 drops(vec2 uv, float scale, float t, float amount) {
  vec2 g = vec2(uv.x * uAspect, uv.y) * scale;
  vec2 id = floor(g), f = fract(g) - 0.5;
  float r = h(id + scale);
  if (r > amount) return vec3(0.0);
  float life = fract(t * (0.12 + 0.1 * h(id + 2.7)) + r * 9.0);
  vec2 p = vec2(h(id + 4.1) - 0.5, h(id + 8.3) - 0.5) * 0.5 - vec2(0.0, life * life * 0.25);
  float rad = (0.16 + 0.14 * h(id + 1.9)) * smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.7, 1.0, life));
  vec2 d = (f - p) * vec2(1.0, 0.85);
  float m = smoothstep(rad, rad * 0.75, length(d));
  return vec3(d * m / max(rad, 1e-3), m * smoothstep(0.0, rad, length(d - vec2(-0.05, 0.05))));
}
void main() {
  vec2 uv = vUv;
  vec3 da = vec3(0.0), db = vec3(0.0);
  if (uRain > 0.01) {
    da = drops(vUv, 7.0, uTime, 0.3 * uRain); db = drops(vUv + 0.37, 13.0, uTime * 1.3, 0.34 * uRain);
    uv -= (da.xy * 0.022 + db.xy * 0.012) * (1.0 - 0.6 * uSpeed);
  }
  vec2 c = uv - 0.5;
  float r = length(c);
  float ca = uSpeed * 0.004 * r;
  vec3 col = vec3(texture2D(tDiffuse, uv - c * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv + c * ca).b);
  if (uSpeed > 0.01) {
    vec3 blur = vec3(0.0);
    for (int i = 0; i < 6; i++) blur += texture2D(tDiffuse, uv - c * (float(i) / 6.0) * 0.04 * uSpeed).rgb;
    col = mix(col, blur / 6.0, smoothstep(0.3, 0.72, r) * uSpeed);
  }
  col += (da.z + db.z) * 0.03 * (1.0 + uNight);                       // the drops catch a little light at their rims
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 night = mix(col * vec3(0.86, 0.98, 1.16), col * vec3(1.06, 1.0, 0.92), smoothstep(0.05, 0.6, l));
  vec3 dusk = mix(col * vec3(0.95, 0.96, 1.06), col * vec3(1.08, 1.0, 0.9), smoothstep(0.05, 0.6, l));
  col = mix(col, night, uNight * 0.8);
  col = mix(col, dusk, uDusk * 0.7);
  col = mix(vec3(l), col, 1.0 + 0.12 * uNight);                       // neon a little more saturated at night
  col *= 1.0 - smoothstep(0.5, 0.98, r) * (0.28 + 0.2 * uNight);
  col += uFlashColor * uFlash * (0.12 + r * 0.8);
  col += (h(vUv * 911.0 + fract(uTime) * 37.0) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
