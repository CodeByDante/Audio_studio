'use strict';
const $ = (id) => document.getElementById(id);
const timeline = $('timeline');
const viewport = $('viewport');
const editor = $('clips');
const minimumClip = 0.018;
let clips = [], history = [], selected, drag, audio, playback;
let cursor = 0, scale = 88, snap = true, serial = 0;
let importQueue = Promise.resolve();
const end = (clip) => clip.at + clip.to - clip.from;
const duration = () => clips.reduce((max, clip) => Math.max(max, end(clip)), 0);
const sort = () => clips.sort((a, b) => a.at - b.at);
const getSelected = () => clips.find((clip) => clip.id === selected);
const report = (message) => { $('status').textContent = message; };
const time = (seconds) => {
  const ticks = Math.floor(seconds * 100 + 1e-7);
  const pad = (n) => String(n).padStart(2, '0');
  return pad(Math.floor(ticks / 6000)) + ':' + pad(Math.floor(ticks / 100) % 60) + '.' + pad(ticks % 100);
};
function save() {
  history.push({ clips: clips.map((clip) => ({ ...clip })), selected, cursor });
  if (history.length > 30) history.shift();
}
function restore() {
  if (!history.length) return;
  stop();
  ({ clips, selected, cursor } = history.pop());
  render();
}
function position(event) {
  return Math.max(0, (event.clientX - timeline.getBoundingClientRect().left) / scale);
}
function nearestSlot(at, length, others) {
  let previousEnd = 0;
  let best = duration();
  let distance = Infinity;
  for (const next of [...others, { at: Infinity }]) {
    if (next.at - previousEnd >= length - 1e-8) {
      const latest = length ? next.at - length : next.at - 1e-6;
      if (latest >= previousEnd - 1e-8) {
        const candidate = Math.max(previousEnd, Math.min(at, latest));
        if (Math.abs(at - candidate) < distance) {
          best = candidate;
          distance = Math.abs(at - candidate);
        }
      }
    }
    if (next.asset) previousEnd = end(next);
  }
  return best;
}
function paintWave(canvas, clip) {
  const width = canvas.width = Math.max(1, Math.min(2400, canvas.clientWidth));
  const height = canvas.height = 70;
  const ctx = canvas.getContext('2d');
  const buffer = clip.asset.buffer;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const start = Math.round(clip.from * buffer.sampleRate);
  const samples = (clip.to - clip.from) * buffer.sampleRate;
  ctx.fillStyle = '#73d9ff';
  for (let x = 0; x < width; x += 2) {
    const first = Math.floor(start + samples * x / width);
    const last = Math.min(buffer.length, Math.ceil(start + samples * (x + 2) / width));
    let peak = 0;
    for (const channel of channels) {
      for (let i = first; i < last; i += Math.max(1, Math.floor((last - first) / 32))) {
        peak = Math.max(peak, Math.abs(channel[i]));
      }
    }
    const amplitude = Math.max(1, peak * height * 0.9);
    ctx.fillRect(x, (height - amplitude) / 2, 1, amplitude);
  }
}
let mediaKind = 'all';
function render() {
  const total = duration();
  $('empty').hidden = clips.length > 0;
  $('count').textContent = clips.length === 1 ? '1 clip' : clips.length + ' clips';
  const list = document.createDocumentFragment();
  for (const clip of clips) {
    const entry = document.createElement('button');
    const kind = clip.asset.video ? 'video' : 'audio';
    if ((mediaKind !== 'all' && kind !== mediaKind) || !clip.asset.name.toLowerCase().includes($('search').value.toLowerCase())) continue;
    entry.className = 'entry';
    entry.dataset.id = clip.id;
    entry.setAttribute('aria-pressed', String(clip.id === selected));
    const name = document.createElement('b');
    name.textContent = clip.asset.name;
    const times = document.createElement('small');
    times.textContent = time(clip.at) + ' → ' + time(end(clip));
    const preview = document.createElement('canvas');
    preview.width = 144;
    entry.append(preview, name, times);
    entry.draggable = true;
    entry.ondragstart = (event) => {
      event.dataTransfer.setData('application/x-audio-studio-clip', String(clip.id));
      event.dataTransfer.effectAllowed = 'move';
      $('remove').disabled = false;
    };
    entry.onclick = () => {
      selected = clip.id;
      viewport.focus({preventScroll:true});
      viewport.scrollLeft = Math.max(0, clip.at * scale - 30);
      render();
    };
    list.append(entry);
  }
  $('library').replaceChildren(list);
  $('libraryEmpty').hidden = $('library').childElementCount > 0;
  $('libraryEmpty').textContent = clips.length ? 'Sin coincidencias.' : 'Arrastra archivos de audio o video aquí.';
  for (const entry of $('library').children) paintWave(entry.querySelector('canvas'), clips.find(c => c.id === Number(entry.dataset.id)));
  $('zoom').value = 1000 * Math.log(scale / minScale()) / Math.log(1000 / minScale());
  const width = Math.max(viewport.clientWidth, Math.ceil((Math.max(total, cursor) + 2) * scale));
  timeline.style.width = width + 'px';
  const step = [0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600].find((value) => value * scale >= 68 && width / (value * scale) < 500) || 1800;
  const ruler = document.createDocumentFragment();
  for (let sec = 0; sec * scale < width; sec += step) {
    const tick = document.createElement('span');
    const line = document.createElement('span');
    tick.className = 'tick';
    line.className = 'gridline';
    tick.style.left = line.style.left = (sec * scale) + 'px';
    tick.textContent = time(sec).slice(0, step < 1 ? 8 : 5);
    ruler.append(tick, line);
  }
  $('ruler').replaceChildren(ruler);
  editor.replaceChildren();
  for (const clip of clips) {
    const box = document.createElement('div');
    box.className = 'clip' + (selected === clip.id ? ' selected' : '');
    box.dataset.id = clip.id;
    box.title = clip.asset.name;
    box.style.left = (clip.at * scale) + 'px';
    box.style.width = Math.max(1, (clip.to - clip.from) * scale) + 'px';
    const caption = document.createElement('label');
    caption.textContent = clip.asset.name;
    const wave = document.createElement('canvas');
    const left = document.createElement('span');
    const right = document.createElement('span');
    left.className = 'edge left';
    right.className = 'edge right';
    left.dataset.edge = 'left';
    right.dataset.edge = 'right';
    box.append(caption, wave, left, right);
    editor.append(box);
    paintWave(wave, clip);
  }
  const active = getSelected();
  $('mixName').textContent = active?.asset.name || 'Selecciona un clip en la pista.';
  for (const key of ['gainDb', 'fadeIn', 'fadeOut']) {
    $(key).disabled = !active;
    $(key).value = active?.[key] || 0;
    $(key + 'Value').textContent = $(key).value + (key === 'gainDb' ? ' dB' : ' s');
  }
  $('selection').textContent = active ? active.asset.name + ' · ' + time(active.to - active.from) : 'Ningún clip seleccionado';
  $('video').disabled = !active?.asset.video;
  $('remove').disabled = $('silence').disabled = !active;
  $('undo').disabled = !history.length;
  $('export').disabled = $('play').disabled = $('split').disabled = !clips.length;
  $('total').textContent = '/ ' + time(total);
  renderCursor();
}
function renderCursor() {
  $('time').value = time(cursor);
  $('cursor').style.left = (cursor * scale) + 'px';
}
function seek(at) {
  stop();
  cursor = at;
  renderCursor();
}
function stop() {
  if (playback) {
    cursor = Math.min(playback.end, playback.from + Math.max(0, audio.currentTime - playback.start));
    for (const source of playback.sources) source.stop();
    playback = undefined;
  }
  $('play').textContent = '▶';
  $('play').setAttribute('aria-label', 'Reproducir');
  renderCursor();
}
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
function context() {
  return audio ??= new AudioContext();
}
async function play() {
  if (!clips.length) return;
  if (playback) return stop();
  try {
    await context().resume();
    if (playback || !clips.length) return;
    const finish = duration();
    if (cursor >= finish) cursor = 0;
    const start = audio.currentTime + 0.035;
    const current = { start, from: cursor, end: finish, sources: schedule(audio, clips, cursor, start) };
    playback = current;
    $('play').textContent = 'Ⅱ';
    $('play').setAttribute('aria-label', 'Pausar');
    const frame = () => {
      if (playback !== current) return;
      cursor = Math.min(current.end, current.from + Math.max(0, audio.currentTime - current.start));
      renderCursor();
      const offset = cursor * scale - viewport.scrollLeft;
      if (offset > viewport.clientWidth - 16 || offset < 0) viewport.scrollLeft = Math.max(0, cursor * scale - 40);
      if (cursor >= current.end) stop();
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  } catch {
    report('No se pudo iniciar la reproducción.');
  }
}
function split() {
  stop();
  const clip = clips.find((item) => item.at + minimumClip < cursor && cursor < end(item) - minimumClip);
  if (!clip) return report('Coloca el cabezal dentro de un clip y vuelve a cortar.');
  save();
  const point = clip.from + cursor - clip.at;
  const right = { ...clip, id: ++serial, at: cursor, from: point };
  clip.to = point;
  clips.push(right);
  selected = right.id;
  sort();
  render();
  report('Clip dividido en el cabezal.');
}
function overTrash(event) {
  const rect = $('remove').getBoundingClientRect();
  return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
}
const clipType = 'application/x-audio-studio-clip';
$('remove').ondragover = (event) => {
  if (event.dataTransfer.types.includes(clipType)) {
    event.preventDefault();
    $('remove').classList.add('drop-active');
  }
};
$('remove').ondragleave = () => $('remove').classList.remove('drop-active');
$('remove').ondrop = (event) => {
  const id = Number(event.dataTransfer.getData(clipType));
  if (!clips.some(clip => clip.id === id)) return;
  event.preventDefault();
  selected = id;
  $('remove').classList.remove('drop-active');
  remove();
};
function remove(record = true) {
  const clip = getSelected();
  if (!clip) return;
  stop();
  if (record) save();
  clips = clips.filter((item) => item !== clip);
  if (snap) {
    for (const item of clips) if (item.at >= end(clip) - 1e-8) item.at -= clip.to - clip.from;
  }
  selected = undefined;
  render();
}
function addAssets(assets, at) {
  stop();
  save();
  for (const asset of assets) {
    const length = asset.buffer.duration;
    const start = snap ? duration() : nearestSlot(at, length, clips);
    const clip = { id: ++serial, asset, at: start, from: 0, to: length };
    clips.push(clip);
    sort();
    at = end(clip);
    selected = clip.id;
  }
  render();
  const active = getSelected();
  if (active.at * scale >= viewport.scrollLeft + viewport.clientWidth) viewport.scrollLeft = active.at * scale - 25;
}
const isVideo = (file) => file.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|ogv|wmv|3gp)$/i.test(file.name);
const mediaUrls = new Set();
function loadFiles(files, at) {
  importQueue = importQueue.catch(() => {}).then(async () => {
    const assets = [], failed = [];
    for (const file of files) {
      report('Leyendo ' + file.name + '…');
      try {
        const buffer = await context().decodeAudioData(await file.arrayBuffer());
        const video = isVideo(file) ? URL.createObjectURL(file) : undefined;
        if (video) mediaUrls.add(video);
        assets.push({ name: file.name, buffer, video });
      } catch {
        failed.push(file.name);
      }
    }
    if (assets.length) addAssets(assets, at);
    report(assets.length + ' archivo(s) importado(s).' + (failed.length ? ' Audio no disponible o códec incompatible: ' + failed.join(', ') + '.' : ''));
  });
}
$('import').onclick = () => $('files').click();
$('files').onchange = (event) => {
  loadFiles([...event.target.files], cursor);
  event.target.value = '';
};
for (const target of [$('drop'), timeline]) {
  target.addEventListener('dragover', (event) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    target.classList.add('over');
  });
  target.addEventListener('dragleave', (event) => {
    if (!target.contains(event.relatedTarget)) target.classList.remove('over');
  });
  target.addEventListener('drop', (event) => {
    event.preventDefault();
    target.classList.remove('over');
    if (event.dataTransfer.files.length) loadFiles([...event.dataTransfer.files], target === timeline ? position(event) : cursor);
  });
}
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) for (const url of mediaUrls) URL.revokeObjectURL(url);
});
timeline.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const box = event.target.closest('.clip');
  if (!box) {
    seek(position(event));
    return;
  }
  event.preventDefault();
  viewport.focus({preventScroll:true});
  selected = Number(box.dataset.id);
  const clip = getSelected();
  const others = clips.filter((item) => item !== clip);
  const before = others.filter((item) => item.at < clip.at);
  const after = others.find((item) => item.at > clip.at);
  const previous = before[before.length - 1];
  drag = { clip, others, previous, after, initial: { ...clip }, x: event.clientX, y: event.clientY, mode: event.target.dataset.edge, id: event.pointerId };
  timeline.setPointerCapture(event.pointerId);
  render();
});
timeline.addEventListener('pointermove', (event) => {
  if (drag?.id !== event.pointerId) return;
  const delta = (event.clientX - drag.x) / scale;
  if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
  const inTrash = !drag.mode && overTrash(event);
  $('remove').classList.toggle('drop-active', inTrash);
  if (!drag.moved) {
    stop();
    save();
    drag.moved = true;
  }
  if (inTrash) return;
  const { clip, initial, others, previous, after, mode } = drag;
  if (mode === 'left') {
    const earliest = Math.max(0, initial.from + (previous ? end(previous) : 0) - initial.at);
    clip.from = Math.max(earliest, Math.min(initial.to - minimumClip, initial.from + delta));
    clip.at = initial.at + clip.from - initial.from;
  } else if (mode === 'right') {
    const latest = after ? initial.from + after.at - initial.at : Infinity;
    clip.to = Math.max(initial.from + minimumClip, Math.min(clip.asset.buffer.duration, latest, initial.to + delta));
  } else {
    const target = Math.max(0, initial.at + delta);
    const length = clip.to - clip.from;
    const magnets = [0, ...others.flatMap((item) => [end(item), item.at - length]).filter((at) => at >= 0)];
    const closest = magnets.reduce((best, at) => Math.abs(at - target) < Math.abs(best - target) ? at : best);
    clip.at = nearestSlot(snap && Math.abs(closest - target) * scale < 14 ? closest : target, length, others);
  }
  sort();
  render();
});
timeline.addEventListener('pointerup', (event) => {
  if (drag?.id !== event.pointerId) return;
  if (drag.moved && !drag.mode && overTrash(event)) {
    Object.assign(drag.clip, drag.initial);
    sort();
    remove(false);
  }
  $('remove').classList.remove('drop-active');
  drag = undefined;
});
timeline.addEventListener('pointercancel', () => { $('remove').classList.remove('drop-active'); drag = undefined; });
function audibleIntervals(clip, threshold, minimum) {
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
$('silence').onclick = () => {
  stop();
  $('silenceDialog').returnValue = 'cancel';
  $('silenceDialog').showModal();
};
$('silenceDialog').onclose = () => {
  if ($('silenceDialog').returnValue !== 'apply') return;
  const clip = getSelected();
  if (!clip) return;
  const intervals = audibleIntervals(clip, $('threshold').valueAsNumber, $('minimum').valueAsNumber / 1000);
  const removed = clip.to - clip.from - intervals.reduce((sum, [from, to]) => sum + to - from, 0);
  if (removed < 0.001) return report('No se encontraron silencios con estos ajustes.');
  save();
  let at = clip.at;
  const replacements = intervals.map(([from, to]) => {
    const result = { ...clip, at, from, to, id: ++serial };
    at += to - from;
    return result;
  });
  clips = clips.filter((item) => item !== clip);
  if (snap) for (const item of clips) if (item.at >= end(clip) - 1e-8) item.at -= removed;
  clips.push(...replacements);
  selected = replacements[0]?.id;
  cursor = clip.at;
  sort();
  render();
  report('Silencio eliminado: ' + removed.toFixed(2) + ' s.');
};
$('video').onclick = () => {
  const clip = getSelected();
  if (!clip?.asset.video) return;
  stop();
  const dialog = $('videoDialog');
  const video = dialog.querySelector('video');
  video.src = clip.asset.video;
  video.onloadedmetadata = () => { video.currentTime = Math.min(clip.from, video.duration || clip.from); };
  video.onerror = () => report('El navegador no puede mostrar este video.');
  dialog.showModal();
};
$('videoDialog').onclose = () => {
  const video = $('videoDialog').querySelector('video');
  video.pause();
  video.removeAttribute('src');
  video.load();
};
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
let exporting = false;
$('export').onclick = async () => {
  if (!clips.length || exporting) return;
  exporting = true;
  $('export').disabled = true;
  report('Preparando la mezcla WAV…');
  try {
    const rate = 44100;
    const count = clips.some((clip) => clip.asset.buffer.numberOfChannels > 1) ? 2 : 1;
    const offline = new OfflineAudioContext(count, Math.ceil(duration() * rate), rate);
    schedule(offline, clips, 0, 0);
    const url = URL.createObjectURL(wav(await offline.startRendering()));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'audio-studio.wav';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    report('Mezcla WAV exportada.');
  } catch {
    report('No se pudo exportar la mezcla. Prueba con un proyecto más corto.');
  } finally {
    exporting = false;
    $('export').disabled = !clips.length;
  }
};
function minScale() {
  return Math.min(0.1, Math.max(1, viewport.clientWidth - 5) / (duration() + 2));
}
function changeScale(next) {
  const anchor = Math.min(viewport.clientWidth, Math.max(0, cursor * scale - viewport.scrollLeft));
  scale = Math.max(minScale(), Math.min(1000, next));
  render();
  viewport.scrollLeft = Math.max(0, cursor * scale - anchor);
}
$('zoom').oninput = () => {
  const min = minScale();
  changeScale(min * (1000 / min) ** ($('zoom').valueAsNumber / 1000));
};
$('fit').onclick = () => {
  changeScale((viewport.clientWidth - 5) / (duration() + 2));
  viewport.scrollLeft = 0;
};
$('snap').onclick = () => {
  snap = !snap;
  $('snap').setAttribute('aria-pressed', String(snap));
  report(snap ? 'Pegado automático activado. Los clips nuevos se añaden al final.' : 'Pegado automático desactivado. Suelta el clip en un espacio libre de la pista.');
};
$('play').onclick = play;
$('rewind').onclick = () => { seek(0); viewport.scrollLeft = 0; };
$('split').onclick = split;
$('remove').onclick = remove;
$('undo').onclick = restore;
window.addEventListener('keydown', (event) => {
  if (document.querySelector('dialog[open]') || event.target.matches('textarea,input:not([type=range]),[contenteditable=true]')) return;
  const command = event.ctrlKey || event.metaKey;
  if (command && event.key.toLowerCase() === 'b') { event.preventDefault(); split(); }
  else if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); restore(); }
  else if (event.code === 'Space' && !event.target.closest('button,a')) { event.preventDefault(); play(); }
  else if (['Delete', 'Backspace'].includes(event.key) && getSelected()) { event.preventDefault(); remove(); }
});
for (const key of ['gainDb', 'fadeIn', 'fadeOut']) {
  $(key).oninput = () => {
    $(key + 'Value').textContent = $(key).value + (key === 'gainDb' ? ' dB' : ' s');
  };
  $(key).onchange = () => {
    const clip = getSelected();
    if (!clip) return;
    stop();
    save();
    clip[key] = $(key).valueAsNumber;
    render();
  };
}
$('add').onclick = () => $('files').click();
$('search').oninput = render;
for (const tab of document.querySelectorAll('[data-kind]')) {
  tab.onclick = () => {
    mediaKind = tab.dataset.kind;
    $('collectionName').textContent = {all:'Todos',audio:'Audio',video:'Video'}[mediaKind];
    for (const other of document.querySelectorAll('[data-kind]')) other.setAttribute('aria-pressed', String(other.dataset.kind === mediaKind));
    render();
  };
}
new ResizeObserver(render).observe(viewport);
render();
