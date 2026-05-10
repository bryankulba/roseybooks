#!/usr/bin/env python3
"""
verify_titles.py — Rosey's Resource Sale
Searches Google Books for each title/author and writes verified_titles.csv
with the canonical Google Books title. fetch_images.py will use this file.

    python3 verify_titles.py
"""

import csv
import os
import re
import time
import urllib.parse
import requests

SCRIPT_DIR    = os.path.dirname(os.path.abspath(__file__))
CSV_FILE      = os.path.join(SCRIPT_DIR, "Rosey's Resource Sale - Sheet1.csv")
VERIFIED_FILE = os.path.join(SCRIPT_DIR, "verified_titles.csv")


def clean_title(title):
    """Normalize title for searching: replace dash-as-colon, strip punctuation."""
    # Replace " - " or "- " used as subtitle separator with a space
    t = re.sub(r'\s*[-–]\s*', ' ', title)
    # Remove remaining punctuation except spaces
    t = re.sub(r'[^\w\s]', ' ', t)
    # Collapse whitespace
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def first_words(title, n=5):
    """Return first n words of a title (for broad search)."""
    return ' '.join(title.split()[:n])


def search_google_books(title, author=""):
    """
    Try multiple search strategies. Returns (verified_title, found_flag).
    Strategies (in order):
      1. Cleaned full title + author
      2. Cleaned full title only
      3. First 5 words of cleaned title + author
      4. First 4 words of cleaned title only
    """
    cleaned = clean_title(title)
    short   = first_words(cleaned, 5)
    shorter = first_words(cleaned, 4)

    first_author = ""
    if author and len(author.strip()) > 2:
        first_author = re.split(r'[;,]', author)[0].strip()[:40]

    strategies = []
    if first_author:
        strategies.append((cleaned, first_author))
    strategies.append((cleaned, ""))
    if first_author:
        strategies.append((short, first_author))
    strategies.append((shorter, ""))

    for t_query, a_query in strategies:
        query = f"intitle:{urllib.parse.quote(t_query[:80])}"
        if a_query:
            query += f"+inauthor:{urllib.parse.quote(a_query)}"
        url = (f"https://www.googleapis.com/books/v1/volumes"
               f"?q={query}&maxResults=3&printType=books")
        try:
            r = requests.get(url, timeout=12)
            if r.status_code == 429:
                raise SystemExit("ERROR: Google Books API quota exceeded (429). "
                                 "Quota resets daily. Re-run tomorrow or add an API key.")
            if r.status_code == 200:
                data = r.json()
                if data.get('totalItems', 0) > 0 and data.get('items'):
                    for item in data['items']:
                        info = item.get('volumeInfo', {})
                        found_title = info.get('title', '').strip()
                        subtitle    = info.get('subtitle', '').strip()
                        if found_title:
                            full = f"{found_title}: {subtitle}" if subtitle else found_title
                            return full, True
        except SystemExit:
            raise
        except Exception as e:
            print(f"    API error: {e}")

        time.sleep(0.25)

    return title, False  # no match — keep original


# ── Read CSV ──────────────────────────────────────────────────────────────────
with open(CSV_FILE, 'r', encoding='utf-8') as f:
    all_rows = list(csv.reader(f))

data_rows = all_rows[1:]
print(f"Loaded {len(data_rows)} entries from CSV")
print("Searching Google Books to verify titles...\n")

found_count   = 0
changed_count = 0
results       = []

for idx, row in enumerate(data_rows, 1):
    while len(row) < 10:
        row.append('')
    title  = row[0].strip()
    author = row[1].strip()

    if not title:
        results.append({'num': idx, 'original': title, 'verified': title,
                        'author': author, 'status': 'skipped'})
        print(f"[{idx:03d}] — skipping blank")
        continue

    verified, found = search_google_books(title, author)

    if found:
        found_count += 1
        status = 'found'
        if verified.lower() != title.lower():
            changed_count += 1
            status = 'changed'
            print(f"[{idx:03d}] CHANGED")
            print(f"       was: {title}")
            print(f"       now: {verified}")
        else:
            print(f"[{idx:03d}] OK    {title[:70]}")
    else:
        status = 'not found'
        print(f"[{idx:03d}] MISS  {title[:70]}")

    results.append({'num': idx, 'original': title, 'verified': verified,
                    'author': author, 'status': status})
    time.sleep(0.2)

# ── Write verified_titles.csv ─────────────────────────────────────────────────
with open(VERIFIED_FILE, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=['num', 'original', 'verified', 'author', 'status'])
    writer.writeheader()
    writer.writerows(results)

print(f"\n{'='*60}")
print(f"Results: {found_count}/{len(results)} found on Google Books")
print(f"         {changed_count} titles corrected")
print(f"Saved: {VERIFIED_FILE}")
print("\nNext: run python3 fetch_images.py")
