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
            data = speak(a.piper, model, ' '.join(text.split('\n')), v['scale'], v['noise'], v['noise_w'])
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
