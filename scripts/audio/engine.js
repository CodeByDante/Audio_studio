'use strict';

function schedule(context, sourceClips, from, start, smooth = true) {
  const sources = [];
  for (const clip of sourceClips) {
    const skip = Math.max(0, from - clip.at);
    const length = clip.to - clip.from - skip;
    if (length <= 0) continue;
    const when = start + Math.max(0, clip.at - from);
    const source = context.createBufferSource();
    source.buffer = clip.asset.buffer;
    if (smooth) {
      const gain = context.createGain();
      const full = clip.to - clip.from;
      const level = 10 ** ((clip.gainDb || 0) / 20);
      const attack = Math.min(Math.max(0.004, clip.fadeIn || 0), full / 2);
      const release = Math.min(Math.max(0.004, clip.fadeOut || 0), full / 2);
      const initial = level * Math.min(1, skip / attack, length / release);
      gain.gain.setValueAtTime(initial, when);
      if (skip < attack) gain.gain.linearRampToValueAtTime(level, when + attack - skip);
      if (length > release) gain.gain.setValueAtTime(level, when + length - release);
      gain.gain.linearRampToValueAtTime(0, when + length);
      source.connect(gain).connect(context.destination);
    } else source.connect(context.destination);
    source.start(when, clip.from + skip, length);
    sources.push(source);
  }
  return sources;
}

function audibleIntervals(clip, threshold, minimum, minimumClip) {
  const buffer = clip.asset.buffer;
  const rate = buffer.sampleRate;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const start = Math.round(clip.from * rate);
  const finish = Math.round(clip.to * rate);
  const step = Math.max(1, Math.round(rate * 0.01));
  const limit = 10 ** (threshold / 10);
  const intervals = [];
  let lastSound = start, segmentStart = start, hasSound = false;
  for (let frame = start; frame < finish; frame += step) {
    const next = Math.min(finish, frame + step);
    const loud = channels.some((channel) => {
      let power = 0;
      for (let i = frame; i < next; i++) power += channel[i] ** 2;
      return power / (next - frame) >= limit;
    });
    if (!loud) continue;
    if (frame - lastSound >= minimum * rate) {
      if (hasSound) intervals.push([segmentStart, lastSound]);
      segmentStart = frame;
    }
    hasSound = true;
    lastSound = next;
  }
  if (!hasSound) return [];
  intervals.push([segmentStart, finish - lastSound < minimum * rate ? finish : lastSound]);
  return intervals.map(([from, to]) => [Math.max(clip.from, from / rate - 0.025), Math.min(clip.to, to / rate + 0.025)])
    .filter(([from, to]) => to - from >= minimumClip);
}

function wav(buffer) {
  const count = buffer.numberOfChannels;
  const bytes = buffer.length * count * 2;
  const view = new DataView(new ArrayBuffer(44 + bytes));
  const tag = (offset, label) => [...label].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
  tag(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, bytes, true);
  const channels = Array.from({ length: count }, (_, index) => buffer.getChannelData(index));
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[i]));
      view.setInt16(offset, sample * (sample < 0 ? 32768 : 32767), true);
      offset += 2;
    }
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}
