import { createRoot } from "react-dom/client";
import App from "./App.js";
import "@fontsource-variable/inter/opsz.css";
import { readPreferences } from "./features/settings/preferences-store.js";
import "./styles/tokens.css";
import "./styles/buttons.css";
import "./styles/react.css";

const target = document.getElementById("app");
if (!target) throw new Error("The app mount element is missing.");
const { theme } = readPreferences();
document.documentElement.dataset.theme = theme === "system"
  ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  : theme;
createRoot(target).render(<App />);
