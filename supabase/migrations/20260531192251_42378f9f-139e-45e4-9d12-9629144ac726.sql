-- Custom audit log RPC for events that don't come from table mutations
-- (PDF exports, restocks tracked explicitly, etc.)
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action text,
  p_table_name text,
  p_record_id text DEFAULT NULL,
  p_details text DEFAULT NULL,
  p_magasin_id uuid DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_action IS NULL OR length(trim(p_action)) = 0 THEN
    RAISE EXCEPTION 'Action requise';
  END IF;
  IF p_table_name IS NULL OR length(trim(p_table_name)) = 0 THEN
    RAISE EXCEPTION 'Table requise';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO public.audit_log
    (user_id, user_email, action, table_name, record_id, after_data, magasin_id, details)
  VALUES
    (v_uid, v_email, p_action, p_table_name, p_record_id, p_after_data, p_magasin_id, p_details)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(text, text, text, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, text, text, uuid, jsonb) TO authenticated;