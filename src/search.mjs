import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { embedQuery, MODEL, DTYPE } from "./embedder.mjs";

export const WEAK_THRESHOLD = 0.55;
const VECTORS_PATH = path.resolve("data/vectors.json");

let cachedVectorData = null;

function loadVectorData() {
  if (cachedVectorData) return cachedVectorData;
  if (!fs.existsSync(VECTORS_PATH)) {
    console.error(`오류: 벡터 저장소(${VECTORS_PATH})를 찾을 수 없습니다.`);
    console.error("먼저 'node src/build-index.mjs'를 실행하여 인덱스를 빌드하세요.");
    process.exit(1);
  }

  const raw = fs.readFileSync(VECTORS_PATH, "utf-8");
  const data = JSON.parse(raw);

  if (data.model !== MODEL || data.dtype !== DTYPE) {
    console.error("오류: 벡터 저장소의 모델 또는 dtype이 현재 embedder와 다릅니다.");
    console.error(`저장소: model=${data.model}, dtype=${data.dtype}`);
    console.error(`현재 설정: model=${MODEL}, dtype=${DTYPE}`);
    console.error("해결 방법: 'node src/build-index.mjs'를 다시 실행하여 인덱스를 갱신하세요.");
    process.exit(1);
  }

  cachedVectorData = data;
  return data;
}

function dotProduct(vecA, vecB) {
  let sum = 0;
  for (let i = 0; i < vecA.length; i++) {
    sum += vecA[i] * vecB[i];
  }
  return sum;
}

function renderBar(score, length = 20) {
  const clamped = Math.max(0, Math.min(1, score));
  const filled = Math.round(clamped * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

/**
 * 질문과 가장 유사한 top-k 청크를 검색합니다.
 * @param {string} question 
 * @param {number} k 
 * @returns {Promise<Array<{ id: string, score: number, section: string, text: string, url: string }>>}
 */
export async function search(question, k = 3) {
  const data = loadVectorData();
  const queryVec = await embedQuery(question);

  const scored = data.chunks.map(chunk => {
    const score = dotProduct(queryVec, chunk.vector);
    return {
      id: chunk.id,
      score,
      section: chunk.section,
      text: chunk.text,
      url: chunk.url
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

// CLI 실행 가드
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const args = process.argv.slice(2);
  let k = 3;
  const questions = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--k" && i + 1 < args.length) {
      k = parseInt(args[i + 1], 10);
      i++;
    } else {
      questions.push(args[i]);
    }
  }

  if (questions.length === 0) {
    console.log("사용법: node src/search.mjs \"질문1\" [\"질문2\" …] [--k 3]");
    process.exit(0);
  }

  (async () => {
    for (const q of questions) {
      const results = await search(q, k);
      const topScore = results.length > 0 ? results[0].score : 0;
      const isWeak = topScore < WEAK_THRESHOLD;
      const weakBadge = isWeak ? ` ⚠ 관련 자료가 약함(<${WEAK_THRESHOLD})` : "";

      console.log(`\nQ: ${q}${weakBadge}`);
      results.forEach((item, idx) => {
        const bar = renderBar(item.score, 20);
        const snippet = item.text.replace(/\r?\n/g, " ").slice(0, 60);
        console.log(`  ${idx + 1}. ${item.id}  ${item.score.toFixed(3)}  ${bar}  [${item.section}]`);
        console.log(`     ${snippet}…`);
        console.log(`     출처: ${item.url}`);
      });
    }
  })().catch(err => {
    console.error("검색 중 오류:", err);
    process.exit(1);
  });
}
