
CREATE OR REPLACE FUNCTION public.notify_events() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb := to_jsonb(NEW); o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
BEGIN
  IF TG_TABLE_NAME = 'replies' THEN
    IF (r->>'is_sql')::boolean THEN
      PERFORM public.notify_ws((r->>'workspace_id')::uuid, 'sql_found', 'New SQL: ' || coalesce(r->>'summary', 'a lead is interested'), '/inbox');
    END IF;
  ELSIF TG_TABLE_NAME = 'campaigns' THEN
    IF r->>'status' = 'completed' AND o->>'status' IS DISTINCT FROM 'completed' THEN
      PERFORM public.notify_ws((r->>'workspace_id')::uuid, 'campaign_finished', 'Campaign finished: ' || (r->>'name'), '/campaigns/' || (r->>'id'));
    END IF;
  ELSIF TG_TABLE_NAME = 'agents' THEN
    IF r->>'mailbox_status' = 'error' AND o->>'mailbox_status' IS DISTINCT FROM 'error' THEN
      PERFORM public.notify_ws((r->>'workspace_id')::uuid, 'mailbox_error', 'Mailbox problem on agent ' || (r->>'name'), '/agents/' || (r->>'id'));
    END IF;
  END IF;
  RETURN NULL;
END $$;
