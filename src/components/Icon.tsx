import type { ToolIcon } from '@/content/tools';

const paths: Record<ToolIcon, string[]> = {
  home: ['M3 11l9-8 9 8', 'M5 10v10h5v-6h4v6h5V10'],
  list: ['M4 4h16v6H4z', 'M4 14h16v6H4z'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  book: ['M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z', 'M4 21V5', 'M8 7h7', 'M8 11h5'],
  chart: ['M4 19V9', 'M10 19V5', 'M16 19v-7', 'M21 19H3'],
};

export function Icon({ name, color = 'currentColor', size = 18 }: { name: ToolIcon; color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
