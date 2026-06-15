import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { reports as reportsApi, logo as logoApi } from "@/lib/api-client";
import { Download, FileText, FileType2, ChevronLeft, Upload, X, Image, Loader2 } from "lucide-react";
import type { ReportLogo } from "@/lib/types";

export const Route = createFileRoute("/reports/$id/export")({
  head: () => ({ meta: [{ title: "Export — Compliance Intelligence" }] }),
  component: ExportPage,
});

const PLACEMENT_OPTIONS = [
  { value: "cover_only",    label: "Cover page only",     desc: "Logo appears once on the report cover." },
  { value: "every_page",    label: "Every page",          desc: "Logo in the header of every page." },
  { value: "selected_pages", label: "Selected pages",    desc: "Choose which sections show the logo." },
] as const;

function ExportPage() {
  const { id } = Route.useParams();

  const [logo, setLogo] = useState<ReportLogo | null>(null);
  const [logoLoading, setLogoLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [placement, setPlacement] = useState<ReportLogo["placement"]>("cover_only");
  const [widthInches, setWidthInches] = useState(2.4);
  const [pagesInput, setPagesInput] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [downloading, setDownloading] = useState<"docx" | "pdf" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    logoApi.get(id)
      .then((d) => {
        if (d.logo) {
          setLogo(d.logo);
          setPlacement(d.logo.placement);
          setWidthInches(d.logo.width_inches);
          setPagesInput((d.logo.pages ?? []).join(", "));
          setPreview(d.logo.image_url);
        }
      })
      .catch(() => {})
      .finally(() => setLogoLoading(false));
  }, [id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const parsedPages = (): number[] => {
    return pagesInput
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);
  };

  const handleSave = async () => {
    setUploading(true);
    setSaveMsg("");
    try {
      const form = new FormData();
      if (file) form.append("image", file);
      form.append("placement", placement);
      form.append("width_inches", String(widthInches));
      if (placement === "selected_pages") {
        form.append("pages", JSON.stringify(parsedPages()));
      } else {
        form.append("pages", JSON.stringify([]));
      }
      const updated = await logoApi.upload(id, form);
      setLogo(updated);
      setSaveMsg("Logo settings saved.");
    } catch {
      setSaveMsg("Failed to save. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    try {
      await logoApi.remove(id);
      setLogo(null);
      setPreview(null);
      setFile(null);
      setPagesInput("");
      setPlacement("cover_only");
    } catch { /* ignore */ }
  };

  const doDownload = async (format: "docx" | "pdf") => {
    setDownloading(format);
    setDownloadError(null);
    try {
      const blob = await reportsApi.exportBlob(id, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${id}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDownloadError(`Failed to download ${format.toUpperCase()}: ${msg}`);
    } finally {
      setDownloading(null);
    }
  };

  const files = [
    { format: "docx" as const, type: "DOCX", icon: FileType2, desc: "Editable Word document with full sections and evidence references." },
    { format: "pdf" as const, type: "PDF", icon: FileText, desc: "Audit-ready PDF with cover page, score summary and gap register." },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Export & download"
        title={`Report #${id}`}
        description="Audit-grade exports include the compliance report with validation findings and score breakdown."
        actions={
          <Link to="/reports/$id" params={{ id }} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Back to report
          </Link>
        }
      />

      <div className="grid grid-cols-12 gap-8">
        {/* Download formats */}
        <section className="col-span-12 lg:col-span-8 space-y-6">
          <div className="space-y-3">
            {downloadError && (
              <div className="px-4 py-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-sm">
                {downloadError}
              </div>
            )}
            {files.map((f) => {
              const Icon = f.icon;
              const isDownloading = downloading === f.format;
              return (
                <div key={f.format} className="bg-card border border-border rounded-sm p-5 flex items-center gap-5">
                  <div className="h-12 w-12 rounded-sm bg-paper border border-border grid place-items-center">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium font-mono text-sm">report-{id}.{f.format}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground border border-border px-1.5 py-0.5 rounded-sm">{f.type}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
                  </div>
                  <button onClick={() => doDownload(f.format)} disabled={isDownloading || !!downloading}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-foreground text-background rounded-sm hover:opacity-90 disabled:opacity-50">
                    {isDownloading
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                      : <><Download className="h-3.5 w-3.5" /> Download</>
                    }
                  </button>
                </div>
              );
            })}
          </div>

          {/* Logo configuration */}
          <div className="bg-card border border-border rounded-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-sm">Report Logo</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Upload a logo (company or client) and choose where it appears in the exported document.
                </p>
              </div>
              {logo && (
                <button onClick={handleRemove}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </div>

            {/* Upload zone */}
            <div
              onClick={() => fileRef.current?.click()}
              className="relative border border-dashed border-border rounded-sm p-5 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-accent/30 transition-colors min-h-[120px]"
            >
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              {preview ? (
                <img src={preview} alt="Logo preview" className="max-h-20 max-w-[200px] object-contain" />
              ) : (
                <>
                  <Image className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Click to upload logo (PNG, JPG, SVG)</p>
                </>
              )}
            </div>

            {/* Placement */}
            <div className="space-y-2">
              <label className="label-eyebrow">Placement</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {PLACEMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPlacement(opt.value)}
                    className={`text-left p-3 rounded-sm border text-sm transition-colors ${
                      placement === opt.value
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/30"
                    }`}
                  >
                    <div className="font-medium text-[13px]">{opt.label}</div>
                    <div className="text-[11px] mt-0.5 opacity-70">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Selected pages input */}
            {placement === "selected_pages" && (
              <div className="space-y-1.5">
                <label className="label-eyebrow">Section numbers (comma-separated)</label>
                <input
                  type="text"
                  value={pagesInput}
                  onChange={(e) => setPagesInput(e.target.value)}
                  placeholder="e.g. 1, 2, 3"
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-sm focus:outline-none focus:border-primary font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Section 1 = Cover, 2 = Document Info, 3 = TOC, 4+ = content sections.
                </p>
              </div>
            )}

            {/* Width */}
            <div className="space-y-1.5">
              <label className="label-eyebrow">Logo width — {widthInches.toFixed(1)}"</label>
              <input
                type="range" min={1.0} max={4.0} step={0.1}
                value={widthInches}
                onChange={(e) => setWidthInches(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>1.0"  small</span>
                <span>4.0"  large</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={uploading || (!file && !logo)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-sm hover:opacity-90 disabled:opacity-40"
              >
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Saving…" : "Save logo settings"}
              </button>
              {saveMsg && <span className="text-xs text-muted-foreground">{saveMsg}</span>}
            </div>
          </div>
        </section>

        {/* Sidebar */}
        <aside className="col-span-12 lg:col-span-4 space-y-4">
          <div className="bg-card border border-border rounded-sm p-5">
            <div className="label-eyebrow mb-3">Export options</div>
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between"><span className="text-muted-foreground">Watermark date</span><span className="font-mono text-xs">{new Date().toLocaleDateString()}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Includes gaps</span><span className="font-mono text-xs">yes</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Score summary</span><span className="font-mono text-xs">yes</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Logo</span><span className="font-mono text-xs">{logo ? logo.placement.replace("_", " ") : "none"}</span></li>
            </ul>
          </div>
          {!logoLoading && !logo && (
            <div className="bg-card border border-border rounded-sm p-4">
              <p className="text-xs text-muted-foreground">
                No logo configured. Upload a logo above to brand the exported document.
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
