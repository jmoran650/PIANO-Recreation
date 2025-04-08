import { BuildingService } from "../src/actions/build";
import { CombatService } from "../src/actions/combat";
import { CraftingService } from "../src/actions/craft";
import { FarmingService } from "../src/actions/farm";
import { InventoryService } from "../src/actions/inventory";
import { MiningService } from "../src/actions/mine";
import { MovementService } from "../src/actions/move";
import { SmeltingService } from "../src/actions/smelt";
import { TalkService } from "../src/actions/talk";

export interface ActionServices {
  buildingService: BuildingService;
  combatService: CombatService;
  craftingService: CraftingService;
  farmingService: FarmingService;
  inventoryService: InventoryService;
  miningService: MiningService;
  movementService: MovementService;
  smeltingService: SmeltingService;
  talkService: TalkService;
}