import type { Memo } from '../lib/mnemonicApi';

export interface NoteVideo {
  id: string; // YouTube video id (11 chars)
  start?: number; // start time in seconds
  label?: string;
}

export interface Note {
  id?: number;
  syncId?: string;
  imagePath?: string;
  rel: string; // Relation: 'card:c3', 'quiz:q2', 'vf:v1', 'keys', 'libre'
  text: string;
  link?: string;
  image?: Blob | string;
  audio?: Blob | string;
  audioPath?: string;
  audioDuration?: number;
  videos?: NoteVideo[];
  memo?: Memo;
  imageBytes?: number;
  audioBytes?: number;
  clearImage?: boolean;
  clearAudio?: boolean;
  clearMemo?: boolean;
  audioChanged?: boolean;
  updated: number; // Timestamp
}
