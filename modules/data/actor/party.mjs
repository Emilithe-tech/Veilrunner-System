import { biographyField } from "../fields.mjs";

const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;
const BASE_CURRENCY_NAME = "Galactic Federation Credits";
const BASE_CURRENCY_ICON = "fa-solid fa-sim-card";

/** Party data. */
export default class PartyData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.PartyData"];

  static defineSchema() {
    return {
      members: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      currencies: new ArrayField(new SchemaField({
        name: new StringField({ required: true, blank: true, initial: "" }),
        value: new NumberField({ required: true, min: 0, initial: 0, nullable: false }),
        tracked: new BooleanField({ required: true, initial: true }),
        icon: new StringField({ required: true, blank: false, initial: "fa-solid fa-coins" })
      }), { initial: [{ name: BASE_CURRENCY_NAME, value: 0, tracked: true, icon: BASE_CURRENCY_ICON }] }),
      biography: biographyField()
    };
  }

  static migrateData(source) {
    source = super.migrateData(source);
    if (!Array.isArray(source.currencies)) return source;
    const baseIndex = source.currencies.findIndex(currency => [BASE_CURRENCY_NAME, "Credits"].includes(String(currency?.name ?? "").trim()));
    if (baseIndex < 0) source.currencies.unshift({ name: BASE_CURRENCY_NAME, value: 0, tracked: true, icon: BASE_CURRENCY_ICON });
    else source.currencies[baseIndex] = { ...source.currencies[baseIndex], name: BASE_CURRENCY_NAME, tracked: source.currencies[baseIndex].tracked ?? true, icon: BASE_CURRENCY_ICON };
    source.currencies = source.currencies.map(currency => ({ ...currency, tracked: Boolean(currency?.tracked) }));
    return source;
  }
}
