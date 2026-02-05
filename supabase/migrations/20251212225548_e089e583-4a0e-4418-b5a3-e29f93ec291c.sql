
-- Create a callable function to distribute referral commissions on any deposit amount
CREATE OR REPLACE FUNCTION public.distribute_deposit_commissions(p_user_id UUID, p_amount NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referral RECORD;
  v_commission_percent NUMERIC;
  v_commission_amount NUMERIC;
  v_referrer_direct_depositors INTEGER;
BEGIN
  FOR v_referral IN 
    SELECT r.referrer_id, r.level
    FROM referrals r
    WHERE r.referred_id = p_user_id
    ORDER BY r.level ASC
  LOOP
    -- Check if this referrer has unlocked this level
    v_referrer_direct_depositors := get_direct_depositors_count(v_referral.referrer_id);
    
    -- Level X requires X direct depositors to unlock
    IF v_referrer_direct_depositors < v_referral.level THEN
      CONTINUE; -- Skip this level, not unlocked
    END IF;
    
    CASE v_referral.level
      WHEN 1 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_1_percent'), 10) INTO v_commission_percent;
      WHEN 2 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_2_percent'), 4) INTO v_commission_percent;
      WHEN 3 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_3_percent'), 2) INTO v_commission_percent;
      WHEN 4 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_4_percent'), 1) INTO v_commission_percent;
      WHEN 5 THEN 
        SELECT COALESCE((SELECT value::numeric FROM system_config WHERE key = 'referral_level_5_percent'), 1) INTO v_commission_percent;
      ELSE
        v_commission_percent := 0;
    END CASE;
    
    v_commission_amount := p_amount * (v_commission_percent / 100);
    
    IF v_commission_amount > 0 THEN
      UPDATE profiles
      SET referral_balance = COALESCE(referral_balance, 0) + v_commission_amount,
          total_referral_earnings = COALESCE(total_referral_earnings, 0) + v_commission_amount,
          updated_at = now()
      WHERE id = v_referral.referrer_id;
    END IF;
  END LOOP;
END;
$$;

-- Update add_manual_deposit to call the commission distribution function
CREATE OR REPLACE FUNCTION public.add_manual_deposit(target_user_id uuid, deposit_amount numeric, admin_notes text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can add manual deposits';
  END IF;

  -- Create approved deposit record
  INSERT INTO public.deposits (
    user_id, 
    amount, 
    status, 
    approved_at, 
    approved_by,
    admin_wallet_address,
    transaction_hash
  )
  VALUES (
    target_user_id,
    deposit_amount,
    'approved',
    now(),
    auth.uid(),
    'MANUAL_ADMIN_DEPOSIT',
    COALESCE(admin_notes, 'Manual deposit by admin')
  );

  -- Update wallet balance and total deposits
  UPDATE public.profiles
  SET wallet_balance = wallet_balance + deposit_amount,
      total_deposits = total_deposits + deposit_amount,
      updated_at = now()
  WHERE id = target_user_id;

  -- Distribute referral commissions for this deposit
  PERFORM distribute_deposit_commissions(target_user_id, deposit_amount);

  -- Log the admin action
  PERFORM log_admin_action(
    'ADD_MANUAL_DEPOSIT',
    'deposit',
    NULL,
    jsonb_build_object(
      'user_id', target_user_id,
      'amount', deposit_amount,
      'notes', admin_notes
    )
  );
END;
$$;
