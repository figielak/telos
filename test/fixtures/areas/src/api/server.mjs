import { routes } from "./routes.mjs";

export function serve(req) {
  return routes[req.path]?.(req) ?? 404;
}
