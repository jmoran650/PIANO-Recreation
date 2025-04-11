import { ChatCompletionTool } from 'openai/resources/chat/completions';

export const memoryTools: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'addShortTermMemory',
      description: 'Adds a short term memory entry with the given name and information.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The identifier for the memory entry.',
          },
          info: {
            type: 'string',
            description: 'The information to store in the short term memory.',
          },
        },
        required: ['name', 'info'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'getShortTermMemory',
      description: 'Retrieves a short term memory entry by name and refreshes its recency.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The identifier for the memory entry to retrieve.',
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'removeShortTermMemory',
      description: 'Removes a short term memory entry by name and moves it to long term memory.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The identifier for the memory entry to remove.',
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'getLongTermMemory',
      description: 'Retrieves a long term memory entry by name.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The identifier for the long term memory entry to retrieve.',
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'addLocationMemory',
      description:
        'Adds a location memory with the given identifier, description, and coordinates.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The identifier for the location memory.',
          },
          description: {
            type: 'string',
            description:
              'A description of the location, including relevant details.',
          },
          coords: {
            type: 'object',
            properties: {
              x: { type: 'number', description: 'The x-coordinate.' },
              y: { type: 'number', description: 'The y-coordinate.' },
              z: { type: 'number', description: 'The z-coordinate.' },
            },
            required: ['x', 'y', 'z'],
            additionalProperties: false,
          },
        },
        required: ['name', 'description', 'coords'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'getLocationMemory',
      description:
        'Retrieves a location memory by name, returning its description and coordinates.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'The identifier for the location memory to retrieve.',
          },
        },
        required: ['name'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
];