import { Link } from "wouter";
import { Home as HomeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";

export default function NotFound() {
  // The host serves the app shell for unknown URLs, so tell search engines
  // this is not a real page.
  usePageMeta({ title: "Page not found | TVR Dubbers", noindex: true });

  return (
    <main className="min-h-screen w-full flex items-center justify-center px-4 bg-background">
      <div className="liquid-tile liquid-static rounded-3xl p-8 md:p-12 max-w-lg w-full text-center space-y-6">
        <img
          src="/logo.png"
          alt="TVR Dubbers"
          width={80}
          height={80}
          className="mx-auto h-20 w-20 rounded-full object-cover"
        />
        <p className="text-sm font-display uppercase tracking-widest text-cyan-400">Error 404</p>
        <h1
          className="text-3xl md:text-4xl font-bold color-cycle-text uppercase tracking-wide"
          style={{ fontFamily: "'Cinzel Decorative', serif" }}
        >
          Lost in the Dou Qi Continent
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          This page does not exist or has moved. The episodes are one tap away.
        </p>
        <Button
          asChild
          size="lg"
          className="h-12 px-8 rounded-full font-bold text-white liquid-pill liquid-pill-active"
        >
          <Link href="/">
            <HomeIcon className="mr-2 h-5 w-5" /> Back to home
          </Link>
        </Button>
      </div>
    </main>
  );
}
