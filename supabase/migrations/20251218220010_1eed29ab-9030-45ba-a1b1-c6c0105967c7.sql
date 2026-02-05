-- Fix: use single-quoted dynamic SQL inside DO block (avoid $$ nesting issues)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='deny_anon_select_profiles'
  ) THEN
    EXECUTE 'CREATE POLICY deny_anon_select_profiles ON public.profiles FOR SELECT TO anon USING (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='deposits' AND policyname='deny_anon_select_deposits'
  ) THEN
    EXECUTE 'CREATE POLICY deny_anon_select_deposits ON public.deposits FOR SELECT TO anon USING (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='withdrawals' AND policyname='deny_anon_select_withdrawals'
  ) THEN
    EXECUTE 'CREATE POLICY deny_anon_select_withdrawals ON public.withdrawals FOR SELECT TO anon USING (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='investments' AND policyname='deny_anon_select_investments'
  ) THEN
    EXECUTE 'CREATE POLICY deny_anon_select_investments ON public.investments FOR SELECT TO anon USING (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_trade_cycles' AND policyname='deny_anon_select_ai_trade_cycles'
  ) THEN
    EXECUTE 'CREATE POLICY deny_anon_select_ai_trade_cycles ON public.ai_trade_cycles FOR SELECT TO anon USING (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='security_events' AND policyname='deny_anon_select_security_events'
  ) THEN
    EXECUTE 'CREATE POLICY deny_anon_select_security_events ON public.security_events FOR SELECT TO anon USING (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='referral_earnings_history' AND policyname='deny_anon_select_referral_earnings_history'
  ) THEN
    EXECUTE 'CREATE POLICY deny_anon_select_referral_earnings_history ON public.referral_earnings_history FOR SELECT TO anon USING (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='deny_anon_select_audit_logs'
  ) THEN
    EXECUTE 'CREATE POLICY deny_anon_select_audit_logs ON public.audit_logs FOR SELECT TO anon USING (false)';
  END IF;
END $$;
