import type { TEmbeddingVector } from "../types.js";

/**
 * Calculates cosine similarity between two embedding vectors
 * - Measures how close in "direction" two vectors are (1 = very similar, 0 = unrelated)
 */
export const cosineCompare = (
	a: TEmbeddingVector,
	b: TEmbeddingVector,
): number => {
	if (a.length !== b.length) {
		throw new Error("Vectors must have the same length");
	}
	let dot = 0,
		na = 0,
		nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
};
