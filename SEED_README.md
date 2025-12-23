# Admin Seeder Script

This script creates the first super admin user and a default tenant for the EWPM platform.

## Usage

### Basic Usage (Default Credentials)

```bash
cd server
npm run seed
```

This will create:
- **Email:** `admin@ewpm.com`
- **Password:** `Admin@123456`
- **Role:** `SUPER_ADMIN`

### Custom Credentials (Using Environment Variables)

1. Create or update your `.env` file in the `server` directory:

```env
SUPER_ADMIN_EMAIL=your-admin@example.com
SUPER_ADMIN_PASSWORD=YourSecurePassword123
SUPER_ADMIN_FIRST_NAME=Admin
SUPER_ADMIN_LAST_NAME=User
```

2. Run the seed script:

```bash
npm run seed
```

## What the Script Does

1. **Connects to MongoDB** (using your `MONGODB_URI` from `.env`)
2. **Creates a default tenant** (if none exists)
   - Name: "Default Organization"
   - Subdomain: "default"
3. **Creates a super admin user** (if none exists)
   - Uses environment variables or defaults
   - Assigns to the default tenant
   - Sets role to `SUPER_ADMIN`

## Output Example

```
✅ Connected to database
✅ Created default tenant: Default Organization
✅ Super admin created successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Email:    admin@ewpm.com
   Password: Admin@123456
   Role:     SUPER_ADMIN
   Name:     Super Admin
   Tenant:   Default Organization
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  IMPORTANT: Please change the default password after first login!
```

## Safety Features

- ✅ **Prevents duplicates:** Won't create another super admin if one already exists
- ✅ **Uses existing tenant:** If a tenant exists, it will use that instead of creating a new one
- ✅ **Safe to run multiple times:** Only creates if doesn't exist

## Troubleshooting

### "Super admin already exists"
- A super admin has already been created
- Use the existing credentials to login
- Or delete the existing super admin from the database if you need to recreate

### Connection Error
- Make sure MongoDB is running
- Check your `MONGODB_URI` in `.env` file
- Verify MongoDB connection string is correct

### Environment Variables Not Working
- Make sure `.env` file is in the `server` directory
- Restart the script after changing `.env`
- Check for typos in variable names

## After Running the Seeder

1. **Login to the frontend** with the created credentials
2. **Change the default password** immediately
3. **Create additional tenants** if needed (via API or frontend)
4. **Create org admins** for each tenant
5. **Start using the platform!**

## Manual Database Reset (Development Only)

If you need to reset and recreate the admin:

```javascript
// In MongoDB shell or MongoDB Compass
use ewpm
db.users.deleteMany({ role: "SUPER_ADMIN" })
db.tenants.deleteMany({})
```

Then run `npm run seed` again.

