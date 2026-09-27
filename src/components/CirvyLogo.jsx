// src/components/CirvyLogo.jsx
// Plain text wordmark "Cirvy" (Syne, bold/extrabold, letter-spaced)

export default function CirvyLogo({
  variant = 'icon', // 'icon' | 'full'
  size,
  className = '',
}) {
  const isFull = variant === 'full'

  return (
    <span
      className={`font-display font-extrabold tracking-tight select-none text-[var(--text-main)] transition-colors inline-flex items-center ${
        isFull ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'
      } ${className}`}
      style={size ? { fontSize: typeof size === 'number' ? `${size}px` : size } : undefined}
    >
      Cirvy
    </span>
  )
}
