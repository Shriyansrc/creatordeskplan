import type { EditorProject } from './types';
import { projectDuration } from './project';
export type SubjectBeat = { id: string; start: number; end: number; mode: 'sticker' | 'silhouette' };
export function subjectBeatError(project: EditorProject): string | null {
  const beats = project.subjectBeats ?? [];
  if (beats.length > 16) return 'Use at most 16 subject beats.';
  const sorted = [...beats].sort((a,b) => a.start-b.start);
  for (let i=0; i<sorted.length; i++) {
    const beat=sorted[i]!;
    if (!Number.isFinite(beat.start) || !Number.isFinite(beat.end) || beat.start<0 || beat.end<=beat.start || beat.end>projectDuration(project)+0.001 || !['sticker','silhouette'].includes(beat.mode)) return 'Subject beats must fit the current edited timeline. Remove or replace beats after changing trim or speed.';
    if (i && beat.start<sorted[i-1]!.end) return 'Subject beats cannot overlap.';
  }
  return null;
}
export function subjectModeAt(project: EditorProject, time: number) {
  const beat=project.subjectBeats?.find(b => time>=b.start && time<b.end);
  return beat?.mode ?? project.subjectMode ?? 'original';
}
export function needsSubjectMasks(project: EditorProject) {
  return (!!project.subjectMode && project.subjectMode!=='original') || !!project.subjectBeats?.length;
}
