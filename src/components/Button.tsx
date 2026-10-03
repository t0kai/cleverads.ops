import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import ui from './ui.module.css';

type Variant = 'primary' | 'outline' | 'danger' | 'ghost';
type Size = 'small' | 'medium' | 'large';

function classes(variant: Variant, size: Size, full?: boolean, extra?: string) {
  return [ui.btn, ui[variant], size === 'small' ? ui.small : size === 'large' ? ui.large : '', full ? ui.full : '', extra ?? '']
    .filter(Boolean)
    .join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
}

export function Button({ variant = 'outline', size = 'medium', full, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={classes(variant, size, full, className)} {...rest} />;
}

export function ButtonLink({ href, children, variant = 'outline', size = 'medium' }: { href: string; children: ReactNode; variant?: Variant; size?: Size }) {
  return (
    <Link href={href} className={classes(variant, size)}>
      {children}
    </Link>
  );
}
