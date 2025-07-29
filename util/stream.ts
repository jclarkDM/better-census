
export async function* createLineStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let { done, value } = await reader.read();

  while(!done) {
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");

    while((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex + 1);
      buffer = buffer.slice(newlineIndex + 1);

      yield line.trim();
    }

    ({ done, value } = await reader.read());
  }

  if(buffer.length > 0) {
    yield buffer.trim();
  }
}