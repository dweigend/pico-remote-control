/**
 * Purpose: Map validated world identifiers to their isolated experience factories.
 * Context: The persistent headset runtime switches among exactly three MVP worlds.
 * Responsibilities: Provide one exhaustive registry and reject no state after protocol validation.
 * Boundaries: This module owns no scene, transition, transport, dashboard, or XR lifecycle.
 */

import type { WorldId } from "../shared/protocol.ts";
import { createDiscoExperience } from "./disco/disco-experience.ts";
import type { ExperienceFactory } from "./experience.ts";
import { createLandscapeExperience } from "./landscape/landscape-experience.ts";
import { createSpaceExperience } from "./space/space-experience.ts";

const EXPERIENCE_FACTORIES = {
  space: createSpaceExperience,
  landscape: createLandscapeExperience,
  disco: createDiscoExperience,
} satisfies Readonly<Record<WorldId, ExperienceFactory>>;

export function getExperienceFactory(worldId: WorldId): ExperienceFactory {
  return EXPERIENCE_FACTORIES[worldId];
}
