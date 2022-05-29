import { FromSchema } from 'json-schema-to-ts';

export const WebsiteSchema = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    region: { type: 'string' },
    build: {
      type: 'object',
      properties: {
        cmd: { type: 'string' },
        outputDir: { type: 'string' },
        environment: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['cmd', 'outputDir'],
    },
    domain: {
      anyOf: [
        { type: 'string' },
        {
          type: 'array',
          items: { type: 'string' },
        },
      ],
    },
    certificate: { type: 'string' },
    security: {
      type: 'object',
      properties: {
        allowIframe: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    redirectToMainDomain: { type: 'boolean' },
  },
  required: ['path'],
  additionalProperties: false,
} as const;

export type WebsiteInput = FromSchema<typeof WebsiteSchema>;
