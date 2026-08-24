const text = value => String(value ?? "").trim().toLowerCase();
const finiteOrNull = value => value === "" || value === null || value === undefined ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const compareText = (left, right) => String(left ?? "").localeCompare(String(right ?? ""), undefined, { sensitivity: "base", numeric: true });

export const CATALOG_PAGE_SIZE = 25;
export const DEFAULT_CATALOG_QUERY = Object.freeze({
  search: "", category: "weapons", subtype: "all", rarity: "all", grade: "all",
  priceMin: "", priceMax: "", weightMin: "", weightMax: "", sort: "name", direction: "asc"
});

export function catalogFacets(records) {
  const values = (key, sorter = compareText) => [...new Set(records.map(record => record[key]).filter(value => value !== "" && value !== null && value !== undefined))].sort(sorter);
  const rarityTiers = new Map(records.filter(record => record.rarity).map(record => [record.rarity, Number(record.rarityTier) || 0]));
  return {
    categories: values("storeCategory"), subtypes: values("subtype"), rarities: values("rarity", (left, right) => (rarityTiers.get(left) - rarityTiers.get(right)) || compareText(left, right)),
    grades: values("grade", (left, right) => Number(left) - Number(right)),
    traits: [...new Set(records.flatMap(record => record.traits ?? []))].sort(compareText)
  };
}

export function queryCatalog(records, query = {}) {
  const active = { ...DEFAULT_CATALOG_QUERY, ...query };
  const priceMin = finiteOrNull(active.priceMin); const priceMax = finiteOrNull(active.priceMax);
  const weightMin = finiteOrNull(active.weightMin); const weightMax = finiteOrNull(active.weightMax);
  const indexed = records.map((record, index) => ({ record, index })).filter(({ record }) =>
    (!text(active.search) || String(record.search ?? "").includes(text(active.search))) &&
    (active.category === "all" || record.storeCategory === active.category) &&
    (active.subtype === "all" || record.subtype === active.subtype) &&
    (active.rarity === "all" || record.rarity === active.rarity) &&
    (active.grade === "all" || Number(record.grade) === Number(active.grade)) &&
    (priceMin === null || Number(record.price) >= priceMin) && (priceMax === null || Number(record.price) <= priceMax) &&
    (weightMin === null || Number(record.weight) >= weightMin) && (weightMax === null || Number(record.weight) <= weightMax)
  );
  const direction = active.direction === "desc" ? -1 : 1;
  const fieldCompare = (left, right) => {
    if (["price", "weight", "grade", "rarity"].includes(active.sort)) {
      const key = active.sort === "rarity" ? "rarityTier" : active.sort;
      return (Number(left[key]) - Number(right[key])) * direction;
    }
    return compareText(left.name, right.name) * direction;
  };
  return indexed.sort((left, right) => fieldCompare(left.record, right.record)
    || compareText(left.record.name, right.record.name) || left.index - right.index).map(({ record }) => record);
}

export function paginateCatalog(records, page = 1, pageSize = CATALOG_PAGE_SIZE) {
  const size = Math.max(1, Math.floor(Number(pageSize) || CATALOG_PAGE_SIZE));
  const pageCount = Math.max(1, Math.ceil(records.length / size));
  const currentPage = Math.min(pageCount, Math.max(1, Math.floor(Number(page) || 1)));
  const start = (currentPage - 1) * size;
  return { records: records.slice(start, start + size), currentPage, pageCount, total: records.length, pageSize: size };
}
