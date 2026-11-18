import type { Renderer } from './types';

/** How the UI should present a file, decided by extension (media types are unreliable). */
export function rendererKind(filename: string): Renderer {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'json') return 'json';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'csv') return 'csv';
  if (['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'cs', 'php', 'sh', 'yaml', 'yml', 'toml', 'xml', 'sql', 'diff', 'patch', 'conf', 'ini', 'env', 'dockerfile', 'tf'].includes(ext))
    return 'code';
  if (ext === 'txt' || ext === 'log') return 'text';
  return 'file';
}
