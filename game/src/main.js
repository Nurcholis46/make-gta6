// Boot and the one loop: Sunset Bay's screens (title, play, paused, busted /
// wasted / story done), the fixed-step simulation, the save, and the ?shot=
// staging that paints the screenshots. The world itself lives in the modules
// this file wires together: the city, the player, the cars, the pedestrians,
// the missions, the wanted level, the combat, the HUD and the sound.
import { STEP, PLAYER, CAR, WANTED, COMBAT, TRAFFIC_COUNT, PED_COUNT } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER } from './render.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER } from './input.js';
import { createPlayer } from './player.js';
import {
  createVehicle, spawnTraffic, spawnParked, stepPlayerCar, stepTrafficCar,
  resolveCarCollisions, damageCar, removeVehicle,
} from './vehicles.js';
import { createPedestrians, stepPedestrians, knockDown, spawnEnemies, removePedestrian } from './pedestrians.js';
import { createCombat, enemyFire } from './combat.js';
import {
  createMissions, currentObjective, startMission, updateMissions, objectiveText, objectiveDistance,
} from './missions.js';
import { createWanted, addWanted, clearWanted, updateWanted } from './wanted.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { saveGame, loadGame } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const SPAWN = { x: 24, z: 72, heading: 0 };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const random = createRandom(seed);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const city = createCity(random);
renderer.scene.add(city.group);
const input = createInput(canvas);
const hud = createHud();
const audio = createAudio();
const combat = createCombat(renderer.scene, renderer.camera);
const missions = createMissions(renderer.scene);
const wanted = createWanted();
const player = createPlayer(renderer.scene);

let traffic = spawnTraffic(renderer.scene, city, random, TRAFFIC_COUNT);
let parked = spawnParked(renderer.scene, city, random);
let peds = createPedestrians(renderer.scene, city, random, PED_COUNT);
let police = [];
let enemies = [];

let screen = SCREEN_TITLE;
let best = 0;

const G = {
  cash: 0,
  elapsed: 0,
  inCar: false,
  playerCar: null,
  pressedE: false,
  inComet: false,
  enemiesLeft: 0,
  danger: null,
  driveTarget: null,
  speed: 0,
  scene: renderer.scene,
  city,
  random,
  get police() { return police; },
  get playerX() { return this.inCar && this.playerCar ? this.playerCar.x : player.state.x; },
  get playerZ() { return this.inCar && this.playerCar ? this.playerCar.z : player.state.z; },
  addWanted: (n) => addWanted(wanted, n),
};

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem('sunset-bay.best') ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem('sunset-bay.best', String(value));
  } catch {
    // Storage can be off: the best then lasts this visit only.
  }
}

function announce(message) {
  status.textContent = message;
}

function allCars() {
  const cars = [...traffic, ...parked, ...police];
  if (G.playerCar) cars.push(G.playerCar);
  return cars;
}

function carName(car) {
  if (car.kind === 'police') return 'Police Interceptor';
  if (car.kind === 'comet') return 'Comet GT';
  if (car.kind === 'taxi') return 'Taxi';
  return 'Sedan';
}

function nearestEnterableCar() {
  let bestCar = null;
  let bestDist = 4.5;
  for (const car of [...traffic, ...parked]) {
    if (car.wrecked) continue;
    const d = Math.hypot(car.x - player.state.x, car.z - player.state.z);
    if (d < bestDist) {
      bestDist = d;
      bestCar = car;
    }
  }
  return bestCar;
}

function tryEnterCar() {
  const car = nearestEnterableCar();
  if (!car) return;
  if (car.isTraffic) traffic.splice(traffic.indexOf(car), 1);
  else parked.splice(parked.indexOf(car), 1);
  car.isTraffic = false;
  car.isParked = false;
  car.isPlayer = true;
  G.playerCar = car;
  G.inCar = true;
  player.parts.group.visible = false;
  addWanted(wanted, WANTED.steal);
  hud.showMessage(car.isComet ? 'You stole the Comet GT!' : 'Car stolen! Wanted level up.');
  audio.thud();
}

