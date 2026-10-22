import { useId } from 'react';
import './ToolGlyph.css';

export type ToolGlyphKind = 'select' | 'hand' | 'shape' | 'text' | 'draw' | 'media' | 'component';

/** Small, original material illustrations for the editor's creation tools. */
export default function ToolGlyph({ kind, size = 40 }: { kind: ToolGlyphKind; size?: number }) {
  const id = useId().replace(/:/g, '');
  const silver = `url(#${id}-silver)`;
  const edge = `url(#${id}-edge)`;
  const dark = `url(#${id}-dark)`;
  return (
    <svg
      className={`tool-glyph tool-glyph-${kind}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={`${id}-silver`}
          x1="12"
          y1="9"
          x2="36"
          y2="42"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff" />
          <stop offset=".31" stopColor="#d7d9dc" />
          <stop offset=".58" stopColor="#999da3" />
          <stop offset=".8" stopColor="#d0d3d6" />
          <stop offset="1" stopColor="#797e85" />
        </linearGradient>
        <linearGradient
          id={`${id}-edge`}
          x1="16"
          y1="8"
          x2="31"
          y2="43"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#f5f6f7" />
          <stop offset=".5" stopColor="#777c83" />
          <stop offset="1" stopColor="#3a3d42" />
        </linearGradient>
        <linearGradient
          id={`${id}-dark`}
          x1="13"
          y1="12"
          x2="35"
          y2="37"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#535960" />
          <stop offset="1" stopColor="#1d2025" />
        </linearGradient>
      </defs>
      <g className="tool-glyph-object">
        {kind === 'select' && (
          <>
            <path
              d="m12 9 27 17-12 3-6 13z"
              fill="#131517"
              stroke="#141619"
              strokeWidth="2"
              transform="translate(0 1.5)"
            />
            <path
              d="m12 7 27 17-12 3-6 13z"
              fill={silver}
              stroke={edge}
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <path d="m14 10 11 17-4 10z" fill="#fff" fillOpacity=".14" />
            <path
              d="m14.5 9.8 20.6 13"
              stroke="#fff"
              strokeOpacity=".7"
              strokeWidth=".8"
              strokeLinecap="round"
            />
          </>
        )}
        {kind === 'hand' && (
          <>
            <path
              d="M16 25V12c0-3.6 5-3.6 5 0V8c0-3.3 5-3.3 5 0v4c0-3.4 5-3.4 5 0v5c0-3.2 5-3.2 5 0v11c0 8-5.2 13-12 13-5.5 0-9-3-12-7l-4-6c-2-3.3 2.3-6.2 4.7-3.3L16 29"
              fill={silver}
              stroke={edge}
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
            <path
              d="M21 13v11m5-9v9m5-5v6"
              stroke="#6d737a"
              strokeWidth="1"
              strokeLinecap="round"
            />
            <path d="M19 28c4-2 9-.2 10 3" stroke="#7a7f85" strokeWidth="1" strokeLinecap="round" />
            <path
              d="M19 12V9.5M24 8V7m10 11v8"
              stroke="#fff"
              strokeOpacity=".75"
              strokeWidth="1"
              strokeLinecap="round"
            />
          </>
        )}
        {kind === 'shape' && (
          <g transform="rotate(-10 24 24)">
            <rect x="11" y="14" width="29" height="28" rx="6" fill="#111315" />
            <rect
              x="9"
              y="8"
              width="29"
              height="29"
              rx="6"
              fill={silver}
              stroke={edge}
              strokeWidth="1"
            />
            <rect
              x="13"
              y="12"
              width="21"
              height="21"
              rx="3.5"
              fill="none"
              stroke="#fff"
              strokeOpacity=".35"
            />
            <path
              d="M15 9.5h17c3 0 4.5 1.5 4.5 4.5"
              stroke="#fff"
              strokeOpacity=".75"
              strokeWidth=".9"
              strokeLinecap="round"
            />
          </g>
        )}
        {kind === 'text' && (
          <>
            <path
              d="M10 10h29v10h-4l-1-5h-6v23h5v4H16v-4h5V15h-6l-1 5h-4z"
              fill="#111315"
              transform="translate(0 1)"
            />
            <path
              d="M9 8h29v10h-4l-1-5h-6v23h5v4H15v-4h5V13h-6l-1 5H9z"
              fill={silver}
              stroke={edge}
              strokeWidth="1"
              strokeLinejoin="round"
            />
            <path
              d="M11 9.5h25M21.5 14v20"
              stroke="#fff"
              strokeOpacity=".6"
              strokeWidth="1"
              strokeLinecap="round"
            />
          </>
        )}
        {kind === 'draw' && (
          <g transform="rotate(35 24 24)">
            <path d="M19 10h10v24l-5 9-5-9z" fill="#111315" transform="translate(1.5 1)" />
            <path
              d="M19 10h10v23l-5 9-5-9z"
              fill={silver}
              stroke={edge}
              strokeWidth="1"
              strokeLinejoin="round"
            />
            <path
              d="M19 10V7.5C19 6 20 5 21.5 5h5C28 5 29 6 29 7.5V10z"
              fill="#b5b9c0"
              stroke={edge}
            />
            <path d="M20 13h8M20 15h8" stroke="#646b74" strokeWidth=".8" />
            <path d="M22 17v15M25 17v15" stroke="#f7f8f9" strokeOpacity=".65" strokeWidth="1.2" />
            <path d="m19.5 33 4.5 8 4.5-8-4.5 2z" fill="#acadb1" />
            <path d="m22.5 38.5 1.5 3 1.5-3z" fill="#343941" />
            <path d="M20 7h7" stroke="#f9fafb" strokeOpacity=".65" strokeLinecap="round" />
          </g>
        )}
        {kind === 'media' && (
          <>
            <path d="M21 34h7v4h6v3H15v-3h6z" fill={silver} stroke={edge} strokeWidth=".8" />
            <rect
              x="6"
              y="9"
              width="36"
              height="27"
              rx="4.5"
              fill={silver}
              stroke={edge}
              strokeWidth="1.1"
            />
            <rect
              x="9"
              y="12"
              width="30"
              height="19"
              rx="1.5"
              fill={dark}
              stroke="#272b30"
              strokeWidth=".8"
            />
            <path d="M11 27 19 19l6 6 4-4 8 8H11z" fill="#7f8994" fillOpacity=".65" />
            <circle cx="30.5" cy="17.5" r="2.5" fill="#c4cbd1" />
            <path
              d="M10 10.5h27"
              stroke="#fff"
              strokeOpacity=".75"
              strokeWidth=".8"
              strokeLinecap="round"
            />
            <circle cx="24" cy="33.5" r=".8" fill="#626a72" />
          </>
        )}
        {kind === 'component' && (
          <>
            <path d="m24 7 16 9v20l-16 9-16-9V16z" fill="#141719" transform="translate(0 1)" />
            <path
              d="m24 5 16 9-16 10-16-10z"
              fill={silver}
              stroke={edge}
              strokeWidth=".8"
              strokeLinejoin="round"
            />
            <path
              d="m8 14 16 10v19L8 34z"
              fill="#8d949c"
              stroke={edge}
              strokeWidth=".8"
              strokeLinejoin="round"
            />
            <path
              d="m24 24 16-10v20l-16 9z"
              fill={dark}
              stroke={edge}
              strokeWidth=".8"
              strokeLinejoin="round"
            />
            <path
              d="m11 14 13 8 13-8M24 25v15"
              stroke="#fff"
              strokeOpacity=".55"
              strokeWidth=".8"
              strokeLinecap="round"
            />
            <path d="m17 10 15 9v8l-5 3v-8L12 13z" fill="#d0d5dc" fillOpacity=".6" />
          </>
        )}
      </g>
    </svg>
  );
}
