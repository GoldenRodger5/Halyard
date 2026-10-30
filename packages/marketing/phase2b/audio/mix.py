"""Mix licensed real recordings with the locked picture; never modifies source video."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--lock", type=Path, required=True)
parser.add_argument("--assets", type=Path, required=True)
parser.add_argument("--out", type=Path, required=True)
parser.add_argument("--voice", type=Path)
args = parser.parse_args()
lock = json.loads(args.lock.read_text())
assert lock["pictureLocked"] is True
picture = Path(lock["picturePath"])
repository_picture = Path(__file__).resolve().parents[4] / lock.get("pictureRepositoryPath", "__absent__")
if repository_picture.is_file():
    picture = repository_picture
assert hashlib.sha256(picture.read_bytes()).hexdigest() == lock["pictureSha256"]
duration = lock["durationSeconds"]
args.out.mkdir(parents=True, exist_ok=True)
role = "narration" if args.voice else "sound-only"


def run(command):
    result = subprocess.run(command, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-3000:])
    return result


def measure(path):
    result = run(["ffmpeg", "-hide_banner", "-i", str(path), "-af",
                  "loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json", "-f", "null", "-"])
    return json.loads(re.findall(r"\{[^{}]+\}", result.stderr)[-1])


if args.voice:
    voice_duration = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-of", "default=nw=1:nk=1", str(args.voice)]).stdout.strip())
    assert voice_duration + lock.get("voiceAtSeconds", 0.1) <= duration + 0.04, (
        "Full voice does not fit. Coordinate picture timing; do not truncate or accelerate speech."
    )

inputs = [args.assets / lock.get("musicSource", "music-excerpt.wav"), args.assets / "oven-ambience.mp3"]
for cue in lock["foleyCues"]:
    inputs.append(args.assets / cue["source"])
voice_index = len(inputs) if args.voice else None
if args.voice:
    inputs.append(args.voice)
command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
for path in inputs:
    command += ["-i", str(path)]

music_level = -27 if args.voice else -20
filters = [
    f"[0:a]atrim=start={lock.get('musicStartSeconds', 0)}:duration={duration},"
    "asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,"
    f"loudnorm=I={music_level}:TP=-5:LRA=8,"
    f"afade=t=in:d=0.08,afade=t=out:st={duration-0.65}:d=0.65[music]",
    f"[1:a]atrim=start=1:duration={duration},asetpts=PTS-STARTPTS,"
    "aresample=48000,aformat=channel_layouts=stereo,highpass=f=110,lowpass=f=5000,"
    f"loudnorm=I=-39:TP=-9:LRA=7,afade=t=in:d=0.12,afade=t=out:st={duration-0.4}:d=0.4[room]",
]
labels = ["[music]", "[room]"]
for index, cue in enumerate(lock["foleyCues"], 2):
    label = f"foley{index}"
    # Short observed transient regions, soft equalization, no invented synth effects.
    filters.append(
        f"[{index}:a]atrim=start={cue['sourceStartSeconds']}:duration={cue['durationSeconds']},"
        "asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,"
        f"highpass=f=140,lowpass=f=6200,volume={cue.get('gainDb', -7)}dB,"
        "alimiter=limit=0.16:level=false,afade=t=in:d=0.008,"
        f"afade=t=out:st={cue['durationSeconds']-0.08}:d=0.08,"
        f"adelay={round(cue['atSeconds']*1000)}:all=1[{label}]"
    )
    labels.append(f"[{label}]")
if args.voice:
    # Preserve the full connected performance and original speed.
    filters.append(
        f"[{voice_index}:a]aresample=48000,aformat=channel_layouts=stereo,"
        "highpass=f=75,loudnorm=I=-17:TP=-2.5:LRA=8,"
        f"adelay={round(lock.get('voiceAtSeconds', 0.1)*1000)}:all=1,apad[voice]"
    )
    labels.append("[voice]")
filters.append("".join(labels) + f"amix=inputs={len(labels)}:duration=longest:normalize=0,"
               f"apad,atrim=duration={duration}[mix]")
raw = args.out / f"{role}-premaster.wav"
run(command + ["-filter_complex", ";".join(filters), "-map", "[mix]", "-ar", "48000",
               "-c:a", "pcm_s24le", str(raw)])
analysis = measure(raw)
master = args.out / f"{role}-master.wav"
normalizer = (
    "loudnorm=I=-16:TP=-1.5:LRA=8:linear=true:"
    f"measured_I={analysis['input_i']}:measured_TP={analysis['input_tp']}:"
    f"measured_LRA={analysis['input_lra']}:measured_thresh={analysis['input_thresh']}:"
    f"offset={analysis['target_offset']}"
)
run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw), "-af", normalizer,
     "-ar", "48000", "-c:a", "pcm_s24le", str(master)])
movie = args.out / f"recipefix-{role}.mp4"
run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(picture), "-i", str(master),
     "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
     "-ar", "48000", "-t", str(duration), "-movflags", "+faststart", str(movie)])
final_measure = measure(movie)
probe = json.loads(run(["ffprobe", "-v", "error", "-show_entries",
                       "stream=codec_type,width,height,nb_frames,r_frame_rate,sample_rate:format=duration",
                       "-of", "json", str(movie)]).stdout)
receipt = {"role": role, "pictureSha256": lock["pictureSha256"],
           "videoPath": str(movie), "sha256": hashlib.sha256(movie.read_bytes()).hexdigest(),
           "masterPath": str(master), "voicePath": str(args.voice) if args.voice else None,
           "pictureUnchanged": "Video stream copied without re-encoding; verify decoded frame hashes separately.",
           "rawMixLoudness": analysis, "encodedLoudness": final_measure, "probe": probe,
           "cuePlan": lock, "sensoryLimit": "Signal/timing measurements only; founder must actually listen."}
(args.out / f"{role}-mix-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"role": role, "path": str(movie), "sha256": receipt["sha256"],
                  "input_i": final_measure["input_i"], "input_tp": final_measure["input_tp"]}, indent=2))
