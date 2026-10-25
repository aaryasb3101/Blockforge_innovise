import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { config } from './config.js';

import { healthRoutes } from './routes/health.js';
import { configRoutes } from './routes/config.js';
import { institutionsRoutes } from './routes/institutions.js';
import { credentialsRoutes } from './routes/credentials.js';
import { verifyRoutes } from './routes/verify.js';
import { demoRoutes } from './routes/demo.js';
import { auditRoutes } from './routes/audit.js';
import { incidentRoutes } from './routes/incident.js';
import { snapshotRoutes } from './routes/snapshot.js';
import { attacksRoutes } from './routes/attacks.js';
import { trustGraphRoutes } from './routes/trustGraph.js';
import { statsRoutes } from './routes/stats.js';
import { consensusRoutes } from './routes/consensus.js';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: false,
  });

  // CORS
  await server.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Rate Limiting
  await server.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
  });

  // Swagger Documentation
  await server.register(swagger, {
    swagger: {
      info: {
        title: 'TrustMesh Institutional Trust API',
        description: 'Decentralized institutional trust infrastructure REST API and verification engine',
        version: '1.0.0',
      },
      host: `localhost:${config.port}`,
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
    },
  });

  await server.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // Global Error Handler
  server.setErrorHandler((error, request, reply) => {
    if (error.name === 'ZodError' || error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request payload',
          details: (error as any).issues,
        },
      });
    }

    const statusCode = error.statusCode || 500;
    const errorResponse: any = {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
    };

    if ((error as any).errorName) {
      errorResponse.errorName = (error as any).errorName;
    }

    return reply.status(statusCode).send({ error: errorResponse });
  });

  // Register Routes
  await server.register(healthRoutes);
  await server.register(configRoutes);
  await server.register(institutionsRoutes);
  await server.register(credentialsRoutes);
  await server.register(verifyRoutes);
  await server.register(demoRoutes);
  await server.register(auditRoutes);
  await server.register(incidentRoutes);
  await server.register(snapshotRoutes);
  await server.register(attacksRoutes);
  await server.register(trustGraphRoutes);
  await server.register(statsRoutes);
  await server.register(consensusRoutes);

  return server;
}
