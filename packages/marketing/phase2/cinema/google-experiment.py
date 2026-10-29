"""One bounded Google image/motion experiment. Default is a non-billing plan.

Run images and video separately so actual style frames are inspected first.
Credentials are read from an explicitly supplied existing env file, never copied.
No dependency install, retry loop, daemon, SDK or publishing integration.
"""
import argparse
import base64
import hashlib
import json
import pathlib
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

IMAGE_MODEL = 'gemini-nano-banana-2.1'
VIDEO_MODEL = 'gemini-omni-1.1-flash'
BASE = 'https://generativelanguage.googleapis.com/v1beta/'
RESERVES = {'image-1': .21, 'image-2': .21, 'video-1': .90}
PROMPTS = [
 '''Vertical9:16 photorealistic cinematic food-planning illustration. Macro three-quarter view of a real metal foil-lined baking sheet holding irregular richly red-spice-marinated chicken pieces with visible moist fibers, slightly varied natural shapes, believable scale and crinkled reflective foil. The sheet is uncrowded. A second identical prepared sheet is waiting beside it; a compact single upper broiler chamber is visible behind. Cool slate countertop, warm upper light, richly tactile commercial food cinematography. Frame the first sheet nearest camera and allow a clear path into one chamber. No hands, faces, printed labels, logos, text, glass cookware, cartoon shapes, smoke, or cooked-result claim. The chicken keeps its marinated appearance, with no cooked-color transformation. This is a generated planning illustration, not a performed cooking test.''',
 '''Use the supplied image as the exact continuity reference. Same kitchen, sheets, food, lighting and camera axis. Pull back enough to show the first sheet positioned inside the single upper broiler chamber and the second sheet still waiting clearly outside beside it with an obvious gap. Preserve the same plausible cookware and food appearance, no new objects or duplicated pieces, no hands or faces. Photorealistic cinematic materials, natural irregular marinated chicken fibers and rich red spice, no primitive nuggets. No text, labels, smoke or cooked-color change. Illustrative planning, not a measured or physically cooked result.'''
]
MOTION = '''Use the supplied image as the exact first frame and continuity reference. One continuous six-second photorealistic food-planning shot. The foreground foil-lined sheet slides smoothly toward and into the single upper broiler chamber. The camera retreats gently only as needed to show the chamber opening and the second prepared sheet waiting outside. Keep the exact chicken pieces, spacing and marinated appearance attached to their own sheets. The second sheet remains stationary. No food teleportation, duplication, rearrangement, darkening, browning, cooking transformation, object intersection, morphing cookware or artificial melting. Believable physical clearance, controlled camera, tactile food fibers and crinkled foil, same warm/cool lighting. No hands, faces, typography, dialogue, narrator, music or extra sound effects. Do not add a cooked-color endpoint or imply a six-second cooking result. This is generated planning illustration, not evidence of a cooking test.'''

def save(file, data):
    file.write_text(json.dumps(data, indent=2) + '\n')

def check_output(root):
    disk = subprocess.check_output(['diskutil', 'info', '/Volumes/T9'], text=True)
    if 'B1ADFFB0-BCCF-441A-8086-365120C88DB7' not in disk or 'FileVault:                Yes' not in disk:
        import re
        if 'B1ADFFB0-BCCF-441A-8086-365120C88DB7' not in disk or not re.search(r'FileVault:\s+Yes', disk):
            raise RuntimeError('Verified encrypted T9 required')
    if not root.resolve().is_relative_to(pathlib.Path('/Volumes/T9')):
        raise RuntimeError('Experiment output must remain on T9')
    root.mkdir(parents=True, exist_ok=True)

def load_key(file):
    for line in file.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            name, value = line.split('=', 1)
            if name.strip().removeprefix('export ') == 'GEMINI_API_KEY':
                return value.strip().strip('"').strip("'")
    raise RuntimeError('GEMINI_API_KEY missing from the supplied existing env file')

def request(key, endpoint, body=None):
    payload = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + endpoint, data=payload, headers={'x-goog-api-key': key, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=55) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Keep only sanitized diagnostic text, never credentials or payloads.
        message = ''
        try:
            info = json.loads(error.read()).get('error', {})
            message = str(info.get('message', '')) if isinstance(info, dict) else str(info)
            message = re.sub(r'https?://\S+', '[URL]', message.replace(key, '[REDACTED]'))
            message = re.sub(r'\b\d{6,}\b', '[ID]', message)[:350]
        except Exception:
            pass
        raise RuntimeError('Provider HTTP status ' + str(error.code) + '; no retry. ' + message) from None

