/**
 * Returns a version of the book with Google Books-sourced fields cleared
 * if the match confidence is low. This keeps low-confidence data out of
 * the public UI while leaving the raw book object intact for admin review.
 */
export function getDisplayBook(book) {
  if (book.matchConfidence === 'low') {
    return {
      ...book,
      coverUrl:       '',
      googleBooksUrl: '',
      publisher:      '',
      pageCount:      null,
      summary:        '',
    }
  }
  return book
}
