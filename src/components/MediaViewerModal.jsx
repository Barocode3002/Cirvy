import { useState, useEffect, useCallback } from 'react'
import { X, ArrowLeft, Play, ChevronLeft, ChevronRight } from 'lucide-react'

export default function MediaViewerModal({
  isOpen,
  onClose,
  items = [],
  initialIndex = null,
}) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)

  useEffect(() => {
    setSelectedIndex(initialIndex)
  }, [initialIndex, isOpen])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        if (selectedIndex !== null) {
          setSelectedIndex(null)
        } else {
          onClose()
        }
      } else if (selectedIndex !== null) {
        if (e.key === 'ArrowLeft') {
          setSelectedIndex((idx) => (idx > 0 ? idx - 1 : items.length - 1))
        } else if (e.key === 'ArrowRight') {
          setSelectedIndex((idx) => (idx < items.length - 1 ? idx + 1 : 0))
        }
      }
    },
    [selectedIndex, items.length, onClose]
  )

  useEffect(() => {
    if (!isOpen) return
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])

  if (!isOpen || !items.length) return null

  // Expanded single-item view
  if (selectedIndex !== null && items[selectedIndex]) {
    const current = items[selectedIndex]
    const isVideo = current.type === 'video' || current.url?.match(/\.(mp4|webm|mov)(\?.*)?$/i)

    return (
      <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col animate-in fade-in-0 duration-150">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => setSelectedIndex(null)}
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors cursor-pointer py-1 px-2.5 rounded-full hover:bg-white/10"
            title="Back to grid (Esc)"
          >
            <ArrowLeft size={18} />
            <span className="text-xs font-display font-medium">Grid</span>
          </button>

          <span className="text-xs font-display text-white/70">
            {selectedIndex + 1} of {items.length}
          </span>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Media area */}
        <div className="flex-1 relative flex items-center justify-center p-4 min-h-0 overflow-hidden">
          {items.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setSelectedIndex((idx) => (idx > 0 ? idx - 1 : items.length - 1))}
                className="absolute left-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur-sm"
                aria-label="Previous media"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={() => setSelectedIndex((idx) => (idx < items.length - 1 ? idx + 1 : 0))}
                className="absolute right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur-sm"
                aria-label="Next media"
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}

          {isVideo ? (
            <video
              src={current.url}
              controls
              autoPlay
              className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            />
          ) : (
            <img
              src={current.url}
              alt="Media"
              className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            />
          )}
        </div>
      </div>
    )
  }

  // 2-column grid view (up to 5 rows, max 10 items)
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col p-4 sm:p-6 overflow-y-auto animate-in fade-in-0 duration-150">
      <div className="max-w-xl w-full mx-auto flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4 shrink-0">
          <div>
            <h3 className="font-display font-bold text-base text-white">Media Gallery</h3>
            <p className="text-xs text-white/60">{items.length} {items.length === 1 ? 'item' : 'items'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* 2-column grid (up to 5 rows = 10 items) */}
        <div className="grid grid-cols-2 gap-3.5 pb-6">
          {items.slice(0, 10).map((item, index) => {
            const isVideo = item.type === 'video' || item.url?.match(/\.(mp4|webm|mov)(\?.*)?$/i)
            return (
              <button
                key={item.url || index}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className="group relative rounded-2xl overflow-hidden aspect-square bg-white/5 border border-white/10 hover:border-[var(--accent)] transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                {isVideo ? (
                  <>
                    <video
                      src={item.url}
                      preload="metadata"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm group-hover:scale-110 transition-transform">
                        <Play size={18} className="ml-0.5 fill-current" />
                      </div>
                    </div>
                  </>
                ) : (
                  <img
                    src={item.url}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
