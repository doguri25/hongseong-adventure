import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import gradeFrag from '../shaders/grade.frag?raw';

const FLASH_S = 0.6;

// quality: {msaa, bloom} (a QUALITY preset or the live quality state). The multisampled target is fixed at creation:
// a change of msaa means dispose() and a new chain. Every chain (any msaa / bloom) has the grade pass, so flash() and
// setSpeed() work on all of them.
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

  // the green / red screen flash under the big notice: kicked to 1 by flash(), fading to 0 over FLASH_S of real time
  // (frame time, so the 10 fps paused render behind a dialog fades it at the same pace)
  let flashAt = -1;
  return {
    composer, bloom, grade,
    render(dt, t) {
      grade.uniforms.uTime.value = t;
      if (flashAt >= 0) {
        if (flashAt === 0) flashAt = t;
        const f = 1 - (t - flashAt) / FLASH_S;
        grade.uniforms.uFlash.value = f > 0 ? f : 0;
        if (f <= 0) flashAt = -1;
      }
      composer.render(dt);
    },
    // color: a CSS colour string or number (ok #35e08a, danger #ff5468); the caller skips it when motion is reduced
    flash(color) { grade.uniforms.uFlashColor.value.set(color); grade.uniforms.uFlash.value = 1; flashAt = 0; },
    setSize(w, h, dpr) { composer.setPixelRatio(dpr); composer.setSize(w, h); grade.uniforms.uAspect.value = w / h; },
    setTime(T) { bloom.strength = T.bloom; grade.uniforms.uNight.value = T.night; grade.uniforms.uDusk.value = T.dusk; },
    setSpeed(v) { grade.uniforms.uSpeed.value = Math.max(0, Math.min(1, v)); },
    // every pass's targets and materials, then the composer's own two targets (one is `rt`) and its copy pass
    dispose() { for (const p of composer.passes) p.dispose?.(); composer.dispose(); },
  };
}
