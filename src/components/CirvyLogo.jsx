// src/components/CirvyLogo.jsx
// Plain text wordmark "Cirvy" styled with a gradient fading toward teal accent

export default function CirvyLogo({
  variant = 'icon', // 'icon' | 'full'
  size,
  className = '',
}) {
  const isFull = variant === 'full'

  return (
    <span
      className={`font-display font-extrabold tracking-tight select-none bg-gradient-to-r from-[#10181C] via-[#2E3B42] to-[var(--accent)] dark:from-white dark:via-[#E4EFF2] dark:to-[var(--accent)] bg-clip-text text-transparent transition-colors inline-flex items-center ${
        isFull ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'
      } ${className}`}
      style={size ? { fontSize: typeof size === 'number' ? `${size}px` : size } : undefined}
    >
      Cirvy
    </span>
  )
}
