# Role-Based Access Control (RBAC) Guide

This document outlines the complete RBAC implementation for the EWPM platform.

## Role Hierarchy

1. **SUPER_ADMIN** - Global platform owner
2. **ORG_ADMIN** - Organization administrator (per tenant)
3. **PROJECT_MANAGER** - Project manager (per tenant)
4. **EMPLOYEE** - Regular employee (per tenant)

## SUPER_ADMIN Permissions

### ✅ Allowed Actions
- **Tenant Management**: Create, update, delete, suspend/activate tenants
- **Global Statistics**: View system-wide analytics
- **System Audit**: View system-level audit logs (if implemented)
- **Global Settings**: Configure platform-wide settings

### ❌ Restricted Actions
- **Cannot** perform day-to-day tenant operations:
  - Cannot create/manage projects within tenants
  - Cannot create/manage tasks within tenants
  - Cannot access tenant-specific reports
  - Cannot access tenant audit logs
  - Cannot manage users within tenants

### Implementation
- Middleware: `preventSuperAdminTenantWork` blocks tenant-level operations
- Routes: Tenant management routes only
- Controllers: Tenant CRUD operations only

## ORG_ADMIN Permissions

### ✅ Allowed Actions
- **User Management**: Create, update, delete users in their tenant
  - Cannot see or manage SUPER_ADMIN users
  - Can assign roles: ORG_ADMIN, PROJECT_MANAGER, EMPLOYEE
- **Project Management**: Full CRUD on all projects in their tenant
- **Task Management**: Full CRUD on all tasks in their tenant
- **Reports**: View all tenant-level reports
- **Audit Logs**: View all tenant audit logs
- **Tenant Settings**: Manage tenant settings and configuration

### ❌ Restricted Actions
- Cannot create SUPER_ADMIN users
- Cannot assign SUPER_ADMIN role
- Cannot access other tenants' data
- Cannot manage tenants (only SUPER_ADMIN can)

### Implementation
- All queries filtered by `tenantId` (from middleware)
- SUPER_ADMIN users excluded from user lists
- Full access to all tenant resources

## PROJECT_MANAGER Permissions

### ✅ Allowed Actions
- **Project Management**: 
  - Create projects (becomes owner/manager)
  - View and manage only projects they own or manage
  - Add/remove project members
  - Update project details
- **Task Management**:
  - Create tasks in projects they manage
  - View tasks in projects they manage
  - Update tasks in projects they manage
  - Assign/reassign tasks to employees
  - Update task status
  - Delete tasks in their projects
- **Reports**: View reports for their projects only
- **Comments**: Comment on tasks in their projects

### ❌ Restricted Actions
- Cannot delete projects (only ORG_ADMIN can)
- Cannot manage users
- Cannot access projects they don't manage
- Cannot access tenant-level audit logs
- Cannot view reports for other projects

### Implementation
- Project queries filtered by: `managerId`, `ownerId`, or `members.userId` with role 'LEAD'
- Task queries filtered by project membership
- Report queries filtered by managed projects

## EMPLOYEE Permissions

### ✅ Allowed Actions
- **Task Viewing**: View only tasks assigned to them
- **Task Updates**: Update only assigned tasks
  - Can update status
  - Can log time (actualHours)
  - Can add comments
  - Can update comments they created
- **Task Details**: View full details of assigned tasks

### ❌ Restricted Actions
- Cannot create tasks
- Cannot assign tasks
- Cannot reassign tasks
- Cannot delete tasks
- Cannot create/manage projects
- Cannot view unassigned tasks
- Cannot view tasks assigned to others
- Cannot access reports
- Cannot access audit logs
- Cannot manage users

### Implementation
- Task queries filtered by `assigneeId = user.id`
- All task operations check assignment before allowing
- Comments restricted to assigned tasks only

## Route Protection Summary

