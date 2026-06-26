declare module "@3d-dice/dice-box-threejs" {
  type DiceBoxConfig = {
    assetPath?: string;
    shadows?: boolean;
    sounds?: boolean;
    theme_material?: string;
    theme_texture?: string;
    theme_surface?: string;
    strength?: number;
    gravity_multiplier?: number;
    onRollComplete?: (result: unknown) => void;
  };

  export default class DiceBox {
    constructor(selector: string, config?: DiceBoxConfig);
    initialize(): Promise<void>;
    roll(notation: string): Promise<unknown>;
    clearDice?(): void;
  }
}
