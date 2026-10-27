import { createRoot } from "react-dom/client";
import App from "./App.js";
import "@fontsource-variable/inter/opsz.css";
import "./styles/tokens.css";
import "./styles/react.css";

const target = document.getElementById("app");
if (!target) throw new Error("The app mount element is missing.");
document.documentElement.dataset.theme = "dark";
createRoot(target).render(<App />);
