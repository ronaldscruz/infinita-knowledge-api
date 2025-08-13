import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { resolveProjectRoot } from "../utils/resolveProjectRoot.js";
import { ensureDirectoryExists } from "../utils/ensureDirectoryExists.js";

const execFileAsync = promisify(execFile);

export type DownloadResult = {
	outputFilePath: string;
	stdout: string;
	stderr: string;
};

async function getYoutubeVideoId(url: string): Promise<string> {
	const { stdout } = await execFileAsync("yt-dlp", [
		"--print",
		"%(id)s",
		"--no-warnings",
		"--no-progress",
		url,
	]);
	const id = stdout.trim().split(/\r?\n/).pop() ?? "";
	if (!id) {
		throw new Error("Failed to resolve video id via yt-dlp");
	}
	return id;
}

export async function downloadYoutubeAudio(
	url: string,
	targetDirectory?: string,
): Promise<DownloadResult> {
	const projectRoot = resolveProjectRoot();
	const destinationDir =
		targetDirectory ?? path.join(projectRoot, "source-files");
	await ensureDirectoryExists(destinationDir);

	const videoId = await getYoutubeVideoId(url);
	const outputTemplate = path.join(destinationDir, `${videoId}.%(ext)s`);

	const { stdout, stderr } = await execFileAsync(
		"yt-dlp",
		[
			"-f",
			"worstaudio/worst",
			"-x",
			"--audio-format",
			"mp3",
			"--postprocessor-args",
			"-ar 16000 -ac 1",
			"--no-continue",
			"--no-part",
			"--no-progress",
			"-o",
			outputTemplate,
			url,
		],
		{ maxBuffer: 10 * 1024 * 1024 },
	);

	const outputFilePath = path.join(destinationDir, `${videoId}.mp3`);
	return { outputFilePath, stdout, stderr };
}
