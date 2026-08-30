/**
 * §358. What a format lets an operator choose.
 *
 * The wizard asked five questions and then stopped: platform, post type,
 * together, format, and a free-text subject. Everything else — which quiz
 * template, how many questions, whether the questions are multiple choice,
 * whether there is a voice at all — was decided inside the pipeline and could
 * not be influenced.
 *
 * Those decisions are all *good* ones. §302 picks a quiz template by fit and
 * recency, §300 picks a question kind from the shape of the answer, §221 picks
 * a bed. But an operator who wants the rail layout, or a silent cut, or five
 * questions instead of three, has no way to say so — and "the system chose
 * well" is not the same as "the person got what they wanted".
 *
 * ## Auto is a real choice, and it is the default
 *
 * Every option here offers `auto`, which means *the existing decision runs*.
 * That is not a placeholder: the automatic choice is usually right, it explains
 * itself, and it varies across pieces in a way a fixed operator preference
 * would not — an account where every quiz uses the rail layout looks like a
 * template, which is what §302 exists to avoid.
 *
 * So this is an override, not a configuration. Choosing nothing is choosing the
 * thing that already works.
 *
 * ## Previews
 *
 * Each visual choice carries a small diagram, because "grid" and "rail" mean
 * nothing until you have seen them and an operator should not have to render a
 * video to find out. Drawn in text rather than rendered: a thumbnail is better
 * and needs a render per template per brand, and this is legible today.
 */
import type { PostFormatId } from './catalog.js';

export interface OptionChoice {
  value: string;
  label: string;
  /** One line an operator reads before choosing. */
  help?: string;
  /** A small text diagram, for choices whose meaning is visual. */
  preview?: string;
}

export interface FormatOption {
  key: string;
  label: string;
  help: string;
  choices: OptionChoice[];
  /** Always a real behaviour, usually `auto`. */
  defaultValue: string;
}

const AUTO = (help: string): OptionChoice => ({ value: 'auto', label: 'Auto', help });

/**
 * The quiz treatments, with what each looks like.
 *
 * The diagrams are the point. `stack`, `rail` and `grid` are meaningless words
 * until seen, and §302 chose between them on the operator's behalf with no way
 * to look at the options.
 */
const QUIZ_TEMPLATES: OptionChoice[] = [
  AUTO('Picks a treatment that fits the question and has not been used lately.'),
  {
    value: 'stack',
    label: 'Stacked bars',
    help: 'Full-width bars down the middle. The most legible, and the safest.',
    preview: ['┌──────────────┐', '│ QUESTION     │', '│ ▭▭▭▭▭▭▭▭▭▭▭ │', '│ ▭▭▭▭▭▭▭▭▭▭▭ │', '│ ▭▭▭▭▭▭▭▭▭▭▭ │', '└──────────────┘'].join('\n'),
  },
  {
    value: 'rail',
    label: 'Left rail',
    help: 'Question held on the left, options stepping down the right.',
    preview: ['┌──────────────┐', '│ QUES │ ▭▭▭▭▭ │', '│ TION │ ▭▭▭▭▭ │', '│  │   │ ▭▭▭▭▭ │', '│      │ ▭▭▭▭▭ │', '└──────────────┘'].join('\n'),
  },
  {
    value: 'grid',
    label: 'Tiles',
    help: 'Two-column tiles. Feels like a game show rather than a card.',
    preview: ['┌──────────────┐', '│ QUESTION     │', '│ ▭▭▭▭  ▭▭▭▭  │', '│ ▭▭▭▭  ▭▭▭▭  │', '└──────────────┘'].join('\n'),
  },
  {
    value: 'spotlight',
    label: 'Spotlight',
    help: 'The question at full size and nothing else. For a question with no options.',
    preview: ['┌──────────────┐', '│              │', '│  QUESTION    │', '│  AT SIZE     │', '│              │', '└──────────────┘'].join('\n'),
  },
  {
    value: 'versus',
    label: 'Versus',
    help: 'Two half-frame panels. Built for true or false.',
    preview: ['┌──────────────┐', '│ QUESTION     │', '│ ┌────┐┌────┐ │', '│ │TRUE││FALS│ │', '│ └────┘└────┘ │', '└──────────────┘'].join('\n'),
  },
];