### Projects (`/api/projects`)
- `GET /` - All authenticated users (filtered by role in controller)
- `GET /:id` - All authenticated users (filtered by role)
- `POST /` - ORG_ADMIN, PROJECT_MANAGER only
- `PUT /:id` - ORG_ADMIN (any), PROJECT_MANAGER (own only)
- `DELETE /:id` - ORG_ADMIN only
- `POST /:id/members` - ORG_ADMIN (any), PROJECT_MANAGER (own only)
- `DELETE /:id/members/:userId` - ORG_ADMIN (any), PROJECT_MANAGER (own only)

### Tasks (`/api/tasks`)
- `GET /` - All authenticated users (filtered by role in controller)
- `GET /:id` - All authenticated users (EMPLOYEE: assigned only)
- `POST /` - ORG_ADMIN, PROJECT_MANAGER only
- `PUT /:id` - ORG_ADMIN (any), PROJECT_MANAGER (own projects), EMPLOYEE (assigned only)
- `DELETE /:id` - ORG_ADMIN, PROJECT_MANAGER (own projects only)
- `PATCH /:id/status` - All roles (with restrictions)
- `POST /:id/comments` - All roles (EMPLOYEE: assigned tasks only)
- `PUT /:id/comments/:commentId` - Comment owner or ORG_ADMIN
- `DELETE /:id/comments/:commentId` - Comment owner or ORG_ADMIN

### Users (`/api/users`)
- `GET /` - ORG_ADMIN, SUPER_ADMIN (filtered by tenant and role)
- `GET /:id` - ORG_ADMIN, SUPER_ADMIN
- `POST /` - ORG_ADMIN only
- `PUT /:id` - ORG_ADMIN only
- `DELETE /:id` - ORG_ADMIN only
- `PUT /:id/role` - ORG_ADMIN only (cannot assign SUPER_ADMIN)

### Reports (`/api/reports`)
- All routes - ORG_ADMIN, PROJECT_MANAGER only
- PROJECT_MANAGER sees only their projects' data

### Audit Logs (`/api/audit`)
- All routes - ORG_ADMIN only (tenant-level logs)
- SUPER_ADMIN should use system-wide audit (if implemented)

### Tenants (`/api/tenants`)
- All routes - SUPER_ADMIN only

## Security Features

1. **Tenant Isolation**: All queries automatically scoped by `tenantId`
2. **Role-Based Filtering**: Controllers filter results based on user role
3. **Middleware Protection**: Routes protected with role-based middleware
4. **Cross-Tenant Prevention**: No user can access data from other tenants
5. **SUPER_ADMIN Exclusion**: ORG_ADMIN cannot see or manage SUPER_ADMIN users
6. **Project Ownership**: PROJECT_MANAGER restricted to their own projects
7. **Task Assignment**: EMPLOYEE restricted to assigned tasks only

## Testing RBAC

### Test Cases

1. **SUPER_ADMIN**:
   - ✅ Can create tenants
   - ❌ Cannot create projects
   - ❌ Cannot create tasks

2. **ORG_ADMIN**:
   - ✅ Can see all users (except SUPER_ADMIN)
   - ✅ Can manage all projects in tenant
   - ✅ Can manage all tasks in tenant
   - ❌ Cannot see SUPER_ADMIN users

3. **PROJECT_MANAGER**:
   - ✅ Can create projects
   - ✅ Can see only their projects
   - ✅ Can manage tasks in their projects
   - ❌ Cannot see other projects
   - ❌ Cannot delete projects

4. **EMPLOYEE**:
   - ✅ Can see only assigned tasks
   - ✅ Can update assigned tasks
   - ✅ Can comment on assigned tasks
   - ❌ Cannot create tasks
   - ❌ Cannot assign tasks
   - ❌ Cannot see unassigned tasks

## Middleware Functions

- `preventSuperAdminTenantWork` - Blocks SUPER_ADMIN from tenant operations
- `restrictToOwnProjects` - Ensures PROJECT_MANAGER only accesses their projects
- `restrictToOwnTasks` - Ensures EMPLOYEE only accesses assigned tasks
- `canAssignTasks` - Checks if user can assign tasks
- `canManageProjects` - Checks if user can manage projects
- `canManageUsers` - Checks if user can manage users

