/**
 * Voice Message Handler
 *
 * Downloads Telegram voice/audio messages and transcribes them using Gemini.
 * Requires: ffmpeg (for audio conversion), GEMINI_API_KEY in .env
 */

import { createWriteStream, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import https from 'https';
import { execSync } from 'child_process';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync } from 'fs';

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

export async function handleVoice(ctx) {
  const fileId = ctx.message.voice?.file_id || ctx.message.audio?.file_id;
  if (!fileId) return null;

  const oggPath = join(tmpdir(), `voice_${Date.now()}.ogg`);
  const mp3Path = oggPath.replace('.ogg', '.mp3');

  try {
    // Download from Telegram
    const fileLink = await ctx.telegram.getFileLink(fileId);
    await downloadFile(fileLink.href, oggPath);

    // Convert ogg → mp3 using ffmpeg
    execSync(`ffmpeg -i "${oggPath}" -vn -ar 44100 -ac 2 -b:a 192k "${mp3Path}" -y 2>/dev/null`);

    // Transcribe with Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const audioData = readFileSync(mp3Path);
    const base64Audio = audioData.toString('base64');

    const result = await model.generateContent([
      { inlineData: { mimeType: 'audio/mp3', data: base64Audio } },
      'Transcribe this audio message exactly. Return only the transcription, no commentary.',
    ]);

    return result.response.text().trim();
  } catch (err) {
    console.error('[Voice] Transcription error:', err.message);
    return null;
  } finally {
    // Cleanup temp files
    [oggPath, mp3Path].forEach(p => { try { if (existsSync(p)) unlinkSync(p); } catch {} });
  }
}
