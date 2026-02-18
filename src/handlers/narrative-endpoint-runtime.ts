import { compareByCategory, type EmailInsight } from "../domain/email-insight.js";
import type { EmailMetadata } from "../domain/email-metadata.js";
import { parseNarrativeRequest, narrativeRequestSchema } from "../domain/narrative-request.js";
import {
  buildNarrative,
  extractActionItems,
  formatActionItemsSection,
  formatUrgencySection
} from "./narrative-briefing.js";
import {
  LOOKBACK_HOURS,
  LOOKBACK_WINDOW_MS,
  MAX_ACTION_ITEMS,
  MAX_BRIEFING_BULLETS,
  MAX_NARRATIVE_WORDS_BEFORE_ACTION_ITEMS
} from "./narrative-constants.js";
import {
  buildLookbackQuery,
  filterEmailsInLookbackWindow,
  resolveLookbackWindow,
  type LookbackWindow
} from "./narrative-lookback-window.js";

const DEFAULT_THREAD_PREFIX = "thread";
const DEFAULT_RUN_PREFIX = "run";

export {
  LOOKBACK_HOURS,
  LOOKBACK_WINDOW_MS,
  MAX_ACTION_ITEMS,
  MAX_BRIEFING_BULLETS,
  MAX_NARRATIVE_WORDS_BEFORE_ACTION_ITEMS,
  buildLookbackQuery,
  buildNarrative,
  extractActionItems,
  filterEmailsInLookbackWindow,
  formatActionItemsSection,
  formatUrgencySection,
  resolveLookbackWindow,
  type LookbackWindow
};

export type NarrativeRunContext = {
  runId: string;
  threadId: string;
};

export type NarrativeAnalysisResult = {
  email: EmailMetadata;
  insight: EmailInsight;
};

export async function parseNarrativeRequestBody(request: Request): Promise<unknown> {
  if (!request.body) {
    return {};
  }

  try {
    return (await request.json()) as unknown;
  } catch {
    return {};
  }
}

export function parseNarrativeRequestBodyAsObject(
  input: unknown
): ReturnType<typeof parseNarrativeRequest> {
  if (!input || typeof input !== "object") {
    return {};
  }

  const validated = narrativeRequestSchema.safeParse(input);

  if (!validated.success) {
    return {};
  }

  return parseNarrativeRequest(validated.data);
}

export function resolveNarrativeRunContext(input: unknown, requestId: string): NarrativeRunContext {
  const parsed = parseNarrativeRequestBodyAsObject(input);

  return {
    runId: parsed.runId ?? `${DEFAULT_RUN_PREFIX}-${requestId}`,
    threadId: parsed.threadId ?? `${DEFAULT_THREAD_PREFIX}-${requestId}`
  };
}

type AnalyzeEmailsParams = {
  emails: EmailMetadata[];
  signal: AbortSignal;
  model: string;
  extractEmailInsight: (model: string, email: EmailMetadata) => Promise<EmailInsight>;
  onInsight: () => void;
  onFailure: (error: unknown) => void;
  onAbort: () => void;
};

export async function analyzeEmails(
  params: AnalyzeEmailsParams
): Promise<Array<NarrativeAnalysisResult>> {
  const results: NarrativeAnalysisResult[] = [];

  for (const email of params.emails) {
    if (params.signal.aborted) {
      params.onAbort();
      break;
    }

    try {
      const insight = await params.extractEmailInsight(params.model, email);
      params.onInsight();
      results.push({ email, insight });
    } catch (error) {
      params.onFailure(error);
      continue;
    }
  }

  return results;
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function orderByPriorityAndCategory(
  results: NarrativeAnalysisResult[]
): NarrativeAnalysisResult[] {
  return results.slice().sort((a, b) => compareByCategory(a.insight, b.insight));
}
