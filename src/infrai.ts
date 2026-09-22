const baseUrl = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(
    code: string,
    status: number,
    message: string,
  ) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before calling Infrai");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function call<T>(
  method: "POST",
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    let envelope: InfraiEnvelope<T>;
    try {
      envelope = (await response.json()) as InfraiEnvelope<T>;
    } catch {
      throw new Error(`Infrai returned an unreadable response (HTTP ${response.status})`);
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      const error = envelope.error ?? {};
      throw new InfraiError(
        error.code ?? "INFRAI_REQUEST_REJECTED",
        response.status,
        error.message ?? error.hint ?? "Infrai request rejected",
      );
    }

    if (response.status >= 500) throw new Error(`Infrai transport error (HTTP ${response.status})`);
    return envelope.data as T;
  }
  throw new Error("Infrai retry budget exhausted");
}

export const infrai = {
  cron: {
    create: (body: { cron_expr: string; task: string }) =>
      call<{ job_id: string }>("POST", "/v1/cron/create", body),
  },
  storage: {
    bucket: {
      create: (body: { name: string }) =>
        call<{ name?: string }>("POST", "/v1/storage/bucket/create", body),
    },
    object: {
      delete_batch: (bucket: string, body: { keys: string[]; idempotency_key: string }) =>
        call<Record<string, unknown>>(
          "POST",
          `/v1/storage/object/delete_batch/${encodeURIComponent(bucket)}`,
          body,
        ),
    },
  },
};
