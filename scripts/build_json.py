#!/usr/bin/env python3
"""
build_json.py — Rosey's Resource Sale
Reads all sale CSVs from src/, queries Google Books for metadata,
and writes website/public/books.json.

Usage:
    .venv/bin/python scripts/build_json.py

Re-run any time a CSV changes. Already-fetched books are cached in
scripts/cache.json so only new entries hit the network.
"""

import csv
import json
import os
import re
import time
import urllib.parse
from difflib import SequenceMatcher

import requests

# Load .env from repo root if present
_env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
if os.path.exists(_env_file):
    with open(_env_file) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())

SCRIPT_DIR      = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR        = os.path.dirname(SCRIPT_DIR)
SRC_DIR         = os.path.join(ROOT_DIR, "src")
CACHE_FILE      = os.path.join(SCRIPT_DIR, "cache.json")
OVERRIDES_FILE  = os.path.join(SCRIPT_DIR, "overrides.json")
OUT_FILE        = os.path.join(ROOT_DIR, "website", "public", "books.json")
BOOKS_API_KEY   = os.environ.get("BOOKS_API_KEY", "")

os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)

# ── Source definitions ────────────────────────────────────────────────────────
# col_* lists are tried in order; first non-empty value wins.
# price_default is used when the CSV has no price data.

SOURCES = [
    {
        "filename":      "For Sale- Rosey's Resource Sale - Sheet1.csv",
        "type":          "Resource Book",
        "price_default": None,        # price comes from CSV
        "col_title":     ["Title", "Mar"],
        "col_author":    ["Author"],
        "col_subject":   ["Subject", "Description"],
        "col_date":      ["Date of Publication"],
        "col_price":     ["Price for Sale"],
        "col_media":     ["CD/ DVD/ Online Access Code"],
        "col_sold":      ["Sold"],
        "col_keep":      ["Keep"],
    },
    {
        "filename":      "For Sale- Rosey's Resource Sale - CD's.csv",
        "type":          "CD",
        "price_default": 1.0,
        "col_title":     ["Title"],
        "col_author":    ["Artist"],
        "col_subject":   [],
        "col_date":      ["Date of Publication"],
        "col_price":     [],
        "col_media":     ["CD/ DVD/ Online Access Code"],
    },
    {
        "filename":      "For Sale- Rosey's Resource Sale - Christmas Resources.csv",
        "type":          "Christmas Resource",
        "price_default": 3.0,
        "col_title":     ["Title"],
        "col_author":    ["Author"],
        "col_subject":   ["Subject"],
        "col_date":      ["Date of Publication"],
        "col_price":     [],
        "col_media":     ["CD/ DVD/ Online Access Code"],
    },
    {
        "filename":      "For Sale- Rosey's Resource Sale - Picture Books.csv",
        "type":          "Picture Book",
        "price_default": 2.0,
        "col_title":     ["Title"],
        "col_author":    ["Author"],
        "col_subject":   ["Description"],
        "col_date":      ["Date of Publication"],
        "col_price":     [],
        "col_media":     ["CD/ DVD/ Online Access Code"],
        "col_publisher": ["Publisher"],  # user-supplied; used before Google Books
    },
]


# ── CSV helpers ───────────────────────────────────────────────────────────────

def read_csv(filepath):
    """Read CSV, deduplicating repeated headers to avoid DictReader collisions."""
    with open(filepath, encoding="utf-8") as f:
        raw_headers = next(csv.reader(f))

    seen = {}
    safe_headers = []
    for h in raw_headers:
        if h in seen:
            seen[h] += 1
            safe_headers.append(f"{h}_{seen[h]}")
        else:
            seen[h] = 0
            safe_headers.append(h)

    with open(filepath, encoding="utf-8") as f:
        reader = csv.DictReader(f, fieldnames=safe_headers)
        next(reader)  # skip header row
        return list(reader)


def get_field(row, candidates):
    """Return the first non-empty value from the listed column candidates."""
    for col in candidates:
        val = row.get(col, "").strip()
        if val:
            return val
    return ""


# ── Overrides ────────────────────────────────────────────────────────────────

