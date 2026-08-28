const CHUNK_SIZE = 800;
const OVERLAP = 100;

export interface TextChunk {
  content: string;
  index: number;
}

/**
 * Quebra texto longo em chunks de ~800 chars com overlap de 100 chars.
 * Estratégia: divide por parágrafos (\n\n), depois por frases (". ")
 * se o parágrafo ainda for grande demais, então acumula até atingir CHUNK_SIZE.
 */
export function chunkText(text: string): TextChunk[] {
  const sentences = splitIntoSentences(text);
  const chunks: TextChunk[] = [];
  let current = '';
  let idx = 0;

  for (const sentence of sentences) {
    if (current.length + sentence.length > CHUNK_SIZE && current.length > 0) {
      chunks.push({ content: current.trimEnd(), index: idx++ });
      // Overlap: mantém os últimos OVERLAP chars do chunk atual
      current = current.slice(-OVERLAP) + sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim().length > 0) {
    chunks.push({ content: current.trimEnd(), index: idx });
  }

  return chunks;
}

function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];

  for (const paragraph of text.split(/\n\n+/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (trimmed.length <= CHUNK_SIZE) {
      sentences.push(trimmed + '\n\n');
      continue;
    }

    // Parágrafo grande: quebra por frases
    for (const part of trimmed.split(/(?<=\. )/)) {
      if (part.trim()) sentences.push(part);
    }
    sentences.push('\n\n');
  }

  return sentences;
}