function exitCar() {
  const car = G.playerCar;
  if (!car) return;
  const rx = -Math.cos(car.heading);
  const rz = Math.sin(car.heading);
  const fixed = city.collide(car.x + rx * 2.6, car.z + rz * 2.6, PLAYER.radius);
  player.place(fixed.x, fixed.z, car.heading);
  player.parts.group.visible = true;
  car.isPlayer = false;
  car.isParked = true;
  car.speed *= 0.4;
  parked.push(car);
  G.playerCar = null;
  G.inCar = false;
}

function handleShot(result) {
  if (!result) return;
  if (result.kind === 'ped') {
    knockDown(result.ref);
    addWanted(wanted, WANTED.hitPed);
    hud.showMessage('You shot a pedestrian! Wanted level up.');
  } else if (result.kind === 'enemy') {
    const enemy = result.ref;
    enemy.health -= COMBAT.pistolDamage;
    if (enemy.health <= 0 && enemy.state === 'fight') {
      enemy.state = 'down';
      enemy.timer = 3;
      enemy.parts.group.rotation.x = Math.PI / 2;
      enemy.parts.group.position.y = 0.35;
      hud.showMessage('Rival down!');
    }
  } else if (result.kind === 'car') {
    damageCar(result.ref, COMBAT.pistolDamage);
    if (result.ref.isPolice) addWanted(wanted, 1);
  }
}

function handleMissionEvent(event) {
  if (event.type === 'objective-done') {
    audio.chime();
    hud.showMessage('Objective complete!');
  } else if (event.type === 'mission-done') {
    audio.jingle();
    hud.showMessage(`Job done! +$${event.reward}`, 3);
    announce(`Job done. Earned $${event.reward}.`);
    if (event.nextIntro) announce(event.nextIntro);
    doSave();
  } else if (event.type === 'story-done') {
    audio.jingle();
    G.best = Math.max(G.best, G.cash);
    saveBest(G.best);
    doSave();
    showEnd(
      'YOU OWN SUNSET BAY',
      `All five jobs done. $${G.cash.toLocaleString('en-US')} in your pocket, and the city is yours. Free roam continues — cause trouble, lose the cops, do it all again.`,
    );
  }
}

function showEnd(title, text) {
  screen = SCREEN_OVER;
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-text').textContent = text;
  showScreen(SCREEN_OVER);
  announce(`${title}. ${text}`);
}

function endRun(title, text) {
  const fine = Math.min(G.cash, 200);
  G.cash -= fine;
  clearWanted(wanted);
  if (G.inCar) exitCar();
  player.place(SPAWN.x, SPAWN.z, SPAWN.heading);
  player.state.health = PLAYER.health;
  showEnd(title, `${text} You lost $${fine}.`);
}

function busted() {
  endRun('BUSTED', 'The Sunset Bay PD caught you.');
}

function wasted() {
  endRun('WASTED', 'You got taken out on the streets of Sunset Bay.');
}

function doSave() {
  const ok = saveGame({
    cash: G.cash,
    mission: missions.index,
    objective: missions.objective,
    x: G.playerX,
    z: G.playerZ,
    heading: G.inCar && G.playerCar ? G.playerCar.heading : player.state.heading,
    best: G.best,
  });
  return ok;
}

function resetWorld() {
  for (const car of [...traffic, ...parked, ...police]) removeVehicle(renderer.scene, car);
  for (const ped of [...peds, ...enemies]) removePedestrian(renderer.scene, ped);
  traffic = spawnTraffic(renderer.scene, city, random, TRAFFIC_COUNT);
  parked = spawnParked(renderer.scene, city, random);
  peds = createPedestrians(renderer.scene, city, random, PED_COUNT);
  police = [];
  enemies = [];
  clearWanted(wanted);
  missions.index = 0;
  missions.objective = 0;
  missions.state = 'idle';
  G.inCar = false;
  G.playerCar = null;
  G.enemiesLeft = 0;
  G.danger = null;
  G.driveTarget = null;
  player.place(SPAWN.x, SPAWN.z, SPAWN.heading);
  player.state.health = PLAYER.health;
  player.parts.group.visible = true;
  renderer.setCameraBehind(SPAWN.x, SPAWN.z, SPAWN.heading);
}

