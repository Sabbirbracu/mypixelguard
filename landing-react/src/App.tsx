import { LangProvider, useLang } from "./ui";
import { usePrefetchTabImages, useReveal } from "./hooks";
import { LangGate } from "./LangGate";
import { SPRITE } from "./sprite";
import { Header, Hero, Trust, Why, Features, Tools, How, Languages, Privacy, Faq, Cta, Footer } from "./sections";

function Page() {
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
        <Faq />
        <Cta />
      </main>
      <Footer />
      <LangGate />
    </>
  );
}

export default function App() {
  return <LangProvider><Page /></LangProvider>;
}
