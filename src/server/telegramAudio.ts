import { createPartFromUri, createUserContent } from '@google/genai';

export type TelegramAudioKind = 'voice' | 'audio';

export interface TelegramAudioLikeGenAI {
  files: {
    upload(params: {
      file: Blob;
      config?: { mimeType?: string; displayName?: string };
    }): Promise<{ name?: string; uri?: string; mimeType?: string }>;
    delete(params: { name: string }): Promise<unknown>;
  };
  models: {
    generateContent(params: {
      model: string;
      contents: unknown;
    }): Promise<{
      text?: string;
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }>;
  };
}

export interface InferTelegramAudioMimeTypeArgs {
  kind: TelegramAudioKind;
  mimeType?: string | null;
  filePath?: string | null;
}

export interface TranscribeTelegramAudioArgs extends InferTelegramAudioMimeTypeArgs {
  genAI: TelegramAudioLikeGenAI;
  botToken: string;
  filePath: string;
  fileName?: string | null;
  fetchImpl?: typeof fetch;
}

const AUDIO_EXTENSION_TO_MIME: Record<string, string> = {
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  wav: 'audio/wav',
  webm: 'audio/webm',
};

export function buildTelegramFileUrl(botToken: string, filePath: string) {
  return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
}

export function inferTelegramAudioMimeType(args: InferTelegramAudioMimeTypeArgs) {
  if (args.mimeType?.startsWith('audio/')) return args.mimeType;

  const extension = args.filePath?.split('.').pop()?.toLowerCase() ?? '';
  if (extension && AUDIO_EXTENSION_TO_MIME[extension]) {
    return AUDIO_EXTENSION_TO_MIME[extension];
  }

  if (args.kind === 'voice') return 'audio/ogg';
  return 'audio/mpeg';
}

export async function transcribeTelegramAudioWithGemini({
  genAI,
  botToken,
  filePath,
  kind,
  mimeType,
  fileName,
  fetchImpl = fetch,
}: TranscribeTelegramAudioArgs) {
  const resolvedMimeType = inferTelegramAudioMimeType({ kind, mimeType, filePath });
  const response = await fetchImpl(buildTelegramFileUrl(botToken, filePath));

  if (!response.ok) {
    throw new Error(`telegram_audio_download_failed:${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: resolvedMimeType });
  const uploaded = await genAI.files.upload({
    file: blob,
    config: {
      mimeType: resolvedMimeType,
      displayName: fileName ?? filePath.split('/').pop() ?? 'telegram-audio',
    },
  });

  try {
    const uri = uploaded.uri;
    const uploadedMimeType = uploaded.mimeType ?? resolvedMimeType;

    if (!uri) {
      throw new Error('gemini_audio_upload_missing_uri');
    }

    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: createUserContent([
        createPartFromUri(uri, uploadedMimeType),
        'Transcribí literalmente este audio en texto plano. Respondé SOLO con la transcripción, sin resumen, sin comentarios y sin JSON.',
      ]),
    });

    const transcript = (result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    if (!transcript) {
      throw new Error('gemini_audio_transcript_empty');
    }

    return transcript;
  } finally {
    if (uploaded.name) {
      try {
        await genAI.files.delete({ name: uploaded.name });
      } catch (error) {
        console.warn('Gemini audio file cleanup error:', error);
      }
    }
  }
}
