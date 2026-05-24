import os
from flask import Flask, render_template

# 用 app.py 所在目录的绝对路径，确保从任意位置启动都能找到 templates/static/
BASE = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE, 'templates'),
    static_folder=os.path.join(BASE, 'static'),
)

@app.route('/')
@app.route('/performance')
def performance():
    return render_template('performance.html')

if __name__ == '__main__':
    print(f"[RhythmHalo] templates: {app.template_folder}")
    print(f"[RhythmHalo] static:    {app.static_folder}")
    app.run(debug=True, host='0.0.0.0', port=5000)
