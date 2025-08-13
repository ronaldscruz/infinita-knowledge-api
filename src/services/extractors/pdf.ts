import path from "node:path";
import { unlink } from "node:fs/promises";
import fs from "node:fs";
import { pdfJs } from "../../lib/pdfJs.js";

/**
 * Parses a PDF file and returns raw text. Best effort cleans up the temp file.
 */
export async function extractPdfToText(pdfPath: string): Promise<string> {
	// Inline PDF extraction to keep extractor self-contained
	console.time("> PDF Loaded");
	const { getDocument } = await pdfJs();
	const data = new Uint8Array(fs.readFileSync(pdfPath));
	const pdf: any = await getDocument({ data }).promise;

	let raw = "";
	for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
		const page = await pdf.getPage(pageNum);
		const content = await page.getTextContent();
		const pageText = (content.items as any[])
			.map((it: any) => it.str)
			.join(" ");
		raw = raw.concat(pageText, "\n");
	}
	console.timeEnd("> PDF Loaded");
	const text = raw.replace(/\n{2,}/g, "\n").trim();
	try {
		await unlink(pdfPath);
	} catch {}
	return text;
}

/**
 * Helper to derive a source-friendly name for the file
 */
export function pdfSourceName(pdfPath: string): string {
	return path.basename(pdfPath);
}
