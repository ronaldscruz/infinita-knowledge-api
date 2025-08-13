import "dotenv/config";
import type { TEmbeddingVector, TIndexItem, TScoredIndexItem } from "./types.js";
import { chunkText } from "./utils/chunkText.js";
import { cosineCompare } from "./utils/cosineCompare.js";
import { extractPdfText } from "./utils/extractPdfText.js";
import { transcriptAudio } from "./utils/transcriptAudio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getOpenAiClient } from "./lib/openAi.js";

const GOAL_PERSONA: string = "";
const REQ: string = "What is the song about?";

// Resolve project root regardless of running from src/ (tsx) or dist/ (tsc)
const thisFilePath = fileURLToPath(import.meta.url);
const thisDirPath = path.dirname(thisFilePath);
const projectRootPath = path.resolve(thisDirPath, "..");
const SOURCE_FILES_DIR = path.join(projectRootPath, "source-files");
const SOURCE_FILE_NAME = "music.mp3";

/**
 * Calls OpenAI's embedding API to convert text into vector representations
 * - Each string in `inputs` becomes a high-dimensional vector representing meaning
 */
const embed = async (inputs: string[]): Promise<TEmbeddingVector[]> => {
	console.time(`> Embedded ${inputs.length} inputs...`);
	const res = await getOpenAiClient().embeddings.create({
		model: "text-embedding-3-small",
		input: inputs,
	});
	console.timeEnd(`> Embedded ${inputs.length} inputs...`);
	return res.data.map((d) => d.embedding as TEmbeddingVector);
};

/**
 * Creates a searchable in-memory index from a PDF
 * - Reads and extracts text from PDF
 * - Chunks the text
 * - Embeds each chunk
 * - Returns an array of { text, vec } objects
 */
const buildIndex = async (inputPath: string): Promise<TIndexItem[]> => {
	console.time(`> Index for ${inputPath} finished.`);
	const lower = inputPath.toLowerCase();
	const isAudio = [".mp3", ".wav", ".m4a", ".ogg", ".webm", ".flac"].some(
		(ext) => lower.endsWith(ext),
	);
	const text = isAudio
		? await transcriptAudio(inputPath)
		: await extractPdfText(inputPath);
	const chunks = chunkText(text);
	const vectors = await embed(chunks);
	console.timeEnd(`> Index for ${inputPath} finished.`);
	return chunks.map((t, i) => ({ text: t, vec: vectors[i] }));
};

/**
 * Retrieves the top `k` chunks most relevant to a query
 * - Embeds the query
 * - Compares with all chunks using cosine similarity
 * - Returns the highest scoring matches
 */
const retrieve = async (
	index: TIndexItem[],
	query: string,
	k: number = 5,
): Promise<TScoredIndexItem[]> => {
	const [qvec] = await embed([query]);
	return index
		.map((it) => ({ ...it, score: cosineCompare(it.vec, qvec) }))
		.sort((a, b) => b.score - a.score)
		.slice(0, k);
};

/**
 * Sends the retrieved context + question to GPT for answering
 * - Context is included in the prompt so GPT can base its answer only on relevant chunks
 */
const answer = async (
	contextChunks: Array<{ text: string }>,
	question: string,
): Promise<string> => {
	const context = contextChunks
		.map((c, i) => `[#${i + 1}] ${c.text}`)
		.join("\n\n");
	const res = await getOpenAiClient().chat.completions.create({
		model: "gpt-4o-mini",
		messages: [
			{
				role: "system",
				content:
					"Answer only using the provided context. If missing, say you don't know.",
			},
			{ role: "system", content: `The persona: ${GOAL_PERSONA}` },
			{
				role: "user",
				content: `Context:\n${context}\n\nQuestion: ${question}`,
			},
		],
		temperature: 0.2,
	});
	return res.choices[0].message.content?.trim() ?? "";
};

/**
 * Main workflow
 * - Builds index from PDF
 * - Retrieves relevant chunks for summary
 * - Generates summary answer from GPT
 * - (Optional) Could also generate a quiz using the same retrieve/answer flow
 */
const main = async (): Promise<void> => {
	const index = await buildIndex(path.join(SOURCE_FILES_DIR, SOURCE_FILE_NAME));
	const hits = await retrieve(index, REQ);
	const out = await answer(hits, REQ);
	console.log(out);
};

main();
