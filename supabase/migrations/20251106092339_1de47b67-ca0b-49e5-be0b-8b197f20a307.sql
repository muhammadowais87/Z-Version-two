-- Create investments table to track user investments
CREATE TABLE public.investments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  invested_at timestamp with time zone NOT NULL DEFAULT now(),
  matures_at timestamp with time zone NOT NULL DEFAULT (now() + interval '120 hours'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  profit numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;

-- Users can view their own investments
CREATE POLICY "Users can view own investments"
ON public.investments
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own investments
CREATE POLICY "Users can create own investments"
ON public.investments
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own investments
CREATE POLICY "Users can update own investments"
ON public.investments
FOR UPDATE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_investments_updated_at
BEFORE UPDATE ON public.investments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to check and complete matured investments
CREATE OR REPLACE FUNCTION public.complete_matured_investments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Update investments that have matured
  UPDATE public.investments
  SET 
    status = 'completed',
    profit = amount,
    updated_at = now()
  WHERE status = 'active' 
    AND matures_at <= now();
    
  -- Update user profiles with totals
  UPDATE public.profiles p
  SET 
    total_investment = COALESCE((
      SELECT SUM(amount) 
      FROM public.investments 
      WHERE user_id = p.id
    ), 0),
    total_profit = COALESCE((
      SELECT SUM(profit) 
      FROM public.investments 
      WHERE user_id = p.id AND status = 'completed'
    ), 0),
    updated_at = now()
  WHERE id IN (
    SELECT DISTINCT user_id 
    FROM public.investments 
    WHERE status = 'completed' AND updated_at >= now() - interval '1 minute'
  );
END;
$$;