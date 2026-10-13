import { WEAK_THRESHOLD } from "./search.mjs";

export const SYSTEM_MESSAGE =
  "당신은 물류창고 재고 조사 안내 도우미입니다. 주어진 자료에 근거한 내용만 답하고, 자료에 없는 정보는 '제가 가진 자료에는 없습니다'라고 답합니다. 실시간 재고 수량이나 로케이션별 수량을 묻는 질문에는 자료에 없다고 말하고 WMS에서 확인하라고 안내합니다. 근거 조각의 ID만 [WH-012]처럼 대괄호로 감싸 해당 문장 끝에 표시합니다.";

/**
 * 질문과 검색 결과 조각들을 LLM에 전달할 사용자 프롬프트로 조립합니다.
 * @param {string} question 
 * @param {Array<{ id: string, score: number, section: string, text: string }>} hits 
 * @returns {string}
 */
export function buildPrompt(question, hits = []) {
  const topScore = hits.length > 0 ? hits[0].score : 0;
  const isWeak = topScore < WEAK_THRESHOLD;

  // ① 자료 소개
  const intro = "다음 자료는 물류창고 재고 조사에 관한 공개 문서와 현장 SOP에서 뽑은 조각입니다.";

  // ② 근거 원칙
  const principle = isWeak
    ? "주의: 검색된 조각의 유사도가 낮습니다. 질문과 완전히 맞는 근거가 아닐 수 있으니, 근거에 있는 내용만 짧게 답하고 자료에 없는 부분은 없다고 말합니다."
    : "자료에 근거한 내용만 답하고, 자료에 없으면 없다고 말합니다.";

  // ③ 출처 규칙
  const sourceRule = "근거가 된 조각의 ID만 [WH-012]처럼 대괄호로 감싸 해당 문장 끝에 표시합니다.";

  // ④ KST 현재 시각
  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "numeric",
    minute: "numeric"
  });
  const timeStr = `현재 시각은 ${timeFormatter.format(now)}(KST)입니다. '지금', '올해', '다음 주' 같은 상대 표현은 이 시각을 기준으로 해석합니다.`;

  // ⑤ [자료] 목록
  const materials = hits
    .map(hit => `[${hit.id}] (${hit.section}) ${hit.text}`)
    .join("\n\n");

  // 프롬프트 조립
  const promptLines = [
    intro,
    principle,
    sourceRule,
    timeStr,
    "",
    "[자료]",
    materials,
    "",
    "[질문]",
    question,
    "",
    "(답할 때 근거로 쓴 자료의 ID를 [WH-012]처럼 문장 끝에 붙입니다.)"
  ];

  return promptLines.join("\n");
}
