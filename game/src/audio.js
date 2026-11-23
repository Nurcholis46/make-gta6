// All sound is synthesized with WebAudio — no audio files, nothing to download:
// an engine hum that follows the car's speed, a two-tone siren, a gunshot, a
// pickup chime, a mission jingle and a quiet bass line that loops under play.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = 0;
  let musicStep = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();

    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.5;
  }

  function blip(freq, dur, type, vol, when) {
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol) {
    if (!ctx) return;
    const length = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1600;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  function shot() {
    noiseBurst(0.12, 0.5);
    blip(150, 0.08, 'square', 0.25);
  }

  function chime() {
    blip(880, 0.14, 'sine', 0.35);
    blip(1318, 0.2, 'sine', 0.3, 0.09);
  }

  function jingle() {
    [523, 659, 784, 1046].forEach((freq, i) => blip(freq, 0.22, 'triangle', 0.3, i * 0.11));
  }

  function thud() {
    blip(65, 0.22, 'sine', 0.6);
    noiseBurst(0.08, 0.25);
  }

  function engine(speed, driving) {
    if (!ctx) return;
    engineGain.gain.value = driving ? 0.045 + Math.min(0.075, Math.abs(speed) * 0.002) : 0;
    engineOsc.frequency.value = 50 + Math.abs(speed) * 3.2;
  }

  function update(dt, wanted) {
    if (!ctx) return;
    sirenGain.gain.value = wanted > 0 ? 0.045 : 0;
    sirenOsc.frequency.value = 660 + Math.sin(performance.now() / 300) * 160;
    musicTimer -= dt;
    if (musicTimer <= 0) {
      musicTimer = 0.24;
      const notes = [110, 0, 130.8, 0, 98, 0, 146.8, 0, 110, 0, 164.8, 0, 98, 0, 130.8, 0];
      const note = notes[musicStep % notes.length];
      musicStep += 1;
      if (note > 0) blip(note, 0.2, 'triangle', 0.1);
    }
  }

  return { ensure, setMuted, isMuted: () => muted, shot, chime, jingle, thud, engine, update };
}
