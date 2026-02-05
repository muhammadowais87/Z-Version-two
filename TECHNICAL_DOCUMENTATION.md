# HyperliquidWhale - Technical Documentation

> **Version:** 1.0  
> **Last Updated:** December 2024  
> **Platform:** Lovable Cloud

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Frontend Stack](#frontend-stack)
4. [Backend Stack](#backend-stack)
5. [Database Schema](#database-schema)
6. [Edge Functions (APIs)](#edge-functions-apis)
7. [Authentication System](#authentication-system)
8. [Security Implementation](#security-implementation)
9. [Business Logic](#business-logic)
10. [External Integrations](#external-integrations)
11. [Environment Configuration](#environment-configuration)
12. [Deployment](#deployment)

---

## Overview

HyperliquidWhale is a cryptocurrency investment platform featuring an AI-powered trading cycle system with multi-level referral rewards. The platform operates as a Telegram Mini App with automated profit generation through configurable trading cycles.

### Key Features
- 4-tier AI Trading Cycle System (Cycle 1, 2, 3, Special)
- 5-level Referral Commission System
- Two-chance progression system per user
- Automated cycle completion via cron jobs
- Admin dashboard for user and cycle management
- USDT (BEP20) deposit/withdrawal system

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│  React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui        │
├─────────────────────────────────────────────────────────────────┤
│                     LOVABLE CLOUD                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Supabase   │  │    Edge      │  │      PostgreSQL      │  │
│  │     Auth     │  │  Functions   │  │      Database        │  │
│  │  (Telegram)  │  │   (Deno)     │  │   (13 Tables + RLS)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Frontend Stack

### Core Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.1 | UI Framework |
| TypeScript | Latest | Type-safe JavaScript |
| Vite | Latest | Build tool & dev server |
| Tailwind CSS | Latest | Utility-first CSS |
| shadcn/ui | Latest | Component library |

### State Management & Data Fetching

| Library | Version | Purpose |
|---------|---------|---------|
| TanStack React Query | 5.83.0 | Server state management |
| React Hook Form | 7.61.1 | Form handling |
| Zod | 3.25.76 | Schema validation |

### Routing

| Library | Version | Purpose |
|---------|---------|---------|
| React Router DOM | 6.30.1 | Client-side routing |

### UI Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| Lucide React | 0.462.0 | Icon library |
| Recharts | 2.15.4 | Charts & data visualization |
| qrcode.react | 4.2.0 | QR code generation |
| Framer Motion | (via shadcn) | Animations |

### Utility Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| date-fns | 3.6.0 | Date formatting |
| ethers | 6.15.0 | Wallet address validation |
| clsx | 2.1.1 | Conditional classnames |
| tailwind-merge | 2.6.0 | Tailwind class merging |

### Project Structure

```
src/
├── assets/              # Static assets (images, logos)
├── components/          # Reusable UI components
│   ├── admin/          # Admin-specific components
│   └── ui/             # shadcn/ui components
├── hooks/              # Custom React hooks
├── integrations/       # Supabase client & types
├── lib/                # Utility functions
└── pages/              # Route components
```

### Key Pages

| Route | Component | Access | Description |
|-------|-----------|--------|-------------|
| `/` | Landing.tsx | Public | Landing page |
| `/login` | Login.tsx | Public | Telegram authentication |
| `/dashboard` | Dashboard.tsx | Protected | User dashboard |
| `/wallet` | Wallet.tsx | Protected | Deposit/withdrawal |
| `/ai-trade` | AITrade.tsx | Protected | Trading cycles |
| `/invite` | Invite.tsx | Protected | Referral system |
| `/team` | Team.tsx | Protected | Team/downline view |
| `/profile` | Profile.tsx | Protected | User profile |
| `/admin` | Admin.tsx | Admin only | Admin dashboard |
| `/admin/cycles` | AdminCycles.tsx | Admin only | Cycle management |
| `/faqs` | FAQs.tsx | Public | Help & FAQ |

---

## Backend Stack

### Platform
**Lovable Cloud** (Supabase-powered)

### Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| Database | PostgreSQL | Data persistence |
| Authentication | Supabase Auth + Telegram | User authentication |
| Edge Functions | Deno (TypeScript) | Serverless API endpoints |
| Row-Level Security | PostgreSQL RLS | Data access control |
| Realtime | Supabase Realtime | Live updates (available) |

### Project Configuration

| Setting | Value |
|---------|-------|
| Project ID | `lqfbpdbcmhaovcuufwxp` |
| Region | Global CDN |
| Database | PostgreSQL 15+ |

---

## Database Schema

### Tables Overview (13 Tables)

| Table | Purpose | RLS Enabled |
|-------|---------|-------------|
| `profiles` | User accounts & balances | ✅ |
| `ai_trade_cycles` | Active/completed trading cycles | ✅ |
| `user_trade_progress` | Chance status & penalty tracking | ✅ |
| `deposits` | Deposit requests | ✅ |
| `withdrawals` | Withdrawal requests | ✅ |
| `investments` | Legacy investment system | ✅ |
| `referrals` | 5-level referral chain | ✅ |
| `user_roles` | Admin/user role assignment | ✅ |
| `audit_logs` | Admin action logging | ✅ |
| `security_events` | Security monitoring | ✅ |
| `otp_verifications` | OTP storage (legacy) | ✅ |
| `rate_limits` | API rate limiting | ✅ |
| `system_config` | Dynamic configuration | ✅ |

---

### Table: `profiles`

User account information and balances.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | - | Primary key (matches auth.users.id) |
| email | text | No | - | User email (from Telegram) |
| telegram_id | bigint | Yes | - | Telegram user ID |
| telegram_username | text | Yes | - | Telegram username |
| telegram_first_name | text | Yes | - | First name |
| telegram_last_name | text | Yes | - | Last name |
| telegram_photo_url | text | Yes | - | Profile photo URL |
| wallet_balance | numeric | No | 0 | Trading balance (USDT) |
| referral_balance | numeric | Yes | 0 | Team income (withdraw only) |
| total_deposits | numeric | No | 0 | Lifetime deposits |
| total_withdrawals | numeric | No | 0 | Lifetime withdrawals |
| total_investment | numeric | Yes | 0 | Total invested |
| total_profit | numeric | Yes | 0 | Total profit earned |
| total_referral_earnings | numeric | Yes | 0 | Total referral commissions |
| referral_code | text | No | - | Unique referral code (WHALE****) |
| referred_by_code | text | Yes | - | Referrer's code |
| created_at | timestamptz | Yes | now() | Account creation |
| updated_at | timestamptz | Yes | now() | Last update |

**RLS Policies:**
- Users can view/update their own profile
- Admins can view all profiles

---

### Table: `ai_trade_cycles`

Active and completed trading cycles.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| user_id | uuid | No | - | Owner user ID |
| cycle_type | integer | No | - | Cycle number (1, 2, 3, 4) |
| investment_amount | numeric | No | - | Amount invested |
| start_date | timestamptz | No | now() | Cycle start time |
| end_date | timestamptz | No | - | Cycle end time |
| current_profit | numeric | No | 0 | Calculated profit |
| status | text | No | 'active' | active/completed/broken |
| chance_number | integer | Yes | 1 | Which chance (1 or 2) |
| additional_investments | jsonb | Yes | '[]' | Additional deposits (Cycle 1 only) |
| created_at | timestamptz | No | now() | Record creation |
| updated_at | timestamptz | No | now() | Last update |

**RLS Policies:**
- Users can view/insert/update their own cycles
- Admins can view all cycles

---

### Table: `user_trade_progress`

Tracks user's progression through the chance system.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| user_id | uuid | No | - | User ID (unique) |
| completed_cycles | integer[] | No | '{}' | Array of completed cycle types |
| is_penalty_mode | boolean | No | false | Whether in penalty mode |
| penalty_chance | integer | Yes | - | Which chance triggered penalty |
| active_chance | integer | Yes | - | Currently active chance (1 or 2) |
| chance_1_status | text | Yes | 'available' | available/active/completed/disabled |
| chance_2_status | text | Yes | 'locked' | locked/available/active/completed/disabled |
| last_50_percent_check | timestamptz | Yes | - | Last balance check timestamp |
| created_at | timestamptz | No | now() | Record creation |
| updated_at | timestamptz | No | now() | Last update |

---

### Table: `deposits`

Deposit requests requiring admin approval.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| user_id | uuid | No | - | Depositor user ID |
| amount | numeric | No | - | Deposit amount (USDT) |
| status | deposit_status | No | 'pending' | pending/approved/rejected |
| admin_wallet_address | text | No | - | Deposit destination address |
| transaction_hash | text | Yes | - | Blockchain transaction hash |
| approved_at | timestamptz | Yes | - | Approval timestamp |
| approved_by | uuid | Yes | - | Admin who approved |
| rejection_reason | text | Yes | - | Reason if rejected |
| created_at | timestamptz | No | now() | Request creation |
| updated_at | timestamptz | No | now() | Last update |

---

### Table: `withdrawals`

Withdrawal requests.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| user_id | uuid | No | - | User requesting withdrawal |
| amount | numeric | No | - | Withdrawal amount (USDT) |
| wallet_address | text | No | - | User's wallet address |
| status | withdrawal_status | No | 'pending' | pending/approved/rejected/paid |
| processed_at | timestamptz | Yes | - | Processing timestamp |
| processed_by | uuid | Yes | - | Admin who processed |
| rejection_reason | text | Yes | - | Reason if rejected |
| created_at | timestamptz | No | now() | Request creation |
| updated_at | timestamptz | No | now() | Last update |

---

### Table: `referrals`

Multi-level referral relationships (5 levels).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| referrer_id | uuid | No | - | Referrer user ID |
| referred_id | uuid | No | - | Referred user ID |
| level | integer | No | - | Referral level (1-5) |
| created_at | timestamptz | Yes | now() | Relationship creation |

---

### Table: `system_config`

Dynamic system configuration.

| Key | Description | Default |
|-----|-------------|---------|
| admin_wallet_address | BEP20 deposit address | - |
| cycle_1_duration | Cycle 1 duration | 25 (days) |
| cycle_2_duration | Cycle 2 duration | 18 (days) |
| cycle_3_duration | Cycle 3 duration | 14 (days) |
| cycle_4_duration | Special cycle duration | 14 (days) |
| cycle_time_unit | 'days' or 'seconds' (test mode) | 'days' |
| profit_multiplier | Cycle profit multiplier | 2 (100% profit) |
| early_withdrawal_tax | Tax for early withdrawal | 18 (%) |
| penalty_daily_return | Penalty mode daily return | 2 (%) |
| referral_level_1_percent | Level 1 commission | 10 (%) |
| referral_level_2_percent | Level 2 commission | 5 (%) |
| referral_level_3_percent | Level 3 commission | 3 (%) |
| referral_level_4_percent | Level 4 commission | 2 (%) |
| referral_level_5_percent | Level 5 commission | 1 (%) |
| referral_max_profit_commission | Max commission per cycle profit | 50 (USDT) |

---

### Table: `user_roles`

User role assignments.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | User ID |
| role | app_role | 'admin' or 'user' |
| created_at | timestamptz | Assignment time |

---

### Table: `audit_logs`

Admin action audit trail.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| admin_id | uuid | Admin who performed action |
| action_type | text | Type of action |
| target_type | text | 'user', 'deposit', 'withdrawal', etc. |
| target_id | uuid | ID of affected record |
| details | jsonb | Action details |
| ip_address | text | Admin's IP |
| user_agent | text | Admin's browser |
| created_at | timestamptz | Action timestamp |

---

### Table: `security_events`

Security monitoring and logging.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| event_type | text | login_success, login_failed, otp_failed, etc. |
| severity | text | info, warning, error |
| user_id | uuid | Associated user (if any) |
| email | text | Associated email |
| ip_address | text | Client IP |
| user_agent | text | Client browser |
| details | jsonb | Event details |
| created_at | timestamptz | Event timestamp |

---

## Edge Functions (APIs)

### Function Overview

| Function | Purpose | Auth Required | JWT Verify |
|----------|---------|---------------|------------|
| telegram-auth | Telegram login/signup | No | No |
| start-cycle | Start AI trade cycle | Yes (internal) | No |
| withdraw-cycle | Early withdrawal | Yes (internal) | No |
| get-cycle-info | Get user's cycle status | Yes (internal) | No |
| get-cycle-history | Get completed cycles | Yes (internal) | No |
| complete-trade-cycles | Cron: auto-complete cycles | CRON_SECRET | No |
| complete-investments | Cron: complete legacy investments | CRON_SECRET | No |
| admin-get-all-cycles | Admin: view all cycles | Admin role | No |
| admin-complete-cycle | Admin: manually complete cycle | Admin role | No |
| admin-manage-penalty | Admin: toggle penalty mode | Admin role | No |
| send-otp-email | Send OTP (legacy) | No | No |
| verify-otp | Verify OTP (legacy) | No | No |

---

### telegram-auth

**Purpose:** Authenticate users via Telegram Mini App

**Method:** POST

**Request Body:**
```json
{
  "initData": "string (Telegram WebApp.initData)",
  "referralCode": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "access_token": "string",
    "refresh_token": "string",
    "expires_at": "number"
  },
  "user": {
    "id": "uuid",
    "email": "string",
    "telegram_id": "number"
  },
  "isNewUser": "boolean"
}
```

**Security:**
- Validates Telegram initData using HMAC-SHA256
- Checks data freshness (max 5 minutes old)
- Rate limiting (15 requests/minute per IP)
- Suspicious activity detection

---

### start-cycle

**Purpose:** Start a new trading cycle

**Method:** POST

**Request Body:**
```json
{
  "cycleType": 1,
  "amount": 100,
  "chanceNumber": 1
}
```

**Validation:**
- Minimum amount: $10
- Maximum amount: $50,000
- User must have sufficient balance
- User must not have active cycle
- Cycle progression rules enforced

---

### withdraw-cycle

**Purpose:** Early withdrawal from active cycle

**Method:** POST

**Request Body:**
```json
{
  "cycleId": "uuid"
}
```

**Returns:**
- Withdrawn amount (after tax if applicable)
- Tax applied
- Whether penalty mode was activated

---

### complete-trade-cycles

**Purpose:** Cron job to auto-complete matured cycles

**Authentication:** Requires `CRON_SECRET` in Authorization header

**Schedule:** Hourly

**Actions:**
1. Find all cycles where `end_date <= now()` and `status = 'active'`
2. Calculate final amount (investment × profit_multiplier)
3. Create next cycle in sequence
4. Update user's completed_cycles array
5. Add profit to user's total_profit

---

## Authentication System

### Telegram Mini App Authentication

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Telegram      │────▶│  telegram-auth   │────▶│    Supabase     │
│   WebApp        │     │  Edge Function   │     │     Auth        │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │                        │
        │ initData               │ Validate               │ Create/Login
        │ (HMAC signed)          │ HMAC-SHA256            │ User
        └────────────────────────┴────────────────────────┘
```

### Authentication Flow

1. User opens app via Telegram Bot (`@HyperliquidWhale_BOT`)
2. Telegram provides signed `initData` containing user info
3. Frontend sends `initData` to `telegram-auth` edge function
4. Edge function validates signature using `TELEGRAM_BOT_TOKEN`
5. If valid, creates/retrieves Supabase user
6. Returns session token for subsequent API calls

### Security Measures

- **HMAC-SHA256 validation** of Telegram data
- **Data freshness check** (max 5 minutes old)
- **IP-based rate limiting** (15 req/min)
- **Suspicious activity detection** via RPC
- **Referral code requirement** for new users

---

## Security Implementation

### Row-Level Security (RLS)

All 13 tables have RLS enabled with the following patterns:

**User Data Tables (profiles, cycles, progress, etc.):**
```sql
-- Users can only access their own data
USING (auth.uid() = user_id)

-- Admins can access all data
USING (has_role(auth.uid(), 'admin'::app_role))
```

**Sensitive Tables (audit_logs, security_events):**
```sql
-- Only service role can insert
WITH CHECK (false)

-- Only admins can view
USING (has_role(auth.uid(), 'admin'::app_role))
```

**Locked Tables (otp_verifications, rate_limits):**
```sql
-- No direct client access
USING (false)
WITH CHECK (false)
```

### Security Functions

**has_role(user_id, role):** Check if user has specific role
```sql
CREATE FUNCTION has_role(_user_id uuid, _role app_role)
RETURNS boolean
SECURITY DEFINER
```

**log_security_event():** Log security events
```sql
CREATE FUNCTION log_security_event(
  p_event_type text,
  p_severity text,
  p_user_id uuid,
  ...
) RETURNS uuid
SECURITY DEFINER
```

**check_suspicious_activity():** Detect suspicious patterns
```sql
CREATE FUNCTION check_suspicious_activity(
  p_ip_address text,
  p_email text
) RETURNS jsonb
SECURITY DEFINER
```

### Input Validation

- **Wallet addresses:** Validated using ethers.js with EIP-55 checksum
- **Amounts:** Min/max limits, decimal precision checks
- **Cycle types:** Enum validation (1, 2, 3, 4)

### Brute-Force Protection

- **OTP verification:** 5 attempts, 15-minute lockout
- **Rate limiting:** 15 requests/minute per IP
- **Failed attempt tracking:** Logged in security_events

---

## Business Logic

### AI Trade Cycle System

**Cycle Progression:**
```
Cycle 1 (25 days) → Cycle 2 (18 days) → Cycle 3 (14 days) → Special (14 days, repeatable)
```

**Profit Calculation:**
- Normal mode: Investment × 2 (100% profit)
- Penalty mode: Investment × (1 + 2% × days)

**Early Withdrawal:**
- Cycles 1-3: 18% tax, enters penalty mode
- Special cycle: 0% tax, no penalty

### Two-Chance System

Each user gets 2 chances to complete the full cycle progression:

1. **Chance 1:** Default, starts available
2. **Chance 2:** Unlocks after Chance 1 completes OR fails 50% balance check

**Chance Status Values:**
- `available` - Can start cycles
- `active` - Currently in use
- `completed` - Successfully finished all cycles
- `disabled` - Lost due to early withdrawal or balance check

### 50% Balance Rule

During Special cycle, if user's balance drops below 50%:
- Current chance is deactivated
- Next chance is unlocked (if available)
- Active cycle is marked as "broken"

### Referral Commission System

**5-Level Structure:**
| Level | Commission Rate |
|-------|-----------------|
| 1 | 10% |
| 2 | 5% |
| 3 | 3% |
| 4 | 2% |
| 5 | 1% |

**Triggers:**
- On deposit approval: Commission on deposit amount
- On cycle completion: Commission on profit (capped at $50)

**Payout:**
- Commissions go to `referral_balance` (not `wallet_balance`)
- Can only be withdrawn, not invested

---

## External Integrations

### Telegram Bot

| Setting | Value |
|---------|-------|
| Bot Username | @HyperliquidWhale_BOT |
| Bot Token | Stored as secret `TELEGRAM_BOT_TOKEN` |
| WebApp URL | Lovable Cloud preview URL |

**Usage:**
- Authentication via Mini App
- Referral link format: `https://t.me/HyperliquidWhale_BOT?start={referralCode}`

### Resend (Legacy - Disabled)

| Setting | Value |
|---------|-------|
| API Key | Stored as secret `RESEND_API_KEY` |
| Purpose | Email OTP delivery (no longer used) |

### Planned: MyPayVerse

- USDT payment gateway integration (pending)
- Will handle automatic deposit verification
- Will replace manual admin approval

---

## Environment Configuration

### Frontend Environment Variables

```env
VITE_SUPABASE_PROJECT_ID=lqfbpdbcmhaovcuufwxp
VITE_SUPABASE_URL=https://lqfbpdbcmhaovcuufwxp.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

### Edge Function Secrets

| Secret | Purpose |
|--------|---------|
| TELEGRAM_BOT_TOKEN | Telegram authentication validation |
| CRON_SECRET | Cron job authentication |
| RESEND_API_KEY | Email sending (legacy) |

### System Configuration (Database)

Stored in `system_config` table, modifiable by admins:

| Key | Default | Description |
|-----|---------|-------------|
| cycle_time_unit | 'days' | 'days' or 'seconds' for testing |
| profit_multiplier | 2 | Cycle profit multiplier |
| early_withdrawal_tax | 18 | Tax percentage |
| penalty_daily_return | 2 | Penalty mode daily % |

---

## Deployment

### Current Hosting

| Component | Platform |
|-----------|----------|
| Frontend | Lovable Cloud |
| Backend | Lovable Cloud (Supabase) |
| Edge Functions | Deno Deploy (via Supabase) |
| Database | PostgreSQL (Supabase) |
| CDN | Global (automatic) |

### Cron Jobs

| Job | Schedule | Function |
|-----|----------|----------|
| Complete matured cycles | Every hour | complete-trade-cycles |
| Complete legacy investments | Every hour | complete-investments |

### Deployment Process

1. Code changes made in Lovable editor
2. Frontend automatically rebuilds on save
3. Edge functions automatically deploy on save
4. Database migrations require manual approval

### External Deployment (Optional)

Frontend can be deployed to:
- Vercel
- Netlify
- Cloudflare Pages

Required environment variables:
```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
```

---

## Appendix

### Database Enums

```sql
CREATE TYPE app_role AS ENUM ('admin', 'user');
CREATE TYPE deposit_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE withdrawal_status AS ENUM ('pending', 'approved', 'rejected', 'paid');
```

### Key Database Functions

| Function | Purpose |
|----------|---------|
| generate_referral_code() | Creates unique WHALE**** codes |
| handle_new_user() | Trigger: creates profile on signup |
| create_referral_chain() | Creates 5-level referral relationships |
| start_trade_cycle() | Starts new trading cycle |
| withdraw_early_from_cycle() | Handles early withdrawal |
| complete_trade_cycles() | Batch completes matured cycles |
| complete_current_chance() | Manually completes a chance |
| deactivate_chance() | Deactivates a chance |
| has_role() | Checks user role |
| log_admin_action() | Logs admin actions |
| distribute_referral_commissions_on_deposit() | Trigger: deposit commissions |
| distribute_referral_commissions_on_profit() | Trigger: profit commissions |
| check_wallet_balance_after_withdrawal() | Trigger: 50% balance check |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Dec 2024 | Initial documentation |

---

*Generated for HyperliquidWhale Platform*
