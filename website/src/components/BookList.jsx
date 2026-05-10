import { useContext, useState, useMemo } from 'react'
import { Search, Tag, Grid, Column } from '@carbon/react'
import { BooksContext } from '../App'
import BookCard from './BookCard'

export default function BookList() {
  const books = useContext(BooksContext)
  const [query, setQuery] = useState('')
  const [activeType, setActiveType] = useState('All')
  const [activeSubjects, setActiveSubjects] = useState(new Set())

  // All types with total counts (unaffected by search or subject filter)
  const TYPE_ORDER = ['All', 'Resource Book', 'Christmas Resource', 'CD', 'Picture Book']
  const types = useMemo(() => {
    const counts = {}
    books.forEach(b => { counts[b.type] = (counts[b.type] || 0) + 1 })
    return TYPE_ORDER
      .filter(t => t === 'All' || counts[t] > 0)
      .map(t => ({ name: t, count: t === 'All' ? books.length : counts[t] }))
  }, [books])

  // Subjects available within the active type, with counts
  const subjects = useMemo(() => {
    const pool = activeType === 'All' ? books : books.filter(b => b.type === activeType)
    const counts = {}
    pool.forEach(b => { if (b.subject) counts[b.subject] = (counts[b.subject] || 0) + 1 })
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  }, [books, activeType])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return books.filter(b => {
      const matchesType    = activeType === 'All' || b.type === activeType
      const matchesSubject = activeSubjects.size === 0 || activeSubjects.has(b.subject)
      const matchesSearch  = !q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
      return matchesType && matchesSubject && matchesSearch
    })
  }, [books, query, activeType, activeSubjects])

  const toggleSubject = subject => {
    setActiveSubjects(prev => {
      const next = new Set(prev)
      next.has(subject) ? next.delete(subject) : next.add(subject)
      return next
    })
  }

  const handleTypeChange = ({ name }) => {
    setActiveType(name)
    setActiveSubjects(new Set())
  }

  return (
    <Grid>
      <Column lg={16} md={8} sm={4}>
        <Search
          size="lg"
          placeholder="Search by title or author…"
          labelText="Search books"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onClear={() => setQuery('')}
        />
      </Column>

      <Column lg={16} md={8} sm={4}>
        <div className="type-filters">
          {types.map(t => (
            <Tag
              key={t.name}
              type={activeType === t.name ? 'teal' : 'gray'}
              onClick={() => handleTypeChange({ name: t.name })}
            >
              {t.name} ({t.count})
            </Tag>
          ))}
        </div>
      </Column>

      {subjects.length > 0 && (
        <Column lg={16} md={8} sm={4}>
          <div className="subject-filters">
            {subjects.map(([subject, count]) => (
              <Tag
                key={subject}
                type={activeSubjects.has(subject) ? 'blue' : 'gray'}
                onClick={() => toggleSubject(subject)}
              >
                {subject} ({count})
              </Tag>
            ))}
          </div>
        </Column>
      )}

      <Column lg={16} md={8} sm={4}>
        <p className="browse-hint">
          See something you like? Open each item and copy its link, then paste all your links into <strong>one email</strong> to Rosey.
          Items are <strong>first come, first served</strong> — Rosey will confirm availability when she replies.
        </p>
        <p className="book-count">{filtered.length} items</p>
        <div className="book-grid">
          {filtered.map(book => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      </Column>
    </Grid>
  )
}
