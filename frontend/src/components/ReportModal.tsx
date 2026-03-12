import { useState } from 'react'
import type { ReportPayload } from '../types'

const REPORT_REASONS: { value: ReportPayload['reason']; label: string; description: string }[] = [
  { value: 'spam', label: 'Spam', description: 'Misleading or repetitive content' },
  { value: 'harassment', label: 'Harassment', description: 'Bullying or targeted abuse' },
  { value: 'hate_speech', label: 'Hate Speech', description: 'Promotes hatred against a group' },
  { value: 'violence', label: 'Violence', description: 'Threats or graphic violence' },
  { value: 'nudity', label: 'Nudity', description: 'Sexually explicit content' },
  { value: 'misinformation', label: 'Misinformation', description: 'False or misleading information' },
  { value: 'impersonation', label: 'Impersonation', description: 'Pretending to be someone else' },
  { value: 'other', label: 'Other', description: 'Something else not listed' },
]

interface ReportModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (payload: ReportPayload) => void
  submitting: boolean
  contentType: 'user' | 'post' | 'comment'
  targetId: { username?: string; post_id?: number; comment_id?: number }
}

export default function ReportModal({ isOpen, onClose, onSubmit, submitting, contentType, targetId }: ReportModalProps) {
  const [reason, setReason] = useState<ReportPayload['reason'] | null>(null)
  const [description, setDescription] = useState('')

  if (!isOpen) return null

  const handleSubmit = () => {
    if (!reason) return
    onSubmit({
      content_type: contentType,
      reason,
      description: description.trim() || undefined,
      ...targetId,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden animate-slideInFromBottom"
        style={{ backgroundColor: 'var(--bg-primary)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Report {contentType}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            Why are you reporting this {contentType}?
          </p>

          <div className="space-y-2 mb-4">
            {REPORT_REASONS.map(r => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className="w-full text-left p-3 rounded-xl border transition-all"
                style={{
                  borderColor: reason === r.value ? 'var(--accent)' : 'var(--border-light)',
                  backgroundColor: reason === r.value ? 'var(--accent-alpha)' : 'transparent',
                }}
              >
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{r.label}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{r.description}</div>
              </button>
            ))}
          </div>

          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Additional details (optional)"
            rows={3}
            className="w-full p-3 rounded-xl text-sm resize-none outline-none border transition-colors focus:ring-2"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-light)',
              '--tw-ring-color': 'var(--accent)',
            } as React.CSSProperties}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t" style={{ borderColor: 'var(--border-light)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-full transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason || submitting}
            className="px-5 py-2 text-sm font-semibold rounded-full text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: 'var(--danger)' }}
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  )
}
