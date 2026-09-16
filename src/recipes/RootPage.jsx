import { useEffect } from "react";
import RecipeApp from "./RecipeApp";
import PrivacyPolicy from "./components/PrivacyPolicy";
import TermsOfService from "./components/TermsOfService";

export default function RootPage({ pathname = window.location.pathname }) {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";

  useEffect(() => {
    const titles = {
      "/privacy": "Privacy policy | mise.",
      "/terms": "Terms of service | mise.",
    };
    document.title = titles[normalizedPath] || "mise. | The recipe shelf";
  }, [normalizedPath]);

  if (normalizedPath === "/privacy") return <PrivacyPolicy />;
  if (normalizedPath === "/terms") return <TermsOfService />;
  return <RecipeApp />;
}
