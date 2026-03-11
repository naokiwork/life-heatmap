import { z } from 'zod';
import { insertCategorySchema, insertActivitySessionSchema, categories, activitySessions } from './schema';

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  unauthorized: z.object({ message: z.string() }),
};

export const api = {
  categories: {
    list: {
      method: 'GET' as const,
      path: '/api/categories' as const,
      responses: {
        200: z.array(z.custom<typeof categories.$inferSelect>()),
        401: errorSchemas.unauthorized,
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/categories' as const,
      input: insertCategorySchema.omit({ userId: true }),
      responses: {
        201: z.custom<typeof categories.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      }
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/categories/:id' as const,
      responses: {
        204: z.void(),
        401: errorSchemas.unauthorized,
      }
    }
  },
  activitySessions: {
    list: {
      method: 'GET' as const,
      path: '/api/activity-sessions' as const,
      responses: {
        200: z.array(z.any()), 
        401: errorSchemas.unauthorized,
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/activity-sessions' as const,
      input: insertActivitySessionSchema.omit({ userId: true, date: true }),
      responses: {
        201: z.custom<typeof activitySessions.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      }
    },
  },
  insights: {
    get: {
      method: 'GET' as const,
      path: '/api/insights' as const,
      responses: {
        200: z.array(z.object({ insight: z.string(), type: z.enum(['positive', 'negative', 'neutral']) })),
        401: errorSchemas.unauthorized,
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
