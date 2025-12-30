# Vercel Deployment Guide

## ⚠️ Important Limitations

**This deployment has significant limitations due to Vercel's serverless architecture:**

1. **Socket.IO Limitations**: Real-time features are limited in serverless environments
2. **Database Connections**: Connections may be slower and less reliable
3. **Execution Time Limits**: Functions have 30-second execution limits
4. **Cold Starts**: Initial requests may be slower due to cold starts
5. **Shared Resources**: No persistent server state between requests

**Recommendation**: Consider alternatives like Railway, Render, or AWS for full real-time functionality.

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **MongoDB Atlas**: Set up a MongoDB Atlas cluster
3. **Redis Cloud**: Set up Redis Cloud or compatible service
4. **Vercel CLI**: Install with `npm i -g vercel`

## Step 1: Set Up External Services

### MongoDB Atlas
1. Create account at [mongodb.com/atlas](https://mongodb.com/atlas)
2. Create a cluster (free tier available)
3. Create database user with read/write permissions
4. Whitelist Vercel's IP ranges (0.0.0.0/0 for development)
5. Get connection string: `mongodb+srv://username:password@cluster.mongodb.net/database`

### Redis Cloud
1. Create account at [redis.com](https://redis.com) or [upstash.com](https://upstash.com)
2. Create Redis database
3. Get connection details (host, port, password)

## Step 2: Environment Variables

Set these in your Vercel project settings or using CLI:

```bash
# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/ewpm

# Redis
REDIS_HOST=your-redis-host.redis.com
REDIS_PORT=your-redis-port
REDIS_PASSWORD=your-redis-password

# JWT
JWT_SECRET=your-super-secure-jwt-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=https://your-frontend-domain.vercel.app
SOCKET_IO_CORS_ORIGIN=https://your-frontend-domain.vercel.app

# Email (optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Other
NODE_ENV=production
PORT=443
LOG_LEVEL=warn
```

## Step 3: Deploy to Vercel

### Option A: Using Vercel CLI

```bash
cd server

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

### Option B: Using Vercel Dashboard

1. Connect your GitHub repository to Vercel
2. Set root directory to `server`
3. Configure environment variables in project settings
4. Deploy

## Step 4: Database Seeding

After deployment, seed your database:

```bash
# Run locally or create a Vercel function
npm run seed
```

## Step 5: Testing

Test your deployed API:

```bash
curl https://your-project.vercel.app/health
curl https://your-project.vercel.app/api/auth/register
```

## Troubleshooting

### Common Issues

1. **Database Connection Timeout**
   - Check MongoDB Atlas IP whitelist
   - Verify connection string
   - Consider connection pooling limits

2. **Redis Connection Failed**
   - Verify Redis credentials
   - Check if Redis service allows connections from Vercel

3. **Socket.IO Not Working**
   - Socket.IO has limited support in serverless
   - Consider using alternatives like Pusher or Ably

4. **Function Timeout**
   - Vercel functions have 30s limit
   - Optimize database queries
   - Consider pagination for large datasets

5. **Cold Starts**
   - First requests are slower
   - Use Vercel Analytics to monitor performance

### Logs and Debugging

```bash
# View Vercel function logs
vercel logs

# Check function status
vercel ls
```

## Performance Optimization

1. **Connection Reuse**: Database connections are reused across function calls
2. **Caching**: Redis caching helps reduce database load
3. **Rate Limiting**: Implement appropriate rate limits
4. **Compression**: Enable gzip compression (already configured)

## Alternative Deployment Options

For full real-time functionality, consider:

- **Railway**: `railway.app` - Better for traditional servers
- **Render**: `render.com` - Free tier, persistent servers
- **AWS**: EC2 + API Gateway + Lambda
- **DigitalOcean App Platform**: Full container support

## Migration Back to Traditional Hosting

If you need full Socket.IO functionality:

1. Set up a VPS (DigitalOcean, AWS EC2, etc.)
2. Use Docker Compose for easy deployment
3. Configure domain and SSL
4. Deploy using the existing Docker setup

## Support

- Vercel Documentation: [vercel.com/docs](https://vercel.com/docs)
- MongoDB Atlas: [docs.atlas.mongodb.com](https://docs.atlas.mongodb.com)
- Redis Cloud: Check provider documentation
