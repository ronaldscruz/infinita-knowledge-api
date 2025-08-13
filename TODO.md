### High-level goal
Build an Express-based service that ingests multiple large sources (PDFs, YouTube links, text files, audio), converts them to chunks, embeds with OpenAI, and indexes in Pinecone for retrieval and Q&A over a “notebook.”

### Tech stack
- Backend: Express (TypeScript)
- Workers/queue: BullMQ (Redis) for heavy processing
- Vector DB: Pinecone (index per project, namespace per notebook) — see Pinecone project link: [Pinecone project indexes](https://app.pinecone.io/organizations/-OXVYXolMf5ha9tBPd3P/projects/7e97bca4-ed44-4f79-882a-19a720a4ec7a/indexes)
- Object storage: S3-compatible (AWS S3, or MinIO for dev) for large/long-term file storage
- DB for app data: Postgres (via Prisma) for users/notebooks/sources/jobs
- Transcription: OpenAI Whisper (`whisper-1`)
- Embeddings: OpenAI `text-embedding-3-small` (1536-dim; cost-efficient)
- Other libs: `pdfjs-dist`, `yt-dlp` CLI + `ffmpeg`, `multer` or `busboy`, `zod` for validation

### Data model (Postgres)
- users
  - id, email, created_at
- notebooks
  - id, user_id, title, status(enum: pending|processing|ready|error), created_at, updated_at
- sources
  - id, notebook_id, type(enum: pdf|youtube|text|audio|url-text), name, storage_url, bytes, status, created_at
- jobs
  - id, notebook_id, source_id, type(enum: download|transcribe|parse|embed|upsert), status, error, progress(0–100), created_at, updated_at
- chunks
  - id, source_id, chunk_index, token_count, text_hash, created_at
  - Note: actual vectors live in Pinecone; keep chunk metadata here to map results back
- queries (optional log)
  - id, notebook_id, question, created_at

### Pinecone
- Index: single index, metric cosine, dimension 1536 (matches `text-embedding-3-small`)
- Namespace: one namespace per `notebook_id` (keeps per-notebook isolation while avoiding index sprawl)
- Vector id format: `${source_id}:${chunk_index}`
- Metadata stored in Pinecone:
  - notebook_id, source_id, chunk_index, source_name, token_count, maybe a short preview

### File handling and large uploads
- Ingest path options:
  - multipart/form-data uploads (use `multer` or `busboy` streaming to avoid buffering in memory)
  - presigned S3 uploads for very large files (client uploads directly; backend receives the S3 URL)
  - YouTube URL ingestion (download via `yt-dlp` to temp file, transcode with `ffmpeg` as needed)
- For audio: standardize to 16kHz mono WAV/MP3; transcribe with Whisper; cache transcript to object storage
- For PDF: extract text with `pdfjs-dist`, including per-page recovery
- For text: read/normalize encoding, limit max size and stream to storage
- Background processing: enqueue source jobs immediately; API returns 202 + notebook id; clients poll or subscribe to SSE/WebSocket for progress

### Chunking and embeddings
- Chunking strategy:
  - Text chunk size ~1,000–1,500 characters (or ~700–800 tokens), overlap 150–200 tokens
  - Normalize whitespace; strip non-content
- Embedding: `text-embedding-3-small`
- Upsert to Pinecone by batches (e.g., 100–500 vectors per request)
- Store chunk metadata in DB; persist raw text to object storage if needed for auditing

### Query workflow
- Input: question, topK (default 5), optional filters
- Steps:
  1) Embed question
  2) Query Pinecone namespace for `notebook_id`, `topK`, cosine similarity
  3) Fetch chunk metadata from DB (optionally pull short text preview if not already included in metadata)
  4) Compose prompt with topK chunks and `question`
  5) Call `chat.completions.create` with a grounded prompt; return `answer + citations` (chunk refs)
