function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Optional for controlled direct callers; mandatory in the reviewed canvas path. */
export function assertReviewedProgressionGraph(expectedGraph, currentGraph) {
  if (expectedGraph === undefined) return;
  if (!expectedGraph || typeof expectedGraph !== "object" || Array.isArray(expectedGraph) || stable(expectedGraph) !== stable(currentGraph)) {
    throw Object.assign(new Error("The canonical graph changed after preview. Validate and review a fresh candidate before writing."), {
      code: "progression-reviewed-graph-conflict", status: "refused", stage: "reviewed-graph-precondition"
    });
  }
}
