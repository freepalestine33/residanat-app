import Dexie, { type Table } from 'dexie';
import type { Lecture } from '../types/lecture';

export interface CardProgress { gid: string; due: number; state: unknown; updated: number } // state = ts-fsrs Card
export interface McqAttempt { id?: number; qid: number; at: number; picked: string[]; correct: boolean }
export interface Note { id?: number; syncId?: string; imagePath?: string; rel: string; text: string; link?: string; image?: Blob | string; updated: number }
export interface QuizResult { id: string; lectureId: string; questionId: string; score: number; details: Record<string, unknown>; updatedAt: number }
export interface SyncQueueItem { key: string; collection: string; recordId: string; operation: 'upsert' | 'delete'; record?: Record<string, unknown>; updatedAt: number }
export interface UserLecture { id: string; name: string; content: Lecture; updatedAt: number; pdfBlob?: Blob; pdfName?: string }

class AppDB extends Dexie {
  cards!: Table<CardProgress, string>;
  attempts!: Table<McqAttempt, number>;
  notes!: Table<Note, number>;
  quizResults!: Table<QuizResult, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  userLectures!: Table<UserLecture, string>;
  constructor() {
    super('residanat');
    this.version(1).stores({ cards: 'gid, due, updated', attempts: '++id, qid, at', notes: '++id, rel, updated' });
    this.version(2).stores({
      cards: 'gid, due, updated',
      attempts: '++id, qid, at',
      notes: '++id, rel, updated, syncId',
      quizResults: 'id, lectureId, questionId, updatedAt',
      syncQueue: 'key, collection, updatedAt',
    });
    this.version(3).stores({
      cards: 'gid, due, updated',
      attempts: '++id, qid, at',
      notes: '++id, rel, updated, syncId',
      quizResults: 'id, lectureId, questionId, updatedAt',
      syncQueue: 'key, collection, updatedAt',
      userLectures: 'id, updatedAt',
    });
  }
}
export const db = new AppDB();
