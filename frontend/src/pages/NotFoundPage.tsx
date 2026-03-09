import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <p className="text-6xl font-bold mb-2" style={{ color: 'var(--accent)' }}>404</p>
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Page not found</h1>
      <p className="mb-8" style={{ color: 'var(--text-secondary)' }}>
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        className="px-6 py-3 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 active:scale-95"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        Go home
      </Link>
    </div>
  )
}
