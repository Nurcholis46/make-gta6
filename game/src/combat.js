// Combat: the player's pistol (a ray from the centre of the screen) and the
// rival crew shooting back. Hits are found by raycasting the scene and walking
// up from the hit mesh to the tagged group that owns it: a car, a pedestrian,
// an enemy, or a building.
import * as THREE from '../vendor/three.module.min.js';
import { COMBAT } from './config.js';

export function createCombat(scene, camera) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = COMBAT.pistolRange;
  const flash = new THREE.PointLight(0xffe9a0, 0, 20);
  scene.add(flash);
  let flashTimer = 0;
  let cooldown = 0;

  function findTag(object) {
    let node = object;
    while (node) {
      if (node.userData && node.userData.tag) return node.userData.tag;
      node = node.parent;
    }
    return null;
  }

  // Fire once. Returns what the bullet met, or null while the pistol cools down.
  function shoot(shooterPos) {
    if (cooldown > 0) return null;
    cooldown = COMBAT.fireInterval;
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    flash.position.set(shooterPos.x, 1.7, shooterPos.z);
    flash.intensity = 50;
    flashTimer = 0.07;
    for (const hit of hits) {
      const tag = findTag(hit.object);
      if (!tag) continue;
      if (tag.kind === 'building' || tag.kind === 'ground') {
        return { kind: tag.kind, point: hit.point, distance: hit.distance };
      }
      return { kind: tag.kind, ref: tag.ref, point: hit.point, distance: hit.distance };
    }
    return { kind: 'none' };
  }

  function step(dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (flashTimer > 0) {
      flashTimer -= dt;
      if (flashTimer <= 0) flash.intensity = 0;
    }
  }

  return { shoot, step };
}

// Enemies fire at the player with a fixed interval and a miss chance, only
// while they are standing and the player is in range. The random source is the
// game's seeded one, so a staged scene always plays the same way.
export function enemyFire(enemies, playerPos, dt, onPlayerHit, random) {
  for (const enemy of enemies) {
    if (enemy.state !== 'fight') continue;
    enemy.shootTimer -= dt;
    const d = Math.hypot(enemy.x - playerPos.x, enemy.z - playerPos.z);
    if (enemy.shootTimer <= 0 && d < COMBAT.enemyRange) {
      enemy.shootTimer = COMBAT.enemyInterval;
      enemy.heading = Math.atan2(playerPos.x - enemy.x, playerPos.z - enemy.z);
      enemy.parts.group.rotation.y = enemy.heading;
      if (random.next() < COMBAT.enemyAccuracy) onPlayerHit(COMBAT.enemyDamage);
    }
  }
}
