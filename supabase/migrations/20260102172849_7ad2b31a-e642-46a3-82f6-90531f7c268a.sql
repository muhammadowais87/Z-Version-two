-- Drop the old policy that checks balance
DROP POLICY IF EXISTS "Users can create own withdrawals" ON public.withdrawals;

-- Create new policy that only checks user ownership (balance validated in code)
CREATE POLICY "Users can create own withdrawals" 
ON public.withdrawals 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);