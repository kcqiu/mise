import { useEffect, useState } from "react";

export function readHashRoute() {
  const path = window.location.hash.slice(1);
  if (!path || path === "/" || path === "/login") return "";
  if (path === "/groceries") return "groceries";
  return /^\/recipe\/[a-zA-Z0-9_-]+$/.test(path)
    ? path.slice(8)
    : "not-found";
}

export default function useHashRoute() {
  const [route, setRoute] = useState(readHashRoute);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(readHashRoute());
      window.scrollTo(0, 0);
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return route;
}
