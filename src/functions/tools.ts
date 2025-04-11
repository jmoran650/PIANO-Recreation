// src/functions/tools.ts
import { ChatCompletionTool } from 'openai/resources/chat/completions';

export const tools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'mine',
      description:
        'Mines a specified block type until the desired number of blocks has been mined.',
      parameters: {
        type: 'object',
        properties: {
          goalBlock: {
            type: 'string',
            description: 'Type of block to mine (e.g. \'oak_log\', \'stone\', \'coal_ore\')',
          },
          desiredCount: {
            type: 'number',
            description: 'How many blocks to mine',
          },
        },
        required: ['goalBlock', 'desiredCount'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'gotoPlayer',
      description: 'Navigates the bot to the current location of the specified player.',
      parameters: {
        type: 'object',
        properties: {
          playerName: {
            type: 'string',
            description: 'The username of the player to navigate to.',
          },
        },
        required: ['playerName'], // playerName is strictly required
        additionalProperties: false,
      },
      strict: true,
    },
  },

  {
    type: 'function',
    function: {
      name: 'gotoCoordinates',
      description: 'Navigates the bot to the specified x, y, z coordinates.',
      parameters: {
        type: 'object',
        properties: {
          coordinates: {
            type: 'object',
            description: 'The exact {x, y, z} coordinates to navigate to.',
            properties: {
              x: { type: 'number', description: 'The target x-coordinate.' },
              y: { type: 'number', description: 'The target y-coordinate.' },
              z: { type: 'number', description: 'The target z-coordinate.' },
            },
            required: ['x', 'y', 'z'], // x,y,z required within coordinates object
            additionalProperties: false,
          },
        },
        required: ['coordinates'], // coordinates object itself is required
        additionalProperties: false,
      },
      strict: true,
    },
  },
  
  {
    type: 'function',
    function: {
      name: 'craft',
      description: 'Crafts a goal item or block.',
      parameters: {
        type: 'object',
        properties: {
          goalItem: {
            type: 'string',
            description: 'Name of the item to craft (e.g. \'chest\', \'furnace\')',
          },
        },
        required: ['goalItem'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'place',
      description: 'Places a block down in the world (e.g. furnace or crafting table).',
      parameters: {
        type: 'object',
        properties: {
          blockType: {
            type: 'string',
            description: 'Name of the block to place from inventory',
          },
        },
        required: ['blockType'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'attack',
      description: 'Attacks the nearest specified mob or player until it is defeated.',
      parameters: {
        type: 'object',
        properties: {
          mobType: {
            type: 'string',
            description: 'Mob name (e.g. \'zombie\', \'skeleton\') or player name.'
          },
        },
        required: ['mobType'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'smelt',
      description: 'Smelts the specified item using a furnace.',
      parameters: {
        type: 'object',
        properties: {
          inputItemName: {
            type: 'string',
            description: 'Name of item to smelt (e.g. \'iron_ore\', \'sand\')',
          },
          quantity: {
            type: 'number',
            description: 'How many items to smelt',
          },
        },
        required: ['inputItemName', 'quantity'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  // {  //disabling planting and harvesting crops because its not relevant right now
  //   type: "function",
  //   function: {
  //     name: "plantCrop",
  //     description: "Plants the specified crop on farmland.",
  //     parameters: {
  //       type: "object",
  //       properties: {
  //         cropName: {
  //           type: "string",
  //           description: "Name of the seed or crop (e.g. 'wheat_seeds')",
  //         },
  //       },
  //       required: ["cropName"],
  //       additionalProperties: false,
  //     },
  //     strict: true,
  //   },
  // },
  // {
  //   type: "function",
  //   function: {
  //     name: "harvestCrop",
  //     description:
  //       "Harvests the specified crop, optionally specifying count or 'all'.",
  //     parameters: {
  //       type: "object",
  //       properties: {
  //         cropName: { type: "string" },
  //         countOrAll: {
  //           type: "string",
  //           description: "Either a number as string or 'all'",
  //         },
  //       },
  //       required: ["cropName", "countOrAll"],
  //       additionalProperties: false,
  //     },
  //     strict: true,
  //   },
  // },
  {
    type: 'function',
    function: {
      name: 'placeChest',
      description: 'Places a chest block into the world from inventory.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'storeItemInChest',
      description: 'Stores a specified quantity of an item in an available chest.',
      parameters: {
        type: 'object',
        properties: {
          itemName: {
            type: 'string',
            description: 'Name of the item to store (e.g. \'dirt\', \'cobblestone\')',
          },
          count: {
            type: 'number',
            description: 'How many items to store',
          },
        },
        required: ['itemName', 'count'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'retrieveItemFromChest',
      description: 'Retrieves a specified quantity of an item from a nearby chest.',
      parameters: {
        type: 'object',
        properties: {
          itemName: {
            type: 'string',
            description: 'Name of the item to retrieve (e.g. \'stone\', \'apple\')',
          },
          count: {
            type: 'number',
            description: 'How many items to retrieve',
          },
        },
        required: ['itemName', 'count'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'chat',
      description:
        'Make the bot say the provided text out loud in Minecraft. Use this to communicate with other players and characters.',
      parameters: {
        type: 'object',
        properties: {
          speech: {
            type: 'string',
            description: 'The text the bot should chat',
          },
        },
        required: ['speech'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
];