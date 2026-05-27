import os
from flask import Flask, render_template, send_from_directory, jsonify

# 用 app.py 所在目录的绝对路径，确保从任意位置启动都能找到模板/静态/乐谱
BASE = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE, 'templates'),
    static_folder=os.path.join(BASE, 'static'),
)

# 乐谱 PDF 目录
SHEETS_DIR = os.path.join(BASE, 'upload', 'Sheets')

# VTT 记号文件目录
VTT_DIR = os.path.join(BASE, 'DataBase')

# 当前指定乐谱（后端变量控制）
CURRENT_SHEET = None

def find_sheet(filename):
    if not filename:
        return None
    path = os.path.join(SHEETS_DIR, filename)
    if os.path.isfile(path):
        return filename
    for f in os.listdir(SHEETS_DIR):
        if f.lower() == filename.lower():
            return f
    return None

@app.route('/')
@app.route('/performance')
def performance():
    return render_template('performance.html')

# 提供乐谱 PDF 文件
@app.route('/sheets/<path:filename>')
def serve_sheet(filename):
    return send_from_directory(SHEETS_DIR, filename)

# 获取当前指定乐谱
@app.route('/api/current-sheet')
def current_sheet():
    global CURRENT_SHEET
    if CURRENT_SHEET:
        match = find_sheet(CURRENT_SHEET)
        if match:
            return jsonify({'filename': match})
    files = sorted([f for f in os.listdir(SHEETS_DIR) if f.lower().endswith('.pdf')])
    if files:
        CURRENT_SHEET = files[0]
        return jsonify({'filename': files[0]})
    return jsonify({'filename': None})

# 列出所有可用乐谱
@app.route('/api/sheets')
def list_sheets():
    if not os.path.isdir(SHEETS_DIR):
        return jsonify([])
    files = sorted([f for f in os.listdir(SHEETS_DIR) if f.lower().endswith('.pdf')])
    return jsonify(files)

# 列出所有可用 VTT 文件
@app.route('/api/vtt-files')
def list_vtt():
    if not os.path.isdir(VTT_DIR):
        return jsonify([])
    files = sorted([f for f in os.listdir(VTT_DIR) if f.lower().endswith('.vtt')])
    return jsonify(files)

# 提供 VTT 文件内容
@app.route('/api/vtt/<path:filename>')
def serve_vtt(filename):
    return send_from_directory(VTT_DIR, filename)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
