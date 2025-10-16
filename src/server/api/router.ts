/**
 * API Router for Phase 3 Client API endpoints
 *
 * Central router that handles all client-facing endpoints with middleware for:
 * - JSON body parsing
 * - Request logging and telemetry
 * - Error handling and response formatting
 * - Rate limiting (for /api/pick only)
 *
 * Endpoints:
 * - GET /api/init - Initialize game state for a date
 * - POST /api/pick - Submit user word choices (rate limited)
 * - GET /api/progress - Get current voting progress
 *
 * Requirements: 5.6, 6.6, 8.4, 9.5
 */

import express, { Request, Response, NextFunction } from 'express';
import type { RedisClient } from '@devvit/web/server';
import { SeedingService } from '../services/seeding.service';
import { DataService } from '../services/data.service';
import { IdentityService } from '../services/identity.service';
import { TelemetryService } from '../services/telemetry.service';
import { RateLimitService } from '../services/rate-limit.service';
import { handleInit } from './init.endpoint';
import { handlePick } from './pick.endpoint';
import { handleProgress } from './progress.endpoint';
import {
  sendErrorResponse,
  APIErrorCode,
  createAPIError,
} from '../utils/response.formatter';

/**
 * Creates and configures the API router with all endpoints and middleware.
 *
 * @param redis - Redis client for service instantiation
 * @returns Configured Express router
 */
export function createAPIRouter(redis: RedisClient): express.Router {
  const router = express.Router();

  // Initialize services
  const seedingService = new SeedingService(redis);
  const dataService = new DataService(redis);
  const identityService = new IdentityService();
  const telemetryService = new TelemetryService(redis);
  const rateLimitService = new RateLimitService(redis);

  // Request logging middleware
  router.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Log request start
    console.log(`API Request: ${req.method} ${req.path}`, {
      timestamp: new Date().toISOString(),
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });

    // Override res.end to log response
    const originalEnd = res.end.bind(res);
    res.end = function (chunk?: any, encoding?: any, cb?: any) {
      const duration = Date.now() - startTime;
      console.log(
        `API Response: ${req.method} ${req.path} - ${res.statusCode}`,
        {
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        }
      );

      // Call original end method with proper signature
      return originalEnd(chunk, encoding, cb);
    };

    next();
  });

  // GET /api/init - Initialize game state
  router.get('/init', async (req: Request, res: Response) => {
    await handleInit(
      req,
      res,
      seedingService,
      dataService,
      identityService,
      telemetryService
    );
  });

  // POST /api/pick - Submit word choices (rate limited)
  router.post('/pick', async (req: Request, res: Response) => {
    await handlePick(
      req,
      res,
      seedingService,
      dataService,
      identityService,
      telemetryService,
      rateLimitService
    );
  });

  // GET /api/progress - Get voting progress
  router.get('/progress', async (req: Request, res: Response) => {
    await handleProgress(
      req,
      res,
      dataService,
      identityService,
      telemetryService
    );
  });

  // Error handling middleware for unknown API routes
  router.use((req: Request, res: Response) => {
    const apiError = createAPIError(
      APIErrorCode.INTERNAL_ERROR,
      `API route not found: ${req.method} ${req.path}`,
      {
        method: req.method,
        path: req.path,
        availableRoutes: [
          'GET /api/init',
          'POST /api/pick',
          'GET /api/progress',
        ],
      }
    );
    sendErrorResponse(res, apiError);
  });

  return router;
}
