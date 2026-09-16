import RecipeApp from "./RecipeApp";
import PrivacyPolicy from "./components/PrivacyPolicy";

export default function RootPage({ pathname = window.location.pathname }) {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return normalizedPath === "/privacy" ? <PrivacyPolicy /> : <RecipeApp />;
}
