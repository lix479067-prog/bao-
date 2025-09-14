# Overview

This is a Telegram bot management system built with a modern full-stack TypeScript architecture. The application provides an administrative interface for managing Telegram bot configurations, user roles, order processing workflows, and report templates. It features a React-based frontend with shadcn/ui components and an Express.js backend with PostgreSQL database integration.

The system is designed to handle business reporting workflows through Telegram, allowing administrators to configure bot behaviors, manage user permissions, process approval/rejection workflows for orders, and customize report templates for different business operations like deposits, withdrawals, and refunds.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript running in client-side rendering mode
- **Routing**: Wouter for lightweight client-side routing
- **UI Components**: shadcn/ui component library built on Radix UI primitives with Tailwind CSS styling
- **State Management**: TanStack Query (React Query) for server state management and data fetching
- **Form Handling**: React Hook Form with Zod validation schemas
- **Styling**: Tailwind CSS with CSS custom properties for theming support

## Backend Architecture
- **Runtime**: Node.js with Express.js web framework
- **Language**: TypeScript with ES modules
- **Authentication**: OpenID Connect integration with Replit Auth using Passport.js strategy
- **Session Management**: Express sessions with PostgreSQL storage using connect-pg-simple
- **API Design**: RESTful endpoints with JSON responses and comprehensive error handling middleware

## Data Storage Solutions
- **Primary Database**: PostgreSQL with connection pooling via Neon Database serverless driver
- **ORM**: Drizzle ORM with type-safe schema definitions and migrations
- **Schema Management**: Centralized schema definitions in `/shared/schema.ts` with Zod validation
- **Session Storage**: PostgreSQL-backed session store for user authentication state

## Database Schema Design
The system uses a comprehensive relational schema including:
- **Users**: Standard user accounts linked to Replit authentication
- **Telegram Users**: Bot users with role-based permissions (admin/employee)
- **Orders**: Business transaction records with approval workflows
- **Bot Configuration**: Telegram bot settings and webhook management
- **Keyboard Buttons**: Customizable bot interface elements
- **Report Templates**: Configurable message templates for different order types
- **System Settings**: Application-wide configuration management

## Authentication and Authorization
- **Primary Auth**: Replit OpenID Connect with automatic user provisioning
- **Session Security**: HTTP-only cookies with CSRF protection and secure flags
- **Role Management**: Multi-tier permission system for Telegram bot users
- **Route Protection**: Middleware-based authentication guards for protected endpoints

## External Dependencies
- **Telegram Bot API**: Direct integration for webhook handling and message processing
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Replit Services**: Authentication provider and development platform integration
- **Radix UI**: Accessible component primitives for complex UI interactions
- **Vite**: Build tool and development server with HMR support
- **PostCSS/Autoprefixer**: CSS processing pipeline for cross-browser compatibility

## Development and Deployment
- **Build System**: Vite for frontend bundling with esbuild for server-side compilation
- **Development**: Hot module replacement with error overlay and development plugins
- **Type Safety**: Comprehensive TypeScript coverage with strict compiler options
- **Database Migrations**: Drizzle Kit for schema versioning and deployment
- **Environment Management**: Environment variable configuration for secrets and database connections