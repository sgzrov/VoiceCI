"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const DEMO_SUITES = [
  {
    id: "basic",
    name: "Basic Suite",
    path: "demo/suites/basic.json",
    scenarios: [
      { id: "greeting", name: "Greeting Flow" },
      { id: "booking", name: "Booking Flow" },
      { id: "faq", name: "FAQ Flow" },
    ],
  },
  {
    id: "interruptions",
    name: "Interruptions Suite",
    path: "demo/suites/interruptions.json",
    scenarios: [
      { id: "mid-sentence", name: "Mid-Sentence Interrupt" },
      { id: "topic-switch", name: "Topic Switch" },
    ],
  },
];

export default function SuitesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Test Suites</h1>
      <div className="space-y-4">
        {DEMO_SUITES.map((suite) => (
          <Card key={suite.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{suite.name}</CardTitle>
                <Badge variant="secondary">{suite.scenarios.length} scenarios</Badge>
              </div>
              <p className="text-sm text-muted-foreground font-mono">{suite.path}</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {suite.scenarios.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 text-sm py-1"
                  >
                    <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                    <span>{s.name}</span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {s.id}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
