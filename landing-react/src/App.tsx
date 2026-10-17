import { LangProvider, useLang } from "./ui";
import { usePrefetchTabImages, useReveal } from "./hooks";
import { LangGate } from "./LangGate";
import { SPRITE } from "./sprite";
import { Header, Hero, Trust, Why, Features, Tools, How, Languages, Privacy, Security, Faq, Cta, Footer } from "./sections";
import DownloadPage from "./DownloadPage";
import { TITLE } from "./config";

export type Route = "home" | "mac" | "windows";

/** The site is three static pages: the landing page and one download page per platform. */
export function routeFromPath(path: string): Route {
  const p = path.replace(/\/+$/, "");
  return p === "/download/mac" ? "mac" : p === "/download/windows" ? "windows" : "home";
}

export const PAGE_TITLE: Record<Route, { en: string; bn: string }> = {
  home: TITLE,
  mac: { en: "Download MyPixelGuard for macOS", bn: "macOS-এর জন্য MyPixelGuard ডাউনলোড" },
  windows: { en: "Download MyPixelGuard for Windows", bn: "Windows-এর জন্য MyPixelGuard ডাউনলোড" },
};

function Home() {
  useReveal();
  usePrefetchTabImages();
  useLang(); // re-render the tree when the language changes
  return (
    <>
      <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: SPRITE }} />
      <Header />
      <main id="top">
        <Hero />
        <Trust />
        <Why />
        <Features />
        <Tools />
        <How />
        <Languages />
        <Privacy />
        <Security />
        <Faq />
        <Cta />
      </main>
      <Footer />
      <LangGate />
    </>
  );
}

export default function App({ route = "home" }: { route?: Route }) {
  return (
    <LangProvider title={PAGE_TITLE[route]}>
      {route === "home" ? <Home /> : <DownloadPage platform={route} />}
    </LangProvider>
  );
}
