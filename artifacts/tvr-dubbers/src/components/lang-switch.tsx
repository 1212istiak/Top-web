import { Switch } from "@/components/ui/switch";
import { useLang } from "@/hooks/use-lang";

/** The E / B language switch. Every instance shares the same choice. */
export function LangSwitch({ className }: { className?: string }) {
  const [lang, setLang] = useLang();

  return (
    <Switch
      checked={lang === "bn"}
      onCheckedChange={(isBengali) => setLang(isBengali ? "bn" : "en")}
      aria-label="Switch language between English and Bengali"
      className={`h-6 w-11 data-[state=checked]:bg-cyan-600 ${className ?? ""}`}
      thumbClassName="flex h-5 w-5 items-center justify-center data-[state=checked]:translate-x-5"
      thumbIcon={
        <span className="text-[10px] font-bold leading-none text-foreground">
          {lang === "bn" ? "B" : "E"}
        </span>
      }
    />
  );
}
