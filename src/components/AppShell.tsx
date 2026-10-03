'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { TOOLS } from '@/content/tools';
import { Button } from './Button';
import { Icon } from './Icon';
import { LogoMark } from './Logo';
import s from './AppShell.module.css';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

/** Signed-in frame: sidebar, content, footer. Sends signed-out visitors to the sign-in page. */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut, demo } = useAuth();
  const router = useRouter();
  const path = usePathname() ?? '/';

  useEffect(() => {
    if (!user) router.replace('/');
  }, [user, router]);
  if (!user) return null;

  const isActive = (href: string, matches?: readonly string[]) =>
    path === href || path === href.replace(/\/$/, '') || (matches ?? []).some((m) => path.startsWith(m));

  const item = (t: (typeof TOOLS)[number]) => {
    const active = isActive(t.href, t.matches);
    return (
      <Link key={t.id} href={t.href} className={`${s.navItem} ${active ? s.navActive : ''}`} aria-current={active ? 'page' : undefined}>
        <Icon name={t.icon} />
        {t.label}
      </Link>
    );
  };

  return (
    <div className={s.shell}>
      <aside className={s.sidebar}>
        <Link href="/home/" className={s.home} aria-label="CleverAds home" title="Home">
          <LogoMark />
          <span>
            <span className={s.brandName} style={{ display: 'block' }}>CleverAds</span>
            <span className={s.brandSub}>Operations</span>
          </span>
        </Link>
        <nav className={s.nav} aria-label="Main">
          {TOOLS.filter((t) => t.group === 'main').map(item)}
          <div className={s.divider} />
          {TOOLS.filter((t) => t.group === 'help').map(item)}
        </nav>
        <div className={s.profile}>
          {demo ? <div className={s.demo}>Preview mode: Google is not connected</div> : null}
          <div className={s.person}>
            <div className={s.avatar}>
              {user.picture ? <img src={user.picture} alt="" width={36} height={36} referrerPolicy="no-referrer" /> : initials(user.name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{user.name}</div>
              <div className={s.email}>{user.email}</div>
            </div>
          </div>
          <Button size="small" full onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className={s.main}>
        <div className={s.content}>{children}</div>
        <footer className={s.footer}>
          <div className={s.footerRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LogoMark size={22} />
              <span>CleverAds Operations · © {new Date().getFullYear()}</span>
            </div>
            <div>
              Designed &amp; built by <strong style={{ fontWeight: 600, color: 'var(--brand-strong)' }}>Taifur Rahman</strong>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
