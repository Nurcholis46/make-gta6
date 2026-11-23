// The wanted level: stars earned by stealing, hitting and shooting, police cars
// that spawn to match them, a slow cooldown when no cop can see the player, and
// the busted meter when a cop catches the player on foot.
import { WANTED, POLICE_MAX } from './config.js';
import { createVehicle, stepPoliceCar, removeVehicle } from './vehicles.js';

export function createWanted() {
  return {
    level: 0,
    timer: WANTED.decaySeconds,
    busted: 0,
    spawnTimer: 0,
  };
}

export function addWanted(w, amount) {
  w.level = Math.min(WANTED.max, w.level + amount);
  w.timer = WANTED.decaySeconds;
}

export function clearWanted(w) {
  w.level = 0;
  w.timer = WANTED.decaySeconds;
  w.busted = 0;
}

function spawnPoliceCar(w, game) {
  const { scene, city, random } = game;
  for (let tries = 0; tries < 12; tries += 1) {
    const p = city.randomRoadPoint();
    const d = Math.hypot(p.x - game.playerX, p.z - game.playerZ);
    if (d < 55 || d > 140) continue;
    const car = createVehicle(scene, {
      x: p.x, z: p.z, heading: 0, color: 0x1c2733, kind: 'police',
    });
    car.isPolice = true;
    game.police.push(car);
    return;
  }
}

export function updateWanted(w, dt, game) {
  const events = { busted: false };
  const desired = Math.min(w.level, POLICE_MAX);
  w.spawnTimer -= dt;
  if (game.police.length < desired && w.spawnTimer <= 0) {
    spawnPoliceCar(w, game);
    w.spawnTimer = 2.5;
  }
  // Too many cops (the level fell): send the furthest ones home.
  while (game.police.length > desired) {
    const far = game.police.reduce((worst, car) => {
      const d = Math.hypot(car.x - game.playerX, car.z - game.playerZ);
      return d > worst.d ? { car, d } : worst;
    }, { car: null, d: -1 });
    if (!far.car) break;
    removeVehicle(game.scene, far.car);
    game.police.splice(game.police.indexOf(far.car), 1);
  }

  let seen = false;
  let nearest = Infinity;
  let nearestSlow = false;
  for (const cop of game.police) {
    stepPoliceCar(cop, dt, { x: game.playerX, z: game.playerZ }, game.city);
    const d = Math.hypot(cop.x - game.playerX, cop.z - game.playerZ);
    if (d < 60) seen = true;
    if (d < nearest) {
      nearest = d;
      nearestSlow = Math.abs(cop.speed) < 6;
    }
    // A cop that rams the player's car hard hurts it.
    if (game.inCar && game.playerCar && d < 4.4 && Math.abs(cop.speed) > 8) {
      game.playerCar.speed *= 0.94;
    }
  }
  // Cops that wandered too far go back to the precinct.
  for (let i = game.police.length - 1; i >= 0; i -= 1) {
    const cop = game.police[i];
    if (Math.hypot(cop.x - game.playerX, cop.z - game.playerZ) > 320) {
      removeVehicle(game.scene, cop);
      game.police.splice(i, 1);
    }
  }

  if (w.level > 0) {
    if (seen) {
      w.timer = WANTED.decaySeconds;
    } else {
      w.timer -= dt;
      if (w.timer <= 0) {
        w.level -= 1;
        w.timer = WANTED.decaySeconds;
      }
    }
  }

  // Busted: on foot (or in a wreck) with a cop right on top of you.
  const catchable = !game.inCar || (game.playerCar && game.playerCar.wrecked);
  if (w.level > 0 && catchable && nearest < 4.5 && nearestSlow) {
    w.busted += dt;
    if (w.busted > 1.2) events.busted = true;
  } else {
    w.busted = Math.max(0, w.busted - dt * 2);
  }
  return events;
}
