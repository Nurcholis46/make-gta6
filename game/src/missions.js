// Mama Rosa's five jobs: a small state machine over the mission list in
// config.js. Each objective is a place to reach, a thing to press, a car to
// steal or a crew to clear, and the beacon in the world marks where to go.
import { MISSIONS } from './config.js';
import { makeBeaconMesh } from './render.js';

export function createMissions(scene) {
  const beacon = makeBeaconMesh(0xffd75e);
  beacon.group.visible = false;
  scene.add(beacon.group);
  return {
    index: 0,
    objective: 0,
    state: 'idle',
    beacon,
    pulse: 0,
  };
}

export function currentMission(m) {
  return MISSIONS[m.index] || null;
}

export function currentObjective(m) {
  const mission = currentMission(m);
  return mission ? mission.objectives[m.objective] : null;
}

export function startMission(m, index, game) {
  m.index = index;
  m.objective = 0;
  m.state = 'active';
  const mission = currentMission(m);
  if (mission && game) applyObjectiveWanted(m, game);
  return mission ? mission.intro : '';
}

// A wanted level named on an objective applies when that objective becomes
// current — the chase is on during the drive, not after it ends.
function applyObjectiveWanted(m, game) {
  const objective = currentObjective(m);
  if (objective && objective.wanted) game.addWanted(objective.wanted);
}

// Advance one objective. Returns an event for the caller to announce and pay,
// or null when nothing finished this frame.
function finishObjective(m, game) {
  const mission = currentMission(m);
  const objective = currentObjective(m);
  let reward = objective.reward || 0;
  m.objective += 1;
  if (m.objective >= mission.objectives.length) {
    if (reward > 0) game.cash += reward;
    const done = { type: 'mission-done', mission, reward };
    if (m.index + 1 < MISSIONS.length) {
      m.index += 1;
      m.objective = 0;
      done.nextIntro = currentMission(m).intro;
    } else {
      m.state = 'complete';
      done.type = 'story-done';
    }
    return done;
  }
  applyObjectiveWanted(m, game);
  return { type: 'objective-done', mission, reward };
}

export function updateMissions(m, game, dt) {
  m.pulse += dt;
  const objective = currentObjective(m);
  if (!objective || m.state !== 'active') {
    m.beacon.group.visible = false;
    return null;
  }
  m.beacon.group.visible = true;
  m.beacon.group.position.set(objective.x, 0, objective.z);
  const s = 1 + Math.sin(m.pulse * 3) * 0.12;
  m.beacon.ring.scale.set(s, s, 1);
  m.beacon.beam.material.opacity = 0.16 + Math.sin(m.pulse * 3) * 0.06;

  const dx = game.playerX - objective.x;
  const dz = game.playerZ - objective.z;
  const dist = Math.hypot(dx, dz);

  if (objective.kind === 'goto' && dist < 8 && (!objective.needsComet || game.inComet)) {
    return finishObjective(m, game);
  }
  if (objective.kind === 'press' && dist < 6 && game.pressedE) {
    return finishObjective(m, game);
  }
  if (objective.kind === 'steal' && game.inComet) {
    return finishObjective(m, game);
  }
  if (objective.kind === 'combat' && game.enemiesLeft === 0) {
    return finishObjective(m, game);
  }
  return null;
}

export function objectiveText(m) {
  const mission = currentMission(m);
  const objective = currentObjective(m);
  if (!mission || !objective || m.state !== 'active') {
    if (m.state === 'complete') return { title: 'Story complete', text: 'You own Sunset Bay. Free roam — cause trouble, lose the cops, repeat.' };
    return { title: 'Sunset Bay', text: 'Press Enter to start.' };
  }
  return { title: mission.title, text: objective.text };
}

export function objectiveDistance(m, game) {
  const objective = currentObjective(m);
  if (!objective || m.state !== 'active') return -1;
  return Math.round(Math.hypot(game.playerX - objective.x, game.playerZ - objective.z));
}
