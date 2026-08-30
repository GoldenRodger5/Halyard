# The screenplay layer

**Status:** built and tested end to end on two products. Not yet consumed by the
render path — see *What is left* at the bottom.

## The problem it solves

Halyard has seventeen content agents. Every one answers a narrow question in
isolation: the copywriter writes a caption, the VO scriptwriter writes what is
said, the visual director picks a language, the motion director picks movement,
the music director picks a bed, the annotation director places marks.

**Nothing held the piece in mind at once.**

The result is visible in the output and was diagnosed by an operator watching
it: the pieces are *correct* and they are not *composed*. A quiz reveal and a
quiz question get the same motion because the motion director was never told
which is which. A mark appears where a capture happened to record a tap rather
than where the piece wants the eye. The bed enters at zero because nobody said
when it should.

`HALYARD_CREATIVE_GAP_AUDIT.md` §7 named this before it was built:

> The missing structural layers are concept, **storyboard**, music/sound, rich
> visual direction, and platform-specific editing. Beats currently live inside
> `renders.input_props`; concepts and creative briefs are not first-class
> entities.

## What a screenplay is

A play's script is not only its dialogue. It is dialogue **plus stage
directions** — who moves, what the lighting does, where the audience looks.
That is exactly the missing half.

A `Scene` carries, together:

| Field | What it is |
|---|---|
| `spoken` | What the voice says, verbatim. Null for a silent scene. |
| `onScreen` | What the viewer *reads*. Rarely the same words. |
| `direction` | What is happening, in prose, for a person to read. |
| `ground` | footage · photograph · colour · product_capture |
| `groundSubject` | What the ground is *of*, in the piece's words |
| `move` | hold · push_in · drift · cut · settle |
| `gestures` | Marks, each with a target, a time, and why now |
| `score` | enter · duck · lift · drop_out · hold |
| `weight` | lead · support · aside — the emphasis hierarchy |
| `seconds` | How long it holds |

`spoken` and `onScreen` being separate fields is deliberate and is the single
most important line in the format. A viewer reads four words and hears fourteen.
Putting the same sentence in both is a caption read aloud, which is the clearest
sign a machine made the video.

## How it inverts the pipeline

**Before:** each director decides independently; the render is whatever falls
out.

**After:** the screenplay says *"this beat is the turn, hold it, mark the
swapped row, let the bed lift"*, and the motion, annotation and music directors
**execute** that within their own rules.

That inversion is the point. A committee of specialists with no director
produces competent, uncomposed work — which is precisely what the output looked
like.

## The line that keeps it honest

The screenplay is **written by a model**, because deciding that a moment
deserves a gesture is a judgement about rhythm and attention that no arithmetic
reaches.

Every direction is then **checked against what can actually be executed**
(`checkScreenplay`), and the refusals are all feasibility, never taste:

- `no_lead` — nothing is weighted `lead`, so nothing in the piece is the point
- `line_will_not_fit` — the spoken line needs more seconds than its scene holds
- `no_footage` — a scene calls for product capture and none exists (§163)
- `gesture_unlocatable` — a mark on a region the frame cannot find (§331)
- `gesture_after_scene` — a mark past the end of its own scene
- `too_many_gestures` — two at once already point at neither (§319)
- `too_long` / `too_short` — the channel has no room for it

**The model directs. The code decides whether the direction is producible.**

## Repair before refusal

The first real screenplay was refused on **every scene**: each spoken line
needed more seconds than the scene it sat in. That is the right refusal and the
wrong place to stop — the writing was good and only the arithmetic was wrong.

`fitScreenplay` lengthens a scene to hold what is said over it, and reports every
change. **It never shortens a line.** Trimming words to fit a duration is editing
the script to suit a number nobody chose deliberately: a scene length is a
guess, a sentence is a decision.

If the repaired total exceeds the channel's ceiling, that is a real refusal —
the piece has more to say than the channel allows, and the answer is fewer
scenes, which is a writing decision.

## It works for a product it has never seen

The same agent, the same code, two products:

    kinolog    precise — a near-black ground with Bricolage Grotesque,
               so marks are geometric
    recipefix  drawn — Instrument Serif on a light ground is an editorial
               register, so a drawn mark belongs there

The register is *derived* from the brand §323 reads out of the product's own
stylesheet, not configured per product. A third product attached tomorrow gets a
coherent pack without anybody choosing one.

Kinolog's screenplay uses Kinolog's own vocabulary — *vibes*, *asks*, *honest
watch dates* — because the screenwriter is given the Brain's facts rather than a
summary, and the guidance requires the product's own words.

Saved for reading:

- `docs/screenplay-kinolog-quiz.txt`
- `docs/screenplay-recipefix-history.txt`

## How to read a screenplay

`printScreenplay` lays it out as a shooting script, because that format solves
this exact problem and has for a century: scene heading, direction in prose,
dialogue indented under it.

    01. HOOK — lead — 0.0s to 6.0s
        A dark, quiet quiz card fills the frame. The title lands first, then
        the number of questions appears underneath. The music enters as a
        clean pulse, curious but restrained.
        [ground: the brand ground · move: hold · score: enter]

            ON SCREEN:  TASTE CHECK
            ON SCREEN:  3 QUESTIONS

                  VOICE
            Quick quiz: do you know your film taste, or only
            your last mood?

A screenplay held only as an object is a screenplay nobody reviews, and the
review is the point: it is far cheaper to fix a piece here than after it has
been synthesised, rendered and watched.

## What is left

1. **The render path does not consume a screenplay yet.** `generate.ts` still
   builds beats directly. The screenplay has to become the input to
   `videoForFormat` rather than a parallel description of the same piece.
2. **The directors do not read it.** Motion, annotation and music still decide
   independently; they need to take their instruction from the scene.
3. **Gestures need locatable regions.** Today only a capture supplies them
   (§324). A typographic piece has no locatable targets, so it can have no
   gestures — which is correct but limiting: a word in a caption has a position
   and could be one.
4. **No iteration loop yet.** A refused screenplay is reported, not re-requested
   with its problems attached.
