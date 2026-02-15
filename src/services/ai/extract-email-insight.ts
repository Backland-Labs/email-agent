import { anthropic } from "@ai-sdk/anthropic";
import { emailInsightSchema, type EmailInsight } from "../../domain/email-insight.js";
import type { EmailMetadata } from "../../domain/email-metadata.js";
import { buildInsightPrompt } from "./build-insight-prompt.js";

type StreamTextResult = {
  output: Promise<unknown>;
};

type LanguageModel = unknown;

type StreamTextFunction = (options: {
  model: LanguageModel;
  system: string;
  prompt: string;
  output: unknown;
}) => StreamTextResult;

type OutputObjectFunction = (options: { schema: unknown }) => unknown;
type CreateModelFunction = (modelName: string) => LanguageModel;

export type ExtractEmailInsightDependencies = {
  streamText: StreamTextFunction;
  outputObject: OutputObjectFunction;
  createModel: CreateModelFunction;
};

type DependenciesLoader = () => Promise<ExtractEmailInsightDependencies>;

export async function extractEmailInsight(
  modelName: string,
  email: EmailMetadata,
  dependencies?: ExtractEmailInsightDependencies,
  loadDependencies: DependenciesLoader = loadDefaultDependencies
): Promise<EmailInsight> {
  const prompt = buildInsightPrompt(email);
  const resolvedDependencies = dependencies ?? (await loadDependencies());

  try {
    const model = resolvedDependencies.createModel(modelName);
    const result = resolvedDependencies.streamText({
      model,
      system: prompt.system,
      prompt: prompt.user,
      output: resolvedDependencies.outputObject({
        schema: emailInsightSchema
      })
    });

    const output = await result.output;
    return emailInsightSchema.parse(output);
  } catch (error) {
    throw new Error(
      `Failed to extract insight for email "${email.subject}" (${email.id}): ${toErrorMessage(error)}`
    );
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/* c8 ignore start */
async function loadDefaultDependencies(): Promise<ExtractEmailInsightDependencies> {
  const moduleName: string = "ai";

  const aiModule = (await import(moduleName)) as {
    streamText: StreamTextFunction;
    Output: {
      object: OutputObjectFunction;
    };
  };

  return {
    streamText: aiModule.streamText,
    outputObject: aiModule.Output.object,
    createModel: (modelName) => anthropic(modelName)
  };
}
/* c8 ignore stop */
