import { useContext, useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Grid, Column, Button, Tag } from '@carbon/react'
import { ArrowLeft, Launch, Checkmark, ViewOff, CheckmarkFilled } from '@carbon/icons-react'
import { BooksContext } from '../App'

function adminKey(book) {
  return `${book.title.toLowerCase().trim()}|||${(book.author || '').toLowerCase().trim()}`
}

function CandidateThumb({ candidate, isCurrent, onSelect }) {
  return (
    <div className={`admin-candidate-card ${isCurrent ? 'admin-candidate-card--current' : ''}`}>
      <div className="admin-candidate-card__cover">
        {candidate.coverUrl
          ? <img src={candidate.coverUrl} alt={candidate.title} />
          : <span>📚</span>
        }
      </div>
      <p className="admin-candidate-card__title">{candidate.title}</p>
      {candidate.authors?.length > 0 && (
        <p className="admin-candidate-card__author">{candidate.authors[0]}</p>
      )}
      <div className="admin-candidate-card__actions">
        {isCurrent
          ? <span className="admin-candidate-card__label">current</span>
          : (
            <Button kind="tertiary" size="sm" onClick={() => onSelect(candidate.volumeId)}>
              Use this
            </Button>
          )
        }
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Launch}
          iconDescription="View on Google Books"
          hasIconOnly
          href={candidate.googleBooksUrl}
          target="_blank"
          rel="noopener noreferrer"
        />
      </div>
    </div>
  )
}

