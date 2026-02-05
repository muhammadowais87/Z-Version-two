-- Update complete_matured_investments to transfer both investment amount and profit to wallet
CREATE OR REPLACE FUNCTION public.complete_matured_investments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Update investments that have matured and transfer amount + profit to wallet
  UPDATE public.profiles p
  SET 
    wallet_balance = wallet_balance + COALESCE((
      SELECT SUM(amount + profit) 
      FROM public.investments 
      WHERE user_id = p.id 
        AND status = 'active' 
        AND matures_at <= now()
    ), 0),
    total_profit = total_profit + COALESCE((
      SELECT SUM(profit) 
      FROM public.investments 
      WHERE user_id = p.id 
        AND status = 'active' 
        AND matures_at <= now()
    ), 0),
    updated_at = now()
  WHERE id IN (
    SELECT DISTINCT user_id 
    FROM public.investments 
    WHERE status = 'active' AND matures_at <= now()
  );
  
  -- Mark investments as completed
  UPDATE public.investments
  SET 
    status = 'completed',
    updated_at = now()
  WHERE status = 'active' 
    AND matures_at <= now();
END;
$function$;