"""Render the narrator's lines: every briefing's story pages, read by a
neural voice, into small MP3s in voice/ (the game's only audio files).

The words are read out of BRIEF in game.js, so the recordings always say what
the pages show: page 0 of each level is prefixed with the level's spoken name
(its `say`). Re-run this after changing the story.

It needs Piper (open-source text-to-speech, MIT) and a voice model, which live
outside the project:

  piper:  https://github.com/rhasspy/piper/releases  (piper_windows_amd64.zip)
  voice:  https://huggingface.co/rhasspy/piper-voices  en/en_GB/cori/high
          (en_GB-cori-high.onnx and .onnx.json: a British woman's voice, public
          domain, trained on LibriVox audiobook readings)

and the soundfile package (pip install soundfile numpy) to write MP3.

Beside the MP3s it writes voice/timings.json: for each page, when each of its
paragraphs is spoken and which letters of the page it covers, so the game can
type the page out in step with the voice.

  python dev/voice.py --piper path/to/piper.exe --model path/to/en_GB-cori-high.onnx
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
# the last line of a page with more than one paragraph ("It is yours. And he
# wants it.") is its sting: a held pause before it, and she draws it out
STING_SCALE, STING_SILENCE = 1.3, 0.9
LEAD, TAIL = 0.08, 0.25    # silence before she starts, and after

def js_string(s):
    """a single-quoted JS string literal's body, unescaped"""
    s = re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), s)
    return s.replace("\\'", "'").replace('\\n', '\n')

def pages():
    """(key, spoken name or None, page text) for every story page in BRIEF"""
    src = (root / 'game.js').read_text(encoding='utf-8')
    body = src[src.index('var BRIEF = {'):src.index('var BRIEF_CONTROLS')]
    out = []
    for m in re.finditer(r"(\d):\s*\{\s*head:[^\n]*?say:\s*'((?:[^'\\]|\\.)*)'.*?story:\s*\[(.*?)\]", body, re.S):
        level, say = int(m.group(1)), js_string(m.group(2))
        texts = [js_string(t) for t in re.findall(r"'((?:[^'\\]|\\.)*)'", m.group(3))]
        for i, t in enumerate(texts):
            out.append(('l%d-%d' % (level, i), say if i == 0 else None, t))
    assert out, 'no story found in game.js'
    return out

def trim(x, floor=0.01):
    idx = np.where(np.abs(x) > floor)[0]
    return x[max(0, idx[0] - 200):idx[-1] + 400] if len(idx) else x

def speak(piper, model, line, scale):
    with tempfile.TemporaryDirectory() as d:
        wav = pathlib.Path(d) / 'x.wav'
        subprocess.run([piper, '-m', model, '--output_file', str(wav), '--length_scale', str(scale),
                        '--noise_scale', str(NOISE_SCALE), '--noise_w', str(NOISE_W),
                        '--sentence_silence', str(SENTENCE_SILENCE)], input=line.encode('utf-8'),
                       check=True, capture_output=True)
        data, sr = sf.read(str(wav), dtype='float32')
    assert sr == SR, sr
    return trim(data)

def render(piper, model, say, text):
    """Each paragraph spoken separately and joined with a pause, so a blank line
    is heard. Returns the audio and, per paragraph of the page,
    [t0, t1, first letter, end letter] (seconds; letters of the page text)."""
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
    audio = np.concatenate(chunks)
    peak = float(np.max(np.abs(audio))) or 1.0
    return audio * (0.89 / peak), segs                        # a steady level, clear of clipping

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--piper', required=True)
    ap.add_argument('--model', required=True)
    a = ap.parse_args()
    out = root / 'voice'
    out.mkdir(exist_ok=True)
    timings = {}
    for key, say, text in pages():
        audio, segs = render(a.piper, a.model, say, text)
        timings[key] = { 'dur': round(len(audio) / SR, 3), 'segs': segs }
        path = out / (key + '.mp3')
        with sf.SoundFile(str(path), 'w', samplerate=SR, channels=1, format='MP3',
                          bitrate_mode='VARIABLE', compression_level=0.55) as f:
            f.write(audio)
        print('%-5s %5.1fs %6d bytes  %s' % (key, len(audio) / SR, path.stat().st_size, text.replace('\n', ' / ')[:60]))
    (out / 'timings.json').write_text(json.dumps(timings, separators=(',', ':')), encoding='utf-8')
    print('wrote', out / 'timings.json')

if __name__ == '__main__':
    main()
