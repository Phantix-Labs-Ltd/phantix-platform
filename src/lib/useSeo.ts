import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Public, indexable routes on platform.phantixlabs.com.
 *
 * Sign-in, registration and the legal pages are the platform's only public
 * content; every management route (docs included) is behind sign-in. Kept in
 * step with the `allow` list in vite.config.ts.
 */
export const PUBLIC_PATHS = ["/login", "/register", "/privacy", "/terms", "/aup", "/cookies"];

export interface SeoOptions {
  /** Production origin, e.g. "https://platform.phantixlabs.com". */
  origin: string;
  /** The application's default `<title>` on public routes. */
  title: string;
  /** The application's default `meta[name=description]` on public routes. */
  description: string;
  /**
   * Public, indexable paths. An entry ending in "$" matches that path exactly
   * ("/$" is the root); every other entry is a prefix. Any route not listed is
   * treated as private: `noindex, nofollow`.
   */
  publicPaths: string[];
}

/**
 * Per-route SEO for the client-rendered platform.
 *
 * index.html ships one static title, description, canonical and robots tag, and
 * that same document answers every route. This keeps all four honest as the
 * operator moves between a public page and a management screen, so search
 * engines and AI answer engines index the public pages and only those. Render it
 * once, inside the router (see the `<Seo />` element in App.tsx).
 */
export function useSeo({ origin, title, description, publicPaths }: SeoOptions): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const path = normalisePath(pathname);
    const indexable = publicPaths.some((entry) =>
      entry.endsWith("$") ? path === entry.slice(0, -1) : path === entry || path.startsWith(`${entry}/`),
    );
    const href = `${origin.replace(/\/+$/, "")}${path}`;

    // The canonical URL and og:url always describe the page actually shown.
    const link = setCanonical(href);
    link.href = href;
    setMeta("property", "og:url").content = href;

    // Private routes are pulled from the index; the catch-all robots.txt rule
    // already keeps them out of a crawl, and this covers a direct hit.
    setMeta("name", "robots").content = indexable ? "index, follow" : "noindex, nofollow";
    if (!indexable) return;

    document.title = title;
    setMeta("name", "description").content = description;
    setMeta("property", "og:title").content = title;
    setMeta("property", "og:description").content = description;
    setMeta("name", "twitter:title").content = title;
    setMeta("name", "twitter:description").content = description;
  }, [origin, title, description, publicPaths, pathname]);
}

/** "/dashboard/" and "/dashboard" are one page; query strings and hashes drop. */
function normalisePath(pathname: string): string {
  return pathname !== "/" ? pathname.replace(/\/+$/, "") : "/";
}

function setCanonical(href: string): HTMLLinkElement {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    link.href = href;
    document.head.appendChild(link);
  }
  return link;
}

/** Find or create one head tag, so repeated writes never stack duplicates. */
function setMeta(attr: "name" | "property", key: string): HTMLMetaElement {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attr, key);
    document.head.appendChild(meta);
  }
  return meta;
}

/**
 * Bind the platform's SEO configuration to the hook above. Rendered once inside
 * `<BrowserRouter>` so `useLocation` is available.
 */
export function Seo(): null {
  useSeo({
    origin: "https://platform.phantixlabs.com",
    title: "SecureGraph Platform: Tenant Onboarding and Dual Control",
    description:
      "Onboard your organization, connect the security database, invite people and set their roles, then enforce dual-control governance across SecureGraph apps.",
    publicPaths: PUBLIC_PATHS,
  });
  return null;
}
