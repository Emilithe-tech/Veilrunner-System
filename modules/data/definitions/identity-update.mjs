/** Identity is assigned by canonical creation and retained by every later edit. */
export function assertDefinitionIdentityUpdate(item, changes) {
  const current = String(item?._source?.system?.definitionId ?? item?.system?.definitionId ?? "");
  const system = changes?.system;
  const flat = Object.hasOwn(changes ?? {}, "system.definitionId");
  const nested = system && Object.hasOwn(system, "definitionId");
  const removed = Object.hasOwn(changes ?? {}, "system.-=definitionId")
    || Object.hasOwn(changes ?? {}, "-=system")
    || (system && Object.hasOwn(system, "-=definitionId")) || system === null;
  const invalidSystem = Object.hasOwn(changes ?? {}, "system")
    && (!system || typeof system !== "object" || Array.isArray(system));
  if ((removed && current) || (invalidSystem && current)
    || (flat && changes["system.definitionId"] !== current)
    || (nested && system.definitionId !== current)) {
    throw new Error("Definition identity is managed by canonical creation. Changing it requires an explicit reference migration.");
  }
}
