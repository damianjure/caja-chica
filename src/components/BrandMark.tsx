interface BrandMarkProps {
  className?: string;
  variant?: 'full' | 'badge' | 'login';
}

export function BrandMark({ className = '', variant = 'full' }: BrandMarkProps) {
  const base = 'block shrink-0 object-contain';
  const size = variant === 'badge'
    ? 'h-9 w-9'
    : variant === 'login'
      ? 'h-20 w-20 rounded-xl'
      : 'h-16 w-16 rounded-xl';
  const src = variant === 'badge'
    ? '/logo-caja-chica-header.svg'
    : variant === 'login'
      ? '/logo-caja-chica-login.png'
      : '/logo-caja-chica.png';

  return (
    <img
      src={src}
      alt="Caja Chica"
      className={`${base} ${size} ${className}`}
      loading="eager"
      decoding="async"
    />
  );
}
