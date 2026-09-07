import { createHash } from 'node:crypto';

export function hashContent(subject: string, bodyMarkdown: string): string {
  // Length-prefix each field before hashing so the subject/body boundary can never
  // shift and collide — this is injective regardless of what bytes either field
  // contains (unlike a fixed separator character, which a field could itself contain).
  return createHash('sha256')
    .update(`${subject.length}:${subject}${bodyMarkdown.length}:${bodyMarkdown}`)
    .digest('hex');
}
