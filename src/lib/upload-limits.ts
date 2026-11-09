// 3 MiB becomes 4 MiB in base64, leaving room below hosted 4.5 MB request limits.
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
export const MAX_AI_BODY_BYTES = 4_400_000;
