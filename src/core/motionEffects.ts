import type { Layer, TextRevealMode } from './types';

/** Reveals grow from the named edge; center grows horizontally from the middle. */
export function getRevealGeometry(
  artwork: Pick<Layer, 'width' | 'height'>,
  effects: Pick<Layer, 'reveal' | 'revealDirection'>,
): { x: number; y: number; width: number; height: number } | undefined {
  const progress = Math.max(0, Math.min(1, effects.reveal ?? 1));
  if (progress >= 1) return undefined;
  const { width, height } = artwork;
  switch (effects.revealDirection ?? 'left') {
    case 'right':
      return { x: width * (1 - progress), y: 0, width: width * progress, height };
    case 'up':
      return { x: 0, y: 0, width, height: height * progress };
    case 'down':
      return { x: 0, y: height * (1 - progress), width, height: height * progress };
    case 'center':
      return { x: (width * (1 - progress)) / 2, y: 0, width: width * progress, height };
    default:
      return { x: 0, y: 0, width: width * progress, height };
  }
}

export interface TextRevealLine {
  /** Always the full authored line: painting and shaping do not reflow as it reveals. */
  text: string;
  /** A Unicode-safe prefix used only to measure a visibility clip. */
  visibleText: string;
  complete: boolean;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const words = new Intl.Segmenter(undefined, { granularity: 'word' });
const boundaryCache = new Map<string, { text: string; ends: number[] }>();

function revealBoundaries(text: string, mode: TextRevealMode): number[] {
  const key = `${mode}:${text}`;
  const cached = boundaryCache.get(key);
  if (cached) return cached.ends;
  let ends: number[];
  if (mode === 'words') {
    const starts = Array.from(words.segment(text))
      .filter((segment) => segment.isWordLike)
      .map((segment) => segment.index);
    // Punctuation and whitespace travel with their preceding word. Emoji-only
    // titles still reveal as whole grapheme clusters rather than broken surrogates.
    ends = starts.length ? [...starts.slice(1), text.length] : [];
  } else ends = [];
  if (!ends.length) {
    ends = Array.from(graphemes.segment(text))
      .filter((segment) => !/^[\r\n]+$/.test(segment.segment))
      .map((segment) => segment.index + segment.segment.length);
  }
  // Bound retained authored text across playback, previews, and changed titles.
  let retained = text.length;
  for (const entry of boundaryCache.values()) retained += entry.text.length;
  while (boundaryCache.size >= 8 || (retained > 200000 && boundaryCache.size)) {
    const oldest = boundaryCache.keys().next().value!;
    retained -= boundaryCache.get(oldest)!.text.length;
    boundaryCache.delete(oldest);
  }
  boundaryCache.set(key, { text, ends });
  return ends;
}

export function getTextRevealLines(
  text: string,
  progress = 1,
  mode: TextRevealMode = 'characters',
): TextRevealLine[] {
  let visibleEnd = text.length;
  if (progress <= 0) visibleEnd = 0;
  else if (progress < 1) {
    const ends = revealBoundaries(text, mode);
    const count = Math.floor(Math.max(0, progress) * ends.length + 1e-9);
    visibleEnd = count > 0 ? ends[count - 1] : 0;
  }
  let offset = 0;
  return text.split('\n').map((line) => {
    const visibleText = line.slice(0, Math.max(0, visibleEnd - offset));
    offset += line.length + 1;
    return { text: line, visibleText, complete: visibleText.length === line.length };
  });
}

export function getLayerFont(layer: Pick<Layer, 'fontSize' | 'fontWeight'>): string {
  return `${layer.fontWeight ?? 600} ${layer.fontSize ?? 48}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
}
