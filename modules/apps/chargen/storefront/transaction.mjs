import { normalizeCart } from "./cart.mjs";

const cleanItemSource = document => {
  const source = document.toObject();
  delete source._id; delete source.folder; delete source.sort; delete source.ownership;
  return source;
};

export async function validateStorefrontTransaction({ provider, index, lines, credits, carryWeight = 0, carryCapacity = Infinity }) {
  const records = await index.records(); const byId = new Map(records.map(record => [record.definitionId, record]));
  const errors = []; let total = 0; let weight = Math.max(0, Number(carryWeight) || 0);
  for (const line of normalizeCart(lines)) {
    const record = byId.get(line.definitionId);
    if (!record) { errors.push(`Store item ${line.definitionId} is no longer available.`); continue; }
    if (record.availability !== "available") errors.push(`${record.name} is not currently available.`);
    if (record.stock !== null && record.stock !== undefined && Number.isFinite(Number(record.stock)) && line.quantity > Number(record.stock)) errors.push(`${record.name} exceeds available stock.`);
    total += record.price * line.quantity;
    weight += Math.max(0, Number(record.weight) || 0) * line.quantity;
  }
  if (total > Math.max(0, Number(credits) || 0)) errors.push("Cart total exceeds available credits.");
  if (Number.isFinite(Number(carryCapacity)) && weight > Number(carryCapacity)) errors.push("Cart exceeds the character's carry capacity.");
  return { valid: !errors.length, errors, total, weight, remaining: Math.max(0, Number(credits) || 0) - total, records: byId };
}

export async function buildStorefrontCommit(options) {
  const { provider, lines } = options;
  const validation = await validateStorefrontTransaction(options);
  if (!validation.valid) return { ...validation, documents: [] };
  const documents = [];
  for (const line of normalizeCart(lines)) {
    const item = await provider.resolve(line.definitionId);
    if (!item) return { ...validation, valid: false, errors: [`Store item ${line.definitionId} could not be resolved.`], documents: [] };
    const source = cleanItemSource(item);
    source.system ??= {}; source.system.quantity = Math.max(1, Number(source.system.quantity) || 1) * line.quantity;
    source.system.definitionId = line.definitionId;
    const record = validation.records.get(line.definitionId);
    if (source.type === "weapon" && record?.weaponType) source.system.weaponType = record.weaponType;
    source.flags ??= {}; source.flags[game.system.id] = { ...(source.flags[game.system.id] ?? {}), storefront: { providerId: provider.id, definitionId: line.definitionId, options: line.options } };
    documents.push(source);
  }
  return { ...validation, documents };
}
