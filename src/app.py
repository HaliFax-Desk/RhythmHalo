import os
import json
from flask import Flask, render_template, send_from_directory, jsonify, request

BASE = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE, 'templates'),
    static_folder=os.path.join(BASE, 'static'),
)

SHEETS_DIR = os.path.join(BASE, 'upload', 'Sheets')
VTT_DIR   = os.path.join(BASE, 'DataBase')
PIECES_JSON = os.path.join(BASE, 'DataBase', 'pieces.json')

def _load_pieces():
    if not os.path.isfile(PIECES_JSON):
        return {}
    with open(PIECES_JSON, 'r', encoding='utf-8') as f:
        data = json.load(f)
    pieces = {}
    for p in data:
        pieces[p['id']] = p
    return pieces

def _find_file(directory, filename):
    if not filename:
        return None
    exact = os.path.join(directory, filename)
    if os.path.isfile(exact):
        return filename
    if not os.path.isdir(directory):
        return None
    lower = filename.lower()
    for f in os.listdir(directory):
        if f.lower() == lower:
            return f
    return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/performance')
def performance():
    return render_template('performance.html')

# ====== 曲谱索引接口 ======

@app.route('/api/pieces')
def list_pieces():
    """返回所有曲谱简要信息（不含文件名，前端安全展示）"""
    pieces = _load_pieces()
    items = []
    for pid, p in pieces.items():
        items.append({
            'id': p['id'],
            'title': p['title'],
            'author': p.get('author', ''),
            'bars': p.get('bars', 0),
            'duration': p.get('duration', ''),
            'tags': p.get('tags', []),
        })
    return jsonify(items)

@app.route('/api/piece/<piece_id>')
def get_piece(piece_id):
    """返回单个曲谱完整信息（含文件路径，供 performance 页面加载）"""
    pieces = _load_pieces()
    p = pieces.get(piece_id)
    if not p:
        return jsonify({'error': '曲谱不存在'}), 404
    pdf_match = _find_file(SHEETS_DIR, p['pdf'])
    vtt_match = _find_file(VTT_DIR, p['vtt'])
    return jsonify({
        'id': p['id'],
        'title': p['title'],
        'author': p.get('author', ''),
        'bars': p.get('bars', 0),
        'duration': p.get('duration', ''),
        'tags': p.get('tags', []),
        'pdf_file': pdf_match,
        'vtt_file': vtt_match,
    })

# ====== 乐谱 PDF 接口 ======

@app.route('/sheets/<path:filename>')
def serve_sheet(filename):
    return send_from_directory(SHEETS_DIR, filename)

@app.route('/api/current-sheet')
def current_sheet():
    pieces = _load_pieces()
    first = next(iter(pieces.values()), None) if pieces else None
    if first:
        match = _find_file(SHEETS_DIR, first['pdf'])
        if match:
            return jsonify({'filename': match})

    if os.path.isdir(SHEETS_DIR):
        files = sorted([f for f in os.listdir(SHEETS_DIR) if f.lower().endswith('.pdf')])
        if files:
            return jsonify({'filename': files[0]})
    return jsonify({'filename': None})

@app.route('/api/sheets')
def list_sheets():
    if not os.path.isdir(SHEETS_DIR):
        return jsonify([])
    files = sorted([f for f in os.listdir(SHEETS_DIR) if f.lower().endswith('.pdf')])
    return jsonify(files)

# ====== VTT 记号文件接口 ======

@app.route('/api/vtt/<path:filename>')
def serve_vtt(filename):
    return send_from_directory(VTT_DIR, filename)

@app.route('/api/vtt-files')
def list_vtt():
    if not os.path.isdir(VTT_DIR):
        return jsonify([])
    files = sorted([f for f in os.listdir(VTT_DIR) if f.lower().endswith('.vtt')])
    return jsonify(files)

@app.route('/api/current-vtt')
def current_vtt():
    pieces = _load_pieces()
    first = next(iter(pieces.values()), None) if pieces else None
    if first:
        match = _find_file(VTT_DIR, first['vtt'])
        if match:
            return send_from_directory(VTT_DIR, match)

    if os.path.isdir(VTT_DIR):
        files = sorted([f for f in os.listdir(VTT_DIR) if f.lower().endswith('.vtt')])
        if files:
            return send_from_directory(VTT_DIR, files[0])
    return jsonify({'error': 'no VTT file found'}), 404

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
