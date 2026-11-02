export const GENERATED_REPORT_MARKER =
  "Generated demo scouting text (synthetic; not a real scouting report).";

export function reportDisplayText(summary: string): string {
  const markerWithSeparator = `${GENERATED_REPORT_MARKER} `;
  return summary.startsWith(markerWithSeparator)
    ? summary.slice(markerWithSeparator.length)
    : summary;
}

export function isGeneratedReport(summary: string): boolean {
  return summary.startsWith(`${GENERATED_REPORT_MARKER} `);
}
