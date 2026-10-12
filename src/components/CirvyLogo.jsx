// src/components/CirvyLogo.jsx
// Official wordmark "Cirvy": Syne font with horizontal gradient (White -> Teal).

export default function CirvyLogo({
  variant = 'icon', // 'icon' | 'full' | 'wordmark'
  size,
  className = '',
}) {
  const isIcon = variant === 'icon'
  
  const style = size ? { fontSize: typeof size === 'number' ? `${size}px` : size } : undefined
  const baseCls = `font-display font-extrabold tracking-tight select-none inline-flex items-center ${className}`

  // Horizontal gradient: White (left) to Teal (right)
  const gradientCls = "bg-linear-to-r from-white to-[var(--accent)] bg-clip-text text-transparent"

  if (isIcon) {
    return (
      <span className={`${baseCls} text-[var(--accent)]`} style={style}>
        C
      </span>
    )
  }

  // Full wordmark "Cirvy" with horizontal gradient
  return (
    <span className={`${baseCls} ${gradientCls}`} style={style}>
      Cirvy
    </span>
  )
}
