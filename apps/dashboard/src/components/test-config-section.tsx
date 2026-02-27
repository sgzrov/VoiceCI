"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { TestSpec } from "@/lib/types";

interface TestConfigSectionProps {
  testSpec: TestSpec;
}

const AUDIO_TEST_LABELS: Record<string, string> = {
  echo: "Echo Detection",
  barge_in: "Barge-in Handling",
  ttfb: "Time to First Byte",
  silence_handling: "Silence Handling",
  connection_stability: "Connection Stability",
  response_completeness: "Response Completeness",
};

export function TestConfigSection({ testSpec }: TestConfigSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const hasAudio = testSpec.audio_tests && testSpec.audio_tests.length > 0;
  const hasConversation =
    testSpec.conversation_tests && testSpec.conversation_tests.length > 0;

  if (!hasAudio && !hasConversation) return null;

  return (
    <div className="rounded-md border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium hover:bg-accent/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        Test Configuration
        <span className="text-xs text-muted-foreground font-normal ml-auto">
          {[
            hasAudio && `${testSpec.audio_tests!.length} audio`,
            hasConversation &&
              `${testSpec.conversation_tests!.length} conversation`,
          ]
            .filter(Boolean)
            .join(", ")}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t">
          {hasAudio && (
            <div className="pt-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Audio Tests
              </p>
              <div className="flex flex-wrap gap-1.5">
                {testSpec.audio_tests!.map((test) => (
                  <span
                    key={test}
                    className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-mono"
                  >
                    {AUDIO_TEST_LABELS[test] ?? test}
                  </span>
                ))}
              </div>
            </div>
          )}

          {hasConversation && (
            <div className="pt-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Conversation Tests
              </p>
              <div className="space-y-3">
                {testSpec.conversation_tests!.map((test, i) => (
                  <div key={i} className="rounded-md bg-muted/50 p-3">
                    <p className="text-sm font-medium">
                      {test.name ?? `Test ${i + 1}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      &ldquo;{test.caller_prompt}&rdquo;
                    </p>
                    <span className="text-[10px] text-muted-foreground mt-1 inline-block">
                      Max {test.max_turns} turns
                    </span>
                    {test.eval.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                          Eval questions
                        </p>
                        <ul className="space-y-0.5">
                          {test.eval.map((q, j) => (
                            <li
                              key={j}
                              className="text-xs text-muted-foreground"
                            >
                              {q}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
