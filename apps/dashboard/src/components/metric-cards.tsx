import { Card, CardContent } from "@/components/ui/card";
import type { RunAggregateV2 } from "@/lib/types";
import { formatDuration } from "@/lib/format";

interface MetricCardsProps {
  aggregate: RunAggregateV2;
}

export function MetricCards({ aggregate }: MetricCardsProps) {
  const totalTests =
    aggregate.audio_tests.total + aggregate.conversation_tests.total;
  const totalPassed =
    aggregate.audio_tests.passed + aggregate.conversation_tests.passed;
  const totalFailed =
    aggregate.audio_tests.failed + aggregate.conversation_tests.failed;

  const cards = [
    {
      label: "Total Tests",
      value: `${totalPassed}/${totalTests}`,
      sub: totalFailed > 0 ? `${totalFailed} failed` : "all passed",
      color: totalFailed > 0 ? "text-red-600" : "text-emerald-600",
    },
    ...(aggregate.audio_tests.total > 0
      ? [
          {
            label: "Audio Tests",
            value: `${aggregate.audio_tests.passed}/${aggregate.audio_tests.total}`,
            sub:
              aggregate.audio_tests.failed > 0
                ? `${aggregate.audio_tests.failed} failed`
                : "all passed",
            color:
              aggregate.audio_tests.failed > 0
                ? "text-red-600"
                : "text-emerald-600",
          },
        ]
      : []),
    ...(aggregate.conversation_tests.total > 0
      ? [
          {
            label: "Conversation Tests",
            value: `${aggregate.conversation_tests.passed}/${aggregate.conversation_tests.total}`,
            sub:
              aggregate.conversation_tests.failed > 0
                ? `${aggregate.conversation_tests.failed} failed`
                : "all passed",
            color:
              aggregate.conversation_tests.failed > 0
                ? "text-red-600"
                : "text-emerald-600",
          },
        ]
      : []),
    {
      label: "Duration",
      value: formatDuration(aggregate.total_duration_ms),
      sub: null,
      color: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {card.label}
            </p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{card.value}</p>
            {card.sub && (
              <p
                className={`text-xs mt-0.5 ${card.color ?? "text-muted-foreground"}`}
              >
                {card.sub}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
