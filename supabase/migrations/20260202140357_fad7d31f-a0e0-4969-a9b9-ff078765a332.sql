-- Update reject_withdrawal function to credit amount back to user's wallet
CREATE OR REPLACE FUNCTION public.reject_withdrawal(withdrawal_id uuid, reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id UUID;
  v_withdrawal RECORD;
  v_net_amount NUMERIC;
  v_original_amount NUMERIC;
  v_tax_rate NUMERIC := 0.15;
BEGIN
  v_admin_id := auth.uid();
  
  -- Verify admin role
  IF NOT has_role(v_admin_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Admin role required';
  END IF;
  
  -- Get withdrawal details
  SELECT * INTO v_withdrawal
  FROM withdrawals w
  WHERE w.id = withdrawal_id AND w.status = 'pending';
  
  IF v_withdrawal IS NULL THEN
    RAISE EXCEPTION 'Withdrawal not found or already processed';
  END IF;
  
  -- The amount stored in DB is the NET amount (after 15% tax was applied on frontend)
  -- Calculate original amount that was deducted: netAmount = originalAmount * 0.85
  v_net_amount := v_withdrawal.amount;
  v_original_amount := v_net_amount / (1 - v_tax_rate);
  
  -- Update withdrawal status to rejected
  UPDATE withdrawals
  SET status = 'rejected',
      rejection_reason = reason,
      processed_at = now(),
      processed_by = v_admin_id,
      updated_at = now()
  WHERE id = withdrawal_id;
  
  -- Credit the ORIGINAL amount back to user's main wallet
  UPDATE profiles
  SET wallet_balance = wallet_balance + v_original_amount,
      total_withdrawals = total_withdrawals - v_original_amount,
      updated_at = now()
  WHERE id = v_withdrawal.user_id;
  
  -- Log admin action
  PERFORM log_admin_action(
    'reject_withdrawal',
    'withdrawal',
    withdrawal_id,
    jsonb_build_object(
      'user_id', v_withdrawal.user_id,
      'net_amount', v_net_amount,
      'original_amount_credited', v_original_amount,
      'tax_rate', '15%',
      'reason', reason
    )
  );
END;
$function$;