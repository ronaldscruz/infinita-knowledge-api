import fs from "node:fs";
import { pdfJs } from "../lib/pdfJs.js";

/**
 * Reads a PDF file and extracts plain text
 * - Uses pdf-parse to handle reading
 * - Cleans extra line breaks
 */
export const extractPdfText = async (filePath: string): Promise<string> => {
	console.time("> PDF Loaded");
	const { getDocument } = await pdfJs(); // ← shim already in place
	const data = new Uint8Array(fs.readFileSync(filePath));
	const pdf: any = await getDocument({ data }).promise;

	let text = "";
	for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
		const page = await pdf.getPage(pageNum);
		const content = await page.getTextContent();
		const pageText = content.items.map((it: any) => it.str).join(" ");
		text = text.concat(pageText, "\n");
	}
	console.timeEnd("> PDF Loaded");
	return text.replace(/\n{2,}/g, "\n").trim();
};
