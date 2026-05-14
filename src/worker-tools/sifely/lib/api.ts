export interface LockPasscode {
  keyboardPwdId: number;
  lockId: string;
  keyboardPwd: string;
  keyboardPwdName: string;
  keyboardPwdType: number; // 1=ONE_TIME, 2=PERMANENT, 3=TIMED
  startDate: number;
  endDate: number;
  status: number;
}

export interface AccessRecord {
  recordId: number;
  lockId: number;
  recordType: number; // 4=passcode
  success: number; // 1=success, 0=failed
  keyboardPwd: string;
  lockDate: number; // ms since epoch
  serverDate: number;
}

export interface SifelyLoginResponse {
  code: number;
  msg?: string;
  data?: {
    token: string;
  };
}

export interface SifelyListResponse<T> {
  list?: T[];
  pageNo?: number;
  pageSize?: number;
  code?: number;
  msg?: string;
}

export interface SifelyPasscodeRaw {
  keyboardPwdId: number;
  keyboardPwd: string;
  keyboardPwdName: string;
  keyboardPwdType: number;
  startDate: number;
  endDate: number;
  status: number;
}

export interface SifelyAccessRecordRaw {
  recordId: number;
  lockId: number;
  recordType: number;
  success: number;
  keyboardPwd: string;
  lockDate: number;
  serverDate: number;
}

export interface SifelyLock {
  lockId: number;
  lockName: string;
  lockAlias: string;
  lockMac: string;
  electricQuantity: number;
  hasGateway: number;
}

export interface SifelyLockListResponse {
  list?: SifelyLock[];
  code?: number;
  msg?: string;
  errcode?: number;
  errmsg?: string;
}

export interface SifelyCreatePasscodeResponse {
  keyboardPwdId?: number;
  code?: number;
  msg?: string;
  errcode?: number;
  errmsg?: string;
}

export interface SifelyMutationResponse {
  errcode?: number;
  errmsg?: string;
  code?: number;
  msg?: string;
}

export interface SifelyConfig {
  username: string;
  password: string;
  clientId: string;
  baseUrl: string;
}

export function resolveConfig(): SifelyConfig {
  const username = process.env['SIFELY_USERNAME'];
  if (!username) {
    throw new Error('SIFELY_USERNAME environment variable is required');
  }

  const password = process.env['SIFELY_PASSWORD'];
  if (!password) {
    throw new Error('SIFELY_PASSWORD environment variable is required');
  }

  const clientId = process.env['SIFELY_CLIENT_ID'] ?? 'VLRE';
  const baseUrl = (process.env['SIFELY_BASE_URL'] ?? 'https://app-smart-server.sifely.com').replace(
    /\/$/,
    '',
  );

  return { username, password, clientId, baseUrl };
}

export async function login(
  baseUrl: string,
  clientId: string,
  username: string,
  password: string,
): Promise<string> {
  const params = new URLSearchParams({
    client_id: clientId,
    username,
    password,
    date: String(Date.now()),
  });

  const response = await fetch(`${baseUrl}/system/smart/login?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      Origin: 'https://manager.sifely.com',
      Referer: 'https://manager.sifely.com/',
      isToken: 'false',
    },
  });

  if (!response.ok) {
    throw new Error(`Sifely login HTTP error: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as SifelyLoginResponse;

  // CRITICAL: Sifely returns HTTP 200 even on auth failure — must check body.code
  if (body.code !== 200 || !body.data?.token) {
    throw new Error(`Sifely authentication failed: ${body.msg ?? `code ${body.code}`}`);
  }

  return body.data.token;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 5,
  baseDelayMs = 2000,
): Promise<T> {
  // CRITICAL: build all request params INSIDE the retry lambda — Sifely returns 500 on stale timestamps
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isRetryable = err instanceof Error && /\b5\d{2}\b/.test(err.message);
      if (!isRetryable || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
  throw lastErr;
}

export function assertListSuccess<T>(body: SifelyListResponse<T>, operationName: string): void {
  if (body.code !== undefined) {
    throw new Error(`Sifely ${operationName} error: ${body.msg ?? `code ${body.code}`}`);
  }
}

export function assertMutationSuccess(
  body: SifelyMutationResponse | SifelyCreatePasscodeResponse,
  operationName: string,
): void {
  if (
    (body.code !== undefined && body.code !== 200) ||
    (body.errcode !== undefined && body.errcode !== 0)
  ) {
    throw new Error(
      `Sifely ${operationName} error: ${body.msg ?? body.errmsg ?? `code ${body.code ?? body.errcode}`}`,
    );
  }
}
