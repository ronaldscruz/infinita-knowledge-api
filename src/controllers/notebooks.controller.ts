import type { Request, Response } from "express";
import { createBusboy } from "../middleware/busboy.js";
import { saveIncomingFile } from "../utils/fs.js";
import { ingestFromSources } from "../services/ingest.service.js";
import { deleteAll, listOrStats } from "../services/pinecone.service.js";
import { getOpenAiClient } from "../lib/openAi.js";
import {
	buildContext,
	generate,
	queryKnowledge,
} from "../services/query.service.js";

export function ingest(req: Request, res: Response): void {
	const bb = createBusboy(req);
	const uploadedPdfPaths: string[] = [];
	const youtubeUrls: string[] = [];
	const rawTexts: string[] = [];
	const filePromises: Array<Promise<void>> = [];

	bb.on("file", (_name: string, file: any, info: any) => {
		const { filename, mimeType } = info;
		const p = (async () => {
			try {
				if (
					!filename.toLowerCase().endsWith(".pdf") &&
					mimeType !== "application/pdf"
				) {
					file.resume();
					return;
				}
				const savedPath = await saveIncomingFile(file, filename);
				uploadedPdfPaths.push(savedPath);
			} catch {
				file.resume();
			}
		})();
		filePromises.push(p);
	});

	bb.on("field", (name: string, value: string) => {
		if (!value) return;
		if (name === "youtube_url" || name === "youtube_urls[]")
			youtubeUrls.push(value);
		if (name === "text" || name === "raw_text" || name === "raw_texts[]")
			rawTexts.push(value);
	});

	bb.on("error", (err: any) =>
		res.status(400).json({ error: err.message ?? String(err) }),
	);

	bb.on("finish", async () => {
		await Promise.allSettled(filePromises);
		try {
			if (
				uploadedPdfPaths.length === 0 &&
				youtubeUrls.length === 0 &&
				rawTexts.length === 0
			) {
				return res.status(400).json({ error: "no valid sources provided" });
			}
			const { upserted } = await ingestFromSources(
				uploadedPdfPaths,
				youtubeUrls,
				rawTexts,
			);
			res.json({ ok: true, upserted });
		} catch (err: any) {
			res.status(500).json({ error: err.message ?? String(err) });
		}
	});

	req.pipe(bb);
}

export async function list(_req: Request, res: Response) {
	try {
		res.json(await listOrStats());
	} catch (err: any) {
		res.status(500).json({ error: err.message ?? String(err) });
	}
}

export async function clear(_req: Request, res: Response) {
	try {
		await deleteAll();
		res.json({ ok: true });
	} catch (err: any) {
		res.status(500).json({ error: err.message ?? String(err) });
	}
}

export async function query(req: Request, res: Response) {
	try {
		const {
			q,
			mode: rawMode,
			k,
		} = req.query as { q?: string; mode?: string; k?: string };
		if (!q || typeof q !== "string")
			return res.status(400).json({ error: "query parameter 'q' is required" });

		const normalized = String(rawMode || "").toLowerCase();
		const explicitMode = [
			"answer",
			"summary",
			"overview",
			"analysis",
			"quiz",
		].includes(normalized)
			? (normalized as any)
			: "answer";
		const isGeneralLike =
			/summary|summarize|overview|analy(s|z)e|analysis|quiz|questions|flashcards|test/i.test(
				q,
			);
		const mode =
			explicitMode ||
			(isGeneralLike
				? q.toLowerCase().includes("quiz") ||
					q.toLowerCase().includes("question")
					? "quiz"
					: q.toLowerCase().includes("overview")
						? "overview"
						: q.toLowerCase().includes("summar")
							? "summary"
							: q.toLowerCase().includes("analy")
								? "analysis"
								: "summary"
				: "answer");

		const client = getOpenAiClient();
		const emb = await client.embeddings.create({
			model: "text-embedding-3-small",
			input: [q],
		});
		const qvec = emb.data[0]?.embedding as number[];
		if (!qvec)
			return res
				.status(500)
				.json({ error: "Failed to generate query embedding" });

		const userK = Number.isFinite(Number(k))
			? Math.max(1, Math.min(100, Number(k)))
			: undefined;
		const topK = userK ?? (mode === "answer" ? 6 : mode === "quiz" ? 40 : 24);

		const { matches, contextChunks } = await queryKnowledge(qvec, topK);
		if (contextChunks.length === 0) {
			return res.json({
				mode,
				answer:
					"I couldn't find any relevant information in my knowledge base to respond.",
				sources: [],
				query: q,
			});
		}

		const context = buildContext(contextChunks);
		const content = await generate(mode as any, context, q);

		const sources = contextChunks.map(
			(c: {
				source?: string;
				kind?: string;
				score?: number;
				chunk_index?: number;
			}) => ({
				source: c.source,
				kind: c.kind,
				relevance_score: c.score,
				chunk_index: c.chunk_index,
			}),
		);
		if (mode === "quiz") {
			let quiz: any = null;
			try {
				quiz = JSON.parse(content);
			} catch {}
			return res.json({
				mode,
				quiz,
				raw: quiz ? undefined : content,
				sources,
				query: q,
				chunks_used: contextChunks.length,
				total_matches: matches.length,
			});
		}

		res.json({
			mode,
			answer: content,
			sources,
			query: q,
			chunks_used: contextChunks.length,
			total_matches: matches.length,
		});
	} catch (err: any) {
		res.status(500).json({ error: err.message ?? String(err) });
	}
}
