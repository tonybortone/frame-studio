/** Non-drop timecode uses a nominal integer rate; frame positions retain the actual fps. */
export function timecode(time: number, fps = 30) {
  const nominalFps = Math.round(fps);
  const frames = Math.max(0, Math.round(time * fps));
  const seconds = Math.floor(frames / nominalFps);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}:${String(frames % nominalFps).padStart(2, '0')}`;
}

/** Accept seconds, minutes:seconds, or minutes:seconds:frames; reject ambiguous overflow. */
export function parseTimecode(input: string, fps = 30): number | null {
  if (!Number.isFinite(fps) || fps < 1) return null;
  const nominalFps = Math.round(fps);
  const onFrameGrid = (seconds: number) => {
    const frames = Math.round(seconds * fps);
    return Number.isSafeInteger(frames) ? frames / fps : null;
  };
  const value = input.trim();
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const seconds = Number(value);
    return onFrameGrid(seconds);
  }
  const parts = value.split(':');
  if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d{1,2}(?:\.\d+)?$/.test(parts[1])) {
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    const result = minutes * 60 + seconds;
    return seconds < 60 ? onFrameGrid(result) : null;
  }
  if (parts.length === 3 && parts.every((part) => /^\d+$/.test(part))) {
    const [minutes, seconds, frames] = parts.map(Number);
    const totalFrames = (minutes * 60 + seconds) * nominalFps + frames;
    return seconds < 60 && frames < nominalFps && Number.isSafeInteger(totalFrames)
      ? totalFrames / fps
      : null;
  }
  return null;
}
