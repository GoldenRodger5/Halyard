#!/usr/bin/env python3
"""Assemble one clip at exact 60 fps from a capture2.mjs run.

usage: assemble.py RUN_DIR MODE START_LABEL_PREFIX END_LABEL_PREFIX SEQ_DIR [start_offset_s] [end_offset_s]

Real-time segments: screencast frames, each held until the next (sample-and-hold
at 1/60 s). Stepped segments (scrolls): their frames, one per output frame.
Writes SEQ_DIR/o%05d.png symlinks + SEQ_DIR/timeline.json (marks in clip seconds).
"""
import json, os, sys, bisect
run, mode, sl, el, seq = sys.argv[1:6]
so = float(sys.argv[6]) if len(sys.argv) > 6 else 0.0
eo = float(sys.argv[7]) if len(sys.argv) > 7 else 0.0
d = json.load(open(f"{run}/run-{mode}.json"))
fr = sorted(json.load(open(f"{run}/frames.json")), key=lambda f: f["ts"])
fts = [f["ts"] for f in fr]
marks = d["clipMarks"]
def find(prefix): return next(m for m in marks if m["label"].startswith(prefix))
S = find(sl)["wall"] + so
E = find(el)["wall"] + eo
segs = d["segments"]
os.makedirs(seq, exist_ok=True)
for f in os.listdir(seq):
    if f.startswith("o"): os.remove(os.path.join(seq, f))
out = []  # absolute paths
mapping = []  # (wall0, wall1, out0, out1, type)
last = None
dt = 1 / 60
for sg in segs:
    w0, w1 = max(sg["w0"], S), min(sg["w1"], E)
    if sg["type"] == "step":
        if sg["w0"] < S or sg["w1"] > E:
            if sg["w1"] <= S or sg["w0"] >= E: continue
            raise SystemExit(f"stepped segment straddles the clip edge: {sg['w0']}..{sg['w1']}")
        o0 = len(out) * dt
        for name in sg["frames"]:
            out.append(os.path.abspath(f"{run}/stepped/{name}"))
        last = out[-1]
        mapping.append((sg["w0"], sg["w1"], o0, len(out) * dt, "step", sg.get("tomatoFrames", [])))
        continue
    if w1 <= w0: continue
    o0 = len(out) * dt
    n = round((w1 - w0) / dt)
    for k in range(n):
        t = w0 + k * dt
        i = bisect.bisect_right(fts, t) - 1
        # inside this segment use screencast; before its first frame keep what was last shown
        if i >= 0 and (fts[i] >= sg["w0"] or last is None):
            last = os.path.abspath(f"{run}/frames/{fr[i]['name']}")
        out.append(last)
    mapping.append((w0, w1, o0, len(out) * dt, "rt", None))
for k, p in enumerate(out):
    os.symlink(p, os.path.join(seq, f"o{k:05d}.png"))
def to_out(w):
    for a, b, o0, o1, typ, _ in mapping:
        if a <= w <= b:
            return round(o0 + (o1 - o0) * ((w - a) / (b - a) if b > a else 0), 3)
    return None
tl = [{"t": to_out(m["wall"]), "label": m["label"], **{k: v for k, v in m.items() if k not in ("t", "wall", "label")}} for m in marks if S <= m["wall"] <= E]
tom = []
for a, b, o0, o1, typ, tf in mapping:
    if typ == "step" and tf:
        tom.append([round(o0 + min(tf) * dt, 3), round(o0 + (max(tf) + 1) * dt, 3)])
json.dump({"frames": len(out), "duration_s": round(len(out) * dt, 3), "timeline": tl, "segments": [{"type": t, "clip_s": [round(o0, 3), round(o1, 3)]} for a, b, o0, o1, t, _ in mapping], "tomato_visible_clip_s": tom}, open(f"{seq}/timeline.json", "w"), indent=1)
print(json.dumps({"frames": len(out), "duration_s": round(len(out) * dt, 3), "tomato": tom}))
