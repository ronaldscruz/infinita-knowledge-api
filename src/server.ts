import "dotenv/config";

import express from "express";
import Busboy from "busboy";
import path from "node:path";
import os from "node:os";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import crypto from "node:crypto";

import { pinecone } from "./lib/pinecone.js";
import { extractPdfText } from "./utils/extractPdfText.js";
import { transcriptAudio } from "./utils/transcriptAudio.js";
import { downloadYoutubeAudio } from "./lib/youtubeDownloader.js";
import { chunkText } from "./utils/chunkText.js";
import { getOpenAiClient } from "./lib/openAi.js";

const app = express();

// helpers
function tmpPath(filename: string): string {
  return path.join(os.tmpdir(), `ik-${Date.now()}-${Math.random().toString(36).slice(2)}-${filename}`);
}
function sha1(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex");
}
async function saveIncomingFile(fileStream: any, filename: string): Promise<string> {
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

app.get("/", (req, res) => {
  res.send("Hello World");
});

// POST /notebooks → ingest and upsert to single Pinecone index
app.post("/notebooks", (req, res) => {
  console.log("🚀 Starting notebook ingestion process");
  console.log("📋 Request headers:", req.headers);
  const bb = Busboy({ headers: req.headers, limits: { fileSize: 1 * 1024 * 1024 * 1024 } });

  const uploadedPdfPaths: string[] = [];
  const youtubeUrls: string[] = [];
  const rawTexts: string[] = [];
  const filePromises: Array<Promise<void>> = [];
  const fileErrors: string[] = [];

  bb.on("file", (name: string, file: any, info: any) => {
    const { filename, mimeType } = info;
    console.log(`📁 Processing file field '${name}': ${filename} (${mimeType})`);
    const p = (async () => {
      try {
        if (!filename.toLowerCase().endsWith(".pdf") && mimeType !== "application/pdf") {
          console.log(`⚠️  Skipping non-PDF file: ${filename}`);
          file.resume();
          return;
        }
        console.log(`💾 Saving PDF file: ${filename}`);
        const savedPath = await saveIncomingFile(file, filename);
        uploadedPdfPaths.push(savedPath);
        console.log(`✅ PDF file saved: ${savedPath}`);
      } catch (err: any) {
        console.error(`❌ Error processing PDF file ${filename}:`, err?.message ?? String(err));
        fileErrors.push(err?.message ?? String(err));
        try { file.resume(); } catch {}
      }
    })();
    filePromises.push(p);
  });

  bb.on("field", (name: string, value: string) => {
    if (!value) return;
    if (name === "youtube_url" || name === "youtube_urls[]") {
      youtubeUrls.push(value);
      console.log(`🎥 Added YouTube URL: ${value}`);
    }
    if (name === "text" || name === "raw_text" || name === "raw_texts[]") {
      rawTexts.push(value);
      console.log(`📝 Added raw text (${value.length} characters)`);
    }
  });

  bb.on("error", (err: any) => {
    console.error("❌ Busboy error:", err.message);
    res.status(400).json({ error: err.message ?? String(err) });
  });

  bb.on("finish", async () => {
    // Ensure all file streams have finished saving before proceeding
    try {
      await Promise.allSettled(filePromises);
    } catch {}
    console.log(`📊 Processing summary: ${uploadedPdfPaths.length} PDFs, ${youtubeUrls.length} YouTube URLs, ${rawTexts.length} text inputs`);
    
    try {
      if (uploadedPdfPaths.length === 0 && youtubeUrls.length === 0 && rawTexts.length === 0) {
        console.log("❌ No valid sources provided");
        const firstErr = fileErrors[0];
        return res.status(400).json({ error: firstErr ?? "no valid sources provided" });
      }

      const collected: Array<{ source: string; kind: string; text: string }> = [];

      // Process PDF files
      for (const pdfPath of uploadedPdfPaths) {
        console.log(`📖 Extracting text from PDF: ${path.basename(pdfPath)}`);
        const text = await extractPdfText(pdfPath);
        console.log(`✅ PDF text extracted: ${text.length} characters`);
        collected.push({ source: path.basename(pdfPath), kind: "pdf", text });
        try { 
          await unlink(pdfPath); 
          console.log(`🗑️  Cleaned up temporary PDF: ${pdfPath}`);
        } catch {}
      }

      // Process YouTube URLs
      for (const url of youtubeUrls) {
        console.log(`🎬 Processing YouTube URL: ${url}`);
        console.log(`⬇️  Downloading audio from YouTube...`);
        const { outputFilePath } = await downloadYoutubeAudio(url);
        console.log(`✅ YouTube audio downloaded: ${outputFilePath}`);
        
        console.log(`🎤 Transcribing audio...`);
        const text = await transcriptAudio(outputFilePath);
        console.log(`✅ Audio transcribed: ${text.length} characters`);
        
        collected.push({ source: url, kind: "youtube", text });
        try { 
          await unlink(outputFilePath); 
          console.log(`🗑️  Cleaned up temporary audio: ${outputFilePath}`);
        } catch {}
      }

      // Process raw texts
      for (const t of rawTexts) {
        console.log(`📝 Processing raw text input (${t.length} characters)`);
        collected.push({ source: "raw", kind: "text", text: t });
      }

      console.log(`📚 Total content items collected: ${collected.length}`);

      // Generate embeddings
      console.log(`🤖 Initializing OpenAI client for embeddings...`);
      const client = getOpenAiClient();
      const vectors: Array<{ id: string; values: number[]; metadata: Record<string, any> }> = [];

      for (const item of collected) {
        console.log(`✂️  Chunking ${item.kind} content: ${item.source}`);
        const chunks = chunkText(item.text);
        console.log(`📦 Created ${chunks.length} text chunks`);
        
        console.log(`🧠 Generating embeddings for ${chunks.length} chunks...`);
        const emb = await client.embeddings.create({ model: "text-embedding-3-small", input: chunks });
        console.log(`✅ Embeddings generated for ${emb.data.length} chunks`);
        
        emb.data.forEach((d, idx) => {
          const id = `${item.kind}:${sha1(`${item.source}:${idx}`)}`;
          vectors.push({ 
            id, 
            values: d.embedding as number[], 
            metadata: { 
              source: item.source, 
              kind: item.kind, 
              chunk_index: idx,
              text: chunks[idx] // Store the actual text content for retrieval
            } 
          });
        });
      }

      console.log(`🔢 Total vectors created: ${vectors.length}`);

      if (vectors.length === 0) {
        console.log("❌ No content to index");
        return res.status(400).json({ error: "no content to index" });
      }

      // Upload to Pinecone
      console.log(`🌲 Uploading ${vectors.length} vectors to Pinecone...`);
      const batchSize = 200;
      let uploadedCount = 0;
      
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        console.log(`📤 Uploading batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(vectors.length/batchSize)} (${batch.length} vectors)`);
        await pinecone.rootIndex.upsert(batch);
        uploadedCount += batch.length;
        console.log(`✅ Batch uploaded: ${uploadedCount}/${vectors.length} vectors`);
      }

      console.log(`🎉 Successfully ingested and indexed ${vectors.length} vectors`);
      res.json({ ok: true, upserted: vectors.length });
    } catch (err: any) {
      console.error("❌ Error during ingestion process:", err.message);
      res.status(500).json({ error: err.message ?? String(err) });
    }
  });

  req.pipe(bb);
});

