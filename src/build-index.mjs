import fs from "node:fs";
import path from "node:path";
import { embedDocument, MODEL, DTYPE, DIM } from "./embedder.mjs";

const CHUNKS_PATH = path.resolve("data/chunks.json");
const VECTORS_PATH = path.resolve("data/vectors.json");

function calculateNorm(vector) {
  const sumSq = vector.reduce((acc, val) => acc + val * val, 0);
  return Math.sqrt(sumSq);
}

async function main() {
  if (!fs.existsSync(CHUNKS_PATH)) {
    console.error(`오류: 청크 파일(${CHUNKS_PATH})을 찾을 수 없습니다.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(CHUNKS_PATH, "utf-8");
  const chunks = JSON.parse(raw);

  if (!Array.isArray(chunks) || chunks.length === 0) {
    console.error("오류: data/chunks.json이 비어 있거나 올바른 배열이 아닙니다.");
    process.exit(1);
  }

  const seenIds = new Set();
  for (const chunk of chunks) {
    if (!chunk.id || !chunk.text || !chunk.url || !chunk.section) {
      console.error(`오류: 필드가 누락된 청크가 있습니다: ${JSON.stringify(chunk)}`);
      process.exit(1);
    }
    if (seenIds.has(chunk.id)) {
      console.error(`오류: 중복된 청크 ID가 발견되었습니다: ${chunk.id}`);
      process.exit(1);
    }
    seenIds.add(chunk.id);

    if (chunk.text.length < 120) {
      console.warn(`경고: 청크 ${chunk.id}의 글자 수가 120자 미만입니다 (${chunk.text.length}자).`);
    }
  }

  const vectorChunks = [];
  for (const chunk of chunks) {
    const vector = await embedDocument(chunk);
    if (!Array.isArray(vector) || vector.length !== DIM) {
      console.error(`오류: 청크 ${chunk.id}의 임베딩 차원이 ${DIM}이 아닙니다 (실제: ${vector?.length}).`);
      process.exit(1);
    }
    console.log(`✓ ${chunk.id} (${chunk.section})`);
    vectorChunks.push({
      id: chunk.id,
      text: chunk.text,
      url: chunk.url,
      section: chunk.section,
      vector
    });
  }

  const firstVec = vectorChunks[0].vector;
  const first5 = firstVec.slice(0, 5).map(v => v.toFixed(4)).join(", ");
  const norm = calculateNorm(firstVec).toFixed(4);
  console.log(`첫 벡터 앞 5개: [${first5}]  노름: ${norm}`);

  const outputData = {
    model: MODEL,
    dtype: DTYPE,
    dim: DIM,
    createdAt: new Date().toISOString(),
    chunks: vectorChunks
  };

  fs.mkdirSync(path.dirname(VECTORS_PATH), { recursive: true });
  fs.writeFileSync(VECTORS_PATH, JSON.stringify(outputData, null, 2), "utf-8");
  console.log(`저장: data/vectors.json — ${vectorChunks.length}청크 × ${DIM}차원`);
}

main().catch(err => {
  console.error("인덱스 빌드 중 치명적 오류 발생:", err);
  process.exit(1);
});
