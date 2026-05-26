CREATE OR REPLACE FUNCTION public.tg_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_email TEXT;
  v_new JSONB := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END;
  v_old JSONB := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
  v_record_id TEXT;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = v_user;

  v_record_id := COALESCE(
    v_new->>'id',
    v_old->>'id',
    NULLIF(concat_ws(':', v_new->>'user_id', v_new->>'magasin_id'), ':'),
    NULLIF(concat_ws(':', v_old->>'user_id', v_old->>'magasin_id'), ':')
  );

  INSERT INTO public.audit_log (user_id, user_email, action, table_name, record_id, before_data, after_data)
  VALUES (v_user, v_email, TG_OP, TG_TABLE_NAME, v_record_id, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END;
$function$;