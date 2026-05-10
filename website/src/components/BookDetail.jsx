import { useContext, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Tag, Grid, Column, InlineNotification } from '@carbon/react'
import { ArrowLeft, Launch, Link as LinkIcon } from '@carbon/icons-react'
import { BooksContext } from '../App'
import CoverImage from './CoverImage'

export default function BookDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const books = useContext(BooksContext)
  const [copied, setCopied] = useState(false)

  const book = books.find(b => b.id === parseInt(id, 10))

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
            <CoverImage book={book} loading="eager" />
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
            {book.price != null && (
              <><dt>Price</dt><dd>${book.price}</dd></>
            )}
            {book.date && (
              <><dt>Published</dt><dd>{book.date}</dd></>
            )}
            {book.publisher && (
              <><dt>Publisher</dt><dd>{book.publisher}</dd></>
            )}
            {book.pageCount && (
              <><dt>Pages</dt><dd>{book.pageCount}</dd></>
            )}
            {book.mediaNote && (
              <><dt>Includes</dt><dd>{book.mediaNote}</dd></>
            )}
          </dl>

          <div className="book-detail__actions">
            {book.googleBooksUrl && (
              <Button
                kind="primary"
                renderIcon={Launch}
                href={book.googleBooksUrl}
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
              subtitle="Paste it into an email to share this item."
              hideCloseButton
            />
          )}
        </Column>

        {book.summary && (
          <Column lg={16} md={8} sm={4}>
            <p className="book-detail__summary-heading">About this book</p>
            <p className="book-detail__summary">{book.summary}</p>
          </Column>
        )}
      </Grid>
    </div>
  )
}
