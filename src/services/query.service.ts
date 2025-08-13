import { getOpenAiClient } from "../lib/openAi.js";
import { queryIndex } from "./pinecone.service.js";
import {
	buildAnswerPrompt,
	buildAnalysisPrompt,
	buildOverviewPrompt,
	buildQuizPrompt,
	buildSummaryPrompt,
} from "../prompts/index.js";

export type QueryMode = "answer" | "summary" | "overview" | "analysis" | "quiz";

export async function queryKnowledge(queryVector: number[], topK: number) {
	const searchResults = await queryIndex(queryVector, topK, true);
	const matches = Array.isArray((searchResults as any).matches)
		? (searchResults as any).matches
		: [];
	const contextChunks = matches
		.filter((m: any) => m?.metadata && typeof m.metadata.text === "string")
		.map((m: any) => ({
			text: m.metadata.text as string,
			score: m.score as number | undefined,
			source: m.metadata.source as string | undefined,
			kind: m.metadata.kind as string | undefined,
			chunk_index: m.metadata.chunk_index as number | undefined,
		}))
		.sort(
			(a: { score?: number }, b: { score?: number }) =>
				(b.score || 0) - (a.score || 0),
		);
	return { matches, contextChunks };
}

export function buildContext(chunks: Array<{ text: string }>): string {
	return chunks.map((c, i) => `[#${i + 1}] ${c.text}`).join("\n\n");
}

export async function generate(
	mode: QueryMode,
	context: string,
	question: string,
): Promise<string> {
	const client = getOpenAiClient();
	const pair =
		mode === "answer"
			? buildAnswerPrompt(context, question)
			: mode === "summary"
				? buildSummaryPrompt(context)
				: mode === "overview"
					? buildOverviewPrompt(context)
					: mode === "analysis"
						? buildAnalysisPrompt(context)
						: buildQuizPrompt(context);
	const completion = await client.chat.completions.create({
		model: "gpt-4o-mini",
		messages: [
			{ role: "system", content: pair.system },
			{ role: "user", content: pair.user },
		],
		temperature: mode === "quiz" ? 0.4 : 0.2,
	});
	return completion.choices[0]?.message?.content?.trim() ?? "";
}
