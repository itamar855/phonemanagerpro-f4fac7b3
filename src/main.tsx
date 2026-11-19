import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installStaleBuildRecovery } from "./lib/staleBuild";

installStaleBuildRecovery();

createRoot(document.getElementById("root")!).render(<App />);
