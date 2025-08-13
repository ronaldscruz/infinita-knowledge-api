import path from "node:path";
import os from "node:os";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";

export function tmpPath(filename: string): string {
	return path.join(
		os.tmpdir(),
		`ik-${Date.now()}-${Math.random().toString(36).slice(2)}-${filename}`,
	);
}

export async function saveIncomingFile(
	fileStream: any,
	filename: string,
): Promise<string> {
	const dest = tmpPath(filename);
	await mkdir(path.dirname(dest), { recursive: true });
	const out = createWriteStream(dest);
	return new Promise((resolve, reject) => {
		fileStream.on("limit", () => reject(new Error("file too large")));
		fileStream.pipe(out);
		out.on("finish", () => resolve(dest));
		out.on("error", reject);
	});
}
