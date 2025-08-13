import type OpenAI from "openai";
import fs from "node:fs";
import { getOpenAiClient } from "../lib/openAi.js";

/**
 * Transcribes an audio file to text using OpenAI Whisper.
 * Supports formats like mp3, wav, m4a, ogg, webm, etc.
 */
export async function transcriptAudio(
	audioFilePath: string,
	openAi?: OpenAI,
): Promise<string> {
	const openai = openAi ?? getOpenAiClient();

	const fileStream = fs.createReadStream(audioFilePath);

	const response = await openai.audio.transcriptions.create({
		model: "whisper-1",
		file: fileStream as any,
		response_format: "text",
	});

	if (typeof response === "string") return response;
	// @ts-expect-error: runtime response may include .text depending on SDK version
	return response.text ?? "";
}
