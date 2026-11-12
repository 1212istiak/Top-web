import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useGetSettings } from "@workspace/api-client-react";
import { usePageMeta } from "@/hooks/use-page-meta";

const LAST_UPDATED = "13 November 2026";

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  const { data: settings } = useGetSettings();

  return (
    <div className="min-h-screen w-full bg-background">
      <header className="border-b border-white/5">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <Link
            href="/"
            className="text-xl md:text-2xl font-bold color-cycle-text uppercase tracking-wider"
            style={{ fontFamily: "'Cinzel Decorative', serif" }}
          >
            {settings?.websiteTitle || "TVR Dubbers"}
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </div>
      </header>

      <main id="main-content" className="container mx-auto px-4 py-12 md:py-16 max-w-3xl">
        <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated {LAST_UPDATED}</p>
        <div className="space-y-8 text-muted-foreground leading-relaxed [&_h2]:text-xl [&_h2]:font-display [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2">
          {children}
        </div>

        <div className="mt-12 pt-8 border-t border-border text-sm">
          {settings?.telegram ? (
            <p>
              Questions about this page? Message us on{" "}
              <a
                href={settings.telegram}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300"
              >
                Telegram
              </a>
              .
            </p>
          ) : (
            <p>Questions about this page? Reach the team through the social links on the home page.</p>
          )}
        </div>
      </main>
    </div>
  );
}

export function PrivacyPage() {
  usePageMeta({ title: "Privacy policy | TVR Dubbers" });

  return (
    <LegalLayout title="Privacy policy">
      <section>
        <h2>Who we are</h2>
        <p>
          TVR Dubbers (The Voice of Rockstar'z) is a fan-made Bangla dubbing group. This website lets you watch our
          Bangla dub of Battle Through the Heavens. This page explains what the site stores about you and why.
        </p>
      </section>

      <section>
        <h2>What you can give us</h2>
        <ul>
          <li>
            <strong className="text-foreground">Comments.</strong> If you post a comment, we store the nickname you
            type (or "Anonymous"), the comment text, and the time. Comments are public on the episode they were
            posted on. Please do not put personal details in a comment.
          </li>
          <li>
            <strong className="text-foreground">Reactions.</strong> When you react to an episode, we store the
            reaction together with a random visitor ID so that each visitor has one reaction per episode. The ID is
            not linked to your name or account.
          </li>
          <li>
            <strong className="text-foreground">Views.</strong> We count how many times an episode is opened. The
            count is a single number and does not identify you.
          </li>
        </ul>
        <p>
          We do not ask you to create an account, and we do not ask for your email address or phone number.
        </p>
      </section>

      <section>
        <h2>What stays in your browser</h2>
        <p>The site saves a few small items in your browser's local storage on your own device:</p>
        <ul>
          <li>Your light or dark theme choice.</li>
          <li>Your language choice for the about text (English or Bengali).</li>
          <li>The last episode you opened, so the site can show a Resume tag.</li>
          <li>The random visitor ID used for reactions.</li>
        </ul>
        <p>You can clear these at any time from your browser settings. The site still works without them.</p>
      </section>

      <section>
        <h2>Technical data</h2>
        <p>
          Our servers receive your IP address when you load the site or post a comment. We use it only to limit
          spam, such as how many comments can be sent in a minute, and we do not store it with your comment.
        </p>
      </section>

      <section>
        <h2>Third parties</h2>
        <ul>
          <li>
            <strong className="text-foreground">Video players.</strong> Episodes play through embedded players from
            services such as Dailymotion and Rumble. When a player loads, that service can receive your IP address,
            set its own cookies, and show ads. Their own privacy policies apply to that data.
          </li>
          <li>
            <strong className="text-foreground">Fonts.</strong> Page fonts load from Google Fonts, which means your
            browser contacts Google's servers.
          </li>
          <li>
            <strong className="text-foreground">Hosting.</strong> The site is delivered through Cloudflare, and the
            data behind it is stored with our hosting and database providers.
          </li>
          <li>
            <strong className="text-foreground">Search.</strong> We use Google Search Console to see how the site
            appears in search results. It does not run on your visits.
          </li>
        </ul>
        <p>This site does not run advertising or analytics scripts of its own.</p>
      </section>

      <section>
        <h2>Removing a comment</h2>
        <p>
          If you want one of your comments removed, message us with the episode and the comment text and we will
          delete it.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>If we change how the site handles data, we will update this page and the date at the top.</p>
      </section>
    </LegalLayout>
  );
}

export function TermsPage() {
  usePageMeta({ title: "Terms of use | TVR Dubbers" });

  return (
    <LegalLayout title="Terms of use">
      <section>
        <h2>About this site</h2>
        <p>
          TVR Dubbers (The Voice of Rockstar'z) is an independent, fan-made Bangla dubbing group. We are not
          affiliated with the creators, studios, or rights holders of Battle Through the Heavens.
        </p>
      </section>

      <section>
        <h2>Ownership</h2>
        <p>
          Battle Through the Heavens, its characters, and the original video belong to their respective owners. The
          Bangla voice performance, direction, and audio editing are the work of our team.
        </p>
      </section>

      <section>
        <h2>Using the site</h2>
        <ul>
          <li>You may watch the episodes and share links to this site.</li>
          <li>Do not try to break, overload, or get unauthorised access to the site or its admin area.</li>
          <li>Do not scrape the site in a way that slows it down for other viewers.</li>
        </ul>
      </section>

      <section>
        <h2>Comments</h2>
        <p>Comments are public. You are responsible for what you post. We may delete comments that contain:</p>
        <ul>
          <li>Hate speech, threats, or harassment.</li>
          <li>Spam, scams, or links to harmful sites.</li>
          <li>Personal information about other people.</li>
        </ul>
      </section>

      <section>
        <h2>Third party players</h2>
        <p>
          Episodes are streamed through third party services. We do not control their availability, ads, or
          policies, and an episode can stop playing if one of them removes or blocks a video.
        </p>
      </section>

      <section>
        <h2>Rights holder concerns</h2>
        <p>
          If you own rights to material shown on this site and have a concern, message us with the episode and a
          description of the issue. We will review it and respond.
        </p>
      </section>

      <section>
        <h2>No guarantees</h2>
        <p>
          The site is provided as it is. We work to keep it online, but we cannot promise it will always be
          available or free of errors, and we are not liable for losses that come from using it.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>We may update these terms. Continued use of the site after a change means you accept the new version.</p>
      </section>
    </LegalLayout>
  );
}
