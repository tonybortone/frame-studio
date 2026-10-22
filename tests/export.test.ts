import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLayer, createProject } from '../src/core/project';
import { exportVideo, type VideoFormat } from '../src/engine/export';
import type { MediaCache } from '../src/engine/renderer';

const format: VideoFormat = {
  id: 'webm',
  label: 'WebM',
  mimeType: 'video/webm;codecs=vp9,opus',
  extension: 'webm',
};

/** Keep the real renderer and syncMedia path; substitute only browser media devices. */
function exportHarness(duration = 1.2) {
  const project = createProject();
  project.fps = 1;
  project.duration = duration;
  const layer = createLayer('audio', { duration, audioFadeIn: 0.3 });
  project.layers = [layer];
  const levels: Array<{ time: number; value: number }> = [];
  const element = {
    duration,
    readyState: 4,
    currentTime: 0,
    paused: true,
    seeking: false,
    pause: vi.fn(() => {
      element.paused = true;
    }),
    play: vi.fn(async () => {
      element.paused = false;
    }),
  };
  const entry = { element, playPending: false };
  const videoTrack = { stop: vi.fn() };
  const audioTrack = { stop: vi.fn() };
  const tracks = [videoTrack];
  const stream = {
    addTrack: vi.fn((track: typeof audioTrack) => tracks.push(track)),
    getTracks: () => tracks,
  };
  const media = {
    playbackError: null,
    prepare: vi.fn(async () => {}),
    mediaEntries: () => [[layer.id, entry]],
    setLevel: vi.fn((_id: string, value: number) =>
      levels.push({ time: performance.now() / 1000, value }),
    ),
    createAudioMix: vi.fn(async () => ({ getAudioTracks: () => [audioTrack] })),
    endAudioMix: vi.fn(),
  };
  const context = {
    canvas: undefined as unknown,
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    captureStream: vi.fn(() => stream),
  };
  context.canvas = canvas;
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
  let recorder: RecorderDouble | undefined;
  class RecorderDouble {
    static isTypeSupported(mimeType: string) {
      return mimeType === format.mimeType;
    }
    state: RecordingState = 'inactive';
    mimeType = format.mimeType;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    constructor() {
      recorder = this;
    }
    start = vi.fn(() => {
      this.state = 'recording';
    });
    stop = vi.fn(() => {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['encoded video']) });
      this.onstop?.();
    });
  }
  vi.stubGlobal('MediaRecorder', RecorderDouble);
  const progress = vi.fn();
  return {
    project,
    media,
    element,
    levels,
    context,
    canvas,
    videoTrack,
    audioTrack,
    progress,
    get recorder() {
      return recorder;
    },
    start: (signal?: AbortSignal) =>
      exportVideo(project, media as unknown as MediaCache, format, progress, signal),
  };
}

describe('video export sound cadence', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('updates a short audio fade before the next 1fps video frame, then finishes cleanly', async () => {
    const harness = exportHarness();
    const output = harness.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.canvas.captureStream).toHaveBeenCalledWith(1);
    expect(harness.context.fillRect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(150);
    expect(harness.levels.length).toBeGreaterThan(5);
    expect(harness.levels.at(-1)!.value).toBeGreaterThan(0.4);
    expect(harness.levels.at(-1)!.value).toBeLessThan(0.6);
    await vi.advanceTimersByTimeAsync(200);
    expect(harness.levels.at(-1)!.value).toBe(1);
    expect(harness.context.fillRect).toHaveBeenCalledTimes(1);
    expect(harness.progress).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(700);
    expect(harness.context.fillRect).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(200);
    expect((await output).size).toBeGreaterThan(0);
    expect(harness.progress).toHaveBeenLastCalledWith(1);
    expect(harness.media.endAudioMix).toHaveBeenCalledTimes(1);
    expect(harness.videoTrack.stop).toHaveBeenCalledTimes(1);
    expect(harness.audioTrack.stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the audio cadence and releases the recorder, audio mix, and stream tracks', async () => {
    const harness = exportHarness(4);
    const controller = new AbortController();
    const output = harness.start(controller.signal).then(
      () => null,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(harness.element.paused).toBe(false);
    controller.abort();
    const error = await output;
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
    expect(harness.recorder!.stop).toHaveBeenCalledTimes(1);
    expect(harness.media.endAudioMix).toHaveBeenCalledTimes(1);
    expect(harness.element.paused).toBe(true);
    expect(harness.videoTrack.stop).toHaveBeenCalledTimes(1);
    expect(harness.audioTrack.stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const levelsAfterCancel = harness.levels.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(harness.levels).toHaveLength(levelsAfterCancel);
    expect(harness.context.fillRect).toHaveBeenCalledTimes(1);
  });
});
