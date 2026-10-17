// Every page of the site, with the metadata that goes into its <head>. Used by the app (what to show) and the build (static HTML + sitemap).
import { ARTICLES } from "./articles";

export const SITE = "https://mypixelguard.agentiqbd.com";

export type RouteId = "home" | "mac" | "windows" | (typeof ARTICLES)[number]["id"];

export interface RouteMeta {
  id: RouteId;
  path: string;                 // "/" or "/something/"
  title: string;                // full <title>
  desc: string;
  noindex?: boolean;            // kept out of search results and the sitemap
  jsonld: object[];
}

const org = { "@type": "Organization", "@id": `${SITE}/#org`, name: "Agentiq BD", url: "https://agentiqbd.com" };

export const HOME_TITLE = "MyPixelGuard: Free EXIF & Photo Metadata Remover (Mac, Windows)";
export const HOME_DESC = "Remove EXIF, GPS location and hidden metadata from photos, blur faces, remove backgrounds, convert and compress — offline on Mac and Windows. Nothing is uploaded.";

export const ROUTES: RouteMeta[] = [
  {
    id: "home", path: "/", title: HOME_TITLE, desc: HOME_DESC,
    jsonld: [
      { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "MyPixelGuard", url: `${SITE}/`,
        description: HOME_DESC, applicationCategory: "MultimediaApplication", operatingSystem: "macOS 13 or later, Windows 10 or later",
        image: `${SITE}/og-image.jpg`, publisher: org, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
      { "@context": "https://schema.org", "@type": "WebSite", name: "MyPixelGuard", url: `${SITE}/`, publisher: org },
    ],
  },
  { id: "mac", path: "/download/mac/", title: "Download MyPixelGuard for macOS", desc: "Download MyPixelGuard for Mac (macOS 13 or later) with a step-by-step install guide.", noindex: true, jsonld: [] },
  { id: "windows", path: "/download/windows/", title: "Download MyPixelGuard for Windows", desc: "Download MyPixelGuard for Windows 10/11 (64-bit) with a step-by-step install guide.", noindex: true, jsonld: [] },
  ...ARTICLES.map((a): RouteMeta => ({
    id: a.id, path: a.path, title: a.title, desc: a.desc,
    jsonld: [
      { "@context": "https://schema.org", "@type": "Article", headline: a.h1, description: a.desc, dateModified: a.updated, datePublished: a.updated,
        author: org, publisher: org, mainEntityOfPage: `${SITE}${a.path}`, image: `${SITE}/og-image.jpg` },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "MyPixelGuard", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: a.h1, item: `${SITE}${a.path}` } ] },
      ...(a.faq ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: a.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }] : []),
    ],
  })),
];

export const routeFromPath = (path: string): RouteId => {
  const p = path.replace(/\/+$/, "") + "/";
  return ROUTES.find((r) => r.path === p)?.id ?? "home";
};
