"""Render the game's spoken lines into small MP3s in voice/ (the game's only
audio files): every briefing's story pages and the narrator's other lines,
read by a woman's neural voice (one of them afraid), and the Warden's and the
devil's, read by a man's (the game slows, drops and distorts theirs as it
plays).

The words are read out of game.js — BRIEF (page 0 of each level prefixed with
the level's spoken name, its `say`) and SPOKEN — so the recordings always say
what the game shows. Re-run this after changing any of them, and bump VOICE_V.

It needs Piper (open-source text-to-speech, MIT) and two voice models, which
live outside the project:

  piper:    https://github.com/rhasspy/piper/releases  (piper_windows_amd64.zip)
  voices:   https://huggingface.co/rhasspy/piper-voices
            en/en_GB/cori/high    (en_GB-cori-high.onnx + .json: the narrator,
                                   a British woman's voice, public domain)
            en/en_US/norman/medium (en_US-norman-medium.onnx + .json: the
                                   Warden, a man's voice, public domain)
            (both trained on LibriVox audiobook readings)

and the soundfile package (pip install soundfile numpy) to write MP3.

Beside the MP3s it writes voice/timings.json: for each line its length and,
for story pages, when each paragraph is spoken and which letters of the page
it covers, so the game can type the page out in step with the voice.

  python dev/voice.py --piper path/to/piper.exe --model path/to/en_GB-cori-high.onnx
                      --warden path/to/en_US-norman-medium.onnx [--only win1,warden]

Piper reads a little differently each run, so --only re-renders just the lines
named and keeps every other take (and its timings) as it is.
"""
import argparse, json, pathlib, re, subprocess, tempfile
import numpy as np
import soundfile as sf

root = pathlib.Path(__file__).resolve().parent.parent
SR = 22050
LENGTH_SCALE = 1.1         # a little slower than read aloud: she takes her time
SENTENCE_SILENCE = 0.5     # and lets each sentence land
PARAGRAPH_SILENCE = 0.6    # a blank line in the page: a longer pause
NOISE_SCALE, NOISE_W = 0.82, 0.95   # more life in the voice than the model's default (0.667, 0.8)
# the last paragraph of a line with more than one ("It is yours. And he wants
# it.") is its sting: a held pause before it, and she draws it out
STING_SCALE, STING_SILENCE = 1.3, 0.9
LEAD, TAIL = 0.08, 0.25    # silence before a line, and after
# the men's lines are said straight (the man's voice); the game makes them
# terrible as it plays them. The devil draws his out.
WARDEN = dict(scale=0.95, noise=0.75, noise_w=0.9)
DEVIL = dict(scale=1.35, noise=0.8, noise_w=1.0)
# the narrator afraid: quicker, and less steady
SCARED = dict(scale=0.88, noise=1.0, noise_w=1.1)
MEN = {'warden': WARDEN, 'devil': DEVIL}
# A word marked with a trailing ~ in a man's line ("No~... They were MINE!") is
# drawn out into a cry: said very slowly, then stretched further as its pitch
# sags and wavers (like a voice breaking), before a pause and the rest.
CRY_SCALE, CRY_RATE, CRY_VIBRATO, CRY_PAUSE = 3.2, (0.92, 0.5), (5.2, 0.04), 0.4
# After it, a man's line is spat: clipped and quick (SPITE_SCALE), held down
# (SPITE_GAIN), and a last word in CAPITALS is shouted after a beat — driven
# hard into a clip, the loudest thing in the line ("They were... MINE!").
SPITE_SCALE, SPITE_GAIN, SHOUT_DRIVE, SHOUT_GAP = 0.86, 0.62, 2.4, 0.12

def shout(x):
    y = np.tanh(SHOUT_DRIVE * x / (float(np.max(np.abs(x))) or 1.0))
    return (y / (float(np.max(np.abs(y))) or 1.0)).astype('float32')

