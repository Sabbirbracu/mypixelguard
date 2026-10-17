import { LangProvider, useLang } from "./ui";
import { usePrefetchTabImages, useReveal } from "./hooks";
import { LangGate } from "./LangGate";
import { SPRITE } from "./sprite";
import { Header, Hero, Trust, Why, UseCases, Features, Tools, How, Languages, Privacy, Security, Faq, Cta, Footer } from "./sections";
import DownloadPage from "./DownloadPage";
import ArticlePage from "./ArticlePage";
import { TITLE } from "./config";
import { ROUTES, type RouteId } from "./routes";

export { routeFromPath } from "./routes";
export type Route = RouteId;

const DOWNLOAD_TITLE = {
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
        <UseCases />
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
  if (route === "home") return <LangProvider title={TITLE}><Home /></LangProvider>;
  if (route === "mac" || route === "windows") return <LangProvider title={DOWNLOAD_TITLE[route]}><DownloadPage platform={route} /></LangProvider>;
  const t = `${ROUTES.find((r) => r.id === route)?.title ?? ""} — MyPixelGuard`;
  return <LangProvider fixed="en" title={{ en: t, bn: t }}><ArticlePage id={route} /></LangProvider>;
}
