import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tenant name is required'],
    trim: true,
    unique: true
  },
  subdomain: {
    type: String,
    required: [true, 'Subdomain is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[a-z0-9-]+$/, 'Subdomain can only contain lowercase letters, numbers, and hyphens']
  },
  domain: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  settings: {
    timezone: {
      type: String,
      default: 'UTC'
    },
    dateFormat: {
      type: String,
      default: 'YYYY-MM-DD'
    },
    maxUsers: {
      type: Number,
      default: 100
    },
    features: {
      realTimeCollaboration: {
        type: Boolean,
        default: true
      },
      advancedReporting: {
        type: Boolean,
        default: false
      },
      apiAccess: {
        type: Boolean,
        default: false
      }
    }
  },
  subscription: {
    plan: {
      type: String,
      enum: ['FREE', 'BASIC', 'PRO', 'ENTERPRISE'],
      default: 'FREE'
    },
    startDate: {
      type: Date
    },
    endDate: {
      type: Date
    }
  },
  metadata: {
    type: Map,
    of: String
  }
}, {
  timestamps: true
});

// Indexes
tenantSchema.index({ subdomain: 1 });
tenantSchema.index({ isActive: 1 });

// Virtual for tenant status
tenantSchema.virtual('status').get(function() {
  if (!this.isActive) return 'INACTIVE';
  if (this.subscription?.endDate && new Date() > this.subscription.endDate) {
    return 'EXPIRED';
  }
  return 'ACTIVE';
});

tenantSchema.set('toJSON', {
  virtuals: true
});

const Tenant = mongoose.model('Tenant', tenantSchema);

export default Tenant;

