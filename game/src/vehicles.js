// Cars: arcade driving for the player, a road-graph autopilot for traffic, and a
// chase brain for the police. Every car is the same box-built mesh; only the
// driver differs. Collision between cars is circles on the ground plane.
import { CAR, TRAFFIC_COUNT, PALETTE } from './config.js';
import { makeCarMesh } from './render.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createVehicle(scene, opts) {
  const parts = makeCarMesh(opts.color, opts.kind);
  parts.group.position.set(opts.x, 0, opts.z);
  parts.group.rotation.y = opts.heading;
  scene.add(parts.group);
  const car = {
    parts,
    kind: opts.kind || 'sedan',
    color: opts.color,
    x: opts.x,
    z: opts.z,
    heading: opts.heading,
    speed: 0,
    steer: 0,
    health: CAR.health,
    wrecked: false,
    isPlayer: false,
    isPolice: opts.kind === 'police',
    isTraffic: false,
    isParked: false,
    cruise: 0,
    nodeX: 0,
    nodeZ: 0,
    fromX: 0,
    fromZ: 0,
    stuck: 0,
    lastX: opts.x,
    lastZ: opts.z,
    sirenPhase: 0,
  };
  parts.group.userData.tag = { kind: 'car', ref: car };
  return car;
}

function applyMesh(car) {
  car.parts.group.position.set(car.x, 0, car.z);
  car.parts.group.rotation.y = car.heading;
  for (const wheel of car.parts.wheels) {
    wheel.rotation.x += car.speed * 0.016 * 1.4;
  }
  if (car.health < 55) {
    const hurt = (55 - car.health) / 55;
    car.parts.smoke.material.opacity = hurt * 0.75;
    car.parts.smoke.scale.setScalar(1 + hurt * 1.6);
  } else {
    car.parts.smoke.material.opacity = 0;
  }
}

export function damageCar(car, amount) {
  if (car.wrecked) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.wrecked = true;
    car.speed = 0;
  }
}

// The player's car: throttle, brake and reverse on W/S, steering on A/D that
// bites less the faster the car goes, and a handbrake that lets the tail out.
export function stepPlayerCar(car, dt, input, city) {
  if (car.wrecked) {
    car.speed *= Math.max(0, 1 - 3 * dt);
    applyMesh(car);
    return false;
  }
  const dir = input.direction();
  const braking = dir.y > 0 && car.speed > 0.5;
  if (braking) {
    car.speed -= CAR.brake * dt;
  } else if (dir.y < 0) {
    car.speed += CAR.accel * dt;
  } else if (dir.y > 0) {
    car.speed -= CAR.reverseAccel * dt;
  } else {
    car.speed -= car.speed * 0.9 * dt;
    if (Math.abs(car.speed) < 0.2) car.speed = 0;
  }
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
  const steerTarget = -dir.x * CAR.steer * (1 - Math.min(Math.abs(car.speed) / CAR.maxSpeed, 1) * 0.5);
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const handbrake = input.isHandbrake();
  const turnRate = (car.speed / 2.7) * Math.tan(car.steer) * (handbrake ? 1.7 : 1);
  car.heading += turnRate * dt * (car.speed >= 0 ? 1 : -1);
  if (handbrake) car.speed *= Math.max(0, 1 - 0.9 * dt);
  const beforeX = car.x;
  const beforeZ = car.z;
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const fixed = city.collide(nx, nz, 2.1);
  const hit = Math.hypot(nx - fixed.x, nz - fixed.z) > 0.01;
  if (hit) {
    if (Math.abs(car.speed) > 12) damageCar(car, Math.abs(car.speed) * 0.6);
    car.speed *= 0.55;
  }
  car.x = fixed.x;
  car.z = fixed.z;
  applyMesh(car);
  return hit && Math.hypot(car.x - beforeX, car.z - beforeZ) < 0.1;
}

// Traffic: each car drives a route of crossings on the road grid, keeping to
// the right-hand lane, slowing for the car ahead and for turns. At a crossing
// it picks a new leg, never doubling back unless the road ends.
function pickNextNode(car, city, random) {
  const centers = city.roadCenters;
  let ix = centers.indexOf(car.nodeX);
  let iz = centers.indexOf(car.nodeZ);
  // A node that fell off the grid (never expected after snapToRoad, but cheap
  // to guard) is pulled back to the nearest crossing instead of indexing -1.
  if (ix < 0) { car.nodeX = centers.reduce((a, b) => (Math.abs(b - car.nodeX) < Math.abs(a - car.nodeX) ? b : a), centers[0]); ix = centers.indexOf(car.nodeX); }
  if (iz < 0) { car.nodeZ = centers.reduce((a, b) => (Math.abs(b - car.nodeZ) < Math.abs(a - car.nodeZ) ? b : a), centers[0]); iz = centers.indexOf(car.nodeZ); }
  const options = [];
  if (ix > 0) options.push([centers[ix - 1], centers[iz]]);
  if (ix < centers.length - 1) options.push([centers[ix + 1], centers[iz]]);
  if (iz > 0) options.push([centers[ix], centers[iz - 1]]);
  if (iz < centers.length - 1) options.push([centers[ix], centers[iz + 1]]);
  const back = options.filter(([x, z]) => x !== car.fromX || z !== car.fromZ);
  const [nx, nz] = (back.length > 0 ? random.pick(back) : options[0]) || [car.nodeX, car.nodeZ];
  car.fromX = car.nodeX;
  car.fromZ = car.nodeZ;
  car.nodeX = nx;
  car.nodeZ = nz;
}

