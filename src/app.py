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

@app.route('/')
@app.route('/performance')
def performance():
    return render_template('performance.html')

# 提供乐谱 PDF 文件
@app.route('/sheets/<path:filename>')
def serve_sheet(filename):
    return send_from_directory(SHEETS_DIR, filename)

# 列出所有可用乐谱
@app.route('/api/sheets')
def list_sheets():
    if not os.path.isdir(SHEETS_DIR):
        return jsonify([])
    files = sorted([f for f in os.listdir(SHEETS_DIR) if f.lower().endswith('.pdf')])
    return jsonify(files)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