def word_start(x):
    """where the last word of a said phrase begins, found by its sound: in
    "they were mine" the m is a hum with next to nothing above 1 kHz, a run of
    such frames just before the vowel's rise. The cut goes at the quietest
    frame at the head of that run (None if there is no such run)"""
    n, hop = 512, int(0.01 * SR)
    f = np.fft.rfftfreq(n, 1 / SR)
    hf, en = [], []
    for i in range(0, len(x) - n, hop):
        s = np.abs(np.fft.rfft(x[i:i + n] * np.hanning(n))) ** 2
        hf.append(s[f > 1000].sum() / (s.sum() + 1e-12)); en.append(float(np.sqrt(np.mean(x[i:i + n] ** 2))))
    runs, i, top = [], 0, max(en)
    while i < len(hf):                                            # runs of hum
        j = i
        while j < len(hf) and hf[j] < 0.03: j += 1
        if j - i >= 4: runs.append((i, j))
        i = j + 1
    run = next((a for a, b in reversed(runs)                      # the last one the vowel follows
                if any(h >= 0.15 and e > 0.25 * top for h, e in zip(hf[b:b + 12], en[b:b + 12]))), None)
    if run is None: return None
    lo, hi = max(0, run - 4), min(len(en), run + 3)
    return (lo + int(np.argmin(en[lo:hi]))) * hop

def spat(piper, model, line, v):
    """the rest of a man's line: said clipped and quick, its last word, in
    CAPITALS, shouted. Piper cannot say one word on its own (it babbles for
    seconds), so the whole is said at once and cut where that word begins"""
    words = line.split()
    loud = words[-1].strip('!?.,')
    whole = speak(piper, model, ' '.join(words[:-1] + [words[-1].lower()]), SPITE_SCALE, v['noise'], v['noise_w'])
    at = word_start(whole) if len(words) > 1 and len(loud) > 1 and loud.isupper() else None
    if at is None: return whole
    return np.concatenate([SPITE_GAIN * whole[:at], np.zeros(int(SHOUT_GAP * SR), dtype='float32'), shout(whole[at:])])

def cry(x):
    """stretch a word, its pitch falling as it goes, with a waver in it"""
    n, out, pos, i = len(x), [], 0.0, 0
    while pos < n - 1:
        u = pos / n
        rate = (CRY_RATE[0] + (CRY_RATE[1] - CRY_RATE[0]) * u) * (1 + CRY_VIBRATO[1] * np.sin(2 * np.pi * CRY_VIBRATO[0] * i / SR))
        j = int(pos); f = pos - j
        out.append(x[j] * (1 - f) + x[j + 1] * f)
        pos += rate; i += 1
    y = np.array(out, dtype='float32')
    fade = int(0.12 * SR)
    y[-fade:] *= np.linspace(1, 0, fade, dtype='float32')        # it trails off
    return y

def js_string(s):
    """a single-quoted JS string literal's body, unescaped"""
    s = re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), s)
    return s.replace("\\'", "'").replace('\\n', '\n')

STR = r"'((?:[^'\\]|\\.)*)'"

def lines():
    """(key, who, spoken name or None, text) for every line the game speaks"""
    src = (root / 'game.js').read_text(encoding='utf-8')
    brief = src[src.index('var BRIEF = {'):src.index('var BRIEF_CONTROLS')]
    out = []
    for m in re.finditer(r"(\d):\s*\{\s*head:[^\n]*?say:\s*" + STR + r".*?story:\s*\[(.*?)\]", brief, re.S):
        level, say = int(m.group(1)), js_string(m.group(2))
        for i, t in enumerate(js_string(t) for t in re.findall(STR, m.group(3))):
            out.append(('l%d-%d' % (level, i), 'narrator', say if i == 0 else None, t))
    spoken = src[src.index('var SPOKEN = {'):]
    spoken = spoken[:spoken.index('\n};') + 3]
    for m in re.finditer(r"(\w+):\s*\{\s*who:\s*'(\w+)',\s*text:\s*" + STR + r"\s*\}", spoken):
        out.append((m.group(1), m.group(2), None, js_string(m.group(3))))
    assert out, 'no lines found in game.js'
    return out

def trim(x, floor=0.01):
    idx = np.where(np.abs(x) > floor)[0]
    return x[max(0, idx[0] - 200):idx[-1] + 400] if len(idx) else x

