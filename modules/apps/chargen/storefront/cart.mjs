import { normalizeDefinitionId } from "../../../data/item/identity.mjs";

const safeQuantity = value => Math.max(1, Math.floor(Number(value) || 1));
export function normalizeCart(lines) {
  return (Array.isArray(lines) ? lines : []).map(line => ({
    definitionId: normalizeDefinitionId(line?.definitionId), quantity: safeQuantity(line?.quantity), options: line?.options && typeof line.options === "object" ? structuredClone(line.options) : {}
  })).filter(line => line.definitionId);
}
export function addToCart(lines, definitionId, options = {}) {
  const normalized = normalizeCart(lines); const id = normalizeDefinitionId(definitionId);
  const existing = normalized.find(line => line.definitionId === id && JSON.stringify(line.options) === JSON.stringify(options));
  if (existing) existing.quantity += 1;
  else normalized.push({ definitionId: id, quantity: 1, options: structuredClone(options) });
  return normalized;
}
export function mergeCarts(...groups) {
  const merged = [];
  for (const line of groups.flatMap(group => normalizeCart(group))) {
    const optionsKey = JSON.stringify(line.options);
    const existing = merged.find(entry => entry.definitionId === line.definitionId && JSON.stringify(entry.options) === optionsKey);
    if (existing) existing.quantity += line.quantity;
    else merged.push(structuredClone(line));
  }
  return merged;
}
export function removeFromCart(lines, definitionId) { return normalizeCart(lines).filter(line => line.definitionId !== normalizeDefinitionId(definitionId)); }
export function setCartQuantity(lines, definitionId, quantity) {
  return normalizeCart(lines).map(line => line.definitionId === normalizeDefinitionId(definitionId) ? { ...line, quantity: safeQuantity(quantity) } : line);
}
export function cartTotal(lines, records) {
  const prices = new Map((records ?? []).map(record => [record.definitionId, record.price]));
  return normalizeCart(lines).reduce((total, line) => total + Math.max(0, Number(prices.get(line.definitionId)) || 0) * line.quantity, 0);
}
export function cartItemCount(lines) { return normalizeCart(lines).reduce((total, line) => total + line.quantity, 0); }
export function cartWeight(lines, records) {
  const weights = new Map((records ?? []).map(record => [record.definitionId, record.weight]));
  return normalizeCart(lines).reduce((total, line) => total + Math.max(0, Number(weights.get(line.definitionId)) || 0) * line.quantity, 0);
}