// The face the screenshot staging talks to: the same setup calls a player
// would make, so a shot is a real game state, not a diorama.
const gameApi = {
  get playerCar() { return G.playerCar; },
  get city() { return city; },
  get driveTarget() { return G.driveTarget; },
  resetWorld,
  startStory() {
    screen = SCREEN_PLAY;
    return startMission(missions, 0, G);
  },
  setMission(index) {
    startMission(missions, index, G);
  },
  putPlayerInCar(kind, x, z, heading, color) {
    const car = createVehicle(renderer.scene, { x, z, heading, color, kind });
    car.isPlayer = true;
    G.playerCar = car;
    G.inCar = true;
    player.parts.group.visible = false;
    player.state.x = x;
    player.state.z = z;
    player.state.heading = heading;
    renderer.setCameraBehind(x, z, heading);
  },
  putPlayerOnFoot(x, z, heading) {
    if (G.playerCar) {
      removeVehicle(renderer.scene, G.playerCar);
      G.playerCar = null;
    }
    G.inCar = false;
    player.parts.group.visible = true;
    player.place(x, z, heading);
    renderer.setCameraBehind(x, z, heading);
  },
  setWanted(level) {
    wanted.level = level;
    wanted.timer = WANTED.decaySeconds;
  },
  spawnPoliceNear(count) {
    for (let i = 0; i < count; i += 1) {
      for (let tries = 0; tries < 12; tries += 1) {
        const p = city.randomRoadPoint();
        const d = Math.hypot(p.x - G.playerX, p.z - G.playerZ);
        if (d < 40 || d > 80) continue;
        const car = createVehicle(renderer.scene, { x: p.x, z: p.z, heading: 0, color: 0x1c2733, kind: 'police' });
        car.isPolice = true;
        police.push(car);
        break;
      }
    }
  },
  driveTo(x, z) {
    G.driveTarget = { x, z };
  },
  spawnRivals() {
    enemies = spawnEnemies(renderer.scene, 168, -24, 4);
    G.enemiesLeft = 4;
  },
};

function currentFocus() {
  const fwd = renderer.forward();
  return {
    x: G.playerX,
    z: G.playerZ,
    heading: G.inCar && G.playerCar ? G.playerCar.heading : Math.atan2(fwd.x, fwd.z),
    driving: G.inCar,
  };
}

function hudView() {
  const objective = objectiveText(missions);
  let prompt = '';
  if (screen === SCREEN_PLAY) {
    if (!G.inCar) {
      const obj = currentObjective(missions);
      if (obj && obj.kind === 'press' && Math.hypot(player.state.x - obj.x, player.state.z - obj.z) < 6) {
        prompt = 'Press <b>E</b> to grab it';
      } else {
        const car = nearestEnterableCar();
        if (car) prompt = car.isComet ? 'Press <b>E</b> to steal the Comet GT' : 'Press <b>E</b> to steal this car';
      }
    } else {
      prompt = 'Press <b>E</b> to get out';
    }
  }
  const obj = currentObjective(missions);
  return {
    wanted: wanted.level,
    cash: G.cash,
    health: player.state.health,
    speed: G.inCar && G.playerCar ? G.playerCar.speed : Math.hypot(player.state.vx, player.state.vz),
    vehicleName: G.inCar && G.playerCar ? carName(G.playerCar) : 'On foot',
    objTitle: objective.title,
    objText: objective.text,
    objDistance: objectiveDistance(missions, G),
    prompt,
    aiming: !G.inCar && screen === SCREEN_PLAY,
    marker: obj && missions.state === 'active' ? { x: obj.x, z: obj.z } : null,
    roadCenters: city.roadCenters,
    traffic,
    police,
    playerX: G.playerX,
    playerZ: G.playerZ,
    playerHeading: G.inCar && G.playerCar ? G.playerCar.heading : player.state.heading,
  };
}

