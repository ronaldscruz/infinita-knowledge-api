import { pinecone } from "../lib/pinecone.js";

export type Vector = {
	id: string;
	values: number[];
	metadata: Record<string, any>;
};

export async function upsertVectors(
	vectors: Vector[],
	batchSize = 200,
): Promise<void> {
	for (let i = 0; i < vectors.length; i += batchSize) {
		const batch = vectors.slice(i, i + batchSize);
		// @ts-ignore
		await pinecone.rootIndex.upsert(batch);
	}
}

export async function queryIndex(
	vector: number[],
	topK: number,
	includeMetadata = true,
): Promise<any> {
	// @ts-ignore
	return pinecone.rootIndex.query({ vector, topK, includeMetadata });
}

export async function listOrStats(): Promise<any> {
	// @ts-expect-error list may not exist
	if (typeof pinecone.rootIndex.list === "function") {
		// @ts-expect-error list signature varies
		return { listed: await pinecone.rootIndex.list({ limit: 1000 }) };
	}
	const stats = await pinecone.rootIndex.describeIndexStats?.();
	return { stats };
}

export async function deleteAll(): Promise<void> {
	if (typeof (pinecone as any).rootIndex.deleteAll === "function") {
		// @ts-ignore
		await pinecone.rootIndex.deleteAll();
	} else {
		// @ts-expect-error delete signature varies
		await pinecone.rootIndex.delete({ deleteAll: true });
	}
}
