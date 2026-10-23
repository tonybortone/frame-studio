import { describe, expect, it } from 'vitest';
import { parseTimecode, timecode } from '../src/core/timecode';

describe('timeline time entry', () => {
  it('accepts seconds and minute formats on the composition frame grid', () => {
    expect(parseTimecode(' 2.5 ', 30)).toBe(2.5);
    expect(parseTimecode('1:02.5', 30)).toBe(62.5);
    expect(parseTimecode('01:02:15', 30)).toBe(62.5);
    expect(parseTimecode('00:00:23', 24)).toBe(23 / 24);
    expect(parseTimecode('0.041', 24)).toBe(1 / 24);
    expect(parseTimecode('0', 30)).toBe(0);
  });

  it('rejects malformed input and seconds or frames that overflow their field', () => {
    for (const value of [
      '',
      ' ',
      '-1',
      '1e3',
      '2s',
      ':30',
      '1:',
      '1:60',
      '00:01:30',
      '00:00:-1',
      '1:2:3:4',
      '1:1.5:2',
    ])
      expect(parseTimecode(value, 30), value).toBeNull();
    expect(parseTimecode('00:00:24', 24)).toBeNull();
    expect(parseTimecode('1', 0)).toBeNull();
  });

  it('round-trips frame-aligned display values across frame rates and minute boundaries', () => {
    for (const fps of [24, 25, 29.97, 30, 60])
      for (const frame of [
        0,
        1,
        Math.round(fps) - 1,
        Math.round(fps) * 60 - 1,
        Math.round(fps) * 60,
        Math.round(fps) * 125 + 7,
      ])
        expect(parseTimecode(timecode(frame / fps, fps), fps)).toBeCloseTo(frame / fps, 9);
    expect(timecode(59.999, 30)).toBe('01:00:00');
  });
});
