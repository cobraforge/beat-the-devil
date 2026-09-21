"""Bundle index.html + style.css + audio.js + game.js into one self-contained
HTML file at dist/beat-the-devil.html (for publishing as a single artifact)."""
import pathlib, re

root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf-8')

css = (root / 'style.css').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '</style>')

for name in ('audio.js', 'game.js'):
    js = (root / name).read_text(encoding='utf-8')
    # the script tags may carry a cache-busting ?v= query
    pattern = r'<script src="%s(\?v=\d+)?"></script>' % re.escape(name)
    html, n = re.subn(pattern, lambda m: '<script>\n' + js + '</script>', html)
    assert n == 1, name

assert 'href="style.css"' not in html and 'src="game.js' not in html and 'src="audio.js' not in html

out = root / 'dist' / 'beat-the-devil.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding='utf-8', newline='\n')
print('wrote', out, len(html), 'bytes')
