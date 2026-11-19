// Sky dome (learning edition graphics upgrade). Same uniforms as the original dome, so updSky() drives it unchanged.
// Horizon-to-zenith gradient with a warm band around the sun at dusk, a sun disc or a moon, twinkling stars at night,
// and layered fbm clouds lit from the sun's side, thickening with the weather.
uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uDark;
uniform float uNight; uniform float uCloud; uniform float uTime; uniform float uDim; uniform float uLin;
varying vec3 vDir;

float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + vec2(11.3, 7.7); a *= 0.5; } return v; }

void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 sunDir = normalize(uSun);
  float sd = max(dot(d, sunDir), 0.0);
  float dusk = clamp(1.0 - abs(uNight - 0.35) / 0.3, 0.0, 1.0);          // 1 at sunset, 0 at noon and at night

  vec3 col = mix(uHor, uTop, pow(h, 0.5));
  // dusk: a pink middle band and a warm glow along the horizon on the sun's side
  float az = max(dot(normalize(d.xz + 1e-4), normalize(sunDir.xz + 1e-4)), 0.0);
  col = mix(col, mix(col, vec3(0.86, 0.42, 0.55), 0.35), dusk * smoothstep(0.02, 0.18, h) * (1.0 - smoothstep(0.18, 0.5, h)));
  col += uSunCol * dusk * pow(az, 3.0) * exp(-h * 9.0) * 0.55;

  // sun (by day) or moon (at night), with a soft halo
  float disc = smoothstep(0.99955, 0.99975, sd);
  col += uSunCol * (pow(sd, 32.0) * 0.28 + pow(sd, 6.0) * 0.1);
  col += uSunCol * disc * mix(2.4, 1.3, uNight);

  // stars
  if (uNight > 0.5 && d.y > 0.02) {
    vec2 sp = d.xz / (d.y + 0.35) * 80.0; float s = hash(floor(sp)); vec2 sf = fract(sp) - 0.5;
    float star = step(0.962, s) * smoothstep(0.22, 0.02, length(sf));
    col += vec3(0.9, 0.95, 1.0) * star * smoothstep(0.5, 1.0, uNight) * (0.5 + 0.5 * sin(uTime * 2.3 + s * 40.0)) * smoothstep(0.02, 0.25, d.y) * (1.0 - uCloud);
  }

  // clouds: two layers drifting at different speeds, lit on the side facing the sun, darker at the base
  if (d.y > 0.0) {
    vec2 cp = d.xz / (d.y + 0.12);
    float n1 = fbm(cp * 1.1 + vec2(uTime * 0.010, uTime * 0.003));
    float n2 = fbm(cp * 2.6 + vec2(uTime * 0.018, -uTime * 0.004) + 5.0);
    float n = n1 * 0.7 + n2 * 0.3;
    float cover = 0.62 - uCloud * 0.42;
    float c = smoothstep(cover, cover + 0.22, n) * smoothstep(0.0, 0.16, d.y);
    float lit = smoothstep(0.0, 0.25, fbm(cp * 1.1 + sunDir.xz * 0.15 + vec2(uTime * 0.010, uTime * 0.003)) - n1 + 0.12);
    vec3 base = mix(uHor, vec3(1.0), 0.6 - 0.5 * uNight) * (1.0 - 0.4 * uCloud);
    vec3 cc = mix(base * 0.72, base + uSunCol * (0.25 + 0.6 * dusk), lit);
    cc += uSunCol * pow(sd, 5.0) * 0.3;
    col = mix(col, cc, c * (0.6 + 0.35 * uCloud));
  }
  col = mix(uDark, col, uDim);
  if (uLin > 0.5) col = pow(max(col, vec3(0.0)), vec3(2.2));   // baking the reflection map: light, not display colours
  gl_FragColor = vec4(col, 1.0);
}
