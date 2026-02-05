# AI Trade System - Backend Documentation

## Overview
The AI Trade system uses Supabase backend (Lovable Cloud) with database functions and edge functions to handle all business logic securely on the server side.

## Database Structure

### Tables

#### `ai_trade_cycles`
Stores all trade cycle records (active, completed, and broken).

**Columns:**
- `id` (UUID): Primary key
- `user_id` (UUID): User who created the cycle
- `cycle_type` (INTEGER): 1, 2, 3, or 4 (special)
- `investment_amount` (NUMERIC): Initial investment
- `start_date` (TIMESTAMP): When cycle started
- `end_date` (TIMESTAMP): When cycle should complete
- `status` (TEXT): 'active', 'completed', or 'broken'
- `current_profit` (NUMERIC): Profit earned
- `created_at` (TIMESTAMP): Record creation time
- `updated_at` (TIMESTAMP): Last update time

**RLS Policies:**
- Users can view, insert, and update their own cycles
- Admins can view all cycles

#### `user_trade_progress`
Tracks user's completed cycles and penalty status.

**Columns:**
- `id` (UUID): Primary key
- `user_id` (UUID): User ID (unique)
- `completed_cycles` (INTEGER[]): Array of completed cycle types [1, 2, 3, 4]
- `is_penalty_mode` (BOOLEAN): True if user broke a cycle and is in 2% mode
- `last_50_percent_check` (TIMESTAMP): Last time 50% rule was checked
- `created_at` (TIMESTAMP): Record creation time
- `updated_at` (TIMESTAMP): Last update time

**RLS Policies:**
- Users can view, insert, and update their own progress
- Admins can view all progress

## Database Functions (RPC)

### `get_cycle_duration(cycle_type INTEGER)`
Returns the duration in days for a given cycle type.
- Cycle 1: 25 days
- Cycle 2: 18 days
- Cycle 3: 14 days
- Cycle 4 (Special): 14 days

### `can_start_cycle(p_user_id UUID, p_cycle_type INTEGER)`
Checks if a user can start a specific cycle.

**Business Rules:**
- Only one active cycle at a time
- Cycle 1 is always available
- Cycle 2 requires completing Cycle 1
- Cycle 3 requires completing Cycles 1 and 2
- Cycle 4 (Special) requires completing all 3 main cycles

**Returns:** BOOLEAN

### `start_trade_cycle(p_cycle_type INTEGER, p_amount NUMERIC)`
Starts a new trade cycle for the authenticated user.

**Process:**
1. Validates user can start the cycle
2. Checks wallet balance is sufficient
3. Deducts investment from wallet
4. Creates new cycle record
5. Initializes user progress if needed

**Returns:** UUID (cycle_id)

**Exceptions:**
- "Cannot start this cycle..." if conditions not met
- "Insufficient wallet balance" if not enough funds

### `complete_trade_cycles()`
Completes all matured cycles (called by cron job every hour).

**Process for each matured cycle:**
1. Checks if user is in penalty mode
2. If penalty mode: calculates 2% daily return
3. If normal mode: doubles the investment (100% profit)
4. Updates cycle status to 'completed'
5. Adds final amount to user's wallet
6. Updates user progress (adds cycle to completed_cycles)
7. Resets penalty mode if was active

### `withdraw_early_from_cycle(p_cycle_id UUID)`
Processes early withdrawal from an active cycle.

**Process:**
1. Validates cycle exists and belongs to user
2. Calculates current value based on days passed
3. For Cycles 1-3: applies 18% tax and activates penalty mode
4. For Cycle 4 (Special): no tax, just withdrawal
5. Updates cycle status to 'broken'
6. Adds net amount to user's wallet

**Returns:** JSONB
```json
{
  "withdrawn_amount": 131.20,
  "tax_applied": 28.80,
  "penalty_mode_activated": true
}
```

## Edge Functions (API Endpoints)

All edge functions are located in `supabase/functions/` directory.

### `start-cycle`
**Path:** `/functions/v1/start-cycle`  
**Method:** POST  
**Auth:** Required (JWT token in Authorization header)

**Request Body:**
```json
{
  "cycle_type": 1,
  "amount": 100
}
```

**Response (Success):**
```json
{
  "success": true,
  "cycle_id": "uuid-here",
  "message": "Cycle started successfully"
}
```

**Response (Error):**
```json
{
  "error": "Insufficient wallet balance"
}
```

**Status Codes:**
- 200: Success
- 400: Validation error or business rule violation
- 401: Unauthorized
- 500: Server error

### `withdraw-cycle`
**Path:** `/functions/v1/withdraw-cycle`  
**Method:** POST  
**Auth:** Required

**Request Body:**
```json
{
  "cycle_id": "uuid-here"
}
```

**Response (Success):**
```json
{
  "success": true,
  "withdrawn_amount": 131.20,
  "tax_applied": 28.80,
  "penalty_mode_activated": true,
  "message": "Withdrawal completed successfully"
}
```

### `get-cycle-info`
**Path:** `/functions/v1/get-cycle-info`  
**Method:** GET/POST  
**Auth:** Required

**Response:**
```json
{
  "success": true,
  "active_cycle": {
    "id": "uuid",
    "cycle_type": 1,
    "investment_amount": 100,
    "start_date": "2025-01-01T00:00:00Z",
    "end_date": "2025-01-26T00:00:00Z",
    "status": "active",
    "current_profit": 0
  },
  "progress": {
    "completed_cycles": [1, 2],
    "is_penalty_mode": false,
    "last_50_percent_check": null
  },
  "wallet_balance": 500,
  "unlocked_cycles": {
    "1": true,
    "2": true,
    "3": true,
    "4": false
  }
}
```

