import OpenAI from "openai";

export function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPEN_API_KEY ;
  if (!apiKey) {
    throw new Error("Missing OpenAI API key. Set OPEN_API_KEY or OPENAI_API_KEY (or OPENAPI_KEY) in env/.env.");
  }
  return new OpenAI({ apiKey });
}