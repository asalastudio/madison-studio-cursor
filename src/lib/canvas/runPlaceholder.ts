export const WEEK2_RUN_TITLE = "Run is Week 2";

export const WEEK2_RUN_DESCRIPTION =
  "The Run control is in place. canvas-run, credit holds, and generation land next week.";

export function week2RunToast(scope: "node" | "all"): { title: string; description: string } {
  return {
    title: scope === "all" ? "Run all is Week 2" : WEEK2_RUN_TITLE,
    description: WEEK2_RUN_DESCRIPTION,
  };
}
