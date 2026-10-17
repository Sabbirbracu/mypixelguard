import { renderToString } from "react-dom/server";
import App, { type Route } from "./App";
export { ROUTES, SITE } from "./routes";

export function render(route: Route = "home") {
  return renderToString(<App route={route} />);
}
