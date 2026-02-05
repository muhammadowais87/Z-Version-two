-- Add minimum amount check constraints to deposits and withdrawals tables
-- This enforces the $10 minimum server-side to prevent API bypass

-- Add check constraint for deposits minimum amount
ALTER TABLE public.deposits 
ADD CONSTRAINT deposits_minimum_amount CHECK (amount >= 10);

-- Add check constraint for withdrawals minimum amount  
ALTER TABLE public.withdrawals 
ADD CONSTRAINT withdrawals_minimum_amount CHECK (amount >= 10);