import * as THREE from 'three';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec9e8);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
camera.position.set(3, 2.5, 4);
camera.lookAt(0, 0.5, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x446644, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 5, 2);
scene.add(sun);
const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xd9734e }));
box.position.y = 0.5;
scene.add(box);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
renderer.setAnimationLoop((t) => { box.rotation.y = t / 1000; renderer.render(scene, camera); });
document.getElementById('loading')?.remove();