- Response includes:
  - answer: string
  - references: [{ source_id, source_name, chunk_index, score }]

### REST API design
- POST `/notebooks`
  - multipart/form-data:
    - title: string
    - files[]: PDFs, audio, text (0..N)
    - youtube_urls[]: string (0..N)
    - text_items[]: string (0..N)
  - or JSON for S3 URLs:
    - title, sources[] with {type, name, url}
  - Response: 202 Accepted
  - Body: `{ notebook_id, status: "processing" }`
- GET `/notebooks/:id`
  - Returns notebook metadata, current status, job summary per source
- POST `/notebooks/:id/sources`
  - Same payload shapes as create; append new sources; returns 202
- GET `/notebooks/:id/sources`
  - Returns list of sources with status and sizes
- POST `/notebooks/:id/query`
  - Body: `{ question: string, topK?: number }`
  - Returns `{ answer, references }`
- GET `/notebooks/:id/stream` (optional)
  - SSE for progress updates (download/transcribe/parse/embed/upsert)
- DELETE `/notebooks/:id` (optional)
  - Soft-delete DB records; optionally delete namespace in Pinecone and objects in storage

### Processing pipeline (workers)
- download (YouTube/url)
  - `yt-dlp` to temp; `ffmpeg` to normalize audio
- transcribe (audio)
  - Whisper (`whisper-1`), response text saved to object storage; store source row as `type=text`
- parse (pdf/text)
  - pdfjs-dist or raw; produce normalized text
- chunk
  - apply chunking strategy; compute text hash; skip duplicates
- embed
  - `text-embedding-3-small`, batch embeddings; retry with backoff on rate limits
- upsert
  - Pinecone upsert in batches with metadata
- finalize
  - Update notebook status to `ready`

### Suggested database for user data
- Use Postgres with Prisma:
  - Strong relational guarantees for users→notebooks→sources→jobs
  - Mature migrations, indexing, JSON fields when needed
  - Easy to scale and integrate with queues and object storage
- Alternative: MongoDB if you prefer schemaless for flexible source metadata
- For dev: SQLite locally with Prisma; Postgres in staging/prod

### Configuration (env)
- OPENAI_API_KEY or OPEN_API_KEY
- PINECONE_API_KEY, PINECONE_ENV (or controller host), PINECONE_INDEX
- DATABASE_URL (Postgres)
- REDIS_URL (BullMQ)
- S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
- YT_DLP path if not on PATH; FFmpeg must be installed

### Limits and reliability
- Max upload size: large multipart using streaming (no full memory buffering)
- Timeouts: longer server timeouts for init endpoints; actual heavy work in async workers
- Retries: exponential backoff for OpenAI/Pinecone; idempotent upsert based on `${source_id}:${chunk_index}`
- Deduplication: hash chunks to skip re-embedding on re-ingestion
- Observability: request logs, worker logs, job metrics, error capture (e.g., Sentry)
- Security: API key auth or JWTs for user scoping; validate MIME types; sanitize PDFs; rate limit user actions

### Minimal implementation milestones
- M1: Express API skeleton, Postgres schema, Pinecone client init, create/query endpoints (PDF + text)
- M2: Large upload streaming to disk, background workers, progress tracking
- M3: YouTube download + audio transcription pipeline, chunk/embedding/upsert
- M4: S3 offloading for uploads and transcripts; SSE progress
- M5: Hardening (auth, retries, metrics), multi-tenant scoping, clean deletions

Reference
- Pinecone project: [Pinecone project indexes](https://app.pinecone.io/organizations/-OXVYXolMf5ha9tBPd3P/projects/7e97bca4-ed44-4f79-882a-19a720a4ec7a/indexes)

- Added robust ingestion for multiple large sources with streaming and background jobs.
- Namespaced Pinecone by notebook for isolation; embeddings via `text-embedding-3-small`.
- Proposed Postgres (Prisma) for user/notebook/source/job data; S3 for files and transcripts.