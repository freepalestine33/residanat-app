import { review, getState, dueCount, Rating } from '../lib/srs';

export function useSpacedRepetition() {
  const reviewCard = async (gid: string, rating: Exclude<Rating, Rating.Manual>) => {
    return await review(gid, rating);
  };

  const getCardState = async (gid: string) => {
    return await getState(gid);
  };

  const getDueCount = async () => {
    return await dueCount();
  };

  return {
    review: reviewCard,
    getState: getCardState,
    dueCount: getDueCount,
  };
}
