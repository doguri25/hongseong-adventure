import * as THREE from 'three';
import { sunDirection } from './sky.js';

export function createLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.8;
  scene.add(hemi, sun, sun.target);
  const dir = new THREE.Vector3(0, 1, 0);

  function setTime(T) {
    sunDirection(T, dir);
    sun.color.set(T.sunCol); sun.intensity = T.sun;
    hemi.color.set(T.hemiSky); hemi.groundColor.set(T.hemiGround); hemi.intensity = T.hemi;
  }
  // The shadow box follows the player (and where a flying vehicle's shadow lands).
  function follow([X, Y, Z], heightAboveGround, camDist, shadowSize) {
    const groundY = Y - heightAboveGround;
    const off = Math.max(0, heightAboveGround) / Math.max(0.2, dir.y);
    const sx = X - dir.x * off * 0.5, sz = Z - dir.z * off * 0.5;
    const span = 300 + camDist * 0.9 + off * 0.6;
    const sc = sun.shadow.camera;
    if (sc.right !== span) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 10; sc.far = 4000; sc.updateProjectionMatrix(); }
    sun.target.position.set(sx, groundY, sz);
    sun.position.set(sx + dir.x * 1800, groundY + dir.y * 1800, sz + dir.z * 1800);
    if (shadowSize && sun.shadow.mapSize.x !== shadowSize) {
      sun.shadow.mapSize.set(shadowSize, shadowSize); sun.shadow.map?.dispose(); sun.shadow.map = null;
    }
  }
  return { sun, hemi, setTime, follow };
}
