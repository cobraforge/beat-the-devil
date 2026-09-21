"""Bundle index.html + style.css + audio.js + game.js into one self-contained
dist/index.html. dist/ is the deployable site root: nothing else is needed
(the only external reference is Google Fonts, fetched at runtime)."""
import pathlib, re

root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf-8')

css = (root / 'style.css').read_text(encoding='utf-8')
# the stylesheet link may carry a cache-busting ?v= query, like the scripts
html, n = re.subn(r'<link rel="stylesheet" href="style\.css(\?v=\d+)?">', lambda m: '<style>\n' + css + '</style>', html)
assert n == 1, 'style.css link'

for name in ('audio.js', 'game.js'):
    js = (root / name).read_text(encoding='utf-8')
    # the script tags may carry a cache-busting ?v= query
    pattern = r'<script src="%s(\?v=\d+)?"></script>' % re.escape(name)
    html, n = re.subn(pattern, lambda m: '<script>\n' + js + '</script>', html)
    assert n == 1, name

assert 'href="style.css"' not in html and 'src="game.js' not in html and 'src="audio.js' not in html

out = root / 'dist' / 'index.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding='utf-8', newline='\n')
# the old single-file name, so no stale copy lingers beside the real one
(out.parent / 'beat-the-devil.html').unlink(missing_ok=True)
print('wrote', out, len(html), 'bytes')
