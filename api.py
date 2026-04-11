"""
Flask server for Georgian Language app.
Serves static files + exposes POST /api/ocr using Claude vision API.
Run: python api.py
"""
import os, json, base64, mimetypes
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, send_file

import anthropic

app = Flask(__name__, static_folder=None)
ROOT = Path(__file__).parent

# ── Static file serving ────────────────────────────────────────────────────────

def no_cache(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/')
def index():
    return no_cache(send_file(ROOT / 'index.html'))

@app.route('/<path:path>')
def static_files(path):
    full = ROOT / path
    if full.exists() and full.is_file():
        mime, _ = mimetypes.guess_type(str(full))
        response = send_file(full, mimetype=mime or 'application/octet-stream')
        # Never cache HTML, JS, CSS or the service worker
        if any(path.endswith(ext) for ext in ('.html', '.js', '.css')):
            no_cache(response)
        return response
    return 'Not found', 404

# ── OCR endpoint ───────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a Georgian language textbook OCR assistant.
Extract vocabulary words from the photo of a textbook page.
Return ONLY a JSON array — no markdown, no explanation, just the array.
Each element must have exactly these keys:
  "georgian"  — the Georgian word in Mkhedruli script
  "english"   — the English translation (lowercase, without "to" for verbs)
  "type"      — one of: noun, verb, adj, adv, phrase, other

Rules:
- Include every distinct word or phrase you can read.
- If the page shows conjugation tables, extract only the infinitive/dictionary form.
- If there are no vocabulary words, return [].
- Return raw JSON only, e.g. [{"georgian":"სახლი","english":"house","type":"noun"}]
"""

@app.route('/api/ocr', methods=['POST'])
def ocr():
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        return jsonify({'error': 'ANTHROPIC_API_KEY not set on server'}), 500

    data = request.get_json(force=True, silent=True) or {}
    image_b64 = data.get('image')
    media_type = data.get('mediaType', 'image/jpeg')

    if not image_b64:
        return jsonify({'error': 'No image provided'}), 400

    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model='claude-opus-4-6',
            max_tokens=2048,
            messages=[{
                'role': 'user',
                'content': [
                    {
                        'type': 'image',
                        'source': {
                            'type': 'base64',
                            'media_type': media_type,
                            'data': image_b64,
                        },
                    },
                    {
                        'type': 'text',
                        'text': SYSTEM_PROMPT,
                    },
                ],
            }],
        )

        raw = message.content[0].text.strip()

        # Strip markdown code fences if model wrapped output
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[1] if '\n' in raw else raw[3:]
            raw = raw.rsplit('```', 1)[0].strip()

        words = json.loads(raw)

        # Validate and normalise
        valid_types = {'noun', 'verb', 'adj', 'adv', 'phrase', 'other'}
        cleaned = []
        for w in words:
            if isinstance(w, dict) and w.get('georgian') and w.get('english'):
                cleaned.append({
                    'georgian': str(w['georgian']).strip(),
                    'english':  str(w['english']).strip().lower(),
                    'type':     w.get('type', 'other') if w.get('type') in valid_types else 'other',
                })

        return jsonify({'words': cleaned})

    except json.JSONDecodeError as e:
        return jsonify({'error': f'Could not parse Claude response: {e}', 'raw': raw}), 502
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Progress sync ──────────────────────────────────────────────────────────────

PROGRESS_FILE = ROOT / 'progress.json'

@app.route('/api/progress', methods=['GET'])
def get_progress():
    if not PROGRESS_FILE.exists():
        return jsonify({}), 404
    return jsonify(json.loads(PROGRESS_FILE.read_text(encoding='utf-8')))

@app.route('/api/progress', methods=['POST'])
def save_progress():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({'error': 'No data'}), 400
    PROGRESS_FILE.write_text(json.dumps(data), encoding='utf-8')
    return jsonify({'ok': True})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    print(f'Starting Georgian Language app on http://localhost:{port}')
    app.run(host='0.0.0.0', port=port, debug=False)
