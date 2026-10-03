import { useId } from 'react';
import { MARK_PATH, MARK_STOPS, TEXT_PATH } from './brandPaths';

function Gradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0.08" y1="0.92" x2="0.98" y2="0.12">
      {MARK_STOPS.map(([offset, color]) => (
        <stop key={offset} offset={offset} stopColor={color} />
      ))}
    </linearGradient>
  );
}

/** The round blue CleverAds "C". */
export function LogoMark({ size = 32 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="2 2 70 70" aria-hidden="true" style={{ flex: 'none', display: 'block' }}>
      <defs>
        <Gradient id={id} />
      </defs>
      <path fill={`url(#${id})`} fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}

/** Full logo as on clever-ads.com: the "C" above "CLEVER ADS". */
export function LogoFull({ height = 56, title = 'CleverAds' }: { height?: number; title?: string }) {
  const id = useId();
  return (
    <svg height={height} width={(height * 232) / 116} viewBox="2 2 232 116" role="img" aria-label={title} style={{ display: 'block' }}>
      <defs>
        <Gradient id={id} />
      </defs>
      <g transform="translate(86 0)">
        <path fill={`url(#${id})`} fillRule="evenodd" d={MARK_PATH} />
      </g>
      <g transform="translate(0 74)">
        <path fill="#14161c" fillRule="evenodd" d={TEXT_PATH} />
      </g>
    </svg>
  );
}
