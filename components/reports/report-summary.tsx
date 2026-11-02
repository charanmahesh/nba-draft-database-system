import { Badge } from "@/components/ui";
import { isGeneratedReport, reportDisplayText } from "@/lib/generated-report";

export function ReportSummary({
  summary,
  className,
}: {
  summary: string;
  className: string;
}) {
  return (
    <>
      {isGeneratedReport(summary) && (
        <Badge className="mb-2">Generated demo</Badge>
      )}
      <p className={className}>{reportDisplayText(summary)}</p>
    </>
  );
}
