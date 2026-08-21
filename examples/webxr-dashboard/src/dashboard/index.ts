/**
 * Purpose: Compose and start the Mac-side PICO operator dashboard.
 * Context: Bun loads this module as the dashboard page's only application entry point.
 * Responsibilities: Resolve the root, start one controller, and dispose it on page teardown.
 * Boundaries: Dashboard state, transport, and DOM rendering live in dedicated modules.
 */

import "./dashboard.css";
import { DashboardController } from "./dashboard-controller.ts";

const appRoot = document.querySelector<HTMLElement>("#app");
if (appRoot === null) throw new Error("Dashboard application root #app is missing");

const dashboard = new DashboardController(appRoot);
window.addEventListener("pagehide", () => dashboard.dispose(), { once: true });
dashboard.start();
