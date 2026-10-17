import { renderToString } from "react-dom/server";
import App, { type Route } from "./App";

export function render(route: Route = "home") {
  return renderToString(<App route={route} />);
}
