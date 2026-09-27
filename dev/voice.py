"""Render the narrator's lines: every briefing's story pages, read by a
neural voice, into small MP3s in voice/ (the game's only audio files).

The words are read out of BRIEF in game.js, so the recordings always say what
the pages show: page 0 of each level is prefixed with the level's spoken name
(its `say`). Re-run this after changing the story.

It needs Piper (open-source text-to-speech, MIT) and a voice model, which live
outside the project:

  piper:  https://github.com/rhasspy/piper/releases  (piper_windows_amd64.zip)
  voice:  https://huggingface.co/rhasspy/piper-voices  en/en_US/norman/medium
          (en_US-norman-medium.onnx and .onnx.json; public domain, trained on
          LibriVox audiobook readings)

and the soundfile package (pip install soundfile numpy) to write MP3.

Beside the MP3s it writes voice/timings.json: for each page, when each of its
paragraphs is spoken and which letters of the page it covers, so the game can
type the page out in step with the voice.

  python dev/voice.py --piper path/to/piper.exe --model path/to/en_US-norman-medium.onnx
"""
import argparse, json, pathlib, re, subprocess, tempfile
import numpy as np
import soundfile as sf

root = pathlib.Path(__file__).resolve().parent.parent
SR = 22050
LENGTH_SCALE = 1.12        # a little slower than read aloud: he takes his time
SENTENCE_SILENCE = 0.42    # and pauses between sentences
PARAGRAPH_SILENCE = 0.55   # a blank line in the page: a longer pause
LEAD, TAIL = 0.08, 0.25    # silence before he starts, and after

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

def speak(piper, model, line):
    with tempfile.TemporaryDirectory() as d:
        wav = pathlib.Path(d) / 'x.wav'
        subprocess.run([piper, '-m', model, '--output_file', str(wav), '--length_scale', str(LENGTH_SCALE),
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
    gap = np.zeros(int(PARAGRAPH_SILENCE * SR), dtype='float32')
    chunks, segs, t = [np.zeros(int(LEAD * SR), dtype='float32')], [], LEAD
    for i, (para, c0, c1) in enumerate(spoken):
        data = speak(piper, model, ' '.join(para.split('\n')))
        if c0 is not None: segs.append([round(t, 3), round(t + len(data) / SR, 3), c0, c1])
        chunks.append(data); t += len(data) / SR
        if i < len(spoken) - 1: chunks.append(gap); t += len(gap) / SR
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