// One fixed step of the living city. inputLike is the real input in play, or a
// scripted driver while a screenshot is staged.
function stepWorld(dt, inputLike) {
  G.elapsed += dt;
  const fwd = renderer.forward();
  const camYaw = Math.atan2(fwd.x, fwd.z);

  if (G.inCar && G.playerCar) {
    const hitBuilding = stepPlayerCar(G.playerCar, dt, inputLike, city);
    if (hitBuilding) audio.thud();
    G.speed = G.playerCar.speed;
    player.state.x = G.playerCar.x;
    player.state.z = G.playerCar.z;
    player.state.heading = G.playerCar.heading;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.x - G.playerCar.x, ped.z - G.playerCar.z);
      if (d < 2.6 && Math.abs(G.playerCar.speed) > 4) {
        knockDown(ped);
        addWanted(wanted, WANTED.hitPed);
        hud.showMessage('You hit a pedestrian! The cops are coming.');
        G.danger = { x: G.playerCar.x, z: G.playerCar.z };
      }
    }
  } else {
    player.step(dt, inputLike.direction(), camYaw, inputLike.isRunning(), city);
    G.speed = Math.hypot(player.state.vx, player.state.vz);
    for (const car of allCars()) {
      if (car.wrecked) continue;
      const d = Math.hypot(car.x - player.state.x, car.z - player.state.z);
      if (d < 2.2 && Math.abs(car.speed) > 3) {
        const hp = player.hurt(Math.abs(car.speed) * 0.8);
        audio.thud();
        const push = 2.5;
        const fixed = city.collide(
          player.state.x + ((player.state.x - car.x) / (d || 1)) * push,
          player.state.z + ((player.state.z - car.z) / (d || 1)) * push,
          PLAYER.radius,
        );
        player.state.x = fixed.x;
        player.state.z = fixed.z;
        if (hp <= 0) {
          wasted();
          return;
        }
      }
    }
    if (inputLike.takeShoot()) {
      const result = combat.shoot(player.state);
      audio.shot();
      G.danger = { x: player.state.x, z: player.state.z };
      handleShot(result);
    }
  }

  const cars = allCars();
  for (const car of traffic) stepTrafficCar(car, dt, city, cars, random);
  stepPedestrians(peds, dt, city, G.danger);
  resolveCarCollisions(cars);

  enemyFire(enemies, player.state, dt, (damage) => {
    const hp = player.hurt(damage);
    if (hp <= 0) wasted();
  }, random);
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    if (enemy.state === 'down') {
      enemy.timer -= dt;
      if (enemy.timer <= 0) {
        removePedestrian(renderer.scene, enemy);
        enemies.splice(i, 1);
      }
    }
  }

  G.inComet = !!(G.playerCar && G.playerCar.isComet);
  G.enemiesLeft = enemies.filter((e) => e.state === 'fight').length;
  const missionEvent = updateMissions(missions, G, dt);
  if (missionEvent) handleMissionEvent(missionEvent);
  if (screen !== SCREEN_PLAY) return;

  const wantedEvent = updateWanted(wanted, dt, G);
  if (wantedEvent.busted) {
    busted();
    return;
  }

  combat.step(dt);
  audio.engine(G.inCar && G.playerCar ? G.playerCar.speed : 0, G.inCar);
  audio.update(dt, wanted.level);
  hud.update(dt, hudView());
  G.danger = null;
}

function ambientStep(dt) {
  const cars = allCars();
  for (const car of traffic) stepTrafficCar(car, dt, city, cars, random);
  stepPedestrians(peds, dt, city, null);
  resolveCarCollisions(cars);
  renderer.updateCamera(currentFocus(), dt, { x: 0, y: 0 });
  hud.update(dt, hudView());
}

function showScreen(name) {
  document.getElementById('screen-title').classList.toggle('hidden', name !== SCREEN_TITLE);
  document.getElementById('screen-pause').classList.toggle('hidden', name !== SCREEN_PAUSED);
  document.getElementById('screen-end').classList.toggle('hidden', name !== SCREEN_OVER);
}

function startFresh() {
  resetWorld();
  G.cash = 0;
  screen = SCREEN_PLAY;
  const intro = startMission(missions, 0, G);
  hud.showMessage(intro, 4);
  announce(`Playing. ${intro}`);
  audio.ensure();
  showScreen(SCREEN_PLAY);
}

