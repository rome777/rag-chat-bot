export const OLLAMA_HOST = "http://localhost:11434";
export const OLLAMA_MODEL = "qwen3.5:2b";

/**
 * Ollama 서버 실행 여부를 확인합니다.
 * @returns {Promise<boolean>}
 */
export async function pingOllama() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ollama 채팅 API에 스트리밍 요청을 보냅니다.
 * @param {Array<{ role: string, content: string }>} messages 
 * @param {(token: string) => void} onToken 
 * @returns {Promise<string>}
 */
export async function chatStream(messages, onToken) {
  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: true,
      think: false,
      options: {
        temperature: 0
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama API 오류 (${response.status}): ${errText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { stream: true });
  let buffer = "";
  let fullAnswer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.message?.content) {
          const content = parsed.message.content;
          fullAnswer += content;
          if (onToken) {
            onToken(content);
          }
        }
      } catch (e) {
        // 불완전한 JSON 라인은 버퍼로 유지되므로 무시
      }
    }
  }

  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer.trim());
      if (parsed.message?.content) {
        const content = parsed.message.content;
        fullAnswer += content;
        if (onToken) {
          onToken(content);
        }
      }
    } catch {
      // 무시
    }
  }

  return fullAnswer;
}
