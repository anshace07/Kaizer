import { Gauge } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";

// Rule: never show a number we didn't measure. Until eval/ runs, this page stays empty.
export default function PerformancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Performance &amp; Reliability</h1>
        <p className="text-sm text-slate-500">Extraction accuracy and noise robustness on the synthetic test set.</p>
      </div>
      <Card>
        <CardContent>
          <EmptyState
            icon={Gauge}
            title="Not evaluated yet"
            text="Results will appear here after the evaluation scripts are run on the test utterances. No numbers are shown until they are measured."
          />
        </CardContent>
      </Card>
    </div>
  );
}
