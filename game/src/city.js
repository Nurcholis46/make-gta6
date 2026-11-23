// Sunset Bay's city: a 9 by 9 block grid of roads, buildings, parks, palms and
// lamps, built once from a seed. It owns the static meshes, the ground texture and
// the collision map (building rectangles plus the city edge). Cars, pedestrians
// and the player all ask it where the road is and what they bump into.
//
// Road centrelines sit at -216 + i*48 (i = 0..9); block centres at -192 + i*48.
// World x grows east, world z grows south; the map is centred on 0,0.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, PALETTE } from './config.js';

const PITCH = CITY.pitch;
const HALF = CITY.half;
const ROAD = CITY.road;

export function roadCenters() {
  const centers = [];
  for (let i = 0; i <= CITY.blocks; i += 1) centers.push(-HALF + ROAD / 2 + i * PITCH);
  return centers;
}

export function blockCenters() {
  const centers = [];
  for (let i = 0; i < CITY.blocks; i += 1) centers.push(-HALF + ROAD + CITY.block / 2 + i * PITCH);
  return centers;
}

export function isOnRoad(x, z) {
  const centers = roadCenters();
  const onX = centers.some((c) => Math.abs(x - c) <= ROAD / 2);
  const onZ = centers.some((c) => Math.abs(z - c) <= ROAD / 2);
  return onX || onZ;
}

function nearestRoad(value) {
  const centers = roadCenters();
  let best = centers[0];
  for (const c of centers) if (Math.abs(c - value) < Math.abs(best - value)) best = c;
  return best;
}

function snapToRoad(x, z) {
  // Snap to the nearest crossing (both coordinates on the road grid), so the
  // point is a real node of the road graph: traffic cars index their node into
  // roadCenters(), and an off-grid coordinate would poison the whole graph
  // with NaN. The car itself still spawns at its on-road point; only the
  // target node is snapped.
  return { x: nearestRoad(x), z: nearestRoad(z) };
}