/**
 * §358. Options per format.
 *
 * Data rather than a screen, so the wizard renders whatever a format declares
 * and a new format's questions appear without touching the UI — which is the
 * same discipline `postTypesForPlatform` follows.
 */
export const FORMAT_OPTIONS: Partial<Record<PostFormatId, FormatOption[]>> = {
  quiz: [
    {
      key: 'template',
      label: 'Look',
      help: 'How each question is drawn. Auto varies it across the piece so two questions never look alike.',
      choices: QUIZ_TEMPLATES,
      defaultValue: 'auto',
    },
    {
      key: 'questionCount',
      label: 'How many questions',
      help: 'Five is the format. Three is tighter and fits a shorter cut.',
      choices: [
        AUTO('Five, unless the research found fewer facts worth asking about.'),
        { value: '3', label: '3', help: 'About 25 seconds.' },
        { value: '5', label: '5', help: 'About 40 seconds.' },
      ],
      defaultValue: 'auto',
    },
    {
      key: 'questionKind',
      label: 'How they are asked',
      help: 'Auto decides per question from the answer: a year is recognisable, not recallable, so it becomes multiple choice.',
      choices: [
        AUTO('Decided per question by what the answer is.'),
        { value: 'multiple_choice', label: 'Multiple choice', help: 'Options on screen. A lower bar, and more people play.' },
        { value: 'true_false', label: 'True or false', help: 'Best for a belief people already hold.' },
        { value: 'free_form', label: 'Asked aloud', help: 'No options. Only for answers a person could actually produce.' },
      ],
      defaultValue: 'auto',
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      help: 'A quiz that opens hard loses the people who would have stayed.',
      choices: [
        AUTO('Easy first, hard last, so the first is a win and the last is worth bragging about.'),
        { value: 'easy', label: 'All easy', help: 'Everybody finishes. Fewer comments.' },
        { value: 'hard', label: 'All hard', help: 'Fewer finish, and the ones who do tell people.' },
      ],
      defaultValue: 'auto',
    },
  ],

  history: [
    {
      key: 'angle',
      label: 'The angle',
      help: 'What the story is really about. It changes which fact becomes the turn.',
      choices: [
        AUTO('Chosen from what the research actually found.'),
        { value: 'surprise', label: 'The surprise', help: 'The thing nobody expects. Strongest opening.' },
        { value: 'mechanism', label: 'How it works', help: 'The explanation underneath. Builds authority.' },
        { value: 'person', label: 'The person', help: 'Someone who did something. Easiest to remember.' },
      ],
      defaultValue: 'auto',
    },
  ],

  tips: [
    {
      key: 'count',
      label: 'How many',
      help: 'Odd numbers read as considered; even ones read as a list.',
      choices: [AUTO('Whatever the subject supports.'), { value: '3', label: '3' }, { value: '5', label: '5' }, { value: '7', label: '7' }],
      defaultValue: 'auto',
    },
    {
      key: 'numbered',
      label: 'Numbered',
      help: 'The number is what keeps a viewer’s place, and what makes them stay for the last one.',
      choices: [AUTO('Numbered.'), { value: 'yes', label: 'Numbered' }, { value: 'no', label: 'Unnumbered' }],
      defaultValue: 'auto',
    },
  ],

  myth_fact: [
    {
      key: 'strength',
      label: 'How firmly to correct',
      help: 'A myth stated without being labelled is a myth post spreading the myth, so the label is never optional.',
      choices: [
        AUTO('Firm, with the correction as the turn.'),
        { value: 'firm', label: 'Firm', help: '"This is wrong, and here is what is true."' },
        { value: 'gentle', label: 'Partly true', help: 'Where the belief has something in it worth keeping.' },
      ],
      defaultValue: 'auto',
    },
  ],

  walkthrough: [
    {
      key: 'speed',
      label: 'The waiting',
      help: 'A demonstration has one dead passage — the product working. Compressing it buys room for the parts that matter.',
      choices: [
        AUTO('Compressed about three times.'),
        { value: 'real', label: 'Real time', help: 'Honest and slow. Good for something genuinely fast.' },
        { value: 'fast', label: 'Faster', help: 'Six times. For anything that takes a while.' },
      ],
      defaultValue: 'auto',
    },
    {
      key: 'marks',
      label: 'Pointing',
      help: 'A ring is a claim that something was pressed. Auto marks only what the voice refers to.',
      choices: [
        AUTO('Marks a moment when the voice refers to something the frame can locate.'),
        { value: 'none', label: 'No marks', help: 'Let the recording speak.' },
        { value: 'every', label: 'Every tap', help: 'Busy, but leaves nothing unexplained.' },
      ],
      defaultValue: 'auto',
    },
  ],

  transformation: [
    {
      key: 'emphasis',
      label: 'What to lead with',
      help: 'The same change, framed by what it costs or what it gains.',
      choices: [
        AUTO('The change itself.'),
        { value: 'before', label: 'The problem', help: 'Open on what was wrong.' },
        { value: 'after', label: 'The result', help: 'Open on what it became.' },
        { value: 'cost', label: 'The trade-off', help: 'Lead with what is lost. The most trusted framing.' },
      ],
      defaultValue: 'auto',
    },
  ],
};

