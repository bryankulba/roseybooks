import { useNavigate } from 'react-router-dom'
import { ClickableTile, Tag } from '@carbon/react'
import CoverImage from './CoverImage'
import { getDisplayBook } from '../utils/bookDisplay'

export default function BookCard({ book }) {
  const navigate = useNavigate()
  const display  = getDisplayBook(book)

  return (
    <ClickableTile onClick={() => navigate(`/book/${book.id}`)}>
      <div className="book-cover">
        <CoverImage book={display} loading="lazy" />
      </div>
      <p className="book-card__title">{book.title}</p>
      <p className="book-card__author">{book.author || 'Unknown author'}</p>
      {book.subject && <Tag type="teal" size="sm">{book.subject}</Tag>}
      {book.price != null && <p className="book-card__price">${book.price}</p>}
    </ClickableTile>
  )
}
