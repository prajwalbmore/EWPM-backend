# Environment Setup Guide

## Quick Start

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update the following critical values in `.env`:
   - `JWT_SECRET` - Generate a strong random secret
   - `SESSION_SECRET` - Generate a strong random secret
   - `MONGODB_URI` - Your MongoDB connection string
   - `REDIS_HOST` and `REDIS_PORT` - Your Redis connection details

## Generating Secrets

You can generate secure secrets using:

```bash
# On Linux/Mac
openssl rand -base64 32

# On Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

## Required Services

### MongoDB
- Default port: 27017
- Database name: `ewpm` (or as configured in MONGODB_URI)

### Redis
- Default port: 6379
- No password required for local development

## Docker Setup

If using Docker Compose, the services will be automatically configured. Just ensure:
- Ports 27017 (MongoDB) and 6379 (Redis) are available
- Port 5000 (Backend) is available

## Production Considerations

For production, ensure:
- All secrets are strong and unique
- MongoDB connection uses authentication
- Redis is password protected
- CORS_ORIGIN is set to your frontend domain
- NODE_ENV is set to "production"
- LOG_LEVEL is set appropriately

