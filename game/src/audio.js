// Synthesized sound only (WebAudio, no audio files): engine hum, siren, gunshot,
// skid, pickup chime, UI click. The context starts on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenHigh = false;
  let sirenTimer = 0;
  let skidSource = null;
  let skidGain = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      // Engine: saw + sub sine through a lowpass, pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sine';
      engineOsc2.frequency.value = 30;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 500;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Siren: square wave alternating two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      // Skid: looped noise through a bandpass.
      skidSource = ctx.createBufferSource();
      skidSource.buffer = noiseBuffer;
      skidSource.loop = true;
      const skidFilter = ctx.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.value = 900;
      skidGain = ctx.createGain();
      skidGain.gain.value = 0;
      skidSource.connect(skidFilter);
      skidFilter.connect(skidGain);
      skidGain.connect(master);
      skidSource.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function update(dt, speed, throttle, policeNear, skidding) {
    if (!ctx) return;
    const rpm = Math.min(1, Math.abs(speed) / 28);
    engineOsc.frequency.value = 55 + rpm * 140 + (throttle ? 12 : 0);
    engineOsc2.frequency.value = 28 + rpm * 70;
    engineFilter.frequency.value = 350 + rpm * 900;
    engineGain.gain.value = throttle || Math.abs(speed) > 0.5 ? 0.05 + rpm * 0.06 : 0.02;
    if (policeNear) {
      sirenTimer -= dt;
      if (sirenTimer <= 0) {
        sirenTimer = 0.38;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.value = sirenHigh ? 920 : 660;
      }
      sirenGain.gain.value = 0.045;
    } else {
      sirenGain.gain.value = 0;
    }
    skidGain.gain.value = skidding ? 0.09 : 0;
  }

  function blip(freq, dur, type, vol) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  function gunshot() {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.14);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    src.stop(ctx.currentTime + 0.16);
    blip(90, 0.12, 'sine', 0.3);
  }

  function chime() {
    if (!ctx) return;
    blip(660, 0.12, 'sine', 0.2);
    setTimeout(() => blip(880, 0.18, 'sine', 0.2), 90);
    setTimeout(() => blip(1320, 0.22, 'sine', 0.16), 180);
  }

  function click() {
    blip(1200, 0.05, 'square', 0.08);
  }

  function thud() {
    blip(70, 0.18, 'sine', 0.35);
  }

  return { ensure, update, gunshot, chime, click, thud };
}
