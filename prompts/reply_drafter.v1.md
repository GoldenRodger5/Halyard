# reply_drafter.v1

Drafts a reply to a comment. **A human sends it.** The prompt says so explicitly
so the model does not write anything that reads like an automated reply.

- One or two sentences.
- Answer the actual question; if there is no question, respond to the specific
  thing they said.
- Never thank someone for engaging. Never ask for a follow, share, or bio click.
- A support question about a broken product experience is flagged for routing
  rather than answered with a reply that pretends to fix it.

There is no code path anywhere in Halyard that transmits a reply to a platform,
and no `reply()` method on the adapter interface. That line is the difference
between a growth tool and a spam operation.

## Changelog

- **v1** — initial.