def execute(key, root, name, endpoint, body, cap):
    receipt = root / (name + '-receipt.json')
    if receipt.exists():
        raise RuntimeError(name + ' already attempted; preserve and inspect its receipt')
    prior = [json.loads(p.read_text()) for p in root.glob('*-receipt.json')]
    reserved = sum(r['reservedUSD'] for r in prior) + RESERVES[name]
    if reserved > cap:
        raise RuntimeError('Conservative reserved budget exceeds the authorized cap')
    record = {'name':name, 'model':body['model'] if 'model' in body else IMAGE_MODEL, 'reservedUSD':RESERVES[name], 'budgetCeilingUSD':cap, 'state':'submitting', 'submittedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'automaticRetry':False}
    save(receipt, record)
    try:
        response = request(key, endpoint, body)
        if 'id' in response:
            record['interactionId'] = response['id']
            save(receipt, record)
        deadline = time.monotonic() + 600
        while response.get('status') in ('in_progress', 'pending'):
            if time.monotonic() > deadline:
                raise RuntimeError('Job remains pending; inspect saved interaction ID, do not resubmit')
            time.sleep(5)
            response = request(key, 'interactions/' + urllib.parse.quote(record['interactionId'], safe=''))
        record['state'] = response.get('status', 'responded')
        record['usage'] = response.get('usage', response.get('usageMetadata'))
        outputs = []
        parts = [p for c in response.get('candidates', []) for p in c.get('content', {}).get('parts', [])]
        parts += [p for step in response.get('steps', []) if step.get('type') == 'model_output' for p in step.get('content', [])]
        for part in parts:
            if part.get('thought'):
                continue
            inline = part.get('inlineData', part.get('inline_data', {}))
            data = inline.get('data') or (part.get('data') if part.get('type') in ('video', 'image') else None)
            if not data:
                continue
            mime = inline.get('mimeType', inline.get('mime_type')) or part.get('mime_type')
            ext = {'image/png':'.png', 'image/jpeg':'.jpg', 'video/mp4':'.mp4'}.get(mime)
            if not ext:
                continue
            file = root / (name + ext)
            if file.exists():
                raise RuntimeError('Unexpected extra output; inspect provider response before proceeding')
            file.write_bytes(base64.b64decode(data))
            outputs.append({'file':file.name, 'mime':mime, 'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
        record['outputs'] = outputs
        if len(outputs) != 1:
            raise RuntimeError('Expected exactly one inline media output; stop and inspect ID/status')
        record['state'] = 'completed'
        save(receipt, record)
        print(json.dumps({'name':name, 'state':'completed', 'output':outputs[0]}, indent=2), flush=True)
        return root / outputs[0]['file'], outputs[0]['mime']
    except Exception as error:
        record['state'] = 'stopped'
        record['errorType'] = type(error).__name__
        record['error'] = str(error).replace(key, '[REDACTED]')[:220]
        record['billingStatus'] = 'Not verified; a timeout is not proof no job was submitted'
        save(receipt, record)
        raise

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['plan', 'images', 'video'], default='plan', nargs='?')
    parser.add_argument('--env-file', type=pathlib.Path)
    parser.add_argument('--out', type=pathlib.Path, default=pathlib.Path('/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/integration/cinema/google-pilot'))
    parser.add_argument('--authorized-cap-usd', type=float, default=0)
    args = parser.parse_args()
    if args.mode == 'plan':
        print(json.dumps({'imageModel':IMAGE_MODEL, 'videoModel':VIDEO_MODEL, 'outputsMaximum':3, 'conservativeReservationsUSD':RESERVES, 'sumReservedUSD':sum(RESERVES.values()), 'approvalRequired':True, 'voices':'held', 'generationCalls':0}, indent=2))
        return
    if not args.env_file or args.authorized_cap_usd != 2:
        raise RuntimeError('Explicit existing env file and separately authorized $2 ceiling required')
    check_output(args.out)
    key = load_key(args.env_file)
    if args.mode == 'images':
        first = None
        for i, prompt in enumerate(PROMPTS, 1):
            parts = []
            if first:
                file, mime = first
                parts.append({'inlineData':{'mimeType':mime, 'data':base64.b64encode(file.read_bytes()).decode()}})
            parts.append({'text':prompt})
            body = {'contents':[{'role':'user','parts':parts}], 'generationConfig':{'candidateCount':1,'maxOutputTokens':6144,'responseModalities':['IMAGE'],'imageConfig':{'aspectRatio':'9:16','imageSize':'1K'}}}
            first = execute(key,args.out,'image-'+str(i),'models/'+IMAGE_MODEL+':generateContent',body,args.authorized_cap_usd)
        print('STOP: inspect both actual style frames before invoking video mode.', flush=True)
    else:
        inputs = []
        for i in (1, 2):
            receipt = json.loads((args.out/('image-'+str(i)+'-receipt.json')).read_text())
            if receipt['state'] != 'completed':
                raise RuntimeError('Both actual style frames must have completed and been reviewed')
            asset = receipt['outputs'][0]
            file = args.out / asset['file']
            if hashlib.sha256(file.read_bytes()).hexdigest() != asset['sha256']:
                raise RuntimeError('Changed style frame')
            # The independent still gate rejected image2 as an exact endpoint:
            # its food state/layout differs. Inspect both; condition on image1 only.
            if i == 1:
                inputs.append({'type':'image','data':base64.b64encode(file.read_bytes()).decode(),'mime_type':asset['mime']})
        inputs.append({'type':'text','text':MOTION})
        body = {'model':VIDEO_MODEL,'input':inputs,'background':True,'store':True,'generation_config':{'max_output_tokens':45000,'video_config':{'task':'image_to_video'}},'response_format':{'type':'video','aspect_ratio':'9:16','resolution':'720p','duration':'6s','delivery':'inline'}}
        execute(key,args.out,'video-1','interactions',body,args.authorized_cap_usd)

if __name__ == '__main__':
    main()
