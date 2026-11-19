'use strict';

// A short peak envelope is sufficient for thumbnails and whole-track views.
// Zoomed-in views sample the original channels to retain detail at the edges.
const wavePeaks = new WeakMap();
const peakBlock = 256;

function envelope(buffer) {
  let peaks = wavePeaks.get(buffer);
  if (peaks) return peaks;
  peaks = new Float32Array(Math.ceil(buffer.length / peakBlock));
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let block = 0; block < peaks.length; block++) {
      let peak = peaks[block];
      const end = Math.min(samples.length, (block + 1) * peakBlock);
      for (let i = block * peakBlock; i < end; i++) peak = Math.max(peak, Math.abs(samples[i]));
      peaks[block] = peak;
    }
  }
  wavePeaks.set(buffer, peaks);
  return peaks;
}

function paintWave(canvas, clip) {
  const width = Math.ceil(canvas.clientWidth);
  if (!width) return;
  canvas.width = Math.min(2400, width);
  const height = canvas.height = Math.max(10, Math.min(160, canvas.clientHeight));
  const ctx = canvas.getContext('2d');
  const buffer = clip.asset.buffer;
  const start = clip.from * buffer.sampleRate;
  const stride = (clip.to - clip.from) * buffer.sampleRate / canvas.width;
  const peaks = stride >= peakBlock ? envelope(buffer) : null;
  const channels = peaks ? [] : Array.from({length: buffer.numberOfChannels}, (_, i) => buffer.getChannelData(i));
  ctx.fillStyle = '#72ceff';
  for (let x = 0; x < canvas.width; x += 2) {
    let peak = 0;
    const first = Math.floor(start + x * stride);
    const last = Math.min(buffer.length, Math.ceil(start + (x + 2) * stride));
    if (peaks) {
      for (let block = Math.floor(first / peakBlock); block < Math.ceil(last / peakBlock); block++) peak = Math.max(peak, peaks[block]);
    } else {
      for (const channel of channels) {
        for (let i = first; i < last; i++) peak = Math.max(peak, Math.abs(channel[i]));
      }
    }
    const size = Math.max(1, height * Math.min(1, peak));
    ctx.fillRect(x, (height - size) / 2, 1.5, size);
  }
}
