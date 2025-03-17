import { ChatCompletionTool } from "openai/resources/chat/completions";
export const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "mine",
      description:
        "Mines a specified block type until the desired number of blocks has been mined.",
      parameters: {
        type: "object",
        properties: {
          goalBlock: {
            type: "string",
            description: "Type of block to mine (e.g. 'oak_log', 'stone')",
          },
          desiredCount: {
            type: "number",
            description: "How many blocks to mine",
          },
        },
        required: ["goalBlock", "desiredCount"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: "function",
    function: {
      name: "craft",
      description: "Crafts a goal item if a recipe is available.",
      parameters: {
        type: "object",
        properties: {
          goalItem: {
            type: "string",
            description: "Name of the item to craft (e.g. 'chest', 'furnace')",
          },
        },
        required: ["goalItem"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: "function",
    function: {
      name: "place",
      description: "Places a block (e.g. furnace or crafting table).",
      parameters: {
        type: "object",
        properties: {
          blockType: {
            type: "string",
            description: "Name of the block to place from inventory",
          },
        },
        required: ["blockType"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: "function",
    function: {
      name: "attack",
      description: "Attacks the nearest specified mob until it is defeated.",
      parameters: {
        type: "object",
        properties: {
          mobType: {
            type: "string",
            description: "Mob name (e.g. 'zombie', 'skeleton')",
          },
        },
        required: ["mobType"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: "function",
    function: {
      name: "smelt",
      description: "Smelts the specified item using a furnace.",
      parameters: {
        type: "object",
        properties: {
          inputItemName: {
            type: "string",
            description: "Name of item to smelt (e.g. 'iron_ore', 'sand')",
          },
          quantity: {
            type: "number",
            description: "How many items to smelt",
          },
        },
        required: ["inputItemName", "quantity"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: "function",
    function: {
      name: "plantCrop",
      description: "Plants the specified crop on farmland.",
      parameters: {
        type: "object",
        properties: {
          cropName: {
            type: "string",
            description: "Name of the seed or crop (e.g. 'wheat_seeds')",
          },
        },
        required: ["cropName"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: "function",
    function: {
      name: "harvestCrop",
      description:
        "Harvests the specified crop, optionally specifying count or 'all'.",
      parameters: {
        type: "object",
        properties: {
          cropName: { type: "string" },
          countOrAll: {
            type: "string",
            description: "Either a number as string or 'all'",
          },
        },
        required: ["cropName", "countOrAll"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
];