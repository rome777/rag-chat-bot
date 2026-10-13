import { pipeline } from "@huggingface/transformers";

export const MODEL = "onnx-community/embeddinggemma-300m-ONNX";
export const DTYPE = "q8";
export const DIM = 768;

let extractorPromise = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      console.log("임베딩 모델 불러오는 중…(첫 실행은 다운로드)");
      return await pipeline("feature-extraction", MODEL, { dtype: DTYPE });
    })();
  }
  return await extractorPromise;
}

/**
 * 문서 청크를 임베딩하여 768차원 정규화 벡터 반환
 * @param {{ id: string, section: string, text: string, url: string }} chunk
 * @returns {Promise<number[]>}
 */
export async function embedDocument(chunk) {
  const extractor = await getExtractor();
  const input = `title: ${chunk.section} | text: ${chunk.text}`;
  const output = await extractor(input, { pooling: "mean", normalize: true });
  const rawArray = output.tolist ? output.tolist()[0] : Array.from(output.data);
  return Array.from(rawArray);
}

/**
 * 사용자 질문을 임베딩하여 768차원 정규화 벡터 반환
 * @param {string} question
 * @returns {Promise<number[]>}
 */
export async function embedQuery(question) {
  const extractor = await getExtractor();
  const input = `task: search result | query: ${question}`;
  const output = await extractor(input, { pooling: "mean", normalize: true });
  const rawArray = output.tolist ? output.tolist()[0] : Array.from(output.data);
  return Array.from(rawArray);
}
