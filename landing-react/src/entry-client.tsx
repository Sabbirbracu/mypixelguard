import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// In the built site the HTML was rendered ahead of time, so the page is already visible; this just makes it interactive.
// In `pnpm dev` the root is empty (nothing was prerendered), so render normally instead of hydrating.
const root = document.getElementById("root")!;
if (root.hasChildNodes()) hydrateRoot(root, <App />);
else createRoot(root).render(<App />);
