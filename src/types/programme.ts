export interface ProgrammeCategory {
  name: string;
  groups: ProgrammeGroup[];
}

export interface ProgrammeGroup {
  name: string;
  items: ProgrammeItem[];
}

export interface ProgrammeItem {
  n: string;           // Number
  t: string;           // Title
  d: string;           // Description
  w: string;           // Warnings/cross-references
  s: string;           // Sources (semicolon-separated)
  courseSource?: string;
  qcmSource?: string;
  alternativeCourseSource?: string;
  alternativeQcmSource?: string;
  linkedLectureId?: string;
}

export type ProgrammeCategoryCode = 'M' | 'C' | 'B'; // Médecine, Chirurgie, Biologie

export interface ProgrammeData {
  [key: string]: ProgrammeCategory;
}
