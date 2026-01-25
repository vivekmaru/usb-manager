import { stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { SmartOrganizationConfig } from '@usb-ingest/shared';

interface FileMetadata {
  year: string;
  month: string;
  day: string;
  name: string;
  ext: string;
  type: string;
}

async function getFileMetadata(filePath: string): Promise<FileMetadata> {
  const stats = await stat(filePath);
  const date = stats.mtime; // Use modification time
  const fileName = basename(filePath);
  const ext = extname(filePath).slice(1); // Remove leading dot

  // Determine file type based on extension
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'heic', 'raw', 'cr2', 'nef', 'arw', 'dng'];
  const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'];
  const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'];
  const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf'];

  let type = 'other';
  if (imageExts.includes(ext.toLowerCase())) type = 'image';
  else if (videoExts.includes(ext.toLowerCase())) type = 'video';
  else if (audioExts.includes(ext.toLowerCase())) type = 'audio';
  else if (docExts.includes(ext.toLowerCase())) type = 'document';

  return {
    year: date.getFullYear().toString(),
    month: (date.getMonth() + 1).toString().padStart(2, '0'),
    day: date.getDate().toString().padStart(2, '0'),
    name: fileName,
    ext,
    type,
  };
}

export async function getOrganizedPath(
  sourcePath: string,
  baseDestination: string,
  config: SmartOrganizationConfig
): Promise<string> {
  const metadata = await getFileMetadata(sourcePath);
  const pattern = config.pattern || '{year}/{month}/{day}/{name}';

  // Replace pattern variables
  let organizedPath = pattern
    .replace(/{year}/g, metadata.year)
    .replace(/{month}/g, metadata.month)
    .replace(/{day}/g, metadata.day)
    .replace(/{name}/g, metadata.name)
    .replace(/{ext}/g, metadata.ext)
    .replace(/{type}/g, metadata.type);

  return join(baseDestination, organizedPath);
}
