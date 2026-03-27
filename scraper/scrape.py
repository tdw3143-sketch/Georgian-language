"""
Georgian verb scraper — lingua.ge
Scrapes conjugation tables from individual verb pages.

Run:  python scraper/scrape.py
      python scraper/scrape.py --pages 10   (first 10 pages ≈ 150 verbs, for testing)
      python scraper/scrape.py --pages 100  (all ~1500 verbs)

Output: data/verbs.json
"""

import json, re, time, sys, argparse, io
from pathlib import Path
import requests
from bs4 import BeautifulSoup

# Fix Windows stdout encoding for Georgian characters
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ── CONFIG ─────────────────────────────────────────────────────────────────────
OUT = Path(__file__).parent.parent / "data" / "verbs.json"
BASE = "https://lingua.ge"
LIST_URL = BASE + "/verbs-all/"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# Tense label matching: look for these substrings in the item text
TENSE_DETECT = [
    ("present",   ["present indicative", "present tense"]),
    ("imperfect", ["imperfect"]),
    ("future",    ["future indicative", "future tense"]),
    ("aorist",    ["aorist indicative"]),
    ("optative",  ["optativeმეორე", "optative"]),
    ("perfect",   ["perfectპირველი", "perfect indicative", "\u10de\u10d4\u10e0\u10e4\u10d4\u10e5\u10e2\u10d8"]),
]

# Items to skip (not conjugation forms)
SKIP_ITEMS = {
    "მხ. – sg.", "მრ. – pl.", "sg.", "pl.",
    "i series - present group", "i სერია - აწმყოს წრე",
    "i series - future group", "i სერია - მყოფადის წრე",
    "ii series", "ii სერია",
    "iii series", "iii სერია",
    "imperative", "ბრძანებითი",
    "synonyms", "სინონიმები",
    "examples", "present subjunctive", "conditional",
    "future subjunctive", "pluperfect", "perfect subjunctive",
    "affirmative imperative", "prohibitve imperative i",
    "prohibitive imperative ii",
}

GEO_RE = re.compile(r"^[\u10D0-\u10FF\s\u200b]{2,25}$")
ENG_RE = re.compile(r"^to ([a-z][a-z\s\-]+?)(?:\s+v\.|$)", re.I)

SESSION = requests.Session()
SESSION.headers.update(HEADERS)


# ── HELPERS ───────────────────────────────────────────────────────────────────
def detect_tense(text):
    t = text.lower()
    for tense, patterns in TENSE_DETECT:
        for p in patterns:
            if p in t:
                return tense
    return None


def is_geo_form(text):
    return bool(GEO_RE.match(text)) and len(text) >= 2


def get_items(soup):
    """Extract all elementor-widget-container text items in document order."""
    containers = soup.select("div.elementor-widget-container")
    items = []
    for c in containers:
        txt = c.get_text(strip=True)
        if txt and len(txt) <= 50:
            items.append(txt)
    return items