def speak(piper, model, line, scale, noise=NOISE_SCALE, noise_w=NOISE_W):
    with tempfile.TemporaryDirectory() as d:
        wav = pathlib.Path(d) / 'x.wav'
        subprocess.run([piper, '-m', model, '--output_file', str(wav), '--length_scale', str(scale),
                        '--noise_scale', str(noise), '--noise_w', str(noise_w),
                        '--sentence_silence', str(SENTENCE_SILENCE)], input=line.encode('utf-8'),
                       check=True, capture_output=True)
        data, sr = sf.read(str(wav), dtype='float32')
    assert sr == SR, sr
    return trim(data)

def render(piper, model, say, text):
    """The narrator: each paragraph spoken separately and joined with a pause,
    so a blank line is heard. Returns the audio and, per paragraph of the text,
    [t0, t1, first letter, end letter] (seconds; letters of the text)."""
    paras, c = [], 0
    for para in text.split('\n\n'):
        paras.append((para, c, c + len(para)))
        c += len(para) + 2
    spoken = ([(say, None, None)] if say else []) + paras
    sting = len(paras) > 1
    chunks, segs, t = [np.zeros(int(LEAD * SR), dtype='float32')], [], LEAD
    for i, (para, c0, c1) in enumerate(spoken):
        last = sting and i == len(spoken) - 1
        data = speak(piper, model, ' '.join(para.split('\n')), STING_SCALE if last else LENGTH_SCALE)
        if c0 is not None: segs.append([round(t, 3), round(t + len(data) / SR, 3), c0, c1])
        chunks.append(data); t += len(data) / SR
        if i < len(spoken) - 1:
            held = sting and i == len(spoken) - 2
            pause = np.zeros(int((STING_SILENCE if held else PARAGRAPH_SILENCE) * SR), dtype='float32')
            chunks.append(pause); t += len(pause) / SR
    chunks.append(np.zeros(int(TAIL * SR), dtype='float32'))
    return finish(np.concatenate(chunks)), segs

def finish(audio):
    peak = float(np.max(np.abs(audio))) or 1.0
    return audio * (0.89 / peak)                                  # a steady level, clear of clipping

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--piper', required=True)
    ap.add_argument('--model', required=True, help="the narrator's voice")
    ap.add_argument('--warden', required=True, help="the Warden's voice")
    ap.add_argument('--only', help='comma-separated keys to re-render; the rest are kept')
    a = ap.parse_args()
    out = root / 'voice'
    out.mkdir(exist_ok=True)
    only = set(a.only.split(',')) if a.only else None
    tpath = out / 'timings.json'
    timings = json.loads(tpath.read_text(encoding='utf-8')) if only and tpath.exists() else {}
    for key, who, say, text in lines():
        if only and key not in only: continue
        if who in MEN or who == 'scared':
            v, model = (MEN[who], a.warden) if who in MEN else (SCARED, a.model)
            line = ' '.join(text.split('\n'))
            if '~' in line:
                word, rest = line.split('~', 1)
                rest = rest.lstrip('. ').strip()
                parts = [cry(speak(a.piper, model, word, CRY_SCALE, v['noise'], v['noise_w'])),
                         np.zeros(int(CRY_PAUSE * SR), dtype='float32')]
                if rest: parts.append(spat(a.piper, model, rest, v))
                data = np.concatenate(parts)
            else:
                data = speak(a.piper, model, line, v['scale'], v['noise'], v['noise_w'])
            audio, segs = finish(np.concatenate([np.zeros(int(LEAD * SR), dtype='float32'), data, np.zeros(int(TAIL * SR), dtype='float32')])), []
        else:
            audio, segs = render(a.piper, a.model, say, text)
        timings[key] = { 'dur': round(len(audio) / SR, 3), 'segs': segs }
        path = out / (key + '.mp3')
        with sf.SoundFile(str(path), 'w', samplerate=SR, channels=1, format='MP3',
                          bitrate_mode='VARIABLE', compression_level=0.55) as f:
            f.write(audio)
        print('%-6s %-8s %5.1fs %6d bytes  %s' % (key, who, len(audio) / SR, path.stat().st_size, text.replace('\n', ' / ')[:52]))
    (out / 'timings.json').write_text(json.dumps(timings, separators=(',', ':')), encoding='utf-8')
    print('wrote', out / 'timings.json')

if __name__ == '__main__':
    main()
