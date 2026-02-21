import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./status-badge";

interface ScenarioResult {
  id: string;
  name: string;
  status: string;
  metrics_json: Record<string, unknown>;
}

interface ScenarioTableProps {
  scenarios: ScenarioResult[];
  onSelect: (id: string) => void;
}

export function ScenarioTable({ scenarios, onSelect }: ScenarioTableProps) {
  if (scenarios.length === 0) {
    return <p className="text-muted-foreground text-sm">No scenarios yet.</p>;
  }

  const hasVoice = scenarios.some(
    (s) => s.metrics_json["mean_turn_gap_ms"] !== undefined
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Scenario</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Mean Latency</TableHead>
          <TableHead>P95</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Flow Score</TableHead>
          {hasVoice && <TableHead>Turn Gap</TableHead>}
          {hasVoice && <TableHead>STT Confidence</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {scenarios.map((s) => {
          const m = s.metrics_json;
          return (
            <TableRow
              key={s.id}
              className="cursor-pointer"
              onClick={() => onSelect(s.id)}
            >
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell>
                <StatusBadge status={s.status} />
              </TableCell>
              <TableCell>{String(m["mean_latency_ms"] ?? "-")}ms</TableCell>
              <TableCell>{String(m["p95_latency_ms"] ?? "-")}ms</TableCell>
              <TableCell>{String(m["duration_ms"] ?? "-")}ms</TableCell>
              <TableCell>
                {m["flow_completion_score"] !== undefined
                  ? `${(Number(m["flow_completion_score"]) * 100).toFixed(0)}%`
                  : "-"}
              </TableCell>
              {hasVoice && (
                <TableCell>
                  {m["mean_turn_gap_ms"] !== undefined
                    ? `${m["mean_turn_gap_ms"]}ms`
                    : "-"}
                </TableCell>
              )}
              {hasVoice && (
                <TableCell>
                  {m["mean_stt_confidence"] !== undefined
                    ? String(m["mean_stt_confidence"])
                    : "-"}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
