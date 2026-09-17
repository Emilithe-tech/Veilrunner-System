import { MICROGRID_DISTANCE, MICROGRID_VERSION } from "../canvas/microgrid.mjs";

export class VeilrunnerToken extends foundry.documents.TokenDocument {
  async _preCreate(data, options, user) {
    if (await super._preCreate(data, options, user) === false) return false;
    if (!this.parent?.useMicrogrid) return;
    if (this.flags.Veilrunner?.microgrid === MICROGRID_VERSION) return;
    // Actor drops have already been sized by getTokenDocument. Direct token
    // creation uses native grid units when explicit dimensions are supplied.
    const update = { "flags.Veilrunner.microgrid": MICROGRID_VERSION };
    for (const key of ["width", "height", "depth"]) {
      if (data[key] === undefined) update[key] = 1 / MICROGRID_DISTANCE;
    }
    this.updateSource(update);
  }
}
