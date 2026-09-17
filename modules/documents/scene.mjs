import { MICROGRID_VERSION, microgridScale, microgridTokenUpdate } from "../canvas/microgrid.mjs";

export class VeilrunnerScene extends Scene {
  get useMicrogrid() {
    return this.flags.Veilrunner?.microgrid === MICROGRID_VERSION && !!microgridScale(this._source.grid);
  }

  prepareBaseData() {
    if (this.useMicrogrid && !(this.grid instanceof foundry.grid.BaseGrid)) {
      const scale = microgridScale(this._source.grid);
      this.grid.size = scale.size;
      this.grid.distance = scale.distance;
    }
    super.prepareBaseData();
  }

  getDimensions() {
    const dimensions = super.getDimensions();
    if (!this.useMicrogrid) return dimensions;
    // Foundry rounds padding to whole cells. Preserve the original map origin,
    // including V14 scene shifts, so walls, lights, tiles and tokens stay aligned.
    const sourceGrid = new foundry.grid.SquareGrid(this._source.grid);
    const { x, y, width, height } = sourceGrid.calculateDimensions(this.width, this.height, this.padding);
    const sceneX = x - this.shiftX;
    const sceneY = y - this.shiftY;
    return Object.assign(dimensions, {
      width, height, sceneX, sceneY,
      rect: new PIXI.Rectangle(0, 0, width, height),
      sceneRect: new PIXI.Rectangle(sceneX, sceneY, this.width, this.height),
      maxR: Math.hypot(width, height),
      rows: Math.ceil(height / this.grid.size),
      columns: Math.ceil(width / this.grid.size)
    });
  }

  async _preCreate(data, options, user) {
    if (await super._preCreate(data, options, user) === false) return false;
    if (!microgridScale(this._source.grid) || this.flags.Veilrunner?.microgrid === MICROGRID_VERSION) return;
    const tokens = this._source.tokens.map(token => {
      const update = microgridTokenUpdate(token, game.actors.get(token.actorId)?.type, this._source.grid);
      return update ? foundry.utils.mergeObject(foundry.utils.deepClone(token), update) : token;
    });
    this.updateSource({
      "flags.Veilrunner.microgrid": MICROGRID_VERSION,
      "flags.Veilrunner.microgridOriginalGrid": { ...this._source.grid },
      "grid.style": data.grid?.style ?? "diamondPoints",
      tokens
    });
  }

  _onUpdate(changed, options, userId) {
    const result = super._onUpdate(changed, options, userId);
    // Core redraws when embedded tokens change; empty scenes need a redraw too.
    if (changed.flags?.Veilrunner?.microgrid && !changed.tokens && canvas.scene === this) return canvas.draw();
    return result;
  }
}
