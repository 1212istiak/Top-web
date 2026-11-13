import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useGetSettings } from "@workspace/api-client-react";
import { LangSwitch } from "@/components/lang-switch";
import { useLang, type Lang } from "@/hooks/use-lang";
import { normalizeWhatsappLink } from "@/components/footer";

// IMPORTANT: the English answers below must stay in sync with the FAQPage
// JSON-LD block in index.html. Search engines expect the structured data to
// match the text visitors can read on the page.

interface Links {
  facebook?: string | null;
  youtube?: string | null;
  telegramChannel?: string | null;
  whatsapp?: string | null;
}

// Renders a link when the admin panel has one saved, plain text otherwise.
function Anchor({ href, children }: { href?: string | null; children: ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-cyan-400 underline underline-offset-4 hover:text-cyan-300"
    >
      {children}
    </a>
  );
}

interface Item {
  q: string;
  a: (l: Links) => ReactNode;
}

const COPY: Record<Lang, { heading: string; items: Item[] }> = {
  en: {
    heading: "Frequently asked questions",
    items: [
      {
        q: "What is TVR Dubbers?",
        a: () =>
          "TVR Dubbers is a dubbing team that brings your favorite anime and donghua in your own language, so you don't have to struggle.",
      },
      {
        q: "Where can I watch Battle Through the Heavens in Bangla dub?",
        a: (l) => (
          <>
            Right here. Open the All Episodes list on this page and tap an episode to play it. You can also find us on
            our <Anchor href={l.facebook}>official Facebook page</Anchor> and{" "}
            <Anchor href={l.youtube}>official YouTube channel</Anchor>.
          </>
        ),
      },
      {
        q: "What is Battle Through the Heavens (BTTH)?",
        a: () =>
          "Battle Through the Heavens, also known as Doupo Cangqiong, is a Chinese donghua based on the web novel by Tian Can Tu Dou. It follows Xiao Yan on the Dou Qi Continent as he faces scorn and works his way up to great power.",
      },
      {
        q: "Is this an official dub?",
        a: () =>
          "No. TVR Dubbers is an independent fan group and is not affiliated with the creators or rights holders of the series. We dub it out of love for the show.",
      },
      {
        q: "How do I know when the next episode is out?",
        a: (l) => (
          <>
            The Next Episode Drops In timer on the home page counts down to the next release. For updates, follow our{" "}
            <Anchor href={l.facebook}>official Facebook page</Anchor>,{" "}
            <Anchor href={l.youtube}>official YouTube channel</Anchor>, or{" "}
            <Anchor href={l.telegramChannel}>Telegram channel</Anchor>.
          </>
        ),
      },
      {
        q: "Who voices the characters?",
        a: () =>
          "Our voice artists work as a team led by Rocky, who is also the voice director and the audio and video editor.",
      },
      {
        q: "An episode will not play. What can I do?",
        a: (l) => (
          <>
            Reload the page, try the other server in the player, or open the site in another browser. Still stuck?
            Search for the episode on our <Anchor href={l.facebook}>official Facebook page</Anchor> or{" "}
            <Anchor href={l.youtube}>official YouTube channel</Anchor>, message Rocky personally on{" "}
            <Anchor href={normalizeWhatsappLink(l.whatsapp)}>WhatsApp</Anchor>, or find our team on the{" "}
            <Anchor href={l.telegramChannel}>Telegram channel</Anchor>.
          </>
        ),
      },
      {
        q: "Which episodes are available in Bangla dub?",
        a: () =>
          "The All Episodes list on this page always shows what is available right now. New episodes appear there as soon as they are published.",
      },
    ],
  },
  bn: {
    heading: "সচরাচর জিজ্ঞাসা",
    items: [
      {
        q: "টিভিআর ডাবার্স কী?",
        a: () =>
          "টিভিআর ডাবার্স একটি ডাবিং টিম, যারা আপনার প্রিয় অ্যানিমে ও ডনহুয়া আপনার নিজের ভাষায় নিয়ে আসে, যাতে আপনাকে বুঝতে কষ্ট করতে না হয়।",
      },
      {
        q: "ব্যাটল থ্রু দ্য হেভেনস বাংলা ডাব কোথায় দেখব?",
        a: (l) => (
          <>
            এখানেই। এই পেজের All Episodes তালিকা থেকে যেকোনো এপিসোডে ট্যাপ করলেই চলবে। আমাদের{" "}
            <Anchor href={l.facebook}>অফিসিয়াল ফেসবুক পেজ</Anchor> ও{" "}
            <Anchor href={l.youtube}>অফিসিয়াল ইউটিউব চ্যানেলেও</Anchor> পাবেন।
          </>
        ),
      },
      {
        q: "ব্যাটল থ্রু দ্য হেভেনস (BTTH) কী?",
        a: () =>
          "ব্যাটল থ্রু দ্য হেভেনস, যা ডৌপো ক্যাংকিয়ং নামেও পরিচিত, Tian Can Tu Dou-এর ওয়েব নভেলের ওপর ভিত্তি করে তৈরি একটি চাইনিজ ডনহুয়া। ডৌ কি মহাদেশে অবহেলা সয়ে জিয়াও ইয়ান কীভাবে ধাপে ধাপে অসাধারণ শক্তি অর্জন করে, সেটাই এর গল্প।",
      },
      {
        q: "এটা কি অফিসিয়াল ডাব?",
        a: () =>
          "না। টিভিআর ডাবার্স একটি স্বাধীন ফ্যান গ্রুপ, সিরিজের নির্মাতা বা স্বত্বাধিকারীদের সাথে আমাদের কোনো সম্পর্ক নেই। শোটার প্রতি ভালোবাসা থেকেই আমরা ডাব করি।",
      },
      {
        q: "পরের এপিসোড কবে আসবে বুঝব কীভাবে?",
        a: (l) => (
          <>
            হোম পেজের Next Episode Drops In টাইমার পরের রিলিজ পর্যন্ত কাউন্টডাউন দেখায়। আপডেটের জন্য আমাদের{" "}
            <Anchor href={l.facebook}>অফিসিয়াল ফেসবুক পেজ</Anchor>,{" "}
            <Anchor href={l.youtube}>অফিসিয়াল ইউটিউব চ্যানেল</Anchor> বা{" "}
            <Anchor href={l.telegramChannel}>টেলিগ্রাম চ্যানেল</Anchor> ফলো করুন।
          </>
        ),
      },
      {
        q: "চরিত্রগুলোতে কারা কণ্ঠ দেন?",
        a: () =>
          "আমাদের ভয়েস আর্টিস্টরা একটি টিম হিসেবে কাজ করেন। টিম লিড করেন রকি, যিনি ভয়েস ডিরেক্টর এবং অডিও ও ভিডিও এডিটরও।",
      },
      {
        q: "এপিসোড চলছে না, কী করব?",
        a: (l) => (
          <>
            পেজ রিলোড করুন, প্লেয়ারে অন্য সার্ভারটি চেষ্টা করুন, অথবা অন্য ব্রাউজারে খুলুন। তবুও না হলে আমাদের{" "}
            <Anchor href={l.facebook}>অফিসিয়াল ফেসবুক পেজ</Anchor> বা{" "}
            <Anchor href={l.youtube}>অফিসিয়াল ইউটিউব চ্যানেলে</Anchor> এপিসোডটি খুঁজুন, রকিকে সরাসরি{" "}
            <Anchor href={normalizeWhatsappLink(l.whatsapp)}>হোয়াটসঅ্যাপে</Anchor> মেসেজ করুন, অথবা আমাদের{" "}
            <Anchor href={l.telegramChannel}>টেলিগ্রাম চ্যানেলে</Anchor> টিমকে পাবেন।
          </>
        ),
      },
      {
        q: "বাংলা ডাবে কোন কোন এপিসোড পাওয়া যাচ্ছে?",
        a: () =>
          "এই পেজের All Episodes তালিকায় এখন যা আছে, সেটাই পাওয়া যাচ্ছে। নতুন এপিসোড প্রকাশ হলেই সেখানে যোগ হয়।",
      },
    ],
  },
};

