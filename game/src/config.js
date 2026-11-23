// Every tuning number, colour and story beat of Sunset Bay in one place.
// The city is a 9 by 9 block grid: roads run every BLOCK metres, blocks hold the
// buildings, and the whole map is CITY metres across. Nothing here depends on the
// screen size: the renderer scales the canvas, the minimap draws the same map.

export const STEP = 1 / 60;

export const CITY = {
  blocks: 9,
  block: 34,
  road: 14,
  get pitch() { return this.block + this.road; },
  get size() { return this.blocks * this.pitch + this.road; },
  get half() { return this.size / 2; },
};

// City coordinates are centred on 0,0; worldToMap maps a world point to minimap space.
export function worldToMap(x, z) {
  return { x: (x + CITY.half) / CITY.size, y: (z + CITY.half) / CITY.size };
}

export const PLAYER = {
  radius: 0.9,
  walkSpeed: 6,
  runSpeed: 10,
  accel: 40,
  health: 100,
};

export const CAR = {
  accel: 26,
  brake: 42,
  reverseAccel: 16,
  maxSpeed: 46,
  maxReverse: 14,
  steer: 0.62,
  grip: 6.5,
  handbrakeGrip: 1.6,
  health: 100,
};

export const TRAFFIC_COUNT = 16;
export const PED_COUNT = 22;
export const POLICE_MAX = 5;

export const WANTED = {
  decaySeconds: 14,
  steal: 1,
  hitPed: 1,
  shoot: 1,
  copKill: 2,
  max: 5,
};

export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 90,
  fireInterval: 0.28,
  enemyDamage: 9,
  enemyRange: 42,
  enemyInterval: 0.9,
  enemyAccuracy: 0.45,
};

export const SAVE_KEY = 'sunset-bay.save.v1';

export const PALETTE = {
  sky: 0xffd9a0,
  fog: 0xf7c98d,
  sun: 0xffe3b3,
  ground: 0x9a8f7a,
  road: 0x3a3a40,
  sidewalk: 0xb8ab90,
  building: [0xf2c89b, 0xe8a87c, 0x9fc5c9, 0xf2e3c6, 0xd98c7a, 0xa8c686, 0xe8b4b8, 0x8fb8d8],
  roof: 0x6b5a4a,
  car: [0xd84040, 0x3d7bd9, 0xf2c94c, 0xeeeeee, 0x2b2b30, 0x3fae6a, 0xff7a3d, 0x8e44ad],
  police: 0x1c2733,
  taxi: 0xf2c94c,
};

export const MISSIONS = [
  {
    id: 'pickup',
    title: 'Job 1 — First Pickup',
    intro: 'Mama Rosa: "Rico, my boy. A package waits at the marina. Walk or drive — just bring it to me."',
    objectives: [
      { kind: 'goto', text: 'Go to the marina pickup', x: -170, z: -170 },
      { kind: 'press', text: 'Press E to grab the package', x: -170, z: -170 },
      { kind: 'goto', text: 'Bring it back to Mama Rosa', x: 24, z: 24, reward: 300 },
    ],
  },
  {
    id: 'getaway',
    title: 'Job 2 — The Getaway',
    intro: 'Mama Rosa: "The harbour master talked. Cops are coming. Take the package to the docks — and lose them."',
    objectives: [
      { kind: 'goto', text: 'Drive to the docks with the package', x: 168, z: 168, wanted: 2, reward: 500 },
    ],
  },
  {
    id: 'wheels',
    title: 'Job 3 — Nice Wheels',
    intro: 'Mama Rosa: "A Comet GT is parked by the hotel. Borrow it. Permanently. Bring it to my garage."',
    objectives: [
      { kind: 'steal', text: 'Steal the Comet GT by the hotel', x: 120, z: -120, car: 'comet' },
      { kind: 'goto', text: 'Drive the Comet to Rosa\u2019s garage', x: -24, z: 72, reward: 700, needsComet: true },
    ],
  },
  {
    id: 'docks',
    title: 'Job 4 — Dockside Payback',
    intro: 'Mama Rosa: "Rival crew holds the east docks. Take them down, Rico. All four."',
    objectives: [
      { kind: 'goto', text: 'Reach the east docks', x: 168, z: -24 },
      { kind: 'combat', text: 'Take out the rival crew (4 left)', x: 168, z: -24, count: 4 },
      { kind: 'goto', text: 'Report back to Mama Rosa', x: 24, z: 24, reward: 900 },
    ],
  },
  {
    id: 'score',
    title: 'Job 5 — The Big Score',
    intro: 'Mama Rosa: "One last run, Rico. The vault money moves at midnight. Grab it, cross the city, and we are rich."',
    objectives: [
      { kind: 'goto', text: 'Grab the vault money downtown', x: -72, z: 120 },
      { kind: 'press', text: 'Press E to take the money', x: -72, z: 120 },
      { kind: 'goto', text: 'Escape to the hideout across town', x: 168, z: -168, wanted: 3, reward: 2500 },
    ],
  },
];
