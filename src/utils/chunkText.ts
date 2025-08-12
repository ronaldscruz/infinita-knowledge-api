/**
 * Splits a long text into smaller overlapping chunks
 * - `size` = max words per chunk
 * - `overlap` = words to repeat between chunks for context continuity
 */
export const chunkText = (text: string, size: number = 1200, overlap: number = 200): string[] => {
	const words = text.split(/\s+/);
	const chunks: string[] = [];
	for (let i = 0; i < words.length; i += size - overlap) {
		const piece = words.slice(i, i + size).join(" ").trim();
		if (piece) chunks.push(piece);
	}
	return chunks;
};