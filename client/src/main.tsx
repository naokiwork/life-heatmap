import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { extractTokenFromFragment } from "./lib/queryClient";

// In production (Cloudflare Pages), the Worker redirects to /#token=...
// after OIDC login. Extract and store the token before rendering.
extractTokenFromFragment();

createRoot(document.getElementById("root")!).render(<App />);
