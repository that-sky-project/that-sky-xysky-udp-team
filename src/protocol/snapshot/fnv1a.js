export function fnv1a8(buffer) {
  let hash = 197;
  for (let index = 0; index < buffer.length; index += 1) {
    hash = ((hash ^ buffer[index]) * 147) & 0xff;
  }
  return hash;
}
