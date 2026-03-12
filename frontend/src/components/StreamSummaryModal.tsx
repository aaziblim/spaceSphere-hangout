interface StreamSummaryModalProps {
  isOpen: boolean
  stats: {
    duration: number
    peakViewers: number
    totalLikes: number
    totalMessages: number
  }
  hasRecording: boolean
  onSaveAsPost: () => void
  onDiscard: () => void
  isSaving: boolean
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function StreamSummaryModal({
  isOpen,
  stats,
  hasRecording,
  onSaveAsPost,
  onDiscard,
  isSaving,
}: StreamSummaryModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal Card */}
      <div className="relative w-full max-w-md bg-[var(--bg-secondary)] rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
        <div className="p-6">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 bg-green-500/10 text-green-500">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-7 h-7">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white">Stream Ended</h3>
            <p className="text-white/50 text-sm mt-1">Here's how your stream performed</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{formatDuration(stats.duration)}</div>
              <div className="text-xs text-white/50 mt-1">Duration</div>
            </div>
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{stats.peakViewers}</div>
              <div className="text-xs text-white/50 mt-1">Peak Viewers</div>
            </div>
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{stats.totalLikes}</div>
              <div className="text-xs text-white/50 mt-1">Likes</div>
            </div>
            <div className="bg-white/5 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{stats.totalMessages}</div>
              <div className="text-xs text-white/50 mt-1">Messages</div>
            </div>
          </div>

          {/* Action Buttons */}
          {hasRecording ? (
            <div className="space-y-3">
              <p className="text-center text-sm text-white/60 mb-2">
                Save the recording as a post for others to watch?
              </p>
              <button
                onClick={onSaveAsPost}
                disabled={isSaving}
                className="w-full py-3.5 rounded-xl font-bold text-white bg-[var(--action-blue)] hover:bg-[var(--action-blue-hover)] transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
              >
                {isSaving ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Saving...</span>
                  </div>
                ) : (
                  'Save as Post'
                )}
              </button>
              <button
                onClick={onDiscard}
                disabled={isSaving}
                className="w-full py-3.5 rounded-xl font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-50"
              >
                Discard Recording
              </button>
            </div>
          ) : (
            <button
              onClick={onDiscard}
              className="w-full py-3.5 rounded-xl font-bold text-white bg-[var(--action-blue)] hover:bg-[var(--action-blue-hover)] transition-all active:scale-95"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
