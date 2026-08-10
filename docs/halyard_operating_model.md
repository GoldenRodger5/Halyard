# Halyard — Operating Model

Canonical. Where any other document's language about autonomy, automation, or approval
conflicts with this one, this wins.

---

## 1. The autonomy contract

**Halyard is autonomous up to the point of publication, and never past it.**

That sentence is doing precise work. It does not mean "mostly automated with a checkbox at
the end." It means:

| Halyard owns, completely | I own, exclusively |
|---|---|
| Research and signal collection | Judgment |
| Idea generation and ranking | Opinion |
| Copywriting, per format | Approval |
| Rendering images, video, audio | The decision to publish |
| Fact-checking and validation | |
| Quality control, all four gates | |
| Scheduling, staggering, slot resolution | |
| Publishing mechanics, once approved | |
| Metrics collection and analysis | |

**Everything arrives finished.** A draft in my queue is a publishable artifact, not a
prompt for me to complete. If a piece of content needs more work before it could go out,
it should not be in the queue — it should be in a failure state with a reason.

**Nothing publishes without an explicit human action.** No timer, no threshold, no
confidence score, no "approve all" that quietly extends to future items. Approval is a
per-item act.

## 2. Two gate types

Content falls into one of two workflows. Confusing them is the main way this design gets
built wrong.

### Approval-gated — most content

The system has everything it needs. It generates a finished artifact and I say yes or no.

Applies to: all brand content, product transformations, education, community prompts,
shipped-feature posts, repurposed winners.

My input is a decision. If I approve without editing, that is a success, not a shortcut.

### Input-gated — founder opinion content

The system does **not** have what it needs, because what it needs is my opinion, and it
does not have one. Generating a take without me is fabrication.

Applies to: news commentary, hot takes, tools and finds, anything where the value is a
point of view.

The system asks a **narrow question** — "here are five stories, what do you think about
one of them?" — and I answer in a sentence. Then it does everything else: verifies my
claim, strengthens it, drafts it, renders it, and hands it back finished.

**The system must never synthesise an opinion I did not express.** If I skip a day, no
opinion content goes out. That is correct behaviour, not a gap.

## 3. What "my feedback" means as a system input

Feedback is not just approve or reject. Every interaction is training signal, and the
system should treat it that way:

| My action | What the system does with it |
|---|---|
| Approve unedited | Reinforces the pattern. Hook and structure enter the proven library |
| Edit before approving | Diff is stored. Repeated edits of the same kind become a voice-config change, surfaced to me |
| Reject with a reason | Becomes a negative example in the copywriter prompt, and a slop-filter candidate |
| Regenerate with a note | The note goes into the prompt, not a blind retry |
| Pick hook variant 3 of 5 | That hook type gains weight for this format and category |
| One-line take on a story | Becomes the seed and the constraint for the whole post |

After ten rejections in a category, the system should tell me what my rejections have in
common. My taste should become legible to me, not just to it.

## 4. What is never automated

Fixed, and enforced in code rather than policy:

- Publishing without approval
- Replying to comments or DMs — Halyard drafts, I send. There is no `reply()` method on
  the adapter interface, and a test asserts its absence
- Following, unfollowing, or any engagement action
- Generating an opinion I did not express
- Posting anything with an unverified factual claim
- Anything that inflates a metric

## 5. The failure mode this protects against

The risk is not that Halyard posts something bad. Approval catches that.

The risk is that Halyard produces so much competent, on-brand, correctly-formatted content
that reviewing it becomes rubber-stamping, and the account fills with things that are fine
and forgettable. Volume without a point of view.

Three defences, all built in:

1. **The queue must stay small enough to actually read.** Better six items I consider than
   twenty I skim.
2. **QC failures never reach me.** If the queue contains things I would obviously reject,
   I stop reading carefully.
3. **Opinion content is input-gated.** The part of the feed that carries personality
   cannot be generated without me, by design.
