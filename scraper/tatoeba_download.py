"""
Downloads Georgian-English sentence pairs from Tatoeba and saves to data/tatoeba.json.
Run once from the project root: python scraper/tatoeba_download.py
Requires no extra dependencies — uses only the standard library.
"""
import urllib.request, urllib.parse, json, time, os

BASE = 'https://tatoeba.org/en/api_v0/search'
pairs = []
page = 1

while True:
    params = urllib.parse.urlencode({'from': 'kat', 'to': 'eng', 'query': '', 'page': page})
    req = urllib.request.Request(
        f'{BASE}?{params}',
        headers={'User-Agent': 'Mozilla/5.0'}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode('utf-8'))

    results = data.get('results', [])
    if not results:
        break

    for s in results:
        ka = s['text']
        for group in s.get('translations', []):
            for tr in group:
                if tr.get('lang') == 'eng':
                    pairs.append({'ka': ka, 'en': tr['text']})
                    break  # one English translation per Georgian sentence is enough

    page_count = data.get('paging', {}).get('Sentences', {}).get('pageCount', 1)
    print(f'Page {page}/{page_count}  —  {len(pairs)} pairs collected')

    if page >= page_count:
        break
    page += 1
    time.sleep(0.5)  # be polite to Tatoeba's servers

output = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'tatoeba.json')
with open(output, 'w', encoding='utf-8') as f:
    json.dump(pairs, f, ensure_ascii=False, separators=(',', ':'))

print(f'\nDone — saved {len(pairs)} pairs to {output}')
