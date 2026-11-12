import { createId } from './createId';

export function createGeneratedLectureId(otrLectureId?: string) {
  return otrLectureId ?? `u_${createId().replaceAll('-', '').slice(0, 30)}`;
}