export default function AdminPage() {
  const books    = useContext(BooksContext)
  const navigate = useNavigate()

  const [overrides,  setOverrides]  = useState({})
  const [actioned,   setActioned]   = useState(new Set()) // keys actioned this session
  const [view,       setView]       = useState('pending') // 'pending' | 'reviewed' | 'all'
  const [saving,     setSaving]     = useState(null) // key currently being saved

  useEffect(() => {
    fetch('/api/admin/override')
      .then(r => r.json())
      .then(setOverrides)
      .catch(() => {})
  }, [])

  const lowConfBooks = useMemo(
    () => books.filter(b => b.matchConfidence === 'low'),
    [books]
  )

  const pendingBooks   = lowConfBooks.filter(b => {
    const ov = overrides[adminKey(b)]
    return ov !== 'confirm' && ov !== 'hide' && !actioned.has(adminKey(b))
  })

  const reviewedBooks = books.filter(b => adminKey(b) in overrides)

  const displayBooks = view === 'pending'  ? pendingBooks
                     : view === 'reviewed' ? reviewedBooks
                     : books

  const postOverride = async (book, payload) => {
    const key = adminKey(book)
    setSaving(key)
    try {
      const r = await fetch('/api/admin/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, ...payload }),
      })
      const data = await r.json()
      if (data.ok) {
        setOverrides(data.overrides)
        setActioned(prev => new Set(prev).add(key))
      }
    } catch (e) {
      console.error('Override error:', e)
    } finally {
      setSaving(null)
    }
  }

  const handleSelect  = (book, volumeId) => postOverride(book, { action: 'select', volumeId })
  const handleConfirm = (book) => postOverride(book, { action: 'confirm' })
  const handleDelink  = (book) => postOverride(book, { action: 'hide' })
  const handleRestore = (book) => postOverride(book, { action: 'show' })

  const pending   = lowConfBooks.filter(b => !actioned.has(adminKey(b))).length
  const reviewed  = lowConfBooks.length - pending

  return (
    <div className="admin-page">
      <Grid>
        <Column lg={16} md={8} sm={4}>
          <div className="admin-page__header">
            <Button kind="ghost" renderIcon={ArrowLeft} onClick={() => navigate('/')}>
              Back to list
            </Button>
            <div className="admin-page__title-row">
              <h1 className="admin-page__title">Match Review</h1>
              <span className="admin-page__subtitle">dev only</span>
            </div>

            <div className="admin-page__stats">
              <span className="admin-page__stat">
                <strong>{lowConfBooks.length}</strong> low-confidence matches
              </span>
              <span className="admin-page__stat admin-page__stat--done">
                <strong>{lowConfBooks.length - pendingBooks.length}</strong> resolved
              </span>
              <span className="admin-page__stat">
                <strong>{pendingBooks.length}</strong> remaining
              </span>
            </div>

            <div className="admin-page__filter">
              <Button kind={view === 'pending'  ? 'tertiary' : 'ghost'} size="sm" onClick={() => setView('pending')}>
                Needs review ({pendingBooks.length})
              </Button>
              <Button kind={view === 'reviewed' ? 'tertiary' : 'ghost'} size="sm" onClick={() => setView('reviewed')}>
                Reviewed ({reviewedBooks.length})
              </Button>
              <Button kind={view === 'all'      ? 'tertiary' : 'ghost'} size="sm" onClick={() => setView('all')}>
                All ({books.length})
              </Button>
            </div>

            {lowConfBooks.length === 0 && (
              <p className="admin-page__empty">
                No low-confidence matches found. Run the pipeline to generate match data.
              </p>
            )}
          </div>
        </Column>

        {displayBooks.map(book => {
          const key         = adminKey(book)
          const ov          = overrides[key]
          const isHidden    = ov === 'hide'
          const isConfirmed = ov === 'confirm'
          const isSelected  = typeof ov === 'object' && ov?.volumeId
          const isDone      = actioned.has(key)
          const isSaving    = saving === key

          return (
            <Column key={book.id} lg={16} md={8} sm={4}>
              <div className={`admin-book ${isDone ? 'admin-book--done' : ''}`}>

                {/* Left: CSV info */}
                <div className="admin-book__meta">
                  <div className="admin-book__tags">
                    <Tag type="teal"   size="sm">{book.type}</Tag>
                    {book.matchConfidence === 'low' && !isConfirmed && !isSelected && (
                      <Tag type="yellow" size="sm">low confidence</Tag>
                    )}
                    {isConfirmed && <Tag type="green" size="sm">confirmed</Tag>}
                    {isSelected  && <Tag type="green" size="sm">match selected</Tag>}
                    {isHidden    && <Tag type="red"   size="sm">delinked</Tag>}
                  </div>
                  <p className="admin-book__title">{book.title}</p>
                  {book.author && (
                    <p className="admin-book__author">{book.author}</p>
                  )}
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => navigate(`/book/${book.id}`)}
                  >
                    Detail page →
                  </Button>
                </div>

                {/* Right: candidates */}
                <div className="admin-book__candidates">
                  {book.candidates?.length > 0 ? (
                    book.candidates.map((c, i) => (
                      <CandidateThumb
                        key={c.volumeId}
                        candidate={c}
                        isCurrent={i === 0 && !isSelected}
                        onSelect={(vid) => handleSelect(book, vid)}
                      />
                    ))
                  ) : (
                    <p className="admin-book__no-candidates">
                      No candidates stored — re-run pipeline after clearing this item's cache entry.
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="admin-book__actions">
                  {(isHidden || isConfirmed || isSelected) && (
                    <Button
                      kind="ghost"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => handleRestore(book)}
                    >
                      Undo
                    </Button>
                  )}
                  {!isHidden && (
                    <>
                      {!isConfirmed && (
                        <Button
                          kind="primary"
                          size="sm"
                          renderIcon={CheckmarkFilled}
                          disabled={isSaving}
                          onClick={() => handleConfirm(book)}
                        >
                          Confirm
                        </Button>
                      )}
                      <Button
                        kind="danger--ghost"
                        size="sm"
                        renderIcon={ViewOff}
                        disabled={isSaving}
                        onClick={() => handleDelink(book)}
                      >
                        Delink
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Column>
          )
        })}
      </Grid>
    </div>
  )
}
