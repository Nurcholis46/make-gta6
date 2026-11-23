// Pedestrians: they stroll the sidewalks, scatter when a gun goes off or a car
// bears down on them, and go down when they are hit. The rival crew for the
// fourth mission are pedestrians that stand and fight instead of walking.
import { PED_COUNT } from './config.js';
import { makePersonMesh } from './render.js';

const SHIRTS = [0xe8a87c, 0x9fc5c9, 0xa8c686, 0xe8b4b8, 0x8fb8d8, 0xf2e3c6, 0xd98c7a];

export function createPedestrians(scene, city, random, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const p = city.randomSidewalkPoint();
    const parts = makePersonMesh(random.pick(SHIRTS));
    parts.group.position.set(p.x, 0, p.z);
    parts.group.userData.tag = { kind: 'ped' };
    scene.add(parts.group);
    const ped = {
      parts, x: p.x, z: p.z, heading: random.next() * Math.PI * 2,
      speed: random.range(1.1, 2.0), targetX: p.x, targetZ: p.z,
      state: 'walk', timer: 0, walkPhase: random.next() * 6,
      fleeX: 0, fleeZ: 0, isEnemy: false, health: 100,
    };
    parts.group.userData.tag.ref = ped;
    peds.push(ped);
  }
  return peds;
}

export function stepPedestrians(peds, dt, city, danger) {
  for (const ped of peds) {
    if (ped.state === 'down') {
      ped.timer -= dt;
      if (ped.timer <= 0) {
        // Dust off and wander somewhere else.
        const p = city.randomSidewalkPoint();
        ped.x = p.x;
        ped.z = p.z;
        ped.state = 'walk';
        ped.parts.group.rotation.x = 0;
        ped.parts.group.position.set(p.x, 0, p.z);
      }
      continue;
    }
    if (danger) {
      const dx = ped.x - danger.x;
      const dz = ped.z - danger.z;
      const d = Math.hypot(dx, dz);
      if (d < 14 && d > 0.01) {
        ped.state = 'flee';
        ped.timer = 2;
        ped.fleeX = dx / d;
        ped.fleeZ = dz / d;
      }
    }
    if (ped.state === 'flee') {
      ped.timer -= dt;
      ped.x += ped.fleeX * 4.2 * dt;
      ped.z += ped.fleeZ * 4.2 * dt;
      ped.heading = Math.atan2(ped.fleeX, ped.fleeZ);
      if (ped.timer <= 0) ped.state = 'walk';
    } else {
      const dx = ped.targetX - ped.x;
      const dz = ped.targetZ - ped.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) {
        const p = city.randomSidewalkPoint();
        ped.targetX = p.x;
        ped.targetZ = p.z;
      } else {
        ped.heading = Math.atan2(dx, dz);
        ped.x += (dx / d) * ped.speed * dt;
        ped.z += (dz / d) * ped.speed * dt;
      }
    }
    const fixed = city.collide(ped.x, ped.z, 0.7);
    ped.x = fixed.x;
    ped.z = fixed.z;
    ped.walkPhase += dt * ped.speed * 3;
    const swing = Math.sin(ped.walkPhase) * 0.5;
    ped.parts.legL.rotation.x = swing;
    ped.parts.legR.rotation.x = -swing;
    ped.parts.group.position.set(ped.x, 0, ped.z);
    ped.parts.group.rotation.y = ped.heading;
  }
}

export function knockDown(ped) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.timer = 3;
  ped.parts.group.rotation.x = Math.PI / 2;
  ped.parts.group.position.y = 0.35;
}

// The rival crew: red shirts, planted at the docks, shooting at the player.
export function spawnEnemies(scene, x, z, count) {
  const enemies = [];
  for (let i = 0; i < count; i += 1) {
    const parts = makePersonMesh(0x8e2f2f);
    const ex = x + (i % 2 === 0 ? -7 : 7) + (i > 1 ? 3 : -3);
    const ez = z + (i < 2 ? -5 : 5);
    parts.group.position.set(ex, 0, ez);
    parts.group.userData.tag = { kind: 'enemy' };
    scene.add(parts.group);
    const enemy = {
      parts, x: ex, z: ez, heading: 0, state: 'fight', health: 100,
      shootTimer: 1 + i * 0.4, walkPhase: 0, isEnemy: true,
    };
    parts.group.userData.tag.ref = enemy;
    enemies.push(enemy);
  }
  return enemies;
}

export function removePedestrian(scene, ped) {
  scene.remove(ped.parts.group);
}

export { PED_COUNT };
