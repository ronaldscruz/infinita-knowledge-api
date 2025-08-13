import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { unlink } from "node:fs/promises";
import type OpenAI from "openai";
import { getOpenAiClient } from "../../lib/openAi.js";
import { ensureDirectoryExists } from "../../utils/fs.js";
import { resolveProjectRoot } from "../../utils/resolveProjectRoot.js";

const execFileAsync = promisify(execFile);

async function getYoutubeVideoId(url: string): Promise<string> {
	const { stdout } = await execFileAsync("yt-dlp", [
		"--print",
		"%(id)s",
		"--no-warnings",
		"--no-progress",
		url,
	]);
	const id = stdout.trim().split(/\r?\n/).pop() ?? "";
	if (!id) throw new Error("Failed to resolve video id via yt-dlp");
	return id;
}

async function downloadYoutubeAudio(url: string): Promise<string> {
	const projectRoot = resolveProjectRoot();
	const destinationDir = path.join(projectRoot, "source-files");
	await ensureDirectoryExists(destinationDir);
	const videoId = await getYoutubeVideoId(url);
	const outputTemplate = path.join(destinationDir, `${videoId}.%(ext)s`);
	await execFileAsync(
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
	return path.join(destinationDir, `${videoId}.mp3`);
}

/**
 * Downloads the audio from a YouTube URL, transcribes it, and returns text.
 * Cleans up the temporary audio file when done.
 */
export async function extractYoutubeToText(
	url: string,
): Promise<{ text: string; source: string }> {
	const audioPath = await downloadYoutubeAudio(url);
	const openai: OpenAI = getOpenAiClient();
	const { createReadStream } = await import("node:fs");
	const fileStream: any = createReadStream(audioPath);
	const response = await openai.audio.transcriptions.create({
		model: "whisper-1",
		file: fileStream,
		response_format: "text",
	});
	const text =
		typeof response === "string" ? response : ((response as any).text ?? "");
	try {
		await unlink(audioPath);
	} catch {}
	return { text, source: url };
}
