import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Compass } from "lucide-react";

export default function NotFound() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // A not-found page names its tab and stays out of search results.
  React.useEffect(() => {
    const previousTitle = document.title;
    document.title = "Page not found · SecureGraph Platform";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => {
      document.title = previousTitle;
      meta.remove();
    };
  }, []);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-phantix-700/60 bg-phantix-900 text-gold-400">
          <Compass size={22} />
        </span>
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-slate-500">404</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white">Page not found</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Nothing lives at <span className="break-all font-mono text-slate-300">{pathname}</span>. The link
          may be out of date or mistyped.
        </p>
        <button onClick={() => navigate("/dashboard")} className="btn-primary mt-5">
          Back to dashboard
        </button>
      </div>
    </div>
  );
}
