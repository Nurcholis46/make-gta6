// The DOM HUD: wanted stars, cash, health, speed, the mission panel, prompts and
// the minimap — a top-down drawing of the same city the 3D view shows, with the
// player arrow, traffic dots, police blips and the mission marker.
import { CITY } from './config.js';

export function createHud() {
  const el = {
    stars: document.getElementById('stars'),
    cash: document.getElementById('cash'),
    health: document.getElementById('health'),
    speed: document.getElementById('speed'),
    vehicle: document.getElementById('vehiclename'),
    objTitle: document.getElementById('objtitle'),
    objText: document.getElementById('objtext'),
    message: document.getElementById('message'),
    prompt: document.getElementById('prompt'),
    crosshair: document.getElementById('crosshair'),
    minimap: document.getElementById('minimap'),
  };
  const ctx = el.minimap.getContext('2d');
  let messageTimer = 0;
  let lastStars = -1;
  let lastCash = -1;
  let lastHealth = -1;

  function showMessage(text, seconds) {
    el.message.textContent = text;
    el.message.classList.add('show');
    messageTimer = seconds || 2.5;
  }

  function drawMinimap(G) {
    const s = 220;
    const toMap = (v) => ((v + CITY.half) / CITY.size) * s;
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = '#3d9db8';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#cbb98e';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#3a3a40';
    for (const c of G.roadCenters) {
      const p = toMap(c - CITY.road / 2);
      const w = (CITY.road / CITY.size) * s;
      ctx.fillRect(p, 0, w, s);
      ctx.fillRect(0, p, s, w);
    }
    if (G.marker) {
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath();
      ctx.arc(toMap(G.marker.x), toMap(G.marker.z), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const car of G.traffic) {
      ctx.fillRect(toMap(car.x) - 1.5, toMap(car.z) - 1.5, 3, 3);
    }
    for (const cop of G.police) {
      ctx.fillStyle = '#ff2a2a';
      ctx.beginPath();
      ctx.arc(toMap(cop.x), toMap(cop.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const px = toMap(G.playerX);
    const py = toMap(G.playerZ);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - G.playerHeading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function update(dt, G) {
    if (G.wanted !== lastStars) {
      lastStars = G.wanted;
      let html = '';
      for (let i = 0; i < 5; i += 1) {
        html += i < G.wanted ? '★' : '<span class="off">★</span>';
      }
      el.stars.innerHTML = html;
    }
    if (G.cash !== lastCash) {
      lastCash = G.cash;
      el.cash.textContent = `$${G.cash.toLocaleString('en-US')}`;
    }
    const hp = Math.round(G.health);
    if (hp !== lastHealth) {
      lastHealth = hp;
      el.health.style.width = `${hp}%`;
      el.health.classList.toggle('low', hp < 30);
    }
    const mph = Math.round(Math.abs(G.speed) * 2.2);
    el.speed.innerHTML = `${mph} <small>mph</small>`;
    el.vehicle.textContent = G.vehicleName;
    el.objTitle.textContent = G.objTitle;
    const dist = G.objDistance >= 0 ? ` <span class="dist">${G.objDistance}m</span>` : '';
    el.objText.innerHTML = G.objText + dist;
    if (G.prompt) {
      el.prompt.innerHTML = G.prompt;
      el.prompt.classList.add('show');
    } else {
      el.prompt.classList.remove('show');
    }
    el.crosshair.classList.toggle('show', !!G.aiming);
    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) el.message.classList.remove('show');
    }
    drawMinimap(G);
  }

  return { update, showMessage };
}
