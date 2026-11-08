export interface Note {
  id?: number;
  syncId?: string;
  imagePath?: string;
  rel: string; // Relation: 'card:c3', 'quiz:q2', 'vf:v1', 'keys', 'libre'
  text: string;
  link?: string;
  image?: Blob | string;
  clearImage?: boolean;
  updated: number; // Timestamp
}
