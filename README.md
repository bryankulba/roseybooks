# Rosey's Resource Sale

A browsable catalog of music education resources — books, CDs, picture books, and Christmas materials — available for sale. Built with React and IBM Carbon Design System (dark mode), hosted on GitHub Pages.

---

## Project Structure

```
Roseybooks/
  src/                        # Source CSV files (one per item type)
  scripts/
    build_json.py             # Data pipeline: CSV → Google Books → books.json
    cache.json                # Google Books API cache (gitignored)
    requirements.txt          # Python dependencies
  website/
    public/
      books.json              # Generated catalog — commit this after each pipeline run
    src/
      App.jsx
      components/
        BookList.jsx          # List view: search + type filter + subject tags
        BookCard.jsx          # Individual card in the grid
        BookDetail.jsx        # Full detail view with copy-link
      styles/
        index.scss
    index.html
    package.json
    vite.config.js
  .gitignore
  README.md
```

---

## CSV Source Files

Each file in `src/` maps to an item type. Column conventions:

| Column | Sheet1 | CD's | Christmas | Picture Books |
|---|---|---|---|---|
| Title | `Title` | `Title` | `Title` | `Title` |
| Author | `Author` | `Artist` | `Author` | `Author` |
| Subject | `Subject` | — | `Subject` | `Description` |
| Price | `Price for Sale` | fixed $1 | fixed $3 | fixed $2 |
| Date | `Date of Publication` | `Date of Publication` | `Date of Publication` | `Date of Publication` |
| Media note | `CD/ DVD/ Online Access Code` | same | same | same |
| Exclude row | `Sold=TRUE` or `Keep=TRUE` | — | — | — |
| Publisher | — | — | — | `Publisher` |

Columns `Purchased by`, `School`, `Total`, `Verified` are ignored.

---

## Updating the Catalog

Whenever a CSV is updated (new items added, items marked sold/kept):

```bash
# From the project root
.venv/bin/python scripts/build_json.py
```

The pipeline:
1. Reads all four CSVs, filters out sold/kept rows and blank titles
2. Queries Google Books for cover image URL, publisher, page count, and summary
3. Caches all Google Books responses in `scripts/cache.json` — re-runs are fast
4. Writes `website/public/books.json`

Commit `books.json` and deploy.

---

## First-Time Setup

**Python pipeline**
```bash
cd Roseybooks
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
```

**Website**
```bash
cd website
npm install
```

---

## Development

```bash
cd website
npm run dev
# Open http://localhost:5174/roseybooks/
```

---

## Deploying to GitHub Pages

```bash
cd website
npm run deploy
```

This builds the site and pushes the `dist/` folder to the `gh-pages` branch of the repo. The site is then live at:

```
https://bryankulba.github.io/roseybooks/
```

Make sure the remote is set before deploying:
```bash
git remote add origin https://github.com/bryankulba/roseybooks.git
```

---

## Adding a New CSV / Item Type

1. Add the CSV to `src/`
2. Add an entry to the `SOURCES` list in `scripts/build_json.py` with the appropriate column mappings and `price_default`
3. Re-run the pipeline
4. The new type will automatically appear in the type filter on the website

---

## Google Books API

The pipeline uses a free Google Books API key stored directly in `build_json.py`. The key can be overridden via environment variable:

```bash
BOOKS_API_KEY=your_key .venv/bin/python scripts/build_json.py
```

Results are cached in `scripts/cache.json`. If the quota is exceeded mid-run, the script writes whatever it has and stops cleanly — re-run the next day to continue.
