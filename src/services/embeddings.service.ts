import { getOpenAiClient } from "../lib/openAi.js";

export async function embedChunks(chunks: string[]): Promise<number[][]> {
	const client = getOpenAiClient();
	const emb = await client.embeddings.create({
		model: "text-embedding-3-small",
		input: chunks,
	});
	return emb.data.map((d) => d.embedding as number[]);
}
