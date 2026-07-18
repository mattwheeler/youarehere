import type { D1DatabaseLike } from "../db/mission-session-store";

export interface MissionRuntimeBindings {
  DB: D1DatabaseLike;
  OPENAI_API_KEY?: string;
  MISSION_STATE_SECRET?: string;
  LIVE_GOLDEN_MISSIONS?: string;
}

interface RuntimeGlobal {
  __onYourBehalfRuntime?: MissionRuntimeBindings;
}

export function installMissionRuntimeBindings(
  bindings: MissionRuntimeBindings,
): void {
  (globalThis as RuntimeGlobal).__onYourBehalfRuntime = bindings;
}

export function getMissionRuntimeBindings(): MissionRuntimeBindings {
  const installed = (globalThis as RuntimeGlobal).__onYourBehalfRuntime;
  if (!installed?.DB) throw new Error("The mission database is unavailable");
  return {
    ...installed,
    OPENAI_API_KEY: installed.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
    MISSION_STATE_SECRET:
      installed.MISSION_STATE_SECRET ?? process.env.MISSION_STATE_SECRET,
    LIVE_GOLDEN_MISSIONS:
      installed.LIVE_GOLDEN_MISSIONS ?? process.env.LIVE_GOLDEN_MISSIONS,
  };
}
