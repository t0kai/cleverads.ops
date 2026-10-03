/** Placeholder mark until the real CleverAds logo file is added to /public. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.27,
        background: 'var(--brand-gradient)',
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.5,
        boxShadow: '0 4px 10px rgba(36, 71, 214, 0.28)',
        flex: 'none',
      }}
    >
      C
    </span>
  );
}
