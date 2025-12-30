#!/bin/bash

# Vercel Deployment Script for EWPM Backend
# This script helps automate the deployment process

echo "🚀 EWPM Backend - Vercel Deployment Script"
echo "=========================================="

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI is not installed. Please install it first:"
    echo "npm install -g vercel"
    exit 1
fi

# Check if user is logged in
if ! vercel whoami &> /dev/null; then
    echo "❌ You're not logged in to Vercel. Please login first:"
    echo "vercel login"
    exit 1
fi

echo "✅ Vercel CLI is installed and you're logged in"

# Check for required environment variables
echo ""
echo "🔍 Checking environment variables..."

required_vars=("MONGO_URI" "REDIS_HOST" "REDIS_PORT" "JWT_SECRET" "CORS_ORIGIN")
missing_vars=()

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo "⚠️  Missing required environment variables:"
    printf '   - %s\n' "${missing_vars[@]}"
    echo ""
    echo "Please set them using:"
    echo "vercel env add VARIABLE_NAME"
    echo "or through the Vercel dashboard"
    echo ""
    echo "Required variables:"
    echo "- MONGO_URI: MongoDB Atlas connection string"
    echo "- REDIS_HOST: Redis host"
    echo "- REDIS_PORT: Redis port"
    echo "- JWT_SECRET: JWT signing secret"
    echo "- CORS_ORIGIN: Frontend URL for CORS"
    echo ""
    read -p "Do you want to continue anyway? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "✅ Environment check completed"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
if npm install; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Run tests
echo ""
echo "🧪 Running tests..."
if npm test; then
    echo "✅ Tests passed"
else
    echo "❌ Tests failed"
    read -p "Do you want to continue with deployment? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Deploy to Vercel
echo ""
echo "🚀 Deploying to Vercel..."
if vercel --prod; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Set up your external databases (MongoDB Atlas, Redis)"
    echo "2. Configure environment variables in Vercel dashboard if not done"
    echo "3. Run database seeding: npm run vercel-seed"
    echo "4. Test your API endpoints"
    echo "5. Update your frontend to use the new API URL"
    echo ""
    echo "🔗 Your API will be available at the URL shown above"
else
    echo "❌ Deployment failed"
    exit 1
fi
