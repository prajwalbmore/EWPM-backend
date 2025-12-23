import mongoose from 'mongoose';
import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import User from '../models/User.model.js';
import Tenant from '../models/Tenant.model.js';
import logger from '../utils/logger.js';

dotenv.config();

const seedDatabase = async () => {
  try {
    // Connect to database
    await connectDB();
    logger.info('✅ Connected to database');

    // // Check if any tenants exist
    // let tenant = await Tenant.findOne();

    // if (!tenant) {
    //   // Create default tenant
    //   tenant = await Tenant.create({
    //     name: 'Default Organization',
    //     subdomain: 'default',
    //     isActive: true,
    //     settings: {
    //       timezone: 'UTC',
    //       dateFormat: 'YYYY-MM-DD',
    //       maxUsers: 1000,
    //       features: {
    //         realTimeCollaboration: true,
    //         advancedReporting: true,
    //         apiAccess: true
    //       }
    //     },
    //     subscription: {
    //       plan: 'ENTERPRISE',
    //       startDate: new Date(),
    //       endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    //     }
    //   });
    //   logger.info(`✅ Created default tenant: ${tenant.name}`);
    // } else {
    //   logger.info(`✅ Using existing tenant: ${tenant.name}`);
    // }

    // Check if super admin exists
    const existingSuperAdmin = await User.findOne({ role: 'SUPER_ADMIN' });

    if (existingSuperAdmin) {
      logger.info('⚠️  Super admin already exists. Skipping creation.');
      logger.info(`   Email: ${existingSuperAdmin.email}`);
      logger.info(`   ID: ${existingSuperAdmin._id}`);
      process.exit(0);
    }

    // Get admin details from environment or use defaults
    const adminData = {
      email: process.env.SUPER_ADMIN_EMAIL || 'admin@ewpm.com',
      password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@123456',
      firstName: process.env.SUPER_ADMIN_FIRST_NAME || 'Super',
      lastName: process.env.SUPER_ADMIN_LAST_NAME || 'Admin',
      role: 'SUPER_ADMIN',
      // tenantId: tenant._id,
      isActive: true
    };

    // Create super admin
    const superAdmin = await User.create(adminData);
    
    logger.info('');
    logger.info('✅ Super admin created successfully!');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`   Email:    ${superAdmin.email}`);
    logger.info(`   Password: ${adminData.password}`);
    logger.info(`   Role:     ${superAdmin.role}`);
    logger.info(`   Name:     ${superAdmin.firstName} ${superAdmin.lastName}`);
    // logger.info(`   Tenant:   ${tenant.name}`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('');
    logger.info('⚠️  IMPORTANT: Please change the default password after first login!');
    logger.info('');

    process.exit(0);
  } catch (error) {
    logger.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

// Run seed
seedDatabase();

