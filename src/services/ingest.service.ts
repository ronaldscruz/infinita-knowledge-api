import { extractPdfToText, pdfSourceName } from "./extractors/pdf.js";
import { extractYoutubeToText } from "./extractors/youtube.js";
import { extractPlainText } from "./extractors/text.js";
import { chunkText } from "../utils/chunkText.js";
import { embedChunks } from "./embeddings.service.js";
import { upsertVectors } from "./pinecone.service.js";
import { sha1 } from "../utils/hash.js";

export async function ingestFromSources(
	uploadedPdfPaths: string[],
	youtubeUrls: string[],
	rawTexts: string[],
): Promise<{ upserted: number }> {
	const collected: Array<{ source: string; kind: string; text: string }> = [];

	for (const pdfPath of uploadedPdfPaths) {
		const text = await extractPdfToText(pdfPath);
		collected.push({ source: pdfSourceName(pdfPath), kind: "pdf", text });
	}

	for (const url of youtubeUrls) {
		const { text } = await extractYoutubeToText(url);
		collected.push({ source: url, kind: "youtube", text });
	}

	for (const t of rawTexts) {
		const text = await extractPlainText(t);
		collected.push({ source: "raw", kind: "text", text });
	}

	const vectors: Array<{
		id: string;
		values: number[];
		metadata: Record<string, any>;
	}> = [];

	for (const item of collected) {
		const chunks = chunkText(item.text);
		const embs = await embedChunks(chunks);
		embs.forEach((values, idx) => {
			const id = `${item.kind}:${sha1(`${item.source}:${idx}`)}`;
			vectors.push({
				id,
				values,
				metadata: {
					source: item.source,
					kind: item.kind,
					chunk_index: idx,
					text: chunks[idx],
				},
			});
		});
	}

	if (vectors.length > 0) await upsertVectors(vectors);
	return { upserted: vectors.length };
}
