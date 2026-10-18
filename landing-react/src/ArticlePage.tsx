// A guide page (English): clear headings, one idea per section, and a calm call to action. Built from src/articles.ts.
import { Fragment } from "react";
import { ARTICLES, type Block } from "./articles";
import { DOWNLOAD_PAGES } from "./config";
import appIcon from "./assets/brand/app-icon.webp";
import { HeroBackdrop } from "./HeroBackdrop";
import { SPRITE } from "./sprite";
import mark from "./assets/brand/MyPixelGuard-Mark-Dark.svg";

function Render({ b }: { b: Block }) {
  switch (b.t) {
    case "p": return <p>{b.text}</p>;
    case "ul": return <ul className="ar-list">{b.items.map((i) => <li key={i}>{i}</li>)}</ul>;
    case "ol": return <ol className="ar-steps">{b.items.map((i) => <li key={i}>{i}</li>)}</ol>;
    case "code": return <pre className="ar-code"><code>{b.text}</code></pre>;
    case "tip": return <p className="ar-tip"><svg aria-hidden="true"><use href="#i-info" /></svg><span>{b.text}</span></p>;
    case "cards": return (
      <div className="ar-cards">
        {b.items.map((c) => (
          <article className={`ar-card${c.self ? " is-self" : ""}`} key={c.name}>
            <h3>{c.name}</h3>
            <small>{c.meta}</small>
            <p><b>Good for:</b> {c.good}</p>
            <p><b>Watch out:</b> {c.watch}</p>
          </article>
        ))}
      </div>
    );
  }
}

export default function ArticlePage({ id }: { id: string }) {
  const a = ARTICLES.find((x) => x.id === id)!;
  const others = ARTICLES.filter((x) => x.id !== a.id);
  const date = new Date(a.updated + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  return (
    <>
      <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: SPRITE }} />
      <header className="site-header">
        <div className="container">
          <a className="brand" href="/" aria-label="MyPixelGuard home"><img src={mark} alt="" width={34} height={34} /><span>MyPixel<span className="guard">Guard</span></span></a>
          <div className="header-actions">
            <a className="dl-back" href="/">← Home</a>
            <a className="btn btn-primary btn-sm" href={DOWNLOAD_PAGES.mac}>Download</a>
          </div>
        </div>
      </header>
      <main>
        <section className="hero ar-hero">
          <HeroBackdrop />
          <div className="container ar-hero-in">
            <nav className="ar-crumbs" aria-label="Breadcrumb"><a href="/">MyPixelGuard</a><span>›</span><span>{a.crumb ?? "Guides"}</span></nav>
            <h1>{a.h1}</h1>
            <p className="lead">{a.intro}</p>
            <p className="ar-meta">Updated {date}</p>
          </div>
        </section>
        <article className="ar-body">
          <div className="container ar-wrap">
            {a.sections.map((s) => (
              <section key={s.h2}>
                <h2>{s.h2}</h2>
                {s.blocks.map((b, i) => <Fragment key={i}><Render b={b} /></Fragment>)}
              </section>
            ))}
            {a.faq && (
              <section>
                <h2>Frequently asked questions</h2>
                <div className="ar-faq">
                  {a.faq.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
                </div>
              </section>
            )}
            <aside className="ar-cta">
              <img src={appIcon} alt="" width={64} height={64} />
              <div>
                <h2>Try MyPixelGuard</h2>
                <p>Remove metadata, blur faces and remove backgrounds — offline, on your own computer. Nothing is uploaded.</p>
                <div className="ar-cta-btns">
                  <a className="btn btn-primary" href={DOWNLOAD_PAGES.mac}>Download for macOS</a>
                  <a className="btn btn-outline" href={DOWNLOAD_PAGES.windows}>Download for Windows</a>
                </div>
              </div>
            </aside>
            <section>
              <h2>More guides</h2>
              <ul className="ar-list">
                {others.map((o) => <li key={o.id}><a href={o.path}>{o.h1}</a></li>)}
              </ul>
            </section>
          </div>
        </article>
      </main>
      <footer className="site-footer">
        <div className="container">
          <a className="brand" href="/"><img src={mark} alt="" width={28} height={28} /><span>MyPixel<span className="guard">Guard</span></span></a>
          <p>A product of <a className="brand-link" href="https://agentiqbd.com" target="_blank" rel="noopener">Agentiq BD</a> · © 2026</p>
        </div>
      </footer>
    </>
  );
}