def load_overrides():
    """Load overrides.json — a dict of 'title|||author' keys to 'hide'."""
    if os.path.exists(OVERRIDES_FILE):
        with open(OVERRIDES_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def override_key(title, author):
    return f"{title.lower().strip()}|||{(author or '').lower().strip()}"


# ── Cache helpers ─────────────────────────────────────────────────────────────

def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache):
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)


def cache_key(title, author):
    return f"{title.lower().strip()}|||{author.lower().strip()}"


# ── Google Books API ──────────────────────────────────────────────────────────

def clean_for_search(title):
    t = re.sub(r"\s*[-–]\s*", " ", title)
    t = re.sub(r"[^\w\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def normalize_title(t):
    """Lowercase, strip punctuation, remove leading articles."""
    t = t.lower()
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\b(the|a|an)\b", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def title_similarity(csv_title, api_title):
    """Character-level similarity between normalized titles (0.0–1.0)."""
    return SequenceMatcher(
        None,
        normalize_title(csv_title),
        normalize_title(api_title),
    ).ratio()


def assess_confidence(csv_title, csv_author, api_info):
    """
    Returns "high" or "low" based on how well the API result matches.

    Rules:
      - title_sim >= 0.75                          → high (strong title match)
      - title_sim >= 0.55 AND author present
        AND author_sim >= 0.45                     → high (good title + author)
      - anything else                              → low
    """
    if not api_info or not api_info.get("title"):
        return "none"

    t_sim = title_similarity(csv_title, api_info["title"])

    if t_sim >= 0.75:
        return "high"

    has_author = bool(csv_author and len(csv_author.strip()) > 2)
    if has_author and t_sim >= 0.55:
        first_csv = re.split(r"[;,]", csv_author)[0].strip().lower()
        api_authors = " ".join(api_info.get("authors", [])).lower()
        a_sim = SequenceMatcher(None, first_csv, api_authors).ratio()
        if a_sim >= 0.45:
            return "high"

    return "low"


def search_google_books(title, author=""):
    """Try multiple search strategies.
    Returns (best_volume_id, best_info, candidates) where candidates is a list of
    {volume_id, info} dicts sorted by title similarity (best first).
    Returns (None, None, []) if nothing found."""
    cleaned = clean_for_search(title)
    words   = cleaned.split()

    first_author = ""
    if author and len(author.strip()) > 2:
        first_author = re.split(r"[;,]", author)[0].strip()[:40]

    strategies = []
    if first_author:
        strategies.append((cleaned, first_author))
    strategies.append((cleaned, ""))
    if first_author:
        strategies.append((" ".join(words[:5]), first_author))
    strategies.append((" ".join(words[:4]), ""))

    key_param = f"&key={BOOKS_API_KEY}" if BOOKS_API_KEY else ""
    seen_ids   = set()
    candidates = []

    for t_q, a_q in strategies:
        query = f"intitle:{urllib.parse.quote(t_q[:80])}"
        if a_q:
            query += f"+inauthor:{urllib.parse.quote(a_q)}"
        url = (
            f"https://www.googleapis.com/books/v1/volumes"
            f"?q={query}&maxResults=5&printType=books{key_param}"
        )
        try:
            r = requests.get(url, timeout=12)
            if r.status_code == 429:
                raise SystemExit("Google Books quota exceeded (429). Re-run tomorrow.")
            if r.status_code == 200:
                data = r.json()
                if data.get("totalItems", 0) > 0 and data.get("items"):
                    for item in data["items"]:
                        vid  = item["id"]
                        info = item.get("volumeInfo", {})
                        if vid not in seen_ids and info.get("title"):
                            seen_ids.add(vid)
                            candidates.append({"volume_id": vid, "info": info})
                    if candidates:
                        break  # Got results from this strategy; stop trying fallbacks
        except SystemExit:
            raise
        except Exception as e:
            print(f"    API error: {e}")
        time.sleep(0.25)

    if not candidates:
        return None, None, []

    # Sort by title similarity — best match first
    candidates.sort(
        key=lambda c: title_similarity(title, c["info"].get("title", "")),
        reverse=True,
    )

    best = candidates[0]
    return best["volume_id"], best["info"], candidates


# ── Record builder ────────────────────────────────────────────────────────────

def build_record(idx, item_data, volume_id, info, hidden=False,
                 confidence="none", candidates=None):
    cover_url        = ""
    google_books_url = ""
    api_publisher    = ""
    page_count       = None
    summary          = ""

    if info and not hidden:
        img = info.get("imageLinks", {})
        raw = img.get("thumbnail", img.get("smallThumbnail", ""))
        if raw:
            cover_url = (
                raw
                .replace("http://", "https://")
                .replace("&edge=curl", "")
            )
        if volume_id:
            google_books_url = f"https://books.google.com/books?id={volume_id}"
        api_publisher = info.get("publisher", "")
        pc            = info.get("pageCount")
        page_count    = int(pc) if pc else None
        raw_desc      = info.get("description", "")
        summary       = re.sub(r"<[^>]+>", "", raw_desc)[:500] if raw_desc else ""

    # Price: CSV value first, then type default
    price_raw = item_data["price_raw"]
    try:
        price = float(price_raw.replace("$", "").strip()) if price_raw else None
    except ValueError:
        price = None
    if price is None:
        price = item_data["price_default"]

    # Publisher: user-supplied takes priority over Google Books
    publisher = item_data.get("user_publisher") or api_publisher

    # Simplified candidate list for the admin UI (only when confidence is not high)
    simple_candidates = []
    if confidence != "high" and candidates:
        for c in candidates:
            img = c["info"].get("imageLinks", {})
            raw = img.get("thumbnail", img.get("smallThumbnail", ""))
            c_cover = (
                raw.replace("http://", "https://").replace("&edge=curl", "")
                if raw else ""
            )
            simple_candidates.append({
                "volumeId":      c["volume_id"],
                "title":         c["info"].get("title", ""),
                "authors":       c["info"].get("authors", []),
                "coverUrl":      c_cover,
                "googleBooksUrl": f"https://books.google.com/books?id={c['volume_id']}",
            })

    return {
        "id":              idx,
        "type":            item_data["type"],
        "title":           item_data["title"],
        "author":          item_data["author"],
        "subject":         item_data["subject"],
        "date":            item_data["date"],
        "price":           price,
        "mediaNote":       item_data["media_note"],
        "coverUrl":        cover_url,
        "googleBooksUrl":  google_books_url,
        "publisher":       publisher,
        "pageCount":       page_count,
        "summary":         summary,
        "matchConfidence": confidence,
        "candidates":      simple_candidates,
    }


# ── Load all CSVs ─────────────────────────────────────────────────────────────

def load_all_items():
    all_items = []

    for source in SOURCES:
        path = os.path.join(SRC_DIR, source["filename"])
        rows = read_csv(path)
        before = len(all_items)

        for row in rows:
            title = get_field(row, source["col_title"])
            if not title:
                continue

            sold = row.get("Sold", "").strip().upper()
            keep = row.get("Keep", "").strip().upper()
            if sold == "TRUE" or keep == "TRUE":
                continue

            all_items.append({
                "type":           source["type"],
                "title":          title,
                "author":         get_field(row, source["col_author"]),
                "subject":        get_field(row, source.get("col_subject", [])),
                "date":           get_field(row, source["col_date"]),
                "price_raw":      get_field(row, source.get("col_price", [])),
                "price_default":  source["price_default"],
                "media_note":     get_field(row, source["col_media"]),
                "user_publisher": get_field(row, source.get("col_publisher", [])),
            })

        added = len(all_items) - before
        print(f"  {source['filename']}: {len(rows)} rows → {added} active")

    return all_items


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    cache     = load_cache()
    overrides = load_overrides()

    if overrides:
        print(f"Overrides loaded: {len(overrides)} item(s) will have Google Books data hidden.")

    print("Loading CSVs...")
    all_items = load_all_items()

    # Build a set of all current item keys so we can detect orphaned overrides later
    current_keys = {override_key(item["title"], item["author"]) for item in all_items}

    # Sort alphabetically by title across all types
    all_items.sort(key=lambda x: x["title"].lower())

    print(f"\nTotal items for sale: {len(all_items)}")
    print("Fetching Google Books metadata...\n")

    books       = []
    new_fetches = 0

    # Types that don't benefit from Google Books lookups
    NO_LOOKUP_TYPES = {"CD"}

    for idx, item in enumerate(all_items, 1):
        title  = item["title"]
        author = item["author"]

        if item["type"] in NO_LOOKUP_TYPES:
            print(f"[{idx:04d}] skip   [{item['type']}] {title[:52]}")
            books.append(build_record(idx, item, None, None))
            continue

        ckey = cache_key(title, author)
        okey = override_key(title, author)

        if ckey not in cache:
            print(f"[{idx:04d}] fetch  [{item['type']}] {title[:52]}")
            try:
                volume_id, info, candidates = search_google_books(title, author)
            except SystemExit:
                print(f"\nQuota hit — writing {len(books)} items fetched so far.")
                _write_output(books, OUT_FILE, new_fetches)
                raise
            confidence = assess_confidence(title, author, info)
            cache[ckey] = {
                "volume_id":  volume_id,
                "info":       info,
                "confidence": confidence,
                "candidates": candidates,
            }
            save_cache(cache)
            new_fetches += 1
            conf_tag = f" [{confidence}]" if info else ""
            print(f"    {'✓ ' + info.get('title', '')[:48] + conf_tag if info else '✗ not found'}")
            time.sleep(0.4)
        else:
            print(f"[{idx:04d}] cached [{item['type']}] {title[:52]}")
            # Back-fill confidence for old cache entries that lack it
            if "confidence" not in cache[ckey]:
                cache[ckey]["confidence"] = assess_confidence(
                    title, author, cache[ckey].get("info")
                )

        entry      = cache[ckey]
        ov_val     = overrides.get(okey)
        use_vol_id = entry.get("volume_id")
        use_info   = entry.get("info")
        confidence = entry.get("confidence", "none")
        candidates = entry.get("candidates", [])
        hidden     = False

        if ov_val == "hide":
            hidden = True
        elif ov_val == "confirm":
            confidence = "high"  # user confirmed the current match is correct
        elif isinstance(ov_val, dict) and "volumeId" in ov_val:
            # User picked a specific candidate via the admin panel
            target = ov_val["volumeId"]
            match  = next((c for c in candidates if c["volume_id"] == target), None)
            if match:
                use_vol_id = target
                use_info   = match["info"]
                confidence = "high"   # manually confirmed → treat as certain
            else:
                print(f"    ⚠ override volumeId {target!r} not in candidates; using original")

        books.append(
            build_record(idx, item, use_vol_id, use_info, hidden, confidence, candidates)
        )

    # Summary of low-confidence matches (for admin review)
    low_conf = [b for b in books if b.get("matchConfidence") == "low"]
    if low_conf:
        print(f"\n{'~' * 60}")
        print(f"LOW CONFIDENCE MATCHES ({len(low_conf)}) — review in admin panel:")
        for b in low_conf:
            print(f"  [{b['type']}] {b['title'][:55]}")
        print(f"{'~' * 60}")

    # Warn about overrides that no longer match any item (title/author may have changed in CSV)
    orphaned = [k for k in overrides if k not in current_keys]
    if orphaned:
        print(f"\n{'!' * 60}")
        print(f"WARNING: {len(orphaned)} override(s) didn't match any current item.")
        print("These may have been renamed in the CSV, sold/removed, or are typos.")
        print("Clean up scripts/overrides.json if these are no longer needed:\n")
        for k in orphaned:
            title, author = k.split("|||", 1)
            print(f"  title:  {title or '(empty)'}")
            print(f"  author: {author or '(empty)'}")
            print()
        print(f"{'!' * 60}\n")

    _write_output(books, OUT_FILE, new_fetches)


def _write_output(books, out_file, new_fetches):
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(books, f, indent=2, ensure_ascii=False)
    print(f"\n{'=' * 60}")
    print(f"Done: {len(books)} items → {out_file}")
    print(f"API calls this run: {new_fetches} | Cached: {len(books) - new_fetches}")


if __name__ == "__main__":
    main()