function FaqList({ lang, links }: { lang: Lang; links: Links }) {
  const { items } = COPY[lang];
  const isBn = lang === "bn";
  const [current] = useLang();

  return (
    <div
      lang={lang}
      hidden={current !== lang}
      className="max-w-3xl border-t border-white/10"
      style={isBn ? { fontFamily: "'Noto Sans Bengali', 'Inter', sans-serif" } : undefined}
    >
      {items.map((item) => (
        <details key={item.q} className="group border-b border-white/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5 text-left font-semibold text-foreground outline-none transition-colors hover:text-cyan-300 focus-visible:text-cyan-300 [&::-webkit-details-marker]:hidden">
            <span>{item.q}</span>
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-cyan-400 transition-transform duration-300 group-open:rotate-180"
            />
          </summary>
          <p className={`pb-4 pr-8 text-sm md:text-base text-muted-foreground ${isBn ? "leading-loose" : "leading-relaxed"}`}>
            {item.a(links)}
          </p>
        </details>
      ))}
    </div>
  );
}

export function Faq() {
  const { data: settings } = useGetSettings();
  const [lang] = useLang();

  const links: Links = {
    facebook: settings?.facebook,
    youtube: settings?.youtube,
    telegramChannel: settings?.telegramChannel,
    whatsapp: settings?.whatsapp,
  };

  return (
    <section id="faq" aria-labelledby="faq-heading" className="mt-16">
      <div className="mb-4 flex max-w-3xl items-center justify-between gap-4">
        <h2
          id="faq-heading"
          className="text-2xl md:text-3xl font-display font-bold text-foreground border-l-4 border-cyan-500 pl-4"
          style={lang === "bn" ? { fontFamily: "'Noto Sans Bengali', 'Inter', sans-serif" } : undefined}
        >
          {COPY[lang].heading}
        </h2>
        <LangSwitch />
      </div>

      {/* Both languages stay in the page HTML (one hidden), like the about box. */}
      <FaqList lang="en" links={links} />
      <FaqList lang="bn" links={links} />
    </section>
  );
}
