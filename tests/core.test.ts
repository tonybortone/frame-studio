// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  changeAspectRatio,
  createLayer,
  createProject,
  duplicateLayers,
  parseProject,
  splitLayer,
} from '../src/core/project';
import { importSvg } from '../src/core/svg';
import { TEMPLATES } from '../src/core/templates';
import { createShapePreset, SHAPE_PRESETS } from '../src/core/creation';

describe('project files', () => {
  it('round-trips authored projects and every starter template', () => {
    for (const project of [createProject(), ...TEMPLATES.map((template) => template.project())]) {
      expect(parseProject(JSON.stringify(project))).toEqual(project);
    }
  });

  it('supplies defaults for optional settings in older version-one projects', () => {
    const project = JSON.parse(JSON.stringify(createProject()));
    delete project.components;
    delete project.layers[0].brightness;
    delete project.layers[0].animation;
    const loaded = parseProject(JSON.stringify(project));
    expect(loaded.components).toEqual([]);
    expect(loaded.layers[0].brightness).toBe(1);
    expect(loaded.layers[0].animation).toBe('none');
    expect(loaded.layers[0].animationDuration).toBeUndefined();
    expect(loaded.layers[0].animationEasing).toBeUndefined();
    expect(loaded.layers[0].audioFadeIn).toBeUndefined();
    expect(loaded.layers[0].transform3d).toBeUndefined();
  });

  it('preserves element 3D through projects, components, duplication, splitting and resizing', () => {
    const project = createProject();
    const layer = createLayer('shape', {
      transform3d: { enabled: true, rotateX: 24, rotateY: -35, z: 18, motion: 'float' },
    });
    project.layers = [layer];
    project.components = [{ id: '3d-card', name: '3D card', layers: [layer] }];
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    expect(duplicateLayers([layer])[0].transform3d).toEqual(layer.transform3d);
    expect(
      splitLayer(layer, layer.start + layer.duration / 2).map((part) => part.transform3d),
    ).toEqual([layer.transform3d, layer.transform3d]);
    expect(changeAspectRatio(project, 1080, 1920).layers[0].transform3d).toEqual(layer.transform3d);
    layer.transform3d!.enabled = false;
    expect(parseProject(JSON.stringify(project)).layers[0].transform3d).toEqual(layer.transform3d);
  });

  it('strictly validates element 3D in layers and saved components', () => {
    const valid = { enabled: true, rotateX: 12, rotateY: -18, z: 0, motion: 'none' };
    const invalid = [
      null,
      [],
      {},
      { ...valid, enabled: 'true' },
      { ...valid, rotateX: 181 },
      { ...valid, rotateY: -181 },
      { ...valid, z: 101 },
      { ...valid, z: null },
      { ...valid, motion: 'spin' },
      { ...valid, camera: 42 },
    ];
    for (const transform3d of invalid) {
      for (const component of [false, true]) {
        const project = JSON.parse(JSON.stringify(createProject()));
        project.layers[0].transform3d = transform3d;
        if (component) {
          project.components = [{ id: 'bad', name: 'Bad', layers: project.layers }];
          project.layers = [];
        }
        expect(() => parseProject(JSON.stringify(project))).toThrow();
      }
    }
    const project = createProject();
    project.layers = [createLayer('audio', { transform3d: { ...valid, motion: 'none' } })];
    expect(() => parseProject(JSON.stringify(project))).toThrow(
      '3D transforms require a visual layer',
    );
    project.layers = [createLayer('shape', { transform3d: { ...valid, motion: 'none' } })];
    expect(() => parseProject(JSON.stringify(project).replace('"z":0', '"z":1e999'))).toThrow(
      'finite number',
    );
  });

  it('round-trips authored motion and sound settings in projects and saved components', () => {
    const project = createProject();
    const layer = createLayer('video', {
      animation: 'slide',
      animationDuration: 1.2,
      animationDelay: 0.3,
      animationEasing: 'ease-in-out',
      exitDuration: 0.4,
      audioFadeIn: 0.2,
      audioFadeOut: 1,
    });
    project.layers = [layer];
    project.components = [{ id: 'motion-card', name: 'Motion card', layers: [layer] }];
    expect(parseProject(JSON.stringify(project))).toEqual(project);
    expect(duplicateLayers([layer])[0]).toMatchObject({
      animationDelay: 0.3,
      animationEasing: 'ease-in-out',
      audioFadeOut: 1,
    });
  });

  it('rejects invalid motion timings and easing in both layers and saved components', () => {
    const timings = [
      'animationDuration',
      'animationDelay',
      'exitDuration',
      'audioFadeIn',
      'audioFadeOut',
    ];
    for (const key of timings) {
      for (const value of [-0.1, 3600.1, '1', null]) {
        const project = createProject();
        project.layers = [createLayer('shape', { [key]: value })];
        expect(() => parseProject(JSON.stringify(project))).toThrow();
      }
      const project = createProject();
      project.layers = [createLayer('shape', { [key]: 1 })];
      expect(() =>
        parseProject(JSON.stringify(project).replace(`"${key}":1`, `"${key}":1e999`)),
      ).toThrow('finite number');
    }
    const project = createProject();
    project.components = [{ id: 'motion', name: 'Motion', layers: [createLayer('shape')] }];
    const invalid = JSON.stringify(project).replace(
      '"name":"Shape"',
      '"name":"Shape","animationEasing":"spring"',
    );
    expect(() => parseProject(invalid)).toThrow('Unsupported animation easing');
  });

  it('accepts zero timings and all supported easing curves without changing authored values', () => {
    const project = createProject();
    project.layers = (['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const).map(
      (animationEasing) =>
        createLayer('shape', {
          animationEasing,
          animationDuration: 0,
          animationDelay: 3600,
          exitDuration: 0,
          audioFadeIn: 0,
          audioFadeOut: 0,
        }),
    );
    expect(parseProject(JSON.stringify(project))).toEqual(project);
  });

  it.each([
    'https://example.com/video.mp4',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz4=',
  ])('rejects unsafe media source %s', (src) => {
    const project = createProject();
    project.layers = [createLayer('image', { src })];
    expect(() => parseProject(JSON.stringify(project))).toThrow(/embedded base64/);
  });

  it('allows embedded media while checking that its type matches its layer', () => {
    const project = createProject();
    project.layers = [createLayer('image', { src: 'data:image/png;base64,aGVsbG8=' })];
    expect(parseProject(JSON.stringify(project)).layers[0].src).toBe(project.layers[0].src);
    project.layers[0].kind = 'audio';
    expect(() => parseProject(JSON.stringify(project))).toThrow(/embedded base64/);
  });

  it('rejects duplicate IDs in projects and inside saved components', () => {
    const project = createProject();
    project.layers.push({ ...project.layers[0] });
    expect(() => parseProject(JSON.stringify(project))).toThrow(/duplicate layer IDs/);
    project.layers.pop();
    project.components = [
      { id: 'component', name: 'Unsafe component', layers: [project.layers[0], project.layers[0]] },
    ];
    expect(() => parseProject(JSON.stringify(project))).toThrow(/duplicate layer IDs/);
  });

  it.each([
    ['x', 1e10],
    ['opacity', 4],
    ['duration', -5],
    ['hidden', 'true'],
    ['volume', -1],
    ['fontSize', 0],
  ])('rejects invalid %s values', (key, value) => {
    const project = JSON.parse(JSON.stringify(createProject()));
    project.layers[0][key] = value;
    expect(() => parseProject(JSON.stringify(project))).toThrow();
  });

  it('rejects numeric overflow, unsupported versions and unexpected object properties', () => {
    const serialized = JSON.stringify(createProject());
    expect(() => parseProject(serialized.replace('"width":1920', '"width":1e999'))).toThrow(
      /finite/,
    );
    expect(() => parseProject(serialized.replace('"version":1', '"version":2'))).toThrow(/version/);
    expect(() =>
      parseProject(serialized.replace('"version":1', '"version":1,"__proto__":{}')),
    ).toThrow(/unsupported property/);
  });

  it('validates component content as strictly as canvas content', () => {
    const project = createProject();
    project.components = [
      {
        id: 'component',
        name: 'Injected vector',
        layers: [createLayer('svg', { path: '<script>alert(1)</script>' })],
      },
    ];
    expect(() => parseProject(JSON.stringify(project))).toThrow(/SVG path commands/);
  });

  it.each(['M0 0L1e999 2', 'M0 0L1', 'M0 0A4 5 0 7 0 20 20'])(
    'rejects malformed or unbounded vector path data: %s',
    (path) => {
      const project = { ...createProject(), layers: [createLayer('svg', { path })] };
      expect(() => parseProject(JSON.stringify(project))).toThrow(/valid SVG path/);
    },
  );
});

describe('editing operations', () => {
  it('splits media without restarting its source and does not modify the original', () => {
    const original = createLayer('video', { start: 5, duration: 10, mediaOffset: 7 });
    const [left, right] = splitLayer(original, 9);
    expect(left).toMatchObject({ id: original.id, start: 5, duration: 4, mediaOffset: 7 });
    expect(right).toMatchObject({ start: 9, duration: 6, mediaOffset: 11 });
    expect(right.id).not.toBe(original.id);
    expect(original.duration).toBe(10);
    expect(splitLayer(original, 5)).toEqual([original]);
    expect(splitLayer(original, 15)).toEqual([original]);
    expect(splitLayer(original, NaN)).toEqual([original]);
  });

  it('retains clip-relative authored motion and sound timings when splitting', () => {
    const original = createLayer('video', {
      duration: 4,
      animation: 'pop',
      animationDelay: 0.2,
      animationDuration: 2,
      exitDuration: 1.5,
      audioFadeIn: 1,
      audioFadeOut: 2,
    });
    const parts = splitLayer(original, 1);
    expect(parts.map((layer) => layer.duration)).toEqual([1, 3]);
    for (const layer of parts) {
      expect(layer).toMatchObject({
        animation: 'pop',
        animationDelay: 0.2,
        animationDuration: 2,
        exitDuration: 1.5,
        audioFadeIn: 1,
        audioFadeOut: 2,
      });
    }
  });

  it('duplicates component groups independently while preserving layout and media offsets', () => {
    const originals = [
      createLayer('shape', { groupId: 'one', x: 10 }),
      createLayer('text', { groupId: 'one', x: 20 }),
      createLayer('video', { groupId: 'two', mediaOffset: 3 }),
      createLayer('image'),
    ];
    const copies = duplicateLayers(originals);
    expect(copies.every((copy) => !originals.some((layer) => layer.id === copy.id))).toBe(true);
    expect(copies[0].groupId).toBe(copies[1].groupId);
    expect(copies[0].groupId).not.toBe('one');
    expect(copies[2].groupId).not.toBe(copies[0].groupId);
    expect(copies[3].groupId).toBeUndefined();
    expect(copies[1].x - copies[0].x).toBe(10);
    expect(copies[2].mediaOffset).toBe(3);
  });

  it('fits an existing scene proportionally into a portrait canvas', () => {
    const project = createProject();
    const resized = changeAspectRatio(project, 1080, 1920);
    const scale = 1080 / 1920;
    expect(resized.width).toBe(1080);
    expect(resized.layers[0].width / resized.layers[0].height).toBeCloseTo(
      project.layers[0].width / project.layers[0].height,
    );
    expect(resized.layers[0].x).toBeCloseTo(project.layers[0].x * scale);
    expect(resized.layers[0].y).toBeCloseTo(
      project.layers[0].y * scale + (1920 - 1080 * scale) / 2,
    );
    expect(project.width).toBe(1920);
    expect(() => changeAspectRatio(project, Infinity, 1920)).toThrow(/finite/);
  });
});

describe('SVG import', () => {
  it('decomposes groups and transforms into separately editable primitives', () => {
    const layers = importSvg(
      '<svg viewBox="0 0 200 100"><g transform="translate(10 20)" fill="#f80"><rect id="card" x="5" y="6" width="30" height="40"/><g transform="scale(2)"><circle cx="10" cy="10" r="5"/></g></g></svg>',
    );
    expect(layers).toHaveLength(2);
    expect(layers[0]).toMatchObject({
      name: 'card',
      x: 15,
      y: 26,
      width: 30,
      height: 40,
      fill: '#f80',
      kind: 'svg',
    });
    expect(layers[1]).toMatchObject({ x: 20, y: 30, width: 20, height: 20 });
    expect(layers[0].groupId).toBe(layers[1].groupId);
    const project = { ...createProject(), layers };
    expect(parseProject(JSON.stringify(project)).layers).toEqual(layers);
  });

  it('honors nonzero viewBox origins, viewport scaling, and rotation around a center', () => {
    const [layer] = importSvg(
      '<svg viewBox="10 20 100 100" width="200" height="200"><rect x="20" y="30" width="40" height="20" transform="rotate(90 40 40)"/></svg>',
    );
    expect(layer).toMatchObject({ x: 20, y: 20, width: 80, height: 40 });
    expect(layer.rotation).toBeCloseTo(90);
  });

  it('retains path data without inserting original markup', () => {
    const [layer] = importSvg(
      '<svg viewBox="0 0 80 40"><path d="M0 0 L80 0 L40 40 Z" style="fill:rgb(12, 34, 56);opacity:0.5"/></svg>',
    );
    expect(layer.path).toBe('M0 0 L80 0 L40 40 Z');
    expect(layer.fill).toBe('#0c2238');
    expect(layer.opacity).toBe(0.5);
    expect(layer.src).toBeUndefined();
  });

  it.each([
    '<script>alert(1)</script>',
    '<foreignObject><div>HTML</div></foreignObject>',
    '<rect width="20" height="20" onclick="alert(1)"/>',
    '<rect width="20" height="20" fill="url(https://example.com/paint)"/>',
    '<image href="https://example.com/secret.png"/>',
    '<use href="#other"/>',
    '<style>rect { fill: red; }</style>',
  ])('rejects active content, references, and unsupported appearance: %s', (contents) => {
    expect(() => importSvg(`<svg viewBox="0 0 100 100">${contents}</svg>`)).toThrow(/SVG import/);
  });

  it('rejects invalid geometry and skew rather than silently changing the artwork', () => {
    expect(() =>
      importSvg(
        '<svg viewBox="0 0 100 100"><rect width="20" height="20" transform="skewX(30)"/></svg>',
      ),
    ).toThrow(/Skew/);
    expect(() =>
      importSvg('<svg viewBox="0 0 100 100"><rect width="-20" height="20"/></svg>'),
    ).toThrow(/positive/);
    expect(() => importSvg('<!DOCTYPE svg [<!ENTITY x "hello">]><svg/>')).toThrow(/entities/);
    expect(() => importSvg('<svg>')).toThrow(/valid SVG/);
  });
});

describe('toolbar shapes', () => {
  it('fits editable shape geometry into tiny and portrait frames and clamps insertion to the last frame', () => {
    for (const [width, height] of [
      [16, 16],
      [240, 720],
      [1920, 1080],
    ]) {
      const project = { ...createProject(), width, height };
      for (const { id } of SHAPE_PRESETS) {
        const layer = createShapePreset(id, project, project.duration + 10);
        expect(layer.x).toBeGreaterThanOrEqual(0);
        expect(layer.y).toBeGreaterThanOrEqual(0);
        expect(layer.x + layer.width).toBeLessThanOrEqual(width);
        expect(layer.y + layer.height).toBeLessThanOrEqual(height);
        expect(layer.start).toBeCloseTo(project.duration - 1 / project.fps);
        expect(layer.start + layer.duration).toBeCloseTo(project.duration);
        const stored = { ...project, layers: [layer] };
        expect(parseProject(JSON.stringify(stored))).toEqual(stored);
      }
    }
  });
});