// One 1024x1024 canvas painted as the whole city seen from above: sidewalks,
// asphalt roads with centre dashes, crosswalks at every crossing, and a few
// green park blocks. It is the ground's only texture.
function paintGroundTexture(random) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const toPx = (v) => ((v + HALF) / CITY.size) * size;
  const px = (v) => (v / CITY.size) * size;

  ctx.fillStyle = '#b8ab90';
  ctx.fillRect(0, 0, size, size);

  // Park blocks get grass first, so the roads paint over their edges only.
  const blocks = blockCenters();
  const parks = new Set(['2,2', '6,3', '3,6', '7,7']);
  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      const key = `${bx},${bz}`;
      const x0 = toPx(blocks[bx] - CITY.block / 2);
      const z0 = toPx(blocks[bz] - CITY.block / 2);
      if (parks.has(key)) {
        ctx.fillStyle = '#7fae62';
        ctx.fillRect(x0, z0, px(CITY.block), px(CITY.block));
      } else {
        ctx.fillStyle = `rgba(0,0,0,${0.04 + random.next() * 0.05})`;
        ctx.fillRect(x0, z0, px(CITY.block), px(CITY.block));
      }
    }
  }

  // Asphalt roads.
  ctx.fillStyle = '#3a3a40';
  for (const c of roadCenters()) {
    ctx.fillRect(toPx(c - ROAD / 2), 0, px(ROAD), size);
    ctx.fillRect(0, toPx(c - ROAD / 2), size, px(ROAD));
  }

  // Centre dashes, skipped inside crossings.
  ctx.fillStyle = '#e8c85a';
  for (const c of roadCenters()) {
    for (let v = -HALF + 8; v < HALF - 8; v += 12) {
      const onCrossing = roadCenters().some((o) => Math.abs(v + 2 - o) < ROAD / 2 + 3);
      if (onCrossing) continue;
      ctx.fillRect(toPx(c) - 1.5, toPx(v), 3, px(6));
      ctx.fillRect(toPx(v), toPx(c) - 1.5, px(6), 3);
    }
  }

  // Crosswalks: white stripes where roads meet.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const cx of roadCenters()) {
    for (const cz of roadCenters()) {
      for (let i = -3; i <= 3; i += 1) {
        ctx.fillRect(toPx(cx + i * 1.8) - 2, toPx(cz - ROAD / 2 + 1), 4, px(4));
        ctx.fillRect(toPx(cx + i * 1.8) - 2, toPx(cz + ROAD / 2 - 5), 4, px(4));
        ctx.fillRect(toPx(cx - ROAD / 2 + 1), toPx(cz + i * 1.8) - 2, px(4), 4);
        ctx.fillRect(toPx(cx + ROAD / 2 - 5), toPx(cz + i * 1.8) - 2, px(4), 4);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// A window grid painted once and tinted per building, so the city reads as a
// city instead of a field of plain boxes.
function paintWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const lit = ((row * 7 + col * 3) % 5) < 3;
      ctx.fillStyle = lit ? '#ffe9a8' : '#2e3a4a';
      ctx.fillRect(12 + col * 28, 14 + row * 24, 18, 13);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createCity(random) {
  const group = new THREE.Group();
  const buildings = [];
  const trees = [];
  const lamps = [];

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.size + 60, CITY.size + 60),
    new THREE.MeshLambertMaterial({ map: paintGroundTexture(random) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.userData.tag = { kind: 'ground' };
  group.add(ground);

  // A sandy beach ring and a sea plane beyond the city edge, for the coastal look.
  const beach = new THREE.Mesh(
    new THREE.RingGeometry(HALF + 2, HALF + 34, 48),
    new THREE.MeshLambertMaterial({ color: 0xe8d8a8 }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.y = 0.05;
  beach.userData.tag = { kind: 'ground' };
  group.add(beach);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.size + 400, CITY.size + 400),
    new THREE.MeshLambertMaterial({ color: 0x3d9db8 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.4;
  sea.userData.tag = { kind: 'ground' };
  group.add(sea);

  const windowTexture = paintWindowTexture();
  const materials = PALETTE.building.map(
    (color) => new THREE.MeshLambertMaterial({ map: windowTexture, color }),
  );
  const roofMaterial = new THREE.MeshLambertMaterial({ color: PALETTE.roof });
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const blocks = blockCenters();
  const parks = new Set(['2,2', '6,3', '3,6', '7,7']);

  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      const cx = blocks[bx];
      const cz = blocks[bz];
      if (parks.has(`${bx},${bz}`)) {
        // Park: palms and a bench or two, no buildings.
        for (let t = 0; t < 5; t += 1) {
          const tx = cx + random.range(-13, 13);
          const tz = cz + random.range(-13, 13);
          trees.push({ x: tx, z: tz, s: random.range(0.8, 1.3) });
        }
        continue;
      }
      const count = random.int(1, 3);
      const spots = random.shuffle([
        [-8, -8], [8, -8], [-8, 8], [8, 8], [0, 0],
      ]).slice(0, count);
      for (const [ox, oz] of spots) {
        const w = random.range(8, 13);
        const d = random.range(8, 13);
        const h = random.range(9, 42);
        const x = cx + ox;
        const z = cz + oz;
        const mesh = new THREE.Mesh(boxGeometry, random.pick(materials));
        mesh.scale.set(w, h, d);
        mesh.position.set(x, h / 2, z);
        mesh.userData.tag = { kind: 'building' };
        group.add(mesh);
        const roof = new THREE.Mesh(boxGeometry, roofMaterial);
        roof.scale.set(w + 0.6, 0.8, d + 0.6);
        roof.position.set(x, h + 0.4, z);
        group.add(roof);
        buildings.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
      // One palm on most blocks, at a corner that stays clear of the buildings.
      if (random.next() < 0.7) {
        trees.push({ x: cx + random.pick([-14, 14]), z: cz + random.pick([-14, 14]), s: random.range(0.8, 1.2) });
      }
    }
  }

  // Palms: a leaning trunk and a crown of flattened spheres.
  const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const crownMaterial = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  const trunkGeometry = new THREE.CylinderGeometry(0.22, 0.34, 4.4, 6);
  const crownGeometry = new THREE.IcosahedronGeometry(1.5, 0);
  for (const tree of trees) {
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(tree.x, 2.2 * tree.s, tree.z);
    trunk.scale.setScalar(tree.s);
    trunk.rotation.z = 0.08;
    group.add(trunk);
    const crown = new THREE.Mesh(crownGeometry, crownMaterial);
    crown.position.set(tree.x + 0.3, 4.8 * tree.s, tree.z);
    crown.scale.set(tree.s, tree.s * 0.55, tree.s);
    group.add(crown);
  }

  // Street lamps at every second crossing, on alternating corners.
  const lampPole = new THREE.MeshLambertMaterial({ color: 0x2b2b30 });
  const lampHead = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf8a });
  const poleGeometry = new THREE.CylinderGeometry(0.12, 0.16, 5.2, 6);
  const headGeometry = new THREE.SphereGeometry(0.34, 8, 6);
  let lampIndex = 0;
  for (const cx of roadCenters()) {
    for (const cz of roadCenters()) {
      lampIndex += 1;
      if (lampIndex % 2 !== 0) continue;
      const lx = cx + (lampIndex % 4 < 2 ? 8.4 : -8.4);
      const lz = cz + (lampIndex % 4 < 2 ? 8.4 : -8.4);
      const pole = new THREE.Mesh(poleGeometry, lampPole);
      pole.position.set(lx, 2.6, lz);
      group.add(pole);
      const head = new THREE.Mesh(headGeometry, lampHead);
      head.position.set(lx, 5.3, lz);
      group.add(head);
      lamps.push({ x: lx, z: lz });
    }
  }

  // Push a circle (the player, a car, a pedestrian) out of every building it
  // overlaps, and clamp it inside the city. Returns the corrected position.
  function collide(x, z, radius) {
    let nx = Math.max(-HALF + 2, Math.min(HALF - 2, x));
    let nz = Math.max(-HALF + 2, Math.min(HALF - 2, z));
    for (const b of buildings) {
      const cx = Math.max(b.minX, Math.min(nx, b.maxX));
      const cz = Math.max(b.minZ, Math.min(nz, b.maxZ));
      const dx = nx - cx;
      const dz = nz - cz;
      const dist2 = dx * dx + dz * dz;
      if (dist2 < radius * radius) {
        if (dist2 > 0.0001) {
          const dist = Math.sqrt(dist2);
          nx = cx + (dx / dist) * radius;
          nz = cz + (dz / dist) * radius;
        } else {
          // Dead centre of a building: shove it out along the shorter axis.
          const pushLeft = nx - b.minX;
          const pushRight = b.maxX - nx;
          const pushUp = nz - b.minZ;
          const pushDown = b.maxZ - nz;
          const min = Math.min(pushLeft, pushRight, pushUp, pushDown);
          if (min === pushLeft) nx = b.minX - radius;
          else if (min === pushRight) nx = b.maxX + radius;
          else if (min === pushUp) nz = b.minZ - radius;
          else nz = b.maxZ + radius;
        }
      }
    }
    return { x: nx, z: nz };
  }

  function randomRoadPoint() {
    const centers = roadCenters();
    const horizontal = random.next() < 0.5;
    const c = random.pick(centers);
    const along = random.range(-HALF + 20, HALF - 20);
    return horizontal ? { x: along, z: c } : { x: c, z: along };
  }

  function randomSidewalkPoint() {
    const p = randomRoadPoint();
    const off = random.pick([-9.5, 9.5]);
    if (random.next() < 0.5) return { x: p.x + off, z: p.z };
    return { x: p.x, z: p.z + off };
  }

  return {
    group, buildings, trees, lamps,
    collide, isOnRoad, snapToRoad, randomRoadPoint, randomSidewalkPoint,
    roadCenters: roadCenters(),
    blockCenters: blocks,
  };
}
