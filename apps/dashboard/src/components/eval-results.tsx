"use client";

import { useState } from "react";
import type { EvalResult } from "@/lib/types";

interface EvalResultsProps {
  evalResults: EvalResult[];
  toolCallEvalResults?: EvalResult[];
}

function EvalRow({ eval_ }: { eval_: EvalResult }) {
  const [showReasoning, setShowReasoning] = useState(false);

  return (
    <div
      className="rounded-md border border-border p-3 cursor-pointer hover:bg-accent/30 transition-colors"
      onClick={() => setShowReasoning(!showReasoning)}
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
            eval_.passed ? "bg-emerald-500" : "bg-red-500"
          }`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm">{eval_.question}</p>
          {!eval_.relevant && (
            <span className="text-xs text-muted-foreground">
              (not relevant to conversation)
            </span>
          )}
          {showReasoning && (
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              {eval_.reasoning}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function EvalResults({
  evalResults,
  toolCallEvalResults,
}: EvalResultsProps) {
  return (
    <div className="space-y-4">
      {evalResults.length > 0 && (
        <div className="space-y-2">
          {evalResults.map((eval_, i) => (
            <EvalRow key={i} eval_={eval_} />
          ))}
        </div>
      )}

      {toolCallEvalResults && toolCallEvalResults.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 mt-4">
            Tool Call Evals
          </h4>
          <div className="space-y-2">
            {toolCallEvalResults.map((eval_, i) => (
              <EvalRow key={i} eval_={eval_} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
