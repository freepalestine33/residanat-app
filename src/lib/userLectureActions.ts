import { db } from '../db/db';
import { queueSyncChange } from './syncEvents';

export async function deleteUserLecture(id: string) {
  const deletedAt = new Date().toISOString();
  await queueSyncChange('lectures', id, 'delete', {
    id,
    updated_at: deletedAt,
    deleted_at: deletedAt,
  });
  await db.userLectures.delete(id);
}