// GET /notebooks → list vectors (best-effort) or stats
app.get("/notebooks", async (_req, res) => {
  try {
    // @ts-expect-error list may not exist
    if (typeof pinecone.rootIndex.list === "function") {
      // @ts-expect-error list signature varies
      const listed = await pinecone.rootIndex.list({ limit: 1000 });
      return res.json({ listed });
    }
    const stats = await pinecone.rootIndex.describeIndexStats?.();
    return res.json({ stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? String(err) });
  }
});

// GET /notebooks/query → query the knowledge base (answer, summary, overview, analysis, quiz)
app.get("/notebooks/query", async (req, res) => {
  try {
    const { q: query, mode: rawMode, k } = req.query as { q?: string; mode?: string; k?: string };
    
    if (!query || typeof query !== "string") {
      console.log("❌ No query parameter provided");
      return res.status(400).json({ error: "query parameter 'q' is required" });
    }

    // Determine mode
    const normalized = String(rawMode || "").toLowerCase();
    const explicitMode = ["answer", "summary", "overview", "analysis", "quiz"].includes(normalized) ? normalized : "answer";
    const isGeneralLike = /summary|summarize|overview|analy(s|z)e|analysis|quiz|questions|flashcards|test/i.test(query);
    const mode = (explicitMode as any) || (isGeneralLike ? (query.toLowerCase().includes("quiz") || query.toLowerCase().includes("question") ? "quiz" : (query.toLowerCase().includes("overview") ? "overview" : (query.toLowerCase().includes("summar") ? "summary" : (query.toLowerCase().includes("analy") ? "analysis" : "summary")))) : "answer");

    console.log(`🔍 Processing query in mode='${mode}': "${query}"`);

    // Generate embedding for the query
    console.log("🧠 Generating embedding for query...");
    const client = getOpenAiClient();
    const queryEmbedding = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: [query]
    });

    if (!queryEmbedding.data[0]?.embedding) {
      console.log("❌ Failed to generate query embedding");
      return res.status(500).json({ error: "Failed to generate query embedding" });
    }

    const queryVector = queryEmbedding.data[0].embedding as number[];
    console.log(`✅ Query embedding generated (${queryVector.length} dimensions)`);

    // Decide retrieval breadth
    const userK = Number.isFinite(Number(k)) ? Math.max(1, Math.min(100, Number(k))) : undefined;
    const topK = userK ?? (mode === "answer" ? 6 : mode === "quiz" ? 40 : 24);

    // Search Pinecone for similar vectors
    console.log(`🔎 Searching Pinecone for ${topK} similar vectors...`);
    const searchResults = await pinecone.rootIndex.query({
      vector: queryVector,
      topK,
      includeMetadata: true
    });

    const matches = Array.isArray((searchResults as any).matches) ? (searchResults as any).matches : [];
    if (matches.length === 0) {
      console.log("❌ No relevant chunks found in Pinecone");
      return res.json({ 
        mode,
        answer: "I couldn't find any relevant information in my knowledge base to respond.",
        sources: [],
        query
      });
    }

    console.log(`✅ Found ${matches.length} relevant chunks`);

    // Extract the text chunks from search results
    const contextChunks = matches
      .filter((match: any) => match?.metadata && typeof match.metadata.text === "string")
      .map((match: any) => {
        const md = match.metadata as any;
        return {
          text: md.text as string,
          score: match.score as number | undefined,
          source: md.source as string | undefined,
          kind: md.kind as string | undefined,
          chunk_index: md.chunk_index as number | undefined
        };
      })
      .sort((a: { score?: number }, b: { score?: number }) => (b.score || 0) - (a.score || 0));

    if (contextChunks.length === 0) {
      console.log("❌ No text content found in search results");
      return res.json({ 
        mode,
        answer: "I found some results but couldn't extract the text content to respond.",
        sources: [],
        query
      });
    }

    console.log(`📚 Using ${contextChunks.length} chunks for generation`);

    // Build context
    const context = contextChunks.map((c: { text: string }, i: number) => `[#${i + 1}] ${c.text}`).join("\n\n");

    // Build prompt based on mode
    let systemPrompt = "";
    let userPrompt = "";
    if (mode === "answer") {
      systemPrompt = "Ground all factual claims in the provided context. You may adapt, translate, and teach using the user's requested language or phonetics (e.g., Portuguese sound analogies), even if those didactic examples are not verbatim in the context. If the context lacks the factual information needed, say you don't know.";
      userPrompt = `Context:\n${context}\n\nQuestion: ${query}`;
    } else if (mode === "summary") {
      systemPrompt = "Write a clear, unbiased summary using only the provided context. Focus on key points, avoid speculation.";
      userPrompt = `Context:\n${context}\n\nTask: Produce a concise summary (5-10 bullet points).`;
    } else if (mode === "overview") {
      systemPrompt = "Provide a high-level overview using only the provided context. Cover main themes and structure.";
      userPrompt = `Context:\n${context}\n\nTask: Provide a high-level overview (short paragraphs + bullets).`;
    } else if (mode === "analysis") {
      systemPrompt = "Analyze the content using only the provided context. Identify claims, evidence, implications, and gaps.";
      userPrompt = `Context:\n${context}\n\nTask: Provide a structured analysis (claims, evidence, implications, caveats).`;
    } else if (mode === "quiz") {
      systemPrompt = "Create a quiz strictly from the provided context. Do not invent facts. Return only valid JSON.";
      userPrompt = `Context:\n${context}\n\nTask: Generate 5 diverse multiple-choice questions. Each item must include: question (string), options (array of 4 strings), answerIndex (0-3), and explanation (string). Return JSON in the shape {"questions": Array<...>}.`;
    }

    console.log(`🤖 Generating ${mode} with GPT...`);
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "When no language specified, always return the answer in english. Do not include any other text in the response."},
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: mode === "quiz" ? 0.4 : 0.2
    });

    const content = completion.choices[0]?.message?.content?.trim() ?? "";
    console.log("✅ Generation completed");

    // Prepare response with sources
    const sources = contextChunks.map((chunk: { source?: string; kind?: string; score?: number; chunk_index?: number }) => ({
      source: chunk.source,
      kind: chunk.kind,
      relevance_score: chunk.score,
      chunk_index: chunk.chunk_index
    }));

    if (mode === "quiz") {
      let quiz: any = null;
      try { quiz = JSON.parse(content); } catch {}
      return res.json({
        mode,
        quiz,
        raw: quiz ? undefined : content,
        sources,
        query,
        chunks_used: contextChunks.length,
        total_matches: matches.length
      });
    }

    res.json({
      mode,
      answer: content,
      sources,
      query,
      chunks_used: contextChunks.length,
      total_matches: matches.length
    });

  } catch (err: any) {
    console.error("❌ Error during query processing:", err.message);
    res.status(500).json({ error: err.message ?? String(err) });
  }
});

// DELETE /notebooks → empty the index
app.delete("/notebooks", async (_req, res) => {
  try {
    if (typeof pinecone.rootIndex.deleteAll === "function") {
      await pinecone.rootIndex.deleteAll();
    } else {
      // @ts-expect-error delete signature varies
      await pinecone.rootIndex.delete({ deleteAll: true });
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? String(err) });
  }
});

app.listen(3000, () => console.log("http://localhost:3000"));