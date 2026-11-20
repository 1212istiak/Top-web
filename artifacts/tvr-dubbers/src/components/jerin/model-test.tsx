import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, MinusCircle, Loader2 } from "lucide-react";
import { runModelCheck, type ModelCheckResult } from "./api";

// Runs six quick real tests (reply, Bangla, thinking, tools, streaming, Search) against one model,
// then the same tests on a baseline model so the speed can be compared.

const NAMES: Record<string, string> = {
  "gemini-3.6-flash": "3.6 Flash",
  "gemini-3.7-flash": "3.7 Flash",
  "gemini-3.8-flash": "3.8 Flash",
  "gemini-4-hydrogen": "4 Hydrogen",
};
const nice = (m: string) => NAMES[m] ?? m;

function verdict(r: ModelCheckResult): { text: string; tone: string } {
  if (!r.available) return { text: "Not available on your API keys", tone: "text-red-600" };
  if (r.summary.failed === 0) return { text: "Works well", tone: "text-emerald-600" };
  return { text: `${r.summary.failed} test${r.summary.failed === 1 ? "" : "s"} failed`, tone: "text-amber-600" };
}

function Icon({ s }: { s: "pass" | "fail" | "skip" }) {
  if (s === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />;
  if (s === "fail") return <XCircle className="h-4 w-4 text-red-600 shrink-0" />;
  return <MinusCircle className="h-4 w-4 text-muted-foreground shrink-0" />;
}

function ResultTable({ r }: { r: ModelCheckResult }) {
  const v = verdict(r);
  return (
    <div className="rounded-lg border border-border bg-black/20 p-3 space-y-2" data-testid={`modelcheck-${r.model}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-semibold">{nice(r.model)}</div>
        <div className={`text-sm font-medium ${v.tone}`}>{v.text}</div>
      </div>
      <ul className="space-y-1.5">
        {r.tests.map((t) => (
          <li key={t.id} className="flex items-start gap-2 text-sm">
            <Icon s={t.status} />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2">
                <span>{t.label}</span>
                <span className="text-xs text-muted-foreground shrink-0">{(t.ms / 1000).toFixed(1)} s</span>
              </div>
              {t.note && <div className="text-xs text-muted-foreground break-words">{t.note}</div>}
              {t.sample && <div className="text-xs text-muted-foreground/80 italic break-words line-clamp-2">“{t.sample}”</div>}
            </div>
          </li>
        ))}
      </ul>
      {r.available && (
        <div className="text-xs text-muted-foreground">
          {r.summary.passed} passed · {r.summary.failed} failed · {r.summary.skipped} skipped · average {(r.summary.avgMs / 1000).toFixed(1)} s per test
        </div>
      )}
    </div>
  );
}

export function ModelTestPanel({ model, onClose }: { model: string; onClose: () => void }) {
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("");
  const [results, setResults] = useState<ModelCheckResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setResults([]);
    try {
      setStage(`Testing ${nice(model)}…`);
      const main = await runModelCheck(model);
      setResults([main]);
      if (main.available) {
        const base = model === "gemini-3.8-flash" ? "gemini-3.7-flash" : "gemini-3.8-flash";
        setStage(`Testing ${nice(base)} for comparison…`);
        try {
          const b = await runModelCheck(base);
          setResults([main, b]);
        } catch (e: any) {
          setError(`Comparison skipped: ${e?.message || "failed"}`);
        }
      }
    } catch (e: any) {
      setError(e?.message || "The test failed.");
    } finally {
      setRunning(false);
      setStage("");
    }
  };

  const [a, b] = results;
  const speed =
    a && b && a.available && b.available && a.summary.avgMs > 0 && b.summary.avgMs > 0
      ? `${nice(a.model)} averaged ${(a.summary.avgMs / 1000).toFixed(1)} s per test, ${nice(b.model)} ${(b.summary.avgMs / 1000).toFixed(1)} s.`
      : null;

  return (
    <div className="rounded-lg border border-cyan-900/40 bg-black/30 p-3 space-y-3" data-testid="model-test-panel">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm font-medium">Test {nice(model)}</div>
        <Button size="sm" onClick={run} disabled={running} className="bg-cyan-600 hover:bg-cyan-500 text-white">
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {running ? stage || "Testing…" : results.length ? "Run again" : "Run tests"}
        </Button>
        <button className="ml-auto text-xs text-muted-foreground underline" onClick={onClose}>
          close
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Sends about six tiny real requests (a few seconds, almost no quota). Use it after switching to a new model.
      </p>
      {error && (
        <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">{results.map((r) => <ResultTable key={r.model} r={r} />)}</div>
      {speed && <div className="text-xs text-muted-foreground">{speed}</div>}
    </div>
  );
}
