import { Card, CardContent } from "@/components/ui/card";

interface MetricCardsProps {
  metrics: Record<string, unknown>;
}

export function MetricCards({ metrics }: MetricCardsProps) {
  const cards = [
    {
      label: "Scenarios",
      value: `${metrics["passed"] ?? 0}/${metrics["total_scenarios"] ?? 0}`,
      sub: `${metrics["failed"] ?? 0} failed`,
    },
    {
      label: "Mean Latency",
      value: `${metrics["mean_latency_ms"] ?? 0}ms`,
      sub: null,
    },
    {
      label: "P95 Latency",
      value: `${metrics["p95_latency_ms"] ?? 0}ms`,
      sub: null,
    },
    {
      label: "Max Latency",
      value: `${metrics["max_latency_ms"] ?? 0}ms`,
      sub: null,
    },
    {
      label: "Duration",
      value: `${((metrics["total_duration_ms"] as number) / 1000).toFixed(1)}s`,
      sub: null,
    },
    ...(metrics["total_token_usage"]
      ? [
          {
            label: "Tokens",
            value: String(metrics["total_token_usage"]),
            sub: metrics["total_cost_usd"]
              ? `$${metrics["total_cost_usd"]}`
              : null,
          },
        ]
      : []),
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className="text-xl font-bold mt-1">{card.value}</p>
            {card.sub && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {card.sub}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
