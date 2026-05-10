import { useContext, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Tag, Grid, Column, InlineNotification } from '@carbon/react'
import { ArrowLeft, Launch, Link as LinkIcon, View, ViewOff, Purchase } from '@carbon/icons-react'
import { BooksContext } from '../App'
import CoverImage from './CoverImage'
import { getDisplayBook } from '../utils/bookDisplay'

const IS_DEV = import.meta.env.DEV

function adminKey(book) {
  return `${book.title.toLowerCase().trim()}|||${(book.author || '').toLowerCase().trim()}`
}

export default function BookDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const books = useContext(BooksContext)
  const [copied, setCopied] = useState(false)
  const [overrideStatus, setOverrideStatus] = useState(null) // null | 'hide' | 'show'
  const [adminMsg, setAdminMsg] = useState('')

  const book    = books.find(b => b.id === parseInt(id, 10))
  const display = book ? getDisplayBook(book) : null

  useEffect(() => {
    if (!IS_DEV || !book) return
    fetch('/api/admin/override')
      .then(r => r.json())
      .then(data => {
        const key = adminKey(book)
        const val = data[key]
        setOverrideStatus(val === 'hide' ? 'hide' : val === 'sold' ? 'sold' : 'show')
      })
      .catch(() => {})
  }, [book])

  if (!book) {
    return (
      <Grid>
        <Column lg={16} md={8} sm={4}>
          <p style={{ marginBottom: '1rem' }}>Book not found.</p>
          <Button kind="ghost" renderIcon={ArrowLeft} onClick={() => navigate('/')}>
            Back to list
          </Button>
        </Column>
      </Grid>
    )
  }

  const postOverride = async (payload) => {
    const r = await fetch('/api/admin/override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: adminKey(book), ...payload }),
    })
    return r.json()
  }

  const handleAdminToggle = async () => {
    const action = overrideStatus === 'hide' ? 'show' : 'hide'
    try {
      const data = await postOverride({ action })
      if (data.ok) {
        setOverrideStatus(action)
        setAdminMsg(
          action === 'hide'
            ? 'Delinked. Re-run the pipeline to apply.'
            : 'Override removed. Re-run the pipeline to restore.'
        )
        setTimeout(() => setAdminMsg(''), 5000)
      }
    } catch {
      setAdminMsg('Error writing override.')
      setTimeout(() => setAdminMsg(''), 4000)
    }
  }

  const handleSelectCandidate = async (volumeId) => {
    try {
      const data = await postOverride({ action: 'select', volumeId })
      if (data.ok) {
        setOverrideStatus('selected')
        setAdminMsg('Match saved. Re-run the pipeline to apply.')
        setTimeout(() => setAdminMsg(''), 5000)
      }
    } catch {
      setAdminMsg('Error writing override.')
      setTimeout(() => setAdminMsg(''), 4000)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
    } catch {
      const el = document.createElement('input')
      el.value = window.location.href
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="book-detail">
      <Grid>
        <Column lg={16} md={8} sm={4}>
          <Button kind="ghost" renderIcon={ArrowLeft} onClick={() => navigate('/')}>
            Back to list
          </Button>
        </Column>

        <Column lg={4} md={3} sm={4}>
          <div className="book-detail__cover">
            <CoverImage book={display} loading="eager" />
          </div>
        </Column>

        <Column lg={12} md={5} sm={4}>
          <h1 className="book-detail__title">{book.title}</h1>
          {book.author && <p className="book-detail__author">{book.author}</p>}

          <div className="book-detail__tags">
            <Tag type="teal">{book.type}</Tag>
            {book.subject && <Tag type="gray">{book.subject}</Tag>}
          </div>

          <dl className="book-detail__meta">
            {display.price != null && (
              <><dt>Price</dt><dd>${display.price}</dd></>
            )}
            {book.date && (
              <><dt>Published</dt><dd>{book.date}</dd></>
            )}
            {display.publisher && (
              <><dt>Publisher</dt><dd>{display.publisher}</dd></>
            )}
            {display.pageCount && (
              <><dt>Pages</dt><dd>{display.pageCount}</dd></>
            )}
            {book.mediaNote && (
              <><dt>Includes</dt><dd>{book.mediaNote}</dd></>
            )}
          </dl>

          <div className="book-detail__actions">
            {display.googleBooksUrl && (
              <Button
                kind="primary"
                renderIcon={Launch}
                href={display.googleBooksUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Google Books
              </Button>
            )}
            <Button kind="secondary" renderIcon={LinkIcon} onClick={handleCopyLink}>
              Copy link
            </Button>
          </div>

          {copied && (
            <InlineNotification
              kind="success"
              title="Link copied!"
              subtitle="Paste it into an email to Rosey. Grab all the links you want before sending."
              hideCloseButton
            />
          )}

          <p className="book-detail__hint">
            Interested? Copy the link above and paste it into an email to Rosey.
            If you want multiple items, collect all your links first and send <strong>one email</strong>.
            Items are first come, first served — Rosey will confirm availability when she replies.
          </p>
        </Column>

        {display.summary && (
          <Column lg={16} md={8} sm={4}>
            <p className="book-detail__summary-heading">About this book</p>
            <p className="book-detail__summary">{display.summary}</p>
          </Column>
        )}

        {IS_DEV && overrideStatus !== null && (
          <Column lg={16} md={8} sm={4}>
            <div className="admin-panel">
              <p className="admin-panel__label">⚙ Admin (dev only)</p>

              {/* Confidence badge */}
              {book.matchConfidence && book.matchConfidence !== 'none' && (
                <p className={`admin-panel__confidence admin-panel__confidence--${book.matchConfidence}`}>
                  Match confidence: <strong>{book.matchConfidence}</strong>
                  {book.matchConfidence === 'low' && ' — review candidates below'}
                </p>
              )}

              {/* Candidate picker — only shown when confidence is low and alternatives exist */}
              {book.matchConfidence === 'low' && book.candidates?.length > 0 && (
                <div className="admin-panel__candidates">
                  <p className="admin-panel__candidates-label">Google Books candidates (best match first):</p>
                  <div className="admin-panel__candidates-list">
                    {book.candidates.map((c, i) => (
                      <div key={c.volumeId} className="admin-candidate">
                        {c.coverUrl && (
                          <img
                            src={c.coverUrl}
                            alt={c.title}
                            className="admin-candidate__cover"
                          />
                        )}
                        <div className="admin-candidate__info">
                          <p className="admin-candidate__title">{c.title}</p>
                          {c.authors?.length > 0 && (
                            <p className="admin-candidate__author">{c.authors.join(', ')}</p>
                          )}
                          <div className="admin-candidate__actions">
                            {i === 0 && <span className="admin-candidate__current">currently matched</span>}
                            <Button
                              kind="ghost"
                              size="sm"
                              renderIcon={Launch}
                              href={c.googleBooksUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View
                            </Button>
                            {i !== 0 && (
                              <Button
                                kind="tertiary"
                                size="sm"
                                onClick={() => handleSelectCandidate(c.volumeId)}
                              >
                                Use this match
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Delink / restore toggle */}
              {overrideStatus !== 'sold' && (
                <Button
                  kind={overrideStatus === 'hide' ? 'tertiary' : 'danger--ghost'}
                  size="sm"
                  renderIcon={overrideStatus === 'hide' ? View : ViewOff}
                  onClick={handleAdminToggle}
                >
                  {overrideStatus === 'hide'
                    ? 'Restore Google Books data'
                    : 'Remove all Google Books data'}
                </Button>
              )}

              {/* Mark as sold */}
              {overrideStatus === 'sold' ? (
                <Button
                  kind="tertiary"
                  size="sm"
                  onClick={async () => {
                    const data = await postOverride({ action: 'show' })
                    if (data.ok) {
                      setOverrideStatus('show')
                      setAdminMsg('Marked as available again. Re-run the pipeline to apply.')
                      setTimeout(() => setAdminMsg(''), 5000)
                    }
                  }}
                >
                  Unmark as sold
                </Button>
              ) : (
                <Button
                  kind="danger"
                  size="sm"
                  renderIcon={Purchase}
                  onClick={async () => {
                    const data = await postOverride({ action: 'sold' })
                    if (data.ok) {
                      setOverrideStatus('sold')
                      setAdminMsg('Marked as sold. Re-run the pipeline to remove from the site.')
                      setTimeout(() => setAdminMsg(''), 5000)
                    }
                  }}
                >
                  Mark as sold
                </Button>
              )}

              {adminMsg && <p className="admin-panel__msg">{adminMsg}</p>}
            </div>
          </Column>
        )}
      </Grid>
    </div>
  )
}
