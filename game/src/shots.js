// The screenshot scenes behind ?shot=chase|foot|delivery|docks. Each one sets the
// game up in a real state — a wanted chase, a walk through traffic, a delivery
// at the docks, a shootout — then plays the real rules forward with a scripted
// driver for a few seconds, so the frame is what a short game really looks like
// and the same seed always gives the same frame.
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SHOT_SECONDS = {
  chase: 7,
  foot: 5,
  delivery: 4,
  docks: 3,
};

// Steer the player's car along the road it is on, toward the next crossing
// that brings it closer to the drive target: the scripted driver for the chase
// shot. It never leaves the road, so the chase frame stays on the streets.
function driveAlongRoad(game, dt) {
  const car = game.playerCar;
  if (!car) return { x: 0, y: -1 };
  const target = game.driveTarget || { x: 0, z: 0 };
  const centers = game.city.roadCenters;
  let best = null;
  let bestScore = Infinity;
  for (const cx of centers) {
    for (const cz of centers) {
      const dx = cx - car.x;
      const dz = cz - car.z;
      const d = Math.hypot(dx, dz);
      if (d < 20 || d > 90) continue;
      const ahead = (dx * Math.sin(car.heading) + dz * Math.cos(car.heading)) / d;
      if (ahead < 0.2) continue;
      const score = Math.hypot(cx - target.x, cz - target.z) - d * 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = { x: cx, z: cz };
      }
    }
  }
  if (!best) return { x: 0, y: -1 };
  const desired = Math.atan2(best.x - car.x, best.z - car.z);
  let dh = desired - car.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  return { x: dh > 0.15 ? -1 : dh < -0.15 ? 1 : 0, y: -1 };
}

// Put the game in the named scene and return how many seconds of scripted play
// it needs before the frame is ready, plus the screen to draw over it.
export function stageShot(name, game) {
  const shot = SHOT_NAMES.includes(name) ? name : 'chase';
  game.resetWorld();
  if (shot === 'chase') {
    game.startStory();
    game.setMission(1);
    game.putPlayerInCar('sedan', -120, -24, Math.PI / 2, 0xd84040);
    game.setWanted(3);
    game.spawnPoliceNear(2);
    game.driveTo(168, -24);
  } else if (shot === 'foot') {
    game.startStory();
    game.setMission(0);
    game.putPlayerOnFoot(-14.5, 100, Math.PI);
    game.setWanted(0);
  } else if (shot === 'delivery') {
    game.startStory();
    game.setMission(1);
    game.putPlayerOnFoot(158.5, 168, Math.PI * 0.75);
    game.setWanted(1);
    game.spawnPoliceNear(1);
  } else if (shot === 'docks') {
    game.startStory();
    game.setMission(3);
    game.putPlayerOnFoot(158.5, -24, Math.PI / 2);
    game.spawnRivals();
    game.setWanted(0);
  }
  return { screen: SCREEN_PLAY, seconds: SHOT_SECONDS[shot] || 5, driver: shot === 'chase' ? driveAlongRoad : null };
}

export const SHOT_NAMES = ['chase', 'foot', 'delivery', 'docks'];

export { SCREEN_TITLE, STEP };
