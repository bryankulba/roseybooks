import { useState, useEffect, createContext } from 'react'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { Theme, Header, HeaderName, Content, Loading } from '@carbon/react'
import BookList from './components/BookList'
import BookDetail from './components/BookDetail'

export const BooksContext = createContext([])

const router = createHashRouter([
  { path: '/', element: <BookList /> },
  { path: '/book/:id', element: <BookDetail /> },
])

export default function App() {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}books.json`)
      .then(r => r.json())
      .then(data => { setBooks(data); setLoading(false) })
      .catch(err => { console.error('Failed to load books.json', err); setLoading(false) })
  }, [])

  return (
    <Theme theme="g100">
      <Header aria-label="Rosey's Resource Sale">
        <HeaderName prefix="">Rosey's Resource Sale</HeaderName>
      </Header>
      <Content>
        {loading
          ? <Loading description="Loading books…" withOverlay={false} />
          : (
            <BooksContext.Provider value={books}>
              <RouterProvider router={router} />
            </BooksContext.Provider>
          )
        }
      </Content>
    </Theme>
  )
}
