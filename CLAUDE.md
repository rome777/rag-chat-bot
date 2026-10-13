# 물류창고 재고 조사 안내 챗봇 (로컬 RAG) — 설계 계약

## 제품
- 물류창고 신규 작업자를 위한 재고 조사(실사) 절차·용어 안내 챗봇. 내 PC에서만 실행하는 Node.js CLI.
- 1단계: 질문과 비슷한 청크를 찾아 보여 준다(검색만). 2단계: 찾은 청크 + 질문을 LLM에 넣어 답변을 만든다.
- 비목표: 웹 화면, 서버, 배포, 실시간 재고 수량 조회(WMS 연동), 로그인.

## 스택
- Node.js ES 모듈(`"type": "module"`), 파일은 `src/*.mjs`. 의존성은 `@huggingface/transformers` 하나만.
  그 외 라이브러리 추가 금지(필요하면 먼저 물어볼 것). TypeScript·빌드 도구 없음.
- 실행은 `node src/파일.mjs 인자…`. 터미널 출력은 한국어.

## 데이터 계약
- 청크 원본 `data/chunks.json`: 배열, 각 항목 `{ id, text, url, section }`.
- 벡터 저장소 `data/vectors.json`: `{ model, dtype, dim, createdAt, chunks: [{ id, text, url, section, vector }] }`.
- id는 `WH-001`부터 연속. text는 최소 120자, 사실 하나. url은 확인 가능한 출처
  (웹 URL은 퍼센트 인코딩, SOP는 `docs/sop.md#제목` 형식에서 제목의 공백을 하이픈으로: `docs/sop.md#실사-차이-처리`).

## 임베딩 계약 (`src/embedder.mjs` 한 곳에서만 정의)
- 모델 `onnx-community/embeddinggemma-300m-ONNX`, transformers.js
  `pipeline("feature-extraction", MODEL, { dtype: "q8" })`, 호출 옵션 `{ pooling: "mean", normalize: true }`, 768차원.
- EmbeddingGemma 공식 프롬프트 형식을 쓴다.
  - 문서: `"title: " + section + " | text: " + text`
  - 질문: `"task: search result | query: " + question`
- 파이프라인은 한 번만 만들어 재사용. export: `embedDocument(chunk)`, `embedQuery(question)`, `MODEL`, `DTYPE`, `DIM`.
- 벡터 저장소의 model·dtype이 현재 embedder와 다르면 검색을 거부하고 "build-index를 다시 실행하라"고 안내.

## 검색 계약 (`src/search.mjs`)
- 벡터는 정규화되어 있으므로 코사인 유사도 = 내적. 점수 내림차순 top-k(기본 3).
- 약한 근거 기준 `WEAK_THRESHOLD = 0.55`는 `src/search.mjs`에서만 정의·export하고, 다른 파일은 import해서 쓴다.
  1위 점수가 이보다 낮으면 "관련 자료가 약함" 표시. 결과는 버리지 않는다.
- `search.mjs`는 다른 파일이 `search()`를 import해도 CLI가 실행되지 않게, 직접 실행됐을 때만 CLI를 돈다
  (`import.meta.url === pathToFileURL(process.argv[1]).href` 확인).

## 생성 계약 (2단계)
- Ollama `http://localhost:11434`, 모델 `qwen3.5:2b`. `POST /api/chat`,
  `{ model, messages, stream: true, think: false, options: { temperature: 0 } }`.
  응답은 줄바꿈 구분 JSON(NDJSON) → `TextDecoder`를 `{ stream: true }`로 써서(한글이 조각 경계에서 깨지지 않게)
  줄 단위로 파싱해 `message.content`를 화면에 바로 출력(스트리밍).
- Ollama 연결 확인은 실제로 LLM을 호출할 때만 한다(`--show-prompt`는 Ollama 없이도 동작).
- 시스템 메시지: "당신은 물류창고 재고 조사 안내 도우미입니다. 주어진 자료에 근거한 내용만 답하고, 자료에 없는 정보는 '제가 가진 자료에는 없습니다'라고 답합니다. 실시간 재고 수량이나 로케이션별 수량을 묻는 질문에는 자료에 없다고 말하고 WMS에서 확인하라고 안내합니다. 근거 조각의 ID만 [WH-012]처럼 대괄호로 감싸 해당 문장 끝에 표시합니다."
- 사용자 메시지(프롬프트) 순서: ① 자료 소개 ② 근거 원칙(약한 근거면 보수 문구) ③ 출처 규칙 ④ KST 현재 시각
  ⑤ `[자료]` + `[WH-xxx] (section) text` 줄들(대괄호 안에는 ID만) ⑥ `[질문]` + 질문 ⑦ 출처 규칙 한 번 더.
  - ③ "근거가 된 조각의 ID만 [WH-012]처럼 대괄호로 감싸 해당 문장 끝에 표시합니다."
  - ⑦ "(답할 때 근거로 쓴 자료의 ID를 [WH-012]처럼 문장 끝에 붙입니다.)"
- 근거 표시는 LLM에 맡기지 않는다. 답변 뒤에 LLM에게 넘긴 자료를 모두 보여 주고, 답변에 ID가 적힌 자료에 ✓를 붙인다.
- Ollama에 연결이 안 되면 "Ollama가 실행 중인지 확인하세요"와 확인 명령을 안내하고 종료.

## 작업 규칙
- 사용자가 요청한 STEP의 파일만 만들거나 고친다. 계약을 바꿔야 하면 먼저 묻는다.
- 확인하지 않은 사실·URL·수치를 지어내지 않는다. 확인 못한 것은 `[검증 필요]` 표시.
- 코드를 만든 뒤 직접 실행해 보고, 실행 결과와 함께 보고한다.