# ── VERB PAGE PARSER ──────────────────────────────────────────────────────────
def parse_verb_page(url):
    try:
        r = SESSION.get(url, timeout=15)
        r.raise_for_status()
    except Exception:
        return None

    soup = BeautifulSoup(r.text, "html.parser")
    items = get_items(soup)

    # English: look for "to <word> v.t.i." near the top
    english = ""
    for item in items[:20]:
        m = ENG_RE.match(item)
        if m:
            english = m.group(1).strip().lower()
            break

    # Georgian infinitive: first pure-Georgian item after "Infinitive"
    infinitive = ""
    for i, item in enumerate(items):
        if item.lower() == "infinitive" and i + 1 < len(items):
            candidate = items[i + 1]
            if is_geo_form(candidate):
                infinitive = candidate
                break

    conjugations = {t: {} for t in ["present", "imperfect", "future", "aorist", "optative", "perfect"]}

    # Walk items, track current tense and sg/pl state
    current_tense = None
    sg_forms = []   # collecting 1sg, 2sg, 3sg
    pl_forms = []   # collecting 1pl, 2pl, 3pl
    state = None    # "sg" | "pl"

    def flush():
        if current_tense and len(sg_forms) == 3 and len(pl_forms) == 3:
            conjugations[current_tense]["1sg"] = sg_forms[0]
            conjugations[current_tense]["2sg"] = sg_forms[1]
            conjugations[current_tense]["3sg"] = sg_forms[2]
            conjugations[current_tense]["1pl"] = pl_forms[0]
            conjugations[current_tense]["2pl"] = pl_forms[1]
            conjugations[current_tense]["3pl"] = pl_forms[2]

    for item in items:
        item_stripped = item.strip("\u200b")  # remove zero-width spaces
        lower = item_stripped.lower()

        # Check sg/pl markers FIRST (before SKIP_ITEMS, which also contains these)
        if "მხ." in item or ("sg." in lower and len(item) < 15):
            state = "sg"
            continue
        if "მრ." in item or ("pl." in lower and len(item) < 15):
            state = "pl"
            continue

        # Check for tense label
        tense = detect_tense(lower)
        if tense:
            flush()
            current_tense = tense
            sg_forms = []
            pl_forms = []
            state = None
            continue

        # Skip navigation/metadata items
        if lower in SKIP_ITEMS:
            continue

        # If it's a Georgian form, collect it
        if current_tense and state and is_geo_form(item_stripped):
            if state == "sg" and len(sg_forms) < 3:
                sg_forms.append(item_stripped)
            elif state == "pl" and len(pl_forms) < 3:
                pl_forms.append(item_stripped)

    flush()  # handle last tense

    # Must have at least present tense
    if not conjugations["present"]:
        return None

    return {
        "english": english or url.split("/")[-2].replace("-", " "),
        "infinitive": infinitive,
        "conjugations": conjugations,
    }


# ── LINK COLLECTION ───────────────────────────────────────────────────────────
def get_verb_links(max_pages):
    links = []
    seen = set()
    for page in range(1, max_pages + 1):
        url = LIST_URL if page == 1 else f"{LIST_URL}page/{page}/"
        try:
            r = SESSION.get(url, timeout=15)
            r.raise_for_status()
        except Exception as e:
            print(f"  Warning: page {page} failed: {e}")
            break
        soup = BeautifulSoup(r.text, "html.parser")
        page_links = [
            a["href"] for a in soup.find_all("a", href=True)
            if "/verbs/" in a.get("href", "") and a["href"] != LIST_URL
        ]
        new = [l for l in page_links if l not in seen]
        links.extend(new)
        seen.update(new)
        if page % 10 == 0 or page == max_pages:
            print(f"  Collected {len(links)} links (page {page}/{max_pages})…")
        time.sleep(0.2)
    return links


# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", type=int, default=100,
                        help="Number of list pages to scrape (15 verbs each). Default: 100")
    args = parser.parse_args()

    print(f"Step 1: Collecting verb links ({args.pages} pages)…")
    links = get_verb_links(args.pages)
    print(f"  Total: {len(links)} verb pages to scrape\n")

    verbs = []
    errors = 0

    print("Step 2: Scraping individual verb pages…")
    for i, url in enumerate(links, 1):
        if i % 50 == 0 or i == len(links):
            print(f"  [{i}/{len(links)}]  {len(verbs)} ok, {errors} errors")
        data = parse_verb_page(url)
        if data:
            slug = url.rstrip("/").split("/")[-1]
            verb_id = re.sub(r"[^a-z0-9_]", "_", data["english"].replace(" ", "_"))[:40] or slug
            verbs.append({
                "id": verb_id,
                "infinitive": data["infinitive"],
                "english": data["english"],
                "frequency_rank": i,   # order scraped = rough frequency proxy
                "conjugations": data["conjugations"],
            })
        else:
            errors += 1
        time.sleep(0.25)

    if not verbs:
        print("ERROR: No verbs scraped. Not overwriting existing data.")
        sys.exit(1)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(verbs, f, ensure_ascii=False, indent=2)

    print(f"\nDone: {len(verbs)} verbs saved to {OUT}  ({errors} errors)")

    # Auto-clean: deduplicate, sort by frequency, patch missing common verbs
    print("\nStep 3: Cleaning and sorting…")
    import subprocess
    clean_script = Path(__file__).parent / "clean.py"
    subprocess.run([sys.executable, str(clean_script)], check=True)


if __name__ == "__main__":
    main()
