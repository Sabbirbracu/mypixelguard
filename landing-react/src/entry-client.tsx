import { createRoot, hydrateRoot } from "react-dom/client";
import App, { routeFromPath } from "./App";
import "./styles.css";

// In the built site the HTML was rendered ahead of time, so the page is already visible; this just makes it interactive.
// In `pnpm dev` the root is empty (nothing was prerendered), so render normally instead of hydrating.
const root = document.getElementById("root")!;
const app = <App route={routeFromPath(location.pathname)} />;
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
