import { MousePointer2, Hand, Square, Type, PenTool, ImagePlus, Component } from '../icons';
import './ToolGlyph.css';

export type ToolGlyphKind = 'select' | 'hand' | 'shape' | 'text' | 'draw' | 'media' | 'component';

const glyphs = {
  select: MousePointer2,
  hand: Hand,
  shape: Square,
  text: Type,
  draw: PenTool,
  media: ImagePlus,
  component: Component,
};

/** Quiet, consistent line icons keep the canvas tools easy to scan. */
export default function ToolGlyph({ kind, size = 20 }: { kind: ToolGlyphKind; size?: number }) {
  const Glyph = glyphs[kind];
  return (
    <Glyph
      className={`tool-glyph tool-glyph-${kind}`}
      size={size}
      strokeWidth={1.7}
      aria-hidden="true"
    />
  );
}
