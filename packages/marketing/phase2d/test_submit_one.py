"""Financial/duplicate-call guards, all using fake transport and temporary local files."""
import importlib.util
import sys
sys.dont_write_bytecode = True
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import datetime

SPEC = importlib.util.spec_from_file_location('action', Path(__file__).with_name('submit_one.py'))
action = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(action)


class SpendingGuards(unittest.TestCase):
    def setUp(self):
        # Test financial/duplicate-call behavior without depending on today's date.
        real_datetime = datetime.datetime
        checks = [json.loads((action.HERE / name).read_text()) for name in
                  ['model-preflight.json', 'token-preflight.json', 'pricing-preflight.json']]
        fresh = max(real_datetime.fromisoformat(c.get('checkedAtUTC', c.get('verifiedAtUTC'))) for c in checks)
        clock = patch.object(action.datetime, 'datetime', wraps=real_datetime)
        self.addCleanup(clock.stop)
        mocked_clock = clock.start()
        mocked_clock.now.return_value = fresh + datetime.timedelta(seconds=1)

    def test_no_approval_never_calls_provider(self):
        with patch.object(action.legacy, 'load_key') as key, patch.object(action.legacy, 'request') as post:
            with self.assertRaises(RuntimeError):
                action.submit(None, 'not-read.env')
            key.assert_not_called()
            post.assert_not_called()

    def test_drifted_hash_is_not_approval(self):
        with self.assertRaises(RuntimeError):
            action.check_approval({'approvedBy': 'founder', 'requestPlanSha256': 'changed', 'hardCapUSD': 1, 'requestLimit': 1}, 'exact')

    def test_larger_budget_is_not_approval(self):
        with self.assertRaises(RuntimeError):
            action.check_approval({'approvedBy': 'founder', 'requestPlanSha256': 'exact', 'hardCapUSD': 2, 'requestLimit': 1}, 'exact')

    def test_second_post_is_blocked_after_success_or_unknown_outcome(self):
        for fail in [False, True]:
            with self.subTest(fail=fail), tempfile.TemporaryDirectory(dir='/Volumes/T9/Developer/Builds/recipefix-phase2d-20261029/scratch') as temp:
                out = Path(temp)
                calls = []
                def fake(_key, _endpoint, _body):
                    calls.append('POST')
                    if fail:
                        raise TimeoutError('Unknown outcome')
                    return {'id': 'fake-local-id', 'status': 'in_progress'}
                digest = action.prepared()[2]
                approval = {'approvedBy': 'founder', 'requestPlanSha256': digest, 'hardCapUSD': 1, 'requestLimit': 1}
                with patch.object(action, 'OUT', out), patch.object(action.legacy, 'check_output'), patch.object(action.legacy, 'load_key', return_value='fake-test-key'):
                    if fail:
                        with self.assertRaises(TimeoutError):
                            action.submit(approval, 'unused.env', fake)
                    else:
                        action.submit(approval, 'unused.env', fake)
                    with self.assertRaises(FileExistsError):
                        action.submit(approval, 'unused.env', fake)
                    self.assertEqual(calls, ['POST'])
                    self.assertTrue(json.loads((out / 'one-attempt.json').read_text())['automaticRetry'] is False)


if __name__ == '__main__':
    unittest.main()
