import { anthropic } from "@ai-sdk/anthropic";

import {
  draftReplyModelOutputSchema,
  type DraftReplyModelOutput,
  parseDraftReplyModelOutput
} from "../../domain/draft-reply-result.js";
import { buildDraftReplyPrompt, type DraftReplyPromptInput } from "./build-draft-reply-prompt.js";

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

export type DraftReplyExtractionDependencies = {
  streamText: StreamTextFunction;
  outputObject: OutputObjectFunction;
  createModel: CreateModelFunction;
};

type DependenciesLoader = () => Promise<DraftReplyExtractionDependencies>;

export async function extractDraftReply(
  modelName: string,
  input: DraftReplyPromptInput,
  dependencies?: DraftReplyExtractionDependencies,
  loadDependencies: DependenciesLoader = loadDefaultDependencies
): Promise<DraftReplyModelOutput> {
  const prompt = buildDraftReplyPrompt(input);
  const resolvedDependencies = dependencies ?? (await loadDependencies());

  try {
    const model = resolvedDependencies.createModel(modelName);
    const result = resolvedDependencies.streamText({
      model,
      system: prompt.system,
      prompt: prompt.user,
      output: resolvedDependencies.outputObject({
        schema: draftReplyModelOutputSchema
      })
    });

    const output = await result.output;
    return parseDraftReplyModelOutput(output);
  } catch (error) {
    throw new Error(
      `Failed to extract draft reply for email (${input.email.id}): ${toErrorMessage(error)}`
    );
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/* c8 ignore start */
async function loadDefaultDependencies(): Promise<DraftReplyExtractionDependencies> {
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
    createModel: (selectedModelName) => anthropic(selectedModelName)
  };
}
/* c8 ignore stop */
