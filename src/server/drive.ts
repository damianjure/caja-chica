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

// New tokens use AES-256-GCM (authenticated): "ivHex:tagHex:dataHex" (3 parts).
// Tokens written before the migration are AES-256-CBC: "ivHex:dataHex" (2 parts)
// — decryptToken reads both so existing drive_connections keep working.
export function encryptToken(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(encrypted: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const parts = encrypted.split(":");

  if (parts.length === 3) {
    const [ivHex, tagHex, dataHex] = parts;
    if (ivHex.length !== 24 || tagHex.length !== 32 || !dataHex) {
      throw new Error("invalid_token_format");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  }

  if (parts.length === 2) {
    // Legacy CBC. WARNING-11: IV is always 32 hex chars.
    const [ivHex, dataHex] = parts;
    if (!ivHex || !dataHex) throw new Error("invalid_token_format");
    if (ivHex.length !== 32) throw new Error(`invalid_token_format: expected IV of 32 hex chars, got ${ivHex.length}`);
    const decipher = createDecipheriv("aes-256-cbc", key, Buffer.from(ivHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  }

  throw new Error("invalid_token_format");
}
