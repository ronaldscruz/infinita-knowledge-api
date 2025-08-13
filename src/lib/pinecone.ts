import { Pinecone } from '@pinecone-database/pinecone';

const apiKey = process.env.PINECONE_API_KEY || "";
if (!apiKey) {
  throw new Error("Missing PINECONE_API_KEY in environment. Create a .env with PINECONE_API_KEY=...");
}

const pc = new Pinecone({
  apiKey
});
const rootIndex = pc.index('infinita-knowledge-test');

export const pinecone = {
  rootIndex
};