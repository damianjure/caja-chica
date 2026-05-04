import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTelegramFileUrl,
  inferTelegramAudioMimeType,
  transcribeTelegramAudioWithGemini,
} from '../src/server/telegramAudio.ts';

test('buildTelegramFileUrl arma la URL de descarga oficial', () => {
  assert.equal(
    buildTelegramFileUrl('bot-token', 'voice/file_123.oga'),
    'https://api.telegram.org/file/botbot-token/voice/file_123.oga',
  );
});

test('inferTelegramAudioMimeType prioriza mime explícito y hace fallback para voice', () => {
  assert.equal(
    inferTelegramAudioMimeType({ kind: 'audio', mimeType: 'audio/mp4', filePath: 'music/file' }),
    'audio/mp4',
  );

  assert.equal(
    inferTelegramAudioMimeType({ kind: 'voice', mimeType: null, filePath: 'voice/file_123' }),
    'audio/ogg',
  );

  assert.equal(
    inferTelegramAudioMimeType({ kind: 'audio', mimeType: null, filePath: 'audio/report.mp3' }),
    'audio/mpeg',
  );
});

test('transcribeTelegramAudioWithGemini descarga, sube a Gemini, transcribe y limpia el archivo remoto', async () => {
  const calls: Array<Record<string, unknown>> = [];

  const fakeGenAI = {
    files: {
      async upload(params: Record<string, any>) {
        calls.push({ type: 'upload', params });
        return {
          name: 'files/audio-1',
          uri: 'gs://gemini/audio-1',
          mimeType: params.config?.mimeType,
        };
      },
      async delete(params: Record<string, any>) {
        calls.push({ type: 'delete', params });
        return {};
      },
    },
    models: {
      async generateContent(params: Record<string, any>) {
        calls.push({ type: 'generateContent', params });
        return { text: 'gasté cinco mil pesos en media lunas' };
      },
    },
  };

  const transcript = await transcribeTelegramAudioWithGemini({
    genAI: fakeGenAI as any,
    botToken: 'bot-token',
    filePath: 'voice/file_123.oga',
    kind: 'voice',
    mimeType: null,
    fetchImpl: async (url: string) => {
      calls.push({ type: 'fetch', url });
      return new Response(new Blob(['fake-audio'], { type: 'audio/ogg' }), {
        status: 200,
        headers: { 'content-type': 'audio/ogg' },
      });
    },
  });

  assert.equal(transcript, 'gasté cinco mil pesos en media lunas');
  assert.equal(calls[0]?.type, 'fetch');
  assert.equal(calls[1]?.type, 'upload');
  assert.equal(calls[2]?.type, 'generateContent');
  assert.equal(calls[3]?.type, 'delete');

  const generateCall = calls[2] as { params: Record<string, any> };
  assert.equal(generateCall.params.model, 'gemini-2.5-flash');
});