### `get-cycle-history`
**Path:** `/functions/v1/get-cycle-history`  
**Method:** GET/POST  
**Auth:** Required

**Response:**
```json
{
  "success": true,
  "cycles": [
    {
      "id": "uuid",
      "cycle_type": 1,
      "investment_amount": 100,
      "status": "completed",
      "current_profit": 100,
      "start_date": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-26T00:00:00Z"
    }
  ],
  "progress": {
    "completed_cycles": [1],
    "is_penalty_mode": false
  },
  "stats": {
    "total_profit": 100,
    "total_tax": 0,
    "completed_count": 1,
    "broken_count": 0
  }
}
```

### `complete-trade-cycles`
**Path:** `/functions/v1/complete-trade-cycles`  
**Method:** POST  
**Auth:** Required (CRON_SECRET in Authorization header)

This is called automatically by a cron job every hour.

**Process:**
1. Verifies request is from cron (using CRON_SECRET)
2. Calls `complete_trade_cycles()` database function
3. Returns success/error status

## Business Logic Summary

### Cycle Rules
1. **Only one active cycle at a time** - Users must complete or break current cycle before starting next
2. **Sequential unlocking** - Cycles unlock in order: 1 → 2 → 3 → Special
3. **Duration & Returns:**
   - Cycle 1: 25 days, 100% profit (2×)
   - Cycle 2: 18 days, 100% profit (2×)
   - Cycle 3: 14 days, 100% profit (2×)
   - Special Cycle: 14 days, 100% profit (2×)

### Penalty System
**Early Withdrawal from Cycles 1-3:**
- 18% tax on withdrawn amount
- User enters "Penalty Mode"
- In Penalty Mode: earns only 2% daily (instead of doubling)
- Remains in Penalty Mode until completing a full cycle

**Early Withdrawal from Special Cycle:**
- 0% tax (no penalty)
- Cycle restarts from Day 1 with remaining amount
- No Penalty Mode activation

### Profit Calculation
**Normal Mode:**
- Linear growth to 2× over cycle duration
- Example: $100 investment, 25-day cycle
  - Day 0: $100
  - Day 12.5: $150
  - Day 25: $200

**Penalty Mode:**
- 2% daily simple interest
- Example: $100 investment, 25-day cycle
  - Day 0: $100
  - Day 12.5: $125
  - Day 25: $150

### Automatic Completion
A cron job runs every hour to:
1. Find all cycles where `end_date <= now()`
2. Calculate final amount (penalty mode vs normal)
3. Transfer funds to user wallet
4. Mark cycle as completed
5. Update user progress
6. Reset penalty mode

## Security Features

### Row Level Security (RLS)
All tables have RLS enabled with policies ensuring:
- Users can only access their own data
- Admins can view all data
- No direct deletion from client

### Server-Side Logic
All business logic runs on the backend:
- Validation in database functions
- Authorization in edge functions
- No client-side calculations affect money

### Authentication
- JWT tokens required for all endpoints
- Supabase Auth handles user sessions
- Service role key used only in cron functions

## Frontend Integration

The frontend calls edge functions using Supabase client:

```typescript
// Start a cycle
const { data, error } = await supabase.functions.invoke('start-cycle', {
  body: { cycle_type: 1, amount: 100 }
});

// Withdraw early
const { data, error } = await supabase.functions.invoke('withdraw-cycle', {
  body: { cycle_id: 'uuid-here' }
});

// Get cycle info
const { data, error } = await supabase.functions.invoke('get-cycle-info');

// Get history
const { data, error } = await supabase.functions.invoke('get-cycle-history');
```

## Monitoring & Debugging

### Edge Function Logs
View logs in Lovable Cloud backend:
- Click "View Backend" in Lovable
- Navigate to Edge Functions section
- Select function and view logs

### Database Logs
Check database operations:
- Use `supabase--analytics-query` tool
- Query postgres_logs table for errors

### Common Issues

**"Cannot start this cycle"**
- Check if user has active cycle
- Verify previous cycles are completed
- Confirm wallet has sufficient balance

**"Withdrawal failed"**
- Ensure cycle exists and is active
- Verify cycle belongs to requesting user

**Cycles not completing**
- Check cron job is running
- Verify edge function deployment
- Review complete-trade-cycles logs

## Testing

### Manual Testing Steps

1. **Test Cycle Start:**
   ```bash
   curl -X POST https://your-project.supabase.co/functions/v1/start-cycle \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"cycle_type": 1, "amount": 100}'
   ```

2. **Test Withdrawal:**
   ```bash
   curl -X POST https://your-project.supabase.co/functions/v1/withdraw-cycle \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"cycle_id": "your-cycle-id"}'
   ```

3. **Test Completion:**
   - Manually update a cycle's `end_date` to past
   - Trigger cron function
   - Verify cycle marked completed and funds transferred

## Future Enhancements

### 50% Wallet Maintenance Rule
- Add check after cycle completion
- If user withdraws > 50% of profit: reset progress to Cycle 1
- Implementation: add trigger or function to check on withdrawal

### Reinvestment Check for Special Cycle
- Require 50% of last profit for next special cycle
- Track last special cycle profit
- Validate minimum investment amount

### Admin Controls
- View all active cycles
- Manually complete/cancel cycles
- Adjust user penalties
- Override business rules

### Notifications
- Email when cycle completes
- Push notification 24h before completion
- Alert on penalty mode activation

## Technical Stack

- **Database:** PostgreSQL (Supabase)
- **Functions:** Deno (Supabase Edge Functions)
- **Authentication:** Supabase Auth
- **Cron:** Supabase pg_cron extension
- **Language:** TypeScript/JavaScript

## Version History

- **v1.0** (2025-11-30): Initial implementation with all 4 cycles, penalty system, and automatic completion
