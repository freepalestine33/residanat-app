import type { UserLecture } from '../db/db';

export function preserveLocalLecturePdf(remote: UserLecture, local?: UserLecture): UserLecture {
  if (!local?.pdfBlob) return remote;
  return { ...remote, pdfBlob: local.pdfBlob, pdfName: local.pdfName };
}
