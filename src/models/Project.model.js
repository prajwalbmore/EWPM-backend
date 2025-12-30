import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
    default: 'PLANNING',
    index: true
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM'
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  actualEndDate: {
    type: Date
  },
  budget: {
    type: Number,
    min: 0
  },
  spent: {
    type: Number,
    default: 0,
    min: 0
  },
  members: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['MEMBER', 'LEAD', 'VIEWER'],
      default: 'MEMBER'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  tags: [{
    type: String
  }],
  settings: {
    allowPublicComments: {
      type: Boolean,
      default: true
    },
    enableTimeTracking: {
      type: Boolean,
      default: true
    },
    sla: {
      enabled: {
        type: Boolean,
        default: false
      },
      targetCompletionDays: {
        type: Number
      }
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
projectSchema.index({ tenantId: 1, status: 1 });
projectSchema.index({ tenantId: 1, ownerId: 1 });
projectSchema.index({ tenantId: 1, managerId: 1 });
projectSchema.index({ 'members.userId': 1 });

projectSchema.virtual('progress').get(function() {
  return 0;
});

projectSchema.methods.canClose = async function() {
  const Task = mongoose.model('Task');
  const openTasks = await Task.countDocuments({
    projectId: this._id,
    status: { $nin: ['COMPLETED', 'CANCELLED'] }
  });
  return openTasks === 0;
};

projectSchema.set('toJSON', {
  virtuals: true
});

const Project = mongoose.model('Project', projectSchema);

export default Project;