function continueGame() {
  const save = loadGame();
  resetWorld();
  if (save) {
    G.cash = save.cash || 0;
    player.place(save.x ?? SPAWN.x, save.z ?? SPAWN.z, save.heading ?? SPAWN.heading);
    screen = SCREEN_PLAY;
    startMission(missions, save.mission ?? 0, G);
    missions.objective = save.objective ?? 0;
    hud.showMessage('Welcome back, Rico.', 3);
    announce('Continuing your game.');
  } else {
    startFresh();
    return;
  }
  audio.ensure();
  showScreen(SCREEN_PLAY);
}

function restartMission() {
  if (G.inCar) exitCar();
  player.place(SPAWN.x, SPAWN.z, SPAWN.heading);
  player.state.health = PLAYER.health;
  clearWanted(wanted);
  startMission(missions, missions.index, G);
  screen = SCREEN_PLAY;
  showScreen(SCREEN_PLAY);
  hud.showMessage('Mission restarted.', 2);
}

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACTION_CONFIRM) {
    if (screen === SCREEN_TITLE) startFresh();
    else if (screen === SCREEN_OVER) {
      screen = SCREEN_PLAY;
      showScreen(SCREEN_PLAY);
    }
  }
  if (actions & ACTION_PAUSE) {
    if (screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      showScreen(SCREEN_PAUSED);
      announce('Paused.');
    } else if (screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      showScreen(SCREEN_PLAY);
      announce('Playing.');
    }
  }
  if (actions & ACTION_ENTER) {
    G.pressedE = true;
    if (screen === SCREEN_PLAY) {
      if (G.inCar) exitCar();
      else tryEnterCar();
    }
  }
}

function liveInput() {
  return {
    direction: () => input.direction(),
    isHandbrake: () => input.isHandbrake(),
    isRunning: () => input.isRunning(),
    takeShoot: () => input.takeShoot(),
  };
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  let autosaveTimer = 0;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      showScreen(SCREEN_PAUSED);
      announce('Paused.');
    }
  });

  function frame(now) {
    requestAnimationFrame(frame);
    const dtMs = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const drag = input.takeDrag();
    if (input.isMutedToggle()) audio.setMuted(!audio.isMuted());
    if (screen === SCREEN_PLAY) {
      handleActions();
      accumulator += dtMs;
      let steps = 0;
      while (accumulator >= STEP && steps < 5) {
        stepWorld(STEP, liveInput());
        accumulator -= STEP;
        steps += 1;
        if (screen !== SCREEN_PLAY) break;
      }
      if (steps === 5) accumulator = 0;
      renderer.updateCamera(currentFocus(), dtMs, drag);
      autosaveTimer += dtMs;
      if (autosaveTimer > 10) {
        autosaveTimer = 0;
        doSave();
      }
      G.pressedE = false;
    } else if (screen === SCREEN_TITLE) {
      ambientStep(dtMs);
    }
    renderer.render();
  }

  best = readBest();
  const titleBest = document.getElementById('title-best');
  if (best > 0) titleBest.textContent = `Best cash: $${best.toLocaleString('en-US')}`;
  document.getElementById('btn-continue').style.display = loadGame() ? '' : 'none';
  showScreen(SCREEN_TITLE);
  announce('Sunset Bay. Press Enter or Start to play.');
  requestAnimationFrame(frame);
}

function runShot(name) {
  const staged = stageShot(name, gameApi);
  screen = SCREEN_PLAY;
  showScreen(SCREEN_PLAY);
  const steps = Math.floor(staged.seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const dir = staged.driver ? staged.driver(gameApi, STEP) : { x: 0, y: 0 };
    const fakeInput = {
      direction: () => dir,
      isHandbrake: () => false,
      isRunning: () => false,
      takeShoot: () => false,
    };
    stepWorld(STEP, fakeInput);
    if (screen !== SCREEN_PLAY) break;
  }
  for (let i = 0; i < 24; i += 1) renderer.updateCamera(currentFocus(), 0.05, { x: 0, y: 0 });
  renderer.render();
  requestAnimationFrame(() => {
    renderer.render();
    window.__shotReady = true;
  });
}

// A small handle for local play-testing in the console: inspect the live game
// state (camera, scene, player) without touching the save file.
window.__sunset = { G, gameApi, renderer, city, player, get police() { return police; }, get traffic() { return traffic; }, get peds() { return peds; } };

if (shot) runShot(shot);
else runGame();
