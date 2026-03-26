import { writeFileSync } from 'fs';

function generateWav(filename, config) {
  const sampleRate = 44100;
  const duration = config.duration || 70;
  const numSamples = sampleRate * duration;
  const buffer = new Float64Array(numSamples);

  for (const layer of config.layers) {
    const { freq, gain, type, lfo, detune } = layer;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let amplitude = gain;
      if (lfo) amplitude *= 0.5 + 0.5 * Math.sin(2 * Math.PI * lfo.rate * t);
      if (t < 3) amplitude *= t / 3;
      if (t > duration - 3) amplitude *= (duration - t) / 3;
      const f = freq + (detune || 0) * Math.sin(2 * Math.PI * 0.05 * t);
      const phase = 2 * Math.PI * f * t;
      const sample = type === 'triangle'
        ? (2 / Math.PI) * Math.asin(Math.sin(phase))
        : Math.sin(phase);
      buffer[i] += sample * amplitude;
    }
  }

  let max = 0;
  for (let i = 0; i < numSamples; i++) {
    if (Math.abs(buffer[i]) > max) max = Math.abs(buffer[i]);
  }
  if (max > 0.95) {
    const scale = 0.9 / max;
    for (let i = 0; i < numSamples; i++) buffer[i] *= scale;
  }

  const bps = 16;
  const ch = 1;
  const dataSize = numSamples * ch * bps / 8;
  const fileSize = 44 + dataSize;
  const wav = Buffer.alloc(fileSize);

  wav.write('RIFF', 0);
  wav.writeUInt32LE(fileSize - 8, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(ch, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * ch * bps / 8, 28);
  wav.writeUInt16LE(ch * bps / 8, 32);
  wav.writeUInt16LE(bps, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    wav.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }

  writeFileSync(filename, wav);
  console.log('Created ' + filename + ' (' + (fileSize / 1024 / 1024).toFixed(1) + 'MB, ' + duration + 's)');
}

const base = './public/audio';

generateWav(base + '/deep.wav', {
  duration: 70,
  layers: [
    { freq: 65, gain: 0.3, type: 'sine', lfo: { rate: 0.08 } },
    { freq: 98, gain: 0.2, type: 'sine', detune: 0.3 },
    { freq: 130, gain: 0.12, type: 'sine', lfo: { rate: 0.12 } },
    { freq: 195, gain: 0.06, type: 'triangle', lfo: { rate: 0.05 }, detune: 0.5 },
    { freq: 82, gain: 0.15, type: 'sine', detune: 0.2, lfo: { rate: 0.03 } },
  ]
});

generateWav(base + '/ambient.wav', {
  duration: 75,
  layers: [
    { freq: 220, gain: 0.18, type: 'sine', lfo: { rate: 0.06 } },
    { freq: 277, gain: 0.14, type: 'sine', detune: 0.4, lfo: { rate: 0.09 } },
    { freq: 330, gain: 0.1, type: 'triangle', lfo: { rate: 0.04 } },
    { freq: 165, gain: 0.12, type: 'sine', lfo: { rate: 0.07 }, detune: 0.3 },
    { freq: 440, gain: 0.05, type: 'sine', lfo: { rate: 0.15 } },
    { freq: 110, gain: 0.08, type: 'sine', detune: 0.2 },
  ]
});

generateWav(base + '/chill.wav', {
  duration: 65,
  layers: [
    { freq: 440, gain: 0.12, type: 'sine', lfo: { rate: 0.1 } },
    { freq: 554, gain: 0.08, type: 'sine', detune: 0.5, lfo: { rate: 0.06 } },
    { freq: 660, gain: 0.06, type: 'sine', lfo: { rate: 0.08 } },
    { freq: 330, gain: 0.1, type: 'triangle', lfo: { rate: 0.04 }, detune: 0.3 },
    { freq: 880, gain: 0.03, type: 'sine', lfo: { rate: 0.12 } },
    { freq: 220, gain: 0.07, type: 'sine', detune: 0.15, lfo: { rate: 0.03 } },
  ]
});
