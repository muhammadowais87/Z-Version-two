-- Update approve_deposit to only add balance without creating investments
CREATE OR REPLACE FUNCTION public.approve_deposit(deposit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_amount numeric;
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

  -- Update deposit status
  UPDATE public.deposits
  SET status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_at = now()
  WHERE id = deposit_id;

  -- Only update wallet balance and total deposits
  UPDATE public.profiles
  SET wallet_balance = wallet_balance + v_amount,
      total_deposits = total_deposits + v_amount,
      updated_at = now()
  WHERE id = v_user_id;

  -- Log the admin action
  PERFORM log_admin_action(
    'APPROVE_DEPOSIT',
    'deposit',
    deposit_id,
    jsonb_build_object(
      'user_id', v_user_id,
      'amount', v_amount
    )
  );
END;
$function$;

-- Update add_manual_deposit to only add balance without creating investments
CREATE OR REPLACE FUNCTION public.add_manual_deposit(target_user_id uuid, deposit_amount numeric, admin_notes text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Only update wallet balance and total deposits
  UPDATE public.profiles
  SET wallet_balance = wallet_balance + deposit_amount,
      total_deposits = total_deposits + deposit_amount,
      updated_at = now()
  WHERE id = target_user_id;

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
$function$;