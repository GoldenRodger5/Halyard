"""Package only actual full-film mixes into the existing frozen authoring contract."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import shutil
import urllib.parse

parser = argparse.ArgumentParser()
parser.add_argument("--lock", type=Path, required=True)
parser.add_argument("--mixes", type=Path, required=True)
parser.add_argument("--take-receipt", type=Path, required=True)
args = parser.parse_args()
here = Path(__file__).resolve().parent
repo = here.parents[3]
lock = json.loads(args.lock.read_text())
take = json.loads(args.take_receipt.read_text())
sources = json.loads((here / "sources.json").read_text())
assert take["status"] == "complete" and take["measuredCumulativeCredits"] <= 1500
assert take.get("usageProvisional") is False, "Settle the delayed credit counter before final packaging."
assert take["pictureSha256"] == lock["pictureSha256"]
assert take["before"]["max_credit_limit_extension"] == 0
assert take["after"]["max_credit_limit_extension"] == 0
base = json.loads((repo / "packages/marketing/phase2/cinema/product-handoff.json").read_text())
renders = here / "renders"
renders.mkdir(exist_ok=True)
evidence = here / "evidence"
evidence.mkdir(exist_ok=True)
deliverables = []
origin = "Locked Phase 2B picture: existing Google AI hero plus genuine historical RecipeFix pixels; new licensed kitchen effects/music and bounded included-credit ElevenLabs Chris narration where marked."
rights = "Google-generated hero subject to original model terms; first-party RecipeFix UI/historical response; Inter SIL OFL; real kitchen SFX CC0; Dirt Rhodes by Kevin MacLeod CC BY 4.0 with required credit; active Starter commercial TTS rights subject to ElevenLabs terms. No actual cooked or tasted result."
for role, label in [("narration", "Narration-led candidate — founder listening required"),
                    ("sound-only", "Sound-designed comparison — no narration")]:
    receipt = json.loads((args.mixes / f"{role}-mix-receipt.json").read_text())
    assert receipt["pictureSha256"] == lock["pictureSha256"]
    src = Path(receipt["videoPath"])
    assert hashlib.sha256(src.read_bytes()).hexdigest() == receipt["sha256"]
    dst = renders / src.name
    shutil.copy2(src, dst)
    video = next(stream for stream in receipt["probe"]["streams"] if stream["codec_type"] == "video")
    deliverables.append({"label": label, "path": str(dst.relative_to(repo)),
                         "sha256": receipt["sha256"], "width": video["width"],
                         "height": video["height"], "durationSeconds": lock["durationSeconds"],
                         "kind": "video", "origin": origin, "rights": rights,
                         "role": "sound_only" if role == "sound-only" else "narration"})
    shutil.copy2(args.mixes / f"{role}-mix-receipt.json", evidence / f"{role}-mix-receipt.json")
shutil.copy2(args.take_receipt, evidence / "voice-usage.json")
shutil.copy2(args.lock, here / "picture-lock.json")
preferred = copy.deepcopy(deliverables[0])
preferred.pop("label")
preferred.pop("role")
preferred.update(synthetic=True, altText="Two trays of AI-illustrated marinated chicken frame genuine RecipeFix four-to-six serving and Dairy-Free settings, a recorded method change to two sheets and one broiler batch at a time, and the real Make it fit button. Conversational synthetic narration and licensed music/kitchen effects accompany the edit.")
idea = copy.deepcopy(base["ideas"][0])
idea["visibleEvent"] = "Purposeful food match cuts exclude floating-tray movement; genuine four-to-six and Dairy-Free selection leads to the exact recorded two-sheet/one-at-a-time method and a specific Original recipe CTA."
idea["authoringStatus"] = "founder_review"
credit = sources["requiredMusicCredit"]
variants = []
for platform, fmt in [("tiktok", "short_video"), ("instagram", "reel"), ("youtube", "short_video")]:
    ident = f"rf-more-dinner-{platform}-phase2b-vo-v1"
    query = urllib.parse.urlencode({"utm_source": platform, "utm_medium": "social",
                                  "utm_campaign": "rf_first_fortnight", "utm_content": ident})
    caption = ("Two more for dinner. Same broiler.\n\n"
               "In this recorded RecipeFix 4 → 6 Dairy-Free example, the method changes too: "
               "two foil-lined sheets, broiled one at a time, then a sauce finish. "
               "Open Chicken Tikka Masala → Make it fit.\n\n"
               "AI planning illustration, not a cooked result. Historical October 21, 2026 response, "
               "not fresh inference. AI narration.\n\nMusic: " + credit)
    variant = {"id": ident, "ideaId": "rf-more-dinner", "platform": platform, "format": fmt,
               "caption": caption, "media": [copy.deepcopy(preferred)],
               "targetUrl": "https://recipefix.app/original-recipes/chicken-tikka-masala?" + query,
               "cta": "Open Chicken Tikka Masala → Make it fit. Profile-link placement is unverified.",
               "disclosure": "AI planning illustration, not a kitchen test or cooked/tasted result. Genuine historical combined Dairy-Free and 4 → 6 response, October 21, 2026, not fresh inference. Synthetic Chris narration. Generated hero native 720×1280 inside 1080×1920 edit. Founder has not listened or approved; account and publication details remain deferred.",
               "sourceUrls": idea["sourceUrls"] + [source["page"] for source in sources["sources"]
                                                    if source.get("includedInFinalMix")]}
    if platform == "youtube":
        variant["title"] = "Two more for dinner? The plan changes too | RecipeFix"
    variants.append(variant)
handoff = {"ideas": [idea], "variants": variants, "newParentIdeas": 0,
           "parentNote": "Finishing variants of existing rf-more-dinner; comparisons are not extra ideas.",
           "preferredAudio": "Narration is the typed candidate only, provisional pending founder listening.",
           "narration": {"script": lock["script"], "voice": "Chris - Charming, Down-to-Earth",
                         "voiceId": take["voiceId"], "modelId": take["request"]["model_id"],
                         "usageReceipt": str((evidence / "voice-usage.json").relative_to(repo))},
           "pictureSha256": lock["pictureSha256"], "pictureSource": lock.get("pictureRepositoryPath"),
           "audioReview": "unverified: founder must listen for naturalness, pronunciation and musical taste",
           "founderDecision": "unreviewed", "additionalCashUSD": 0,
           "includedCreditsUsed": take["measuredCumulativeCredits"],
           "sources": "packages/marketing/phase2b/audio/sources.json"}
alignment = json.loads((evidence / "provider-alignment.json").read_text())
alignment = alignment.get("normalized_alignment") or alignment["alignment"]
spoken = "".join(alignment["characters"])
segments = []
vtt = ["WEBVTT", ""]


def stamp(seconds):
    ms = round(seconds * 1000)
    return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}"


for index, phrase in enumerate(re.findall(r"[^?!.:]+[?!.:]?", spoken), 1):
    phrase = phrase.strip()
    start = spoken.index(phrase)
    begin = alignment["character_start_times_seconds"][start] + lock["voiceAtSeconds"]
    end = alignment["character_end_times_seconds"][start + len(phrase) - 1] + lock["voiceAtSeconds"]
    segments.append({"text": phrase, "startSeconds": begin, "endSeconds": end})
    vtt += [str(index), stamp(begin) + " --> " + stamp(end), phrase, ""]
(here / "narration.vtt").write_text("\n".join(vtt))
(evidence / "phrase-timing.json").write_text(json.dumps({
    "source": "Provider-estimated alignment of requested text, not an independent auditory transcript. Whole take delayed 0.9 seconds without splicing or speed change.",
    "segments": segments,
}, indent=2) + "\n")
handoff["narration"].update(captionPath="packages/marketing/phase2b/audio/narration.vtt",
                            timingReceipt="packages/marketing/phase2b/audio/evidence/phrase-timing.json")
handoff["creditFinalReceipt"] = "packages/marketing/phase2b/audio/entitlement-final.json"
handoff["creditAccounting"] = "One full-script request. Immediate account counter lagged; delayed and final snapshots show 66 included credits consumed, 32,047 remaining. No new cash charge, overage, top-up or subscription change."
(here / "handoff.json").write_text(json.dumps(handoff, indent=2, ensure_ascii=False) + "\n")
(here / "deliverables.json").write_text(json.dumps(deliverables, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({"handoff": str(here / "handoff.json"), "fullFilms": len(deliverables),
                  "variants": len(variants), "newParentIdeas": 0}, indent=2))
