export type PromptPair = { system: string; user: string };

export function buildAnswerPrompt(
	context: string,
	question: string,
): PromptPair {
	return {
		system:
			"Ground all factual claims in the provided context. You may adapt, translate, and teach using the user's requested language or phonetics; if the context lacks facts, say you don't know.",
		user: `Context:\n${context}\n\nQuestion: ${question}`,
	};
}

export function buildSummaryPrompt(context: string): PromptPair {
	return {
		system: "Write a clear, unbiased summary using only the provided context.",
		user: `Context:\n${context}\n\nTask: Produce a concise summary (5-10 bullet points).`,
	};
}

export function buildOverviewPrompt(context: string): PromptPair {
	return {
		system: "Provide a high-level overview using only the provided context.",
		user: `Context:\n${context}\n\nTask: Provide a high-level overview (short paragraphs + bullets).`,
	};
}

export function buildAnalysisPrompt(context: string): PromptPair {
	return {
		system: "Analyze the content using only the provided context.",
		user: `Context:\n${context}\n\nTask: Provide a structured analysis (claims, evidence, implications, caveats).`,
	};
}

export function buildQuizPrompt(context: string): PromptPair {
	return {
		system:
			"Create a quiz strictly from the provided context. Do not invent facts. Return only valid JSON.",
		user: `Context:\n${context}\n\nTask: Generate 5 diverse multiple-choice questions. Each item must include: question (string), options (array of 4 strings), answerIndex (0-3), and explanation (string). Return JSON in the shape {"questions": Array<...>}.`,
	};
}
