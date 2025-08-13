import path from "node:path";
import os from "node:os";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

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
	await ensureDirectoryExists(path.dirname(dest));
	const out = createWriteStream(dest);
	return new Promise((resolve, reject) => {
		fileStream.on("limit", () => reject(new Error("file too large")));
		fileStream.pipe(out);
		out.on("finish", () => resolve(dest));
		out.on("error", reject);
	});
}

export const ensureDirectoryExists = async (
	directoryPath: string,
): Promise<void> => {
	await fs.mkdir(directoryPath, { recursive: true });
};

export const resolveProjectRoot = (): string => {
	const thisFilePath = fileURLToPath(import.meta.url);
	const thisDirPath = path.dirname(thisFilePath);
	return path.resolve(thisDirPath, "..", "..");
};
