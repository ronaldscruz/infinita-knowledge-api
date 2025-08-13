import { fileURLToPath } from "node:url";
import path from "node:path";

export const resolveProjectRoot = (): string => {
	const thisFilePath = fileURLToPath(import.meta.url);
	const thisDirPath = path.dirname(thisFilePath);
	return path.resolve(thisDirPath, "..", "..");
};