/**
 * §358. Options every video shares, whatever its format.
 *
 * Voice and music are the two an operator most often wants to override — a
 * silent caption-led cut is a real style and not a broken video, and a bed is
 * occasionally wrong for a subject however well the director chose it.
 */
export const VIDEO_OPTIONS: FormatOption[] = [
  {
    key: 'voice',
    label: 'Voice',
    help: 'A silent, caption-led cut is a normal short-form style, not a broken video.',
    choices: [
      AUTO('Spoken, read from the same words the screen shows.'),
      { value: 'on', label: 'Spoken' },
      { value: 'off', label: 'Silent', help: 'Captions carry it.' },
    ],
    defaultValue: 'auto',
  },
  {
    key: 'music',
    label: 'Music',
    help: 'A bed under the voice, ducked while anybody is speaking.',
    choices: [
      AUTO('A bed chosen for the mood of the piece.'),
      { value: 'on', label: 'With a bed' },
      { value: 'off', label: 'No music', help: 'Narration alone, normalised.' },
    ],
    defaultValue: 'auto',
  },
  {
    key: 'captions',
    label: 'Captions',
    help: 'Burned in, because most of a feed is watched muted.',
    choices: [AUTO('Burned in.'), { value: 'on', label: 'Burned in' }, { value: 'off', label: 'None' }],
    defaultValue: 'auto',
  },
];

/**
 * §358. The shape a text post takes.
 *
 * X and Threads carry the same characters and reward completely different
 * things, and nothing in the pipeline has ever asked which shape a text post
 * should be — it wrote a caption and posted it.
 */
export const TEXT_POST_OPTIONS: FormatOption[] = [
  {
    key: 'shape',
    label: 'Shape',
    help: 'What the post is doing, which decides its first line more than the subject does.',
    choices: [
      AUTO('Chosen from the format and what the account has posted lately.'),
      {
        value: 'observation',
        label: 'Observation',
        help: 'One idea, stated. The default and the hardest to do well.',
        preview: 'Most people X.\n\nThe reason is Y.',
      },
      {
        value: 'question',
        label: 'Question',
        help: 'Asked to be answered. The cheapest engagement there is, and it wears out.',
        preview: 'What is the one X\nyou would never Y?',
      },
      {
        value: 'list',
        label: 'Short list',
        help: 'Three or four lines. Reads fast, saves well.',
        preview: 'Three things:\n\n1. …\n2. …\n3. …',
      },
      {
        value: 'contrarian',
        label: 'Against the grain',
        help: 'A common belief, refused. Highest reach and highest risk.',
        preview: 'Everyone says X.\n\nThey are wrong, and\nhere is why.',
      },
      {
        value: 'story',
        label: 'A small story',
        help: 'Something that happened. Slowest to read, most reposted.',
        preview: 'Last week I X.\n\nWhat happened next…',
      },
    ],
    defaultValue: 'auto',
  },
];

/** Everything an operator can choose for this format and post type. */
export function optionsFor(format: PostFormatId | null, media: string): FormatOption[] {
  const options: FormatOption[] = [];
  if (format && FORMAT_OPTIONS[format]) options.push(...FORMAT_OPTIONS[format]!);
  if (media === 'video') options.push(...VIDEO_OPTIONS);
  if (media === 'text') options.push(...TEXT_POST_OPTIONS);
  return options;
}
