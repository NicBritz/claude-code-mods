# Writes the mod's seven fantasy sound effects: real foley samples from two
# Kenney packs, layered with a short synthesised phrase (a plucked lute, a soft
# horn) so each one reads as a little moment in a tabletop adventure.
# 22.05 kHz mono 16-bit WAV, every file peaking at 1/8 of full scale (about
# -18 dBFS), each under 1.2 s (level-up 1.32 s) and under 60 KB.
#
# Source samples (both CC0 1.0, public domain; licence text in
# ../licences/Kenney-CC0.txt):
#   RPG Audio by Kenney          https://kenney.nl/assets/rpg-audio
#   Impact Sounds by Kenney      https://kenney.nl/assets/impact-sounds
# The packs ship .ogg files; this script decodes them with ffmpeg.
#
# Usage:
#   python3 -I make-sounds.py <out dir> <kenney_rpg-audio dir> <kenney_impact-sounds dir>
# (each pack dir is the unzipped pack, the one holding Audio/ and License.txt)
import math, random, struct, subprocess, sys, wave, pathlib

RATE = 22050
PEAK = 0.125  # 1/8 of full scale, about -18 dBFS
out = pathlib.Path(sys.argv[1])
RPG = pathlib.Path(sys.argv[2]) / 'Audio'
IMPACT = pathlib.Path(sys.argv[3]) / 'Audio'

NOTES = {n: 440.0 * 2 ** ((i - 9) / 12) for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}
def hz(name):
    note, octave = name[:-1], int(name[-1])
    return NOTES[note] * 2 ** (octave - 4)

