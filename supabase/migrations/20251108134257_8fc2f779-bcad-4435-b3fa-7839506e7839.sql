-- Update approve_deposit to also update total_investment when creating investment
CREATE OR REPLACE FUNCTION public.approve_deposit(deposit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_amount numeric;
  v_referral_code text;
  v_referrer_id uuid;
  v_level integer;
  v_commission numeric;
  referral_percentages numeric[] := ARRAY[0.10, 0.05, 0.03, 0.02, 0.01];
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve deposits';
  END IF;

  SELECT user_id, amount INTO v_user_id, v_amount
  FROM public.deposits
  WHERE id = deposit_id AND status = 'pending';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Deposit not found or already processed';
  END IF;

  UPDATE public.deposits
  SET status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_at = now()
  WHERE id = deposit_id;

  UPDATE public.profiles
  SET wallet_balance = wallet_balance + v_amount,
      total_deposits = total_deposits + v_amount,
      total_investment = total_investment + v_amount,
      updated_at = now()
  WHERE id = v_user_id;

  INSERT INTO public.investments (user_id, amount, status, invested_at, matures_at, profit)
  VALUES (
    v_user_id,
    v_amount,
    'active',
    now(),
    now() + interval '120 hours',
    v_amount
  );

  FOR v_level, v_referrer_id IN
    SELECT r.level, r.referrer_id
    FROM public.referrals r
    WHERE r.referred_id = v_user_id
    ORDER BY r.level
  LOOP
    IF v_level <= 5 THEN
      v_commission := v_amount * referral_percentages[v_level];
      
      UPDATE public.profiles
      SET wallet_balance = wallet_balance + v_commission,
          total_referral_earnings = total_referral_earnings + v_commission,
          updated_at = now()
      WHERE id = v_referrer_id;
    END IF;
  END LOOP;
END;
$function$;

-- Update add_manual_deposit to also update total_investment when creating investment
CREATE OR REPLACE FUNCTION public.add_manual_deposit(target_user_id uuid, deposit_amount numeric, admin_notes text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_referral_code text;
  v_referrer_id uuid;
  v_level integer;
  v_commission numeric;
  referral_percentages numeric[] := ARRAY[0.10, 0.05, 0.03, 0.02, 0.01];
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can add manual deposits';
  END IF;

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

  UPDATE public.profiles
  SET wallet_balance = wallet_balance + deposit_amount,
      total_deposits = total_deposits + deposit_amount,
      total_investment = total_investment + deposit_amount,
      updated_at = now()
  WHERE id = target_user_id;

  INSERT INTO public.investments (user_id, amount, status, invested_at, matures_at, profit)
  VALUES (
    target_user_id,
    deposit_amount,
    'active',
    now(),
    now() + interval '120 hours',
    deposit_amount
  );

  FOR v_level, v_referrer_id IN
    SELECT r.level, r.referrer_id
    FROM public.referrals r
    WHERE r.referred_id = target_user_id
    ORDER BY r.level
  LOOP
    IF v_level <= 5 THEN
      v_commission := deposit_amount * referral_percentages[v_level];
      
      UPDATE public.profiles
      SET wallet_balance = wallet_balance + v_commission,
          total_referral_earnings = total_referral_earnings + v_commission,
          updated_at = now()
      WHERE id = v_referrer_id;
    END IF;
  END LOOP;
END;
$function$;