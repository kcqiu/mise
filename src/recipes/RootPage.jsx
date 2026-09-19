import { lazy, Suspense, useEffect } from "react";
import RecipeApp from "./RecipeApp";

const PrivacyPolicy = lazy(() => import("./components/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./components/TermsOfService"));

export default function RootPage({ pathname = window.location.pathname }) {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";

  useEffect(() => {
    const titles = {
      "/privacy": "Privacy policy | mise.",
      "/terms": "Terms of service | mise.",
    };
    document.title = titles[normalizedPath] || "mise. | The recipe shelf";
  }, [normalizedPath]);

  if (normalizedPath === "/privacy") {
    return (
      <Suspense fallback={<div className="min-h-screen bg-paper" />}>
        <PrivacyPolicy />
      </Suspense>
    );
  }
  if (normalizedPath === "/terms") {
    return (
      <Suspense fallback={<div className="min-h-screen bg-paper" />}>
        <TermsOfService />
      </Suspense>
    );
  }
  return <RecipeApp />;
}
