/**
 * Left menu and Home tools. A new tool = one entry here + its folder under src/app/.
 * `soon` tools show on Home as "coming soon" and stay out of the menu.
 */
export type ToolIcon = 'home' | 'list' | 'clock' | 'book' | 'chart' | 'calc';

export interface Tool {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: ToolIcon;
  /** Extra paths that keep this menu item highlighted. */
  readonly matches?: readonly string[];
  readonly group: 'main' | 'help';
}

export const TOOLS: readonly Tool[] = [
  { id: 'home', label: 'Home', href: '/home/', icon: 'home', group: 'main' },
  { id: 'advertisers', label: 'Advertisers', href: '/advertisers/', icon: 'list', matches: ['/advertisers'], group: 'main' },
  { id: 'history', label: 'History', href: '/history/', icon: 'clock', group: 'main' },
  { id: 'guide', label: 'User guide', href: '/guide/', icon: 'book', group: 'help' },
];

export const COMING_SOON = [
  { name: 'Pacing dashboards', text: 'Delivery vs target, by client' },
  { name: 'Client email dashboard', text: 'Support inbox volume and replies' },
  { name: 'Campaign research', text: 'Post-campaign reports and insights' },
] as const;
