"""One prospective action request. Default is offline plan; founder approval is separate."""
import argparse
import sys
sys.dont_write_bytecode = True
import base64
import datetime
from decimal import Decimal
import hashlib
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = Path('/Volumes/T9/Developer/Builds/recipefix-phase2d-20261029/generation')
SPEC = importlib.util.spec_from_file_location('inherited_google', ROOT / 'packages/marketing/phase2/cinema/google-experiment.py')
legacy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(legacy)


def prepared():
    raw = (HERE / 'request-plan.json').read_bytes()
    plan = json.loads(raw)
    reference = (ROOT / plan['reference']['path']).read_bytes()
    if hashlib.sha256(reference).hexdigest() != plan['reference']['sha256']:
        raise RuntimeError('Reference drift; no request')
    digest = hashlib.sha256(raw).hexdigest()
    tokens = json.loads((HERE / 'token-preflight.json').read_text())
    model = json.loads((HERE / 'model-preflight.json').read_text())
    pricing = json.loads((HERE / 'pricing-preflight.json').read_text())
    if tokens['httpStatus'] != 200 or tokens['requestPlanSha256'] != digest:
        raise RuntimeError('Exact tokenizer preflight missing/stale for this request')
    if model['httpStatus'] != 200 or model['metadata']['name'] != 'models/gemini-omni-1.1-flash':
        raise RuntimeError('Model access unverified')
    if (pricing['model'] != 'gemini-omni-1.1-flash' or pricing['inputUSDPerMillion'] != 1.5
            or pricing['highestOutputUSDPerMillion'] != 17.5 or pricing['maxOutputTokensIncludesThoughts'] is not True):
        raise RuntimeError('Pricing or output-limit authority changed; no request')
    count = tokens['tokenizerResponse']['totalTokens']
    # Twice the exact token count plus envelope allowance must fit the reserve.
    if 2 * count + 1024 > 20000:
        raise RuntimeError('Counted input exceeds conservative reserve')
    body = plan['body']
    if body['model'] != 'gemini-omni-1.1-flash' or body['generation_config']['max_output_tokens'] != 40000:
        raise RuntimeError('Model/output ceiling changed')
    if body['response_format'] != {'type': 'video', 'aspect_ratio': '9:16', 'resolution': '720p', 'duration': '6s', 'delivery': 'inline'}:
        raise RuntimeError('Output scope changed')
    if body.get('tools') or body.get('previous_interaction_id') or plan['requestLimit'] != 1 or plan['automaticRetries'] != 0:
        raise RuntimeError('No tools, history, additional candidates or retries permitted')
    maximum = Decimal(40000) * Decimal('17.50') / 1000000 + Decimal(20000) * Decimal('1.50') / 1000000
    if maximum > Decimal('1') or Decimal(str(plan['budgetCapUSD'])) != Decimal('1'):
        raise RuntimeError('One-dollar budget cannot be established')
    for receipt in [tokens, model]:
        checked = datetime.datetime.fromisoformat(receipt['checkedAtUTC'])
        if (datetime.datetime.now(datetime.timezone.utc) - checked).total_seconds() > 86400:
            raise RuntimeError('Refresh read-only availability/token/pricing preflight first')
    if (datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(pricing['verifiedAtUTC'])).total_seconds() > 86400:
        raise RuntimeError('Refresh primary pricing before spending')
    body['input'][1]['data'] = base64.b64encode(reference).decode()
    return plan, body, digest, maximum


def check_approval(approval, digest):
    if not approval or approval.get('approvedBy') != 'founder':
        raise RuntimeError('Separate explicit founder approval is required; no request')
    if approval.get('requestPlanSha256') != digest or approval.get('requestLimit') != 1:
        raise RuntimeError('Approval does not bind this exact one-shot request')
    if Decimal(str(approval.get('hardCapUSD', 0))) != Decimal('1'):
        raise RuntimeError('Approval must cap total spend at one dollar')


def submit(approval, env_file, transport=None):
    plan, body, digest, maximum = prepared()
    check_approval(approval, digest)
    # No credential read or provider request occurs before all approval/budget gates.
    legacy.check_output(OUT)
    marker = OUT / 'one-attempt.json'
    key = legacy.load_key(Path(env_file))
    record = {'state': 'submitted-outcome-unconfirmed', 'requestPlanSha256': digest,
              'reservedUSD': 1, 'modeledMaximumUSD': str(maximum), 'generationRequestLimit': 1,
              'automaticRetry': False, 'submittedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    # Exclusive creation prevents a second submission, even after an unknown/error outcome.
    with marker.open('x') as handle:
        json.dump(record, handle, indent=2)
    try:
        response = (transport or legacy.request)(key, 'interactions', body)
        (OUT / 'initial-provider-response.json').write_text(json.dumps(response) + '\n')
        record.update(state=response.get('status', 'responded'), interactionId=response.get('id'),
                      usage=response.get('usage', response.get('usageMetadata')))
    except Exception:
        record['state'] = 'failed-or-uncertain-stop-no-retry'
        marker.write_text(json.dumps(record, indent=2) + '\n')
        raise
    marker.write_text(json.dumps(record, indent=2) + '\n')
    return record


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--approval-file', type=Path)
    parser.add_argument('--env-file', type=Path)
    args = parser.parse_args()
    plan, _body, digest, maximum = prepared()
    if args.approval_file is None:
        print(json.dumps({'mode': 'offline-plan', 'requestPlanSha256': digest,
                          'modeledMaximumUSD': str(maximum), 'budgetCapUSD': 1,
                          'separateFounderApprovalReceived': False, 'generationRequestsSent': 0}))
    else:
        if args.env_file is None:
            raise SystemExit('Explicit existing credential source required; no request')
        approval = json.loads(args.approval_file.read_text())
        print(json.dumps(submit(approval, args.env_file)))
