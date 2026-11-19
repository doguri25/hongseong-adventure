import * as THREE from 'three';
import skyFrag from '../shaders/sky.frag?raw';

const SKY_VS = 'varying vec3 vDir;\nvoid main(){ vDir = position; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }';

export const TIMES = {
  day: { label: '낮', top: 0x3c7cd0, hor: 0xc4dcef, sunCol: 0xfff1d6, elev: 52, az: 140, sun: 3.1, hemiSky: 0xcfe2ff, hemiGround: 0x6d7d4c, hemi: 1.15, fog: 0xc6dceb, night: 0, dusk: 0, windows: 0, lamps: 0, bloom: 0.18, exposure: 1.0, cloud: 0.28 },
  dusk: { label: '노을', top: 0x35508f, hor: 0xf4b07a, sunCol: 0xffb070, elev: 10, az: 250, sun: 2.9, hemiSky: 0xd9b9a6, hemiGround: 0x6b5a44, hemi: 1.0, fog: 0xe3ae8a, night: 0.3, dusk: 1, windows: 0.45, lamps: 1.6, bloom: 0.45, exposure: 1.1, cloud: 0.35 },
  night: { label: '밤', top: 0x050b1e, hor: 0x1f3156, sunCol: 0xa8bcff, elev: 38, az: 200, sun: 0.7, hemiSky: 0x3a4f86, hemiGround: 0x1a2028, hemi: 0.55, fog: 0x1b2843, night: 1, dusk: 0, windows: 1.6, lamps: 4.0, bloom: 0.65, exposure: 1.25, cloud: 0.2 },
};

export function sunDirection(T, out = new THREE.Vector3()) {
  const el = THREE.MathUtils.degToRad(T.elev), az = THREE.MathUtils.degToRad(T.az);
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

export function createSky(scene, renderer) {
  const uniforms = {
    uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() }, uDark: { value: new THREE.Color(0x000000) },
    uNight: { value: 0 }, uCloud: { value: 0.25 }, uTime: { value: 0 }, uDim: { value: 1 }, uLin: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: skyFrag, uniforms, side: THREE.BackSide, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat);
  mesh.frustumCulled = false; mesh.renderOrder = 1000; scene.add(mesh);
  if (!scene.fog) scene.fog = new THREE.Fog(0xc6dceb, 1200, 5200);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const bakeScene = new THREE.Scene();
  const clone = new THREE.Mesh(mesh.geometry, mat);
  bakeScene.add(clone);
  let envRT = null;
  const sunDir = new THREE.Vector3();

  function applyTime(key) {
    const T = TIMES[key] || TIMES.day;
    sunDirection(T, sunDir);
    uniforms.uTop.value.set(T.top); uniforms.uHor.value.set(T.hor); uniforms.uSunCol.value.set(T.sunCol);
    uniforms.uSun.value.copy(sunDir); uniforms.uNight.value = T.night; uniforms.uCloud.value = T.cloud;
    scene.fog.color.set(T.fog);
    renderer.toneMappingExposure = T.exposure;
    // bake the sky into an environment map for paint, glass and water reflections (linear light when baking)
    uniforms.uLin.value = 1; clone.scale.setScalar(50);
    const old = envRT;
    envRT = pmrem.fromScene(bakeScene, 0, 0.1, 1000);
    scene.environment = envRT.texture;
    old?.dispose();
    uniforms.uLin.value = 0;
    return T;
  }
  function update(cameraPosition, t) { mesh.position.copy(cameraPosition); uniforms.uTime.value = t; }
  return { mesh, uniforms, sunDir, applyTime, update };
}
