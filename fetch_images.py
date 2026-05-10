#!/usr/bin/env python3
"""
fetch_images.py — Rosey's Resource Sale
Searches Google Books API for cover images and downloads them to the images/ folder.
Also updates the Excel file with publisher, page count, and summary data.

Run from the terminal:
    cd "/path/to/Roseys Sale"
    pip install requests openpyxl
    python fetch_images.py
"""

import csv
import os
import re
import time
import urllib.parse
import requests
from openpyxl import load_workbook

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
CSV_FILE      = os.path.join(SCRIPT_DIR, "Rosey's Resource Sale - Sheet1.csv")
VERIFIED_FILE = os.path.join(SCRIPT_DIR, "verified_titles.csv")
XLSX_FILE   = os.path.join(SCRIPT_DIR, "Rosey's Resource Sale.xlsx")
IMAGES_DIR  = os.path.join(SCRIPT_DIR, "images")

os.makedirs(IMAGES_DIR, exist_ok=True)


def sanitize_filename(title, idx):
    name = title.lower()
    name = re.sub(r'[^a-z0-9\s]', '', name)
    name = re.sub(r'\s+', '_', name.strip())[:50]
    return f"{idx:03d}_{name}.jpg"


def search_google_books(title, author=""):
    """Search Google Books API. Returns volumeInfo dict or None."""
    title_clean = re.sub(r'["\'\-–]', ' ', title)[:80].strip()
    query = f"intitle:{urllib.parse.quote(title_clean)}"
    if author and len(author.strip()) > 2:
        first = re.split(r'[;,]', author)[0].strip()[:40]
        if first:
            query += f"+inauthor:{urllib.parse.quote(first)}"
    url = (f"https://www.googleapis.com/books/v1/volumes"
           f"?q={query}&maxResults=3&printType=books")
    try:
        r = requests.get(url, timeout=12)
        if r.status_code == 200:
            data = r.json()
            if data.get('totalItems', 0) > 0 and data.get('items'):
                # Prefer result that has an image
                for item in data['items']:
                    info = item.get('volumeInfo', {})
                    if info.get('imageLinks'):
                        return info
                return data['items'][0].get('volumeInfo', {})
    except Exception as e:
        print(f"    API error: {e}")
    return None


def download_image(url, filepath):
    """Download image to filepath. Returns True on success."""
    url = url.replace('zoom=1', 'zoom=2').replace('&edge=curl', '').replace('http://', 'https://')
    try:
        r = requests.get(url, timeout=15, headers={'User-Agent': 'Mozilla/5.0'})
        if r.status_code == 200 and len(r.content) > 500:
            with open(filepath, 'wb') as f:
                f.write(r.content)
            return True
    except Exception as e:
        print(f"    Download error: {e}")
    return False


# ── Read CSV (or verified_titles.csv if available) ────────────────────────────
with open(CSV_FILE, 'r', encoding='utf-8') as f:
    all_rows = list(csv.reader(f))

book_rows = all_rows[1:]   # skip header row
SKIP = {'', '2nd copy', 'add details', '????', 'dance like a butterfly',
        'voice collectors', 'the rhythm of somalia', 'harambee'}

# Load verified titles if present (keyed by row number)
verified_map = {}
if os.path.exists(VERIFIED_FILE):
    with open(VERIFIED_FILE, 'r', encoding='utf-8') as f:
        for vrow in csv.DictReader(f):
            if vrow.get('verified'):
                verified_map[int(vrow['num'])] = vrow['verified']
    print(f"Loaded {len(verified_map)} verified titles from {VERIFIED_FILE}")

print(f"Loaded {len(book_rows)} entries from CSV")
print(f"Searching Google Books and downloading covers...\n")

# ── Fetch images + metadata ───────────────────────────────────────────────────
results = {}   # idx -> {img_fname, publisher, page_count, summary}

for idx, row in enumerate(book_rows, 1):
    while len(row) < 10:
        row.append('')
    title  = verified_map.get(idx, row[0].strip())  # use verified title if available
    author = row[1].strip()

    if not title or title.lower() in SKIP:
        print(f"[{idx:03d}] — skipping blank/placeholder")
        continue

    print(f"[{idx:03d}/{len(book_rows)}] {title[:65]}...")

    info = search_google_books(title, author)
    rec  = {'img_fname': '', 'publisher': '', 'page_count': '', 'summary': ''}

    if info:
        rec['publisher']  = info.get('publisher', '')
        pc = info.get('pageCount', '')
        rec['page_count'] = str(pc) if pc else ''
        desc = re.sub(r'<[^>]+>', '', info.get('description', ''))
        rec['summary']    = desc[:500] if desc else ''

        img_links = info.get('imageLinks', {})
        img_url   = img_links.get('thumbnail', img_links.get('smallThumbnail', ''))

        if img_url:
            fname    = sanitize_filename(title, idx)
            filepath = os.path.join(IMAGES_DIR, fname)
            if os.path.exists(filepath):
                rec['img_fname'] = fname
                print(f"    ✓ Already exists: {fname}")
            elif download_image(img_url, filepath):
                rec['img_fname'] = fname
                print(f"    ✓ Saved: {fname}")
            else:
                print(f"    ✗ Image download failed")
        else:
            print(f"    ~ Found book info but no cover image")
    else:
        print(f"    ✗ Not found on Google Books")

    results[idx] = rec
    time.sleep(0.4)   # stay well within API rate limits

# ── Summary ───────────────────────────────────────────────────────────────────
imgs_found = sum(1 for r in results.values() if r['img_fname'])
print(f"\n{'='*60}")
print(f"Done. {imgs_found}/{len(results)} images downloaded.")

# ── Patch the Excel file ──────────────────────────────────────────────────────
if not os.path.exists(XLSX_FILE):
    print(f"\nNote: {XLSX_FILE} not found — skipping Excel update.")
    print("Run build_sale_v2.py first to create the Excel file, then run this script.")
else:
    print(f"\nUpdating Excel file with new data...")
    wb = load_workbook(XLSX_FILE)
    ws = wb.active

    # Find which columns hold our target fields by reading header row
    col_map = {}
    for cell in ws[1]:
        if cell.value:
            col_map[cell.value] = cell.column

    IMG_FNAME_COL = col_map.get("Image Filename")
    IMG_LINK_COL  = col_map.get("Image Link")

    from openpyxl.styles import Font
    LK_FONT = Font(name="Arial", size=9, color="0563C1", underline="single")
    D_FONT  = Font(name="Arial", size=9)

    updated = 0
    for excel_row in range(2, ws.max_row + 1):
        num_cell = ws.cell(row=excel_row, column=1)
        idx = num_cell.value
        if not isinstance(idx, int) or idx not in results:
            continue
        rec = results[idx]

        # Image filename
        if IMG_FNAME_COL and rec['img_fname']:
            ws.cell(row=excel_row, column=IMG_FNAME_COL).value = rec['img_fname']

        # Image hyperlink
        if IMG_LINK_COL and rec['img_fname']:
            lc = ws.cell(row=excel_row, column=IMG_LINK_COL)
            lc.value     = "View"
            lc.hyperlink = f"images/{rec['img_fname']}"
            lc.font      = LK_FONT
            updated += 1

    wb.save(XLSX_FILE)
    print(f"✓ Excel updated — {updated} image links added.")
    print(f"✓ File: {XLSX_FILE}")

print("\nAll done!")
