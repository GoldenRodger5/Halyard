import type { CaptionCue, ShotPlan } from './edit-plan';

export type CaptionAnchor = 'LOWER_MIDDLE' | 'SPLIT_SEAM';

function cueMidpoint(cue: CaptionCue): number {
  return Math.max(0, (Number(cue.start) + Number(cue.end)) / 2);
}

export function shotForCaptionCue(shots: ShotPlan[], cue: CaptionCue): ShotPlan | undefined {
  if (!shots.length) return undefined;
  const midpoint = cueMidpoint(cue);
  return (
    shots.find((shot) => midpoint >= shot.start && midpoint < shot.end) ??
    shots.find((shot) => cue.start < shot.end && cue.end > shot.start) ??
    shots[shots.length - 1]
  );
}

export function captionAnchorForCue(shots: ShotPlan[], cue: CaptionCue): CaptionAnchor {
  const shot = shotForCaptionCue(shots, cue);
  return shot?.layout === 'SPLIT_SCREEN' ? 'SPLIT_SEAM' : 'LOWER_MIDDLE';
}

export function captionTopForAnchor(anchor: CaptionAnchor, lineCount: number): number {
  const lines = Math.max(1, Math.min(2, lineCount));
  if (anchor === 'SPLIT_SEAM') {
    // A stacked SPLIT_SCREEN has a natural gutter at y=960. Keep phrase
    // subtitles centered around that seam instead of covering either face.
    return lines === 1 ? 914 : 844;
  }
  return lines === 1 ? 1320 : 1285;
}