export function spawnTraffic(scene, city, random, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const p = city.randomRoadPoint();
    const car = createVehicle(scene, {
      x: p.x,
      z: p.z,
      heading: random.next() * Math.PI * 2,
      color: random.pick(PALETTE.car),
      kind: random.next() < 0.12 ? 'taxi' : 'sedan',
    });
    car.isTraffic = true;
    car.cruise = random.range(9, 13);
    const snapped = city.snapToRoad(p.x, p.z);
    car.nodeX = snapped.x;
    car.nodeZ = snapped.z;
    car.fromX = snapped.x;
    car.fromZ = snapped.z;
    pickNextNode(car, city, random);
    cars.push(car);
  }
  return cars;
}

export function stepTrafficCar(car, dt, city, cars, random) {
  if (car.wrecked) return;
  // Aim at the next crossing, offset into the right-hand lane.
  const dx = car.nodeX - car.x;
  const dz = car.nodeZ - car.z;
  const dist = Math.hypot(dx, dz);
  const dirX = dist > 0.01 ? dx / dist : 0;
  const dirZ = dist > 0.01 ? dz / dist : 0;
  const laneX = car.nodeX + -dirZ * 3.5;
  const laneZ = car.nodeZ + dirX * 3.5;
  const lx = laneX - car.x;
  const lz = laneZ - car.z;
  const desired = Math.atan2(lx, lz);
  const dh = angleDiff(desired, car.heading);
  car.heading += clamp(dh, -1.9 * dt, 1.9 * dt);

  // Slow for the car ahead and for the turn at the crossing.
  let target = car.cruise;
  if (dist < 12) target = Math.min(target, 6);
  for (const other of cars) {
    if (other === car || other.wrecked) continue;
    const ox = other.x - car.x;
    const oz = other.z - car.z;
    const od = Math.hypot(ox, oz);
    if (od < 9 && od > 0.01) {
      const ahead = (ox * Math.sin(car.heading) + oz * Math.cos(car.heading)) / od;
      if (ahead > 0.7) target = Math.min(target, other.speed * 0.7);
    }
  }
  car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const fixed = city.collide(car.x, car.z, 2.1);
  car.x = fixed.x;
  car.z = fixed.z;
  if (dist < 4) pickNextNode(car, city, random);

  // A car that has not moved in a while is stuck on something: put it back
  // on a road somewhere else instead of blocking the junction forever.
  if (Math.hypot(car.x - car.lastX, car.z - car.lastZ) < 0.2) car.stuck += dt;
  else car.stuck = 0;
  car.lastX = car.x;
  car.lastZ = car.z;
  if (car.stuck > 4) {
    const p = city.randomRoadPoint();
    car.x = p.x;
    car.z = p.z;
    car.heading = random.next() * Math.PI * 2;
    car.stuck = 0;
  }
  applyMesh(car);
}

// Police: chase the player's position, ramming when close, flashing the light
// bar. They are a little slower than the player's top speed, so a clean getaway
// is possible on a straight road.
export function stepPoliceCar(car, dt, target, city) {
  if (car.wrecked) return;
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const dist = Math.hypot(dx, dz);
  const desired = Math.atan2(dx, dz);
  car.heading += clamp(angleDiff(desired, car.heading), -2.3 * dt, 2.3 * dt);
  const wantSpeed = dist > 25 ? 37 : 31;
  car.speed += (wantSpeed - car.speed) * Math.min(1, dt * 1.4);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const fixed = city.collide(car.x, car.z, 2.1);
  if (Math.hypot(car.x - fixed.x, car.z - fixed.z) > 0.01) car.speed *= 0.6;
  car.x = fixed.x;
  car.z = fixed.z;
  car.sirenPhase += dt * 9;
  const on = Math.sin(car.sirenPhase) > 0;
  if (car.parts.barRed) {
    car.parts.barRed.material.emissiveIntensity = on ? 2.4 : 0.15;
    car.parts.barBlue.material.emissiveIntensity = on ? 0.15 : 2.4;
  }
  applyMesh(car);
}

// Parked cars along the roads, including the gold Comet GT the third mission
// asks the player to steal. They wait, engines off, until someone takes them.
export function spawnParked(scene, city, random) {
  const cars = [];
  const spots = [];
  for (let i = 0; i < 10; i += 1) {
    const p = city.randomRoadPoint();
    spots.push(p);
  }
  for (const p of spots) {
    const car = createVehicle(scene, {
      x: p.x + random.range(-2, 2),
      z: p.z + random.range(-2, 2),
      heading: random.next() * Math.PI * 2,
      color: random.pick(PALETTE.car),
      kind: 'sedan',
    });
    car.isParked = true;
    cars.push(car);
  }
  const comet = createVehicle(scene, {
    x: 120, z: -120, heading: Math.PI / 2, color: 0xf2c94c, kind: 'comet',
  });
  comet.isParked = true;
  comet.isComet = true;
  cars.push(comet);
  return cars;
}

// Push overlapping cars apart on the ground plane; a hard shove costs both
// cars a little health.
export function resolveCarCollisions(cars) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.wrecked && b.wrecked) continue;
      // A car with a non-finite position can never be pushed apart sanely; skip
      // it instead of letting one bad number poison every car it touches.
      if (!Number.isFinite(a.x) || !Number.isFinite(a.z) || !Number.isFinite(b.x) || !Number.isFinite(b.z)) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= 4.2 || dist < 0.01) continue;
      const push = (4.2 - dist) / 2;
      const nx = dx / dist;
      const nz = dz / dist;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
      const impact = Math.abs(a.speed - b.speed);
      if (impact > 8) {
        damageCar(a, impact * 0.3);
        damageCar(b, impact * 0.3);
      }
      a.speed *= 0.92;
      b.speed *= 0.92;
    }
  }
}

export function removeVehicle(scene, car) {
  scene.remove(car.parts.group);
}

export { TRAFFIC_COUNT };
