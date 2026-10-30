"""One explicitly locked full-script take; no automatic retries or voice creation."""
import argparse
import base64
import datetime
import hashlib
import json
from pathlib import Path
import urllib.error
import urllib.request


parser = argparse.ArgumentParser()
parser.add_argument("--lock", type=Path, required=True)
parser.add_argument("--out", type=Path, required=True)
parser.add_argument("--env-file", type=Path, required=True)
args = parser.parse_args()
lock = json.loads(args.lock.read_text())
assert lock.get("pictureLocked") is True, "Picture/script must be explicitly locked."
picture = Path(lock["picturePath"])
assert hashlib.sha256(picture.read_bytes()).hexdigest() == lock["pictureSha256"]
text = lock["script"].strip()
assert 80 <= len(text) <= 500, "Only one bounded full short-film script is allowed."
assert lock["voiceId"] == "iP95p4xoKVk53GoZ742B", "One selected premade Chris voice only."
assert lock["modelId"] == "eleven_v4", "Use the verified 1.0-cost-factor model."
args.out.mkdir(parents=True, exist_ok=True)

key = None
for line in args.env_file.read_text().splitlines():
    if not line.lstrip().startswith("#") and "=" in line:
        name, value = line.split("=", 1)
        if name.strip() in ("ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY", "ELEVEN_API_KEY"):
            key = value.strip().strip('"').strip("'")
            break
assert key, "Expected key was not found; no request sent."


def request(route, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        "https://api.elevenlabs.io" + route,
        data=data,
        headers={"xi-api-key": key, "Content-Type": "application/json"},
    )
    # urllib makes one attempt; no retry loop or key material is logged.
    with urllib.request.urlopen(req, timeout=90) as response:
        return json.load(response), response.headers


def sanitize(sub):
    fields = ("tier", "status", "character_count", "character_limit",
              "can_extend_character_limit", "max_credit_limit_extension")
    result = {field: sub.get(field) for field in fields}
    result["includedRemaining"] = sub["character_limit"] - sub["character_count"]
    return result


previous = sorted(args.out.glob("take-*-receipt.json"))
assert len(previous) < 2, "Maximum two full-script takes."
old = [json.loads(path.read_text()) for path in previous]
assert all(item.get("status") == "complete" for item in old), "An uncertain/failed take is not retried."
before, _ = request("/v1/user/subscription")
before = sanitize(before)
assert before["tier"] == "starter" and before["status"] == "active"
assert before["can_extend_character_limit"] is False
assert before["max_credit_limit_extension"] == 0, "Usage-based overage must remain disabled."
assert before["includedRemaining"] >= 1500
baseline = old[0]["baselineCharacterCount"] if old else before["character_count"]
used = before["character_count"] - baseline
assert 0 <= used and used + len(text) <= 1500, "Cumulative included-credit cap would be exceeded."
models, _ = request("/v1/models")
model = next(model for model in models if model["model_id"] == lock["modelId"])
assert model.get("can_do_text_to_speech") and model.get("token_cost_factor") == 1.0

number = len(previous) + 1
payload = {"text": text, "model_id": lock["modelId"], "seed": 17482 + number,
           "voice_settings": {"stability": 0.5, "speed": 1.0}}
receipt = {
    "status": "submitted-outcome-unconfirmed", "take": number,
    "baselineCharacterCount": baseline, "before": before,
    "estimatedCredits": len(text), "capIncludedCredits": 1500,
    "voiceId": lock["voiceId"], "request": payload,
    "pictureSha256": lock["pictureSha256"],
    "submittedAtUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "additionalCashAuthorizedUSD": 0,
}
receipt_path = args.out / f"take-{number}-receipt.json"
receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
try:
    result, headers = request(
        f"/v1/text-to-speech/{lock['voiceId']}/with-timestamps?output_format=mp3_44100_128",
        payload,
    )
except urllib.error.HTTPError as error:
    receipt.update(status="failed-no-retry", httpStatus=error.code)
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    raise SystemExit(f"Voice endpoint returned HTTP {error.code}; stopped without retry.")

audio = base64.b64decode(result["audio_base64"])
audio_path = args.out / f"take-{number}.mp3"
audio_path.write_bytes(audio)
alignment_path = args.out / f"take-{number}-alignment.json"
alignment_path.write_text(json.dumps({
    "alignment": result.get("alignment"),
    "normalized_alignment": result.get("normalized_alignment"),
}, indent=2) + "\n")
after, _ = request("/v1/user/subscription")
after = sanitize(after)
receipt.update(status="complete", after=after,
               measuredTakeCredits=after["character_count"] - before["character_count"],
               measuredCumulativeCredits=after["character_count"] - baseline,
               audioSha256=hashlib.sha256(audio).hexdigest(),
               audioPath=str(audio_path), alignmentPath=str(alignment_path),
               requestId=headers.get("request-id") or headers.get("x-request-id"))
receipt["usageProvisional"] = True
receipt["creditAccountingNote"] = (
    "Immediate account counters can lag. Verify a later settled count/guard before packaging; "
    "zero immediate delta does not establish zero metered usage."
)
receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
assert receipt["measuredCumulativeCredits"] <= 1500, "Stop: usage exceeds expected cap."
print(json.dumps({field: receipt[field] for field in (
    "status", "take", "measuredTakeCredits", "measuredCumulativeCredits", "audioSha256")
}, indent=2))
