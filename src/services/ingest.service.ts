import path from "node:path";
import { unlink } from "node:fs/promises";

import { extractPdfText } from "../utils/extractPdfText.js";
import { downloadYoutubeAudio } from "../lib/youtubeDownloader.js";
import { transcriptAudio } from "../utils/transcriptAudio.js";
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
		const text = await extractPdfText(pdfPath);
		collected.push({ source: path.basename(pdfPath), kind: "pdf", text });
		try {
			await unlink(pdfPath);
		} catch {}
	}

	for (const url of youtubeUrls) {
		const { outputFilePath } = await downloadYoutubeAudio(url);
		const text = await transcriptAudio(outputFilePath);
		collected.push({ source: url, kind: "youtube", text });
		try {
			await unlink(outputFilePath);
		} catch {}
	}

	for (const t of rawTexts)
		collected.push({ source: "raw", kind: "text", text: t });

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
