import { keyframeGeometryPatch, upsertKeyframe } from './keyframes';
import type { Layer } from './types';

/** Keep the original artwork stable when editing a partially animated Size. */
export function geometryEditPatch(
  layer: Layer,
  patch: Partial<Layer>,
  projectTime: number,
  fps: number,
): Partial<Layer> {
  const result = keyframeGeometryPatch(layer, patch, projectTime, fps);
  if (!layer.keyframes?.width?.length && !layer.keyframes?.height?.length) return result;

  const localTime = Math.round((projectTime - layer.start) * fps) / fps;
  let draft = { ...layer, ...result };
  for (const property of ['width', 'height'] as const) {
    const value = patch[property];
    if (
      typeof value !== 'number' ||
      layer.keyframes?.[property]?.length ||
      value === layer[property]
    )
      continue;
    // Imports may animate only one size axis. Editing the other axis should
    // scale its content too, rather than changing the artwork's reference box.
    // Anchor its original size at the clip start before adding the edited pose.
    draft = { ...draft, ...upsertKeyframe(draft, property, 0, layer[property]) };
    draft = { ...draft, ...upsertKeyframe(draft, property, localTime, value) };
    result.keyframes = draft.keyframes;
    result.keyframeOffset = draft.keyframeOffset;
    delete result[property];
  }
  return result;
}
