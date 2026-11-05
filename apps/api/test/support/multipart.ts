/** A multipart/form-data body for app.inject: text fields first, then one file. */
export function multipartBody(
  fields: Record<string, string>,
  file?: { name: string; type: string; bytes: Buffer },
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----petcare-test-boundary';
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\n` +
          `Content-Type: ${file.type}\r\n\r\n`,
      ),
      file.bytes,
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

/** The smallest valid PNG (1x1 pixel), padded with a comment chunk to the wanted size. */
export function pngOfSize(size = 0): Buffer {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  return size > png.length ? Buffer.concat([png, Buffer.alloc(size - png.length)]) : png;
}
