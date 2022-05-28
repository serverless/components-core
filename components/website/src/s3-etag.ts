import crypto from 'crypto';

export default function computeS3ETag(fileContent: Buffer): string {
  return `"${crypto.createHash('md5').update(fileContent).digest('hex')}"`;
}
