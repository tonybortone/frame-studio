import type { Layer } from '../core/types';
import { createLayer } from '../core/project';

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

/** Alpha projects embed media for portable saves; larger-file references are a later milestone. */
export async function importMedia(file: File): Promise<Layer> {
  if (file.size > MAX_IMPORT_BYTES)
    throw new Error(
      'This alpha supports files up to 50 MB each. Use a smaller clip or compressed copy.',
    );
  if (file.size === 0) throw new Error('This file is empty.');
  if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml')
    throw new Error('Import SVG through the vector importer to edit its individual pieces.');
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const fallbackTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
  };
  const type = file.type || fallbackTypes[extension];
  if (!type || !/^(image|video|audio)\//.test(type))
    throw new Error('Choose an image, video, audio file, or SVG.');
  const kind = type.split('/')[0] as 'image' | 'video' | 'audio';
  const src = await readDataUrl(file.type ? file : new Blob([file], { type }));
  const metadata = await readMetadata(kind, src, file.name);
  return createLayer(kind, {
    name: file.name.replace(/\.[^.]+$/, ''),
    src,
    width: metadata.width,
    height: metadata.height,
    duration: metadata.duration,
    ...(kind === 'audio' || kind === 'video' ? { sourceDuration: metadata.duration } : {}),
    mediaOffset: 0,
    volume: 1,
  });
}

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The file could not be read.'));
    reader.onerror = () => reject(new Error('The file could not be read. Try choosing it again.'));
    reader.readAsDataURL(file);
  });
}

function readMetadata(
  kind: 'image' | 'video' | 'audio',
  src: string,
  name: string,
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const element = kind === 'image' ? new Image() : document.createElement(kind);
    const event = kind === 'image' ? 'load' : 'loadedmetadata';
    const cleanup = () => {
      clearTimeout(timer);
      element.removeEventListener(event, done);
      element.removeEventListener('durationchange', done);
      element.removeEventListener('timeupdate', done);
      element.removeEventListener('error', failed);
      if (element instanceof HTMLMediaElement) {
        element.removeAttribute('src');
        element.load();
      }
    };
    const failed = () => {
      cleanup();
      reject(
        new Error(
          `Cannot open “${name}”. Its media codec may not be supported. Try PNG/JPEG, H.264 MP4, or MP3/WAV.`,
        ),
      );
    };
    const done = () => {
      const naturalWidth =
        element instanceof HTMLImageElement
          ? element.naturalWidth
          : element instanceof HTMLVideoElement
            ? element.videoWidth
            : 640;
      const naturalHeight =
        element instanceof HTMLImageElement
          ? element.naturalHeight
          : element instanceof HTMLVideoElement
            ? element.videoHeight
            : 80;
      const scale = Math.min(1, 1000 / naturalWidth, 700 / naturalHeight);
      const duration = element instanceof HTMLMediaElement ? element.duration : 5;
      // MediaRecorder WebM files can omit a duration header. Seeking to the end
      // asks the browser's demuxer to discover the actual final timestamp.
      if (duration === Infinity && element instanceof HTMLMediaElement) {
        if (!findingDuration) {
          findingDuration = true;
          element.addEventListener('durationchange', done);
          element.addEventListener('timeupdate', done);
          element.currentTime = 1e10;
        }
        return;
      }
      if (!Number.isFinite(duration) || duration <= 0 || naturalWidth <= 0 || naturalHeight <= 0) {
        failed();
        return;
      }
      const metadata = {
        width: Math.round(naturalWidth * scale),
        height: Math.round(naturalHeight * scale),
        duration,
      };
      cleanup();
      resolve(metadata);
    };
    let findingDuration = false;
    const timer = setTimeout(failed, 20_000);
    element.addEventListener(event, done, { once: true });
    element.addEventListener('error', failed, { once: true });
    element.src = src;
    if (element instanceof HTMLMediaElement) {
      element.preload = 'metadata';
      element.load();
    }
  });
}
