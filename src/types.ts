export type TEmbeddingVector = number[];
export type TIndexItem = { text: string; vec: TEmbeddingVector };
export type TScoredIndexItem = TIndexItem & { score: number };