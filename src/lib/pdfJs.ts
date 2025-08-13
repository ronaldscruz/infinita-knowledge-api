import { DOMMatrix } from "canvas";

export async function pdfJs() {
	if (!global.DOMMatrix) {
		global.DOMMatrix = DOMMatrix as any;
	}
	return await import("pdfjs-dist");
}
