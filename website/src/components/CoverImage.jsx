import { useState } from 'react'

/**
 * Renders a book/CD cover image with automatic fallback to an emoji placeholder
 * if the image fails to load or resolves to Google's "image not available" stub
 * (detected by checking if the loaded image is suspiciously narrow).
 */
export default function CoverImage({ book, loading = 'lazy' }) {
  const [error, setError] = useState(false)
  const placeholder = book.type === 'CD' ? '💿' : '📚'

  const handleLoad = e => {
    // Google's "image not available" placeholder is typically < 50px wide
    if (e.target.naturalWidth < 50) setError(true)
  }

  if (!book.coverUrl || error) {
    return <div className="book-cover--placeholder">{placeholder}</div>
  }

  return (
    <img
      src={book.coverUrl}
      alt={`Cover of ${book.title}`}
      loading={loading}
      onError={() => setError(true)}
      onLoad={handleLoad}
    />
  )
}
