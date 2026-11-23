// The three.js stage: renderer, sun-soaked lighting, the follow camera, and the
// mesh factories every moving thing is built from. Nothing here knows the rules
// of the game: it is given a focus to follow and meshes to place.
import * as THREE from '../vendor/three.module.min.js';
import { PALETTE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const CAMERA_FOV = 62;

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 140, 460);

  // Late-afternoon sun: warm from the west, soft sky bounce from below.
  const hemi = new THREE.HemisphereLight(0xfff2d8, 0x8a7a66, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.7);
  sun.position.set(140, 200, 70);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbfd8ff, 0.35);
  fill.position.set(-100, 80, -120);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 1000);

  let yaw = 0;
  let pitch = 0.34;
  let distance = 13;
  let current = new THREE.Vector3(0, 8, 16);

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  // The camera chases a point behind the focus: on foot it orbits freely with
  // the mouse, in a car it settles behind the car's heading and the drag only
  // nudges it, so driving never spins the view away.
  function updateCamera(focus, dt, drag) {
    yaw -= drag.x * 0.004;
    pitch = Math.max(0.12, Math.min(0.9, pitch + drag.y * 0.003));
    if (focus.driving) {
      let dy = focus.heading - yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      yaw += dy * Math.min(1, dt * 1.6);
      distance += (13.5 - distance) * Math.min(1, dt * 2);
    } else {
      distance += (9.5 - distance) * Math.min(1, dt * 2);
    }
    const height = distance * Math.sin(pitch) + 1.2;
    const back = distance * Math.cos(pitch);
    const target = new THREE.Vector3(
      focus.x - Math.sin(yaw) * back,
      height,
      focus.z - Math.cos(yaw) * back,
    );
    const k = Math.min(1, dt * 7);
    current.lerp(target, k);
    camera.position.copy(current);
    camera.lookAt(focus.x, 1.6, focus.z);
  }

  function setCameraBehind(x, z, heading) {
    yaw = heading;
    pitch = 0.34;
    const back = 13 * Math.cos(pitch);
    current.set(x - Math.sin(yaw) * back, 13 * Math.sin(pitch) + 1.2, z - Math.cos(yaw) * back);
    camera.position.copy(current);
    camera.lookAt(x, 1.6, z);
  }

  function forward() {
    return { x: Math.sin(yaw), z: Math.cos(yaw) };
  }

  // Project a world point to screen pixels so the HUD can draw the mission
  // marker over the waypoint. Returns null when the point is behind the camera.
  const screenVector = new THREE.Vector3();
  function worldToScreen(x, z, y) {
    screenVector.set(x, y ?? 1, z).project(camera);
    if (screenVector.z > 1) return null;
    return {
      x: (screenVector.x * 0.5 + 0.5) * window.innerWidth,
      y: (-screenVector.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  function render() {
    renderer.render(scene, camera);
  }

  resize();
  window.addEventListener('resize', resize);
  return { scene, camera, resize, updateCamera, setCameraBehind, forward, render, worldToScreen };
}

// A car from boxes: body, cabin, four wheels, headlights and taillights. The
// kind changes the silhouette: 'comet' is low and long with a spoiler, 'taxi'
// wears the yellow cab paint, 'police' carries the light bar.
export function makeCarMesh(color, kind) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const lightFront = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe9a0 });
  const lightRear = new THREE.MeshLambertMaterial({ color: 0xd84040, emissive: 0x881111 });

  const low = kind === 'comet';
  const bodyH = low ? 0.55 : 0.8;
  const bodyY = low ? 0.55 : 0.72;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, bodyH, 4.5), paint);
  body.position.y = bodyY;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, low ? 0.5 : 0.72, 2.3), glass);
  cabin.position.set(0, bodyY + bodyH / 2 + (low ? 0.25 : 0.34), low ? -0.25 : -0.3);
  group.add(cabin);

  const wheelGeometry = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeometry.rotateZ(Math.PI / 2);
  const wheelSpots = [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]];
  const wheels = [];
  for (const [wx, wz] of wheelSpots) {
    const wheel = new THREE.Mesh(wheelGeometry, tyre);
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }

  for (const side of [-0.6, 0.6]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), lightFront);
    head.position.set(side, bodyY, 2.28);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), lightRear);
    tail.position.set(side, bodyY, -2.28);
    group.add(tail);
  }

  if (kind === 'comet') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.4), paint);
    spoiler.position.set(0, 1.05, -2.1);
    group.add(spoiler);
  }

  let barRed = null;
  let barBlue = null;
  if (kind === 'police') {
    barRed = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.22, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xff2a2a, emissive: 0xff0000 }),
    );
    barRed.position.set(-0.4, 1.42, -0.3);
    group.add(barRed);
    barBlue = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.22, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x2a6aff, emissive: 0x0033ff }),
    );
    barBlue.position.set(0.4, 1.42, -0.3);
    group.add(barBlue);
  }

  // A puff of smoke the game shows when the car is badly hurt.
  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, opacity: 0.0 }),
  );
  smoke.position.set(0, 1.2, 1.6);
  group.add(smoke);

  return { group, wheels, barRed, barBlue, smoke };
}

// A person from boxes: legs, torso, head, arms. The shirt colour is the only
// thing that changes between pedestrians, the player and the rival crew.
export function makePersonMesh(shirtColor, skinColor) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor || 0xc98d64 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b3440 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), pants);
  legL.position.set(-0.14, 0.4, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), pants);
  legR.position.set(0.14, 0.4, 0);
  group.add(legR);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.16;
  group.add(torso);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), shirt);
  armL.position.set(-0.4, 1.14, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), shirt);
  armR.position.set(0.4, 1.14, 0);
  group.add(armR);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.72;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), new THREE.MeshLambertMaterial({ color: 0x1c1210 }));
  hair.position.y = 1.8;
  hair.scale.set(1, 0.6, 1);
  group.add(hair);

  return { group, legL, legR, armL, armR };
}

// The mission waypoint: a tall beam of light and a ring on the ground, pulsing.
export function makeBeaconMesh(color) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 34, 12, 1, true),
    new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, emissive: color }),
  );
  beam.position.y = 17;
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.4, 0.18, 8, 28),
    new THREE.MeshLambertMaterial({ color, emissive: color }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  group.add(ring);
  return { group, beam, ring };
}
