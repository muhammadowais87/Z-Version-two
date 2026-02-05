
-- Drop and recreate the trigger function without the 50% wallet maintenance rule
CREATE OR REPLACE FUNCTION public.check_wallet_balance_after_withdrawal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only check when withdrawal is being approved
  IF NEW.status != 'approved' OR OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;
  
  -- 50% wallet maintenance rule has been removed
  -- Withdrawals no longer affect chance status or cycle progression
  
  RETURN NEW;
END;
$function$;