def sample(path, cutoff=0.5):
    """Decode an .ogg to mono floats at RATE, peak-normalised to 1, softened by a
    one-pole low-pass (cutoff = smoothing factor; 1 = untouched)."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(RATE),
                          '-f', 's16le', '-'], check=True, capture_output=True).stdout
    xs = [v / 32768 for v in struct.unpack(f'<{len(raw) // 2}h', raw)]
    ys, y = [], 0.0
    for x in xs:
        y += cutoff * (x - y)
        ys.append(y)
    peak = max(abs(v) for v in ys) or 1.0
    return [v / peak for v in ys]

def lute(note, seconds, damping=0.996):
    """A plucked string (Karplus-Strong): a noise burst round a delay line."""
    rng = random.Random(note)
    period = max(2, int(RATE / hz(note)))
    line = [rng.uniform(-1, 1) for _ in range(period)]
    # pre-soften the burst so the pluck is warm, not twangy
    for _ in range(2):
        line = [(line[i] + line[i - 1]) / 2 for i in range(period)]
    buf = []
    for i in range(int(seconds * RATE)):
        j = i % period
        v = line[j]
        line[j] = damping * 0.5 * (line[j] + line[(j + 1) % period])
        buf.append(v)
    peak = max(abs(v) for v in buf) or 1.0
    return [v / peak for v in buf]

def horn(note, seconds):
    """A soft, distant horn: a few harmonics with a slow swell."""
    f = hz(note)
    buf = []
    for i in range(int(seconds * RATE)):
        t = i / RATE
        env = min(1.0, t / 0.05) * min(1.0, (seconds - t) / 0.12)
        v = (math.sin(2 * math.pi * f * t) + 0.45 * math.sin(4 * math.pi * f * t)
             + 0.2 * math.sin(6 * math.pi * f * t) + 0.08 * math.sin(8 * math.pi * f * t))
        buf.append(v / 1.73 * env)
    return buf

def drone(note, seconds):
    """A low, fading hum under the error phrase."""
    f = hz(note)
    return [(math.sin(2 * math.pi * f * i / RATE) + 0.3 * math.sin(4 * math.pi * f * i / RATE)) / 1.3
            * min(1.0, i / RATE / 0.02) * math.exp(-i / RATE * 2.5) for i in range(int(seconds * RATE))]

def render(name, layers, seconds):
    # layers: (start s, gain, samples)
    n = int(RATE * seconds)
    buf = [0.0] * n
    for start, gain, xs in layers:
        s0 = int(start * RATE)
        for i, x in enumerate(xs):
            if s0 + i >= n:
                break
            buf[s0 + i] += x * gain
    # 3 ms fade in, 60 ms cosine fade out so nothing clicks at either end
    fin, fout = int(0.003 * RATE), int(0.06 * RATE)
    for i in range(fin):
        buf[i] *= i / fin
    for i in range(fout):
        buf[n - fout + i] *= 0.5 * (1 + math.cos(math.pi * i / fout))
    peak = max(abs(v) for v in buf) or 1.0
    scale = PEAK / peak
    with wave.open(str(out / f'{name}.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(v * scale * 32767)) for v in buf))

# A hero sets out: a blade drawn from its sheath, then a distant two-note horn
# call rising a fifth.
render('set-out', [
    (0.0, 0.8, sample(RPG / 'drawKnife2.ogg', 0.45)),
    (0.30, 0.45, horn('D4', 0.26)),
    (0.54, 0.45, horn('A4', 0.50)),
], 1.08)

# Quest complete: a purse of coins, and a lute arpeggio up to the octave.
render('done', [
    (0.0, 0.7, sample(RPG / 'handleCoins2.ogg', 0.5)),
] + [(0.16 + i * 0.11, 0.55, lute(note, 0.9)) for i, note in enumerate(['C4', 'E4', 'G4', 'C5'])], 1.15)

# Needs you: a page turned, then one soft toll of a bell. Noticeable, not urgent.
render('needs-you', [
    (0.0, 0.35, sample(RPG / 'bookFlip2.ogg', 0.35)),
    (0.16, 1.0, sample(IMPACT / 'impactBell_heavy_001.ogg', 0.45)),
], 1.1)

# A hero fell: a low, muffled drum and a falling D minor phrase over a fading hum.
render('error', [
    (0.0, 1.0, sample(IMPACT / 'impactSoft_heavy_000.ogg', 0.25)),
    (0.0, 0.35, drone('D2', 1.1)),
] + [(0.12 + i * 0.2, 0.6, lute(note, 0.8, 0.994)) for i, note in enumerate(['A3', 'F3', 'D3'])], 1.15)

# Stopped: a heavy door swung shut (its near-silent first 70 ms trimmed off).
render('stopped', [
    (0.0, 1.0, sample(RPG / 'doorClose_4.ogg', 0.4)[int(0.07 * RATE):]),
], 0.7)

def strum(notes, start, step, gain, seconds, damping=0.996):
    """Lute notes struck one after another, a few ms apart, like a strummed chord."""
    return [(start + i * step, gain, lute(note, seconds, damping)) for i, note in enumerate(notes)]

# A hero reaches a new level: a short horn fanfare (da-da-DAA ... DAAA) that
# lands on a strummed C major chord, with a little shimmer of coins.
render('level-up', [
    (0.00, 0.5, horn('C4', 0.14)),
    (0.14, 0.5, horn('C4', 0.14)),
    (0.28, 0.5, horn('G4', 0.24)),
    (0.54, 0.5, horn('C5', 0.74)),
    (0.56, 0.25, sample(RPG / 'handleCoins.ogg', 0.5)),
] + strum(['C3', 'G3', 'C4', 'E4', 'G4'], 0.54, 0.018, 0.3, 0.8), 1.32)

# A natural 20: a die clattering to rest on a wooden table (five light wood
# knocks, closer and softer each bounce), then a bright strummed G major sting.
render('critical', [
    (t, g, sample(IMPACT / f'impactWood_light_00{i}.ogg', 0.6))
    for i, (t, g) in enumerate([(0.0, 0.8), (0.085, 0.6), (0.15, 0.45), (0.195, 0.32), (0.225, 0.22)])
] + strum(['G4', 'B4', 'D5', 'G5'], 0.36, 0.022, 0.4, 0.8) + [
    (0.36, 0.3, horn('G5', 0.6)),
], 1.15)
