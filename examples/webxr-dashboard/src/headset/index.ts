/**
 * Purpose: Compose and start the PICO-side WebXR application.
 * Context: Bun loads this module as the headset page's only application entry point.
 * Responsibilities: Resolve the root, start one runtime owner, and dispose it on page teardown.
 * Boundaries: Runtime behavior and UI rendering live in dedicated headset modules.
 */

import "./headset.css";
import { HeadsetRuntime } from "./headset-runtime.ts";

const appRoot = document.querySelector<HTMLElement>("#app");
if (appRoot === null) throw new Error("Headset application root #app is missing");

const headsetRuntime = new HeadsetRuntime(appRoot);
window.addEventListener("beforeunload", () => headsetRuntime.dispose(), { once: true });
void headsetRuntime.start();
