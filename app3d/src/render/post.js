import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import gradeFrag from '../shaders/grade.frag?raw';

export function createPost(renderer, scene, camera, quality) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality.msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(Math.min(size.x, 1280) / 2, Math.min(size.y, 800) / 2), 0.18, 0.45, 0.9);
  bloom.enabled = quality.bloom;
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uSpeed: { value: 0 }, uFlash: { value: 0 }, uNight: { value: 0 }, uDusk: { value: 0 }, uRain: { value: 0 }, uAspect: { value: 1 }, uFlashColor: { value: new THREE.Color(0x48e58a) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: gradeFrag,
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  return {
    composer, bloom, grade,
    render(dt, t) { grade.uniforms.uTime.value = t; composer.render(dt); },
    setSize(w, h, dpr) { composer.setPixelRatio(dpr); composer.setSize(w, h); grade.uniforms.uAspect.value = w / h; },
    setTime(T) { bloom.strength = T.bloom; grade.uniforms.uNight.value = T.night; grade.uniforms.uDusk.value = T.dusk; },
    setSpeed(v) { grade.uniforms.uSpeed.value = Math.max(0, Math.min(1, v)); },
  };
}
