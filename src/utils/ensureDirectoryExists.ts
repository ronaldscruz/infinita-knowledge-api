import fs from "node:fs/promises";

export const ensureDirectoryExists = async (
	directoryPath: string,
): Promise<void> => {
	await fs.mkdir(directoryPath, { recursive: true });
};
