import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { google } from "googleapis";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];

function createOAuth2Client(clientId: string, clientSecret: string, redirectUri: string) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getDriveAuthUrl(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  state: string,
): string {
  const client = createOAuth2Client(clientId, clientSecret, redirectUri);
  return client.generateAuthUrl({
    access_type: "offline",
    scope: DRIVE_SCOPES,
    state,
    prompt: "consent",
  });
}

export async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
): Promise<{ refreshToken: string; accessToken: string }> {
  const client = createOAuth2Client(clientId, clientSecret, redirectUri);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error("no_refresh_token");
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token ?? "",
  };
}

export async function uploadFileToDrive(args: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{ fileId: string; webViewLink: string }> {
  const client = createOAuth2Client(args.clientId, args.clientSecret, args.redirectUri);
  client.setCredentials({ refresh_token: args.refreshToken });

  const drive = google.drive({ version: "v3", auth: client });
  const { Readable } = await import("node:stream");
  const stream = Readable.from(args.buffer);

  const response = await drive.files.create({
    requestBody: { name: args.fileName, mimeType: args.mimeType },
    media: { mimeType: args.mimeType, body: stream },
    fields: "id,webViewLink",
  });

  const fileId = response.data.id;
  const webViewLink = response.data.webViewLink;
  if (!fileId || !webViewLink) throw new Error("drive_upload_failed");
  return { fileId, webViewLink };
}

export function encryptToken(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(encrypted: string, keyBase64: string): string {
  // WARNING-11: split on first ":" only — AES ciphertext hex may not contain ":" but IV is always 32 hex chars
  const sep = encrypted.indexOf(":");
  if (sep === -1) throw new Error("invalid_token_format");
  const ivHex = encrypted.slice(0, sep);
  const dataHex = encrypted.slice(sep + 1);
  if (!ivHex || !dataHex) throw new Error("invalid_token_format");
  if (ivHex.length !== 32) throw new Error(`invalid_token_format: expected IV of 32 hex chars, got ${ivHex.length}`);
  const key = Buffer.from(keyBase64, "base64");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}
