import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Task title is required'],
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
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  parentTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: null
  },
  type: {
    type: String,
    enum: ['EPIC', 'STORY', 'SUBTASK'],
    default: 'STORY',
    index: true
  },
  status: {
    type: String,
    enum: ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED', 'CANCELLED'],
    default: 'TODO',
    index: true
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM'
  },
  assigneeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  reporterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dueDate: {
    type: Date
  },
  estimatedHours: {
    type: Number,
    min: 0
  },
  actualHours: {
    type: Number,
    default: 0,
    min: 0
  },
  dependencies: [{
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task'
    },
    type: {
      type: String,
      enum: ['BLOCKS', 'BLOCKED_BY', 'RELATED'],
      default: 'BLOCKED_BY'
    }
  }],
  tags: [{
    type: String
  }],
  attachments: [{
    filename: String,
    url: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  sla: {
    targetCompletionDate: Date,
    breached: {
      type: Boolean,
      default: false
    },
    breachDate: Date
  }
}, {
  timestamps: true
});

// Indexes for performance
taskSchema.index({ tenantId: 1, projectId: 1 });
taskSchema.index({ tenantId: 1, assigneeId: 1, status: 1 });
taskSchema.index({ tenantId: 1, status: 1 });
taskSchema.index({ parentTaskId: 1 });
taskSchema.index({ 'dependencies.taskId': 1 });

// Virtual for subtasks count
taskSchema.virtual('subtasksCount', {
  ref: 'Task',
  localField: '_id',
  foreignField: 'parentTaskId',
  count: true
});

// Method to check if task can transition to a status
taskSchema.methods.canTransitionTo = function(newStatus) {
  const validTransitions = {
    'TODO': ['IN_PROGRESS', 'CANCELLED'],
    'IN_PROGRESS': ['IN_REVIEW', 'BLOCKED', 'CANCELLED'],
    'IN_REVIEW': ['DONE', 'IN_PROGRESS'],
    'DONE': ['IN_PROGRESS'], // Reopening
    'BLOCKED': ['IN_PROGRESS', 'CANCELLED'],
    'CANCELLED': []
  };

  return validTransitions[this.status]?.includes(newStatus) || false;
};

taskSchema.set('toJSON', {
  virtuals: true
});

const Task = mongoose.model('Task', taskSchema);

export default Task;

