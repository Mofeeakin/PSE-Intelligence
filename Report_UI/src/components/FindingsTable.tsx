import type { ServiceType } from "@/lib/types";

const JSON_PREFIX = "__JSON__:";

interface GapFinding {
  clause_ref?: string;
  control?: string;
  current_state?: string;
  gap_delta?: string;
  circ_rating?: string;
  recommendation?: string;
}

interface AuditFinding {
  clause_ref?: string;
  control?: string;
  audit_finding?: string;
  evidence_ref?: string;
  status?: string;
  action_required?: string;
}

type Finding = GapFinding & AuditFinding;

const RATING_STYLES: Record<string, string> = {
  // Green — compliant / fully implemented
  "Fully Implemented":
    "text-[oklch(0.4_0.12_145)] bg-[oklch(0.4_0.12_145)]/10 border-[oklch(0.4_0.12_145)]/30",
  FI: "text-[oklch(0.4_0.12_145)] bg-[oklch(0.4_0.12_145)]/10 border-[oklch(0.4_0.12_145)]/30",
  Conformant:
    "text-[oklch(0.4_0.12_145)] bg-[oklch(0.4_0.12_145)]/10 border-[oklch(0.4_0.12_145)]/30",
  "OBS":
    "text-[oklch(0.4_0.12_145)] bg-[oklch(0.4_0.12_145)]/10 border-[oklch(0.4_0.12_145)]/30",
  // Amber — partial / minor
  "Partially Implemented":
    "text-[oklch(0.45_0.13_70)] bg-[oklch(0.45_0.13_70)]/10 border-[oklch(0.45_0.13_70)]/30",
  PI: "text-[oklch(0.45_0.13_70)] bg-[oklch(0.45_0.13_70)]/10 border-[oklch(0.45_0.13_70)]/30",
  MiNC: "text-[oklch(0.45_0.13_70)] bg-[oklch(0.45_0.13_70)]/10 border-[oklch(0.45_0.13_70)]/30",
  "Minor Non-Conformity":
    "text-[oklch(0.45_0.13_70)] bg-[oklch(0.45_0.13_70)]/10 border-[oklch(0.45_0.13_70)]/30",
  "Minor Non-Conformance":
    "text-[oklch(0.45_0.13_70)] bg-[oklch(0.45_0.13_70)]/10 border-[oklch(0.45_0.13_70)]/30",
  // Red — not implemented / major
  "Not Implemented":
    "text-destructive bg-destructive/10 border-destructive/30",
  NI: "text-destructive bg-destructive/10 border-destructive/30",
  MaNC: "text-destructive bg-destructive/10 border-destructive/30",
  "Major Non-Conformity": "text-destructive bg-destructive/10 border-destructive/30",
  "Major Non-Conformance": "text-destructive bg-destructive/10 border-destructive/30",
};

function RatingBadge({ rating }: { rating: string }) {
  const cls =
    RATING_STYLES[rating] ||
    "text-muted-foreground bg-muted/60 border-border";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-sm border text-[11px] font-mono leading-tight whitespace-nowrap ${cls}`}
    >
      {rating}
    </span>
  );
}

function Cell({ text }: { text?: string | null }) {
  return (
    <td className="px-3 py-2.5 text-sm text-foreground/80 align-top leading-snug max-w-[280px]">
      {text || <span className="text-muted-foreground/50 font-mono text-xs">—</span>}
    </td>
  );
}

function GapTable({ findings }: { findings: GapFinding[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            {["Clause", "Control", "Current State", "Gap / Delta", "Rating", "Recommendation"].map(
              (h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {findings.map((f, i) => (
            <tr key={i} className="hover:bg-accent/30 transition-colors">
              <td className="px-3 py-2.5 align-top">
                <span className="font-mono text-[12px] font-semibold text-primary">
                  {f.clause_ref || "—"}
                </span>
              </td>
              <Cell text={f.control} />
              <Cell text={f.current_state} />
              <Cell text={f.gap_delta} />
              <td className="px-3 py-2.5 align-top">
                {f.circ_rating ? (
                  <RatingBadge rating={f.circ_rating} />
                ) : (
                  <span className="text-muted-foreground/50 font-mono text-xs">—</span>
                )}
              </td>
              <Cell text={f.recommendation} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditTable({ findings }: { findings: AuditFinding[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            {["Clause", "Control", "Audit Finding", "Evidence", "Status", "Action Required"].map(
              (h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {findings.map((f, i) => (
            <tr key={i} className="hover:bg-accent/30 transition-colors">
              <td className="px-3 py-2.5 align-top">
                <span className="font-mono text-[12px] font-semibold text-primary">
                  {f.clause_ref || "—"}
                </span>
              </td>
              <Cell text={f.control} />
              <Cell text={f.audit_finding} />
              <td className="px-3 py-2.5 align-top text-xs text-muted-foreground font-mono">
                {f.evidence_ref || "—"}
              </td>
              <td className="px-3 py-2.5 align-top">
                {f.status ? (
                  <RatingBadge rating={f.status} />
                ) : (
                  <span className="text-muted-foreground/50 font-mono text-xs">—</span>
                )}
              </td>
              <Cell text={f.action_required} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FindingsTable({
  content,
  serviceType,
}: {
  content: string;
  serviceType?: ServiceType;
}) {
  if (!content.startsWith(JSON_PREFIX)) {
    // Plain prose section — render as formatted paragraphs
    return (
      <div className="text-[15px] leading-relaxed space-y-3">
        {content.split(/\n{2,}/).map((para, i) => (
          <p key={i}>{para.trim()}</p>
        ))}
      </div>
    );
  }

  let findings: Finding[] = [];
  try {
    const parsed = JSON.parse(content.slice(JSON_PREFIX.length));
    if (Array.isArray(parsed)) findings = parsed;
  } catch {
    return <p className="text-sm text-destructive font-mono">Failed to parse findings data.</p>;
  }

  if (findings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No findings recorded for this clause group.</p>
    );
  }

  // Detect type by first finding's keys if serviceType not explicit
  const isGap =
    serviceType === "gap_assessment" ||
    (serviceType === undefined && "circ_rating" in (findings[0] ?? {}));

  return isGap ? (
    <GapTable findings={findings as GapFinding[]} />
  ) : (
    <AuditTable findings={findings as AuditFinding[]} />
  );
}
