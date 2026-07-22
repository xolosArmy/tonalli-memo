const textEncoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).length;
}
